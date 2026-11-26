import { afterEach, expect, it, vi } from 'vitest';
import { sendQuoteRequest } from '../quoteRequests';

afterEach(() => vi.unstubAllGlobals());

it('submits public requests through the same-origin API', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ uploading: true }));
  vi.stubGlobal('fetch', fetch);

  await expect(sendQuoteRequest('prepare', { id: 'request' })).resolves.toEqual({ uploading: true });
  expect(fetch).toHaveBeenCalledWith('/api/quote-request/prepare', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ id: 'request' }),
  }));
  const headers = new Headers(fetch.mock.calls[0][1].headers);
  expect(headers.get('Content-Type')).toBe('application/json');
  expect(headers.has('Authorization')).toBe(false);
});

it('uses a raw attachment body and preserves retry details from the function', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: '提交过期', code: 'expired' }, { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  const drawing = new File(['%PDF-1.7'], 'drawing.pdf', { type: 'application/pdf' });

  await expect(sendQuoteRequest('upload', drawing, { 'x-quote-file-index': '0' }))
    .rejects.toMatchObject({ message: '提交过期', code: 'expired' });
  expect(fetch).toHaveBeenCalledWith('/api/quote-request/upload', expect.objectContaining({ body: drawing }));
  expect(new Headers(fetch.mock.calls[0][1].headers).get('x-quote-file-index')).toBe('0');
});

it('reports an HTTP rate limit even when the proxy sends an HTML error page', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 429 })));
  await expect(sendQuoteRequest('finalize', { id: 'request' })).rejects.toThrow('提交过于频繁');
});

it('shows a Chinese message when the inquiry proxy returns 403', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 })));
  await expect(sendQuoteRequest('prepare', { id: 'request' })).rejects.toThrow('询价服务暂时无法访问，请重新打开询价页面后重试。');
});
