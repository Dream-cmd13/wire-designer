import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkStorageBootstrap } from '@/lib/storageBootstrap';

const storageSql = readFileSync(
  new URL('../../../supabase/sql/20_storage/01_buckets.sql', import.meta.url),
  'utf8',
);

function fakeClient(data: unknown, error: unknown = null) {
  return {
    rpc: async () => ({ data, error }),
  } as unknown as SupabaseClient;
}

describe('storage bootstrap SQL', () => {
  it('exposes only the fixed read-only bucket status through a restricted RPC', () => {
    expect(storageSql).toContain('create or replace function public.get_storage_bootstrap_status()');
    expect(storageSql).toContain("values ('catalog-assets'::text)");
    expect(storageSql).not.toContain('project-assets');
    expect(storageSql).toContain('security definer');
    expect(storageSql).toContain("set search_path = ''");
    expect(storageSql).toContain(
      'revoke all on function public.get_storage_bootstrap_status() from public',
    );
    expect(storageSql).toContain(
      'grant execute on function public.get_storage_bootstrap_status() to anon, authenticated',
    );
  });
});

describe('checkStorageBootstrap', () => {
  it('keeps local mode quiet when Supabase is not configured', async () => {
    await expect(checkStorageBootstrap(null)).resolves.toEqual({ status: 'unconfigured' });
  });

  it('reports ready when every required bucket exists and is private', async () => {
    const client = fakeClient([
      { bucket_id: 'catalog-assets', is_present: true, is_public: false },
    ]);

    await expect(checkStorageBootstrap(client)).resolves.toEqual({ status: 'ready' });
  });

  it('reports missing and public buckets separately', async () => {
    const client = fakeClient([
      { bucket_id: 'catalog-assets', is_present: false, is_public: false },
    ]);

    await expect(checkStorageBootstrap(client)).resolves.toEqual({
      status: 'issue',
      missingBuckets: ['catalog-assets'],
      publicBuckets: [],
    });
  });

  it('returns a safe error when the RPC fails', async () => {
    const client = fakeClient(null, { message: 'permission denied for table buckets' });

    await expect(checkStorageBootstrap(client)).resolves.toEqual({
      status: 'error',
      message: '无法确认远程存储状态，请检查网络、Supabase 配置和 Storage SQL 初始化。',
    });
  });

  it('returns a safe error when the client throws', async () => {
    const client = {
      rpc: async () => {
        throw new Error('network detail must not reach the UI');
      },
    } as unknown as SupabaseClient;

    await expect(checkStorageBootstrap(client)).resolves.toEqual({
      status: 'error',
      message: '无法确认远程存储状态，请检查网络、Supabase 配置和 Storage SQL 初始化。',
    });
  });

  it.each([
    null,
    {},
    [
      { bucket_id: 'catalog-assets', is_present: 'yes', is_public: false },
    ],
  ])('rejects malformed or incomplete RPC data %#', async (data) => {
    await expect(checkStorageBootstrap(fakeClient(data))).resolves.toEqual({
      status: 'error',
      message: '无法确认远程存储状态，请检查网络、Supabase 配置和 Storage SQL 初始化。',
    });
  });
});
