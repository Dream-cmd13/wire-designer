import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { MODEL_LIMITS, type ModelFormat, type ParsedModel, type StlUnit } from '@/lib/models/modelTypes';
import { validateModelFile } from '@/lib/models/modelParser';

export interface ModelAsset {
  id: string; owner_id: string; original_name: string; format: ModelFormat; source_unit: StlUnit;
  object_key: string; file_size: number; sha256: string; status: 'uploading' | 'ready';
  bounds_mm: ParsedModel['boundsMm']; created_at?: string; updated_at?: string;
}
export type SavePhase = 'uploading' | 'finalizing';
export async function modelSha256(file: Blob): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), (v) => v.toString(16).padStart(2, '0')).join('');
}
export async function createModelSaveSession(ownerId: string, file: File, unit: StlUnit, model: ParsedModel, id = crypto.randomUUID()): Promise<ModelAsset> {
  const format = validateModelFile(file);
  const extension = file.name.split('.').pop()!.toLowerCase();
  return { id, owner_id: ownerId, original_name: file.name, format, source_unit: format === 'step' ? 'mm' : unit,
    object_key: `${ownerId}/${id}/source.${extension}`, file_size: file.size, sha256: await modelSha256(file), status: 'uploading', bounds_mm: model.boundsMm };
}
function checkAbort(signal: AbortSignal) { signal.throwIfAborted(); }
function missing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: number | string; statusCode?: number | string; code?: string; message?: string };
  return [value.status, value.statusCode].some((code) => String(code) === '404')
    || value.code === 'not_found' || value.code === 'NoSuchKey'
    || (String(value.status) === '400' && value.message === 'Object not found');
}
function sameFile(a: ModelAsset, b: ModelAsset) {
  return a.id === b.id && a.owner_id === b.owner_id && a.object_key === b.object_key && Number(a.file_size) === Number(b.file_size)
    && a.sha256 === b.sha256 && a.format === b.format && a.source_unit === b.source_unit;
}

export class ModelRepository {
  private readonly client: SupabaseClient | null;
  private readonly fetcher: typeof fetch;
  constructor(client: SupabaseClient | null = supabase, fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) { this.client = client; this.fetcher = fetcher; }
  get configured() { return Boolean(this.client); }
  private requireClient() {
    if (!this.client) throw new Error('云端尚未配置，可继续本地预览，暂时无法保存。');
    return this.client;
  }
  async list(ownerId: string, signal: AbortSignal, page = 0): Promise<ModelAsset[]> {
    checkAbort(signal);
    const { data, error } = await this.requireClient().from('model_assets').select('*').eq('owner_id', ownerId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 20, page * 20 + 19).abortSignal(signal);
    checkAbort(signal);
    if (error) throw new Error('无法读取本人模型列表，请检查网络及模型数据库迁移后重试。');
    return (data ?? []) as ModelAsset[];
  }
  async get(id: string, signal: AbortSignal): Promise<ModelAsset | null> {
    checkAbort(signal);
    const { data, error } = await this.requireClient().from('model_assets').select('*').eq('id', id).abortSignal(signal).maybeSingle();
    checkAbort(signal);
    if (error) throw new Error('无法读取模型记录，请检查网络及访问权限后重试。');
    return data as ModelAsset | null;
  }
  /** A fresh signed URL on every attempt; never persisted or logged. */
  private async readObject(asset: ModelAsset, signal: AbortSignal): Promise<Blob | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      checkAbort(signal);
      const { data, error } = await this.requireClient().storage.from('model-files').createSignedUrl(asset.object_key, 120);
      checkAbort(signal);
      if (missing(error)) return null;
      if (error || !data?.signedUrl) throw new Error('无法获取私有模型文件，请检查网络、权限和模型存储配置后重试。');
      const response = await this.fetcher(data.signedUrl, { signal, cache: 'no-store' });
      if (response.status === 404) return null;
      if ((response.status === 401 || response.status === 403) && attempt === 0) continue;
      if (!response.ok) throw new Error('模型下载失败，请检查网络或重新登录后重试。');
      const length = Number(response.headers.get('content-length'));
      if (length > MODEL_LIMITS.maxBytes) throw new Error('云端模型超过 20 MiB 上限。');
      // Enforce the limit while streaming too, including chunked responses.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('模型下载内容为空。');
      const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
      try {
        while (true) {
          checkAbort(signal);
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MODEL_LIMITS.maxBytes) { await reader.cancel(); throw new Error('云端模型超过 20 MiB 上限。'); }
          chunks.push(new Uint8Array(value));
        }
      } finally { reader.releaseLock(); }
      return new Blob(chunks);
    }
    throw new Error('模型下载签名失效，请重新登录后重试。');
  }
  private async verify(asset: ModelAsset, blob: Blob, signal: AbortSignal) {
    checkAbort(signal);
    if (blob.size !== Number(asset.file_size) || await modelSha256(blob) !== asset.sha256) throw new Error('文件大小或 SHA-256 不匹配，请选择保存时的原文件，勿覆盖云端对象。');
    checkAbort(signal);
  }
  async download(asset: ModelAsset, signal: AbortSignal): Promise<File> {
    const blob = await this.readObject(asset, signal);
    if (!blob) throw new Error('云端未找到文件，请重新选择原文件以恢复保存。');
    await this.verify(asset, blob, signal);
    return new File([blob], asset.original_name, { type: 'application/octet-stream' });
  }
  async save(session: ModelAsset, file: File | undefined, signal: AbortSignal, onPhase?: (phase: SavePhase) => void): Promise<ModelAsset> {
    const client = this.requireClient(); checkAbort(signal);
    onPhase?.('uploading');
    // A recovery session may already have a valid remote object. Any selected local
    // file must still match, otherwise its preview must never be labelled saved.
    if (file) await this.verify(session, file, signal);
    let record = await this.get(session.id, signal);
    if (!record) {
      const { data, error } = await client.from('model_assets').insert(session).select('*').abortSignal(signal).single();
      checkAbort(signal);
      if (error) {
        record = await this.get(session.id, signal); // uncertain insert result, including duplicate id
        if (!record) throw new Error('创建模型数据库记录失败，请检查配置后重试。');
      } else record = data as ModelAsset;
    }
    if (!sameFile(record!, session)) throw new Error('保存记录与当前文件不匹配，请重新打开模型后重试。');
    if (record!.status === 'ready') return record!;
    let object = await this.readObject(session, signal);
    if (!object) {
      if (!file) throw new Error('文件尚未上传，请重新选择原文件以恢复保存（将校验大小和 SHA-256）。');
      // This SDK upload has no AbortSignal option. The owner record remains recoverable
      // if navigation cancels our session while the server is still receiving bytes.
      const { error } = await client.storage.from('model-files').upload(session.object_key, file, { upsert: false, contentType: 'application/octet-stream' });
      checkAbort(signal);
      if (error) {
        object = await this.readObject(session, signal);
        if (!object) throw new Error('原文件上传失败，记录已保留，请重试保存。');
        await this.verify(session, object, signal);
      }
    } else await this.verify(session, object, signal);
    checkAbort(signal); onPhase?.('finalizing');
    const { data, error } = await client.from('model_assets').update({ status: 'ready' }).eq('id', session.id)
      .eq('status', 'uploading').select('*').abortSignal(signal).single();
    checkAbort(signal);
    if (error || !data) {
      const latest = await this.get(session.id, signal);
      if (latest?.status === 'ready' && sameFile(latest, session)) return latest;
      throw new Error('原文件已上传，但数据库确认失败；尚未保存完成，请重试或从列表恢复保存。');
    }
    return data as ModelAsset;
  }
}
export const modelRepository = new ModelRepository();
