import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { DrawingDocumentRepository } from '@/repositories/drawingDocumentRepository';
import type { DrawingDocument } from '@/types/drawing';

type Row = Record<string, unknown>;

/** 模拟带版本校验的图纸 RPC 与只读查询。 */
function fakeDrawingClient(ownerId = 'owner-1', sharedRows?: Map<string, Row>) {
  const rows = sharedRows ?? new Map<string, Row>();
  const now = () => new Date().toISOString();

  const rpc = async (name: string, params: Row): Promise<{ data: unknown; error: { message: string; code: string } | null }> => {
    const id = String(params.document_id ?? '');
    if (name === 'save_drawing_document') {
      const payload = params.document_payload as Row;
      if (params.expected_revision === null) {
        if (rows.has(id)) return { data: null, error: { message: 'Document already exists', code: 'P0002' } };
        const row: Row = { id, owner_id: ownerId, document: payload, revision: 1, updated_at: now() };
        rows.set(id, row);
        return { data: [{ revision: 1, updated_at: row.updated_at }], error: null };
      }
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) {
        return { data: null, error: { message: 'Document not found', code: 'P0002' } };
      }
      if (row.revision !== params.expected_revision) {
        return { data: null, error: { message: 'Version conflict', code: 'P0002' } };
      }
      row.revision = (row.revision as number) + 1;
      row.document = payload;
      row.updated_at = now();
      return { data: [{ revision: row.revision, updated_at: row.updated_at }], error: null };
    }
    if (name === 'delete_drawing_document') {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) {
        return { data: null, error: { message: 'Document not found', code: 'P0002' } };
      }
      if (row.revision !== params.expected_revision) {
        return { data: null, error: { message: 'Version conflict', code: 'P0002' } };
      }
      rows.delete(id);
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected rpc: ${name}`, code: '' } };
  };

  const client = {
    rpc,
    from(table: string) {
      if (table !== 'drawings') throw new Error(`unexpected table: ${table}`);
      const filters: Row = {};
      let columns = '';
      const matching = () => [...rows.values()].filter((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: (selected: string) => {
          columns = selected;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        order: async () => ({ data: matching(), error: null }),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
          void columns;
          return Promise.resolve({ data: matching(), error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, rows };
}

describe('DrawingDocumentRepository', () => {
  it('creates with a null baseline and returns the database version', async () => {
    const { client, rows } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const document = createBlankDrawingDocument('测试图纸');

    const version = await repository.save('owner-1', document, null);

    expect(version).toEqual({ revision: 1, updatedAt: expect.any(String) });
    expect(rows.get(document.id)).toEqual(expect.objectContaining({
      id: document.id,
      owner_id: 'owner-1',
      document,
      revision: 1,
    }));
    await expect(repository.list('owner-1')).resolves.toEqual([
      { document, version },
    ]);
    await expect(repository.load(document.id)).resolves.toEqual({ document, version });
  });

  it('updates only with the exact expected revision and never resurrects a deleted row', async () => {
    const { client, rows } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const document = createBlankDrawingDocument('测试图纸');
    const created = await repository.save('owner-1', document, null);

    await expect(repository.save('owner-1', { ...document, name: '旧窗口' }, created))
      .resolves.toMatchObject({ revision: 2 });
    await expect(repository.save('owner-1', { ...document, name: '过期窗口' }, created))
      .rejects.toMatchObject({ code: 'conflict' });
    expect((rows.get(document.id)?.document as DrawingDocument).name).toBe('旧窗口');

    await repository.remove('owner-1', document.id, { revision: 2, updatedAt: '' });
    expect(rows.has(document.id)).toBe(false);
    // 旧窗口携带旧版本继续保存不会复活已删除的图纸
    await expect(repository.save('owner-1', document, { revision: 2, updatedAt: '' }))
      .rejects.toMatchObject({ code: 'missing' });
  });

  it('denies other accounts access through the database identity', async () => {
    const sharedRows = new Map<string, Row>();
    const ownerRepository = new DrawingDocumentRepository(fakeDrawingClient('owner-1', sharedRows).client);
    const otherRepository = new DrawingDocumentRepository(fakeDrawingClient('owner-2', sharedRows).client);
    const document = createBlankDrawingDocument('测试图纸');
    const created = await ownerRepository.save('owner-1', document, null);

    await expect(otherRepository.remove('owner-2', document.id, created))
      .rejects.toMatchObject({ code: 'missing' });
    await expect(otherRepository.save('owner-2', { ...document, name: '越权' }, created))
      .rejects.toMatchObject({ code: 'missing' });
    expect(sharedRows.has(document.id)).toBe(true);
    expect((sharedRows.get(document.id)?.document as DrawingDocument).name).toBe('测试图纸');
  });

  it('hard deletes only with the exact expected version', async () => {
    const { client, rows } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const document = createBlankDrawingDocument('测试图纸');
    const created = await repository.save('owner-1', document, null);

    await expect(repository.remove('owner-1', document.id, { revision: 99, updatedAt: '' }))
      .rejects.toMatchObject({ code: 'conflict' });
    expect(rows.has(document.id)).toBe(true);

    await repository.remove('owner-1', document.id, created);
    expect(rows.has(document.id)).toBe(false);
  });

  it('isolates drawings with corrupt objects without dropping their raw rows', async () => {
    const { client, rows } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const healthy = createBlankDrawingDocument('健康图纸');
    const version = await repository.save('owner-1', healthy, null);
    const corruptDocument = { ...createBlankDrawingDocument('损坏图纸'), objects: [null] };
    rows.set('broken-row', { id: 'broken-row', owner_id: 'owner-1', document: corruptDocument, revision: 3, updated_at: 'x' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(repository.list('owner-1')).resolves.toEqual([{ document: healthy, version }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(rows.get('broken-row')?.document).toBe(corruptDocument);

    warn.mockRestore();
  });

  it('rejects saving a document whose objects are incomplete', async () => {
    const { client } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const document = {
      ...createBlankDrawingDocument('损坏图纸'),
      objects: [null],
    } as unknown as DrawingDocument;

    await expect(repository.save('owner-1', document, null)).rejects.toThrow('图纸结构校验失败');
  });
});
