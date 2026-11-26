import { supabase } from './supabaseClient';
import { QUOTE_REQUEST_BUCKET, quoteFilePath } from '../../supabase/functions/_shared/quoteRequest';
import type { QuoteRequestInput } from '../../supabase/functions/_shared/quoteRequest';

export type QuoteStatus = 'pending' | 'following' | 'quoted' | 'closed';
export const quoteStatuses: Record<QuoteStatus, string> = {
  pending: '待处理', following: '跟进中', quoted: '已报价', closed: '已关闭',
};

export interface QuoteRequestRow {
  id: string;
  receipt: string;
  status: QuoteStatus;
  payload: QuoteRequestInput;
  assignee_id: string | null;
  follow_up_note: string;
  submitted_at: string;
  updated_at: string;
}

export const QUOTE_LIST_SIZE = 20;

function client() {
  if (!supabase) throw new Error('询价服务暂未配置。');
  return supabase;
}

export class QuoteSubmissionError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function sendQuoteRequest<T>(action: 'prepare' | 'upload' | 'finalize', body: Record<string, unknown> | File, headers?: Record<string, string>) {
  const requestHeaders = new Headers(headers);
  const attachment = body instanceof File;
  requestHeaders.set('Content-Type', attachment ? 'application/octet-stream' : 'application/json');
  const response = await fetch(`/api/quote-request/${action}`, {
    method: 'POST',
    body: attachment ? body : JSON.stringify(body),
    headers: requestHeaders,
    credentials: 'omit',
    signal: AbortSignal.timeout(action === 'upload' ? 90_000 : 20_000),
  }).catch(() => null);
  const data = await response?.json().catch(() => null);
  if (response?.ok && data) return data as T;
  if (typeof data?.error === 'string') {
    throw new QuoteSubmissionError(data.error, typeof data.code === 'string' ? data.code : undefined);
  }
  if (response?.status === 429) throw new QuoteSubmissionError('提交过于频繁，请稍后重试。');
  if (response?.status === 413) throw new QuoteSubmissionError('提交内容超过允许大小。');
  throw new QuoteSubmissionError('连接询价服务失败，请重试。');
}

export async function canHandleQuoteRequests() {
  const { data, error } = await client().rpc('can_handle_quote_requests');
  if (error) throw new Error('无法检查询价权限，请刷新重试。');
  return data === true;
}

export async function listQuoteRequests(status: QuoteStatus | '', page: number, signal: AbortSignal) {
  let query = client().from('quote_requests').select('id,receipt,status,payload,assignee_id,follow_up_note,submitted_at,updated_at', { count: 'exact' })
    .order('submitted_at', { ascending: false }).order('id')
    .range(page * QUOTE_LIST_SIZE, (page + 1) * QUOTE_LIST_SIZE - 1).abortSignal(signal);
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) throw new Error('询价列表加载失败，请刷新重试。');
  return { rows: data as QuoteRequestRow[], count: count ?? 0 };
}

export async function updateQuoteRequest(row: QuoteRequestRow, status: QuoteStatus, note: string) {
  const { data, error } = await client().rpc('update_quote_request', {
    request_id: row.id, expected_updated_at: row.updated_at, next_status: status, note,
  });
  if (error) {
    if (error.code === '40001') throw new Error('这条询价已被更新，请刷新列表后重试。');
    if (error.code === '42501') throw new Error('当前账号无法修改这条询价，请刷新后核对接单状态。');
    if (error.code === '22023') throw new Error(error.message);
    throw new Error('保存询价失败，请重试。');
  }
  return data as QuoteRequestRow;
}

export async function downloadQuoteFile(row: QuoteRequestRow, index: number) {
  const file = row.payload.files[index];
  const { data, error } = await client().storage.from(QUOTE_REQUEST_BUCKET)
    .createSignedUrl(quoteFilePath(row.id, index), 120, { download: file.name });
  if (error || !data) throw new Error('暂时无法下载这份图纸，请重试。');
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.rel = 'noreferrer';
  link.click();
}
