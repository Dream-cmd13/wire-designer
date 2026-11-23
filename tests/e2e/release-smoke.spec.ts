import { expect, test, type Page } from '@playwright/test';

// 真实浏览器发布冒烟：无需账号的匿名流程始终执行；
// 需要登录的流程只在提供本项目专用测试账号环境变量时执行，
// 未提供时明确跳过并在 docs/release-validation.md 记为未验证。
// 账号信息只从环境变量读取，不写入仓库、报告或截图。
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const hasAccount = Boolean(email && password);

async function signIn(page: Page): Promise<void> {
  await page.goto('/designer');
  await page.getByRole('button', { name: '登录' }).first().click();
  await page.getByPlaceholder('用户名或 name@example.com').fill(email!);
  await page.locator('input[type="password"]').first().fill(password!);
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '项目管理' })).toBeVisible({ timeout: 20_000 });
}

test.describe('release smoke (anonymous)', () => {
  test('project entry loads without uncaught errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL('/designer');
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

  test('drawing workbench keeps tools reachable and reserves canvas space', async ({ page }) => {
    await page.goto('/drawing-workbench');
    const toolbar = page.getByRole('toolbar', { name: '绘图工具栏' });
    const canvas = page.locator('canvas').first();
    const inspector = page.getByRole('complementary', { name: '对象属性' });
    const viewport = page.getByRole('region', { name: '图纸画布' });
    const zoom = page.getByRole('group', { name: '画布缩放' });
    await expect(canvas).toBeVisible();
    await expect(inspector).toHaveCount(0);

    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(toolbar.getByRole('button', { name: '导出 PDF', exact: true })).toBeInViewport({ ratio: 1 });
      await expect.poll(() => toolbar.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
      await expect(canvas).toBeInViewport({ ratio: 1 });
      await expect.poll(async () => {
        const paper = (await canvas.boundingBox())!;
        const area = (await viewport.boundingBox())!;
        return Math.max(Math.abs(paper.x + paper.width / 2 - area.x - area.width / 2),
          Math.abs(paper.y + paper.height / 2 - area.y - area.height / 2));
      }).toBeLessThan(2);
    }

    const fittedWidth = (await canvas.boundingBox())!.width;
    await zoom.getByRole('button', { name: '放大画布' }).click();
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(fittedWidth);
    const manualWidth = (await canvas.boundingBox())!.width;
    await page.setViewportSize({ width: 430, height: 900 });
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(manualWidth);
    await zoom.getByRole('button', { name: '适应窗口' }).click();
    await expect(canvas).toBeInViewport({ ratio: 1 });
    await expect(zoom.getByRole('button', { name: '适应窗口' })).toHaveAttribute('aria-pressed', 'true');

    const paper = (await canvas.boundingBox())!;
    await page.mouse.move(paper.x + paper.width / 2, paper.y + paper.height / 2);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(paper.width);
    await zoom.getByRole('button', { name: '适应窗口' }).click();
    await expect(canvas).toBeInViewport({ ratio: 1 });

    await toolbar.getByRole('button', { name: '添加文字' }).click();
    await expect(inspector.getByRole('textbox', { name: '文字' })).toBeVisible();
    await expect.poll(() => viewport.evaluate((element) => element.parentElement!.clientWidth - element.clientWidth)).toBe(0);
    await inspector.getByRole('textbox', { name: '文字' }).fill('浏览器属性验证');
    await inspector.getByRole('button', { name: '收起对象属性' }).click();
    await expect(inspector).toHaveCount(0);
    await page.getByRole('button', { name: '展开对象属性' }).click();
    await expect(inspector.getByRole('textbox', { name: '文字' })).toHaveValue('浏览器属性验证');

    const layerButton = toolbar.getByRole('button', { name: '图层操作' });
    await layerButton.click();
    const layerMenu = page.getByRole('group', { name: '图层操作' });
    await expect(layerMenu).toBeInViewport({ ratio: 1 });
    await layerMenu.getByRole('button', { name: '锁定/解锁当前选择' }).click();
    await expect(inspector.getByRole('checkbox', { name: '锁定对象' })).toBeChecked();
  });

  test('dwg viewer page shows the login gate anonymously', async ({ page }) => {
    await page.goto('/dwg-viewer');
    await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
  });

  for (const legacyPath of ['/home?projectId=old', '/not-a-real-route']) {
    test(`${legacyPath} falls back to the project entry`, async ({ page }) => {
      await page.goto(legacyPath);
      await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL('/designer');
    });
  }
});

test.describe('release smoke (authenticated, requires E2E account)', () => {
  test.skip(!hasAccount, '未提供 E2E_TEST_EMAIL / E2E_TEST_PASSWORD；已记录为未验证');

  test('login reaches the project list', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL('/designer');
  });

  test('project rename persists through a real save and reload', async ({ page }) => {
    await signIn(page);
    const projectId = process.env.E2E_TEST_PROJECT_ID;
    test.skip(!projectId, '未指定获准修改的 E2E_TEST_PROJECT_ID');
    const card = page.getByTestId(`project-card-${projectId}`);
    const projectName = await card.getByRole('heading', { level: 3 }).innerText();
    await card.getByRole('button', { name: '打开', exact: true }).click();
    await expect(page).toHaveURL(`/designer/design?projectId=${encodeURIComponent(projectId!)}`);
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
