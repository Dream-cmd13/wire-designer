import { afterEach, expect, it, vi } from 'vitest';
import { listQuoteRequests } from '../quoteRequests';

vi.mock('../supabaseClient', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://quotes.example.invalid', 'fixture', { auth: { persistSession: false } }) };
});

afterEach(() => vi.unstubAllGlobals());

it.each([
  { scope: 'unassigned' as const, status: 'closed' as const, statusFilter: 'eq.pending', ownerFilter: 'is.null' },
  { scope: 'mine' as const, status: 'following' as const, statusFilter: 'eq.following', ownerFilter: 'eq.current-user' },
])('applies $scope to the remote filtered count and requested page', async ({ scope, status, statusFilter, ownerFilter }) => {
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/rest/v1/quote_requests');
    expect(parsed.searchParams.get('status')).toBe(statusFilter);
    expect(parsed.searchParams.get('assignee_id')).toBe(ownerFilter);
    expect(parsed.searchParams.get('offset')).toBe('20');
    expect(parsed.searchParams.get('limit')).toBe('20');
    expect(new Headers(options.headers).get('Prefer')).toBe('count=exact');
    return Response.json([], { status: 206, headers: { 'content-range': '20-39/52' } });
  });
  vi.stubGlobal('fetch', fetch);
  await expect(listQuoteRequests({ scope, status, userId: 'current-user', page: 1, signal: new AbortController().signal }))
    .resolves.toEqual({ rows: [], count: 52 });
  expect(fetch).toHaveBeenCalledOnce();
});
