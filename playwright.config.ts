import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
