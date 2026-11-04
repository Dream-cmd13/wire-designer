import type { SupabaseClient } from '@supabase/supabase-js';
import { toDocumentWriteError, DocumentWriteError } from '@/lib/documentWriteError';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { supabase } from '@/lib/supabaseClient';
import type { DocumentVersion } from '@/types/document';
import type { HarnessConfig } from '@/types/harness';
import type { Project } from '@/types/user';

export type ProjectLoadResult =
  | { status: 'ok'; config: HarnessConfig; version: DocumentVersion }
  | { status: 'missing' }
  | { status: 'invalid'; raw: string; backupKey: string; issues: string[]; version: DocumentVersion };

export interface ProjectRepository {
  listProjects(userId: string): Promise<Project[]>;
  /** 新建：只 INSERT，不会覆盖同 ID 的既有文档；返回数据库版本。 */
  createProject(project: Project, config: HarnessConfig): Promise<DocumentVersion>;
  /** 改名/描述：与内容保存使用同一版本契约，只更新行字段。 */
  updateProject(projectId: string, updates: Partial<Project>, expected: DocumentVersion): Promise<DocumentVersion>;
  load(projectId: string): Promise<ProjectLoadResult>;
  /** expected 为 null 表示创建；更新必须提供读取到的版本。 */
  save(projectId: string, config: HarnessConfig, expected: DocumentVersion | null): Promise<DocumentVersion>;
  remove(projectId: string, expected: DocumentVersion): Promise<void>;
}

type Row = Record<string, unknown>;

export class SupabaseProjectRepository implements ProjectRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private parseError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Supabase operation failed.');
  }

  private toProject(row: Row): Project {
    return {
      id: String(row.id),
      userId: String(row.owner_id),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      createdAt: Date.parse(String(row.created_at ?? '')) || Date.now(),
      updatedAt: Date.parse(String(row.updated_at ?? '')) || Date.now(),
    };
  }

  private toVersion(row: Row): DocumentVersion {
    const revision = Number(row.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      throw new DocumentWriteError('network', '云端返回的版本信息无效，请重试。');
    }
    return { revision, updatedAt: String(row.updated_at ?? '') };
  }

  private async callVersionRpc(name: string, params: Row): Promise<DocumentVersion> {
    const { data, error } = await this.client.rpc(name, params);
    if (error) throw toDocumentWriteError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') {
      throw new DocumentWriteError('network', '云端未返回保存结果，请重试。');
    }
    return this.toVersion(row as Row);
  }

  private validDocument(config: HarnessConfig, projectId: string): HarnessConfig {
    const result = parseHarnessConfig(config);
    if (!result.success) {
      throw new Error(`Invalid project document: ${result.issues.slice(0, 3).join('; ')}`);
    }
    if (result.data.id !== projectId) {
      throw new Error('Invalid project document: project id does not match config id');
    }
    return result.data;
  }

  async listProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.client
      .from('projects')
      .select('id,owner_id,name,description,created_at,updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw this.parseError(error);
    return (data ?? []).map((value) => this.toProject(value as Row));
  }

  async createProject(project: Project, config: HarnessConfig): Promise<DocumentVersion> {
    const document = this.validDocument(config, project.id);
    return this.callVersionRpc('save_project_document', {
      project_id: project.id,
      expected_revision: null,
      project_payload: document,
      project_description: project.description,
    });
  }

  async updateProject(
    projectId: string,
    updates: Partial<Project>,
    expected: DocumentVersion,
  ): Promise<DocumentVersion> {
    return this.callVersionRpc('update_project_metadata', {
      project_id: projectId,
      expected_revision: expected.revision,
      new_name: updates.name ?? null,
      new_description: updates.description ?? null,
    });
  }

  async load(projectId: string): Promise<ProjectLoadResult> {
    const { data, error } = await this.client
      .from('projects')
      .select('config,revision,updated_at')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw this.parseError(error);
    if (!data?.config) return { status: 'missing' };
    const row = data as Row;
    const raw = JSON.stringify(data.config);
    const result = parseHarnessConfig(data.config);
    const version = this.toVersion(row);
    if (result.success) {
      return { status: 'ok', config: result.data, version };
    }
    return {
      status: 'invalid',
      raw,
      backupKey: `supabase-project-recovery-${projectId}`,
      issues: result.issues,
      version,
    };
  }

  async save(
    projectId: string,
    config: HarnessConfig,
    expected: DocumentVersion | null,
  ): Promise<DocumentVersion> {
    const document = this.validDocument(config, projectId);
    return this.callVersionRpc('save_project_document', {
      project_id: projectId,
      expected_revision: expected?.revision ?? null,
      project_payload: document,
      project_description: null,
    });
  }

  async remove(projectId: string, expected: DocumentVersion): Promise<void> {
    const { error } = await this.client.rpc('delete_project_document', {
      project_id: projectId,
      expected_revision: expected.revision,
    });
    if (error) throw toDocumentWriteError(error);
  }
}

class MissingProjectRepository implements ProjectRepository {
  private unavailable(): Error {
    return new Error('Supabase 尚未配置，无法访问项目数据库。');
  }

  listProjects(): Promise<Project[]> { return Promise.reject(this.unavailable()); }
  createProject(): Promise<DocumentVersion> { return Promise.reject(this.unavailable()); }
  updateProject(): Promise<DocumentVersion> { return Promise.reject(this.unavailable()); }
  load(): Promise<ProjectLoadResult> { return Promise.reject(this.unavailable()); }
  save(): Promise<DocumentVersion> { return Promise.reject(this.unavailable()); }
  remove(): Promise<void> { return Promise.reject(this.unavailable()); }
}

export const projectRepository: ProjectRepository = supabase
  ? new SupabaseProjectRepository(supabase)
  : new MissingProjectRepository();
