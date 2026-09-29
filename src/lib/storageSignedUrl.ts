/** 私有桶签名 URL 所需的最小客户端接口，兼容 SupabaseClient 与测试桩。 */
export interface SignedUrlStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl?(path: string, expiresIn: number): PromiseLike<{
        data: { signedUrl?: string } | null;
        error: { message: string } | null;
      }>;
      createSignedUrls?(paths: string[], expiresIn: number): PromiseLike<{
        data: Array<{ path: string | null; signedUrl: string | null }> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/** 批量签名单次请求的最大路径数（Storage API 一次签名过多路径会失败）。 */
const SIGN_BATCH_SIZE = 100;

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

function cacheKey(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

/** 清空指定客户端的签名 URL 缓存（登出或切换账号时调用）。 */
export function clearStorageSignedUrlCache(client?: object): void {
  if (!client) return;
  clientCaches.delete(client);
  clientInFlight.delete(client);
}

/**
 * 预先生成一批签名 URL 写入缓存：优先使用批量接口（一次网络往返），
 * 客户端不支持时回退为逐个签名；失败静默忽略，后续仍会按需重签。
 */
export async function primeStorageSignedUrls(
  client: SignedUrlStorageClient | null,
  bucketName: string,
  paths: readonly string[],
  expiresIn: number,
): Promise<void> {
  if (!client || paths.length === 0) return;
  const bucket = client.storage.from(bucketName);
  const cache = getClientCache(client as object);
  const now = Date.now();
  const pending = paths.filter((path) => {
    if (!path) return false;
    const cached = cache.get(cacheKey(bucketName, path));
    return !cached || cached.expiresAt <= now;
  });
  if (pending.length === 0) return;

  if (typeof bucket.createSignedUrls === 'function') {
    for (let index = 0; index < pending.length; index += SIGN_BATCH_SIZE) {
      const batch = pending.slice(index, index + SIGN_BATCH_SIZE);
      try {
        const { data, error } = await bucket.createSignedUrls(batch, expiresIn);
        if (error || !data) continue;
        for (const item of data) {
          if (item?.signedUrl && item.path) {
            cache.set(cacheKey(bucketName, item.path), {
              signedUrl: item.signedUrl,
              expiresAt: Date.now() + expiresIn * 1000 - 60000,
            });
          }
        }
      } catch {
        // 批量签名失败时保持按需签名
      }
    }
    return;
  }

  await Promise.all(
    pending.map((path) => resolveStorageSignedUrl(client, bucketName, path, expiresIn)),
  );
}

/**
 * 生成私有桶对象的签名 URL：同一客户端同一对象复用未过期链接，并合并并发请求；
 * 签名失败返回 null，由调用方决定回退行为。
 */
export async function resolveStorageSignedUrl(
  client: SignedUrlStorageClient | null,
  bucketName: string,
  path: string,
  expiresIn: number,
): Promise<string | null> {
  if (!client || !path) return null;

  const cache = getClientCache(client as object);
  const key = cacheKey(bucketName, path);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl;
  }

  const bucket = client.storage.from(bucketName);
  if (typeof bucket.createSignedUrl !== 'function') return null;

  const inFlight = getClientInFlight(client as object);
  const existingRequest = inFlight.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async (): Promise<string | null> => {
    try {
      const { data, error } = await bucket.createSignedUrl!(path, expiresIn);
      if (error || !data?.signedUrl) {
        return null;
      }
      cache.set(key, {
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + expiresIn * 1000 - 60000,
      });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}
