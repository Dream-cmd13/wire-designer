import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { Dwg_File_Type, LibreDwg, type DwgDimensionEntity } from '@mlightcad/libredwg-web';

const owner = '00000000-0000-4000-8000-000000000001';
const originalId = '00000000-0000-4000-8000-000000000010';
const originalPath = `${owner}/${originalId}/source.dwg`;
const name = 'M12A05-07-068-3-10-500.dwg';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'dwg-fixture@example.test', created_at: '2026-01-01T00:00:00Z', user_metadata: {}, app_metadata: { provider: 'email' } };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const expiration = () => Math.floor(Date.now() / 1000) + 3600;
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, aud: 'authenticated', exp: expiration() })}.local-fixture`;
const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

interface RecordRow {
  id: string;
  owner_id: string;
  original_name: string;
  object_key: string;
  sha256: string;
  file_size: number;
  status: string;
  parent_asset_id?: string;
}

test.skip(process.env.E2E_DWG_EDIT !== '1', '需要本地 Vite 与真实 ASP.NET Core 写入服务，详见 server/dwg-edit/README.md');

let fixtures: ReturnType<typeof createServer>;
let original: Buffer;
let backendRole = 'engineer';

test.beforeAll(async () => {
  original = await readFile(name);
  fixtures = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const valid = request.headers.authorization === `Bearer ${token}` && request.headers.apikey === 'local-fixture';
    if (!valid) response.writeHead(401).end('{}');
    else if (request.url === '/auth/v1/user' && request.method === 'GET') response.end(JSON.stringify(user));
    else if (request.url === '/rest/v1/rpc/current_app_role' && request.method === 'POST') response.end(JSON.stringify(backendRole));
    else response.writeHead(404).end('{}');
  });
  await new Promise<void>((resolve, reject) => fixtures.once('error', reject).listen(5199, resolve));
});

test.afterAll(async () => {
  if (fixtures) await new Promise<void>((resolve) => fixtures.close(() => resolve()));
});

async function logIn(page: Page) {
  const rows = new Map<string, RecordRow>([[originalId, {
    id: originalId, owner_id: owner, original_name: name, object_key: originalPath, sha256: hash(original), file_size: original.length, status: 'ready',
  }]]);
  const objects = new Map([[originalPath, original]]);
  const activity = { writes: 0, generates: 0, finalizes: 0, rows, objects };
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/dwg/edit') activity.generates += 1; });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(page.url().startsWith('http') ? page.url() : process.env.E2E_BASE_URL!).origin) return route.continue();
    if (url.hostname !== 'localhost' || url.port !== '5199') return route.abort();
    if (url.pathname.startsWith('/auth/v1/token')) return route.fulfill({ json: { access_token: token, refresh_token: 'fixture', expires_in: 3600, expires_at: expiration(), token_type: 'bearer', user } });
    if (url.pathname.endsWith('/rpc/current_app_role')) return route.fulfill({ json: 'engineer' });
    if (url.pathname === '/rest/v1/dwg_assets') {
      const id = url.searchParams.get('id')?.slice(3);
      if (request.method() === 'POST') {
        const row = request.postDataJSON() as RecordRow;
        rows.set(row.id, row);
        return route.fulfill({ json: row });
      }
      if (request.method() === 'PATCH') {
        if (++activity.finalizes === 1) return route.fulfill({ status: 503, json: { message: 'fixture finalize failure' } });
        const row = rows.get(id!)!;
        row.status = 'ready';
        return route.fulfill({ json: row });
      }
      const row = id ? rows.get(id) : undefined;
      return route.fulfill({ json: id ? row ? [row] : [] : [...rows.values()] });
    }
    const prefix = '/storage/v1/object/';
    if (url.pathname.startsWith(prefix + 'sign/dwg-files/')) {
      const key = url.pathname.slice((prefix + 'sign/dwg-files/').length);
      if (request.method() === 'GET') return route.fulfill({ body: objects.get(key), contentType: 'application/octet-stream' });
      return objects.has(key) ? route.fulfill({ json: { signedURL: `/object/sign/dwg-files/${key}?token=fixture` } })
        : route.fulfill({ status: 400, json: { statusCode: '404', message: 'Object not found' } });
    }
    if (url.pathname.startsWith(prefix + 'dwg-files/')) {
      const key = url.pathname.slice((prefix + 'dwg-files/').length);
      const row = [...rows.values()].find((item) => item.object_key === key)!;
      expect(row).toBeTruthy();
      expect(request.headers()['x-upsert']).toBe('false');
      const body = request.postDataBuffer()!;
      const start = body.indexOf('AC1018');
      expect(start).toBeGreaterThanOrEqual(0);
      const bytes = body.subarray(start, start + row.file_size);
      expect(hash(bytes)).toBe(row.sha256);
      objects.set(key, bytes);
      activity.writes += 1;
      return route.fulfill({ json: { Key: `dwg-files/${key}` } });
    }
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(() => {
    const seen: Record<string, { x: number; y: number }> = {};
    Reflect.set(window, 'dwgPaintedText', seen);
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, width) {
      if (this.canvas.parentElement?.dataset.testid === 'dwg-drop-zone') {
        const height = Number(this.font.match(/([\d.]+)px/)?.[1] ?? '10');
        const rect = this.canvas.getBoundingClientRect();
        const matrix = this.getTransform();
        const textWidth = this.measureText(text).width;
        const targetX = this.textAlign === 'center' ? x : this.textAlign === 'right' ? x - textWidth / 2 : x + textWidth / 2;
        const point = matrix.transformPoint({ x: targetX, y: y - height / 3 });
        seen[text] = { x: point.x * rect.width / this.canvas.width, y: point.y * rect.height / this.canvas.height };
      }
      if (width === undefined) fillText.call(this, text, x, y);
      else fillText.call(this, text, x, y, width);
    };
  });
  await page.goto('/dwg-viewer');
  await page.getByRole('button', { name: '登录', exact: true }).first().click();
  await page.getByPlaceholder('用户名或 name@example.com').fill(user.email);
  await page.locator('input[type=password]').fill('local-fixture-only');
  await page.getByRole('dialog').getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('option', { name })).toBeAttached();
  return activity;
}

async function selectDimension(page: Page, label = '*500±10') {
  const zone = page.getByTestId('dwg-drop-zone');
  const position = await page.evaluate((text) => Reflect.get(window, 'dwgPaintedText')[text] as { x: number; y: number }, label);
  expect(position).toBeTruthy();
  await zone.click({ position });
  const overlap = page.getByLabel('重叠对象');
  if (await overlap.count()) await overlap.selectOption('DIMENSION:9F0');
  await expect(page.getByLabel('尺寸显示文字')).toHaveValue(label);
}

async function generate(page: Page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '生成 DWG', exact: true }).click();
}

async function inspectRevision(bytes: Buffer) {
  expect(bytes.subarray(0, 6).toString()).toBe('AC1018');
  const engine = await LibreDwg.create();
  function read(buffer: Buffer) {
    const pointer = engine.dwg_read_data(Uint8Array.from(buffer).buffer, Dwg_File_Type.DWG);
    try { return engine.convert(pointer); } finally { engine.dwg_free(pointer); }
  }
  const source = read(original);
  const revised = read(bytes);
  const blocks = revised.tables.BLOCK_RECORD.entries;
  const findModel = (database: typeof source) => database.tables.BLOCK_RECORD.entries.find((block) => block.name.toUpperCase() === '*MODEL_SPACE')!;
  const dimension = findModel(revised).entities.find((entity) => entity.handle === '9F0') as DwgDimensionEntity;
  const before = findModel(source).entities.find((entity) => entity.handle === dimension.handle) as DwgDimensionEntity;
  expect(dimension).toMatchObject({ type: 'DIMENSION', text: expect.stringContaining('*750±10'), measurement: expect.closeTo(105.64115, 5),
    definitionPoint: before.definitionPoint, textPoint: before.textPoint, name: before.name });
  for (const field of ['subDefinitionPoint1', 'subDefinitionPoint2', 'rotationAngle', 'obliqueAngle'] as const) {
    expect(Reflect.get(dimension, field)).toEqual(Reflect.get(before, field));
  }
  expect(blocks.find((block) => block.name === '*D5')!.entities.find((entity) => entity.type === 'MTEXT')).toMatchObject({ text: expect.stringContaining('*750±10') });
  expect(findModel(revised).entities.find((entity) => entity.handle === 'B72')).toMatchObject({ text: expect.stringContaining('插拔次数：500次') });
}

test('drags local DWG, edits and undoes a dimension, then downloads verified writer bytes', async ({ page }, testInfo) => {
  const activity = await logIn(page);
  const dataTransfer = await page.evaluateHandle(({ name, encoded }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))], name));
    return transfer;
  }, { name, encoded: original.toString('base64') });
  await page.getByTestId('dwg-drop-zone').dispatchEvent('drop', { dataTransfer });
  await page.getByRole('button', { name: '编辑图纸' }).click();
  await selectDimension(page);
  await page.getByLabel('尺寸显示文字').fill('*750±10');
  await page.getByRole('button', { name: '应用到草稿预览' }).click();
  await page.getByRole('button', { name: '撤回上次修改' }).click();
  await expect(page.getByLabel('尺寸显示文字')).toHaveValue('*500±10');
  await page.getByLabel('尺寸显示文字').fill('*750±10');
  await page.getByRole('button', { name: '应用到草稿预览' }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '生成 DWG', exact: true }).click();
  expect(activity.generates).toBe(0);
  expect(activity.writes).toBe(0);
  backendRole = 'sales';
  try {
    await generate(page);
    await expect(page.getByRole('alert')).toContainText('仅工程师或管理员');
  } finally { backendRole = 'engineer'; }
  await generate(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载修订 DWG' }).click();
  const download = await downloadEvent;
  const output = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(output);
  const bytes = await readFile(output);
  await inspectRevision(bytes);
  expect(await readFile(name)).toEqual(original);
  expect(activity.writes).toBe(0);
  if (process.env.DWG_EDIT_EVIDENCE_DIR) await writeFile(join(process.env.DWG_EDIT_EVIDENCE_DIR, 'M12_浏览器下载_修订.dwg'), bytes);
  const pngEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 PNG' }).click();
  expect((await readFile(await (await pngEvent).path())).subarray(1, 4).toString()).toBe('PNG');
  const pdfEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 PDF' }).click();
  expect((await readFile(await (await pdfEvent).path())).subarray(0, 5).toString()).toBe('%PDF-');
});

test('saves exact generated bytes as a private child and recovers finalization without another upload', async ({ page }) => {
  const activity = await logIn(page);
  const picker = page.getByRole('combobox', { name: '云端图纸', exact: true });
  await picker.selectOption(originalId);
  await page.getByRole('button', { name: '编辑图纸' }).click();
  await selectDimension(page);
  await page.getByLabel('尺寸显示文字').fill('*750±10');
  await page.getByRole('button', { name: '应用到草稿预览' }).click();
  await generate(page);
  const save = page.getByRole('button', { name: '另存为新版' });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('确认失败');
  await save.click();
  await expect(page.getByRole('button', { name: '修订件已保存' })).toBeDisabled();
  expect(activity.writes).toBe(1);
  const revised = [...activity.rows.values()].find((row) => row.id !== originalId)!;
  expect(revised).toMatchObject({ parent_asset_id: originalId, status: 'ready', owner_id: owner });
  expect(revised.object_key).toBe(`${owner}/${revised.id}/source.dwg`);
  expect(hash(activity.objects.get(originalPath)!)).toBe(hash(original));
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载修订 DWG' }).click();
  expect(hash(await readFile(await (await event).path()))).toBe(revised.sha256);
  await page.reload();
  await expect(picker).toHaveValue(originalId);
  await picker.selectOption(revised.id);
  await expect(page).toHaveURL(new RegExp(revised.id));
  await page.getByRole('button', { name: '编辑图纸' }).click();
  await selectDimension(page, '*750±10');
  await picker.selectOption(originalId);
  await page.getByRole('button', { name: '编辑图纸' }).click();
  await selectDimension(page);
});

test('discards an in-flight revision when the engineer opens another drawing', async ({ page }) => {
  const activity = await logIn(page);
  await page.getByRole('combobox', { name: '云端图纸', exact: true }).selectOption(originalId);
  await page.getByRole('button', { name: '编辑图纸' }).click();
  await selectDimension(page);
  await page.getByLabel('尺寸显示文字').fill('*750±10');
  await page.getByRole('button', { name: '应用到草稿预览' }).click();

  let releaseResponse!: () => void;
  const held = new Promise<void>((resolve) => { releaseResponse = resolve; });
  let receiveResponse!: () => void;
  const received = new Promise<void>((resolve) => { receiveResponse = resolve; });
  await page.route('**/api/dwg/edit', async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    receiveResponse();
    await held;
    await route.fulfill({ response }).catch(() => undefined);
  });
  try {
    await generate(page);
    await received;
    await expect(page.getByRole('button', { name: '取消生成' })).toBeVisible();
    const replacement = 'M12A04-07-068-3-10-500.dwg';
    await page.locator('input[type=file]').setInputFiles(replacement);
    await expect(page.getByRole('button', { name: '编辑图纸' })).toBeEnabled();
    expect(activity.generates).toBe(1);
  } finally {
    releaseResponse();
  }
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('button', { name: '下载修订 DWG' })).toHaveCount(0);
});
