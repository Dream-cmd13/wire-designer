import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createUser: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { createUser: mocks.createUser } } }) }));
vi.mock('node:fs', () => ({ existsSync: () => false, readFileSync: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  mocks.createUser.mockReset().mockResolvedValue({ data: { user: { id: 'new-id', email: 'new@local.app' } }, error: null });
});

it('creates username accounts with the initial password and a server-owned forced-change flag', async () => {
  const previousArgv = process.argv;
  vi.stubEnv('SUPABASE_URL', 'https://example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only');
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    process.argv = ['node', 'create-user.mjs', 'new', '新账号'];
    await import('./create-user.mjs');
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'new@local.app', password: '888888', email_confirm: true,
      app_metadata: { must_change_password: true }, user_metadata: { display_name: '新账号' },
    });
  } finally { process.argv = previousArgv; vi.unstubAllEnvs(); log.mockRestore(); }
});
