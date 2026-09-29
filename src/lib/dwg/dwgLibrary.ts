import { getCachedBuffer, getCachedDrawing, setCachedBuffer } from '@/lib/dwg/dwgCache';
import { primeStorageSignedUrls, resolveStorageSignedUrl, type SignedUrlStorageClient } from '@/lib/storageSignedUrl';

/** 内置 DWG 图纸私有桶，对象键与清单由 scripts/upload-dwg-drawings.mjs 生成。 */
export const DWG_BUCKET = 'dwg-drawings';
export const DWG_MANIFEST_PATH = 'dwg/manifest.json';
export const DWG_URL_TTL_SECONDS = 60 * 60;

export interface DwgManifestEntry {
  /** 显示文件名，用于下拉与 `?file=` 直达。 */
  name: string;
  /** 桶内对象键（包含 `dwg/` 前缀，非 ASCII 文件名已转义为 ASCII）。 */
  key: string;
}

/** 解析上传脚本写入桶内的图纸清单（`{ name, key }` 数组）。 */
export function parseDwgManifest(value: unknown): DwgManifestEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: DwgManifestEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { name, key } = item as { name?: unknown; key?: unknown };
    if (typeof name !== 'string' || !name.trim()) continue;
    if (typeof key !== 'string' || !key.trim()) continue;
    entries.push({ name: name.trim(), key: key.trim() });
  }
  return entries;
}

/** 解析某张内置图纸的签名访问链接；未登录、签名失败或客户端不可用时返回 null。 */
export function resolveDwgFileUrl(
  client: SignedUrlStorageClient | null,
  key: string,
): Promise<string | null> {
  return resolveStorageSignedUrl(client, DWG_BUCKET, key, DWG_URL_TTL_SECONDS);
}

/** 批量预签名全部内置图纸，切换时无需再等待签名往返。 */
export function primeDwgSignedUrls(
  client: SignedUrlStorageClient | null,
  entries: readonly DwgManifestEntry[],
): Promise<void> {
  return primeStorageSignedUrls(client, DWG_BUCKET, entries.map((entry) => entry.key), DWG_URL_TTL_SECONDS);
}

/** 后台预取某张图纸的字节；已缓存、签名失败或下载失败时静默忽略。 */
export async function prefetchDwgBuffer(
  client: SignedUrlStorageClient | null,
  entry: DwgManifestEntry,
): Promise<void> {
  if (getCachedDrawing(entry.key) || getCachedBuffer(entry.key)) return;
  const url = await resolveDwgFileUrl(client, entry.key);
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) return;
    const buffer = await response.arrayBuffer();
    // 下载期间该图纸可能已被正常加载并解析，无需再占缓存
    if (getCachedDrawing(entry.key)) return;
    setCachedBuffer(entry.key, buffer);
  } catch {
    // 预取失败不影响正常加载
  }
}

/** 读取桶内清单；未登录、签名失败、清单缺失或格式异常时返回空数组。 */
export async function fetchDwgManifest(
  client: SignedUrlStorageClient | null,
  signal?: AbortSignal,
): Promise<DwgManifestEntry[]> {
  const url = await resolveStorageSignedUrl(client, DWG_BUCKET, DWG_MANIFEST_PATH, DWG_URL_TTL_SECONDS);
  if (!url) return [];
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    return parseDwgManifest(await response.json());
  } catch {
    return [];
  }
}
