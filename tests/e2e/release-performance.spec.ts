import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// 交互性能测量：首页冷加载与制作图纸首次进入各采样 3 次，记录中位数。
// 结果写入 output/playwright/performance.json（output/ 已在 .gitignore）。
interface Sample {
  scenario: string;
  run: number;
  domContentLoadedMs: number;
  loadEventMs: number;
  transferredBytes: number;
}

const samples: Sample[] = [];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(page: import('@playwright/test').Page, scenario: string, run: number): Promise<void> {
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const transferred = resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
    return {
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
      loadEventMs: nav ? nav.loadEventEnd - nav.startTime : 0,
      transferredBytes: transferred,
    };
  });
  samples.push({ scenario, run, ...metrics });
}

test('home cold load median over three runs', async ({ browser }) => {
  for (let run = 1; run <= 3; run += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    await measure(page, 'home-cold-load', run);
    await context.close();
  }
  const loads = samples.filter((s) => s.scenario === 'home-cold-load').map((s) => s.loadEventMs);
  expect(median(loads)).toBeLessThan(30_000);
});

test('drawing workbench first entry median over three runs', async ({ browser }) => {
  for (let run = 1; run <= 3; run += 1) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/drawing-workbench');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await measure(page, 'drawing-workbench-first-entry', run);
    await context.close();
  }
  const loads = samples.filter((s) => s.scenario === 'drawing-workbench-first-entry').map((s) => s.loadEventMs);
  expect(median(loads)).toBeLessThan(30_000);
});

test.afterAll(() => {
  if (samples.length === 0) return;
  const outputDir = resolve('output/playwright');
  mkdirSync(outputDir, { recursive: true });
  const scenarios = [...new Set(samples.map((s) => s.scenario))];
  const summary = scenarios.map((scenario) => {
    const rows = samples.filter((s) => s.scenario === scenario);
    return {
      scenario,
      runs: rows.length,
      medianDomContentLoadedMs: median(rows.map((s) => s.domContentLoadedMs)),
      medianLoadEventMs: median(rows.map((s) => s.loadEventMs)),
      medianTransferredBytes: median(rows.map((s) => s.transferredBytes)),
    };
  });
  writeFileSync(resolve(outputDir, 'performance.json'), JSON.stringify({ samples, summary }, null, 2), 'utf8');
  console.log('performance summary:', JSON.stringify(summary));
});
