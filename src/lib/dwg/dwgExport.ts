import { safeFilename } from '@/lib/designFile';
import { binaryString, buildImagePdf, downloadBlob } from '@/lib/drawingExport';
import { fitView } from '@/lib/dwg/dwgView';
import { renderDwgToCanvas } from '@/lib/dwg/renderDwg';
import type { DwgDrawing } from '@/lib/dwg/dwgTypes';

/** 与 buildImagePdf 的 A4 横向内容区（802 x 535pt）保持 4 倍比例，避免拉伸变形。 */
const EXPORT_WIDTH = 3208;
const EXPORT_HEIGHT = 2140;
const EXPORT_PADDING = 40;
const EXPORT_LINE_WIDTH = 3;

export interface DwgExportOptions {
  background?: string;
  hiddenLayers?: ReadonlySet<string>;
}

function renderDrawingToCanvas(drawing: DwgDrawing, options: DwgExportOptions = {}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D 不可用');
  const view = fitView(drawing.bounds, { width: EXPORT_WIDTH, height: EXPORT_HEIGHT }, EXPORT_PADDING);
  renderDwgToCanvas(context, drawing, {
    ...view,
    lineWidth: EXPORT_LINE_WIDTH,
    background: options.background ?? '#ffffff',
    hiddenLayers: options.hiddenLayers,
  });
  return canvas;
}

function exportFilename(drawing: DwgDrawing, extension: 'pdf' | 'png'): string {
  const base = drawing.fileName.replace(/\.dwg$/i, '');
  return `${safeFilename(`${base}_DWG`)}.${extension}`;
}

export async function exportDwgPdf(drawing: DwgDrawing, options: DwgExportOptions = {}): Promise<void> {
  const canvas = renderDrawingToCanvas(drawing, options);
  const jpeg = binaryString(canvas.toDataURL('image/jpeg', 0.92));
  const pdfBytes = buildImagePdf(jpeg, canvas.width, canvas.height);
  const buffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(buffer).set(pdfBytes);
  downloadBlob(new Blob([buffer], { type: 'application/pdf' }), exportFilename(drawing, 'pdf'));
}

export async function exportDwgPng(drawing: DwgDrawing, options: DwgExportOptions = {}): Promise<void> {
  const canvas = renderDrawingToCanvas(drawing, options);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG 编码失败'))), 'image/png');
  });
  downloadBlob(blob, exportFilename(drawing, 'png'));
}
