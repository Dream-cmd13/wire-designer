import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDwgSaveSession, DwgRepository, validateDwgFile, type DwgAsset } from '@/repositories/dwgRepository';

const original = new File(['AC1032 original'], 'drawing.DWG');
const signal = new AbortController().signal;

function backend() {
  let row: DwgAsset | null = null;
  let object: Blob | null = null;
  const faults = { upload: false, finalize: false };
  const upload = vi.fn(async (_key: string, file: Blob) => {
    if (faults.upload) return { error: { message: 'offline' } };
    object = file;
    return { error: null };
  });
  const from = vi.fn(() => {
    let insert: DwgAsset | null = null;
    const query = {
      select: () => query, eq: () => query, abortSignal: () => query,
      insert: (value: DwgAsset) => { insert = value; return query; },
      update: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
      single: async () => {
        if (insert) row = insert;
        else if (faults.finalize) return { data: null, error: { message: 'offline' } };
        else if (row) row = { ...row, status: 'ready' };
        return { data: row, error: null };
      },
    };
    return query;
  });
  const bucket = vi.fn(() => ({
    upload,
    createSignedUrl: async () => object
      ? { data: { signedUrl: 'https://storage.test/private' }, error: null }
      : { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } },
  }));
  const client = { from, storage: { from: bucket } } as unknown as SupabaseClient;
  return { repo: new DwgRepository(client, async () => new Response(object)), faults, from, bucket, upload,
    stored: () => row, replace: (file: Blob) => { object = file; } };
}

describe('private DWG original files', () => {
  it('validates type, empty files and limit', () => {
    expect(() => validateDwgFile(original)).not.toThrow();
    expect(() => validateDwgFile(new File(['x'], 'a.dxf'))).toThrow('.dwg');
    expect(() => validateDwgFile(new File([], 'a.dwg'))).toThrow();
    expect(() => validateDwgFile({ name: 'a.dwg', size: 20 * 1024 * 1024 + 1 })).toThrow('20 MiB');
  });

  it('retries an upload using the same record, then recovers confirmation without replacing bytes', async () => {
    const { repo, faults, from, bucket, upload, stored } = backend();
    const asset = await createDwgSaveSession('owner', original);
    faults.upload = true;
    await expect(repo.save(asset, original, signal)).rejects.toThrow();
    expect(stored()?.status).toBe('uploading');
    faults.upload = false;
    faults.finalize = true;
    await expect(repo.save(asset, original, signal)).rejects.toThrow();
    expect(stored()?.status).toBe('uploading');
    faults.finalize = false;
    const ready = await repo.save(asset, undefined, signal);
    expect(ready).toMatchObject({ id: asset.id, status: 'ready' });
    expect(from).toHaveBeenCalledWith('dwg_assets');
    expect(bucket).toHaveBeenCalledWith('dwg-files');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith(`owner/${asset.id}/source.dwg`, original, { upsert: false, contentType: 'application/octet-stream' });
    expect(await (await repo.download(ready, signal)).text()).toBe(await original.text());
  });

  it('rejects different recovery files and corrupted cloud data', async () => {
    const { repo, replace, upload } = backend();
    const asset = await createDwgSaveSession('owner', original);
    const different = new File(['AC1032 changed!'], original.name);
    expect(different.size).toBe(original.size);
    await expect(repo.save(asset, different, signal)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
    const ready = await repo.save(asset, original, signal);
    replace(different);
    await expect(repo.download(ready, signal)).rejects.toThrow();
  });
});
