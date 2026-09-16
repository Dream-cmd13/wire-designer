export interface CatalogStorageClient {
  storage: {
    from(bucket: string): {
      download?(path: string): PromiseLike<{
        data: Blob | null;
        error: { message: string } | null;
      }>;
      createSignedUrl?(path: string, expiresIn: number): PromiseLike<{
        data: { signedUrl?: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export const CATALOG_IMAGE_BUCKET = 'catalog-assets';
export const CATALOG_IMAGE_URL_TTL_SECONDS = 60 * 60;

export interface CatalogImageSignResult {
  signedUrl?: string;
  error?: string;
}

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
  isBlob?: boolean;
}

const clientCaches = new WeakMap<object, Map<string, CacheEntry>>();
const clientInFlight = new WeakMap<object, Map<string, Promise<CatalogImageSignResult>>>();
const activeBlobUrls = new Set<string>();

function createObjectUrlSafe(blob: Blob, path: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  return `blob:mock/${path}`;
}

function revokeObjectUrlSafe(url: string): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

function getClientCache(client: CatalogStorageClient): Map<string, CacheEntry> {
  const target = client as object;
  let cache = clientCaches.get(target);
  if (!cache) {
    cache = new Map<string, CacheEntry>();
    clientCaches.set(target, cache);
  }
  return cache;
}

function getClientInFlight(client: CatalogStorageClient): Map<string, Promise<CatalogImageSignResult>> {
  const target = client as object;
  let inFlight = clientInFlight.get(target);
  if (!inFlight) {
    inFlight = new Map<string, Promise<CatalogImageSignResult>>();
    clientInFlight.set(target, inFlight);
  }
  return inFlight;
}

export function clearCatalogImageCache(client?: CatalogStorageClient): void {
  if (client) {
    const cache = clientCaches.get(client as object);
    if (cache) {
      for (const entry of cache.values()) {
        if (entry.isBlob) {
          revokeObjectUrlSafe(entry.signedUrl);
          activeBlobUrls.delete(entry.signedUrl);
        }
      }
    }
    clientCaches.delete(client as object);
    clientInFlight.delete(client as object);
  } else {
    for (const url of activeBlobUrls) {
      revokeObjectUrlSafe(url);
    }
    activeBlobUrls.clear();
  }
}

export async function signCatalogImageResult(
  client: CatalogStorageClient,
  path: string,
): Promise<CatalogImageSignResult> {
  if (!path) {
    return { signedUrl: undefined };
  }

  const cache = getClientCache(client);
  const inFlight = getClientInFlight(client);

  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) {
    return { signedUrl: cached.signedUrl };
  }

  const existingRequest = inFlight.get(path);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async (): Promise<CatalogImageSignResult> => {
    try {
      const bucket = client.storage.from(CATALOG_IMAGE_BUCKET);

      // 严格模式优先：使用鉴权 download 获取私有二进制流转为内存 Blob URL
      if (typeof bucket.download === 'function') {
        const { data, error } = await bucket.download(path);
        if (error) {
          return { error: error.message };
        }
        if (data) {
          const blobUrl = createObjectUrlSafe(data, path);
          activeBlobUrls.add(blobUrl);
          const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
          cache.set(path, { signedUrl: blobUrl, expiresAt, isBlob: true });
          return { signedUrl: blobUrl };
        }
        return { signedUrl: undefined };
      }

      // 回退方案：兼容仅提供 createSignedUrl 的客户端/测试桩
      if (typeof bucket.createSignedUrl === 'function') {
        const { data, error } = await bucket.createSignedUrl(path, CATALOG_IMAGE_URL_TTL_SECONDS);

        if (error) {
          return { error: error.message };
        }

        if (data?.signedUrl) {
          const expiresAt = Date.now() + (CATALOG_IMAGE_URL_TTL_SECONDS * 1000) - 60000;
          cache.set(path, { signedUrl: data.signedUrl, expiresAt, isBlob: false });
          return { signedUrl: data.signedUrl };
        }
      }

      return { signedUrl: undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown signing error';
      return { error: message };
    } finally {
      inFlight.delete(path);
    }
  })();

  inFlight.set(path, request);
  return request;
}

export async function signCatalogImage(
  client: CatalogStorageClient,
  path: string,
): Promise<string | undefined> {
  return (await signCatalogImageResult(client, path)).signedUrl;
}
