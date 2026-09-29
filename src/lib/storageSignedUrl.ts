/** 私有桶签名 URL 所需的最小客户端接口，兼容 SupabaseClient 与测试桩。 */
export interface SignedUrlStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl?(path: string, expiresIn: number): PromiseLike<{
        data: { signedUrl?: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

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
  const bucket = client.storage.from(bucketName);
  if (typeof bucket.createSignedUrl !== 'function') return null;

  const cache = getClientCache(client as object);
  const inFlight = getClientInFlight(client as object);
  const key = cacheKey(bucketName, path);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signedUrl;
  }

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
