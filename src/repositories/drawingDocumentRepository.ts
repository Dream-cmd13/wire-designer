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
    if (!this.client) {
      throw new DrawingDocumentRepositoryError('Supabase 尚未配置，无法保存图纸。');
    }
    return this.client;
  }

  private throwIfError(error: { message?: string } | null): void {
    if (error) {
      throw new DrawingDocumentRepositoryError(error.message ?? '图纸数据库操作失败。');
    }
  }

  async list(ownerId: string): Promise<DrawingDocument[]> {
    const { data, error } = await this.requireClient()
      .from('drawings')
      .select('document')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });
    this.throwIfError(error);
    return (data ?? [])
      .map((row) => (row as Record<string, unknown>).document)
      .filter(isDrawingDocument);
  }

  async load(documentId: string): Promise<DrawingDocument | null> {
    const { data, error } = await this.requireClient()
      .from('drawings')
      .select('document')
      .eq('id', documentId)
      .maybeSingle();
    this.throwIfError(error);
    const document = (data as Record<string, unknown> | null)?.document;
    return isDrawingDocument(document) ? document : null;
  }

  async save(ownerId: string, document: DrawingDocument): Promise<void> {
    if (!isDrawingDocument(document)) {
      throw new DrawingDocumentRepositoryError('图纸结构校验失败。');
    }
    const { error } = await this.requireClient().from('drawings').upsert({
      id: document.id,
      owner_id: ownerId,
      document,
      updated_at: new Date().toISOString(),
    });
    this.throwIfError(error);
  }

  async remove(ownerId: string, documentId: string): Promise<void> {
    const { error } = await this.requireClient()
      .from('drawings')
      .delete()
      .eq('id', documentId)
      .eq('owner_id', ownerId);
    this.throwIfError(error);
  }
}

export const drawingDocumentRepository = new DrawingDocumentRepository();
