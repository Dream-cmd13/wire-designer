export interface PdfDrawing {
  id: string;
  name: string;
  url: string;
}

const pdfModules = import.meta.glob('../../*.pdf', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function getDrawingName(path: string) {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.pdf$/i, '');
}

export const pdfDrawings: PdfDrawing[] = Object.entries(pdfModules)
  .map(([path, url]) => ({
    id: path,
    name: getDrawingName(path),
    url,
  }))
  .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
