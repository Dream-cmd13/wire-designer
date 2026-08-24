import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createBlankDrawingDocument } from '@/lib/drawingDocument';
import { DrawingDocumentRepository } from '@/repositories/drawingDocumentRepository';

type Row = Record<string, unknown>;

function fakeDrawingClient() {
  const rows = new Map<string, Row>();
  const calls: string[] = [];

  const client = {
    from(table: string) {
      if (table !== 'drawings') throw new Error(`unexpected table: ${table}`);
      const filters: Row = {};
      let deleting = false;
      const matching = () => [...rows.values()].filter((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: (columns: string) => {
          calls.push(`select:${columns}`);
          return builder;
        },
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        order: async () => ({ data: matching(), error: null }),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        upsert: async (payload: Row) => {
          rows.set(String(payload.id), { ...payload });
          return { data: null, error: null };
        },
        delete: () => {
          deleting = true;
          return builder;
        },
        then: (
          resolve: (value: { data: null; error: null }) => unknown,
          reject: (reason: unknown) => unknown,
        ) => {
          try {
            if (deleting) matching().forEach((row) => rows.delete(String(row.id)));
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, rows, calls };
}

describe('DrawingDocumentRepository', () => {
  it('upserts, lists, and loads one drawing row without a version read', async () => {
    const { client, rows, calls } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const document = createBlankDrawingDocument('测试图纸');

    await repository.save('owner-1', document);

    expect(rows.get(document.id)).toEqual(expect.objectContaining({
      id: document.id,
      owner_id: 'owner-1',
      document,
    }));
    expect(calls).not.toContain('select:revision');
    await expect(repository.list('owner-1')).resolves.toEqual([document]);
    await expect(repository.load(document.id)).resolves.toEqual(document);
  });

  it('hard deletes only the owner drawing', async () => {
    const { client, rows } = fakeDrawingClient();
    const repository = new DrawingDocumentRepository(client);
    const document = createBlankDrawingDocument('测试图纸');
    await repository.save('owner-1', document);

    await repository.remove('owner-2', document.id);
    expect(rows.has(document.id)).toBe(true);

    await repository.remove('owner-1', document.id);
    expect(rows.has(document.id)).toBe(false);
  });
});
