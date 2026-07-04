import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import type { HarnessConfig } from '@/types/harness';

const PROJECT_CONFIG_PREFIX = 'harness-project-config-';
const RECOVERY_PREFIX = 'harness-project-recovery-';
const SNAPSHOT_PREFIX = 'harness-project-snapshot-';
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SNAPSHOTS = 3;

export type ProjectLoadResult =
  | { status: 'ok'; config: HarnessConfig }
  | { status: 'missing' }
  | { status: 'invalid'; raw: string; backupKey: string; issues: string[] };

export interface ProjectRecoveryPoint {
  key: string;
  createdAt: number;
  config: HarnessConfig;
}

export interface ProjectRepository {
  list(): Promise<string[]>;
  load(projectId: string): Promise<ProjectLoadResult>;
  listRecoveryPoints(projectId: string): Promise<ProjectRecoveryPoint[]>;
  save(projectId: string, config: HarnessConfig): Promise<void>;
  remove(projectId: string): Promise<void>;
  emergencySave(projectId: string, config: HarnessConfig): void;
}

function configKey(projectId: string) {
  return `${PROJECT_CONFIG_PREFIX}${projectId}`;
}

function snapshotPrefix(projectId: string) {
  return `${SNAPSHOT_PREFIX}${projectId}-`;
}

function describeStorageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('浏览器本地存储空间不足，请先导出项目备份再清理空间。');
  }
  return error instanceof Error ? error : new Error('本地项目保存失败');
}

export class LocalProjectRepository implements ProjectRepository {
  async list(): Promise<string[]> {
    const projectIds: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PROJECT_CONFIG_PREFIX)) {
        projectIds.push(key.slice(PROJECT_CONFIG_PREFIX.length));
      }
    }
    return projectIds;
  }

  async load(projectId: string): Promise<ProjectLoadResult> {
    const raw = localStorage.getItem(configKey(projectId));
    if (raw === null) return { status: 'missing' };

    try {
      const parsed = JSON.parse(raw) as unknown;
      const result = parseHarnessConfig(parsed);
      if (result.success) return { status: 'ok', config: result.data };
      return this.preserveInvalid(projectId, raw, result.issues);
    } catch {
      return this.preserveInvalid(projectId, raw, ['文件不是有效的 JSON']);
    }
  }

  async save(projectId: string, config: HarnessConfig): Promise<void> {
    await this.captureSnapshot(projectId);
    this.write(projectId, config);
  }

  async remove(projectId: string): Promise<void> {
    localStorage.removeItem(configKey(projectId));
    const relatedKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (
        key?.startsWith(snapshotPrefix(projectId))
        || key?.startsWith(`${RECOVERY_PREFIX}${projectId}-`)
      ) relatedKeys.push(key);
    }
    relatedKeys.forEach((key) => localStorage.removeItem(key));
  }

  async listRecoveryPoints(projectId: string): Promise<ProjectRecoveryPoint[]> {
    const points: ProjectRecoveryPoint[] = [];
    const prefix = snapshotPrefix(projectId);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const createdAt = Number(key.slice(prefix.length));
      const raw = localStorage.getItem(key);
      if (!Number.isFinite(createdAt) || raw === null) continue;
      try {
        const result = parseHarnessConfig(JSON.parse(raw) as unknown);
        if (result.success) points.push({ key, createdAt, config: result.data });
      } catch {
        // Ignore an invalid snapshot; it is never used to overwrite live data.
      }
    }
    return points.sort((a, b) => b.createdAt - a.createdAt);
  }

  emergencySave(projectId: string, config: HarnessConfig): void {
    this.write(projectId, config);
  }

  private write(projectId: string, config: HarnessConfig): void {
    const result = parseHarnessConfig(config);
    if (!result.success) {
      throw new Error(`项目结构校验失败：${result.issues.slice(0, 3).join('；')}`);
    }
    try {
      localStorage.setItem(configKey(projectId), JSON.stringify(result.data));
    } catch (error) {
      throw describeStorageError(error);
    }
  }

  private preserveInvalid(projectId: string, raw: string, issues: string[]): ProjectLoadResult {
    const backupKey = `${RECOVERY_PREFIX}${projectId}-${Date.now()}`;
    try {
      localStorage.setItem(backupKey, raw);
    } catch {
      // Keep returning the raw payload so the UI can still offer a download.
    }
    return { status: 'invalid', raw, backupKey, issues };
  }

  private async captureSnapshot(projectId: string): Promise<void> {
    const previousRaw = localStorage.getItem(configKey(projectId));
    if (previousRaw === null) return;
    try {
      const previous = parseHarnessConfig(JSON.parse(previousRaw) as unknown);
      if (!previous.success) return;
      const points = await this.listRecoveryPoints(projectId);
      const now = Date.now();
      if (points[0] && now - points[0].createdAt < SNAPSHOT_INTERVAL_MS) return;
      localStorage.setItem(`${snapshotPrefix(projectId)}${now}`, JSON.stringify(previous.data));
      const refreshed = await this.listRecoveryPoints(projectId);
      for (const point of refreshed.slice(MAX_SNAPSHOTS)) {
        localStorage.removeItem(point.key);
      }
    } catch {
      // A recovery snapshot is best effort and must never block the primary save.
    }
  }
}

export const projectRepository: ProjectRepository = new LocalProjectRepository();
