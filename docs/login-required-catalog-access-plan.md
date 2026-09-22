# 未登录权限边界方案：项目/物料库/catalog items 需登录，独立制作图纸保留匿名能力

- 更新日期：2026-09-22
- 状态：已实施（测试库 SQL 已应用，`file_2d` 已回填对象路径）
- 关联文档：[supabase-backend-database-integration.md](./supabase-backend-database-integration.md)、[../supabase/sql/README.md](../supabase/sql/README.md)

## 1. 背景

当前 `catalog_items` 对 `anon` 开放读取（`supabase/sql/30_security/01_rls.sql:9,26`），未登录用户在物料库能看到连接器/线材/模具数量；`material_prices` 等已登录表则直接报“没有权限执行此操作”。anon key 打包在浏览器中，任何前端隐藏都可被绕过，因此权限必须以后端 RLS/Storage 策略为准，前端门禁负责引导与避免无谓请求。

本方案目标：把“未登录可制作普通图纸”和“登录后才能访问项目、物料库、catalog items”彻底分开；同时确保匿名用户对 `catalog_items` 无任何增删改查权限（GRANT/RLS 层全部拒绝），制作图纸中仅保留不依赖 catalog 的部分功能。

## 2. 权限矩阵

| 功能 | 未登录 | 已登录 |
| --- | --- | --- |
| 首页 | 显示登录提示，不显示项目列表 | 正常显示项目列表 |
| 新建项目、打开项目、导入/导出项目文件 | 禁止 | 允许 |
| 线束设计器 `/designer/*` | 禁止 | 允许 |
| 物料库 `/materials` | 禁止 | 允许 |
| 独立制作图纸 `/drawing-workbench` | 允许 | 允许 |
| 制作图纸普通手工元素（本地工具、文字、表格、常用语、图标、模板） | 允许 | 允许 |
| 制作图纸中的 catalog items（公共资源、新建向导物料、公司物料表） | 禁止加载/选择/添加 | 允许 |
| catalog items 数据库增删改查（含 REST 直查） | 全部拒绝 | 查询 + 仅新增 `accessory`（公司辅材） |
| 价格、项目保存、云端图纸保存 | 不调用 | 允许 |

> 匿名对 `catalog_items` 的四种操作均由数据库权限拒绝（审计见 §3.1，收紧见 §4.1）；前端门禁是第一道体验层，不是安全边界。

## 3. 关键设计决策

1. **双层防护**：后端 RLS/Storage 是唯一真实边界；前端路由守卫 + 页面门禁负责体验与减少请求。
2. **不重定向，留在原路由显示登录提示**：受保护路由未登录时在原路由渲染 `LoginRequiredPanel`。理由：所有数据加载均已按 `currentUser` 门禁，留在页面上无泄露风险；省去 redirect 循环与“登录后跳回”的意图保存逻辑；深链接体验更好。首页同样渲染登录提示。
3. **制作图纸仅 catalog 入口门禁**：制图、编辑、导出 PDF、云端保存均可匿名；三个 catalog 消费点（资源面板、新建向导、公司物料表）未登录时显示登录提示且不发请求。
4. **模板/常用语/图标不门禁**：它们来自本地静态资源（`src/lib/drawingCatalogRepository.ts:234-248` 调 `listStaticDrawing*`），不访问数据库。
5. **成品图纸桶转私有**：`finished-harness-drawings` 由公开桶改为私有 + 登录用户签名的 URL，`file_2d` 改存对象路径（外部 CRM 链接原样保留）。

### 3.1 匿名 catalog CRUD 审计（2026-09-22 核对）

客户端对 `catalog_items` 的全部访问点（`grep` 核对结果）：

| 操作 | 客户端入口 | 匿名处理 |
| --- | --- | --- |
| 读 | `src/lib/catalogRepository.ts:98`（设计器、物料库、选择器） | 页面/store 按 `currentUser` 门禁，不初始化 |
| 读 | `src/lib/drawingCatalogRepository.ts:206`（制作图纸公共资源、新建向导） | `canUseCatalog=false` 时不调用，显示登录提示 |
| 读 | `src/lib/drawingMaterialRepository.ts:106`（制作图纸公司物料表） | “公司物料表”tab 门禁，不调用 |
| 写（insert `accessory`） | `src/lib/drawingMaterialRepository.ts:122`（新增公司物料） | 入口不可达 + repository 守卫；数据库策略仅 `authenticated` |
| update / delete | 客户端无任何实现 | 无需新增策略，数据库本就未授予 |

其余目录相关资源（`suppliers`、`catalog-assets`、`finished-harness-drawings`）在 §4 一并收紧；`get_storage_bootstrap_status()` 是唯一保留 anon 执行的 RPC，仅返回桶是否存在，不含业务数据。

## 4. 数据库与 Storage 变更

### 4.1 `supabase/sql/30_security/01_rls.sql`

- 收紧后的最终权限状态（anon 无任何权限，四种操作全部拒绝）：

```sql
revoke all on public.catalog_items from anon, authenticated;
grant select on public.catalog_items to authenticated;
grant insert on public.catalog_items to authenticated;   -- 仅通过受限策略新增 accessory
```

- 替换策略（anon 无任何策略）：

```sql
drop policy if exists "catalog public read" on public.catalog_items;
create policy "catalog authenticated read"
  on public.catalog_items for select to authenticated
  using (true);
```

- 保留 `catalog accessory insert`（登录用户新增公司辅材）与 `catalog-assets` 的 authenticated 图片策略；不新增 update/delete 策略（客户端无对应功能）
- 新增成品图纸桶读取策略：

```sql
create policy "finished harness drawings authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'finished-harness-drawings');
```

### 4.2 `supabase/sql/10_schema/04_suppliers.sql`

```sql
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
drop policy if exists "suppliers public read" on public.suppliers;
create policy "suppliers authenticated read"
  on public.suppliers for select to authenticated using (true);
```

### 4.3 `supabase/sql/20_storage/01_buckets.sql`

- `finished-harness-drawings` 的 `public` 改为 `false`（`catalog-assets`、`cost-analysis-sources` 保持私有不变）。

### 4.4 图纸数据回填

- `supabase/sql/40_seed/07_finished_harness_drawings.sql`：8 条记录的 `file_2d` 由公网 URL 改为对象路径（如 `WL-B21-593-2000.png`），保留 `file_2d is null` 幂等守卫。
- 现有库一次性 UPDATE：把本桶旧公网 URL（`.../object/public/finished-harness-drawings/...`）替换为对象路径；非本桶外部链接（如 CRM 链接）保持原样。

### 4.5 无需改动（避免重复工作）

- `projects`、`drawings`：已仅 authenticated 且 owner 限定（`30_security/01_rls.sql:7-8,16-24`）
- `material_prices`：已仅 authenticated 读写（`10_schema/03_material_prices.sql:34-39`）
- `finished_harness_materials`、`finished_harness_cost_analyses`：已仅 authenticated（`05:33-36`、`06:115-118`）
- `catalog-assets`：已是 authenticated 读取
- `get_storage_bootstrap_status()`：保留 anon 执行权限（匿名工作台路由不触发该检查，避免 `StorageSetupBanner` 误报；`storageBootstrap.test.ts:28` 断言保持不变）

### 4.6 执行方式

测试项目按 `supabase/sql/README.md` 顺序重跑：`04_suppliers.sql` → `20_storage/01_buckets.sql` → `30_security/01_rls.sql` → `40_seed/07_finished_harness_drawings.sql` + `file_2d` 一次性回填；或按 README 全量重建。

## 5. 前端数据层

### 5.1 store 清理与竞态守卫

`catalogStore`、`priceStore`、`finishedHarnessStore` 各新增 `reset()`：

```ts
reset: () => void; // 清空数据/错误/加载标记，并使在途请求失效
```

- `catalogStore` 需同时清空模块级 `loadingPromise`（`catalogStore.ts:19`）并递增请求代次（epoch）；`load()` 返回后校验 epoch，过期结果直接丢弃，防止“登出后旧请求写回”。
- `priceStore`、`finishedHarnessStore` 同样加 epoch 守卫。
- 在 `App.resetWorkspaceForUser()`（`App.tsx:517-542`）中追加：三个 store 的 `reset()` + `clearCatalogSnapshot()`（`catalogRuntime.ts:19`）。
- `userStore` 登出时已有的 `clearCatalogImageCache()` 保留；成品图纸签名缓存一并清理。

### 5.2 成品图纸签名 URL

- 新增 `src/lib/finishedHarnessDrawingUrl.ts`：按 `catalogImageUrl.ts` 的缓存/并发去重模式实现 `resolveFinishedHarnessDrawingUrl(client, value)`：
  - `http(s)` 外部链接原样返回；
  - 本桶公网 URL（历史数据）解析出 path 后签名；
  - 对象路径直接签名（1 小时），失败保留原值。
- `src/repositories/finishedHarnessMaterialRepository.ts` 在 `list()/getById()/getByPlatformNo()` 映射后批量解析 `file2d`，UI 的 `href={file2d}` 不改。
- `scripts/upload-cost-drawings.mjs`：去掉 `getPublicUrl`，写库与种子输出对象路径；“已填充”判断由 URL 前缀改为“非 `http` 开头即视为本桶路径”。

### 5.3 repository 会话守卫（可选加固）

覆盖匿名可达的三个 catalog 仓库：`catalogRepository`（读）、`drawingCatalogRepository`（读）、`drawingMaterialRepository`（读 + 唯一写入口 `create`）。通过构造参数注入 `requireSession` 守卫（默认读真实 session，测试注入 mock），未登录时 `list`/`create` 抛出 `登录后才能访问公共物料目录。`。`projectRepository`/`priceRepository` 已有“未配置即抛错”+ RLS 兜底，本轮不加，避免破坏现有 mock 注入测试。

## 6. 路由与壳层

### 6.1 `src/lib/appRoute.ts`

```ts
export function requiresAuth(route: AppRoute): boolean {
  return route.id !== 'drawing-workbench';
}
```

需登录：`home`、`designer-design`、`designer-product-image`、`materials`；匿名可用：`drawing-workbench`。

### 6.2 `src/App.tsx`

1. `authReady === false` 时渲染全页认证加载状态。
2. `needsCatalog` / `needsStorageBootstrap`（`App.tsx:229-238`）增加 `Boolean(currentUserId)`，未登录不执行 `initializeCatalog()`、`loadPrices()`、`checkStorageBootstrap()`。
3. 未登录访问受保护路由：不渲染对应页面内容（`renderContent()`，`App.tsx:1012-1031`），渲染 `LoginRequiredPanel`；项目加载 effect（`561-582`）与设计器恢复 effect（`813-819`）已有的 `currentUserId` 条件保持。
4. `resetWorkspaceForUser()` 扩容（见 5.1）：清空项目、项目列表、恢复状态、catalog/价格/成品线束数据；退出登录后历史 URL 无法恢复数据。
5. 项目保存、重命名入口增加 `currentUser` 防御性判断（`doSave`、`handleUpdateProjectName`）。

### 6.3 新增共享组件

- `src/components/auth/LoginRequiredPanel.tsx`：整页空状态（首页、设计器、物料库），内置登录按钮打开 `AuthModal`（组件自包含，不需新增 App 状态）。
- `src/components/auth/LoginRequiredHint.tsx`：面板内提示（制作图纸三处），同样自带登录按钮。

### 6.4 `src/components/layout/AdminShell.tsx`

- 新增可选 props：`canAccessProjects?: boolean`、`canAccessMaterials?: boolean`（默认由 `currentUser` 推导，保证既有测试不传 props 也可编译）。
- 未登录：隐藏“线束设计器”“物料库”菜单，保留“首页”“制作图纸”和顶部登录按钮；登录后恢复完整菜单。
- 仅隐藏菜单不构成安全边界，§6.2 路由守卫生效。

### 6.5 首页与项目

- `App.tsx` 中未登录渲染 `LoginRequiredPanel` 而非 `ProjectList`；登录后行为不变。
- `handleNewProject` 未登录打开登录弹窗（已实现，`App.tsx:691-695`）；`handleOpenProject` 已校验 userId（`717-724`）。
- 说明：匿名将失去首页的“导入/导出项目文件”入口（该功能随 `ProjectList` 一起隐藏），属于本方案预期后果。

## 7. 制作图纸 catalog 门禁

### 7.0 匿名可用范围

| 能力 | 未登录 | 说明 |
| --- | --- | --- |
| 画布、手工绘制/线条/文字/表格、图层锁定、撤销重做 | 允许 | 不依赖 Supabase |
| 本地工具占位对象（连接器/线材/辅材/接线表/物料表/物料规格） | 允许 | `createPlacedResource` 本地生成 |
| 常用语、图标、图库模板 | 允许 | 静态资源 |
| 当前物料表编辑、添加本地行、导出 XLSX | 允许 | 仅操作图纸文档 |
| PDF / 图片导出 | 允许 | 本地导出 |
| 公共资源（catalog 连接器/线材/护套） | 禁止 | 资源面板显示登录提示 |
| 新建向导的目录物料选择与生成 | 禁止 | 向导物料区显示登录提示 |
| 公司物料表读取与新增 | 禁止 | 公司物料表 tab 显示登录提示 |
| 云端图纸列表/保存 | 不可用 | 匿名 owner 不落库（现有行为） |

### 7.1 `src/components/drawings/standalone/DrawingResourcePanel.tsx`

- 新增 `canUseCatalog: boolean`。
- 拆分加载逻辑：常用语/图标（静态）始终加载；“公共资源”在 `canUseCatalog` 为假时不调用 `drawingCatalogRepository.listResources()`，显示 `LoginRequiredHint`。
- 本地工具（连接器/线材/辅材占位、接线表、物料表、表格、物料规格）保持可用。

### 7.2 `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`

- 未登录时“新建图纸”模式不调用 `listResources()`，连接器/线材/热缩套管区域显示登录提示，“下一步/生成”保持不可用（`connectorsReady` 自然为假）。
- “从模板创建”使用本地静态模板，保持可用。
- 登录后通过 effect 依赖 `currentUser` 自动加载目录。

### 7.3 `src/components/drawings/standalone/DrawingMaterialTableDialog.tsx`

- 新增 `canUseCatalog` 或读取 `currentUser`：未登录进入“公司物料表”tab 时不调用 `drawingMaterialRepository.list()`，显示登录提示；“当前物料表”“新增物料（本地）”“导出 XLSX”保持可用。

### 7.4 `src/pages/DrawingWorkbenchPage.tsx`

- 计算 `canUseCatalog = Boolean(currentUser)` 并传入上述组件；不改变匿名 owner/hydrate 行为。

### 7.5 登出时清理已加载的目录状态

向导/资源面板/公司物料表可能在登录状态加载过 catalog 数据并保存在组件 state 中。`currentUser` 变为 `null` 时（登出或切换账号）：

- `DrawingResourcePanel`：清空 `resources`；
- `StandaloneDrawingWizard`：清空 `resources`/`templates`，并清除目录派生的 `singleConnector`/`leftConnector`/`rightConnector`/`wireResource`/`protectiveSleeveResource`（保留手工草稿的其他字段）；
- `DrawingMaterialTableDialog`：清空 `materials`，并留在原 tab 显示登录提示（实现选择：比重置到“当前物料表”体验更连贯）。

避免登出后仍能在内存中查看或基于已加载目录数据生成图纸。

## 8. 文件清单

新增：

```text
src/components/auth/LoginRequiredPanel.tsx
src/components/auth/LoginRequiredHint.tsx
src/lib/finishedHarnessDrawingUrl.ts
src/lib/__tests__/requiresAuth.test.ts
src/lib/__tests__/loginRequiredPanel.test.tsx
src/lib/__tests__/anonymousCatalogAccess.test.ts（匿名 CRUD 拒绝与 UI 门禁契约）
src/lib/__tests__/drawingCatalogGates.test.tsx（canUseCatalog 渲染断言）
```

修改：

```text
supabase/sql/30_security/01_rls.sql
supabase/sql/10_schema/04_suppliers.sql
supabase/sql/20_storage/01_buckets.sql
supabase/sql/40_seed/07_finished_harness_drawings.sql
supabase/sql/README.md
src/lib/appRoute.ts
src/App.tsx
src/components/layout/AdminShell.tsx
src/stores/catalogStore.ts
src/stores/priceStore.ts
src/stores/finishedHarnessStore.ts
src/stores/userStore.ts
src/lib/catalogRuntime.ts（接线 clearCatalogSnapshot）
src/lib/catalogRepository.ts（会话守卫）
src/lib/drawingCatalogRepository.ts（会话守卫）
src/lib/drawingMaterialRepository.ts（会话守卫，含唯一写入口 create）
src/repositories/finishedHarnessMaterialRepository.ts
src/components/drawings/standalone/DrawingResourcePanel.tsx
src/components/drawings/standalone/StandaloneDrawingWizard.tsx
src/components/drawings/standalone/DrawingMaterialTableDialog.tsx
src/pages/DrawingWorkbenchPage.tsx
scripts/upload-cost-drawings.mjs
测试：databaseSecuritySql / finishedHarnessMaterialsSql / adminShellViewToggle /
      drawingWorkbenchUi / finishedHarnessMaterialRepository / drawingMaterialRepository /
      catalogStore / priceStore / finishedHarnessStore
文档：docs/supabase-backend-database-integration.md、docs/报价业务规则.md（“匿名可读”表述）、README.md
```

## 9. 测试计划

现有测试脚手架限制：`projectOpenLifecycle.test.tsx:9-21` 将 `useEffect` mock 为空函数，守卫 effect 不会执行，因此不采用 App 级行为测试，改用以下组合：

1. `requiresAuth()` 纯函数单测：四个受保护路由 + `drawing-workbench`。
2. `LoginRequiredPanel/Hint` 静态渲染测试（`renderToStaticMarkup`），含登录按钮。
3. `AdminShell` 菜单可见性：`renderToStaticMarkup` 传入 `currentUser: null` 与登录用户，断言菜单显隐；既有 `adminShellViewToggle.test.tsx` 需适配新增可选 props。
4. store 清理：`reset()` 清空数据；mock 延迟 resolve 的在途请求在 `reset()` 后不写回（epoch 生效）。
5. 源码契约测试（仓库既有风格，覆盖范围限于字符串存在性）：匿名分支不包含 `initializeCatalog`/`listResources`/`drawingMaterialRepository.list`/`drawingMaterialRepository.create` 调用；`App.tsx` 渲染门禁存在。
6. 匿名 catalog CRUD 测试：
   - `drawingMaterialRepository`：无 session 时 `list`/`create` 抛出“登录后才能访问公共物料目录。”；有 session 时正常走 gateway。
   - 组件渲染断言（`renderToStaticMarkup`，见 `drawingCatalogGates.test.tsx`）：`canUseCatalog=false` 时资源面板与向导渲染登录提示且不渲染目录选择区，`canUseCatalog=true` 时相反。
   - 覆盖边界：SSR 测试不执行 effect，因此“未登录时不发请求”由仓库会话守卫测试（同一文件）在请求层保证，不在组件层断言；`currentUser` 由登录变 `null` 时清空已加载资源属于 effect 行为，目前仅由源码契约断言覆盖（§9.5）。
7. SQL 测试更新：
   - `databaseSecuritySql.test.ts`：策略名改 `catalog authenticated read`；`catalog_items`/`suppliers` 不存在任何 `to anon` 策略；不存在向 anon 的 `grant select/insert/update/delete`；`revoke all ... from anon, authenticated` 保留；图纸桶策略仅 authenticated。
   - `finishedHarnessMaterialsSql.test.ts`：补 `finished-harness-drawings` 桶 `public=false` 断言；种子含对象路径而非公网 URL。
   - `storageBootstrap.test.ts` 保持不变。
8. 仓库测试：成品图纸外部 URL 直通、对象路径签名（mock storage）；既有 `finishedHarnessMaterialRepository.test.ts` 保持。

## 10. 验收标准

1. 未登录看不到项目列表。
2. 未登录看不到物料库内容。
3. 未登录直接输入 `/materials` 也不能看到物料（显示登录提示，且 Network 无 `catalog_items`/`material_prices` 请求）。
4. 未登录直接输入项目设计 URL 也不能打开项目，且内存中的项目/catalog 数据被清空。
5. 未登录可以进入独立制作图纸。
6. 未登录制作图纸可以使用普通手工工具、文字、图标、表格、常用语与模板。
7. 未登录不能加载、查看、选择、添加 catalog items（资源面板、新建向导、公司物料表三处）；登出后此前已加载的目录数据从组件内存中清空（§7.5）。
8. 登录后原有项目、物料库、catalog、价格与成品图纸功能正常（图纸为签名 URL）。
9. 退出登录后页面内存中的项目、项目列表与 catalog/价格/成品数据立即清空，浏览器后退或历史 URL 无法恢复。
10. 匿名 REST 直查 `catalog_items` 返回 permission denied：SELECT/INSERT/UPDATE/DELETE 全部拒绝；`suppliers` 同样拒绝；已登录用户查询正常、新增 `accessory` 正常。
11. 旧成品图纸公网 URL 失效。
12. 执行通过：

```powershell
npx eslint <本次修改文件>
npx tsc -b
npm test
```

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 成品图纸签名 URL 1 小时过期 | 物料库已有“刷新/页面可见时重拉”机制重新签名；详情弹窗文案可改为“查看图纸” |
| 登出瞬间在途请求写回数据 | epoch 守卫 + store reset，测试覆盖 |
| 登出后向导/资源面板残留已加载的目录数据 | `currentUser` 变为 `null` 时清空组件 state（§7.5） |
| AdminShell 新增 props 破坏既有测试 | props 可选、默认由 `currentUser` 推导 |
| 匿名失去项目文件导入/导出入口 | 已知产品后果，如需保留可另开单点方案 |
| `drawingCatalogRepository` 会话守卫破坏 mock 注入 | 守卫改为构造参数注入，测试可替换 |
| 图纸链接直接展示签名 URL 文本 | 详情弹窗文案微调（非阻塞） |

## 12. 实施顺序

1. SQL/Storage 收紧与图纸路径回填。
2. 数据层：三个 store 的 `reset()`+epoch、`clearCatalogSnapshot` 接线、成品图纸签名 URL、上传脚本改造。
3. 路由与壳层：`requiresAuth`、`App.tsx` 守卫、登录提示组件、`AdminShell` 菜单。
4. 制作图纸三处 catalog 门禁 + 登出时清理组件内已加载的目录状态。
5. 测试与文档更新，跑通 eslint / tsc / npm test 与手工验收。

## 13. 实施后补充修复（2026-09-22）

方案实施与验证过程中发现并修复了以下问题，均已落地：

1. **图纸云端保存从未成功**：客户端文档 id 为 `drawing-<uuid>`，而 `drawings.id` 是 `uuid` 列，upsert 一直报 `invalid input syntax for type uuid`。已将 `drawings.id` 改为 `text`（`10_schema/01_core.sql`，测试库已 ALTER），并在 `drawingCatalogRepository.loadTemplate` 中为模板生成新的文档 id，避免固定 id 冲突。
2. **空白图纸自动落库**：新建的空白图纸原先立即标记为待保存，自动写入云端并产生本地草稿。现在未编辑的空白图纸不落库、不写草稿，首次编辑或用户手动保存时才建档。
3. **历史草稿反复提示**：`使用云端版本` 现在一次清空该账号的全部图纸草稿，提示中显示草稿份数。
4. **登录后跳回首页**：新增 `shouldKeepRouteAfterLogin()`，匿名用户在 `/materials`、`/drawing-workbench`（以及带 projectId 的设计器）登录后保留原路由；制作图纸的匿名在制内容仍按既有策略不保留（产品决策，待定）。
5. **目录图片图裂**：`clearCatalogImageCache()` 无参调用原先只撤销 blob URL 不清缓存，登出再登录会命中已失效的 blob URL；现在会清理全部已知客户端的缓存条目。
6. **成品图纸详情弹窗**：不再展示完整签名 URL，改为展示文件名，链接仍指向签名地址。
7. **根 README 与实现同步**：目录/供应商仅登录可读、成品图纸私有桶 + 签名 URL。
