import type { SupabaseClient } from '@supabase/supabase-js';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import type { HarnessConfig } from '@/types/harness';
import type { Project } from '@/types/user';
import { supabase } from '@/lib/supabaseClient';

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
  listProjects(userId: string): Promise<Project[]>;
  createProject(project: Project, config: HarnessConfig): Promise<void>;
  updateProject(projectId: string, updates: Partial<Project>): Promise<void>;
  load(projectId: string): Promise<ProjectLoadResult>;
  listRecoveryPoints(projectId: string): Promise<ProjectRecoveryPoint[]>;
  save(projectId: string, config: HarnessConfig): Promise<void>;
  remove(projectId: string): Promise<void>;
  emergencySave(projectId: string, config: HarnessConfig): void;
}

export class SupabaseProjectRepository implements ProjectRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private parseError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Supabase operation failed.');
  }

  private toProject(row: Record<string, unknown>): Project {
    return {
      id: String(row.id),
      userId: String(row.owner_id),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      harnessConfigId: String(row.id),
      createdAt: Date.parse(String(row.created_at ?? '')) || Date.now(),
      updatedAt: Date.parse(String(row.updated_at ?? '')) || Date.now(),
      status: row.status === 'in_progress' || row.status === 'completed' || row.status === 'archived' ? row.status : 'draft',
    };
  }

  async list(): Promise<string[]> {
    const { data: user } = await this.client.auth.getUser();
    if (!user.user) return [];
    return (await this.listProjects(user.user.id)).map((project) => project.id);
  }

  async listProjects(userId: string): Promise<Project[]> {
    const { data, error } = await this.client.from('projects')
      .select('id,owner_id,name,description,status,created_at,updated_at')
      .eq('owner_id', userId).is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw this.parseError(error);
    return (data ?? []).map((value) => this.toProject(value as Record<string, unknown>));
  }

  async createProject(project: Project, config: HarnessConfig): Promise<void> {
    const { error: projectError } = await this.client.from('projects').insert({
      id: project.id,
      owner_id: project.userId,
      name: project.name,
      description: project.description,
      status: project.status,
    });
    if (projectError) throw this.parseError(projectError);
    await this.save(project.id, config);
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.status !== undefined) payload.status = updates.status;
    if (Object.keys(payload).length === 0) return;
    payload.updated_at = new Date().toISOString();
    const { error } = await this.client.from('projects').update(payload).eq('id', projectId);
    if (error) throw this.parseError(error);
  }

  async load(projectId: string): Promise<ProjectLoadResult> {
    const { data, error } = await this.client.from('project_documents')
      .select('document').eq('project_id', projectId).maybeSingle();
    if (error) throw this.parseError(error);
    if (!data?.document) return { status: 'missing' };
    const raw = JSON.stringify(data.document);
    const result = parseHarnessConfig(data.document);
    if (result.success) return { status: 'ok', config: result.data };
    return { status: 'invalid', raw, backupKey: `supabase-project-recovery-${projectId}`, issues: result.issues };
  }

  async save(projectId: string, config: HarnessConfig): Promise<void> {
    const result = parseHarnessConfig(config);
    if (!result.success) throw new Error(`Invalid project document: ${result.issues.slice(0, 3).join('; ')}`);

    const { data: current, error: readError } = await this.client.from('project_documents')
      .select('revision').eq('project_id', projectId).maybeSingle();
    if (readError) throw this.parseError(readError);
    const revision = Number(current?.revision ?? 0) + 1;
    const document = result.data;
    const { error } = await this.client.from('project_documents').upsert({
      project_id: projectId,
      document,
      schema_version: document.schemaVersion,
      revision,
      updated_at: new Date().toISOString(),
    });
    if (error) throw this.parseError(error);
    const { error: versionError } = await this.client.from('project_document_versions').insert({
      project_id: projectId,
      revision,
      document,
      schema_version: document.schemaVersion,
    });
    if (versionError) throw this.parseError(versionError);
    await this.updateProject(projectId, { name: document.name });
  }

  async remove(projectId: string): Promise<void> {
    const { error } = await this.client.from('projects').update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);
    if (error) throw this.parseError(error);
  }

  async listRecoveryPoints(projectId: string): Promise<ProjectRecoveryPoint[]> {
    const { data, error } = await this.client.from('project_document_versions')
      .select('revision,created_at,document').eq('project_id', projectId).order('revision', { ascending: false });
    if (error) throw this.parseError(error);
    const points: ProjectRecoveryPoint[] = [];
    for (const value of data ?? []) {
      const row = value as Record<string, unknown>;
      const result = parseHarnessConfig(row.document);
      if (!result.success) continue;
      points.push({
        key: `${projectId}:${String(row.revision)}`,
        createdAt: Date.parse(String(row.created_at ?? '')) || Date.now(),
        config: result.data,
      });
    }
    return points;
  }

  emergencySave(projectId: string, config: HarnessConfig): void {
    void this.save(projectId, config).catch((error) => console.error('Supabase emergency save failed', error));
  }
}

class MissingProjectRepository implements ProjectRepository {
  private unavailable(): Error {
    return new Error('Supabase 尚未配置，无法访问项目数据库。');
  }
  list(): Promise<string[]> { return Promise.reject(this.unavailable()); }
  listProjects(): Promise<Project[]> { return Promise.reject(this.unavailable()); }
  createProject(): Promise<void> { return Promise.reject(this.unavailable()); }
  updateProject(): Promise<void> { return Promise.reject(this.unavailable()); }
  load(): Promise<ProjectLoadResult> { return Promise.reject(this.unavailable()); }
  listRecoveryPoints(): Promise<ProjectRecoveryPoint[]> { return Promise.reject(this.unavailable()); }
  save(): Promise<void> { return Promise.reject(this.unavailable()); }
  remove(): Promise<void> { return Promise.reject(this.unavailable()); }
  emergencySave(): void { /* no local fallback */ }
}

export const projectRepository: ProjectRepository = supabase
  ? new SupabaseProjectRepository(supabase)
  : new MissingProjectRepository();
