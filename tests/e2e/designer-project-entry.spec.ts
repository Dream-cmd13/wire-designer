import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { designerAppOrigin as appOrigin, designerFixtureOrigin as fixtureOrigin } from '../../playwright.designer.config';

const projectId = '00000000-0000-4000-8000-000000000101';
const ownerId = '00000000-0000-4000-8000-000000000201';
const timestamp = '2026-11-23T00:00:00.000Z';
const projectName = '项目入口验收样件';

const design = {
  schemaVersion: 3, id: projectId, name: projectName,
  createdAt: Date.parse(timestamp), updatedAt: Date.parse(timestamp),
  connectors: [], materials: [], protectiveSleeves: [], models: [],
  quantity: 1, leadTime: 'standard', twoDImages: [],
};

test.use({ baseURL: appOrigin });

async function installFixture(page: Page, role: 'engineer' | 'admin' | 'sales', empty = false, options?: {
  beforeSave?: () => Promise<boolean>;
  canLoad?: () => boolean;
}) {
  const projects = empty ? [] : [{ id: projectId, name: projectName, owner_id: ownerId, description: '', created_at: timestamp, updated_at: timestamp }];
  const documents = new Map([[projectId, design]]);
  const revisions = new Map([[projectId, 1]]);
  const requests: string[] = [];
  await page.context().route(`${fixtureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname === '/rest/v1/rpc/current_app_role') return route.fulfill({ json: role });
    if (url.pathname === '/rest/v1/rpc/save_project_document') {
      if (options?.beforeSave && !(await options.beforeSave())) {
        return route.fulfill({ status: 503, json: { message: 'fixture save unavailable' } });
      }
      const payload = route.request().postDataJSON() as { project_id: string; project_payload: typeof design };
      const config = payload.project_payload;
      const existing = projects.find((project) => project.id === payload.project_id);
      if (existing) existing.name = config.name;
      else projects.push({ id: payload.project_id, name: config.name, owner_id: ownerId, description: '', created_at: timestamp, updated_at: timestamp });
      documents.set(payload.project_id, config);
      const revision = (revisions.get(payload.project_id) ?? 0) + 1;
      revisions.set(payload.project_id, revision);
      return route.fulfill({ json: [{ revision, updated_at: timestamp }] });
    }
    if (url.pathname === '/rest/v1/projects') {
      const id = url.searchParams.get('id')?.slice(3);
      if (id && options?.canLoad && !options.canLoad()) {
        return route.fulfill({ status: 500, json: { message: 'fixture load unavailable' } });
      }
      return route.fulfill({ json: id ? [{ config: documents.get(id), revision: revisions.get(id), updated_at: timestamp }] : projects });
    }
    return route.fulfill({ json: [] });
  });
  await page.context().addInitScript(({ origin, id, createdAt }) => {
    if (location.origin !== origin || localStorage.getItem('sb-localhost-auth-token')) return;
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: 'local-project-entry-fixture', refresh_token: 'local-project-entry-fixture',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, email: 'designer-fixture@example.invalid', created_at: createdAt, user_metadata: {}, app_metadata: {} },
    }));
  }, { origin: appOrigin, id: ownerId, createdAt: timestamp });
  return requests;
}

async function createProject(page: Page, name: string) {
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByPlaceholder('如：无人机电源线束').fill(name);
  const next = page.getByRole('button', { name: '下一步', exact: true });
  for (let step = 1; step <= 3; step += 1) await next.click();
  await page.getByRole('button', { name: '创建项目', exact: true }).last().click();
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue(name);
}

async function openFixtureProject(page: Page) {
  await page.getByTestId(`project-card-${projectId}`).getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue(projectName);
}

async function renameAndReturnToList(page: Page, name: string) {
  await openFixtureProject(page);
  const field = page.getByPlaceholder('未命名项目');
  await field.fill(name);
  await field.press('Enter');
  await page.getByRole('navigation').getByRole('button', { name: '线束设计器', exact: true }).click();
  await expect(page).toHaveURL('/designer');
}

test('engineer keeps the same project when changing views, refreshing, visiting the list and closing', async ({ page }) => {
  const requests = await installFixture(page, 'engineer');
  const sidebar = page.getByRole('navigation');
  const designer = sidebar.getByRole('button', { name: '线束设计器', exact: true });
  const designView = sidebar.getByRole('button', { name: '设计图', exact: true });
  const productView = sidebar.getByRole('button', { name: '成品图', exact: true });
  const list = page.getByRole('heading', { name: '项目管理' });
  const nameInput = page.getByPlaceholder('未命名项目');
  await page.goto('/');
  await expect(list).toBeVisible();
  await expect(page).toHaveURL('/designer');
  await expect(designView).toHaveCount(0);
  await page.getByRole('article', { name: projectName }).getByRole('button', { name: '打开', exact: true }).click();
  await expect(page).toHaveURL(`/designer/design?projectId=${projectId}`);
  await expect(designView).toHaveAttribute('aria-current', 'page');
  await expect(nameInput).toHaveValue(projectName);
  await productView.click();
  await expect(page).toHaveURL(`/designer/product-image?projectId=${projectId}`);
  await page.reload();
  await expect(productView).toHaveAttribute('aria-current', 'page');
  await expect(nameInput).toHaveValue(projectName);

  await designer.click();
  await expect(page).toHaveURL('/designer');
  await expect(list).toBeVisible();
  await expect(designer).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(`/designer/product-image?projectId=${projectId}`);
  await page.goForward();
  await expect(list).toBeVisible();
  await page.getByRole('button', { name: '收缩侧边栏' }).click();
  await designView.click();
  await expect(page).toHaveURL(`/designer/design?projectId=${projectId}`);
  await expect(nameInput).toHaveValue(projectName);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭项目', exact: true }).click();
  await expect(page).toHaveURL('/designer');
  await expect(list).toBeVisible();
  await expect(designView).toHaveCount(0);
  await expect(productView).toHaveCount(0);
  expect(requests).not.toContain('/rest/v1/rpc/save_project_document');
});

test('admin with an empty list can import without entering the editor', async ({ page }) => {
  await installFixture(page, 'admin', true);
  await page.goto('/home?projectId=old');
  await expect(page).toHaveURL('/designer');
  await expect(page.getByRole('heading', { name: '暂无项目' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入设计', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'fixture.wire-harness.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(design)),
  });
  await page.getByRole('button', { name: '创建新项目', exact: true }).click();
  await expect(page.getByRole('article', { name: projectName })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button', { name: '设计图', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL('/designer');
});

test('the new project wizard cancels to the list and opens a completed project in design view', async ({ page }) => {
  await installFixture(page, 'engineer', true);
  await page.goto('/designer');
  const newProject = page.getByRole('button', { name: '新建项目', exact: true });
  await newProject.click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('heading', { name: '暂无项目' })).toBeVisible();
  await expect(page).toHaveURL('/designer');
  await createProject(page, '向导验收样件');
  await expect(page).toHaveURL(/\/designer\/design\?projectId=[\da-f-]+$/);
});

test('a new project never exposes or deletes the previous project corrupt draft', async ({ page }) => {
  await installFixture(page, 'engineer');
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, '{"broken":');
  }, { key: `wh_draft_v2:${ownerId}:project:${projectId}:broken-fixture` });
  await page.goto('/designer');
  await openFixtureProject(page);
  const discard = page.getByRole('button', { name: '丢弃草稿' });
  await expect(discard).toBeVisible();
  await page.goBack();
  await createProject(page, '另一个项目');
  await expect(discard).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: '线束设计器', exact: true }).click();
  await openFixtureProject(page);
  await expect(discard).toBeVisible();
  await discard.click();
  await expect(discard).toHaveCount(0);
});

test('export waits for the active project save and downloads the latest design and name', async ({ page }) => {
  const saveStarted = Promise.withResolvers<void>();
  const allowSave = Promise.withResolvers<boolean>();
  await installFixture(page, 'engineer', false, { beforeSave: () => {
    saveStarted.resolve();
    return allowSave.promise;
  } });
  await page.goto('/designer');
  const latestName = '刚修改的导出项目';
  await renameAndReturnToList(page, latestName);
  const download = page.waitForEvent('download');
  try {
    await page.getByRole('button', { name: `导出项目 ${projectName}` }).click();
    const first = await Promise.race([saveStarted.promise.then(() => 'save'), download.then(() => 'download')]);
    expect(first).toBe('save');
  } finally {
    allowSave.resolve(true);
    await download.catch(() => undefined);
  }
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${latestName}.wire-harness.json`);
  const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(exported.project.name).toBe(latestName);
  expect(exported.document.name).toBe(latestName);
});

test('export does not emit a stale file when the active project cannot save', async ({ page }) => {
  await installFixture(page, 'engineer', false, { beforeSave: async () => false });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.goto('/designer');
  await renameAndReturnToList(page, '保存失败的改名');
  await page.getByRole('button', { name: `导出项目 ${projectName}` }).click();
  await expect(page.getByText('项目导出失败', { exact: true })).toBeVisible({ timeout: 4000 });
  expect(downloads).toEqual([]);
  await page.getByRole('navigation').getByRole('button', { name: '设计图', exact: true }).click();
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue('保存失败的改名');
});

test('an earlier window exports the design saved by a second window', async ({ page, context }) => {
  await installFixture(page, 'engineer');
  await page.goto('/designer');
  await openFixtureProject(page);
  await page.getByRole('navigation').getByRole('button', { name: '线束设计器', exact: true }).click();

  const secondWindow = await context.newPage();
  await secondWindow.goto('/designer');
  await openFixtureProject(secondWindow);
  const latestName = '第二个窗口保存的名称';
  const nameField = secondWindow.getByPlaceholder('未命名项目');
  await nameField.fill(latestName);
  await nameField.press('Enter');
  await expect(secondWindow.getByText('未保存', { exact: true })).toBeVisible();
  await expect(secondWindow.getByText('已保存', { exact: true })).toBeVisible();

  const freshWindow = await context.newPage();
  await freshWindow.goto('/designer');
  for (const [window, cardName] of [[page, projectName], [freshWindow, latestName]] as const) {
    const [file] = await Promise.all([
      window.waitForEvent('download'),
      window.getByRole('button', { name: `导出项目 ${cardName}` }).click(),
    ]);
    expect(file.suggestedFilename()).toBe(`${latestName}.wire-harness.json`);
    const exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(exported.project.name).toBe(latestName);
    expect(exported.document.name).toBe(latestName);
  }
});

test('retrying an earlier export loads and saves the project opened since the failure', async ({ page }) => {
  let canLoad = false;
  const allowSave = Promise.withResolvers<boolean>();
  await installFixture(page, 'engineer', false, {
    canLoad: () => canLoad,
    beforeSave: () => allowSave.promise,
  });
  await page.goto('/designer');
  await page.getByRole('button', { name: `导出项目 ${projectName}` }).click();
  const retry = page.getByRole('button', { name: '重试导出' });
  await expect(retry).toBeVisible();

  canLoad = true;
  const latestName = '服务恢复后修改的名称';
  await renameAndReturnToList(page, latestName);
  const download = page.waitForEvent('download', { timeout: 6000 });
  try {
    await retry.click();
    allowSave.resolve(true);
    const result = await Promise.race([
      download,
      page.getByText('最新修改未能保存，请检查保存状态后重试导出。').waitFor({ timeout: 6000 }).then(() => null),
    ]);
    expect(result, '重试应下载文件').not.toBeNull();
    expect(result!.suggestedFilename()).toBe(`${latestName}.wire-harness.json`);
    const exported = JSON.parse(await readFile((await result!.path())!, 'utf8'));
    expect(exported.document.name).toBe(latestName);
  } finally {
    allowSave.resolve(true);
  }
});

test('sales deep links only see automatic quoting', async ({ page }) => {
  const requests = await installFixture(page, 'sales');
  await page.goto(`/designer/design?projectId=${projectId}`);
  await expect(page).toHaveURL('/auto-quote');
  const sidebar = page.getByRole('navigation');
  await expect(sidebar.getByRole('button', { name: '自动报价', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '项目管理' })).toHaveCount(0);
  expect(requests).not.toContain('/rest/v1/projects');
});
