import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DWG_URL_TTL_SECONDS,
  fetchDwgManifest,
  parseDwgManifest,
  resolveDwgFileUrl,
} from '@/lib/dwg/dwgLibrary';

function fakeClient(signedUrl: string | null, error: { message: string } | null = null) {
  const createSignedUrl = vi.fn(async () => ({
    data: signedUrl ? { signedUrl } : null,
    error,
  }));
  return {
    client: { storage: { from: vi.fn(() => ({ createSignedUrl })) } },
    createSignedUrl,
  };
}

function jsonResponse(value: unknown, ok = true): Response {
  return { ok, json: async () => value } as Response;
}

describe('parseDwgManifest', () => {
  it('keeps only complete name/key entries', () => {
    expect(parseDwgManifest([
      { name: 'A.dwg', key: 'dwg/A.dwg' },
      { name: '  ', key: 'dwg/empty.dwg' },
      { name: 'B.dwg' },
      'legacy-string',
      null,
    ])).toEqual([{ name: 'A.dwg', key: 'dwg/A.dwg' }]);
    expect(parseDwgManifest('not-an-array')).toEqual([]);
  });
});

describe('resolveDwgFileUrl', () => {
  it('signs the manifest object key and reuses the cached url', async () => {
    const { client, createSignedUrl } = fakeClient('https://assets.test/signed');

    await expect(resolveDwgFileUrl(client, 'dwg/M12A04.dwg')).resolves.toBe('https://assets.test/signed');
    await expect(resolveDwgFileUrl(client, 'dwg/M12A04.dwg')).resolves.toBe('https://assets.test/signed');
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(createSignedUrl).toHaveBeenCalledWith('dwg/M12A04.dwg', DWG_URL_TTL_SECONDS);
  });

  it('returns null without a client or when signing fails', async () => {
    await expect(resolveDwgFileUrl(null, 'dwg/A.dwg')).resolves.toBeNull();
    const failed = fakeClient(null, { message: 'expired' });
    await expect(resolveDwgFileUrl(failed.client, 'dwg/A.dwg')).resolves.toBeNull();
  });
});

describe('fetchDwgManifest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and parses the signed manifest url', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([{ name: 'A.dwg', key: 'dwg/A.dwg' }]),
    );
    const { client } = fakeClient('https://assets.test/manifest');

    await expect(fetchDwgManifest(client)).resolves.toEqual([{ name: 'A.dwg', key: 'dwg/A.dwg' }]);
    expect(fetchMock).toHaveBeenCalledWith('https://assets.test/manifest', { signal: undefined });
  });

  it('returns an empty list when the manifest cannot be signed, fetched or parsed', async () => {
    await expect(fetchDwgManifest(null)).resolves.toEqual([]);

    const unsigned = fakeClient(null);
    await expect(fetchDwgManifest(unsigned.client)).resolves.toEqual([]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('missing', false));
    const notFound = fakeClient('https://assets.test/manifest');
    await expect(fetchDwgManifest(notFound.client)).resolves.toEqual([]);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const broken = fakeClient('https://assets.test/manifest');
    await expect(fetchDwgManifest(broken.client)).resolves.toEqual([]);
  });
});
