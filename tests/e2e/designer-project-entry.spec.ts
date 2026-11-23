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
  beforeCreate?: (id: string) => Promise<boolean | 'invalid'>;
  beforeList?: () => Promise<void>;
}) {
  const projects = empty ? [] : [{ id: projectId, name: projectName, owner_id: ownerId, description: '', created_at: timestamp, updated_at: timestamp }];
  const documents = new Map([[projectId, design]]);
  const revisions = new Map([[projectId, 1]]);
  const requests: string[] = [];
  await page.context().route(`${fixtureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname === '/rest/v1/rpc/current_app_role') return route.fulfill({ json: role });
    if (url.pathname === '/rest/v1/rpc/delete_project_document') {
      const payload = route.request().postDataJSON() as { project_id: string; expected_revision: number };
      const index = projects.findIndex((project) => project.id === payload.project_id);
      if (index === -1 || revisions.get(payload.project_id) !== payload.expected_revision) {
        return route.fulfill({ status: 409, json: { message: 'Version conflict' } });
      }
      projects.splice(index, 1);
      documents.delete(payload.project_id);
      revisions.delete(payload.project_id);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === '/rest/v1/rpc/save_project_document') {
      const payload = route.request().postDataJSON() as { project_id: string; project_payload: typeof design; expected_revision: number | null };
      if (payload.expected_revision === null && options?.beforeCreate) {
        const result = await options.beforeCreate(payload.project_id);
        if (result === 'invalid') return route.fulfill({ status: 400, json: { code: '22023', message: 'Invalid project document' } });
        if (!result) return route.fulfill({ status: 403, json: { code: '42501', message: 'fixture create refused' } });
      }
      if (options?.beforeSave && !(await options.beforeSave())) {
        return route.fulfill({ status: 503, json: { message: 'fixture save unavailable' } });
      }
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
      if (id) return route.fulfill({ json: [{ config: documents.get(id), revision: revisions.get(id), updated_at: timestamp }] });
      const snapshot = projects.map((project) => ({ ...project }));
      await options?.beforeList?.();
      return route.fulfill({ json: snapshot });
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

async function reachCreateStep(page: Page, name: string) {
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByPlaceholder('如：无人机电源线束').fill(name);
  const next = page.getByRole('button', { name: '下一步', exact: true });
  for (let step = 1; step <= 3; step += 1) await next.click();
  return page.getByRole('button', { name: '创建项目', exact: true }).last();
}

async function createProject(page: Page, name: string) {
  await (await reachCreateStep(page, name)).click();
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

test('double-clicking the last wizard step sends only one create and leaves one card after reload', async ({ page }) => {
  const allowCreate = Promise.withResolvers<boolean>();
  const pendingIds: string[] = [];
  await installFixture(page, 'engineer', true, {
    beforeCreate: (id) => {
      pendingIds.push(id);
      return allowCreate.promise;
    },
  });
  await page.goto('/designer');
  const name = '慢响应创建样件';
  const submit = await reachCreateStep(page, name);
  try {
    await submit.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(() => pendingIds.length).toBe(1);
    await expect(page.getByRole('button', { name: '创建中…' })).toBeDisabled({ timeout: 1500 });
    await expect(page.getByRole('button', { name: '上一步' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '✕', exact: true })).toBeDisabled();
  } finally {
    allowCreate.resolve(true);
  }
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue(name);
  const [id] = pendingIds;
  await expect(page).toHaveURL(`/designer/design?projectId=${id}`);
  await page.getByRole('navigation').getByRole('button', { name: '线束设计器', exact: true }).click();
  const cards = page.getByRole('article', { name, exact: true });
  await expect(cards).toHaveCount(1);
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute('data-testid', `project-card-${id}`);
  expect(pendingIds).toEqual([id]);
});

test('two independent wizards save same-name projects which can be deleted by ID', async ({ page }) => {
  const createdIds: string[] = [];
  await installFixture(page, 'engineer', true, {
    beforeCreate: async (id) => {
      createdIds.push(id);
      return true;
    },
  });
  await page.goto('/designer');
  const name = '同名验收样件';
  await createProject(page, name);
  await page.getByRole('navigation').getByRole('button', { name: '线束设计器', exact: true }).click();
  await createProject(page, name);
  await page.getByRole('navigation').getByRole('button', { name: '线束设计器', exact: true }).click();
  await page.reload();
  const cards = page.getByRole('article', { name, exact: true });
  await expect(cards).toHaveCount(2);
  expect(createdIds).toHaveLength(2);
  expect(new Set(createdIds).size).toBe(2);
  const [firstId, secondId] = createdIds;
  const firstCard = page.getByTestId(`project-card-${firstId}`);
  const secondCard = page.getByTestId(`project-card-${secondId}`);
  await expect(firstCard).toBeVisible();
  await expect(secondCard).toBeVisible();
  await firstCard.getByRole('button', { name: `删除项目 ${name}` }).click();
  await page.getByRole('alertdialog').filter({ hasText: '确认删除' }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(firstCard).toHaveCount(0);
  await expect(secondCard).toBeVisible();
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(secondCard).toBeVisible();
  await expect(firstCard).toHaveCount(0);
});

test('a definite create failure keeps the confirmation inputs and allows retry', async ({ page }) => {
  let attempts = 0;
  await installFixture(page, 'engineer', true, { beforeCreate: async () => ++attempts > 1 });
  await page.goto('/designer');
  const name = '失败后重试样件';
  const submit = await reachCreateStep(page, name);
  await submit.click();
  await expect(page.getByText(/创建失败/)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText('空白项目', { exact: true })).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue(name);
  expect(attempts).toBe(2);
});

test('a list response held in a second tab cannot restore a deleted project to the shared cache', async ({ page, context }) => {
  let listRequests = 0;
  const allowStaleList = Promise.withResolvers<void>();
  await installFixture(page, 'engineer', false, {
    beforeList: async () => {
      listRequests += 1;
      if (listRequests === 2) await allowStaleList.promise;
    },
  });
  const cacheIds = () => page.evaluate((userId) => {
    const cached = localStorage.getItem(`wh_projects_v1_${userId}`);
    return cached ? (JSON.parse(cached).projects as { id: string }[]).map(({ id }) => id) : null;
  }, ownerId);
  await page.goto('/designer');
  await expect.poll(cacheIds).toEqual([projectId]);
  const secondTab = await context.newPage();
  await secondTab.goto('/designer');
  try {
    await expect.poll(() => listRequests).toBe(2);
    await page.getByTestId(`project-card-${projectId}`).getByRole('button', { name: `删除项目 ${projectName}` }).click();
    await page.getByRole('alertdialog').filter({ hasText: '确认删除' }).getByRole('button', { name: '删除', exact: true }).click();
    await expect.poll(cacheIds).toEqual([]);
  } finally {
    allowStaleList.resolve();
  }
  await expect(secondTab.getByRole('heading', { name: '暂无项目' })).toBeVisible({ timeout: 5000 });
  await expect(secondTab.getByTestId(`project-card-${projectId}`)).toHaveCount(0);
  expect(listRequests).toBe(3);
  expect(await cacheIds()).toEqual([]);
});

test('the wizard blocks names longer than the 200-character server limit', async ({ page }) => {
  const requests = await installFixture(page, 'engineer', true);
  await page.goto('/designer');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const nameField = page.getByPlaceholder('如：无人机电源线束');
  const next = page.getByRole('button', { name: '下一步', exact: true });
  await nameField.fill('😀'.repeat(201));
  await expect(next).toBeDisabled();
  await expect(page.getByText(/最多 200 个字符/)).toBeVisible();
  await nameField.fill('😀'.repeat(200));
  await expect(next).toBeEnabled();
  expect(requests).not.toContain('/rest/v1/rpc/save_project_document');
});

test('a server input rejection lets the user go back and correct the project name', async ({ page }) => {
  let attempts = 0;
  await installFixture(page, 'engineer', true, { beforeCreate: async () => ++attempts === 1 ? 'invalid' : true });
  await page.goto('/designer');
  const firstName = '待修正项目名';
  await (await reachCreateStep(page, firstName)).click();
  const back = page.getByRole('button', { name: '上一步' });
  await expect(back).toBeEnabled({ timeout: 3000 });
  await expect(page.getByText(/创建失败.*检查输入/)).toBeVisible();
  for (let step = 1; step <= 3; step += 1) await back.click();
  const nameField = page.getByPlaceholder('如：无人机电源线束');
  await expect(nameField).toHaveValue(firstName);
  await nameField.fill('已修正项目名');
  const next = page.getByRole('button', { name: '下一步', exact: true });
  for (let step = 1; step <= 3; step += 1) await next.click();
  await page.getByRole('button', { name: '创建项目', exact: true }).last().click();
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue('已修正项目名');
  expect(attempts).toBe(2);
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
