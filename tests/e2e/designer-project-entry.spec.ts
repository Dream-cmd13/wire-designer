import { expect, test, type Page } from '@playwright/test';

const appOrigin = 'http://localhost:4193';
const fixtureOrigin = 'http://localhost:4194';
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

test.skip(process.env.E2E_BASE_URL !== appOrigin, '该用例需要端口 4193 的本地应用及端口 4194 的模拟 Supabase 配置');

async function installFixture(page: Page, role: 'engineer' | 'admin' | 'sales', empty = false) {
  const projects = empty ? [] : [{ id: projectId, name: projectName, owner_id: ownerId, description: '', created_at: timestamp, updated_at: timestamp }];
  const documents = new Map([[projectId, design]]);
  const requests: string[] = [];
  await page.route(`${fixtureOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname === '/rest/v1/rpc/current_app_role') return route.fulfill({ json: role });
    if (url.pathname === '/rest/v1/rpc/save_project_document') {
      const payload = route.request().postDataJSON() as { project_id: string; project_payload: typeof design };
      const config = payload.project_payload;
      const existing = projects.find((project) => project.id === payload.project_id);
      if (existing) existing.name = config.name;
      else projects.push({ id: payload.project_id, name: config.name, owner_id: ownerId, description: '', created_at: timestamp, updated_at: timestamp });
      documents.set(payload.project_id, config);
      return route.fulfill({ json: [{ revision: 2, updated_at: timestamp }] });
    }
    if (url.pathname === '/rest/v1/projects') {
      const id = url.searchParams.get('id')?.slice(3);
      return route.fulfill({ json: id ? [{ config: documents.get(id), revision: 1, updated_at: timestamp }] : projects });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(({ origin, id, createdAt }) => {
    if (location.origin !== origin || localStorage.getItem('sb-localhost-auth-token')) return;
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: 'local-project-entry-fixture', refresh_token: 'local-project-entry-fixture',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, email: 'designer-fixture@example.invalid', created_at: createdAt, user_metadata: {}, app_metadata: {} },
    }));
  }, { origin: appOrigin, id: ownerId, createdAt: timestamp });
  return requests;
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
  await newProject.click();
  await page.getByPlaceholder('如：无人机电源线束').fill('向导验收样件');
  const next = page.getByRole('button', { name: '下一步', exact: true });
  for (let step = 1; step <= 3; step += 1) await next.click();
  await page.getByRole('button', { name: '创建项目', exact: true }).last().click();
  await expect(page).toHaveURL(/\/designer\/design\?projectId=[\da-f-]+$/);
  await expect(page.getByPlaceholder('未命名项目')).toHaveValue('向导验收样件');
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
