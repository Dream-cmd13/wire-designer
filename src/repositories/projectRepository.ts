import type { SupabaseClient } from '@supabase/supabase-js';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { supabase } from '@/lib/supabaseClient';
import type { HarnessConfig } from '@/types/harness';
import type { Project } from '@/types/user';

export type ProjectLoadResult =
  | { status: 'ok'; config: HarnessConfig }
  | { status: 'missing' }
  | { status: 'invalid'; raw: string; backupKey: string; issues: string[] };

export interface ProjectRepository {
  listProjects(userId: string): Promise<Project[]>;
  createProject(project: Project, config: HarnessConfig): Promise<void>;
  updateProject(projectId: string, updates: Partial<Project>): Promise<void>;
  load(projectId: string): Promise<ProjectLoadResult>;
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
      createdAt: Date.parse(String(row.created_at ?? '')) || Date.now(),
      updatedAt: Date.parse(String(row.updated_at ?? '')) || Date.now(),
    };
  }

  private validDocument(config: HarnessConfig): HarnessConfig {
    const result = parseHarnessConfig(config);
    if (!result.success) {
      throw new Error(`Invalid project document: ${result.issues.slice(0, 3).join('; ')}`);
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
    return (data ?? []).map((value) => this.toProject(value as Record<string, unknown>));
  }

  async createProject(project: Project, config: HarnessConfig): Promise<void> {
    const document = this.validDocument(config);
    if (document.id !== project.id) {
      throw new Error('Invalid project document: project id does not match config id');
    }
    const { error } = await this.client.from('projects').insert({
      id: project.id,
      owner_id: project.userId,
      name: project.name,
      description: project.description,
      config: document,
    });
    if (error) throw this.parseError(error);
  }

  async updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (Object.keys(payload).length === 0) return;
    payload.updated_at = new Date().toISOString();
    const { error } = await this.client.from('projects').update(payload).eq('id', projectId);
    if (error) throw this.parseError(error);
  }

  async load(projectId: string): Promise<ProjectLoadResult> {
    const { data, error } = await this.client
      .from('projects')
      .select('config')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw this.parseError(error);
    if (!data?.config) return { status: 'missing' };
    const raw = JSON.stringify(data.config);
    const result = parseHarnessConfig(data.config);
    if (result.success) return { status: 'ok', config: result.data };
    return {
      status: 'invalid',
      raw,
      backupKey: `supabase-project-recovery-${projectId}`,
      issues: result.issues,
    };
  }

  async save(projectId: string, config: HarnessConfig): Promise<void> {
    const document = this.validDocument(config);
    if (document.id !== projectId) {
      throw new Error('Invalid project document: project id does not match config id');
    }
    const { error } = await this.client
      .from('projects')
      .update({
        name: document.name,
        config: document,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
    if (error) throw this.parseError(error);
  }

  async remove(projectId: string): Promise<void> {
    const { error } = await this.client.from('projects').delete().eq('id', projectId);
    if (error) throw this.parseError(error);
  }

  emergencySave(projectId: string, config: HarnessConfig): void {
    void this.save(projectId, config)
      .catch((error) => console.error('Supabase emergency save failed', error));
  }
}

class MissingProjectRepository implements ProjectRepository {
  private unavailable(): Error {
    return new Error('Supabase 尚未配置，无法访问项目数据库。');
  }

  listProjects(): Promise<Project[]> { return Promise.reject(this.unavailable()); }
  createProject(): Promise<void> { return Promise.reject(this.unavailable()); }
  updateProject(): Promise<void> { return Promise.reject(this.unavailable()); }
  load(): Promise<ProjectLoadResult> { return Promise.reject(this.unavailable()); }
  save(): Promise<void> { return Promise.reject(this.unavailable()); }
  remove(): Promise<void> { return Promise.reject(this.unavailable()); }
  emergencySave(): void { /* no local fallback */ }
}

export const projectRepository: ProjectRepository = supabase
  ? new SupabaseProjectRepository(supabase)
  : new MissingProjectRepository();
