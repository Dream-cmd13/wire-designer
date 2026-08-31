import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATALOG_IMAGE_BUCKET,
  CATALOG_IMAGE_URL_TTL_SECONDS,
  clearCatalogImageCache,
  signCatalogImage,
  signCatalogImageResult,
} from '@/lib/catalogImageUrl';

function fakeClient(result: { signedUrl?: string; error?: { message: string } | null }) {
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: result.signedUrl ? { signedUrl: result.signedUrl } : null,
    error: result.error ?? null,
  });
  return {
    client: { storage: { from: vi.fn(() => ({ createSignedUrl })) } },
    createSignedUrl,
  };
}

describe('catalog image signed URLs', () => {
  beforeEach(() => {
    clearCatalogImageCache();
  });

  it('signs catalog paths with a one-hour TTL', async () => {
    const { client, createSignedUrl } = fakeClient({ signedUrl: 'https://assets.test/image.png' });
    await expect(signCatalogImage(client, 'catalog/wire/image.png')).resolves.toBe('https://assets.test/image.png');
    expect(createSignedUrl).toHaveBeenCalledWith('catalog/wire/image.png', CATALOG_IMAGE_URL_TTL_SECONDS);
    expect(client.storage.from).toHaveBeenCalledWith(CATALOG_IMAGE_BUCKET);
  });

  it('preserves provider errors for resource-level UI messages', async () => {
    const { client } = fakeClient({ error: { message: 'InvalidJWT' } });
    await expect(signCatalogImageResult(client, 'catalog/wire/image.png')).resolves.toEqual({ error: 'InvalidJWT' });
  });

  it('reuses in-memory cached signed URL for repeated calls to the same path', async () => {
    const { client, createSignedUrl } = fakeClient({ signedUrl: 'https://assets.test/cached.png' });
    const url1 = await signCatalogImage(client, 'catalog/connector/c1.png');
    const url2 = await signCatalogImage(client, 'catalog/connector/c1.png');

    expect(url1).toBe('https://assets.test/cached.png');
    expect(url2).toBe('https://assets.test/cached.png');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent in-flight signing requests for the same path', async () => {
    const { client, createSignedUrl } = fakeClient({ signedUrl: 'https://assets.test/inflight.png' });
    const [res1, res2] = await Promise.all([
      signCatalogImageResult(client, 'catalog/wire/w1.png'),
      signCatalogImageResult(client, 'catalog/wire/w1.png'),
    ]);

    expect(res1).toEqual({ signedUrl: 'https://assets.test/inflight.png' });
    expect(res2).toEqual({ signedUrl: 'https://assets.test/inflight.png' });
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
