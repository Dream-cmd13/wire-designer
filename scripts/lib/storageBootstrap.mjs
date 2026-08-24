export const REQUIRED_STORAGE_BUCKETS = Object.freeze([
  Object.freeze({ id: 'catalog-assets', public: false }),
]);

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
  return String(error ?? 'Unknown error');
}

async function findBucket(storage, id) {
  const { data, error } = await storage.listBuckets({ search: id, limit: 100 });
  if (error) {
    throw new Error(`Failed to inspect Storage bucket ${id}: ${errorMessage(error)}`);
  }

  return (data ?? []).find((bucket) => bucket.id === id) ?? null;
}

export async function ensureStorageBuckets(storage, specs = REQUIRED_STORAGE_BUCKETS) {
  const actions = [];

  for (const spec of specs) {
    let bucket = await findBucket(storage, spec.id);

    if (!bucket) {
      const { error } = await storage.createBucket(spec.id, { public: spec.public });
      if (!error) {
        actions.push({ id: spec.id, action: 'created' });
        continue;
      }

      bucket = await findBucket(storage, spec.id);
      if (!bucket) {
        throw new Error(`Failed to create Storage bucket ${spec.id}: ${errorMessage(error)}`);
      }
    }

    if (!bucket.public) {
      actions.push({ id: spec.id, action: 'unchanged' });
      continue;
    }

    const { error } = await storage.updateBucket(spec.id, {
      public: spec.public,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    });
    if (error) {
      throw new Error(
        `Failed to make Storage bucket ${spec.id} private: ${errorMessage(error)}`,
      );
    }

    actions.push({ id: spec.id, action: 'updated' });
  }

  return actions;
}

export async function removeStorageBucket(storage, id) {
  const bucket = await findBucket(storage, id);
  if (!bucket) return 'absent';

  const { error: emptyError } = await storage.emptyBucket(id);
  if (emptyError) {
    throw new Error(`Failed to empty Storage bucket ${id}: ${errorMessage(emptyError)}`);
  }

  const { error: deleteError } = await storage.deleteBucket(id);
  if (deleteError) {
    throw new Error(`Failed to delete Storage bucket ${id}: ${errorMessage(deleteError)}`);
  }

  return 'deleted';
}

export async function runStorageBootstrap({
  env,
  createStorageClient,
  log = console.log,
  logError = console.error,
}) {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    logError('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SECRET_KEY.');
    return 1;
  }

  try {
    const storage = createStorageClient(url, secretKey);
    const actions = await ensureStorageBuckets(storage);
    for (const { id, action } of actions) {
      log(`${id}: ${action}`);
    }
    log('Storage bootstrap completed.');
    return 0;
  } catch (error) {
    logError(`Storage bootstrap failed: ${errorMessage(error)}`);
    return 1;
  }
}
