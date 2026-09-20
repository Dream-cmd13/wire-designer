import type { SupabaseClient } from '@supabase/supabase-js';

const REQUIRED_STORAGE_BUCKETS = ['catalog-assets'] as const;
const STORAGE_STATUS_ERROR_MESSAGE =
  '文件服务状态暂时无法确认，请检查网络后重试；如持续出现，请联系管理员。';

interface StorageBootstrapRow {
  bucket_id: string;
  is_present: boolean;
  is_public: boolean;
}

export type StorageBootstrapState =
  | { status: 'unconfigured' }
  | { status: 'ready' }
  | { status: 'issue'; missingBuckets: string[]; publicBuckets: string[] }
  | { status: 'error'; message: string };

function errorState(): StorageBootstrapState {
  return { status: 'error', message: STORAGE_STATUS_ERROR_MESSAGE };
}

function isStorageBootstrapRow(value: unknown): value is StorageBootstrapRow {
  if (!value || typeof value !== 'object') return false;

  const row = value as Record<string, unknown>;
  return typeof row.bucket_id === 'string'
    && typeof row.is_present === 'boolean'
    && typeof row.is_public === 'boolean';
}

export async function checkStorageBootstrap(
  client: SupabaseClient | null,
): Promise<StorageBootstrapState> {
  if (!client) return { status: 'unconfigured' };

  try {
    const { data, error } = await client.rpc('get_storage_bootstrap_status');
    if (error || !Array.isArray(data)) return errorState();

    const rows = data.filter(isStorageBootstrapRow);
    if (rows.length !== data.length) return errorState();

    const rowsById = new Map(rows.map((row) => [row.bucket_id, row]));
    if (REQUIRED_STORAGE_BUCKETS.some((bucketId) => !rowsById.has(bucketId))) {
      return errorState();
    }

    const missingBuckets = REQUIRED_STORAGE_BUCKETS.filter(
      (bucketId) => !rowsById.get(bucketId)?.is_present,
    );
    const publicBuckets = REQUIRED_STORAGE_BUCKETS.filter((bucketId) => {
      const row = rowsById.get(bucketId);
      return Boolean(row?.is_present && row.is_public);
    });

    if (missingBuckets.length > 0 || publicBuckets.length > 0) {
      return { status: 'issue', missingBuckets: [...missingBuckets], publicBuckets: [...publicBuckets] };
    }

    return { status: 'ready' };
  } catch {
    return errorState();
  }
}
