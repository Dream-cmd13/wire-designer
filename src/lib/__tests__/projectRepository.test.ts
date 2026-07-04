import { beforeEach, describe, expect, it } from 'vitest';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import { LocalProjectRepository } from '@/repositories/projectRepository';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

describe('LocalProjectRepository', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('saves and loads only deeply valid project documents', async () => {
    const repository = new LocalProjectRepository();
    const config = { ...createFallbackConfig(), id: 'config-1' };
    await repository.save('project-1', config);

    const result = await repository.load('project-1');
    expect(result).toEqual({ status: 'ok', config });
    expect(await repository.list()).toEqual(['project-1']);
  });

  it('preserves invalid raw data under a recovery key', async () => {
    const repository = new LocalProjectRepository();
    const raw = JSON.stringify({
      ...createFallbackConfig(),
      materials: [{ id: 'broken', name: 'broken', circuits: [] }],
    });
    localStorage.setItem('harness-project-config-project-2', raw);

    const result = await repository.load('project-2');
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.raw).toBe(raw);
      expect(localStorage.getItem(result.backupKey)).toBe(raw);
    }
  });

  it('never overwrites a valid project with an invalid document', async () => {
    const repository = new LocalProjectRepository();
    const config = { ...createFallbackConfig(), id: 'config-3' };
    await repository.save('project-3', config);

    await expect(repository.save('project-3', {
      ...config,
      materials: [{ id: 'broken' }],
    } as typeof config)).rejects.toThrow('项目结构校验失败');

    const result = await repository.load('project-3');
    expect(result.status).toBe('ok');
  });

  it('keeps the previous valid document as a non-destructive recovery point', async () => {
    const repository = new LocalProjectRepository();
    const original = { ...createFallbackConfig(), id: 'config-4', name: '原始版本' };
    await repository.save('project-4', original);
    await repository.save('project-4', { ...original, name: '当前版本', updatedAt: Date.now() + 1 });

    const points = await repository.listRecoveryPoints('project-4');
    expect(points).toHaveLength(1);
    expect(points[0].config.name).toBe('原始版本');

    const current = await repository.load('project-4');
    expect(current.status).toBe('ok');
    if (current.status === 'ok') expect(current.config.name).toBe('当前版本');
  });
});
