import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'dwg-files';
const TABLE = 'dwg_assets';
const MAX_BYTES = 20 * 1024 * 1024;
export const DWG_PAGE_SIZE = 20;

export interface DwgAsset {
  id: string;
  owner_id: string;
  original_name: string;
  object_key: string;
  file_size: number;
  sha256: string;
  status: 'uploading' | 'ready';
}

export function validateDwgFile(file: Pick<File, 'name' | 'size'>) {
  if (!/\.dwg$/i.test(file.name)) throw new Error('请选择 .dwg 文件。');
  if (!file.size) throw new Error('DWG 文件为空。');
  if (file.size > MAX_BYTES) throw new Error('DWG 文件不能超过 20 MiB。');
}

async function sha256(file: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createDwgSaveSession(ownerId: string, file: File): Promise<DwgAsset> {
  validateDwgFile(file);
  const id = crypto.randomUUID();
  return { id, owner_id: ownerId, original_name: file.name, object_key: `${ownerId}/${id}/source.dwg`,
    file_size: file.size, sha256: await sha256(file), status: 'uploading' };
}

async function verify(asset: DwgAsset, file: Blob, signal: AbortSignal) {
  if (file.size > MAX_BYTES || file.size !== Number(asset.file_size) || await sha256(file) !== asset.sha256) {
    throw new Error('文件大小或 SHA-256 不匹配，请核对保存时的原文件。');
  }
  signal.throwIfAborted();
}

function isMissing(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number | string; statusCode?: string; code?: string; message?: string };
  return String(e.statusCode) === '404' || String(e.status) === '404' || e.code === 'not_found'
    || e.code === 'NoSuchKey' || (String(e.status) === '400' && e.message === 'Object not found');
}

function matchesAsset(record: DwgAsset, session: DwgAsset) {
  return record.id === session.id && record.owner_id === session.owner_id && record.object_key === session.object_key
    && Number(record.file_size) === Number(session.file_size) && record.sha256 === session.sha256;
}

export class DwgRepository {
  private readonly client: SupabaseClient | null;
  private readonly fetcher: typeof fetch;

  constructor(
    client: SupabaseClient | null = supabase,
    fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {
    this.client = client;
    this.fetcher = fetcher;
  }

  get configured() { return Boolean(this.client); }

  private requireClient() {
    if (!this.client) throw new Error('云端尚未配置，可继续本地预览。');
    return this.client;
  }

  async list(ownerId: string, signal: AbortSignal, page = 0): Promise<DwgAsset[]> {
    const start = page * DWG_PAGE_SIZE;
    const { data, error } = await this.requireClient().from(TABLE).select('*').eq('owner_id', ownerId)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(start, start + DWG_PAGE_SIZE).abortSignal(signal);
    signal.throwIfAborted();
    if (error) throw new Error('无法读取本人图纸，请检查网络及 DWG 数据库迁移后重试。');
    return (data ?? []) as DwgAsset[];
  }

  private async get(id: string, signal: AbortSignal): Promise<DwgAsset | null> {
    const { data, error } = await this.requireClient().from(TABLE).select('*').eq('id', id).abortSignal(signal).maybeSingle();
    signal.throwIfAborted();
    if (error) throw new Error('无法读取 DWG 保存记录，请检查网络及数据库迁移后重试。');
    return data as DwgAsset | null;
  }

  private async readObject(asset: DwgAsset, signal: AbortSignal) {
    signal.throwIfAborted();
    const { data, error } = await this.requireClient().storage.from(BUCKET).createSignedUrl(asset.object_key, 120);
    signal.throwIfAborted();
    if (isMissing(error)) return null;
    if (error || !data?.signedUrl) throw new Error('无法访问私有 DWG 文件，请检查网络及存储配置后重试。');
    const response = await this.fetcher(data.signedUrl, { signal, cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('DWG 下载失败，请检查网络或重新登录后重试。');
    const blob = await response.blob();
    await verify(asset, blob, signal);
    return blob;
  }

  async download(asset: DwgAsset, signal: AbortSignal): Promise<Blob> {
    const blob = await this.readObject(asset, signal);
    if (!blob) throw new Error('云端未找到该 DWG 原文件。');
    return blob;
  }

  async save(session: DwgAsset, file: File | undefined, signal: AbortSignal): Promise<DwgAsset> {
    const client = this.requireClient();
    signal.throwIfAborted();
    let record = await this.get(session.id, signal);
    if (!record && file) {
      await verify(session, file, signal);
      const { data, error } = await client.from(TABLE).insert(session).select('*').abortSignal(signal).single();
      signal.throwIfAborted();
      // 即使请求超时，数据库也可能已写入这条记录。
      record = !error && data ? data as DwgAsset : await this.get(session.id, signal);
    }
    if (!record) throw new Error('无法创建或找到 DWG 保存记录，请刷新后重试。');
    if (!matchesAsset(record, session)) throw new Error('保存记录与原文件不匹配，请刷新后重试。');
    if (record.status === 'ready') return record;

    if (!await this.readObject(record, signal)) {
      if (!file) throw new Error('原文件尚未上传。请先打开原 DWG，再点击「恢复保存」。');
      validateDwgFile(file);
      await verify(record, file, signal);
      const { error } = await client.storage.from(BUCKET).upload(record.object_key, file, {
        upsert: false, contentType: 'application/octet-stream',
      });
      signal.throwIfAborted();
      if (error && !await this.readObject(record, signal)) throw new Error('DWG 原文件上传失败，请重试保存。');
    }

    const { data, error } = await client.from(TABLE).update({ status: 'ready' }).eq('id', record.id)
      .eq('status', 'uploading').select('*').abortSignal(signal).single();
    signal.throwIfAborted();
    if (!error && data) return data as DwgAsset;
    const latest = await this.get(record.id, signal);
    if (latest?.status === 'ready' && matchesAsset(latest, session)) return latest;
    throw new Error('原文件已上传，但数据库确认失败，请重试保存。');
  }
}

export const dwgRepository = new DwgRepository();
