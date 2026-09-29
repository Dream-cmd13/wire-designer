import type { CatalogStorageClient } from '@/lib/catalogImageUrl';
import { resolveStorageSignedUrl } from '@/lib/storageSignedUrl';

export const FINISHED_HARNESS_DRAWING_BUCKET = 'finished-harness-drawings';
export const FINISHED_HARNESS_DRAWING_URL_TTL_SECONDS = 60 * 60;

const BUCKET_PATH_MARKERS = [
  `/storage/v1/object/public/${FINISHED_HARNESS_DRAWING_BUCKET}/`,
  `/storage/v1/object/sign/${FINISHED_HARNESS_DRAWING_BUCKET}/`,
];

/**
 * 返回私有桶对象路径；外部链接（如 CRM 图纸）返回 null，表示按原样打开。
 */
export function finishedHarnessDrawingStoragePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  for (const marker of BUCKET_PATH_MARKERS) {
    const index = trimmed.indexOf(marker);
    if (index >= 0) {
      const path = trimmed.slice(index + marker.length).split('?')[0];
      return path ? decodeURIComponent(path) : null;
    }
  }
  return null;
}

export async function resolveFinishedHarnessDrawingUrl(
  client: CatalogStorageClient | null,
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  const path = finishedHarnessDrawingStoragePath(value);
  if (!path) return value;
  if (!client) return value;

  const signedUrl = await resolveStorageSignedUrl(
    client,
    FINISHED_HARNESS_DRAWING_BUCKET,
    path,
    FINISHED_HARNESS_DRAWING_URL_TTL_SECONDS,
  );
  return signedUrl ?? value;
}
