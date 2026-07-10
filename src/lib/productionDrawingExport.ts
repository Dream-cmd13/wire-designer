import { downloadTextFile, safeFilename } from '@/lib/designFile';
import type { HarnessConfig, ProductionDrawingObject } from '@/types/harness';

function escapeXml(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function asciiText(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function renderConnectorSvg(object: Extract<ProductionDrawingObject, { kind: 'connector' }>) {
  const pins = Array.from({ length: Math.min(object.pinCount, 40) }, (_, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cx = object.x + 18 + column * 62;
    const cy = object.y + 34 + row * 9;
    return [
      `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#111827" />`,
      `<text x="${cx + 7}" y="${cy + 3}" font-size="8">${index + 1}</text>`,
    ].join('');
  }).join('');

  return [
    `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" rx="4" fill="#fff" stroke="#111827" />`,
    `<line x1="${object.x}" y1="${object.y + 24}" x2="${object.x + object.width}" y2="${object.y + 24}" stroke="#111827" />`,
    `<text x="${object.x + 8}" y="${object.y + 16}" font-size="11" font-weight="700">${escapeXml(object.label)}</text>`,
    pins,
  ].join('');
}

function renderWireBundleSvg(object: Extract<ProductionDrawingObject, { kind: 'wire-bundle' }>) {
  const centerY = object.y + object.height / 2;
  const lines = Array.from({ length: Math.min(object.wireCount, 12) }, (_, index) => {
    const y = object.y + object.height * 0.25 + index * 5;
    return `<line x1="${object.x}" y1="${y}" x2="${object.x + object.width}" y2="${y}" stroke="#334155" stroke-width="1" />`;
  }).join('');

  return [
    `<rect x="${object.x}" y="${centerY - 16}" width="${object.width}" height="32" rx="16" fill="#f1f5f9" stroke="#111827" />`,
    lines,
    `<text x="${object.x + object.width / 2}" y="${centerY + 36}" text-anchor="middle" font-size="11">${object.jacketed ? '多芯线束' : '电子线束'} · ${object.wireCount}芯</text>`,
  ].join('');
}

function renderDimensionSvg(object: Extract<ProductionDrawingObject, { kind: 'dimension' }>) {
  const y = object.y + 18;
  return [
    `<line x1="${object.x}" y1="${y}" x2="${object.x + object.width}" y2="${y}" stroke="#111827" />`,
    `<line x1="${object.x}" y1="${y - 8}" x2="${object.x}" y2="${y + 8}" stroke="#111827" />`,
    `<line x1="${object.x + object.width}" y1="${y - 8}" x2="${object.x + object.width}" y2="${y + 8}" stroke="#111827" />`,
    `<rect x="${object.x + object.width / 2 - 45}" y="${y - 13}" width="90" height="18" fill="#fff" />`,
    `<text x="${object.x + object.width / 2}" y="${y}" text-anchor="middle" font-size="12" font-weight="700">${escapeXml(object.label)}</text>`,
  ].join('');
}

function renderTechRequirementsSvg(object: Extract<ProductionDrawingObject, { kind: 'tech-requirements' }>) {
  const rows = object.requirements.map((item, index) => (
    `<text x="${object.x + 10}" y="${object.y + 34 + index * 18}" font-size="11">${index + 1}. ${escapeXml(item)}</text>`
  )).join('');
  return [
    `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="#fff" stroke="#111827" />`,
    `<text x="${object.x + 10}" y="${object.y + 18}" font-size="12" font-weight="700">技术要求</text>`,
    rows,
  ].join('');
}

function renderBomTableSvg(object: Extract<ProductionDrawingObject, { kind: 'bom-table' }>) {
  const headerY = object.y + 20;
  const rows = object.rows.slice(0, 6).map((row, index) => {
    const y = headerY + 20 + index * 20;
    return [
      `<line x1="${object.x}" y1="${y - 14}" x2="${object.x + object.width}" y2="${y - 14}" stroke="#cbd5e1" />`,
      `<text x="${object.x + 12}" y="${y}" font-size="10">${row.item}</text>`,
      `<text x="${object.x + 54}" y="${y}" font-size="10">${escapeXml(row.description).slice(0, 72)}</text>`,
      `<text x="${object.x + object.width - 36}" y="${y}" font-size="10">${row.quantity}</text>`,
    ].join('');
  }).join('');

  return [
    `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="#fff" stroke="#111827" />`,
    `<line x1="${object.x + 44}" y1="${object.y}" x2="${object.x + 44}" y2="${object.y + object.height}" stroke="#111827" />`,
    `<line x1="${object.x + object.width - 56}" y1="${object.y}" x2="${object.x + object.width - 56}" y2="${object.y + object.height}" stroke="#111827" />`,
    `<line x1="${object.x}" y1="${headerY}" x2="${object.x + object.width}" y2="${headerY}" stroke="#111827" />`,
    `<text x="${object.x + 12}" y="${object.y + 14}" font-size="10" font-weight="700">序号</text>`,
    `<text x="${object.x + 54}" y="${object.y + 14}" font-size="10" font-weight="700">物料描述</text>`,
    `<text x="${object.x + object.width - 42}" y="${object.y + 14}" font-size="10" font-weight="700">数量</text>`,
    rows,
  ].join('');
}

function renderWiringTableSvg(object: Extract<ProductionDrawingObject, { kind: 'wiring-table' }>) {
  const headerY = object.y + 20;
  const columns = [
    object.x + 34,
    object.x + 92,
    object.x + 230,
    object.x + 292,
    object.x + 350,
    object.x + 408,
  ];
  const rows = object.rows.slice(0, 5).map((row, index) => {
    const y = headerY + 18 + index * 16;
    return [
      `<line x1="${object.x}" y1="${y - 11}" x2="${object.x + object.width}" y2="${y - 11}" stroke="#cbd5e1" />`,
      `<text x="${object.x + 10}" y="${y}" font-size="8">${row.item}</text>`,
      `<text x="${object.x + 42}" y="${y}" font-size="8">${escapeXml(row.color.slice(0, 10))}</text>`,
      `<text x="${object.x + 100}" y="${y}" font-size="8">${escapeXml(row.signalName.slice(0, 24))}</text>`,
      `<text x="${object.x + 238}" y="${y}" font-size="8">${escapeXml(row.connectionNo)}</text>`,
      `<text x="${object.x + 300}" y="${y}" font-size="8">${row.startPin ?? '-'}</text>`,
      `<text x="${object.x + 358}" y="${y}" font-size="8">${row.endPin ?? '-'}</text>`,
      `<text x="${object.x + 416}" y="${y}" font-size="8">${row.lengthMm ? `${row.lengthMm}mm` : '-'}</text>`,
    ].join('');
  }).join('');

  return [
    `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="#fff" stroke="#111827" />`,
    ...columns.map((x) =>
      `<line x1="${x}" y1="${object.y}" x2="${x}" y2="${object.y + object.height}" stroke="#111827" />`),
    `<line x1="${object.x}" y1="${headerY}" x2="${object.x + object.width}" y2="${headerY}" stroke="#111827" />`,
    `<text x="${object.x + 10}" y="${object.y + 14}" font-size="9" font-weight="700">No.</text>`,
    `<text x="${object.x + 42}" y="${object.y + 14}" font-size="9" font-weight="700">Color</text>`,
    `<text x="${object.x + 100}" y="${object.y + 14}" font-size="9" font-weight="700">Wire No.</text>`,
    `<text x="${object.x + 238}" y="${object.y + 14}" font-size="9" font-weight="700">Conn.</text>`,
    `<text x="${object.x + 300}" y="${object.y + 14}" font-size="9" font-weight="700">Start</text>`,
    `<text x="${object.x + 358}" y="${object.y + 14}" font-size="9" font-weight="700">End</text>`,
    `<text x="${object.x + 416}" y="${object.y + 14}" font-size="9" font-weight="700">Length</text>`,
    rows,
  ].join('');
}

function renderTitleBlockSvg(object: Extract<ProductionDrawingObject, { kind: 'title-block' }>) {
  return [
    `<rect x="${object.x}" y="${object.y}" width="${object.width}" height="${object.height}" fill="#fff" stroke="#111827" />`,
    `<line x1="${object.x + object.width - 80}" y1="${object.y}" x2="${object.x + object.width - 80}" y2="${object.y + object.height}" stroke="#111827" />`,
    `<text x="${object.x + 10}" y="${object.y + 20}" font-size="12" font-weight="700">${escapeXml(object.title)}</text>`,
    `<text x="${object.x + 10}" y="${object.y + 42}" font-size="10">图号：${escapeXml(object.drawingNo)}</text>`,
    `<text x="${object.x + object.width - 70}" y="${object.y + 32}" font-size="10">版本：${escapeXml(object.revision)}</text>`,
  ].join('');
}

function renderObjectSvg(object: ProductionDrawingObject): string {
  switch (object.kind) {
    case 'connector':
      return renderConnectorSvg(object);
    case 'wire-bundle':
      return renderWireBundleSvg(object);
    case 'dimension':
      return renderDimensionSvg(object);
    case 'tech-requirements':
      return renderTechRequirementsSvg(object);
    case 'bom-table':
      return renderBomTableSvg(object);
    case 'wiring-table':
      return renderWiringTableSvg(object);
    case 'title-block':
      return renderTitleBlockSvg(object);
    case 'text':
      return `<text x="${object.x}" y="${object.y}" font-size="${object.fontSize}">${escapeXml(object.text)}</text>`;
    default:
      return '';
  }
}

export function serializeProductionDrawingSvg(config: HarnessConfig): string {
  const drawing = config.productionDrawing;
  if (!drawing) {
    throw new Error('Production drawing has not been generated');
  }

  const { width, height } = drawing.page;
  const objects = drawing.objects.map(renderObjectSvg).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<style>text{font-family:Arial,"Microsoft YaHei",sans-serif;fill:#111827}</style>',
    '<rect width="100%" height="100%" fill="#fff" />',
    '<rect x="20" y="20" width="1160" height="760" fill="none" stroke="#111827" />',
    objects,
    '</svg>',
  ].join('\n');
}

function pdfY(pageHeight: number, y: number) {
  return pageHeight - y;
}

function pdfRect(pageHeight: number, x: number, y: number, width: number, height: number, mode = 'S') {
  return `${x.toFixed(2)} ${(pageHeight - y - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${mode}`;
}

function pdfLine(pageHeight: number, x1: number, y1: number, x2: number, y2: number) {
  return `${x1.toFixed(2)} ${pdfY(pageHeight, y1).toFixed(2)} m ${x2.toFixed(2)} ${pdfY(pageHeight, y2).toFixed(2)} l S`;
}

function pdfText(pageHeight: number, x: number, y: number, text: string, size = 10) {
  return `BT /F1 ${size} Tf ${x.toFixed(2)} ${pdfY(pageHeight, y).toFixed(2)} Td (${asciiText(text)}) Tj ET`;
}

function renderObjectPdf(object: ProductionDrawingObject, pageHeight: number): string[] {
  if (object.kind === 'connector') {
    const pinRows = Array.from({ length: Math.min(object.pinCount, 40) }, (_, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = object.x + 18 + column * 62;
      const y = object.y + 37 + row * 9;
      return pdfText(pageHeight, x, y, String(index + 1), 7);
    });
    return [
      pdfRect(pageHeight, object.x, object.y, object.width, object.height),
      pdfLine(pageHeight, object.x, object.y + 24, object.x + object.width, object.y + 24),
      pdfText(pageHeight, object.x + 8, object.y + 16, object.label, 10),
      ...pinRows,
    ];
  }

  if (object.kind === 'wire-bundle') {
    const centerY = object.y + object.height / 2;
    const lines = Array.from({ length: Math.min(object.wireCount, 12) }, (_, index) => {
      const y = object.y + object.height * 0.25 + index * 5;
      return pdfLine(pageHeight, object.x, y, object.x + object.width, y);
    });
    return [
      pdfRect(pageHeight, object.x, centerY - 16, object.width, 32),
      ...lines,
      pdfText(pageHeight, object.x + object.width / 2 - 35, centerY + 36, `${object.jacketed ? 'Jacketed' : 'Wire'} ${object.wireCount} cores`, 10),
    ];
  }

  if (object.kind === 'dimension') {
    const y = object.y + 18;
    return [
      pdfLine(pageHeight, object.x, y, object.x + object.width, y),
      pdfLine(pageHeight, object.x, y - 8, object.x, y + 8),
      pdfLine(pageHeight, object.x + object.width, y - 8, object.x + object.width, y + 8),
      pdfText(pageHeight, object.x + object.width / 2 - 25, y - 2, object.label, 11),
    ];
  }

  if (object.kind === 'tech-requirements') {
    return [
      pdfRect(pageHeight, object.x, object.y, object.width, object.height),
      pdfText(pageHeight, object.x + 10, object.y + 18, 'Technical Requirements', 11),
      ...object.requirements.map((item, index) =>
        pdfText(pageHeight, object.x + 10, object.y + 36 + index * 16, `${index + 1}. ${item}`, 9)),
    ];
  }

  if (object.kind === 'bom-table') {
    const rows = object.rows.slice(0, 6).flatMap((row, index) => {
      const y = object.y + 40 + index * 18;
      return [
        pdfLine(pageHeight, object.x, y - 12, object.x + object.width, y - 12),
        pdfText(pageHeight, object.x + 12, y, String(row.item), 8),
        pdfText(pageHeight, object.x + 54, y, row.description.slice(0, 54), 8),
        pdfText(pageHeight, object.x + object.width - 36, y, String(row.quantity), 8),
      ];
    });
    return [
      pdfRect(pageHeight, object.x, object.y, object.width, object.height),
      pdfLine(pageHeight, object.x + 44, object.y, object.x + 44, object.y + object.height),
      pdfLine(pageHeight, object.x + object.width - 56, object.y, object.x + object.width - 56, object.y + object.height),
      pdfLine(pageHeight, object.x, object.y + 20, object.x + object.width, object.y + 20),
      pdfText(pageHeight, object.x + 12, object.y + 14, 'No.', 8),
      pdfText(pageHeight, object.x + 54, object.y + 14, 'Description', 8),
      pdfText(pageHeight, object.x + object.width - 42, object.y + 14, 'Qty', 8),
      ...rows,
    ];
  }

  if (object.kind === 'wiring-table') {
    const columnXs = [
      object.x + 34,
      object.x + 92,
      object.x + 230,
      object.x + 292,
      object.x + 350,
      object.x + 408,
    ];
    const rows = object.rows.slice(0, 5).flatMap((row, index) => {
      const y = object.y + 36 + index * 16;
      return [
        pdfLine(pageHeight, object.x, y - 11, object.x + object.width, y - 11),
        pdfText(pageHeight, object.x + 10, y, String(row.item), 7),
        pdfText(pageHeight, object.x + 42, y, row.color.slice(0, 10), 7),
        pdfText(pageHeight, object.x + 100, y, row.signalName.slice(0, 24), 7),
        pdfText(pageHeight, object.x + 238, y, row.connectionNo, 7),
        pdfText(pageHeight, object.x + 300, y, row.startPin === undefined ? '-' : String(row.startPin), 7),
        pdfText(pageHeight, object.x + 358, y, row.endPin === undefined ? '-' : String(row.endPin), 7),
        pdfText(pageHeight, object.x + 416, y, row.lengthMm ? `${row.lengthMm}mm` : '-', 7),
      ];
    });
    return [
      pdfRect(pageHeight, object.x, object.y, object.width, object.height),
      ...columnXs.map((x) => pdfLine(pageHeight, x, object.y, x, object.y + object.height)),
      pdfLine(pageHeight, object.x, object.y + 20, object.x + object.width, object.y + 20),
      pdfText(pageHeight, object.x + 10, object.y + 14, 'No.', 7),
      pdfText(pageHeight, object.x + 42, object.y + 14, 'Color', 7),
      pdfText(pageHeight, object.x + 100, object.y + 14, 'Wire No.', 7),
      pdfText(pageHeight, object.x + 238, object.y + 14, 'Conn.', 7),
      pdfText(pageHeight, object.x + 300, object.y + 14, 'Start', 7),
      pdfText(pageHeight, object.x + 358, object.y + 14, 'End', 7),
      pdfText(pageHeight, object.x + 416, object.y + 14, 'Length', 7),
      ...rows,
    ];
  }

  if (object.kind === 'title-block') {
    return [
      pdfRect(pageHeight, object.x, object.y, object.width, object.height),
      pdfLine(pageHeight, object.x + object.width - 80, object.y, object.x + object.width - 80, object.y + object.height),
      pdfText(pageHeight, object.x + 10, object.y + 20, object.title, 11),
      pdfText(pageHeight, object.x + 10, object.y + 42, `Drawing: ${object.drawingNo}`, 9),
      pdfText(pageHeight, object.x + object.width - 70, object.y + 32, `Rev: ${object.revision}`, 9),
    ];
  }

  if (object.kind === 'text') {
    return [pdfText(pageHeight, object.x, object.y, object.text, object.fontSize)];
  }

  return [];
}

export function serializeProductionDrawingPdf(config: HarnessConfig): string {
  const drawing = config.productionDrawing;
  if (!drawing) {
    throw new Error('Production drawing has not been generated');
  }

  const { width, height } = drawing.page;
  const content = [
    '0.7 w',
    pdfRect(height, 20, 20, width - 40, height - 40),
    ...drawing.objects.flatMap((object) => renderObjectPdf(object, height)),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(chunks.join('').length);
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = chunks.join('').length;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return chunks.join('');
}

export function getProductionDrawingExportFilename(config: HarnessConfig, extension: 'svg' | 'png' | 'pdf'): string {
  return `${safeFilename(config.productionDrawing?.titleBlock.drawingNo ?? config.name)}.${extension}`;
}

export function downloadProductionDrawingSvg(config: HarnessConfig): void {
  downloadTextFile(
    serializeProductionDrawingSvg(config),
    getProductionDrawingExportFilename(config, 'svg'),
    'image/svg+xml;charset=utf-8',
  );
}

export function downloadProductionDrawingPdf(config: HarnessConfig): void {
  const pdf = serializeProductionDrawingPdf(config);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = getProductionDrawingExportFilename(config, 'pdf');
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadProductionDrawingPng(config: HarnessConfig): Promise<void> {
  const drawing = config.productionDrawing;
  if (!drawing) {
    throw new Error('Production drawing has not been generated');
  }

  const svg = serializeProductionDrawingSvg(config);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to render production drawing PNG'));
  });
  image.src = dataUrl;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = drawing.page.width;
  canvas.height = drawing.page.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Failed to encode production drawing PNG'));
    }, 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = getProductionDrawingExportFilename(config, 'png');
  anchor.click();
  URL.revokeObjectURL(url);
}
