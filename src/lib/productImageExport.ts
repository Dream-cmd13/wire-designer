import html2canvas from 'html2canvas-pro';
import { safeFilename } from '@/lib/designFile';
import { binaryString, buildImagePdf } from '@/lib/drawingExport';
import type { HarnessConfig, ProductionDrawingFrame } from '@/types/harness';

export function getProductDrawingFilename(
  config: HarnessConfig,
  frame: ProductionDrawingFrame,
  extension: 'png' | 'pdf',
): string {
  const baseName = frame.drawingNo?.trim() || config.name?.trim() || '线束成品图';
  return `${safeFilename(baseName)}_成品图.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function renderTwoDViewToCanvas(
  worldElement: HTMLElement,
  scale: number = 2,
): Promise<HTMLCanvasElement> {
  const canvas = await html2canvas(worldElement, {
    scale,
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff',
    useCORS: true,
    allowTaint: false,
    logging: false,
    onclone: (clonedDoc) => {
      const clonedWorld = (clonedDoc.querySelector('[data-drawing-world="true"]') ||
        clonedDoc.body.querySelector('[data-drawing-world="true"]')) as HTMLElement | null;

      if (clonedWorld) {
        clonedWorld.style.transform = 'none';
        clonedWorld.style.position = 'relative';
        clonedWorld.style.left = '0px';
        clonedWorld.style.top = '0px';
        clonedWorld.style.opacity = '1';
        clonedWorld.style.margin = '0px';

        // Hide edit info boxes if any
        const infoBoxes = clonedWorld.querySelectorAll('.absolute.top-full');
        infoBoxes.forEach((el) => el.remove());

        // Hide drag handle badges
        const handleBadges = clonedWorld.querySelectorAll('.group-hover\\:block');
        handleBadges.forEach((el) => el.remove());

        // Remove dashed borders on assemblies
        const assemblies = clonedWorld.querySelectorAll('.group\\/assembly');
        assemblies.forEach((el) => {
          (el as HTMLElement).style.border = 'none';
          (el as HTMLElement).style.backgroundColor = 'transparent';
        });
      }
    },
  });

  return canvas;
}

export async function exportProductDrawingPng(
  worldElement: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await renderTwoDViewToCanvas(worldElement, 2);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('PNG 编码失败'))),
      'image/png',
    );
  });
  downloadBlob(blob, filename.endsWith('.png') ? filename : `${filename}.png`);
}

export async function exportProductDrawingPdf(
  worldElement: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await renderTwoDViewToCanvas(worldElement, 2);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const jpegBytes = binaryString(jpegDataUrl);
  const pdfBytes = buildImagePdf(jpegBytes, canvas.width, canvas.height);
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
