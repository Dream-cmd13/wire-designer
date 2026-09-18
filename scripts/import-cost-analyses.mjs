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

// 递归收集 excel/ 下的工作簿（每个 xlsx 可与提取的图纸图片一起放在同名子文件夹中），按文件名排序保证存储路径稳定。
export function listExcelWorkbooks(excelDir) {
  const results = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith('.xlsx') && !entry.name.startsWith('~$')) results.push({ fileName: entry.name, filePath: fullPath });
    }
  };
  walk(excelDir);
  results.sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
  return results;
}

function cleanNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function getCellVal(ws, addr) {
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

function getCellFormula(ws, addr) {
  const cell = ws[addr];
  return cell ? cell.f : undefined;
}

function displayNumber(value, format) {
  if (value == null) return '--';
  if (!format || format.trim().toLowerCase() === 'general') {
    const text = value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 });
    if (value !== 0 && Number(text) === 0) return value > 0 ? '<0.000001' : '>-0.000001';
    return text;
  }
  return XLSX.SSF.format(format, value).trim();
}

function formatFormulaExpression(formula, ws, display = false) {
  const cellReferencePattern = /\$?([A-Z]{1,3})\$?(\d+)/g;
  const substituted = formula.replace(
    cellReferencePattern,
    (reference, column, row, offset, source) => {
      // 跳过区间（SUM(I5:I16)）与函数名（LOG10( 等）中的引用，避免把区间端点替换成数值
      const before = source[offset - 1];
      const after = source[offset + reference.length];
      if (before === ':' || after === ':' || after === '(') return reference;
      const value = cleanNumber(getCellVal(ws, `${column}${row}`));
      return value == null ? reference : display ? displayNumber(value, ws[`${column}${row}`]?.z) : String(value);
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

  // 无源公式时不做任何比例反推，仅如实记录原表数值
  return {
    formula: '源表未提供公式',
    expression: targetValue != null ? `${targetValue}` : '源表未提供',
  };
}

export function parseCostWorkbook(filePath, options = {}) {
  const fileName = path.basename(filePath);
  const wb = XLSX.readFile(filePath, { cellFormula: true, cellNF: true });
  const results = [];
  const warn = (sheetName, message) => {
    options.onWarning?.(`${fileName} [${sheetName}]: ${message}`);
  };

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
        // sheet 无规范命名时，优先取文件名中的规范料号
        const fileMatch = fileName.match(/WL-B[0-9]{2}-[0-9A-Za-z_-]+/);
        platformNo = fileMatch ? fileMatch[0] : sheetName.trim();
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

    const numberFormats = {};
    const cellFormat = (addr) => ws[addr]?.z || 'General';

    const bomItems = [];
    if (bomStartRow > 0) {
      let bomEndFound = false;
      for (let r = bomStartRow; r <= 35; r++) {
        const aVal = String(getCellVal(ws, 'A' + r) || '').trim();
        const gVal = String(getCellVal(ws, 'G' + r) || '').trim();
        const hVal = String(getCellVal(ws, 'H' + r) || '').trim();
        if (hVal.includes('材料总价') || gVal.includes('材料总价') || hVal.includes('总成本') || aVal.includes('总成本')) {
          bomEndRow = r - 1;
          bomEndFound = true;
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
            type: type || null,
            spec: spec || null,
            brand: brand || null,
            qty,
            unit: unit || null,
            unitPrice,
            totalPrice,
            numberFormats: { qty: cellFormat('F' + r), unitPrice: cellFormat('H' + r), totalPrice: cellFormat('I' + r) },
          });
        }
      }
      if (!bomEndFound) {
        warn(sheetName, 'BOM 明细未找到结束标志（材料总价/总成本），可能被截断');
      }
      if (bomItems.length === 0) {
        warn(sheetName, 'BOM 明细为空');
      }
    } else {
      warn(sheetName, '未找到 BOM 明细表头（序号/类型）');
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
      let laborEndFound = false;
      for (let r = laborStartRow; r <= 65; r++) {
        const cVal = String(getCellVal(ws, 'C' + r) || '').trim();
        const hVal = String(getCellVal(ws, 'H' + r) || '').trim();
        if (cVal.includes('计划总工时') || hVal.includes('合计') || cVal.includes('核准') || cVal.includes('审核')) {
          laborEndFound = true;
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
            ratePerPoint,
            points,
            cost,
            note: note || null,
            numberFormats: { ratePerPoint: cellFormat('D' + r), points: cellFormat('H' + r), cost: cellFormat('I' + r) },
          });
        }
      }
      if (!laborEndFound) {
        warn(sheetName, '工序明细未找到结束标志（计划总工时/合计），可能被截断');
      }
      if (laborItems.length === 0) {
        warn(sheetName, '工序明细为空');
      }
    } else {
      warn(sheetName, '未找到工序明细表头（序号/工序名称）');
    }

    // 4. 扫描定位核心指标与公式（原表缺失即 null，绝不回退造数）
    let materialCost = null;
    let materialCostFormula = '';
    let materialLoss = null;
    let materialLossFormula = '';
    let laborCost = null;
    let laborCostFormula = '';
    let laborLoss = null;
    let laborLossFormula = '';
    let totalCost = null;
    let totalCostFormula = '';
    let taxCost = null;
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
            numberFormats.material_cost = cellFormat(targetAddr);
            materialCostFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '材料损耗（元）：' || val === '材料损耗' || (val.includes('材料损耗') && val.length <= 10)) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            materialLoss = foundVal;
            numberFormats.material_loss = cellFormat(targetAddr);
            materialLossFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '工时费用（元）：' || val === '工时费用' || (val.includes('工时费用') && val.length <= 10)) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            laborCost = foundVal;
            numberFormats.labor_cost = cellFormat(targetAddr);
            laborCostFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '工时损耗（元）：' || val === '工时损耗' || (val.includes('工时损耗') && val.length <= 10)) {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            laborLoss = foundVal;
            numberFormats.labor_loss = cellFormat(targetAddr);
            laborLossFormula = getCellFormula(ws, targetAddr) || '';
          }
        }

        if (val === '总成本（元）：' || val === '总成本:' || val === '总成本') {
          const targetAddr = 'I' + r;
          const foundVal = cleanNumber(getCellVal(ws, targetAddr));
          if (foundVal != null) {
            totalCost = foundVal;
            numberFormats.total_cost = cellFormat(targetAddr);
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
              numberFormats.tax_cost = cellFormat(check);
              taxCostFormula = getCellFormula(ws, check) || '';
              break;
            } else if (getCellVal(ws, nextCheck) != null && typeof getCellVal(ws, nextCheck) === 'number') {
              taxCost = cleanNumber(getCellVal(ws, nextCheck)) ?? 0;
              numberFormats.tax_cost = cellFormat(nextCheck);
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
            const sourceAddr = cleanNumber(getCellVal(ws, nextRowAddr)) != null ? nextRowAddr : rightAddr;
            numberFormats.sample_price = cellFormat(sourceAddr);
            samplePriceFormula = getCellFormula(ws, sourceAddr) || '';
          }
        }

        if (val === '售价' || val === '最低售价') {
          // 检查下方单元格或右侧单元格
          const nextRowAddr = XLSX.utils.encode_col(c) + (r + 1);
          const rightAddr = XLSX.utils.encode_col(c + 1) + r;
          const found = cleanNumber(getCellVal(ws, nextRowAddr)) ?? cleanNumber(getCellVal(ws, rightAddr));
          if (found != null) {
            salesPrice = found;
            const sourceAddr = cleanNumber(getCellVal(ws, nextRowAddr)) != null ? nextRowAddr : rightAddr;
            numberFormats.sales_price = cellFormat(sourceAddr);
            salesPriceFormula = getCellFormula(ws, sourceAddr) || '';
          }
        }

        if (val.includes('报价') && !val.includes('不含') && !val.includes('原有') && !val.includes('公式')) {
          // 比如 "速通报价22.39" 或 "报价30"
          const m = val.match(/([0-9]+(\.[0-9]+)?)/);
          if (m) {
            quotePrice = cleanNumber(m[1]);
            const decimals = m[1].split('.')[1]?.length || 0;
            numberFormats.quote_price = decimals ? '0.' + '0'.repeat(decimals) : '0';
            quoteNote = val;
          }
        }
      }
    }

    // 部分表格把税赋直接乘进“总成本”单元格（如 SUM(I11:I14)*1.03），此时该格为含税总成本
    let embeddedTaxMultiplier = 1;
    if (totalCostFormula) {
      const embeddedMatch = totalCostFormula.match(/\*\s*([0-9.]+)\s*$/);
      if (embeddedMatch) {
        const mult = parseFloat(embeddedMatch[1]);
        if (mult > 1 && mult < 2) embeddedTaxMultiplier = mult;
      }
    }
    const totalCostIncludesTax = embeddedTaxMultiplier > 1;

    // total_cost 统一为不含税基础生产成本；tax_cost 统一为含税总成本；原表缺失则保持 null
    let baseTotalCost = totalCost;
    let baseTotalCostFormula = totalCostFormula;
    if (totalCostIncludesTax && totalCost != null) {
      baseTotalCost = cleanNumber(totalCost / embeddedTaxMultiplier);
      baseTotalCostFormula = totalCostFormula.replace(/\*\s*[0-9.]+\s*$/, '').trim();
      if (taxCost == null) {
        taxCost = totalCost;
        numberFormats.tax_cost = numberFormats.total_cost;
        taxCostFormula = totalCostFormula;
      }
    }

    if (materialCost == null) warn(sheetName, '未定位到“材料总价”汇总值');
    if (laborCost == null) warn(sheetName, '未定位到“工时费用”汇总值');
    if (totalCost == null) warn(sheetName, '未定位到“总成本”汇总值');
    if (salesPrice == null) warn(sheetName, '未定位到“售价/最低售价”');

    // 5. 组装标准 calculation_steps 推导链（缺失即 null，公式与代入轨迹只允许来自原表）
    const bomExpr =
      bomItems.length > 0
        ? bomItems
            .map((b) => `${b.totalPrice != null ? b.totalPrice : '--'}(${b.type || '未标注类型'})`)
            .join(' + ')
        : '';

    const laborExpr =
      laborItems.length > 0
        ? laborItems.map((l) => `${l.cost != null ? l.cost : '--'}(${l.name})`).join(' + ')
        : '';

    // 材料损耗：仅按原表公式生成代入轨迹
    let matLossRate = null;
    if (materialLossFormula) {
      const match = materialLossFormula.match(/\*([0-9.]+)/);
      if (match) matLossRate = parseFloat(match[1]);
    }
    const matLossFormulaText = materialLossFormula ? `公式: ${materialLossFormula}` : '源表未提供公式';
    const matLossExpr =
      materialLoss == null
        ? '源表未提供'
        : materialLossFormula && matLossRate != null && materialCost != null
          ? `${materialCost} × ${matLossRate}`
          : `${materialLoss}`;

    // 工时损耗：仅按原表公式生成代入轨迹
    let labLossRate = null;
    if (laborLossFormula) {
      const match = laborLossFormula.match(/\*([0-9.]+)/);
      if (match) labLossRate = parseFloat(match[1]);
    }
    const labLossFormulaText = laborLossFormula ? `公式: ${laborLossFormula}` : '源表未提供公式';
    const labLossExpr =
      laborLoss == null
        ? '源表未提供'
        : laborLossFormula && labLossRate != null && laborCost != null
          ? `${laborCost} × ${labLossRate}`
          : `${laborLoss}`;

    // 含税总成本：仅按原表公式生成代入轨迹
    let taxMultiplier = null;
    if (taxCostFormula) {
      const match = taxCostFormula.match(/\*\s*([0-9.]+)/);
      if (match) taxMultiplier = parseFloat(match[1]);
    }
    const taxCostFormulaText = taxCostFormula ? `公式: ${taxCostFormula}` : '源表未提供公式';
    const taxCostExpr =
      taxCost == null
        ? '源表未提供含税成本'
        : taxMultiplier != null && baseTotalCost != null && taxCost > baseTotalCost
          ? `${baseTotalCost} × ${taxMultiplier}`
          : `${taxCost}`;

    const steps = [
      {
        stepKey: 'material_cost',
        name: '材料费用小计',
        formula: materialCostFormula ? `公式: ${materialCostFormula}` : '源表未提供公式',
        expression: bomItems.length > 0 ? bomExpr : materialCost != null ? `${materialCost}` : '源表未提供',
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
        formula: laborCostFormula ? `公式: ${laborCostFormula}` : '源表未提供公式',
        expression: laborItems.length > 0 ? laborExpr : laborCost != null ? `${laborCost}` : '源表未提供',
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
        formula: baseTotalCostFormula ? `公式: ${baseTotalCostFormula}` : '源表未提供公式',
        expression:
          materialCost != null && materialLoss != null && laborCost != null && laborLoss != null
            ? `${materialCost} + ${materialLoss} + ${laborCost} + ${laborLoss}`
            : baseTotalCost != null
              ? `${baseTotalCost}`
              : '源表未提供',
        result: baseTotalCost,
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
        name: '售价',
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

    // 展示轨迹使用来源格式，原始 expression 保持完整精度供数值校验。
    const displayField = (value, key) => displayNumber(value, numberFormats[key]);
    const displayExpressions = {
      material_cost: bomItems.length ? bomItems.map(b => `${displayNumber(b.totalPrice, b.numberFormats.totalPrice)}(${b.type || '未标注类型'})`).join(' + ') : displayField(materialCost, 'material_cost'),
      labor_cost: laborItems.length ? laborItems.map(l => `${displayNumber(l.cost, l.numberFormats.cost)}(${l.name})`).join(' + ') : displayField(laborCost, 'labor_cost'),
      material_loss: matLossRate != null && materialCost != null ? `${displayField(materialCost, 'material_cost')} × ${matLossRate}` : displayField(materialLoss, 'material_loss'),
      labor_loss: labLossRate != null && laborCost != null ? `${displayField(laborCost, 'labor_cost')} × ${labLossRate}` : displayField(laborLoss, 'labor_loss'),
      total_cost: [materialCost, materialLoss, laborCost, laborLoss].every(v => v != null)
        ? [[materialCost, 'material_cost'], [materialLoss, 'material_loss'], [laborCost, 'labor_cost'], [laborLoss, 'labor_loss']].map(([v, k]) => displayField(v, k)).join(' + ')
        : displayField(baseTotalCost, 'total_cost'),
      tax_cost: taxMultiplier != null && baseTotalCost != null && taxCost > baseTotalCost ? `${displayField(baseTotalCost, 'total_cost')} × ${taxMultiplier}` : displayField(taxCost, 'tax_cost'),
      sales_price: salesPriceFormula ? formatFormulaExpression(salesPriceFormula, ws, true) : displayField(salesPrice, 'sales_price'),
      sample_price: samplePriceFormula ? formatFormulaExpression(samplePriceFormula, ws, true) : displayField(samplePrice, 'sample_price'),
    };

    results.push({
      platformNo,
      productName: productName || null,
      customerName,
      customerPartNo,
      sourceExcelFile: fileName,
      sourceSheetName: sheetName,
      materialCost,
      materialLoss,
      laborCost,
      laborLoss,
      totalCost: baseTotalCost,
      taxCost,
      salesPrice,
      samplePrice,
      quotePrice,
      formulaConfig: {
        numberFormats,
        materialCostFormula,
        materialLossFormula,
        laborCostFormula,
        laborLossFormula,
        totalCostFormula: baseTotalCostFormula,
        taxCostFormula,
        salesPriceFormula,
        samplePriceFormula,
      },
      calculationSteps: steps.map((step) => ({ ...step, numberFormat: numberFormats[step.stepKey] || 'General', displayExpression: step.result == null ? step.expression : displayExpressions[step.stepKey] || step.expression })),
      bomItems,
      laborItems,
    });
  }

  // 同一文件内多个非规范 sheet 共用一个料号（如 2米/15米、涨价前/后）时，统一追加 sheet 名以区分
  const platformCounts = new Map();
  for (const item of results) {
    platformCounts.set(item.platformNo, (platformCounts.get(item.platformNo) ?? 0) + 1);
  }
  for (const item of results) {
    const sheetKey = item.sourceSheetName.trim();
    if ((platformCounts.get(item.platformNo) ?? 0) > 1 && !sheetKey.startsWith('WL-')) {
      item.platformNo = `${item.platformNo}-${sheetKey}`
        .replace(/\s+/g, '')
        .replace(/[\/\\:*?"<>|]/g, '-');
    }
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

// 清理当前 Excel 解析结果之外的旧命名残留：先删成本分析，再删已无分析引用的自动建档物料。
// 保证种子/同步脚本可单独重复执行，直接替换旧命名结果而无需清库；CRM 来源物料（source_material_id 非空）不受影响。
export function buildStaleCleanupStatements(platformNos) {
  const lines = [];
  lines.push('delete from public.finished_harness_cost_analyses');
  lines.push('where platform_no not in (');
  for (let i = 0; i < platformNos.length; i += 5) {
    const chunk = platformNos.slice(i, i + 5).map((no) => sqlEscape(no)).join(', ');
    lines.push(`  ${chunk}${i + 5 < platformNos.length ? ',' : ''}`);
  }
  lines.push(');');
  lines.push('');
  lines.push('delete from public.finished_harness_materials as m');
  lines.push('where m.source_material_id is null');
  lines.push('  and not exists (');
  lines.push('    select 1 from public.finished_harness_cost_analyses as c');
  lines.push('    where c.harness_material_id = m.id');
  lines.push('  );');
  return lines;
}

// 无来源图纸的物料仅在被成本分析引用时保留，否则隐藏；需在成本分析写入完成后执行。
export const NO_DRAWING_MATERIAL_CLEANUP_SQL = [
  'delete from public.finished_harness_materials as m',
  'where m.file_2d is null',
  '  and not exists (',
  '    select 1 from public.finished_harness_cost_analyses as c',
  '    where c.harness_material_id = m.id',
  '  );',
].join('\n');

export function generateSeedSql(allAnalyses, fileUrlMap = new Map()) {
  const lines = [];
  lines.push('-- ==============================================================================');
  lines.push('-- 06_finished_harness_cost_analyses.sql');
  lines.push('-- 成品线束方案成本分析、定价公式推导明细与价格汇总基线数据');
  lines.push(`-- 自动生成自 excel/ 目录下 20 个 Excel 文件，共 ${allAnalyses.length} 个成品方案`);
  lines.push('-- ==============================================================================\n');
  lines.push('begin;\n');

  lines.push('-- 0. 清理历史命名与过期文件残留：直接替换旧命名结果，保证本种子可单独重复执行');
  lines.push(...buildStaleCleanupStatements(allAnalyses.map((item) => item.platformNo)));
  lines.push('');

  lines.push('-- 1. 扩充/建档成品线束主表核心价格指标');
  lines.push('-- 注意：不写入 son_price_low（CRM 平台最低售价，有值即保留、缺失保持 null）；');
  lines.push('-- 也不写入 son_unit（外部导入字段，缺失保持 null），成本分析/Excel 推导结果一律禁止回填这些列。');
  lines.push('insert into public.finished_harness_materials (');
  lines.push('  platform_no,');
  lines.push('  son_name,');
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
    return `  (${sqlEscape(item.platformNo)}, ${sqlEscape(item.productName)}, ${sqlNum(item.totalCost)}, ${sqlNum(item.salesPrice)}, ${sqlNum(item.samplePrice)}, ${sqlNum(item.quotePrice)}, true, ${sqlEscape(sourceExcelUrl)})${isLast ? '' : ','}`;
  });
  lines.push(matValues.join('\n'));

  lines.push('on conflict (platform_no) do update set');
  lines.push('  son_name = case when finished_harness_materials.source_material_id is null then excluded.son_name else finished_harness_materials.son_name end,');
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
      sqlNum(item.materialCost),
      sqlNum(item.materialLoss),
      sqlNum(item.laborCost),
      sqlNum(item.laborLoss),
      sqlNum(item.totalCost),
      sqlNum(item.taxCost),
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

  lines.push('-- 3. 隐藏无来源图纸且未被成本分析引用的物料，保持成品库只展示有图纸或已核算成本的物料');
  lines.push(...NO_DRAWING_MATERIAL_CLEANUP_SQL.split('\n'));
  lines.push('');

  lines.push('commit;\n');
  return lines.join('\n');
}

// 如果作为主脚本运行
if (process.argv[1] && process.argv[1].endsWith('import-cost-analyses.mjs')) {
  async function run() {
    const excelDir = path.resolve('excel');
    const files = listExcelWorkbooks(excelDir);
    console.log(`发现 ${files.length} 个 Excel 文件，开始解析...`);

    const allAnalyses = [];
    const platformNoSet = new Set();
    const parseWarnings = [];

    for (const { fileName, filePath } of files) {
      try {
        const analyses = parseCostWorkbook(filePath, {
          onWarning: (message) => parseWarnings.push(message),
        });
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
        console.error(`解析文件 ${fileName} 失败:`, err.message);
      }
    }

    console.log(`解析完成！成功抽取 ${allAnalyses.length} 个成品方案。`);
    if (parseWarnings.length > 0) {
      console.warn(`解析告警 ${parseWarnings.length} 条：`);
      parseWarnings.forEach((message) => console.warn(`  - ${message}`));
    }

    // 映射云端 Storage 路径
    const fileUrlMap = new Map();
    const env = loadEnv();
    const baseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || 'https://wioaznspvchiogdxvtun.supabase.co';
    for (let i = 0; i < files.length; i++) {
      const { fileName } = files[i];
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

      // 直接替换旧命名结果：清理当前解析结果之外的历史成本分析与自动建档物料
      await client.query(
        buildStaleCleanupStatements(allAnalyses.map((item) => item.platformNo)).join('\n')
      );

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
          // 更新主表价格；自动建档物料（source_material_id 为空）无来源名称时同步置空，CRM 来源物料名称永不覆盖
          await client.query(
            `update public.finished_harness_materials 
             set total_cost = $1, sales_price = $2, sample_price = $3, quote_price = $4, has_cost_analysis = true,
                 son_name = case when source_material_id is null then $5 else son_name end, updated_at = now()
             where id = $6`,
            [item.totalCost, item.salesPrice, item.samplePrice, item.quotePrice, item.productName || null, harnessMaterialId]
          );
          updatedCount++;
        } else {
          // 自动建档新成品物料（成本分析建档物料 source_material_id 为空）
          // 不写入 son_price_low（CRM 平台最低售价）与 son_unit（外部导入单位），缺失即保持 null
          const insertRes = await client.query(
            `insert into public.finished_harness_materials 
             (source_material_id, platform_no, son_name, total_cost, sales_price, sample_price, quote_price, has_cost_analysis)
             values ($1, $2, $3, $4, $5, $6, $7, true)
             returning id`,
            [
              null,
              item.platformNo,
              item.productName || null,
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

      // 成本分析写入完成后再隐藏无图纸且未被引用的物料
      await client.query(NO_DRAWING_MATERIAL_CLEANUP_SQL);

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
