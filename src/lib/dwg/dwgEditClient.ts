import { supabase } from '@/lib/supabaseClient';
import type { DwgEditOperation } from '@/lib/dwg/dwgEdit';

export async function generateDwgRevision(source: File, ownerId: string, sourceSha256: string, operations: DwgEditOperation[], signal: AbortSignal) {
  const session = await supabase?.auth.getSession();
  signal.throwIfAborted();
  if (!session?.data.session || session.error || session.data.session.user.id !== ownerId) throw new Error('请重新登录后生成 DWG。');
  const body = new FormData();
  body.append('source', source);
  body.append('sourceSha256', sourceSha256);
  body.append('operations', JSON.stringify(operations));
  const response = await fetch('/api/dwg/edit', {
    method: 'POST',
    body,
    headers: { Authorization: `Bearer ${session.data.session.access_token}` },
    signal,
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { message?: unknown } | null;
    throw new Error(typeof detail?.message === 'string' ? detail.message : response.status === 413 ? 'DWG 文件不能超过 20 MiB。' : 'DWG 生成失败，请稍后重试。');
  }
  if (response.headers.get('content-type') !== 'application/octet-stream' || !response.body) throw new Error('写入服务没有返回有效的 DWG 文件。');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('生成的 DWG 超过 20 MiB。');
      }
      chunks.push(Uint8Array.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const name = `${source.name.replace(/\.dwg$/i, '').slice(0, 1010)}_修订.dwg`;
  return new File(chunks, name, { type: 'application/octet-stream' });
}

export function downloadDwgRevision(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
