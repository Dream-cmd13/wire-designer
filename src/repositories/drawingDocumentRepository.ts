import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentWriteError, toDocumentWriteError } from '@/lib/documentWriteError';
import { isDrawingDocument } from '@/lib/drawingDocumentSchema';
import { supabase } from '@/lib/supabaseClient';
import type { DocumentVersion } from '@/types/document';
import type { DrawingDocument } from '@/types/drawing';

export class DrawingDocumentRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawingDocumentRepositoryError';
  }
}

export interface DrawingDocumentEntry {
  document: DrawingDocument;
  version: DocumentVersion;
}

type Row = Record<string, unknown>;

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

  private toVersion(row: Row): DocumentVersion {
    const revision = Number(row.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      throw new DocumentWriteError('network', '云端返回的图纸版本信息无效，请重试。');
    }
    return { revision, updatedAt: String(row.updated_at ?? '') };
  }

  async list(_ownerId: string): Promise<DrawingDocumentEntry[]> {
    const { data, error } = await this.requireClient()
      .from('drawings')
      .select('id,document,revision,updated_at')
      .eq('owner_id', _ownerId)
      .order('updated_at', { ascending: false });
    if (error) throw new DrawingDocumentRepositoryError(error.message ?? '图纸数据库操作失败。');
    const entries: DrawingDocumentEntry[] = [];
    for (const row of data ?? []) {
      const record = row as Row;
      if (isDrawingDocument(record.document)) {
        entries.push({ document: record.document, version: this.toVersion(record) });
        continue;
      }
      console.warn(`已跳过结构损坏的图纸记录（原始数据仍保留在数据库中）：${String(record.id ?? '未知 ID')}`);
    }
    return entries;
  }

  async load(documentId: string): Promise<DrawingDocumentEntry | null> {
    const { data, error } = await this.requireClient()
      .from('drawings')
      .select('document,revision,updated_at')
      .eq('id', documentId)
      .maybeSingle();
    if (error) throw new DrawingDocumentRepositoryError(error.message ?? '图纸数据库操作失败。');
    const record = data as Row | null;
    if (!record || !isDrawingDocument(record.document)) return null;
    return { document: record.document, version: this.toVersion(record) };
  }

  /** expected 为 null 表示新建（只 INSERT，不会复活已删除的旧图纸）。 */
  async save(
    _ownerId: string,
    document: DrawingDocument,
    expected: DocumentVersion | null,
  ): Promise<DocumentVersion> {
    if (!isDrawingDocument(document)) {
      throw new DrawingDocumentRepositoryError('图纸结构校验失败。');
    }
    const { data, error } = await this.requireClient().rpc('save_drawing_document', {
      document_id: document.id,
      expected_revision: expected?.revision ?? null,
      document_payload: document,
    });
    if (error) throw toDocumentWriteError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') {
      throw new DocumentWriteError('network', '云端未返回图纸保存结果，请重试。');
    }
    return this.toVersion(row as Row);
  }

  async remove(_ownerId: string, documentId: string, expected: DocumentVersion): Promise<void> {
    const { error } = await this.requireClient().rpc('delete_drawing_document', {
      document_id: documentId,
      expected_revision: expected.revision,
    });
    if (error) throw toDocumentWriteError(error);
  }
}

export const drawingDocumentRepository = new DrawingDocumentRepository();
