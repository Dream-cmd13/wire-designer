import { createClient } from 'npm:@supabase/supabase-js@2';
import { catalogFromRows, quoteForRole } from './engine.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
Deno.serve(async request => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: '请登录' }, 401);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return respond({ error: '登录已失效' }, 401);
  try {
    const body = await request.text();
    if (body.length > 200000) return respond({ error: '配置过大' }, 413);
    const config = JSON.parse(body).config;
    const { data: snapshot, error: snapshotError } = await client.rpc('quote_snapshot', { actor_id: user.id });
    if (snapshotError || !snapshot) throw new Error('snapshot unavailable');
    const catalog = catalogFromRows(snapshot.catalog);
    const prices = snapshot.prices.map((p: Record<string, unknown>) => ({
      kind: p.kind, resourceId: p.resource_id, name: p.name, specification: p.specification,
      lengthMm: Number(p.length_mm), unit: p.unit, taxIncludedPrice: String(p.tax_included_price),
    }));
    return respond(quoteForRole(config, catalog, prices, snapshot.settings, snapshot.role));
  } catch {
    return respond({ error: '报价失败，请检查配置或联系工程师' }, 400);
  }
});
