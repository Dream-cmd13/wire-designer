export interface CatalogStorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): PromiseLike<{
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
}

const clientCaches = new WeakMap<object, Map<string, CacheEntry>>();
const clientInFlight = new WeakMap<object, Map<string, Promise<CatalogImageSignResult>>>();

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
    clientCaches.delete(client as object);
    clientInFlight.delete(client as object);
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
      const { data, error } = await client.storage
        .from(CATALOG_IMAGE_BUCKET)
        .createSignedUrl(path, CATALOG_IMAGE_URL_TTL_SECONDS);

      if (error) {
        return { error: error.message };
      }

      if (data?.signedUrl) {
        const expiresAt = Date.now() + (CATALOG_IMAGE_URL_TTL_SECONDS * 1000) - 60000;
        cache.set(path, { signedUrl: data.signedUrl, expiresAt });
        return { signedUrl: data.signedUrl };
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
