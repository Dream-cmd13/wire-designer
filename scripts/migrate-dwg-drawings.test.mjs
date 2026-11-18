import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { migrateDwgDrawings } from './migrate-dwg-drawings.mjs';

const ownerId = '10000000-0000-4000-8000-000000000001';
const sourceKey = 'dwg/demo.dwg';
const bytes = Buffer.from('AC1027 example');
const hash = createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const source = new Map([
    ['dwg/manifest.json', new Blob([JSON.stringify([{ name: '示例.dwg', key: sourceKey }])])],
    [sourceKey, new Blob([bytes])],
  ]);
  const files = new Map();
  const rows = new Map();
  const upload = vi.fn(async (key, data) => { files.set(key, new Blob([data])); return { error: null }; });
  const write = vi.fn(async (row) => { rows.set(row.id, row); return { error: null }; });
  const client = {
    storage: { from: (bucket) => ({
      download: async (key) => {
        const data = (bucket === 'dwg-drawings' ? source : files).get(key);
        return data ? { data, error: null } : { data: null, error: { status: 404 } };
      },
      list: async (directory) => ({ data: files.has(`${directory}/source.dwg`) ? [{ name: 'source.dwg' }] : [], error: null }),
      upload,
    }) },
    from: () => ({
      select: () => ({ eq: (_, id) => ({ maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null }) }) }),
      insert: write,
    }),
  };
  return { client, source, files, rows, upload, write };
}

it('previews without writes, then copies once and verifies unchanged bytes on rerun', async () => {
  const { client, source, files, rows, upload, write } = fixture();
  await expect(migrateDwgDrawings(client, ownerId, false)).resolves.toEqual([{ name: '示例.dwg', status: 'copy' }]);
  expect(upload).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();

  await expect(migrateDwgDrawings(client, ownerId, true)).resolves.toEqual([{ name: '示例.dwg', status: 'copied' }]);
  const [record] = rows.values();
  expect(record).toMatchObject({ owner_id: ownerId, original_name: '示例.dwg', file_size: bytes.length, sha256: hash, status: 'ready' });
  expect(Buffer.from(await files.get(record.object_key).arrayBuffer())).toEqual(bytes);
  expect(source.has(sourceKey)).toBe(true);

  await expect(migrateDwgDrawings(client, ownerId, true)).resolves.toEqual([{ name: '示例.dwg', status: 'verified' }]);
  expect(upload).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledOnce();
});

it('recovers when the original reached Storage but registering it failed', async () => {
  const { client, upload, write } = fixture();
  write.mockResolvedValueOnce({ error: { message: 'unavailable' } });
  await expect(migrateDwgDrawings(client, ownerId, true)).rejects.toThrow('登记');
  expect(upload).toHaveBeenCalledOnce();
  await expect(migrateDwgDrawings(client, ownerId, true)).resolves.toEqual([{ name: '示例.dwg', status: 'copied' }]);
  expect(upload).toHaveBeenCalledOnce();
});

it('refuses to overwrite a destination with different bytes', async () => {
  const { client, files, rows, upload, write } = fixture();
  await migrateDwgDrawings(client, ownerId, true);
  files.set([...rows.values()][0].object_key, new Blob(['different']));
  await expect(migrateDwgDrawings(client, ownerId, true)).rejects.toThrow('不匹配');
  expect(upload).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledOnce();
});
