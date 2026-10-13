import { createClient } from 'npm:@supabase/supabase-js@2';
import { changePassword, resetPassword, PasswordError, type PasswordService } from '../_shared/passwordService.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
Deno.serve(async request => {
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return respond({ error: '请先登录。' }, 401);
  try {
    const body = await request.text();
    if (body.length > 4096) return respond({ error: '请求过大。' }, 413);
    const input = JSON.parse(body);
    const url = Deno.env.get('SUPABASE_URL')!;
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
    const service: PasswordService = {
      async getUser(jwt) {
        const { data, error } = await admin.auth.getUser(jwt);
        if (error) return null;
        return data.user;
      },
      async verifyPassword(email, password, userId) {
        // Isolated client: reauthentication must never replace the administrator client session.
        const verifier = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options);
        const { data, error } = await verifier.auth.signInWithPassword({ email, password });
        if (error || data.user?.id !== userId) return false;
        await verifier.auth.signOut({ scope: 'local' });
        return true;
      },
      async getRole(userId) {
        const { data, error } = await admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return data?.role ?? 'sales';
      },
      async updateUser(userId, password, mustChangePassword, expectedVersion) {
        // Auth changes the password and server-owned flag in the same update.
        const { data: target, error: lookupError } = await admin.auth.admin.getUserById(userId);
        if (lookupError || !target.user) throw lookupError ?? new Error('User not found');
        const { error } = await admin.auth.admin.updateUserById(userId, {
          password, app_metadata: {
            ...target.user.app_metadata, must_change_password: mustChangePassword,
            password_expected_version: expectedVersion ?? Number(target.user.app_metadata.password_version ?? 0),
          },
        });
        if (error) throw error;
      },
    };
    if (input?.action === 'change') await changePassword(service, token, input.currentPassword, input.newPassword);
    else if (input?.action === 'reset') await resetPassword(service, token, input.targetUserId);
    else return respond({ error: '无效操作。' }, 400);
    return respond({ success: true });
  } catch (error) {
    if (error instanceof PasswordError) return respond({ error: error.message }, error.status);
    return respond({ error: '密码操作失败，请稍后重试或联系管理员检查密码策略。' }, 400);
  }
});
