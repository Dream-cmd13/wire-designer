import { safeFilename } from '@/lib/designFile';
import { getDrawingTableTextFontSize, resolveDrawingTableCells, resolveDrawingTableLayout } from '@/lib/drawingTableLayout';
import type { DrawingDocument, DrawingObject } from '@/types/drawing';

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[character] ?? character));
}

function svgObject(object: DrawingObject): string {
  const common = `transform="translate(${object.x} ${object.y}) rotate(${object.rotation} ${object.width / 2} ${object.height / 2})"`;
  const style = `fill="${object.style.fill}" stroke="${object.style.stroke}" stroke-width="${object.style.strokeWidth}"`;
  if (object.kind === 'text' || object.kind === 'label') {
    return `<text ${common} x="0" y="${object.style.fontSize}" font-size="${object.style.fontSize}" fill="${object.style.color}">${escapeXml(object.text)}</text>`;
  }
  if (object.kind === 'dimension') {
    return `<g ${common} ${style}><line x1="0" y1="${object.height / 2}" x2="${object.width}" y2="${object.height / 2}"/><line x1="0" y1="${object.height / 2 - 8}" x2="0" y2="${object.height / 2 + 8}"/><line x1="${object.width}" y1="${object.height / 2 - 8}" x2="${object.width}" y2="${object.height / 2 + 8}"/><text x="${object.width / 2}" y="${object.height / 2}" text-anchor="middle" font-size="${object.style.fontSize}" fill="${object.style.color}">${escapeXml(object.label)}</text></g>`;
  }
  if ((object.kind === 'line' || object.kind === 'polyline' || object.kind === 'curve' || object.kind === 'freehand') && object.points.length === 1) {
    const point = object.points[0];
    return `<circle cx="${point.x}" cy="${point.y}" r="${Math.max(1, object.style.strokeWidth / 2)}" fill="${object.style.stroke}"/>`;
  }
  if (object.kind === 'curve') {
    if (object.points.length < 2) return '';
    const commands = [`M ${object.points[0].x} ${object.points[0].y}`];
    for (let index = 1; index < object.points.length - 1; index += 1) {
      const point = object.points[index];
      const next = object.points[index + 1];
      commands.push(`Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`);
    }
    const last = object.points.at(-1)!;
    commands.push(`L ${last.x} ${last.y}`);
    return `<path d="${commands.join(' ')}" fill="none" stroke="${object.style.stroke}" stroke-width="${object.style.strokeWidth}"/>`;
  }
  if (object.kind === 'line' || object.kind === 'polyline' || object.kind === 'freehand') {
    const points = object.points.map((point) => `${point.x},${point.y}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${object.style.stroke}" stroke-width="${object.style.strokeWidth}"/>`;
  }
  if (object.kind === 'wire-bundle') {
    const lines = Array.from({ length: Math.min(12, object.wireCount) }, (_, index) => `<line x1="0" y1="${object.height * 0.25 + index * 5}" x2="${object.width}" y2="${object.height * 0.25 + index * 5}"/>`).join('');
    return `<g ${common} ${style}><rect x="0" y="${object.height / 2 - 16}" width="${object.width}" height="32" rx="16"/><g fill="none">${lines}</g><text x="8" y="${object.height - 5}" font-size="${object.style.fontSize}" fill="${object.style.color}" stroke="none">${escapeXml(object.label)} · ${object.wireCount}芯</text></g>`;
  }
  if (object.kind === 'connector') {
    const pins = Array.from({ length: Math.min(40, object.pinCount) }, (_, index) => `<text x="${18 + (index % 2) * 65}" y="${45 + Math.floor(index / 2) * 9}" font-size="9" fill="${object.style.color}" stroke="none">${index + 1}</text>`).join('');
    return `<g ${common} ${style}><rect width="${object.width}" height="${object.height}"/><line x1="0" y1="25" x2="${object.width}" y2="25"/><text x="8" y="18" font-size="${object.style.fontSize}" fill="${object.style.color}" stroke="none">${escapeXml(object.label)}</text>${pins}</g>`;
  }
  if (object.kind === 'tech-requirements') {
    const requirements = object.requirements.map((item, index) => `<text x="10" y="${38 + index * 18}" font-size="${object.style.fontSize}" fill="${object.style.color}" stroke="none">${index + 1}. ${escapeXml(item)}</text>`).join('');
    return `<g ${common} ${style}><rect width="${object.width}" height="${object.height}"/><text x="10" y="18" font-size="${object.style.fontSize}" fill="${object.style.color}" stroke="none">技术要求</text>${requirements}</g>`;
  }
  if (object.kind === 'title-block') {
    return `<g ${common} ${style}><rect width="${object.width}" height="${object.height}"/><line x1="${object.width - 80}" y1="0" x2="${object.width - 80}" y2="${object.height}"/><text x="10" y="20" font-size="${object.style.fontSize}" fill="${object.style.color}" stroke="none">${escapeXml(object.title)}</text><text x="10" y="42" font-size="10" fill="${object.style.color}" stroke="none">图号：${escapeXml(object.drawingNo)}</text><text x="${object.width - 70}" y="32" font-size="10" fill="${object.style.color}" stroke="none">版本：${escapeXml(object.revision)}</text></g>`;
  }
  if (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') {
    const layout = resolveDrawingTableLayout(object);
    const text = (key: string, value: string, x: number, baseline: number, fallbackSize: number, cellWidth: number) => {
      const offset = object.textOffsets?.[key] ?? { x: 0, y: 0 };
      const configuredFontSize = layout.textSizes[key]?.fontSize ?? fallbackSize;
      const fontSize = getDrawingTableTextFontSize(value, cellWidth, configuredFontSize);
      const fitAttributes = fontSize < configuredFontSize
        ? ` textLength="${Math.max(1, cellWidth - 8)}" lengthAdjust="spacingAndGlyphs"`
        : '';
      return `<text x="${x + offset.x}" y="${baseline + offset.y}" font-size="${fontSize}"${fitAttributes} fill="${object.style.color}" stroke="none">${escapeXml(value)}</text>`;
    };
    const title = layout.showTitleRow ? text('title', object.title, 5, layout.titleRowHeight - 6, object.style.fontSize, object.width) : '';
    const cells = resolveDrawingTableCells(object).map((cell) => {
      const projection = object.projectionCellKey === cell.key
        ? `<g data-projection-symbol="true" fill="none"><path d="M ${cell.x + cell.width * 0.16} ${cell.y + cell.height * 0.3} L ${cell.x + cell.width * 0.4} ${cell.y + cell.height * 0.38} L ${cell.x + cell.width * 0.4} ${cell.y + cell.height * 0.62} L ${cell.x + cell.width * 0.16} ${cell.y + cell.height * 0.7} Z"/><circle cx="${cell.x + cell.width * 0.82}" cy="${cell.y + cell.height / 2}" r="${Math.min(cell.width, cell.height) * 0.14}"/></g>`
        : text(cell.key, cell.value, cell.x + 5, cell.y + cell.height - 6, cell.header ? object.style.fontSize : Math.max(8, object.style.fontSize - 1), cell.width);
      return `<g data-table-cell="${cell.key}"><rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="none"/>${projection}</g>`;
    }).join('');
    const titleSeparator = layout.showTitleRow ? `<line x1="0" y1="${layout.titleRowHeight}" x2="${object.width}" y2="${layout.titleRowHeight}"/>` : '';
    return `<g ${common} ${style}><rect width="${object.width}" height="${object.height}"/>${titleSeparator}${title}${cells}</g>`;
  }
  if (object.kind === 'group') {
    const children = object.children.filter((child) => child.visible).sort((left, right) => left.zIndex - right.zIndex).map(svgObject).join('');
    return `<g ${common}>${children}</g>`;
  }
  if (object.kind === 'icon') {
    return `<g ${common} fill="none" stroke="${object.style.stroke}" stroke-width="${object.style.strokeWidth}" transform-origin="center"><path d="${escapeXml(object.svgPath)}" transform="scale(${object.width / 24} ${object.height / 24})"/></g>`;
  }
  const label = object.kind === 'accessory' ? object.label : '';
  return `<g ${common} ${style}><rect width="${object.width}" height="${object.height}"/><text x="6" y="${object.height / 2 + 4}" font-size="${object.style.fontSize}" fill="${object.style.color}" stroke="none">${escapeXml(label)}</text></g>`;
}

export function serializeDrawingSvg(drawing: DrawingDocument): string {
  const objects = drawing.objects.filter((object) => object.visible).sort((left, right) => left.zIndex - right.zIndex).map(svgObject).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.page.width}" height="${drawing.page.height}" viewBox="0 0 ${drawing.page.width} ${drawing.page.height}"><style>text{font-family:Arial,'Microsoft YaHei',sans-serif}</style><rect width="100%" height="100%" fill="#fff"/><rect x="20" y="20" width="${drawing.page.width - 40}" height="${drawing.page.height - 40}" fill="none" stroke="#111827"/>${objects}</svg>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getDrawingExportFilename(drawing: DrawingDocument, extension: string, requestedFilename?: string) {
  const requestedBase = requestedFilename?.trim().replace(new RegExp(`\\.${extension}$`, 'i'), '');
  return `${safeFilename(requestedBase || drawing.titleBlock.drawingNo || drawing.name)}.${extension}`;
}

export function downloadDrawingSvg(drawing: DrawingDocument) {
  downloadBlob(new Blob([serializeDrawingSvg(drawing)], { type: 'image/svg+xml;charset=utf-8' }), getDrawingExportFilename(drawing, 'svg'));
}

export async function downloadDrawingPng(drawing: DrawingDocument) {
  const image = new Image();
  const svg = serializeDrawingSvg(drawing);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('PNG 渲染失败')); });
  const canvas = document.createElement('canvas');
  canvas.width = drawing.page.width * 2;
  canvas.height = drawing.page.height * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D 不可用');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result: Blob | null) => result ? resolve(result) : reject(new Error('PNG 编码失败')), 'image/png'));
  downloadBlob(blob, getDrawingExportFilename(drawing, 'png'));
}

function binaryString(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.split(',')[1] ?? '');
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function buildImagePdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const push = (value: string | Uint8Array) => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const object = (id: number, body: string | Uint8Array, prefix = '') => {
    offsets[id] = length; push(`${id} 0 obj\n${prefix}`); push(body); push('\nendobj\n');
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = 'q\n802 0 0 535 20 30 cm\n/Im0 Do\nQ';
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const result = new Uint8Array(length); let cursor = 0;
  chunks.forEach((chunk) => { result.set(chunk, cursor); cursor += chunk.length; });
  return result;
}

export async function downloadDrawingPdf(drawing: DrawingDocument, requestedFilename?: string) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeDrawingSvg(drawing))}`;
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('PDF 画布渲染失败')); });
  const canvas = document.createElement('canvas');
  canvas.width = drawing.page.width * 2; canvas.height = drawing.page.height * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D 不可用');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpeg = binaryString(canvas.toDataURL('image/jpeg', 0.92));
  const pdfBytes = buildImagePdf(jpeg, canvas.width, canvas.height);
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  downloadBlob(new Blob([pdfBuffer], { type: 'application/pdf' }), getDrawingExportFilename(drawing, 'pdf', requestedFilename));
}
