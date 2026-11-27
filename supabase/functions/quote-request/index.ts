import { timingSafeEqual } from 'node:crypto';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  hasQuoteFileSignature, quoteFileHash, quoteFilePath, QUOTE_CLEANUP_HOURS,
  QUOTE_FILE_MAX_BYTES, QUOTE_REQUEST_BUCKET, QUOTE_UPLOAD_HOURS, validateQuoteRequest,
} from '../_shared/quoteRequest.ts';
import type { QuoteRequestInput } from '../_shared/quoteRequest.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-quote-request-id, x-quote-file-index',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hour = 60 * 60 * 1000;
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const storage = client.storage.from(QUOTE_REQUEST_BUCKET);

class RequestProblem extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

function respond(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
}

function hasSecret(request: Request, header: string, variable: string) {
  const supplied = request.headers.get(header);
  const expected = Deno.env.get(variable);
  if (!supplied || !expected) return false;
  const encoder = new TextEncoder();
  const actual = encoder.encode(supplied);
  const secret = encoder.encode(expected);
  return actual.length === secret.length && timingSafeEqual(actual, secret);
}

function checkId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new RequestProblem('询价提交编号无效。', 400);
  return value;
}

async function readLimited(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestProblem('缺少提交内容。', 400);
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > limit) {
    void reader.cancel().catch(() => undefined);
    throw new RequestProblem('提交内容超过允许大小。', 413);
  }
  const bytes = new Uint8Array(limit);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > limit) {
        void reader.cancel().catch(() => undefined);
        throw new RequestProblem('提交内容超过允许大小。', 413);
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  return offset === bytes.length ? bytes : bytes.slice(0, offset);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readLimited(request, 24 * 1024);
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* Report invalid JSON without including submitted data. */ }
  throw new RequestProblem('提交内容无效。', 400);
}

function rpcResponse(data: { state: string; receipt?: string }) {
  switch (data.state) {
    case 'received': return respond({ receipt: data.receipt });
    case 'uploading': return respond({ uploading: true });
    case 'expired': throw new RequestProblem('本次提交已过期，请重新提交。', 409, 'expired');
    case 'missing_files': throw new RequestProblem('还有图纸未完成上传，请重试。', 409, 'missing_files');
    case 'conflict': throw new RequestProblem('询价内容已变更，请重新提交。', 409, 'conflict');
    case 'rate_limited': throw new RequestProblem('提交过于频繁，请稍后重试。', 429);
    default: throw new Error('unexpected quote request state');
  }
}

async function prepare(request: Request) {
  const body = await readJson(request);
  const id = checkId(body.id);
  let input: QuoteRequestInput;
  try {
    input = validateQuoteRequest(body.input);
  } catch (error) {
    throw new RequestProblem((error as Error).message, 400);
  }
  const { data, error } = await client.rpc('prepare_quote_request', { request_id: id, request_payload: input });
  if (error || !data) throw new Error('quote prepare RPC failed');
  return rpcResponse(data);
}

async function upload(request: Request) {
  const id = checkId(request.headers.get('x-quote-request-id'));
  const rawIndex = request.headers.get('x-quote-file-index');
  if (!rawIndex || !/^[0-4]$/u.test(rawIndex)) throw new RequestProblem('附件编号无效。', 400);
  const index = Number(rawIndex);
  // The hosted Edge relay can stall on early responses to large, unread request bodies.
  const bytes = await readLimited(request, QUOTE_FILE_MAX_BYTES);
  const { data: row, error } = await client.from('quote_requests').select('created_at, status, payload').eq('id', id).maybeSingle();
  if (error) throw new Error('quote upload metadata lookup failed');
  if (!row || (row.status === 'uploading' && Date.parse(row.created_at) <= Date.now() - QUOTE_UPLOAD_HOURS * hour)) {
    throw new RequestProblem('本次提交已过期，请重新提交。', 409, 'expired');
  }
  if (row.status !== 'uploading') return respond({ uploaded: true });
  const file = (row.payload as QuoteRequestInput).files[index];
  if (!file) throw new RequestProblem('附件编号无效。', 400);
  if (file.size > QUOTE_FILE_MAX_BYTES || bytes.length > file.size) throw new RequestProblem('提交内容超过允许大小。', 413);
  if (bytes.length !== file.size || !hasQuoteFileSignature(file.name, bytes) || await quoteFileHash(bytes.buffer) !== file.sha256) {
    throw new RequestProblem(`「${file.name}」的内容与所选文件不符，请检查格式后重新选择。`, 400);
  }
  const path = quoteFilePath(id, index);
  const { error: uploadError } = await storage.upload(path, bytes, { contentType: 'application/octet-stream', upsert: false });
  if (uploadError) {
    // A retry may follow a successful upload whose response was lost. Only this handler can create the object.
    const { data: existing, error: lookupError } = await storage.info(path);
    if (lookupError || existing?.size !== file.size) throw new Error('quote storage upload failed');
  }
  return respond({ uploaded: true });
}

async function notify(receipt: string) {
  const webhook = Deno.env.get('QUOTE_REQUEST_WECOM_WEBHOOK');
  if (!webhook) return;
  const staffUrl = Deno.env.get('QUOTE_REQUEST_STAFF_URL');
  try {
    const result = await fetch(webhook, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: `新线束询价 ${receipt}${staffUrl ? `\n${staffUrl}` : ''}` } }),
    });
    const body = await result.json();
    if (!result.ok || body.errcode !== 0) throw new Error('notification rejected');
  } catch {
    console.warn('Quote request staff notification failed');
  }
}

async function finalize(request: Request) {
  const { id } = await readJson(request);
  const { data, error } = await client.rpc('finalize_quote_request', { request_id: checkId(id) });
  if (error || !data) throw new Error('quote finalize RPC failed');
  const response = rpcResponse(data);
  if (data.created) await notify(data.receipt);
  return response;
}

async function cleanup(request: Request) {
  if (!hasSecret(request, 'x-quote-cleanup-secret', 'QUOTE_REQUEST_CLEANUP_SECRET')) return respond({ error: 'Forbidden' }, 403);
  const cutoff = new Date(Date.now() - QUOTE_CLEANUP_HOURS * hour).toISOString();
  const batch = 100;
  const { data, error } = await client.from('quote_requests').select('id, payload').eq('status', 'uploading')
    .lt('created_at', cutoff).order('created_at').limit(batch);
  if (error || !data) throw new Error('temporary quote files lookup failed');
  const paths = data.flatMap(({ id, payload }) => (payload as QuoteRequestInput).files.map((_, index) => quoteFilePath(id, index)));
  if (paths.length) {
    const { error: removeError } = await storage.remove(paths);
    if (removeError) throw new Error('temporary quote files cleanup failed');
  }
  if (data.length) {
    const { error: deleteError } = await client.from('quote_requests').delete().eq('status', 'uploading')
      .lt('created_at', cutoff).in('id', data.map(({ id }) => id));
    if (deleteError) throw new Error('temporary quote requests cleanup failed');
  }
  return respond({ processed: data.length });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const action = new URL(request.url).pathname.split('/').at(-1);
  try {
    if (action === 'cleanup') return await cleanup(request);
    if (!hasSecret(request, 'x-quote-forward-secret', 'QUOTE_REQUEST_FORWARD_SECRET')) return respond({ error: 'Forbidden' }, 403);
    switch (action) {
      case 'prepare': return await prepare(request);
      case 'upload': return await upload(request);
      case 'finalize': return await finalize(request);
      default: return respond({ error: 'Not found' }, 404);
    }
  } catch (error) {
    if (error instanceof RequestProblem) return respond({ error: error.message, code: error.code }, error.status);
    console.error('Quote request operation failed:', error instanceof Error ? error.message : 'unknown');
    return respond({ error: '询价服务暂时不可用，请稍后重试。' }, 503);
  }
});
