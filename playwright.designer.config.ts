import { defineConfig } from '@playwright/test';

export const designerAppOrigin = 'http://localhost:4193';
export const designerFixtureOrigin = 'http://localhost:4194';

export const designerWebServer = {
  command: 'npm run dev -- --host localhost --port 4193 --strictPort',
  url: designerAppOrigin,
  env: {
    VITE_SUPABASE_URL: designerFixtureOrigin,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'local-fixture-key',
  },
  reuseExistingServer: false,
  timeout: 120_000,
};

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/designer-project-entry.spec.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  webServer: designerWebServer,
});
