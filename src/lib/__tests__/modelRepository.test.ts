import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ModelRepository, createModelSaveSession } from '@/repositories/modelRepository';
import type { ParsedModel } from '../models/modelTypes';

const model = { boundsMm: { min: [0,0,0], max: [1,1,1] } } as ParsedModel;
const file = () => new File(['original bytes'], 'part.STP');
function backend() {
  let row: Record<string, unknown> | null = null;
  let stored: Blob | null = null;
  const faults = { upload: false, finalize: false, uncertain: false, missingWrapped: false };
  const upload = vi.fn(async (_key: string, blob: Blob) => {
    if (faults.uncertain) { stored = blob; return { error: { message: 'network', statusCode: '409' } }; }
    if (faults.upload) return { error: { message: 'offline' } };
    stored = blob; return { error: null };
  });
  const chain = () => {
    let op = 'get'; let payload: Record<string, unknown>;
    const query = {
      select: () => query, eq: () => query, order: () => query, range: () => query, abortSignal: () => query,
      insert: (value: Record<string, unknown>) => { op = 'insert'; payload = value; return query; },
      update: (value: Record<string, unknown>) => { op = 'update'; payload = value; return query; },
      maybeSingle: async () => ({ data: row, error: null }),
      single: async () => {
        if (op === 'update' && faults.finalize) return { data: null, error: { message: 'database unavailable' } };
        row = { ...row, ...payload }; return { data: row, error: null };
      },
    };
    return query;
  };
  const client = { from: chain, storage: { from: () => ({ upload, createSignedUrl: async () => stored ? { data: { signedUrl: 'https://storage.test/private' }, error: null } : { data: null, error: { status: faults.missingWrapped ? 400 : 404, statusCode: '404', message: 'Object not found' } } }) } } as unknown as SupabaseClient;
  const fetcher = vi.fn(async () => new Response(stored));
  return { repo: new ModelRepository(client, fetcher as typeof fetch), faults, upload, setStored: (blob: Blob) => { stored = blob; } };
}
describe('private model save protocol', () => {
  it('recognizes the Storage not-found code wrapped by an HTTP 400 response', async () => {
    const { repo, faults, upload } = backend(); faults.missingWrapped = true;
    const session = await createModelSaveSession('owner', file(), 'mm', model);
    expect((await repo.save(session, file(), new AbortController().signal)).status).toBe('ready');
    expect(upload).toHaveBeenCalledOnce();
  });
  it('rejects a different local file even when the recovery object already exists', async () => {
    const { repo, setStored, upload } = backend();
    const session = await createModelSaveSession('owner', file(), 'mm', model);
    setStored(file());
    await expect(repo.save(session, new File(['wrong model'], 'wrong.stp'), new AbortController().signal)).rejects.toThrow('不匹配');
    expect(upload).not.toHaveBeenCalled();
  });
  it('only finalizes after upload and reuses id without duplicate objects', async () => {
    const { repo, upload } = backend(); const session = await createModelSaveSession('owner', file(), 'mm', model);
    const phases: string[] = []; const signal = new AbortController().signal;
    expect((await repo.save(session, file(), signal, (phase) => phases.push(phase))).status).toBe('ready');
    expect(phases).toEqual(['uploading','finalizing']);
    await repo.save(session, file(), signal);
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0]).toBe(`owner/${session.id}/source.stp`);
  });
  it('retries upload failure using the same session', async () => {
    const { repo, faults, upload } = backend(); faults.upload = true;
    const session = await createModelSaveSession('owner', file(), 'mm', model); const signal = new AbortController().signal;
    await expect(repo.save(session, file(), signal)).rejects.toThrow('上传');
    faults.upload = false; expect((await repo.save(session, file(), signal)).id).toBe(session.id);
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it('recovers finalize failure without reuploading', async () => {
    const { repo, faults, upload } = backend(); faults.finalize = true;
    const session = await createModelSaveSession('owner', file(), 'mm', model); const signal = new AbortController().signal;
    await expect(repo.save(session, file(), signal)).rejects.toThrow('数据库');
    faults.finalize = false; expect((await repo.save(session, undefined, signal)).status).toBe('ready');
    expect(upload).toHaveBeenCalledOnce();
  });
  it('verifies conflicting or uncertain upload bytes before finalizing', async () => {
    const { repo, faults } = backend(); faults.uncertain = true;
    const session = await createModelSaveSession('owner', file(), 'mm', model);
    expect((await repo.save(session, file(), new AbortController().signal)).status).toBe('ready');
  });
  it('rejects hash mismatches and asks for the matching original when absent', async () => {
    const { repo, setStored } = backend(); const session = await createModelSaveSession('owner', file(), 'mm', model); const signal = new AbortController().signal;
    await expect(repo.save(session, undefined, signal)).rejects.toThrow('重新选择原文件');
    await expect(repo.save(session, new File(['different'], 'part.stp'), signal)).rejects.toThrow('不匹配');
    setStored(new Blob(['tampered bytes']));
    await expect(repo.save(session, file(), signal)).rejects.toThrow('不匹配');
  });
  it('re-signs an expired download and supports cancellation', async () => {
    const { repo, setStored } = backend(); const session = await createModelSaveSession('owner', file(), 'mm', model); setStored(file());
    let calls = 0; const fetcher = vi.fn(async () => ++calls === 1 ? new Response('', { status: 403 }) : new Response(file()));
    const client = Reflect.get(repo, 'client') as SupabaseClient;
    const reader = new ModelRepository(client, fetcher as typeof fetch);
    expect((await reader.download(session, new AbortController().signal)).size).toBe(file().size);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort();
    await expect(reader.download(session, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
