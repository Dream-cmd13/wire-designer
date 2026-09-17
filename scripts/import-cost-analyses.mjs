import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import XLSX from 'xlsx';

const require = createRequire(import.meta.url);

function loadEnv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function cleanNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}

function getCellVal(ws, addr) {
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

function getCellFormula(ws, addr) {
  const cell = ws[addr];
  return cell ? cell.f : undefined;
}

function formatFormulaExpression(formula, ws) {
  const cellReferencePattern = /\$?([A-Z]{1,3})\$?(\d+)/g;
  const substituted = formula.replace(
    cellReferencePattern,
    (reference, column, row, offset, source) => {
      // 跳过区间（SUM(I5:I16)）与函数名（LOG10( 等）中的引用，避免把区间端点替换成数值
      const before = source[offset - 1];
      const after = source[offset + reference.length];
      if (before === ':' || after === ':' || after === '(') return reference;
      const value = cleanNumber(getCellVal(ws, `${column}${row}`));
      return value == null ? reference : String(value);
    },
  );

  return substituted
    .replace(/\s*\/\s*/g, ' ÷ ')
    .replace(/\s*\*\s*/g, ' × ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
}

export function resolvePriceDerivation(formula, baseValue, targetValue, defaultLabel, ws) {
  if (formula) {
    if (ws) {
      const expression = formatFormulaExpression(formula, ws);
      const divMatch = formula.match(/\/\s*([0-9.]+)/);
      const multMatch = formula.match(/\*\s*([0-9.]+)/);

      if (divMatch) {
        const divisor = parseFloat(divMatch[1]);
        const marginPercent = Math.round((1 - divisor) * 100);
        return {
          formula: `公式: ${formula} (目标毛利率 ${marginPercent}%)`,
          expression,
        };
      }

      if (multMatch) {
        const mult = parseFloat(multMatch[1]);
        const markupPercent = Math.round((mult - 1) * 100);
        return {
          formula: `公式: ${formula} (成本加成 ${markupPercent}%)`,
          expression,
        };
      }

      return {
        formula: `公式: ${formula}`,
        expression,
      };
    }

    // 匹配除法，如 /0.8, /0.7, /0.85
    const divMatch = formula.match(/\/([0-9.]+)/);
    if (divMatch) {
      const divisor = parseFloat(divMatch[1]);
      const marginPercent = Math.round((1 - divisor) * 100);
      return {
        formula: `公式: ${formula} (目标毛利率 ${marginPercent}%)`,
        expression: `${baseValue} ÷ ${divisor}`,
      };
    }
    // 匹配乘法，如 *1.2, *1.03
    const multMatch = formula.match(/\*([0-9.]+)/);
    if (multMatch) {
      const mult = parseFloat(multMatch[1]);
      const markupPercent = Math.round((mult - 1) * 100);
      return {
        formula: `公式: ${formula} (成本加成 ${markupPercent}%)`,
        expression: `${baseValue} × ${mult}`,
      };
    }
    return {
      formula: `公式: ${formula}`,
      expression: `${baseValue} 依公式计算`,
    };
  }

  // 无源公式但有数值时，依据实际数值比推算代入轨迹，杜绝硬编码固定比例
  if (baseValue != null && targetValue != null && baseValue > 0 && targetValue > 0) {
    const ratio = Number((baseValue / targetValue).toFixed(4));
    const marginPercent = Math.round((1 - ratio) * 100);
    if (marginPercent > 0 && marginPercent < 90) {
      return {
        formula: `${defaultLabel} ÷ (1 - 目标毛利率 ${marginPercent}%)`,
        expression: `${baseValue} ÷ ${ratio}`,
      };
    }
    return {
      formula: `${defaultLabel} 核定折算`,
      expression: `${targetValue}`,
    };
  }

  return {
    formula: formula ? `公式: ${formula}` : '录入数值',
    expression: targetValue != null ? `${targetValue}` : '--',
  };
}

export function parseCostWorkbook(filePath) {
  const fileName = path.basename(filePath);
  const wb = XLSX.readFile(filePath, { cellFormula: true });
  const results = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;

    // 过滤掉非成本分析 sheet，例如“接线方式”或纯文本厂商报价清单
    if (sheetName.includes('接线') || sheetName.includes('厂商报价')) continue;

    // 检查是否有 BOM 分析表的标志
    let isCostAnalysisSheet = false;
    for (let r = 1; r <= 10; r++) {
      for (let c = 0; c <= 5; c++) {
        const addr = XLSX.utils.encode_col(c) + r;
        const val = String(getCellVal(ws, addr) || '');
        if (val.includes('BOM') || val.includes('物料清单') || val.includes('单价（元）')) {
          isCostAnalysisSheet = true;
          break;
        }
      }
      if (isCostAnalysisSheet) break;
    }
    if (!isCostAnalysisSheet) continue;

    // 1. 识别料号与基础元数据
    let platformNo = '';
    let customerPartNo = '';
    let customerName = '';
    let productName = '';

    // 尝试在第 2 行寻找
    for (let c = 0; c <= 25; c++) {
      const addr = XLSX.utils.encode_col(c) + '2';
      const val = String(getCellVal(ws, addr) || '').trim();
      if (val.includes('万连料号') || val.includes('料号/名称')) {
        // 看右侧邻近单元格
        for (let i = 1; i <= 6; i++) {
          const nextAddr = XLSX.utils.encode_col(c + i) + '2';
          const nextVal = String(getCellVal(ws, nextAddr) || '').trim();
          if (nextVal.length > 2) {
            platformNo = nextVal;
            break;
          }
        }
      }
      if (val.includes('客户：') || val.includes('客户:')) {
        for (let i = 1; i <= 3; i++) {
          const nextAddr = XLSX.utils.encode_col(c + i) + '2';
          const nextVal = String(getCellVal(ws, nextAddr) || '').trim();
          if (nextVal.length > 1) {
            customerName = nextVal;
            break;
          }
        }
      }
      if (val.includes('客户料号')) {
        for (let i = 1; i <= 3; i++) {
          const nextAddr = XLSX.utils.encode_col(c + i) + '2';
          const nextVal = String(getCellVal(ws, nextAddr) || '').trim();
          if (nextVal.length > 1) {
            customerPartNo = nextVal;
            break;
          }
        }
      }
    }

    // 从项目编号或第二行 B2 提取描述
    const b2Val = String(getCellVal(ws, 'B2') || '').trim();
    if (b2Val && b2Val.length > 3 && !b2Val.includes('料号')) {
      productName = b2Val;
    }

    // 若未从单元格找到 platformNo，使用 SheetName 或文件名提取
    if (!platformNo || platformNo.includes('料号') || platformNo.length < 3) {
      if (sheetName.startsWith('WL-')) {
        platformNo = sheetName.trim();
      } else {
        // 看文件名是否包含 WL-
        const fileMatch = fileName.match(/WL-B[0-9]{2}-[0-9A-Za-z_-]+/);
        if (fileMatch) {
          platformNo = `${fileMatch[0]}-${sheetName.trim().replace(/\s+/g, '')}`;
        } else {
          platformNo = sheetName.trim();
        }
      }
    }

    // 格式化清理 platformNo
    platformNo = platformNo.replace(/\s+/g, '').replace(/[\/\\:*?"<>|]/g, '-');

    // 2. 截取 BOM 明细
    let bomStartRow = -1;
    let bomEndRow = -1;
    for (let r = 1; r <= 15; r++) {
      const aVal = String(getCellVal(ws, 'A' + r) || '').trim();
      const bVal = String(getCellVal(ws, 'B' + r) || '').trim();
      if (aVal === '序号' && (bVal === '类型' || bVal.includes('类型'))) {
        bomStartRow = r + 1;
        break;
      }
    }

    const bomItems = [];
    if (bomStartRow > 0) {
      for (let r = bomStartRow; r <= 35; r++) {
        const aVal = String(getCellVal(ws, 'A' + r) || '').trim();
        const gVal = String(getCellVal(ws, 'G' + r) || '').trim();
        const hVal = String(getCellVal(ws, 'H' + r) || '').trim();
        if (hVal.includes('材料总价') || gVal.includes('材料总价') || hVal.includes('总成本') || aVal.includes('总成本')) {
          bomEndRow = r - 1;
          break;
        }

        const type = String(getCellVal(ws, 'B' + r) || '').trim();
        const spec = String(getCellVal(ws, 'D' + r) || '').trim();
        const brand = String(getCellVal(ws, 'C' + r) || '').trim();
        const qty = cleanNumber(getCellVal(ws, 'F' + r));
        const unit = String(getCellVal(ws, 'G' + r) || '').trim();
        const unitPrice = cleanNumber(getCellVal(ws, 'H' + r));
        const totalPrice = cleanNumber(getCellVal(ws, 'I' + r));

        if (type || spec || qty != null || unitPrice != null) {
          bomItems.push({
            index: bomItems.length + 1,
            type: type || '其他',
            spec: spec || '',
            brand: brand || '',
            qty: qty ?? 1,
            unit: unit || 'PCS',
            unitPrice: unitPrice ?? 0,
            totalPrice: totalPrice ?? ((qty ?? 1) * (unitPrice ?? 0)),
          });
        }
      }
    }

    // 3. 截取 工序工时明细
    let laborStartRow = -1;
    for (let r = (bomEndRow > 0 ? bomEndRow : 15); r <= 45; r++) {
      const aVal = String(getCellVal(ws, 'A' + r) || '').trim();
      const cVal = String(getCellVal(ws, 'C' + r) || '').trim();
      if (aVal === '序号' && (cVal === '工序名称' || cVal.includes('工序'))) {
        laborStartRow = r + 1;
        break;
      }
    }

    const laborItems = [];
    if (laborStartRow > 0) {
      for (let r = laborStartRow; r <= 65; r++) {
        const cVal = String(getCellVal(ws, 'C' + r) || '').trim();
        const hVal = String(getCellVal(ws, 'H' + r) || '').trim();
        if (cVal.includes('计划总工时') || hVal.includes('合计') || cVal.includes('核准') || cVal.includes('审核')) {
          break;
        }

        const name = cVal;
        const ratePerPoint = cleanNumber(getCellVal(ws, 'D' + r));
        const points = cleanNumber(getCellVal(ws, 'H' + r));
        const cost = cleanNumber(getCellVal(ws, 'I' + r));
        const note = String(getCellVal(ws, 'K' + r) || '').trim();

        if (name) {
          laborItems.push({
            index: laborItems.length + 1,
            name,
            ratePerPoint: ratePerPoint ?? 0,
            points: points ?? 0,
            cost: cost ?? ((points ?? 0) * (ratePerPoint ?? 0)),
            note: note || '',
          });
        }
      }
    }

    // 4. 扫描定位核心指标与公式
    let materialCost = 0;
    let materialCostFormula = '';
    let materialLoss = 0;
    let materialLossFormula = '';
    let laborCost = 0;
    let laborCostFormula = '';
    let laborLoss = 0;
    let laborLossFormula = '';
    let totalCost = 0;
    let totalCostFormula = '';
    let taxCost = 0;
    let taxCostFormula = '';
    let salesPrice = null;
    let salesPriceFormula = '';
    let samplePrice = null;
    let samplePriceFormula = '';
    let quotePrice = null;
    let quoteNote = '';

    // 扫描整表核心指标
    for (let r = 10; r <= 35; r++) {
      for (let c = 0; c <= 20; c++) {
        const addr = XLSX.utils.encode_col(c) + r;
        const val = String(getCellVal(ws, addr) || '').trim();
        if (!val) continue;

        // 排除长提示文字（如 P 列的“5.最低售价毛利是20%（包含管销成本），材料损耗3%，工时损耗5%”）
        const isPromptNote = val.length > 15 || val.includes('管销') || val.includes('请不要') || val.includes('插入行');
        if (isPromptNote) continue;

        if (val === '材料总价（元）：' || val === '材料总价' || val.includes('材料总价')) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            materialCost = foundVal;
            materialCostFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '材料损耗（元）：' || val === '材料损耗' || (val.includes('材料损耗') && val.length <= 10)) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            materialLoss = foundVal;
            materialLossFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '工时费用（元）：' || val === '工时费用' || (val.includes('工时费用') && val.length <= 10)) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            laborCost = foundVal;
            laborCostFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '工时损耗（元）：' || val === '工时损耗' || (val.includes('工时损耗') && val.length <= 10)) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            laborLoss = foundVal;
            laborLossFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '总成本（元）：' || val === '总成本:' || val === '总成本') {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            totalCost = foundVal;
            totalCostFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '成本含税' || val.includes('含税成本')) {
          // 可能在同一行或紧邻行 K 列 / M 列
          for (const cName of ['K', 'M', 'I']) {
            const check = cName + r;
            const nextCheck = cName + (r + 1);
            if (getCellVal(ws, check) != null && typeof getCellVal(ws, check) === 'number') {
              taxCost = cleanNumber(getCellVal(ws, check)) ?? 0;
              taxCostFormula = getCellFormula(ws, check) || '';
              break;
            } else if (getCellVal(ws, nextCheck) != null && typeof getCellVal(ws, nextCheck) === 'number') {
              taxCost = cleanNumber(getCellVal(ws, nextCheck)) ?? 0;
              taxCostFormula = getCellFormula(ws, nextCheck) || '';
              break;
            }
          }
        }

        if (val === '样品价') {
          // 检查下方单元格或右侧单元格
          const nextRowAddr = XLSX.utils.encode_col(c) + (r + 1);
          const rightAddr = XLSX.utils.encode_col(c + 1) + r;
          const found = cleanNumber(getCellVal(ws, nextRowAddr)) ?? cleanNumber(getCellVal(ws, rightAddr));
          if (found != null) {
            samplePrice = found;
            samplePriceFormula = getCellFormula(ws, nextRowAddr) || getCellFormula(ws, rightAddr) || '';
          }
        }

        if (val === '售价' || val === '最低售价') {
          // 检查下方单元格或右侧单元格
          const nextRowAddr = XLSX.utils.encode_col(c) + (r + 1);
          const rightAddr = XLSX.utils.encode_col(c + 1) + r;
          const found = cleanNumber(getCellVal(ws, nextRowAddr)) ?? cleanNumber(getCellVal(ws, rightAddr));
          if (found != null) {
            salesPrice = found;
            salesPriceFormula = getCellFormula(ws, nextRowAddr) || getCellFormula(ws, rightAddr) || '';
          }
        }

        if (val.includes('报价') && !val.includes('不含') && !val.includes('原有') && !val.includes('公式')) {
          // 比如 "速通报价22.39" 或 "报价30"
          const m = val.match(/([0-9]+(\.[0-9]+)?)/);
          if (m) {
            quotePrice = cleanNumber(m[1]);
            quoteNote = val;
          }
        }
      }
    }

    // 容错补充：若部分汇总值为0但有明细，自动求和补偿（绝不擅自强塞假数据）
    if (materialCost === 0 && bomItems.length > 0) {
      materialCost = cleanNumber(bomItems.reduce((acc, cur) => acc + cur.totalPrice, 0)) || 0;
    }
    if (laborCost === 0 && laborItems.length > 0) {
      laborCost = cleanNumber(laborItems.reduce((acc, cur) => acc + cur.cost, 0)) || 0;
    }
    if (totalCost === 0) {
      totalCost = cleanNumber(materialCost + materialLoss + laborCost + laborLoss) || 0;
    }
    if (taxCost === 0) {
      taxCost = totalCost;
    }

    // 5. 组装标准 calculation_steps 推导链（根据各表格真实公式与数值动态生成，杜绝硬编码固定常量）
    const bomExpr =
      bomItems.length > 0
        ? bomItems.map((b) => `${b.totalPrice}(${b.type})`).join(' + ')
        : '0';

    const laborExpr =
      laborItems.length > 0
        ? laborItems.map((l) => `${l.cost}(${l.name})`).join(' + ')
        : '0';

    // 材料损耗动态提取与代入轨迹
    let matLossRate = 0.03;
    if (materialLossFormula) {
      const match = materialLossFormula.match(/\*([0-9.]+)/);
      if (match) matLossRate = parseFloat(match[1]);
    } else if (materialCost > 0 && materialLoss > 0) {
      matLossRate = Number((materialLoss / materialCost).toFixed(4));
    }
    const matLossFormulaText = materialLossFormula
      ? `公式: ${materialLossFormula}`
      : materialLoss > 0
        ? `材料费用小计 × 材料损耗率 (${(matLossRate * 100).toFixed(1)}%)`
        : '未计提材料损耗';
    const matLossExpr = materialLoss > 0 ? `${materialCost} × ${matLossRate}` : '0';

    // 工时损耗动态提取与代入轨迹
    let labLossRate = 0.05;
    if (laborLossFormula) {
      const match = laborLossFormula.match(/\*([0-9.]+)/);
      if (match) labLossRate = parseFloat(match[1]);
    } else if (laborCost > 0 && laborLoss > 0) {
      labLossRate = Number((laborLoss / laborCost).toFixed(4));
    }
    const labLossFormulaText = laborLossFormula
      ? `公式: ${laborLossFormula}`
      : laborLoss > 0
        ? `工时费用小计 × 工时损耗率 (${(labLossRate * 100).toFixed(1)}%)`
        : '未计提工时损耗';
    const labLossExpr = laborLoss > 0 ? `${laborCost} × ${labLossRate}` : '0';

    // 含税总成本动态提取与代入轨迹
    let taxMultiplier = 1.03;
    if (taxCostFormula) {
      const match = taxCostFormula.match(/\*([0-9.]+)/);
      if (match) taxMultiplier = parseFloat(match[1]);
    } else if (totalCost > 0 && taxCost > totalCost) {
      taxMultiplier = Number((taxCost / totalCost).toFixed(4));
    }
    const taxCostFormulaText = taxCostFormula
      ? `公式: ${taxCostFormula}`
      : taxCost > totalCost
        ? `基础生产总成本 × 综合税赋加成 (${taxMultiplier})`
        : '含税总成本 (与基础生产总成本一致)';
    const taxCostExpr = taxCost > totalCost ? `${totalCost} × ${taxMultiplier}` : `${totalCost}`;

    const steps = [
      {
        stepKey: 'material_cost',
        name: '材料费用小计',
        formula: materialCostFormula ? `公式: ${materialCostFormula}` : '∑(各BOM物料用量 × 单价)',
        expression: bomExpr,
        result: materialCost,
        unit: '元',
        description: `全部 ${bomItems.length} 项原材料采购金额逐项相加`,
      },
      {
        stepKey: 'material_loss',
        name: '材料加工损耗',
        formula: matLossFormulaText,
        expression: matLossExpr,
        result: materialLoss,
        unit: '元',
        description: '计提裁线、压接、组装损耗费用',
      },
      {
        stepKey: 'labor_cost',
        name: '工时加工费小计',
        formula: laborCostFormula ? `公式: ${laborCostFormula}` : '∑(工序点数 × 效率单价)',
        expression: laborExpr,
        result: laborCost,
        unit: '元',
        description: `全部 ${laborItems.length} 道制程工序工时加工费逐项相加`,
      },
      {
        stepKey: 'labor_loss',
        name: '工时准备损耗',
        formula: labLossFormulaText,
        expression: labLossExpr,
        result: laborLoss,
        unit: '元',
        description: '计提首件调机、工模治具调试与工时损耗',
      },
      {
        stepKey: 'total_cost',
        name: '基础生产总成本',
        formula: totalCostFormula ? `公式: ${totalCostFormula}` : '材料小计 + 材料损耗 + 工时小计 + 工时损耗',
        expression: `${materialCost} + ${materialLoss} + ${laborCost} + ${laborLoss}`,
        result: totalCost,
        unit: '元',
        description: '不含税直接综合制造成本',
      },
      {
        stepKey: 'tax_cost',
        name: '含税总成本',
        formula: taxCostFormulaText,
        expression: taxCostExpr,
        result: taxCost,
        unit: '元',
        description: '包含增值税赋与综合财务保本成本',
      },
    ];

    if (salesPrice != null) {
      const salesDeriv = resolvePriceDerivation(
        salesPriceFormula,
        taxCost,
        salesPrice,
        '含税总成本',
        ws,
      );
      steps.push({
        stepKey: 'sales_price',
        name: '建议售价 (最低售价)',
        formula: salesDeriv.formula,
        expression: salesDeriv.expression,
        result: salesPrice,
        unit: '元',
        description: '核定批量供货最低出厂销售价',
      });
    }

    if (samplePrice != null && samplePrice > 0) {
      const sampleDeriv = resolvePriceDerivation(
        samplePriceFormula,
        taxCost,
        samplePrice,
        '含税总成本',
        ws,
      );
      steps.push({
        stepKey: 'sample_price',
        name: '打样样品价',
        formula: sampleDeriv.formula,
        expression: sampleDeriv.expression,
        result: samplePrice,
        unit: '元',
        description: '小批量试产或打样核定价格',
      });
    }

    if (quotePrice != null) {
      steps.push({
        stepKey: 'quote_price',
        name: '正式核定/供应商报价',
        formula: quoteNote || '外部确认报价',
        expression: '人工审核或供应商正式报价',
        result: quotePrice,
        unit: '元',
        description: '最终业务成交/外部供应商正式报价',
      });
    }

    results.push({
      platformNo,
      productName: productName || `${platformNo} 线束成品方案`,
      customerName,
      customerPartNo,
      sourceExcelFile: fileName,
      sourceSheetName: sheetName,
      materialCost,
      materialLoss,
      laborCost,
      laborLoss,
      totalCost,
      taxCost,
      salesPrice,
      samplePrice,
      quotePrice,
      formulaConfig: {
        materialCostFormula,
        materialLossFormula,
        laborCostFormula,
        laborLossFormula,
        totalCostFormula,
        taxCostFormula,
        salesPriceFormula,
        samplePriceFormula,
      },
      calculationSteps: steps,
      bomItems,
      laborItems,
    });
  }

  return results;
}

export function toSafeStorageKey(fileName, index) {
  const hash = crypto.createHash('md5').update(fileName).digest('hex').slice(0, 8);
  const cleanBase = fileName
    .replace(/\.xlsx$/i, '')
    .replace(/[^\w-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
  const paddedIdx = String(index + 1).padStart(2, '0');
  const safeName = cleanBase ? `${paddedIdx}_${cleanBase}_${hash}.xlsx` : `${paddedIdx}_${hash}.xlsx`;
  return `cost-analyses/${safeName}`;
}

function sqlEscape(val) {
  if (val == null) return 'null';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlNum(val) {
  if (val == null || val === '') return 'null';
  const n = Number(val);
  return Number.isFinite(n) ? String(n) : 'null';
}

function sqlJson(obj) {
  if (obj == null) return "'{}'::jsonb";
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

export function generateSeedSql(allAnalyses, fileUrlMap = new Map()) {
  const lines = [];
  lines.push('-- ==============================================================================');
  lines.push('-- 06_finished_harness_cost_analyses.sql');
  lines.push('-- 成品线束方案成本分析、定价公式推导明细与价格汇总基线数据');
  lines.push(`-- 自动生成自 excel/ 目录下 20 个 Excel 文件，共 ${allAnalyses.length} 个成品方案`);
  lines.push('-- ==============================================================================\n');
  lines.push('begin;\n');

  lines.push('-- 1. 扩充/建档成品线束主表核心价格指标');
  lines.push('insert into public.finished_harness_materials (');
  lines.push('  platform_no,');
  lines.push('  son_name,');
  lines.push('  son_unit,');
  lines.push('  son_price_low,');
  lines.push('  total_cost,');
  lines.push('  sales_price,');
  lines.push('  sample_price,');
  lines.push('  quote_price,');
  lines.push('  has_cost_analysis,');
  lines.push('  source_excel_url');
  lines.push(')');
  lines.push('values');

  const matValues = allAnalyses.map((item, idx) => {
    const urlInfo = fileUrlMap.get(item.sourceExcelFile);
    const sourceExcelUrl = urlInfo?.publicUrl || null;
    const isLast = idx === allAnalyses.length - 1;
    return `  (${sqlEscape(item.platformNo)}, ${sqlEscape(item.productName || item.platformNo)}, 'pcs', ${sqlNum(item.salesPrice)}, ${sqlNum(item.totalCost)}, ${sqlNum(item.salesPrice)}, ${sqlNum(item.samplePrice)}, ${sqlNum(item.quotePrice)}, true, ${sqlEscape(sourceExcelUrl)})${isLast ? '' : ','}`;
  });
  lines.push(matValues.join('\n'));

  lines.push('on conflict (platform_no) do update set');
  lines.push('  son_name = coalesce(finished_harness_materials.son_name, excluded.son_name),');
  lines.push('  son_unit = coalesce(finished_harness_materials.son_unit, excluded.son_unit),');
  lines.push('  total_cost = excluded.total_cost,');
  lines.push('  sales_price = excluded.sales_price,');
  lines.push('  sample_price = excluded.sample_price,');
  lines.push('  quote_price = excluded.quote_price,');
  lines.push('  has_cost_analysis = true,');
  lines.push('  source_excel_url = coalesce(excluded.source_excel_url, finished_harness_materials.source_excel_url),');
  lines.push('  updated_at = now();\n');

  lines.push('-- 2. 写入/更新成本分析与价格推导明细表');
  lines.push('insert into public.finished_harness_cost_analyses (');
  lines.push('  harness_material_id,');
  lines.push('  platform_no,');
  lines.push('  source_excel_file,');
  lines.push('  source_sheet_name,');
  lines.push('  source_excel_path,');
  lines.push('  source_excel_url,');
  lines.push('  customer_name,');
  lines.push('  customer_part_no,');
  lines.push('  material_cost,');
  lines.push('  material_loss,');
  lines.push('  labor_cost,');
  lines.push('  labor_loss,');
  lines.push('  total_cost,');
  lines.push('  tax_cost,');
  lines.push('  sales_price,');
  lines.push('  sample_price,');
  lines.push('  quote_price,');
  lines.push('  formula_config,');
  lines.push('  calculation_steps,');
  lines.push('  bom_items,');
  lines.push('  labor_items');
  lines.push(')');
  lines.push('values');

  const costValues = allAnalyses.map((item, idx) => {
    const urlInfo = fileUrlMap.get(item.sourceExcelFile);
    const sourceExcelUrl = urlInfo?.publicUrl || null;
    const sourceExcelPath = urlInfo?.storagePath || null;
    const isLast = idx === allAnalyses.length - 1;

    const row = [
      `(select id from public.finished_harness_materials where platform_no = ${sqlEscape(item.platformNo)} limit 1)`,
      sqlEscape(item.platformNo),
      sqlEscape(item.sourceExcelFile),
      sqlEscape(item.sourceSheetName),
      sqlEscape(sourceExcelPath),
      sqlEscape(sourceExcelUrl),
      sqlEscape(item.customerName || null),
      sqlEscape(item.customerPartNo || null),
      sqlNum(item.materialCost || 0),
      sqlNum(item.materialLoss || 0),
      sqlNum(item.laborCost || 0),
      sqlNum(item.laborLoss || 0),
      sqlNum(item.totalCost || 0),
      sqlNum(item.taxCost || 0),
      sqlNum(item.salesPrice),
      sqlNum(item.samplePrice),
      sqlNum(item.quotePrice),
      sqlJson(item.formulaConfig),
      sqlJson(item.calculationSteps),
      sqlJson(item.bomItems),
      sqlJson(item.laborItems),
    ];

    return `  (${row.join(', ')})${isLast ? '' : ','}`;
  });
  lines.push(costValues.join('\n'));

  lines.push('on conflict (platform_no) do update set');
  lines.push('  harness_material_id = excluded.harness_material_id,');
  lines.push('  source_excel_file = excluded.source_excel_file,');
  lines.push('  source_sheet_name = excluded.source_sheet_name,');
  lines.push('  source_excel_path = coalesce(excluded.source_excel_path, finished_harness_cost_analyses.source_excel_path),');
  lines.push('  source_excel_url = coalesce(excluded.source_excel_url, finished_harness_cost_analyses.source_excel_url),');
  lines.push('  customer_name = excluded.customer_name,');
  lines.push('  customer_part_no = excluded.customer_part_no,');
  lines.push('  material_cost = excluded.material_cost,');
  lines.push('  material_loss = excluded.material_loss,');
  lines.push('  labor_cost = excluded.labor_cost,');
  lines.push('  labor_loss = excluded.labor_loss,');
  lines.push('  total_cost = excluded.total_cost,');
  lines.push('  tax_cost = excluded.tax_cost,');
  lines.push('  sales_price = excluded.sales_price,');
  lines.push('  sample_price = excluded.sample_price,');
  lines.push('  quote_price = excluded.quote_price,');
  lines.push('  formula_config = excluded.formula_config,');
  lines.push('  calculation_steps = excluded.calculation_steps,');
  lines.push('  bom_items = excluded.bom_items,');
  lines.push('  labor_items = excluded.labor_items,');
  lines.push('  updated_at = now();\n');

  lines.push('commit;\n');
  return lines.join('\n');
}

// 如果作为主脚本运行
if (process.argv[1] && process.argv[1].endsWith('import-cost-analyses.mjs')) {
  async function run() {
    const excelDir = path.resolve('excel');
    const files = fs.readdirSync(excelDir).filter((f) => f.endsWith('.xlsx')).sort();
    console.log(`发现 ${files.length} 个 Excel 文件，开始解析...`);

    const allAnalyses = [];
    const platformNoSet = new Set();

    for (const file of files) {
      const filePath = path.join(excelDir, file);
      try {
        const analyses = parseCostWorkbook(filePath);
        for (const a of analyses) {
          if (!platformNoSet.has(a.platformNo)) {
            platformNoSet.add(a.platformNo);
            allAnalyses.push(a);
          } else {
            // 同料号多 sheet，附加上 sheet 区分
            const altNo = `${a.platformNo}-${a.sourceSheetName.replace(/\s+/g, '')}`;
            if (!platformNoSet.has(altNo)) {
              a.platformNo = altNo;
              platformNoSet.add(altNo);
              allAnalyses.push(a);
            }
          }
        }
      } catch (err) {
        console.error(`解析文件 ${file} 失败:`, err.message);
      }
    }

    console.log(`解析完成！成功抽取 ${allAnalyses.length} 个成品方案。`);

    // 映射云端 Storage 路径
    const fileUrlMap = new Map();
    const env = loadEnv();
    const baseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || 'https://wioaznspvchiogdxvtun.supabase.co';
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      const storagePath = toSafeStorageKey(fileName, i);
      const publicUrl = `${baseUrl}/storage/v1/object/public/cost-analysis-sources/${storagePath}`;
      fileUrlMap.set(fileName, { storagePath, publicUrl });
    }

    // 检查是否带 --export-sql 执行 SQL 文件生成
    if (process.argv.includes('--export-sql')) {
      const targetSqlPath = path.resolve('supabase/sql/40_seed/06_finished_harness_cost_analyses.sql');
      const sqlContent = generateSeedSql(allAnalyses, fileUrlMap);
      fs.writeFileSync(targetSqlPath, sqlContent, 'utf8');
      const stats = fs.statSync(targetSqlPath);
      console.log(`[SQL 导出成功] 文件: ${targetSqlPath}`);
      console.log(`包含成品方案: ${allAnalyses.length} 个，文件大小: ${(stats.size / 1024).toFixed(1)} KB`);
      return;
    }

    console.log('示例第 1 个方案概要:');
    const s1 = allAnalyses[0];
    console.log({
      platformNo: s1.platformNo,
      productName: s1.productName,
      totalCost: s1.totalCost,
      salesPrice: s1.salesPrice,
      samplePrice: s1.samplePrice,
      bomCount: s1.bomItems.length,
      laborCount: s1.laborItems.length,
      stepsCount: s1.calculationSteps.length,
    });

    // 检查是否带 --commit 执行入库
    if (process.argv.includes('--commit')) {
      const env = loadEnv();
      const pg = require(path.resolve('.tmp/db-runtime/node_modules/pg'));
      const client = new pg.Client({
        host: env.SUPABASE_DB_HOST,
        port: Number(env.SUPABASE_DB_PORT || 6543),
        user: env.SUPABASE_DB_USER,
        password: env.SUPABASE_DB_PASSWORD,
        database: env.SUPABASE_DB_NAME,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      });

      console.log('正在连接数据库执行批量写入...');
      await client.connect();

      let createdCount = 0;
      let updatedCount = 0;

      for (const item of allAnalyses) {
        // 1. 查找或创建 finished_harness_materials
        const existRes = await client.query(
          'select id from public.finished_harness_materials where platform_no = $1',
          [item.platformNo]
        );

        let harnessMaterialId = null;
        if (existRes.rows.length > 0) {
          harnessMaterialId = existRes.rows[0].id;
          // 更新主表价格
          await client.query(
            `update public.finished_harness_materials 
             set total_cost = $1, sales_price = $2, sample_price = $3, quote_price = $4, has_cost_analysis = true, updated_at = now()
             where id = $5`,
            [item.totalCost, item.salesPrice, item.samplePrice, item.quotePrice, harnessMaterialId]
          );
          updatedCount++;
        } else {
          // 自动建档新成品物料（成本分析建档物料 source_material_id 为空）
          const insertRes = await client.query(
            `insert into public.finished_harness_materials 
             (source_material_id, platform_no, son_name, son_unit, son_price_low, total_cost, sales_price, sample_price, quote_price, has_cost_analysis)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
             returning id`,
            [
              null,
              item.platformNo,
              item.productName,
              'pcs',
              item.salesPrice,
              item.totalCost,
              item.salesPrice,
              item.samplePrice,
              item.quotePrice,
            ]
          );
          harnessMaterialId = insertRes.rows[0].id;
          createdCount++;
        }

        // 2. Upsert 写入 finished_harness_cost_analyses
        await client.query(
          `insert into public.finished_harness_cost_analyses
           (harness_material_id, platform_no, source_excel_file, source_sheet_name, customer_name, customer_part_no,
            material_cost, material_loss, labor_cost, labor_loss, total_cost, tax_cost, sales_price, sample_price, quote_price,
            formula_config, calculation_steps, bom_items, labor_items, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now())
           on conflict (platform_no) do update set
            harness_material_id = excluded.harness_material_id,
            source_excel_file = excluded.source_excel_file,
            source_sheet_name = excluded.source_sheet_name,
            customer_name = excluded.customer_name,
            customer_part_no = excluded.customer_part_no,
            material_cost = excluded.material_cost,
            material_loss = excluded.material_loss,
            labor_cost = excluded.labor_cost,
            labor_loss = excluded.labor_loss,
            total_cost = excluded.total_cost,
            tax_cost = excluded.tax_cost,
            sales_price = excluded.sales_price,
            sample_price = excluded.sample_price,
            quote_price = excluded.quote_price,
            formula_config = excluded.formula_config,
            calculation_steps = excluded.calculation_steps,
            bom_items = excluded.bom_items,
            labor_items = excluded.labor_items,
            updated_at = now()`,
          [
            harnessMaterialId,
            item.platformNo,
            item.sourceExcelFile,
            item.sourceSheetName,
            item.customerName || null,
            item.customerPartNo || null,
            item.materialCost,
            item.materialLoss,
            item.laborCost,
            item.laborLoss,
            item.totalCost,
            item.taxCost,
            item.salesPrice,
            item.samplePrice,
            item.quotePrice,
            JSON.stringify(item.formulaConfig),
            JSON.stringify(item.calculationSteps),
            JSON.stringify(item.bomItems),
            JSON.stringify(item.laborItems),
          ]
        );
      }

      console.log(`入库成功！关联更新已有成品: ${updatedCount} 个，自动建档新成品: ${createdCount} 个。`);
      await client.end();
    } else {
      console.log('当前为预览模式，若需真正写入数据库请运行: node scripts/import-cost-analyses.mjs --commit');
    }
  }

  run().catch((err) => {
    console.error('运行出错:', err);
    process.exit(1);
  });
}
