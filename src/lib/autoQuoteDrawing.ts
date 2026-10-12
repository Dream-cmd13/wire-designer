import { binaryString, buildImagePdf, downloadBlob } from '@/lib/drawingExport';
import { safeFilename } from '@/lib/designFile';
import type { CatalogSnapshot } from '@/types/catalog';
import { getAvailableInnerMold } from './overmoldSpec';
import type { AutoQuoteFormState } from './autoQuote';

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[character] ?? character));
}

export function generateAutoQuoteDrawingSvg(
  form: AutoQuoteFormState,
  catalog: CatalogSnapshot | null,
): string {
  const width = 1000;
  const height = 650;
  const margin = 24;

  const connA = catalog?.connectors.find((c) => c.id === form.connectorAId);
  const connB = form.endpointBType === 'connector'
    ? catalog?.connectors.find((c) => c.id === form.connectorBId)
    : undefined;
  const wire = catalog?.wires.find((w) => w.resourceItemId === form.wireResourceId);
  const overmold = form.outerMoldType === 'pvc-45p'
    ? catalog?.overmolds.find((m) => m.id === form.outerMoldSpecId)
    : undefined;

  const title = `${connA?.name ?? 'A端连接器'} - ${
    form.endpointBType === 'connector'
      ? (connB?.name ?? 'B端连接器')
      : form.endpointBType === 'cut'
        ? '切断'
        : '剥皮沾锡'
  } 线束`;

  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // 线材规格描述
  let wireSpecText = wire?.name ?? '未选择线材';
  if (wire?.spec) {
    const s = wire.spec;
    if (s.kind === 'jacketed') {
      const parts: string[] = [];
      if (s.ulNumber) parts.push(s.ulNumber);
      if (s.jacketMaterial) parts.push(s.jacketMaterial);
      parts.push(`${s.coreCount}芯`);
      if (s.awg) parts.push(`${s.awg}AWG`);
      if (s.shielded) parts.push('屏蔽');
      if (s.outerDiameterMm) parts.push(`OD ${s.outerDiameterMm}mm`);
      wireSpecText = parts.join(' ');
    } else {
      wireSpecText = `UL1007 电子线 ${s.awg}AWG ${s.color}`;
    }
  }

  // BOM 汇总数据
  const bomRows: { no: number; name: string; model: string; qty: string; unit: string; note: string }[] = [];
  if (connA) {
    bomRows.push({
      no: 1,
      name: connA.name,
      model: connA.model || connA.series || '-',
      qty: '1',
      unit: 'PCS',
      note: 'A 端连接器',
    });
  }
  if (form.endpointBType === 'connector' && connB) {
    bomRows.push({
      no: bomRows.length + 1,
      name: connB.name,
      model: connB.model || connB.series || '-',
      qty: '1',
      unit: 'PCS',
      note: 'B 端连接器',
    });
  }
  if (wire) {
    const wireLengthM = (form.lengthMm / 1000).toFixed(3);
    bomRows.push({
      no: bomRows.length + 1,
      name: wire.name,
      model: wire.model || wireSpecText,
      qty: String(Number(wireLengthM)),
      unit: 'M',
      note: `实际线长 ${form.lengthMm}mm`,
    });
  }
  if (form.outerMoldType === 'pvc-45p' && overmold) {
    const moldQty = form.endpointBType === 'connector' ? 2 : 1;
    bomRows.push({
      no: bomRows.length + 1,
      name: overmold.name,
      model: `${overmold.outerMaterial} ${overmold.outerHardness}`,
      qty: String(moldQty),
      unit: 'PCS',
      note: moldQty === 2 ? 'A/B 双端成型' : 'A 端成型',
    });
    const inner = form.innerMoldType === 'pe' ? getAvailableInnerMold(overmold) : null;
    if (inner) {
      bomRows.push({
        no: bomRows.length + 1, name: 'PE 内模',
        model: `${inner.material} ${inner.formLabel}`, qty: String(moldQty), unit: 'PCS',
        note: moldQty === 2 ? 'A/B 双端内模' : 'A 端内模',
      });
    }
  }

  // 坐标定义
  const cy = 200; // 主中心轴 Y 坐标
  const connAX = 140; // A端连接器中心 X
  const connBX = 860; // B端连接器/端部中心 X
  const cableStartX = 230;
  const cableEndX = 770;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .draw-bg { fill: #ffffff; }
      .draw-border { fill: none; stroke: #1e293b; stroke-width: 1.5; }
      .draw-inner-border { fill: none; stroke: #64748b; stroke-width: 0.8; stroke-dasharray: 4 2; }
      .draw-text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
      .draw-title { font-size: 15px; font-weight: bold; fill: #0f172a; }
      .draw-label { font-size: 12px; fill: #334155; }
      .draw-dim { font-size: 12px; font-weight: 600; fill: #2563eb; }
      .draw-subtext { font-size: 11px; fill: #64748b; }
      .draw-badge { font-size: 10px; font-weight: 600; }
      .table-header { fill: #f1f5f9; font-weight: 600; }
      .table-text { font-size: 11px; fill: #1e293b; }
      .table-border { stroke: #cbd5e1; stroke-width: 0.7; }
    </style>
    <linearGradient id="cableGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#475569" />
      <stop offset="50%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="moldGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155" />
      <stop offset="50%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <marker id="arrowL" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
      <path d="M6,0 L0,3 L6,6 Z" fill="#2563eb" />
    </marker>
    <marker id="arrowR" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb" />
    </marker>
  </defs>

  <!-- 背景 -->
  <rect width="100%" height="100%" class="draw-bg" />

  <!-- 外图框与内图框 -->
  <rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" class="draw-border" />
  <rect x="${margin + 4}" y="${margin + 4}" width="${width - margin * 2 - 8}" height="${height - margin * 2 - 8}" class="draw-inner-border" />

  <!-- 顶部水单标志与声明 -->
  <g transform="translate(${margin + 16}, ${margin + 24})">
    <text class="draw-text draw-title" x="0" y="0">自动报价确认结构示意图</text>
    <rect x="180" y="-12" width="130" height="18" rx="3" fill="#eff6ff" stroke="#bfdbfe" />
    <text class="draw-text draw-badge" x="186" y="1" fill="#1d4ed8">报价参考 · 非生产工程图</text>
    <text class="draw-text draw-subtext" x="0" y="18">接线针位顺序、剥皮公差及生产技术要求以正式施工图为准</text>
  </g>

  <!-- 绘图主区域 -->

  <!-- 1. 尺寸标注线 (上方) -->
  <g transform="translate(0, ${cy - 85})">
    <!-- 端点延伸界线 -->
    <line x1="${connAX - 20}" y1="0" x2="${connAX - 20}" y2="55" stroke="#94a3b8" stroke-dasharray="3 2" stroke-width="0.8" />
    <line x1="${connBX + 20}" y1="0" x2="${connBX + 20}" y2="55" stroke="#94a3b8" stroke-dasharray="3 2" stroke-width="0.8" />
    <!-- 标注双向箭头线 -->
    <line x1="${connAX - 16}" y1="12" x2="${connBX + 16}" y2="12" stroke="#2563eb" stroke-width="1.2" marker-start="url(#arrowL)" marker-end="url(#arrowR)" />
    <!-- 标注尺寸文字 -->
    <rect x="${(connAX + connBX) / 2 - 95}" y="2" width="190" height="20" rx="3" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.8" />
    <text class="draw-text draw-dim" x="${(connAX + connBX) / 2}" y="16" text-anchor="middle">
      报价线长 L = ${form.lengthMm} mm
    </text>
  </g>

  <!-- 2. 中间线材主体 (主电缆) -->
  <g>
    <!-- 线材外被 -->
    <rect x="${cableStartX}" y="${cy - 12}" width="${cableEndX - cableStartX}" height="24" rx="4" fill="url(#cableGrad)" stroke="#0f172a" stroke-width="1" />
    <!-- 线材中央反光线 -->
    <line x1="${cableStartX}" y1="${cy - 4}" x2="${cableEndX}" y2="${cy - 4}" stroke="#64748b" stroke-width="1.5" stroke-opacity="0.6" />
    <!-- 线材规格标签 (线缆下方) -->
    <g transform="translate(${(cableStartX + cableEndX) / 2}, ${cy + 26})">
      <rect x="-160" y="0" width="320" height="26" rx="4" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.8" />
      <text class="draw-text draw-label" x="0" y="17" text-anchor="middle" font-weight="500">
        线材：${escapeXml(wireSpecText)}
      </text>
    </g>
  </g>

  <!-- 3. A 端结构 (左侧) -->
  <g transform="translate(${connAX}, ${cy})">
    <!-- 外模成型 (若有) -->
    ${
      form.outerMoldType === 'pvc-45p' && overmold
        ? `<rect x="35" y="-18" width="55" height="36" rx="3" fill="url(#moldGrad)" stroke="#0f172a" stroke-width="1" />
           <line x1="42" y1="-18" x2="42" y2="18" stroke="#475569" stroke-width="1" />
           <line x1="48" y1="-18" x2="48" y2="18" stroke="#475569" stroke-width="1" />
           <text class="draw-text draw-subtext" x="62" y="30" text-anchor="middle" font-size="9">PVC 45P 外模</text>`
        : ''
    }

    <!-- 连接器外壳 (主体) -->
    <rect x="-65" y="-28" width="100" height="56" rx="6" fill="#e2e8f0" stroke="#334155" stroke-width="1.5" />
    <!-- 金属螺母/锁扣装饰 -->
    <rect x="15" y="-22" width="20" height="44" rx="2" fill="#94a3b8" stroke="#475569" stroke-width="1" />
    <line x1="20" y1="-22" x2="20" y2="22" stroke="#64748b" stroke-width="1" />
    <line x1="25" y1="-22" x2="25" y2="22" stroke="#64748b" stroke-width="1" />
    <line x1="30" y1="-22" x2="30" y2="22" stroke="#64748b" stroke-width="1" />
    <!-- 前端插头面 -->
    <rect x="-85" y="-18" width="20" height="36" rx="3" fill="#cbd5e1" stroke="#475569" stroke-width="1" />

    <!-- A 端标签 -->
    <text class="draw-text draw-badge" x="-15" y="-36" text-anchor="middle" fill="#2563eb">【A 端】</text>
    <text class="draw-text draw-label" x="-15" y="-3" text-anchor="middle" font-weight="600">${escapeXml(connA?.name ?? 'A端连接器')}</text>
    <text class="draw-text draw-subtext" x="-15" y="13" text-anchor="middle">${connA ? `${connA.pinCount} Pin · ${connA.type === 'male' ? '公头' : connA.type === 'female' ? '母头' : '插座'}` : '待选择'}</text>
    <text class="draw-text draw-subtext" x="-15" y="50" text-anchor="middle">型号: ${escapeXml(connA?.model || connA?.series || '-')}</text>
  </g>

  <!-- 4. B 端结构 (右侧) -->
  <g transform="translate(${connBX}, ${cy})">
    ${
      form.endpointBType === 'connector' && connB
        ? `
          <!-- B 端外模成型 (若有且配置了2端) -->
          ${
            form.outerMoldType === 'pvc-45p' && overmold
              ? `<rect x="-90" y="-18" width="55" height="36" rx="3" fill="url(#moldGrad)" stroke="#0f172a" stroke-width="1" />
                 <line x1="-48" y1="-18" x2="-48" y2="18" stroke="#475569" stroke-width="1" />
                 <line x1="-42" y1="-18" x2="-42" y2="18" stroke="#475569" stroke-width="1" />
                 <text class="draw-text draw-subtext" x="-62" y="30" text-anchor="middle" font-size="9">PVC 45P 外模</text>`
              : ''
          }
          <!-- 连接器主体 -->
          <rect x="-35" y="-28" width="100" height="56" rx="6" fill="#e2e8f0" stroke="#334155" stroke-width="1.5" />
          <!-- 金属螺母/锁扣装饰 -->
          <rect x="-35" y="-22" width="20" height="44" rx="2" fill="#94a3b8" stroke="#475569" stroke-width="1" />
          <line x1="-30" y1="-22" x2="-30" y2="22" stroke="#64748b" stroke-width="1" />
          <line x1="-25" y1="-22" x2="-25" y2="22" stroke="#64748b" stroke-width="1" />
          <line x1="-20" y1="-22" x2="-20" y2="22" stroke="#64748b" stroke-width="1" />
          <!-- 前端插头面 -->
          <rect x="65" y="-18" width="20" height="36" rx="3" fill="#cbd5e1" stroke="#475569" stroke-width="1" />

          <!-- B 端标签 -->
          <text class="draw-text draw-badge" x="15" y="-36" text-anchor="middle" fill="#2563eb">【B 端】</text>
          <text class="draw-text draw-label" x="15" y="-3" text-anchor="middle" font-weight="600">${escapeXml(connB.name)}</text>
          <text class="draw-text draw-subtext" x="15" y="13" text-anchor="middle">${connB.pinCount} Pin · ${connB.type === 'male' ? '公头' : connB.type === 'female' ? '母头' : '插座'}</text>
          <text class="draw-text draw-subtext" x="15" y="50" text-anchor="middle">型号: ${escapeXml(connB.model || connB.series || '-')}</text>
        `
        : form.endpointBType === 'cut'
          ? `
          <!-- B 端切断平齐示意 -->
          <line x1="-90" y1="-24" x2="-90" y2="24" stroke="#dc2626" stroke-width="2" stroke-dasharray="4 3" />
          <path d="M-88,-20 L-80,-24 M-88,20 L-80,24" stroke="#dc2626" stroke-width="1.5" />
          <rect x="-80" y="-20" width="85" height="40" rx="4" fill="#fef2f2" stroke="#fecaca" stroke-width="0.8" />
          <text class="draw-text draw-badge" x="-38" y="-32" text-anchor="middle" fill="#dc2626">【B 端】</text>
          <text class="draw-text draw-label" x="-38" y="-2" text-anchor="middle" fill="#b91c1c" font-weight="600">切断平齐</text>
          <text class="draw-text draw-subtext" x="-38" y="12" text-anchor="middle" font-size="10" fill="#ef4444">无加工 / 无连接器</text>
        `
          : `
          <!-- B 端剥皮沾锡示意 -->
          <g>
            <line x1="-90" y1="-8" x2="-50" y2="-8" stroke="#3b82f6" stroke-width="2" />
            <line x1="-90" y1="0" x2="-45" y2="0" stroke="#ef4444" stroke-width="2" />
            <line x1="-90" y1="8" x2="-50" y2="8" stroke="#10b981" stroke-width="2" />
            <circle cx="-45" cy="-8" r="3" fill="#cbd5e1" stroke="#64748b" />
            <circle cx="-40" cy="0" r="3" fill="#cbd5e1" stroke="#64748b" />
            <circle cx="-45" cy="8" r="3" fill="#cbd5e1" stroke="#64748b" />
            <rect x="-35" y="-20" width="90" height="40" rx="4" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.8" />
            <text class="draw-text draw-badge" x="10" y="-32" text-anchor="middle" fill="#64748b">【B 端】</text>
            <text class="draw-text draw-label" x="10" y="-2" text-anchor="middle" font-weight="600">剥皮沾锡</text>
            <text class="draw-text draw-subtext" x="10" y="12" text-anchor="middle" font-size="10" fill="#f59e0b">不成型</text>
          </g>
        `
    }
  </g>

  <!-- 5. 下方：物料清单 (BOM) 表格 -->
  <g transform="translate(${margin + 16}, ${height - 230})">
    <text class="draw-text draw-badge" x="0" y="-8" fill="#334155">结构物料清单（BOM 清单）</text>
    <!-- 表头 -->
    <rect x="0" y="0" width="560" height="22" class="table-header" />
    <line x1="0" y1="22" x2="560" y2="22" class="table-border" />
    <text class="draw-text table-text" x="10" y="15" font-weight="600">序号</text>
    <text class="draw-text table-text" x="45" y="15" font-weight="600">物料名称</text>
    <text class="draw-text table-text" x="220" y="15" font-weight="600">规格型号</text>
    <text class="draw-text table-text" x="420" y="15" font-weight="600">用量</text>
    <text class="draw-text table-text" x="470" y="15" font-weight="600">单位</text>
    <text class="draw-text table-text" x="515" y="15" font-weight="600">说明</text>

    <!-- 表行数据 -->
    ${bomRows
      .map(
        (row, i) => `
      <g transform="translate(0, ${22 + i * 20})">
        <rect x="0" y="0" width="560" height="20" fill="${i % 2 === 1 ? '#f8fafc' : '#ffffff'}" />
        <line x1="0" y1="20" x2="560" y2="20" class="table-border" />
        <text class="draw-text table-text" x="14" y="14">${row.no}</text>
        <text class="draw-text table-text" x="45" y="14">${escapeXml(row.name.slice(0, 15))}</text>
        <text class="draw-text table-text" x="220" y="14">${escapeXml(row.model.slice(0, 24))}</text>
        <text class="draw-text table-text" x="425" y="14">${row.qty}</text>
        <text class="draw-text table-text" x="473" y="14">${row.unit}</text>
        <text class="draw-text table-text" x="515" y="14">${escapeXml(row.note)}</text>
      </g>`,
      )
      .join('')}
  </g>

  <!-- 6. 下方左侧：技术与核算说明 -->
  <g transform="translate(${margin + 16}, ${height - 85})">
    <text class="draw-text draw-badge" x="0" y="0" fill="#475569">技术要求与报价说明：</text>
    <text class="draw-text draw-subtext" x="0" y="16">1. 本图为自动报价及结构确认示意图，未定义线序对应与剥皮公差，不作为直接生产图纸。</text>
    <text class="draw-text draw-subtext" x="0" y="32">2. 线长取报价参考线长 ${form.lengthMm}mm，交货数量为 ${form.quantity} 条。</text>
    <text class="draw-text draw-subtext" x="0" y="48">3. 单价含税含运费，基于当前材料价格库与标准加工工时基准实时核算。</text>
  </g>

  <!-- 7. 下方右侧：标准标题栏 (Title Block) -->
  <g transform="translate(${width - margin - 340}, ${height - margin - 110})">
    <rect x="0" y="0" width="340" height="110" fill="#f8fafc" stroke="#1e293b" stroke-width="1.2" />
    <line x1="0" y1="36" x2="340" y2="36" stroke="#1e293b" stroke-width="0.8" />
    <line x1="0" y1="72" x2="340" y2="72" stroke="#1e293b" stroke-width="0.8" />
    <line x1="180" y1="36" x2="180" y2="110" stroke="#1e293b" stroke-width="0.8" />

    <!-- 标题行 -->
    <text class="draw-text draw-label" x="12" y="18" font-size="10" fill="#64748b">产品图名：</text>
    <text class="draw-text draw-title" x="12" y="30" font-size="12">${escapeXml(title.slice(0, 26))}</text>

    <!-- 中间行 -->
    <text class="draw-text draw-subtext" x="12" y="52">图号/编号：AUTO-QT-${form.lengthMm}-${form.quantity}</text>
    <text class="draw-text draw-subtext" x="12" y="65">版次：A (初版)</text>

    <text class="draw-text draw-subtext" x="190" y="52">图纸类型：报价确认图</text>
    <text class="draw-text draw-subtext" x="190" y="65">比例：示意图 (NTS)</text>

    <!-- 底行 -->
    <text class="draw-text draw-subtext" x="12" y="88">核算日期：${dateStr}</text>
    <text class="draw-text draw-subtext" x="12" y="102">订单数量：${form.quantity} PCS</text>

    <text class="draw-text draw-subtext" x="190" y="88">审核：在线自动核算</text>
    <text class="draw-text draw-subtext" x="190" y="102">单位：mm / 元</text>
  </g>

</svg>`;
}

export function downloadAutoQuoteDrawingSvg(
  form: AutoQuoteFormState,
  catalog: CatalogSnapshot | null,
  filename?: string,
) {
  const svg = generateAutoQuoteDrawingSvg(form, catalog);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const finalFilename = safeFilename(filename || `报价确认图_${form.lengthMm}mm`);
  downloadBlob(blob, `${finalFilename}.svg`);
}

export async function downloadAutoQuoteDrawingPng(
  form: AutoQuoteFormState,
  catalog: CatalogSnapshot | null,
  filename?: string,
): Promise<void> {
  const svg = generateAutoQuoteDrawingSvg(form, catalog);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('PNG 渲染失败'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = 2000;
  canvas.height = 1300;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D 不可用');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((res) => (res ? resolve(res) : reject(new Error('PNG 编码失败'))), 'image/png');
  });

  const finalFilename = safeFilename(filename || `报价确认图_${form.lengthMm}mm`);
  downloadBlob(blob, `${finalFilename}.png`);
}

export async function downloadAutoQuoteDrawingPdf(
  form: AutoQuoteFormState,
  catalog: CatalogSnapshot | null,
  filename?: string,
): Promise<void> {
  const svg = generateAutoQuoteDrawingSvg(form, catalog);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('PDF 画布渲染失败'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = 2000;
  canvas.height = 1300;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D 不可用');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const jpeg = binaryString(canvas.toDataURL('image/jpeg', 0.95));
  const pdfBytes = buildImagePdf(jpeg, canvas.width, canvas.height);
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);

  const finalFilename = safeFilename(filename || `报价确认图_${form.lengthMm}mm`);
  downloadBlob(new Blob([pdfBuffer], { type: 'application/pdf' }), `${finalFilename}.pdf`);
}
