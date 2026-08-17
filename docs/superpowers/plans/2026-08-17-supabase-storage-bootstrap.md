# Supabase Storage 自动初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供管理员侧幂等 Storage bucket 初始化命令，并让前端以只读方式检测和提示远程 Storage 未初始化或隐私配置错误。

**Architecture:** Node 脚本使用 Supabase 服务端密钥调用 Storage 管理 API，确保 `catalog-assets` 与 `project-assets` 存在且为私有。Postgres 提供只返回固定桶状态的 `security definer` RPC，React 应用启动时用 publishable key 查询并在应用壳层显示可重试提示。

**Tech Stack:** Node.js ESM、`@supabase/supabase-js`、PostgreSQL SQL、React 19、TypeScript、Vitest、Lucide React。

## Global Constraints

- 浏览器不得创建或修改 bucket，不得接触 `SUPABASE_SECRET_KEY`、service role key 或数据库密码。
- 初始化脚本只管理 bucket，不替代 `supabase/sql/30_security/01_rls.sql`。
- 两个 bucket 的目标状态固定为私有：`catalog-assets`、`project-assets`。
- 管理 API 失败必须使命令以非零状态退出，且输出不得包含凭据。
- 未配置 Supabase 时保留本地运行行为，不显示 Storage 警告。
- 提交时只包含本任务文件；推送前必须确认本次 SQL 已在远程 Supabase 执行。

---

### Task 1: 管理员侧幂等 bucket 初始化

**Files:**
- Create: `scripts/lib/storageBootstrap.mjs`
- Create: `scripts/lib/storageBootstrap.test.mjs`
- Create: `scripts/bootstrap-storage.mjs`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `REQUIRED_STORAGE_BUCKETS`，元素结构为 `{ id: string, public: false }`。
- Produces: `ensureStorageBuckets(storage, specs?) => Promise<Array<{ id: string, action: 'created' | 'updated' | 'unchanged' }>>`。
- Consumes: Supabase Storage 管理对象的 `listBuckets`、`createBucket`、`updateBucket` 方法。

- [x] **Step 1: 写失败测试，覆盖创建、修复和幂等行为**

```js
import { describe, expect, it } from 'vitest';
import { ensureStorageBuckets } from './storageBootstrap.mjs';

it('creates missing buckets as private', async () => {
  const storage = createFakeStorage([]);
  await expect(ensureStorageBuckets(storage)).resolves.toEqual([
    { id: 'catalog-assets', action: 'created' },
    { id: 'project-assets', action: 'created' },
  ]);
  expect(storage.snapshot()).toEqual([
    expect.objectContaining({ id: 'catalog-assets', public: false }),
    expect.objectContaining({ id: 'project-assets', public: false }),
  ]);
});

it('repairs a public bucket without discarding its limits', async () => {
  const storage = createFakeStorage([
    { id: 'catalog-assets', public: true, file_size_limit: 4096, allowed_mime_types: ['image/png'] },
    { id: 'project-assets', public: false },
  ]);
  const result = await ensureStorageBuckets(storage);
  expect(result).toContainEqual({ id: 'catalog-assets', action: 'updated' });
  expect(storage.snapshot()).toContainEqual(expect.objectContaining({
    id: 'catalog-assets', public: false, file_size_limit: 4096, allowed_mime_types: ['image/png'],
  }));
});
```

同一测试文件再覆盖：两个桶已正确时均为 `unchanged`；并发创建返回错误但重新查询已存在时继续；读取、创建或更新最终失败时 reject。

- [x] **Step 2: 运行脚本单元测试并确认失败**

Run: `npx vitest run scripts/lib/storageBootstrap.test.mjs`

Expected: FAIL，原因是 `storageBootstrap.mjs` 尚不存在或导出未定义。

- [x] **Step 3: 实现纯初始化逻辑**

```js
export const REQUIRED_STORAGE_BUCKETS = Object.freeze([
  Object.freeze({ id: 'catalog-assets', public: false }),
  Object.freeze({ id: 'project-assets', public: false }),
]);

export async function ensureStorageBuckets(storage, specs = REQUIRED_STORAGE_BUCKETS) {
  const actions = [];
  for (const spec of specs) {
    let bucket = await findBucket(storage, spec.id);
    if (!bucket) {
      const { error } = await storage.createBucket(spec.id, { public: false });
      if (error) {
        bucket = await findBucket(storage, spec.id);
        if (!bucket) throw new Error(`Failed to create Storage bucket ${spec.id}: ${error.message}`);
      } else {
        actions.push({ id: spec.id, action: 'created' });
        continue;
      }
    }
    if (bucket.public) {
      const { error } = await storage.updateBucket(spec.id, {
        public: false,
        fileSizeLimit: bucket.file_size_limit ?? null,
        allowedMimeTypes: bucket.allowed_mime_types ?? null,
      });
      if (error) throw new Error(`Failed to make Storage bucket ${spec.id} private: ${error.message}`);
      actions.push({ id: spec.id, action: 'updated' });
    } else {
      actions.push({ id: spec.id, action: 'unchanged' });
    }
  }
  return actions;
}
```

`findBucket` 使用 `listBuckets({ search: id, limit: 100 })` 并做精确 `id` 匹配；列表失败时直接抛错。

- [x] **Step 4: 实现 CLI 入口和 npm 命令**

`scripts/bootstrap-storage.mjs` 复用 `scripts/create-user.mjs` 的 `.env` 读取约定，读取：

```js
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
```

缺少凭据时输出明确错误并 `process.exit(1)`；成功时逐桶输出 `created`、`updated` 或 `unchanged`，失败时只输出错误消息。`package.json` 增加：

```json
"supabase:bootstrap-storage": "node scripts/bootstrap-storage.mjs"
```

`.env.example` 保留 server-only 注释并明确该密钥供 `user:create` 与 `supabase:bootstrap-storage` 使用，不新增任何 `VITE_` secret。

- [x] **Step 5: 运行脚本测试并确认通过**

Run: `npx vitest run scripts/lib/storageBootstrap.test.mjs`

Expected: PASS。

---

### Task 2: 只读 Storage 状态 RPC 与前端状态解析

**Files:**
- Modify: `supabase/sql/20_storage/01_buckets.sql`
- Create: `src/lib/storageBootstrap.ts`
- Create: `src/lib/__tests__/storageBootstrap.test.ts`

**Interfaces:**
- Produces SQL RPC: `public.get_storage_bootstrap_status()`，返回 `bucket_id text, is_present boolean, is_public boolean`。
- Produces TypeScript union: `StorageBootstrapState`，状态为 `unconfigured | ready | issue | error`。
- Produces: `checkStorageBootstrap(client: SupabaseClient | null) => Promise<StorageBootstrapState>`。

- [x] **Step 1: 写失败测试，覆盖 SQL 安全约束和状态解析**

```ts
it('defines a restricted read-only storage status RPC', () => {
  expect(storageSql).toContain('create or replace function public.get_storage_bootstrap_status()');
  expect(storageSql).toContain('security definer');
  expect(storageSql).toContain('revoke all on function public.get_storage_bootstrap_status() from public');
  expect(storageSql).toContain('grant execute on function public.get_storage_bootstrap_status() to anon, authenticated');
});

it('reports missing and public buckets', async () => {
  const client = fakeClient([
    { bucket_id: 'catalog-assets', is_present: false, is_public: false },
    { bucket_id: 'project-assets', is_present: true, is_public: true },
  ]);
  await expect(checkStorageBootstrap(client)).resolves.toEqual({
    status: 'issue',
    missingBuckets: ['catalog-assets'],
    publicBuckets: ['project-assets'],
  });
});
```

同一测试文件覆盖：`null` 客户端返回 `unconfigured`；两个私有桶返回 `ready`；RPC error、非数组、缺行或字段类型错误返回 `error`。

- [x] **Step 2: 运行状态测试并确认失败**

Run: `npx vitest run src/lib/__tests__/storageBootstrap.test.ts`

Expected: FAIL，原因是 TypeScript 模块和 SQL RPC 尚未实现。

- [x] **Step 3: 增加安全的 SQL RPC**

在现有幂等建桶 SQL 后增加：

```sql
create or replace function public.get_storage_bootstrap_status()
returns table (bucket_id text, is_present boolean, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with required_buckets(bucket_id) as (
    values ('catalog-assets'::text), ('project-assets'::text)
  )
  select required_buckets.bucket_id,
         buckets.id is not null as is_present,
         coalesce(buckets.public, false) as is_public
  from required_buckets
  left join storage.buckets as buckets on buckets.id = required_buckets.bucket_id
  order by required_buckets.bucket_id;
$$;

revoke all on function public.get_storage_bootstrap_status() from public;
grant execute on function public.get_storage_bootstrap_status() to anon, authenticated;
```

- [x] **Step 4: 实现前端状态解析**

```ts
export type StorageBootstrapState =
  | { status: 'unconfigured' }
  | { status: 'ready' }
  | { status: 'issue'; missingBuckets: string[]; publicBuckets: string[] }
  | { status: 'error'; message: string };

const REQUIRED_STORAGE_BUCKETS = ['catalog-assets', 'project-assets'] as const;
const STORAGE_STATUS_ERROR_MESSAGE = '无法确认远程存储状态，请检查网络、Supabase 配置和 Storage SQL 初始化。';

interface StorageBootstrapRow {
  bucket_id: string;
  is_present: boolean;
  is_public: boolean;
}

function isStorageBootstrapRow(value: unknown): value is StorageBootstrapRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.bucket_id === 'string'
    && typeof row.is_present === 'boolean'
    && typeof row.is_public === 'boolean';
}

export async function checkStorageBootstrap(client: SupabaseClient | null): Promise<StorageBootstrapState> {
  if (!client) return { status: 'unconfigured' };
  const { data, error } = await client.rpc('get_storage_bootstrap_status');
  if (error) return { status: 'error', message: STORAGE_STATUS_ERROR_MESSAGE };

  if (!Array.isArray(data)) {
    return { status: 'error', message: STORAGE_STATUS_ERROR_MESSAGE };
  }

  const rows = data.filter(isStorageBootstrapRow);
  if (rows.length !== data.length) {
    return { status: 'error', message: STORAGE_STATUS_ERROR_MESSAGE };
  }
  const byId = new Map(rows.map((row) => [row.bucket_id, row]));

  if (REQUIRED_STORAGE_BUCKETS.some((id) => !byId.has(id))) {
    return { status: 'error', message: STORAGE_STATUS_ERROR_MESSAGE };
  }

  const missingBuckets = REQUIRED_STORAGE_BUCKETS.filter((id) => !byId.get(id)?.is_present);
  const publicBuckets = REQUIRED_STORAGE_BUCKETS.filter((id) => byId.get(id)?.is_present && byId.get(id)?.is_public);
  return missingBuckets.length || publicBuckets.length
    ? { status: 'issue', missingBuckets, publicBuckets }
    : { status: 'ready' };
}
```

错误文案固定为用户可理解的中文，不向界面透传服务端原始错误。

- [x] **Step 5: 运行状态测试并确认通过**

Run: `npx vitest run src/lib/__tests__/storageBootstrap.test.ts`

Expected: PASS。

---

### Task 3: 全局 Storage 初始化提示

**Files:**
- Create: `src/components/shared/StorageSetupBanner.tsx`
- Create: `src/lib/__tests__/storageSetupBanner.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `StorageBootstrapState` 与 `checkStorageBootstrap`。
- Produces component: `StorageSetupBanner({ state, checking, onRetry })`。

- [x] **Step 1: 写失败组件测试**

```tsx
it('shows missing and public buckets with a retry action', () => {
  const html = renderToStaticMarkup(
    <StorageSetupBanner
      state={{ status: 'issue', missingBuckets: ['catalog-assets'], publicBuckets: ['project-assets'] }}
      checking={false}
      onRetry={() => undefined}
    />,
  );
  expect(html).toContain('catalog-assets');
  expect(html).toContain('project-assets');
  expect(html).toContain('npm run supabase:bootstrap-storage');
  expect(html).toContain('重新检测存储状态');
});
```

再验证 `ready` 与 `unconfigured` 返回空标记，`error` 显示无法确认状态，`checking` 禁用重试按钮。

- [x] **Step 2: 运行组件测试并确认失败**

Run: `npx vitest run src/lib/__tests__/storageSetupBanner.test.tsx`

Expected: FAIL，原因是组件尚不存在。

- [x] **Step 3: 实现提示组件**

组件使用 `AlertTriangle` 和 `RefreshCw`，保持与现有目录错误提示一致的琥珀色全宽条带。重试入口使用图标按钮，包含 `title` 与 `aria-label="重新检测存储状态"`；`checking` 时禁用并旋转图标。`ready`、`unconfigured` 时返回 `null`。

- [x] **Step 4: 在 App 启动流程中接入检测**

`App.tsx` 新增状态和回调：

```tsx
const [storageBootstrapState, setStorageBootstrapState] = useState<StorageBootstrapState>({ status: 'unconfigured' });
const [storageChecking, setStorageChecking] = useState(false);

const refreshStorageBootstrap = useCallback(async () => {
  setStorageChecking(true);
  try {
    setStorageBootstrapState(await checkStorageBootstrap(supabase));
  } finally {
    setStorageChecking(false);
  }
}, []);

useEffect(() => {
  void refreshStorageBootstrap();
}, [refreshStorageBootstrap]);
```

在 `AdminShell` 内容顶部、目录错误提示之前渲染 `StorageSetupBanner`。前端只调用 RPC，不调用 `listBuckets`、`createBucket` 或 `updateBucket`。

- [x] **Step 5: 运行组件与状态测试并确认通过**

Run: `npx vitest run src/lib/__tests__/storageBootstrap.test.ts src/lib/__tests__/storageSetupBanner.test.tsx`

Expected: PASS。

---

### Task 4: 部署文档与完整验证

**Files:**
- Modify: `README.md`
- Modify: `supabase/sql/README.md`

**Interfaces:**
- Documents: SQL 顺序、初始化命令、所需 server-only 环境变量、失败退出行为、RLS 不由脚本创建。

- [x] **Step 1: 更新运维文档**

在根 README 的环境变量段加入：

```powershell
npm run supabase:bootstrap-storage
```

说明命令只应在部署、CI 或管理员本机运行，依赖 `SUPABASE_URL`/`VITE_SUPABASE_URL` 与 `SUPABASE_SECRET_KEY`，不得把 secret 加 `VITE_` 前缀。

在 `supabase/sql/README.md` 明确：先按顺序执行 SQL 以安装状态函数和 RLS，再运行初始化命令；脚本创建/修复 bucket，但不替代策略 SQL。

- [x] **Step 2: 运行全部相关测试**

Run: `npx vitest run scripts/lib/storageBootstrap.test.mjs src/lib/__tests__/storageBootstrap.test.ts src/lib/__tests__/storageSetupBanner.test.tsx`

Expected: PASS。

- [x] **Step 3: 运行项目验证**

Run: `npm test`

Expected: PASS。

Run: `npm run lint`

Expected: PASS；若存在与本次无关的既有错误，记录具体文件和错误，不修改无关代码。

Run: `npm run build`

Expected: PASS。

- [x] **Step 4: 检查工作区差异和敏感信息**

Run: `git status --short`

Run: `git diff --check`

Run: `git diff -- package.json .env.example scripts src/App.tsx src/components/shared/StorageSetupBanner.tsx src/lib/storageBootstrap.ts supabase/sql/20_storage/01_buckets.sql README.md supabase/sql/README.md docs/superpowers/specs/2026-08-17-supabase-storage-bootstrap-design.md docs/superpowers/plans/2026-08-17-supabase-storage-bootstrap.md`

Expected: 只包含本任务文件；没有真实 URL、密钥、数据库密码或用户已有改动。仅精确暂存本任务文件。

## Execution Notes

- `npm test`: 43 个测试文件、231 项测试全部通过。
- `npm run build`: 通过；保留项目已有的大 chunk 警告。
- 本次变更文件的定向 ESLint 检查通过。
- `npm run lint`: 仍因未改动的 `src/components/canvas/WireMaterialDialog.tsx:96` 触发 `react-hooks/set-state-in-effect` 而退出 1；本任务未修改该文件。
- 桌面与 390 x 844 视口的本地页面快照均确认 Storage 提示位于主内容上方且无重叠。
