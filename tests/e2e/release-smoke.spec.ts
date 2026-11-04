import { expect, test, type Page } from '@playwright/test';

// 真实浏览器发布冒烟：无需账号的匿名流程始终执行；
// 需要登录的流程只在提供本项目专用测试账号环境变量时执行，
// 未提供时明确跳过并在 docs/release-validation.md 记为未验证。
// 账号信息只从环境变量读取，不写入仓库、报告或截图。
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const hasAccount = Boolean(email && password);

async function signIn(page: Page): Promise<void> {
  await page.goto('/home');
  await page.getByRole('button', { name: '登录' }).first().click();
  await page.getByPlaceholder('用户名或 name@example.com').fill(email!);
  await page.locator('input[type="password"]').first().fill(password!);
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await expect(page.getByText('项目').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('release smoke (anonymous)', () => {
  test('home shell loads without uncaught errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('drawing workbench opens anonymously with an editable canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/drawing-workbench');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: '清空画板（Ctrl+U）' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('dwg viewer page shows the login gate anonymously', async ({ page }) => {
    await page.goto('/dwg-viewer');
    await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
  });

  test('unknown routes fall back to the home shell', async ({ page }) => {
    await page.goto('/not-a-real-route');
    await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('release smoke (authenticated, requires E2E account)', () => {
  test.skip(!hasAccount, '未提供 E2E_TEST_EMAIL / E2E_TEST_PASSWORD；已记录为未验证');

  test('login reaches the project list', async ({ page }) => {
    await signIn(page);
    expect(page.url()).toContain('/home');
  });

  test('project rename persists through a real save and reload', async ({ page }) => {
    await signIn(page);
    const projectTitle = page.locator('h3.cursor-pointer').first();
    if (await projectTitle.count() === 0) test.skip(true, '账号下没有可打开的项目');
    const projectName = await projectTitle.innerText();
    await projectTitle.click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('已保存')).toBeVisible({ timeout: 20_000 });

    // 真实编辑：修改项目名称并确认保存状态从“未保存”回到“已保存”
    const nameInput = page.getByPlaceholder('未命名项目');
    const renamed = `${projectName}-E2E${Date.now().toString().slice(-6)}`;
    await nameInput.fill(renamed);
    await nameInput.press('Enter');
    await expect(page.getByText('未保存')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('已保存')).toBeVisible({ timeout: 20_000 });

    // 刷新后必须读到已保存的名称（真实持久化，而不是只更新内存）
    await page.reload();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('未命名项目')).toHaveValue(renamed, { timeout: 20_000 });

    // 还原名称，避免污染测试账号数据
    await page.getByPlaceholder('未命名项目').fill(projectName);
    await page.getByPlaceholder('未命名项目').press('Enter');
    await expect(page.getByText('已保存')).toBeVisible({ timeout: 20_000 });
  });

  test('drawing workbench save and PDF export entry are reachable', async ({ page }) => {
    await signIn(page);
    await page.goto('/drawing-workbench');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '导出 PDF' }).click();
    await expect(page.getByText('导出 PDF').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '确认导出' })).toBeVisible();
  });

  // 双标签冲突、Excel 预览、成本同步失败注入需要两个已登录上下文或本地数据库隔离环境，
  // 未具备条件时不冒称通过，覆盖清单见 docs/release-validation.md。
});
