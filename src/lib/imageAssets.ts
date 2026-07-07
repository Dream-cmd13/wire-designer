/**
 * Scans image files from the project root using Vite's import.meta.glob,
 * mirroring the pattern used by pdfDrawings.ts for PDF files.
 */

const imageModules = import.meta.glob(
  '../../*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}',
  { eager: true, query: '?url' },
) as Record<string, { default: string }>;

export interface ImageAsset {
  /** File path used as stable ID */
  id: string;
  /** Filename without extension */
  name: string;
  /** Resolved asset URL */
  url: string;
}

function extractName(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.[^.]+$/, '');
}

export const imageAssets: ImageAsset[] = Object.entries(imageModules)
  .map(([path, mod]) => ({
    id: path,
    name: extractName(path),
    url: mod.default,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
