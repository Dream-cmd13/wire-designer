import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDwgCache, getCachedBuffer, setCachedDrawing } from '@/lib/dwg/dwgCache';
import {
  DWG_URL_TTL_SECONDS,
  fetchDwgManifest,
  parseDwgManifest,
  prefetchDwgBuffer,
  primeDwgSignedUrls,
  resolveDwgFileUrl,
} from '@/lib/dwg/dwgLibrary';
import type { DwgDrawing } from '@/lib/dwg/dwgTypes';

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

describe('primeDwgSignedUrls', () => {
  it('signs every entry in one batch call and fills the url cache', async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://assets.test/${path}` })),
      error: null,
    }));
    const client = { storage: { from: vi.fn(() => ({ createSignedUrls })) } };
    const entries = [
      { name: 'A.dwg', key: 'dwg/A.dwg' },
      { name: 'B.dwg', key: 'dwg/B.dwg' },
    ];

    await primeDwgSignedUrls(client, entries);

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(['dwg/A.dwg', 'dwg/B.dwg'], DWG_URL_TTL_SECONDS);
    await expect(resolveDwgFileUrl(client, 'dwg/A.dwg')).resolves.toBe('https://assets.test/dwg/A.dwg');
  });

  it('falls back to per-path signing when the batch endpoint is unavailable', async () => {
    const { client, createSignedUrl } = fakeClient('https://assets.test/single');

    await primeDwgSignedUrls(client, [{ name: 'A.dwg', key: 'dwg/A.dwg' }]);

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    await expect(resolveDwgFileUrl(client, 'dwg/A.dwg')).resolves.toBe('https://assets.test/single');
  });
});

describe('prefetchDwgBuffer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearDwgCache();
  });

  it('downloads a drawing into the buffer cache', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    } as Response);
    const { client } = fakeClient('https://assets.test/signed');

    await prefetchDwgBuffer(client, { name: 'A.dwg', key: 'dwg/A.dwg' });

    expect(fetchMock).toHaveBeenCalledWith('https://assets.test/signed');
    expect(getCachedBuffer('dwg/A.dwg')).not.toBeNull();
  });

  it('skips the download when the drawing is already cached', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    setCachedDrawing('dwg/A.dwg', {} as DwgDrawing);

    await prefetchDwgBuffer(fakeClient('https://assets.test/signed').client, {
      name: 'A.dwg',
      key: 'dwg/A.dwg',
    });

    expect(fetchMock).not.toHaveBeenCalled();
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
