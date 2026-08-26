import { describe, expect, it, vi } from 'vitest';
import { CATALOG_IMAGE_BUCKET, CATALOG_IMAGE_URL_TTL_SECONDS, signCatalogImage, signCatalogImageResult } from '@/lib/catalogImageUrl';

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
});
