import { describe, expect, it } from 'vitest';
import {
  ensureStorageBuckets,
  removeStorageBucket,
  runStorageBootstrap,
} from './storageBootstrap.mjs';

function makeBucket(bucket) {
  return {
    id: bucket.id,
    name: bucket.id,
    owner: '',
    public: bucket.public,
    file_size_limit: bucket.file_size_limit ?? null,
    allowed_mime_types: bucket.allowed_mime_types ?? null,
    created_at: '2026-08-17T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
  };
}

function createFakeStorage(initialBuckets = [], options = {}) {
  const buckets = new Map(initialBuckets.map((bucket) => [bucket.id, makeBucket(bucket)]));

  return {
    async listBuckets({ search } = {}) {
      if (options.listError) {
        return { data: null, error: new Error(options.listError) };
      }

      const data = [...buckets.values()].filter((bucket) => !search || bucket.id.includes(search));
      return { data, error: null };
    },

    async createBucket(id, createOptions) {
      if (options.createRaceFor === id) {
        buckets.set(id, makeBucket({ id, public: false }));
        return { data: null, error: new Error('Bucket already exists') };
      }
      if (options.createErrorFor === id) {
        return { data: null, error: new Error('Create denied') };
      }
      if (buckets.has(id)) {
        return { data: null, error: new Error('Bucket already exists') };
      }

      buckets.set(id, makeBucket({ id, public: createOptions.public }));
      return { data: { name: id }, error: null };
    },

    async updateBucket(id, updateOptions) {
      if (options.updateErrorFor === id) {
        return { data: null, error: new Error('Update denied') };
      }

      const bucket = buckets.get(id);
      if (!bucket) {
        return { data: null, error: new Error('Bucket not found') };
      }

      buckets.set(id, {
        ...bucket,
        public: updateOptions.public,
        file_size_limit: updateOptions.fileSizeLimit,
        allowed_mime_types: updateOptions.allowedMimeTypes,
      });
      return { data: { message: 'Successfully updated' }, error: null };
    },

    async emptyBucket(id) {
      if (options.emptyErrorFor === id) {
        return { data: null, error: new Error('Empty denied') };
      }
      if (!buckets.has(id)) {
        return { data: null, error: new Error('Bucket not found') };
      }
      return { data: { message: 'Successfully emptied' }, error: null };
    },

    async deleteBucket(id) {
      if (options.deleteErrorFor === id) {
        return { data: null, error: new Error('Delete denied') };
      }
      if (!buckets.has(id)) {
        return { data: null, error: new Error('Bucket not found') };
      }
      buckets.delete(id);
      return { data: { message: 'Successfully deleted' }, error: null };
    },

    snapshot() {
      return [...buckets.values()].sort((left, right) => left.id.localeCompare(right.id));
    },
  };
}

describe('ensureStorageBuckets', () => {
  it('creates every missing bucket as private', async () => {
    const storage = createFakeStorage();

    await expect(ensureStorageBuckets(storage)).resolves.toEqual([
      { id: 'catalog-assets', action: 'created' },
    ]);
    expect(storage.snapshot()).toEqual([
      expect.objectContaining({ id: 'catalog-assets', public: false }),
    ]);
  });

  it('repairs a public bucket without discarding its upload limits', async () => {
    const storage = createFakeStorage([
      {
        id: 'catalog-assets',
        public: true,
        file_size_limit: 4096,
        allowed_mime_types: ['image/png'],
      },
    ]);

    await expect(ensureStorageBuckets(storage)).resolves.toEqual([
      { id: 'catalog-assets', action: 'updated' },
    ]);
    expect(storage.snapshot()).toContainEqual(expect.objectContaining({
      id: 'catalog-assets',
      public: false,
      file_size_limit: 4096,
      allowed_mime_types: ['image/png'],
    }));
  });

  it('does not modify buckets that are already private', async () => {
    const storage = createFakeStorage([
      { id: 'catalog-assets', public: false },
    ]);

    await expect(ensureStorageBuckets(storage)).resolves.toEqual([
      { id: 'catalog-assets', action: 'unchanged' },
    ]);
  });

  it('treats a concurrent successful creation as an idempotent result', async () => {
    const storage = createFakeStorage([], { createRaceFor: 'catalog-assets' });

    await expect(ensureStorageBuckets(storage)).resolves.toEqual([
      { id: 'catalog-assets', action: 'unchanged' },
    ]);
    expect(storage.snapshot()).toContainEqual(expect.objectContaining({
      id: 'catalog-assets',
      public: false,
    }));
  });

  it('fails when bucket state cannot be read', async () => {
    const storage = createFakeStorage([], { listError: 'Storage unavailable' });

    await expect(ensureStorageBuckets(storage)).rejects.toThrow(
      'Failed to inspect Storage bucket catalog-assets: Storage unavailable',
    );
  });

  it('fails when a missing bucket cannot be created', async () => {
    const storage = createFakeStorage([], { createErrorFor: 'catalog-assets' });

    await expect(ensureStorageBuckets(storage)).rejects.toThrow(
      'Failed to create Storage bucket catalog-assets: Create denied',
    );
  });

  it('fails when a public bucket cannot be made private', async () => {
    const storage = createFakeStorage(
      [
        { id: 'catalog-assets', public: true },
      ],
      { updateErrorFor: 'catalog-assets' },
    );

    await expect(ensureStorageBuckets(storage)).rejects.toThrow(
      'Failed to make Storage bucket catalog-assets private: Update denied',
    );
  });
});

describe('removeStorageBucket', () => {
  it('empties and deletes the requested bucket through the Storage API', async () => {
    const storage = createFakeStorage([
      { id: 'catalog-assets', public: false },
      { id: 'project-assets', public: false },
    ]);

    await expect(removeStorageBucket(storage, 'project-assets')).resolves.toBe('deleted');
    expect(storage.snapshot()).toEqual([
      expect.objectContaining({ id: 'catalog-assets', public: false }),
    ]);
  });

  it('is idempotent when the obsolete bucket does not exist', async () => {
    const storage = createFakeStorage([{ id: 'catalog-assets', public: false }]);

    await expect(removeStorageBucket(storage, 'project-assets')).resolves.toBe('absent');
  });

  it('stops before deletion when emptying the bucket fails', async () => {
    const storage = createFakeStorage(
      [{ id: 'project-assets', public: false }],
      { emptyErrorFor: 'project-assets' },
    );

    await expect(removeStorageBucket(storage, 'project-assets')).rejects.toThrow(
      'Failed to empty Storage bucket project-assets: Empty denied',
    );
    expect(storage.snapshot()).toHaveLength(1);
  });

  it('reports a failed bucket deletion', async () => {
    const storage = createFakeStorage(
      [{ id: 'project-assets', public: false }],
      { deleteErrorFor: 'project-assets' },
    );

    await expect(removeStorageBucket(storage, 'project-assets')).rejects.toThrow(
      'Failed to delete Storage bucket project-assets: Delete denied',
    );
  });
});

describe('runStorageBootstrap', () => {
  it('returns a failure code when server-side credentials are missing', async () => {
    const errors = [];

    const exitCode = await runStorageBootstrap({
      env: {},
      createStorageClient: () => {
        throw new Error('client creation should not run');
      },
      log: () => undefined,
      logError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SECRET_KEY.',
    ]);
  });

  it('reports each idempotent action and returns success', async () => {
    const output = [];
    const storage = createFakeStorage();

    const exitCode = await runStorageBootstrap({
      env: {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'server-only-test-key',
      },
      createStorageClient: () => storage,
      log: (message) => output.push(message),
      logError: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(output).toEqual([
      'catalog-assets: created',
      'Storage bootstrap completed.',
    ]);
  });

  it('returns a failure code when the management API fails', async () => {
    const errors = [];

    const exitCode = await runStorageBootstrap({
      env: {
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-server-only-test-key',
      },
      createStorageClient: () => createFakeStorage([], { listError: 'Storage unavailable' }),
      log: () => undefined,
      logError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      'Storage bootstrap failed: Failed to inspect Storage bucket catalog-assets: Storage unavailable',
    ]);
  });
});
