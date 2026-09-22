import type { CatalogStorageClient } from '@/lib/catalogImageUrl';

export const FINISHED_HARNESS_DRAWING_BUCKET = 'finished-harness-drawings';
export const FINISHED_HARNESS_DRAWING_URL_TTL_SECONDS = 60 * 60;

const BUCKET_PATH_MARKERS = [
  `/storage/v1/object/public/${FINISHED_HARNESS_DRAWING_BUCKET}/`,
  `/storage/v1/object/sign/${FINISHED_HARNESS_DRAWING_BUCKET}/`,
];

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
}

const clientCaches = new WeakMap<object, Map<string, CacheEntry>>();
const clientInFlight = new WeakMap<object, Map<string, Promise<string | null>>>();

function getClientCache(client: object): Map<string, CacheEntry> {
  let cache = clientCaches.get(client);
  if (!cache) {
    cache = new Map<string, CacheEntry>();
    clientCaches.set(client, cache);
  }
  return cache;
}

function getClientInFlight(client: object): Map<string, Promise<string | null>> {
  let inFlight = clientInFlight.get(client);
  if (!inFlight) {
    inFlight = new Map<string, Promise<string | null>>();
    clientInFlight.set(client, inFlight);
  }
  return inFlight;
}

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

export function clearFinishedHarnessDrawingUrlCache(client?: CatalogStorageClient): void {
  if (!client) return;
  clientCaches.delete(client as object);
  clientInFlight.delete(client as object);
}

export async function resolveFinishedHarnessDrawingUrl(
  client: CatalogStorageClient | null,
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  const path = finishedHarnessDrawingStoragePath(value);
  if (!path) return value;
  if (!client) return value;

  const bucket = client.storage.from(FINISHED_HARNESS_DRAWING_BUCKET);
  if (typeof bucket.createSignedUrl !== 'function') return value;

  const cache = getClientCache(client as object);
  const inFlight = getClientInFlight(client as object);

  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl;
  }

  const existingRequest = inFlight.get(path);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async (): Promise<string | null> => {
    try {
      const { data, error } = await bucket.createSignedUrl!(
        path,
        FINISHED_HARNESS_DRAWING_URL_TTL_SECONDS,
      );
      if (error || !data?.signedUrl) {
        return value;
      }
      cache.set(path, {
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + FINISHED_HARNESS_DRAWING_URL_TTL_SECONDS * 1000 - 60000,
      });
      return data.signedUrl;
    } catch {
      return value;
    } finally {
      inFlight.delete(path);
    }
  })();

  inFlight.set(path, request);
  return request;
}
