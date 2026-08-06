import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import type { DrawingDocument } from '@/types/drawing';

export class DrawingDocumentRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingDocumentRepositoryError';
  }
}

function isDrawingDocument(value: unknown): value is DrawingDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value as Partial<DrawingDocument>;
  return document.schemaVersion === 1
    && typeof document.id === 'string'
    && typeof document.name === 'string'
    && typeof document.createdAt === 'number'
    && typeof document.updatedAt === 'number'
    && Array.isArray(document.objects)
    && Array.isArray(document.revisionTable)
    && Array.isArray(document.techRequirements)
    && Boolean(document.page)
    && Boolean(document.titleBlock);
}

export class DrawingDocumentRepository {
  private readonly client: SupabaseClient | null;

  constructor(client: SupabaseClient | null = supabase) {
    this.client = client;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new DrawingDocumentRepositoryError('Supabase 尚未配置，无法保存图纸。');
    return this.client;
  }

  private throwIfError(error: { message?: string } | null): void {
    if (error) throw new DrawingDocumentRepositoryError(error.message ?? '图纸数据库操作失败。');
  }

  async list(ownerId: string): Promise<DrawingDocument[]> {
    const { data, error } = await this.requireClient().from('drawing_documents')
      .select('drawing_json').eq('owner_id', ownerId).is('deleted_at', null).order('updated_at', { ascending: false });
    this.throwIfError(error);
    return (data ?? [])
      .map((row) => (row as Record<string, unknown>).drawing_json)
      .filter(isDrawingDocument);
  }

  async load(documentId: string): Promise<DrawingDocument | null> {
    const { data, error } = await this.requireClient().from('drawing_documents')
      .select('drawing_json').eq('id', documentId).is('deleted_at', null).maybeSingle();
    this.throwIfError(error);
    const document = (data as Record<string, unknown> | null)?.drawing_json;
    return isDrawingDocument(document) ? document : null;
  }

  async save(ownerId: string, document: DrawingDocument, projectId?: string | null): Promise<void> {
    if (!isDrawingDocument(document)) throw new DrawingDocumentRepositoryError('图纸结构校验失败。');
    const client = this.requireClient();
    const { data: current, error: readError } = await client.from('drawing_documents')
      .select('revision').eq('id', document.id).eq('owner_id', ownerId).maybeSingle();
    this.throwIfError(readError);
    const revision = Number(current?.revision ?? 0) + 1;
    const { error } = await client.from('drawing_documents').upsert({
      id: document.id,
      owner_id: ownerId,
      project_id: projectId ?? null,
      name: document.name,
      drawing_json: document,
      schema_version: document.schemaVersion,
      revision,
      updated_at: new Date().toISOString(),
    });
    this.throwIfError(error);
    const { error: versionError } = await client.from('drawing_document_versions').insert({
      drawing_id: document.id,
      revision,
      drawing_json: document,
      schema_version: document.schemaVersion,
    });
    this.throwIfError(versionError);
  }

  async remove(ownerId: string, documentId: string): Promise<void> {
    const { error } = await this.requireClient().from('drawing_documents').update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', documentId).eq('owner_id', ownerId);
    this.throwIfError(error);
  }
}

export const drawingDocumentRepository = new DrawingDocumentRepository();
