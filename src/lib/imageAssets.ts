const imageModules = import.meta.glob('../../图纸图框.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

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
  .map(([path, url]) => ({
    id: path,
    name: extractName(path),
    url,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
