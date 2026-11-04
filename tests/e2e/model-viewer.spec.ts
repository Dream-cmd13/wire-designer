import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { twoTetrahedraStep } from './model-fixtures';

// Auth/API fixtures are intercepted locally. The actual Worker, OCCT WASM,
// STLLoader and WebGL run unmocked. Never sends credentials/files to an external host.
const uid = '00000000-0000-4000-8000-000000000001';
const stepPath = process.env.MODEL_PREVIEW_STEP_PATH;
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'local-fixture@example.test', created_at: '2026-01-01T00:00:00Z', user_metadata: {}, app_metadata: { provider: 'email' } };
const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.local-fixture`;

interface LocalCloud { records: Record<string, unknown>[]; original: Buffer; object: Buffer | null; uploads: number; finalizeFailures: number }
async function localLogin(page: Page, role = 'engineer', cloud?: LocalCloud) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['localhost','127.0.0.1'].includes(url.hostname) && !url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/storage/v1/')) return route.continue();
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: jwt, refresh_token: 'local-fixture', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: 'bearer', user } });
    if (url.pathname.startsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/rpc/current_app_role')) return route.fulfill({ json: role });
    if (url.pathname.endsWith('/rpc/get_storage_bootstrap_status')) return route.fulfill({ json: ['catalog-assets','dwg-drawings','model-files'].map((bucket_id) => ({ bucket_id, is_present: true, is_public: false })) });
    if (cloud && url.pathname.endsWith('/rest/v1/model_assets')) {
      const method = route.request().method();
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const record = cloud.records.find((row) => row.id === id);
      if (method === 'POST') {
        const value = route.request().postDataJSON() as Record<string, unknown>;
        cloud.records.push(value); return route.fulfill({ json: value });
      }
      if (method === 'PATCH') {
        if (cloud.finalizeFailures-- > 0) return route.fulfill({ status: 503, json: { message: 'local finalize failure' } });
        if (record) Object.assign(record, { status: 'ready' });
        return route.fulfill({ json: record ?? null });
      }
      return route.fulfill({ json: id ? record ?? null : cloud.records });
    }
    if (cloud && url.pathname.includes('/storage/v1/object/sign/model-files/')) {
      if (route.request().method() === 'POST') return cloud.object
        ? route.fulfill({ json: { signedURL: `${url.pathname.replace('/storage/v1','')}?token=local-only` } })
        : route.fulfill({ status: 400, json: { statusCode: '404', error: 'not_found', message: 'Object not found' } });
      return cloud.object ? route.fulfill({ body: cloud.object, contentType: 'application/octet-stream' }) : route.fulfill({ status: 404 });
    }
    if (cloud && url.pathname.includes('/storage/v1/object/model-files/')) {
      expect(route.request().headers()['x-upsert']).toBe('false');
      expect(route.request().postDataBuffer()?.includes(cloud.original)).toBe(true);
      cloud.object = cloud.original; cloud.uploads++;
      return route.fulfill({ json: { Id: 'object-local', Key: url.pathname.replace('/storage/v1/object/', '') } });
    }
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    return route.abort('blockedbyclient');
  });
  await page.goto('/model-viewer');
  await page.getByRole('button', { name: '登录', exact: true }).first().click();
  await page.getByPlaceholder('用户名或 name@example.com').fill('local-fixture@example.test');
  await page.locator('input[type="password"]').fill('local-fixture-only');
  await page.getByRole('dialog').getByRole('button', { name: '登录', exact: true }).click();
  if (role !== 'sales') await expect(page.getByRole('heading', { name: '3D 模型', exact: true })).toBeVisible();
}
function asciiStl() {
  const faces = [[[0,0,0],[0,3,0],[2,0,0]], [[0,0,0],[2,0,0],[0,0,4]], [[0,0,0],[0,0,4],[0,3,0]], [[2,0,0],[0,3,0],[0,0,4]]];
  return Buffer.from(`solid tetra\n${faces.map((v) => `facet normal 0 0 0\nouter loop\n${v.map((p) => `vertex ${p.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid tetra`);
}
function binaryStl() {
  const buffer = Buffer.alloc(84 + 50); buffer.writeUInt32LE(1,80);
  [0,0,0,2,0,0,0,3,4].forEach((v,i) => buffer.writeFloatLE(v, 96+i*4));
  return buffer;
}
async function uploadLocal(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel('选择模型文件').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(page.getByTestId('model-bounds')).toBeVisible();
  await expect(page.locator('[aria-label="三维模型画布"] canvas')).toBeVisible();
}

test('anonymous access requires login and sales cannot open the model page', async ({ page }) => {
  await page.goto('/model-viewer'); await expect(page.getByRole('heading', { name: '需要登录后使用' })).toBeVisible();
  await localLogin(page, 'sales');
  await expect(page).toHaveURL(/auto-quote/);
  await expect(page.getByRole('button', { name: '3D 模型', exact: true })).toHaveCount(0);
});

test('real STL, units, controls, resize, malformed input and replacement cleanup', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const live = new Set<WebGLBuffer>();
    const stats = { created: 0, deleted: 0, get live() { return live.size; } };
    Reflect.set(window, '__modelGpu', stats);
    for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!constructor) continue;
      const prototype = constructor.prototype;
      const create = prototype.createBuffer; const remove = prototype.deleteBuffer;
      Object.defineProperty(prototype, 'createBuffer', { value: function(this: WebGLRenderingContext) {
        const buffer = create.call(this); if (buffer) { live.add(buffer); stats.created++; } return buffer;
      } });
      Object.defineProperty(prototype, 'deleteBuffer', { value: function(this: WebGLRenderingContext, buffer: WebGLBuffer | null) {
        if (buffer && live.delete(buffer)) stats.deleted++; return remove.call(this, buffer);
      } });
    }
  });
  await localLogin(page);
  await uploadLocal(page, 'tetra.STL', asciiStl());
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
  await page.getByLabel('STL 用户指定单位').selectOption('inch');
  await expect(page.getByTestId('model-bounds')).toHaveText('50.80 × 76.20 × 101.60 mm');
  for (const view of ['等轴测','前视','顶视','右视','重置视角','网格特征边']) await page.getByRole('button', { name: view, exact: true }).click();
  const canvas = page.locator('[aria-label="三维模型画布"] canvas'); const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+60,rect.y+rect.height/2+30, { steps: 5 }); await page.mouse.up();
  await page.mouse.wheel(0,-200); await page.mouse.down({ button: 'right' }); await page.mouse.move(rect.x+rect.width/2+80,rect.y+rect.height/2+40); await page.mouse.up({ button: 'right' });
  await page.setViewportSize({ width: 1024, height: 768 });
  const before = await page.evaluate(() => ({ ...Reflect.get(window, '__modelGpu') }));
  for (let i=0; i<20; i++) await uploadLocal(page, `replacement-${i}.stl`, i%2 ? binaryStl() : asciiStl());
  await expect(canvas).toHaveCount(1);
  const after = await page.evaluate(() => ({ ...Reflect.get(window, '__modelGpu') }));
  expect(after.created).toBeGreaterThan(before.created);
  expect(after.live).toBeLessThanOrEqual(before.live + 2);
  console.log(JSON.stringify({ gpuBuffersBefore: before, gpuBuffersAfter20Replacements: after }));
  await canvas.evaluate((element) => (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByRole('alert')).toContainText('WebGL');
  await page.getByRole('button', { name: '重建画布' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('选择模型文件').setInputFiles({ name: 'broken.stl', mimeType: 'application/octet-stream', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('解析失败');
  await uploadLocal(page,'recovered.stl',asciiStl());
  await expect(page.getByText('仅本地预览', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await expect(page.locator('[aria-label="三维模型画布"] canvas')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__modelGpu').live)).toBe(0);
  expect(errors).toEqual([]);
});

test('self-authored multiple STEP solids keep relative positions', async ({ page }) => {
  await localLogin(page);
  await uploadLocal(page, 'two-tetrahedra.step', twoTetrahedraStep());
  await expect(page.getByTestId('model-bounds')).toHaveText('12.00 × 3.00 × 4.00 mm');
  await expect(page.getByText('8 个三角形 · 2 个网格', { exact: true })).toBeVisible();
});

test('local HTTP fixture: upload succeeds, finalize fails, reload resumes without reupload and reopens', async ({ page }) => {
  const cloud: LocalCloud = { records: [], original: asciiStl(), object: null, uploads: 0, finalizeFailures: 1 };
  await localLogin(page, 'engineer', cloud);
  await uploadLocal(page, 'saved.stl', cloud.original);
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('原文件已上传，但数据库确认失败');
  expect(cloud.uploads).toBe(1); expect(cloud.records).toHaveLength(1);
  expect(cloud.records[0].status).toBe('uploading');
  await expect(page.getByText('保存失败，可重试', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '恢复保存', exact: true }).click();
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
  expect(cloud.uploads).toBe(1); expect(cloud.records[0].status).toBe('ready');
  await expect(page).toHaveURL(new RegExp(`modelId=${cloud.records[0].id}`));
  await page.reload();
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
  await page.getByRole('button', { name: '打开预览', exact: true }).click();
  await expect(page.getByTestId('model-bounds')).toHaveText('2.00 × 3.00 × 4.00 mm');
});

test('local HTTP fixture: wrong recovery source is never marked saved', async ({ page }) => {
  const cloud: LocalCloud = { records: [], original: asciiStl(), object: null, uploads: 0, finalizeFailures: 1 };
  await localLogin(page, 'engineer', cloud); await uploadLocal(page, 'original.stl', cloud.original);
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('数据库确认失败');
  await page.goto(`/model-viewer?modelId=${cloud.records[0].id}`);
  await expect(page.getByText(/正在恢复：original.stl/)).toBeVisible();
  await uploadLocal(page, 'different.stl', binaryStl());
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('不匹配');
  expect(cloud.records[0].status).toBe('uploading'); expect(cloud.uploads).toBe(1);
  await expect(page.getByText('保存失败，可重试', { exact: true })).toBeVisible();
  await uploadLocal(page, 'original.stl', cloud.original);
  await page.getByRole('button', { name: '保存到云端', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开预览', exact: true })).toBeVisible();
  expect(cloud.records[0].status).toBe('ready'); expect(cloud.uploads).toBe(1);
});

test('private real STEP fixture parses in Worker with approximate dimensions and actual WASM', async ({ page }, testInfo) => {
  test.skip(!stepPath || !existsSync(stepPath), '未提供存在的 MODEL_PREVIEW_STEP_PATH；真实 STEP 验收未执行，不代表通过');
  test.setTimeout(120_000);
  const errors: string[] = []; const consoleErrors: string[] = []; const wasm: { status: number; mime: string }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.url().includes('occt-import-js.wasm')) wasm.push({ status: response.status(), mime: response.headers()['content-type'] ?? '' }); });
  await localLogin(page);
  const start = Date.now();
  await page.getByLabel('选择模型文件').setInputFiles(stepPath!);
  await expect(page.getByTestId('model-bounds')).toBeVisible({ timeout: 65_000 });
  const text = await page.getByTestId('model-bounds').innerText();
  const sizes = text.match(/[\d.]+/g)!.map(Number);
  for (const [i, expected] of [19.6,19.6,24].entries()) expect(Math.abs(sizes[i]-expected)).toBeLessThanOrEqual(0.1);
  const metadata = await page.locator('section').filter({ has: page.getByTestId('model-bounds') }).innerText();
  console.log(JSON.stringify({ stepElapsedMs: Date.now()-start, meshBounds: text, meshMetadata: metadata.match(/[\d,]+ 个三角形 · \d+ 个网格/)?.[0], wasm }));
  expect(wasm.some((r) => r.status === 200 && r.mime.includes('application/wasm'))).toBe(true);
  for (const view of ['等轴测','前视','顶视','右视']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`male-4-${view}.png`) });
  }
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
