# 代码库级 Agent 可执行技术设计与实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（仅在用户明确授权使用子 Agent 时推荐）或 `superpowers:executing-plans` 逐任务执行本计划。所有步骤使用复选框跟踪，未勾选表示尚未实施。

**Goal:** 在保留制作图纸、同账号跨设备保存、公共资源目录、公司物料新增和现有报价行为的前提下，将应用数据库从 27 张表、325 个建表字段收敛为 3 张应用表、22 个字段。

**Architecture:** Supabase 只持久化三个真正跨设备共享的业务文档：项目、制作图纸和公共目录。项目与图纸各自通过一个仓储模块隔离远程持久化；公共目录统一为 `catalog_items`，类型专属字段进入 `spec jsonb`，由 TypeScript 在仓储接口处校验。线材颜色、交期、保护方式、报价参数、图纸模板、常用语和图标改为进程内静态模块。

**Tech Stack:** PostgreSQL/Supabase SQL、Supabase Auth/Storage/RLS、TypeScript 6、React 19、Zustand 5、Vitest 3、ESLint 10、Vite 8、PowerShell。

**Spec:** `docs/superpowers/plans/2026-08-20-codebase-database-simplification.md#技术设计`（本文件“技术设计”章节即经确认的设计规范）。

## Global Constraints

- 项目处于测试阶段；允许清空并重建测试数据，不保留旧表、旧接口、双写、兼容层或升级迁移链。
- 只保留 `projects`、`drawings`、`catalog_items` 三张 `public` 应用表；`auth.users`、`storage.buckets`、`storage.objects` 是 Supabase 平台表，不计入应用表数量。
- 保留制作图纸、同账号跨设备项目/图纸保存和公共资源目录；不实现多人协作、团队共享、实时合并、数据库版本恢复或软删除。
- 项目和图纸采用最后保存覆盖；同一账号在多设备并发编辑时不做冲突合并。
- `HarnessConfig.schemaVersion`、`DrawingDocument.schemaVersion`、图纸标题栏修订号和业务修订表必须保留；只删除数据库重复的 `schema_version`、`revision` 字段。
- `catalog_items.spec` 的 JSON key 使用 camelCase，与 TypeScript 领域类型一致；数据库列继续使用 snake_case。
- 公共目录允许匿名读取；登录用户只允许新增 `kind = 'accessory'` 的公司物料；其他目录写入只允许 SQL Editor、种子 SQL 或服务端密钥执行。
- 浏览器不得接触 `SUPABASE_SECRET_KEY`、service role key、数据库密码或执行 Storage 管理写操作。
- 不新增 ORM、迁移框架、JSON Schema 库、运行时校验依赖或后台管理页面。
- 执行远程 `00_reset`、清空 Storage 或重建远程数据库前必须再次获得用户明确授权。
- 未经明确授权不得提交、推送或发布。若用户随后要求推送，必须先检查待推送 SQL，并确认这些 SQL 已在远程阿里云 Supabase 执行成功。
- 工作区现有的 `supabase/.temp/cli-latest`、`AGENTS.md` 和无关设计文档改动属于用户，不得覆盖、暂存或提交。

---

## 文档状态

- 设计状态：已由用户确认方向。
- 实施状态：未开始。
- 数据策略：测试数据允许清空重建。
- 远程状态：本文档生成时未执行任何远程 SQL、Storage 删除、提交或推送。

## 技术设计

### 1. 当前问题与证据

当前 `supabase/sql/10_schema` 定义 27 张表和 325 个字段，复杂度主要来自当前产品未使用的能力：

| 复杂度来源 | 代码证据 | 结论 |
|---|---|---|
| `project_assets` 与 `project-assets` | 生产源码没有表读写；只有 `src/lib/storageBootstrap.ts` 仍要求桶存在 | 删除表和桶 |
| `wire_types`、`wire_gauges` | `src/lib/catalogRepository.ts` 加载后，生产调用方未读取快照字段 | 删除，不迁移到静态模块 |
| 项目版本表 | `src/components/project/ProjectList.tsx` 仅用于“从最新恢复点另存” | 删除版本表和恢复入口 |
| 图纸版本表 | `src/repositories/drawingDocumentRepository.ts` 保存时写入，生产代码没有读取 | 直接删除 |
| `public."user"` | `src/stores/userStore.ts` 直接读取 Supabase Auth；该表只给 `catalog_admin` RLS 使用 | 删除，外键直接指向 `auth.users` |
| 资源主表加七张专属表 | 三个目录仓储重复拼接关系，实际只消费少量字段 | 合并为 `catalog_items.spec` |
| 多图元数据 | 运行时只选择 `is_primary` 图片 | 每个目录项只保留 `image_path` |
| 项目状态 | 新建时固定 `draft`，只有 `HarnessLibraryPage` 显示，无状态流转 | 删除字段和状态徽标 |
| 审计/软删除/生命周期 | 前端只用 `deleted_at`、`lifecycle_status` 做过滤 | 改为硬删除；目录中存在的行即有效行 |
| 业务选项表 | 没有后台维护入口，但报价和编辑器正在读取 | 数据移到 TypeScript 常量，行为保持不变 |
| 图纸模板/常用语/图标表 | 只有读取入口；当前种子分别只有 2、3、4 条 | 数据移到 TypeScript 静态模块 |

### 2. 领域模型与模块接缝

本次设计使用四个领域概念，其中前三个需要跨设备持久化：

1. **Project（项目）**：用户拥有的线束设计及列表元数据。数据库 `projects.config` 保存完整 `HarnessConfig`。
2. **Drawing（制作图纸）**：用户拥有的独立制作图纸。数据库 `drawings.document` 保存完整 `DrawingDocument`。
3. **CatalogItem（目录项）**：所有用户共享的连接器、线材、保护套、外模、模型、辅材和包装定义。
4. **StaticReferenceData（静态参考数据）**：颜色、交期、报价规则、图纸模板、常用语和图标；随前端版本发布。

模块接缝如下：

| 模块 | 接口 | 适配器/实现 | 测试方式 |
|---|---|---|---|
| 项目持久化模块 | `ProjectRepository` | `SupabaseProjectRepository`、测试 fake client | 通过仓储公开方法断言项目 CRUD 和文档校验 |
| 图纸持久化模块 | `DrawingDocumentRepository` | Supabase client、测试 fake client | 通过 `list/save/remove` 断言可观察结果 |
| 公共目录模块 | `CatalogRepository`、`DrawingCatalogRepository`、`DrawingMaterialRepository` | 同一张 `catalog_items` 表；各模块只暴露自己的用例接口 | 通过各仓储接口测试映射，不测试内部辅助函数 |
| 静态参考数据模块 | 只读常量和返回副本的查询函数 | 进程内 TypeScript | 纯函数测试，确保数量、稳定 ID、无共享可变对象 |

不把 Supabase client、表行形状或 `spec` 原始 JSON 暴露给 React 调用方。校验和映射集中在仓储实现内部，以保持调用方接口小、变更具有局部性。

### 3. 目标数据库

#### 3.1 `projects`：7 个字段

```sql
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null default '',
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);
```

不再保留 `project_documents`。`projects.id` 同时是 `HarnessConfig.id`，删除 `Project.harnessConfigId` 这一重复身份。

#### 3.2 `drawings`：4 个字段

```sql
create table public.drawings (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now()
);

create index drawings_owner_updated_idx
  on public.drawings (owner_id, updated_at desc);
```

`DrawingDocument` 内已经包含 `name`、`createdAt`、`updatedAt` 和 `schemaVersion`，数据库不再重复保存。当前保存调用从未传入 `projectId`，因此删除图纸与项目之间未使用的关联。

#### 3.3 `catalog_items`：11 个字段

```sql
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'connector', 'wire', 'protective_sleeve', 'overmold',
    'model', 'accessory', 'packaging'
  )),
  code text not null check (code ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  name text not null check (length(btrim(name)) between 1 and 200),
  model text not null check (length(btrim(model)) between 1 and 200),
  manufacturer text not null default '',
  resource_group text not null default '',
  description text not null default '',
  image_path text,
  sort_order integer not null default 0 check (sort_order >= 0),
  spec jsonb not null default '{}'::jsonb check (jsonb_typeof(spec) = 'object'),
  unique (kind, code)
);

create index catalog_items_kind_order_idx
  on public.catalog_items (kind, resource_group, sort_order, name);
```

#### 3.4 `spec` 形状

```ts
export type CatalogItemKind =
  | 'connector'
  | 'wire'
  | 'protective_sleeve'
  | 'overmold'
  | 'model'
  | 'accessory'
  | 'packaging';

export interface CatalogItemSpecByKind {
  connector: {
      connectorType: 'male' | 'female' | 'receptacle';
      series?: string;
      pinCount: number;
      rowCount?: number;
      pitchMm?: number;
      pinLabels: string[];
      housingMaterial?: string;
      contactMaterial?: string;
      nutMaterial?: string;
    };
  wire:
    | {
        kind: 'electronic';
        awg: number;
        ulNumber: '1007';
        conductorColor: string;
      }
    | {
        kind: 'jacketed';
        awg: number;
        ulNumber?: 'UL2464' | 'UL20276';
        jacketMaterial: 'PVC' | 'PUR';
        jacketColor: 'black' | 'green';
        coreCount: number;
        shielded: boolean;
        coreColors: string[];
      };
  protective_sleeve: {
      sleeveType: string;
      material?: string;
      color?: string;
      shrinkRatio?: number;
      nominalLengthM?: number;
      suppliedInnerDiameterMm?: number;
      recoveredInnerDiameterMm?: number;
      recoveredWallThicknessMm?: number;
    };
  overmold: {
      outerMaterial: string;
      outerHardness?: string;
      innerMaterial: string;
      innerMaterialOptional?: boolean;
    };
  model: { modelKind: string };
  accessory: { specification: string; unit: string };
  packaging: { specification: string; unit: string };
}

export type CatalogItemSpec<K extends CatalogItemKind = CatalogItemKind> =
  CatalogItemSpecByKind[K];
```

上面的 kind→spec 映射是文档约束。实现中必须先按 `CatalogItemRow.kind` 分支，再校验对应 `spec`；不得通过属性猜测类型。

### 4. 静态参考数据

#### 4.1 `src/data/catalogOptions.ts`

静态化后必须保留以下基线数据：

- 14 个线材颜色：`red`、`black`、`white`、`green`、`blue`、`yellow`、`orange`、`purple`、`brown`、`gray`、`gold`、`pink`、`yellow-green`、`blank`。
- 3 个交期：`rush`、`standard`、`economy`。
- 8 个保护选项：`none`、`acetate-cloth`、`fleece`、`heat-shrink`、`braided`、`spiral`、`convoluted`、`corrugated`。
- 15 条报价规则：连接器 2 条、线径单价 5 条、线种倍率 5 条、人工 2 条、护套线芯系数 1 条。
- 6 个数量折扣阈值：1、5、10、20、50、100。

删除 `CatalogSnapshot.wireTypes` 和 `CatalogSnapshot.wireGauges`；保留其他字段名，使 `pricing.ts`、`bom.ts`、`QuotePanel`、`canvasMaterials.ts` 和颜色选择调用方无需改变领域行为。

#### 4.2 `src/lib/drawingStaticResources.ts`

静态模块保留：

- 模板：`template-single`、`template-double`；
- 常用语：3 条现有中文种子；
- 图标：`接地`、`警告`、`上锡`、`屏蔽`，保留现有 SVG path 和 24×24 默认尺寸。

每次加载模板必须返回深拷贝，防止编辑一个文档污染静态模板。

### 5. RLS 与权限

目标策略是 4 类规则，不再维护 `catalog_admin`、审计触发器或动态策略生成函数：

```sql
alter table public.projects enable row level security;
alter table public.drawings enable row level security;
alter table public.catalog_items enable row level security;

create policy "projects owner access"
  on public.projects for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "drawings owner access"
  on public.drawings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "catalog public read"
  on public.catalog_items for select to anon, authenticated
  using (true);

create policy "catalog accessory insert"
  on public.catalog_items for insert to authenticated
  with check (kind = 'accessory');
```

`catalog-assets` 保持私有桶。对象读取策略只允许读取被 `catalog_items.image_path` 引用的对象：

```sql
create policy "catalog assets referenced read"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'catalog-assets'
    and exists (
      select 1 from public.catalog_items item
      where item.image_path = storage.objects.name
    )
  );
```

目录图片上传继续由服务端密钥或 Supabase 管理界面完成；浏览器不获得 Storage 写策略。

### 6. 删除语义与并发语义

- 项目删除：`delete from projects where id = ?`；级联仅影响该项目行本身，因为项目文档已内联。
- 图纸删除：`delete from drawings where id = ? and owner_id = ?`。
- 目录删除：前端不提供；管理员通过受控 SQL/后台流程硬删除。
- 保存冲突：不读取 revision，不做 compare-and-swap；最后一个成功写入覆盖前一个写入。
- 浏览器撤销/重做、损坏文档下载副本、导入/导出设计文件继续保留；它们不依赖数据库版本表。

### 7. 数据迁移策略

本项目不编写旧结构迁移。实施产物只包含：

1. 能清理旧 27 张表、旧函数、旧枚举、旧策略和 `project-assets` 测试对象的重置 SQL；
2. 两个规范建表文件；
3. 一个规范 RLS 文件；
4. 一个统一目录种子文件；
5. 只管理 `catalog-assets` 的 Storage 初始化流程。

目录种子必须保留当前 47 个资源项：37 个连接器、3 个线材、2 个保护套、2 个外模、1 个模型、1 个辅材、1 个包装。只把当前主图路径写入 `image_path`；非主图对象不再进入数据库。

### 8. 文件结构锁定

#### 新建

- `src/data/catalogOptions.ts`：报价、颜色和保护静态数据。
- `src/lib/drawingStaticResources.ts`：模板、常用语、图标及深拷贝查询。
- `src/lib/catalogItem.ts`：`CatalogItemRow`、类型分支校验和领域映射辅助函数。
- `src/lib/__tests__/catalogOptions.test.ts`：静态业务选项回归。
- `src/lib/__tests__/drawingStaticResources.test.ts`：静态图纸资源与深拷贝回归。
- `src/lib/__tests__/catalogItem.test.ts`：统一目录行校验。
- `src/lib/__tests__/drawingDocumentRepository.test.ts`：图纸仓储 CRUD。
- `src/lib/__tests__/databaseSchemaSql.test.ts`：三表、22 字段、种子和旧对象缺席检查。
- `src/lib/__tests__/databaseSecuritySql.test.ts`：RLS、Auth 外键和 Storage 引用策略检查。
- `supabase/sql/10_schema/01_core.sql`：`projects`、`drawings`。
- `supabase/sql/40_seed/01_catalog_items.sql`：47 个统一目录项。

#### 修改

- `src/types/catalog.ts`
- `src/types/drawing.ts`
- `src/types/harness.ts`
- `src/types/user.ts`
- `src/lib/catalogRepository.ts`
- `src/lib/catalogRuntime.ts`
- `src/lib/drawingCatalogRepository.ts`
- `src/lib/drawingMaterialRepository.ts`
- `src/repositories/projectRepository.ts`
- `src/repositories/drawingDocumentRepository.ts`
- `src/stores/catalogStore.ts`
- `src/stores/projectStore.ts`
- `src/stores/drawingStore.ts`
- `src/components/project/ProjectList.tsx`
- `src/components/project/ProjectWizard.tsx`
- `src/pages/HarnessLibraryPage.tsx`
- `src/lib/storageBootstrap.ts`
- `scripts/lib/storageBootstrap.mjs`
- `scripts/lib/storageBootstrap.test.mjs`
- `scripts/create-user.mjs`
- `supabase/sql/00_reset/01_drop_all_tables.sql`
- `supabase/sql/10_schema/02_catalog.sql`
- `supabase/sql/20_storage/01_buckets.sql`
- `supabase/sql/30_security/01_rls.sql`
- `supabase/sql/README.md`
- `README.md`
- 现有相关 Vitest 文件。

#### 删除

- `supabase/sql/10_schema/01_foundation.sql`
- `supabase/sql/10_schema/03_integrity.sql`
- `supabase/sql/10_schema/04_drawing_resources.sql`
- `supabase/sql/10_schema/05_business_options.sql`
- `supabase/sql/10_schema/06_document_persistence.sql`
- `supabase/sql/40_seed/01_example_catalog.sql`
- `supabase/sql/40_seed/02_image_manifest.sql`
- `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- `supabase/sql/40_seed/04_frontend_catalog.sql`
- `supabase/sql/40_seed/05_business_options.sql`
- `supabase/sql/50_upgrade/01_drawing_workbench_resources.sql`
- `supabase/sql/50_upgrade/02_rename_profiles_to_user.sql`
- `supabase/sql/50_upgrade/03_catalog_resource_main_tables.sql`
- `supabase/sql/50_upgrade/04_frontend_business_data.sql`
- `supabase/sql/50_upgrade/05_resource_master_rename.sql`
- `supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql`
- `supabase/sql/50_upgrade/07_project_soft_delete_rls.sql`
- `src/lib/__tests__/foundationSql.test.ts`
- `src/lib/__tests__/drawingResourceSql.test.ts`
- `src/lib/__tests__/projectSoftDeleteSql.test.ts`

---

## Agent 执行规则

1. 每个任务开始前运行 `git status --short`，确认用户已有改动仍保持原样。
2. 每个任务先写或改失败测试，运行并记录预期失败，再写最小实现。
3. 只读取当前任务直接相关文件；发现隐藏耦合时暂停并更新本文档，不扩大无关重构。
4. 任务结束时运行列出的定向测试和 `git diff --check`。
5. 只有用户明确授权提交时才执行任务末尾的提交命令；否则保留未提交状态并报告建议提交消息。
6. 不在实施过程中执行远程重置、删除桶、推送或发布；这些动作在 Task 9 的授权门之后处理。

## 实施计划

### Task 1: 静态化颜色、交期、保护和报价数据

**Files:**

- Create: `src/data/catalogOptions.ts`
- Create: `src/lib/__tests__/catalogOptions.test.ts`
- Modify: `src/types/catalog.ts`
- Modify: `src/types/harness.ts`
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/lib/catalogRuntime.ts`
- Modify: `src/lib/__tests__/catalogRepository.test.ts`
- Modify: `src/lib/__tests__/catalogRuntime.test.ts`
- Modify: `src/lib/__tests__/fixtures/catalogFixture.ts`

**Interfaces:**

- Produces: `WIRE_COLORS: readonly WireColor[]`。
- Produces: `LEAD_TIME_OPTIONS: readonly LeadTimeOption[]`。
- Produces: `PROTECTION_OPTIONS: readonly ProtectionOption[]`。
- Produces: `PRICING_RULES: readonly PricingRule[]`。
- Produces: `QUANTITY_DISCOUNT_RULES: readonly QuantityDiscountRule[]`。
- Produces: `staticCatalogOptions()`，返回新的可变数组副本供 `CatalogSnapshot` 使用。
- Removes: `CatalogSnapshot.wireTypes`、`CatalogSnapshot.wireGauges`、`WireType`、`WireGauge`。

- [ ] **Step 1: 写静态数据失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  LEAD_TIME_OPTIONS,
  PRICING_RULES,
  PROTECTION_OPTIONS,
  QUANTITY_DISCOUNT_RULES,
  WIRE_COLORS,
  staticCatalogOptions,
} from '@/data/catalogOptions';

describe('static catalog options', () => {
  it('preserves the database-backed business baseline', () => {
    expect(WIRE_COLORS).toHaveLength(14);
    expect(LEAD_TIME_OPTIONS).toEqual([
      { id: 'rush', name: '加急', days: '10个工作日', multiplier: 1.3 },
      { id: 'standard', name: '标准', days: '20-30个工作日', multiplier: 1 },
      { id: 'economy', name: '经济', days: '30-50个工作日', multiplier: 0.9 },
    ]);
    expect(PROTECTION_OPTIONS).toHaveLength(8);
    expect(PRICING_RULES).toHaveLength(15);
    expect(QUANTITY_DISCOUNT_RULES.map((rule) => rule.minimumQuantity))
      .toEqual([1, 5, 10, 20, 50, 100]);
  });

  it('returns fresh arrays for each snapshot', () => {
    expect(staticCatalogOptions().wireColors).not.toBe(staticCatalogOptions().wireColors);
  });
});
```

- [ ] **Step 2: 运行测试并确认缺少静态模块**

Run: `npx vitest run src/lib/__tests__/catalogOptions.test.ts`

Expected: FAIL，模块 `@/data/catalogOptions` 尚不存在。

- [ ] **Step 3: 创建完整静态选项**

`catalogOptions.ts` 使用 `satisfies` 校验数组元素，数值逐条复制自 `supabase/sql/40_seed/04_frontend_catalog.sql` 和 `supabase/sql/40_seed/05_business_options.sql`。`staticCatalogOptions()` 必须实现为：

```ts
export function staticCatalogOptions() {
  return {
    wireColors: WIRE_COLORS.map((item) => ({ ...item })),
    leadTimeOptions: LEAD_TIME_OPTIONS.map((item) => ({ ...item })),
    protectionOptions: PROTECTION_OPTIONS.map((item) => ({
      ...item,
      materialMultipliers: { ...item.materialMultipliers },
    })),
    pricingRules: PRICING_RULES.map((item) => ({ ...item })),
    quantityDiscountRules: QUANTITY_DISCOUNT_RULES.map((item) => ({ ...item })),
  };
}
```

- [ ] **Step 4: 缩小 `CatalogSnapshot`**

将 `CatalogSnapshot` 精确改为：

```ts
export interface CatalogSnapshot {
  connectors: Connector[];
  wires: CatalogWire[];
  wireColors: WireColor[];
  overmolds: OvermoldSpec[];
  leadTimeOptions: LeadTimeOption[];
  protectionOptions: ProtectionOption[];
  pricingRules: PricingRule[];
  quantityDiscountRules: QuantityDiscountRule[];
  loadedAt: number;
}
```

删除 `catalogRepository.listWireTypes()` 和 `listWireGauges()`。`loadSnapshot()` 只远程加载连接器、线材、外模，并合并 `staticCatalogOptions()`。

- [ ] **Step 5: 更新 fixture 和运行定向回归**

Run: `npx vitest run src/lib/__tests__/catalogOptions.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/catalogRuntime.test.ts src/lib/__tests__/bom.test.ts`

Expected: PASS。

- [ ] **Step 6: 检查旧快照字段已消失**

Run: `rg -n "wireTypes|wireGauges|listWireTypes|listWireGauges" src --glob '!src/lib/__tests__/catalogOptions.test.ts'`

Expected: 无生产代码匹配。

- [ ] **Step 7: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add src/data/catalogOptions.ts src/types/catalog.ts src/types/harness.ts src/lib/catalogRepository.ts src/lib/catalogRuntime.ts src/lib/__tests__/catalogOptions.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/catalogRuntime.test.ts src/lib/__tests__/fixtures/catalogFixture.ts
git commit -m "refactor: 静态化目录业务选项"
```

### Task 2: 静态化图纸模板、常用语和图标

**Files:**

- Create: `src/lib/drawingStaticResources.ts`
- Create: `src/lib/__tests__/drawingStaticResources.test.ts`
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/drawingCatalogRepository.ts`
- Modify: `src/lib/__tests__/drawingCatalogRepository.test.ts`

**Interfaces:**

- Produces: `listStaticDrawingTemplates(): DrawingTemplateSummary[]`。
- Produces: `loadStaticDrawingTemplate(id: string): DrawingDocument | null`。
- Produces: `listStaticDrawingCommonPhrases(): DrawingCommonPhrase[]`。
- Produces: `listStaticDrawingIcons(): DrawingIconResource[]`。
- Preserves: `DrawingCatalogRepository.listTemplates/loadTemplate/listCommonPhrases/listIcons` 的 Promise 接口。

- [ ] **Step 1: 写静态图纸资源失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  listStaticDrawingCommonPhrases,
  listStaticDrawingIcons,
  listStaticDrawingTemplates,
  loadStaticDrawingTemplate,
} from '@/lib/drawingStaticResources';

describe('drawing static resources', () => {
  it('preserves all seeded resources', () => {
    expect(listStaticDrawingTemplates()).toHaveLength(2);
    expect(listStaticDrawingCommonPhrases()).toHaveLength(3);
    expect(listStaticDrawingIcons()).toHaveLength(4);
  });

  it('returns an isolated template document', () => {
    const first = loadStaticDrawingTemplate('template-single');
    const second = loadStaticDrawingTemplate('template-single');
    expect(first).not.toBe(second);
    expect(first?.titleBlock.drawingNo).toBe('TPL-SINGLE');
  });

  it('returns null for an unknown template', () => {
    expect(loadStaticDrawingTemplate('missing')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试并确认缺少模块**

Run: `npx vitest run src/lib/__tests__/drawingStaticResources.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现确定性的模板工厂**

```ts
function drawingTemplate(id: string, name: string, drawingNo: string): DrawingDocument {
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: 0,
    updatedAt: 0,
    page: { size: 'A4', orientation: 'landscape', width: 1200, height: 800 },
    objects: [],
    titleBlock: { title: name, drawingNo, revision: 'A' },
    revisionTable: [],
    techRequirements: [],
  };
}

export function loadStaticDrawingTemplate(id: string): DrawingDocument | null {
  const document = DRAWING_TEMPLATE_DOCUMENTS[id];
  return document ? structuredClone(document) : null;
}
```

把现有 2 个模板、3 条常用语、4 个图标的稳定 ID、名称、分类、文案、SVG path、宽高逐项复制到静态模块。

- [ ] **Step 4: 将仓储的四个读取方法切换到静态模块**

`DrawingCatalogRepository.listTemplates()`、`listCommonPhrases()`、`listIcons()` 返回 `Promise.resolve` 的副本。`loadTemplate(id)` 在找不到 ID 时抛出 `DrawingCatalogError('未找到图库模板。')`；删除对四张图纸资源表的查询和模板数据库 schema version 校验。

- [ ] **Step 5: 运行图纸资源回归**

Run: `npx vitest run src/lib/__tests__/drawingStaticResources.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/drawingIconLibrary.test.ts src/lib/__tests__/standaloneDrawingWizard.test.tsx`

Expected: PASS。

- [ ] **Step 6: 检查生产代码不再引用旧图纸资源表**

Run: `rg -n "drawing_templates|drawing_template_versions|drawing_common_phrases|drawing_icons" src --glob '!src/lib/__tests__/**'`

Expected: 无匹配。

- [ ] **Step 7: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add src/lib/drawingStaticResources.ts src/types/drawing.ts src/lib/drawingCatalogRepository.ts src/lib/__tests__/drawingStaticResources.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts
git commit -m "refactor: 静态化制作图纸公共资源"
```

### Task 3: 将所有公共资源切换到统一 `catalog_items`

**Files:**

- Create: `src/lib/catalogItem.ts`
- Create: `src/lib/__tests__/catalogItem.test.ts`
- Modify: `src/lib/catalogRepository.ts`
- Modify: `src/lib/drawingCatalogRepository.ts`
- Modify: `src/lib/drawingMaterialRepository.ts`
- Modify: `src/lib/__tests__/catalogRepository.test.ts`
- Modify: `src/lib/__tests__/drawingCatalogRepository.test.ts`
- Modify: `src/lib/__tests__/drawingMaterialRepository.test.ts`
- Modify: `src/lib/__tests__/autoAssociateTwoDImages.test.ts`

**Interfaces:**

- Produces: `CATALOG_ITEM_COLUMNS`，固定为 `id,kind,code,name,model,manufacturer,resource_group,description,image_path,sort_order,spec`。
- Produces: `CatalogItemRow` 和 `parseCatalogItemRow(value: unknown): CatalogItemRow`。
- Produces: `CatalogItemError`，对缺失公共字段、未知 kind 或错误 spec 给出稳定中文消息。
- Changes: `DrawingMaterialCatalogGateway` 收敛为 `list(): Promise<CatalogItemRow[]>` 和 `insert(input: CatalogItemInsert): Promise<CatalogItemRow>`。

- [ ] **Step 1: 写目录行失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { parseCatalogItemRow } from '@/lib/catalogItem';

describe('parseCatalogItemRow', () => {
  it('accepts a connector with a typed spec', () => {
    expect(parseCatalogItemRow({
      id: '1', kind: 'connector', code: 'xh254-4p-f', name: 'XH2.54-4P',
      model: 'XH2.54-4P-F', manufacturer: '', resource_group: '绘图连接器',
      description: '', image_path: null, sort_order: 10,
      spec: { connectorType: 'female', pinCount: 4, pinLabels: ['1', '2', '3', '4'] },
    })).toEqual(expect.objectContaining({ kind: 'connector', code: 'xh254-4p-f' }));
  });

  it.each([
    { kind: 'unknown', spec: {} },
    { kind: 'connector', spec: { connectorType: 'female', pinCount: 0, pinLabels: [] } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, coreColors: [] } },
  ])('rejects invalid catalog data %#', (patch) => {
    expect(() => parseCatalogItemRow({
      id: '1', code: 'bad', name: 'bad', model: 'bad', manufacturer: '',
      resource_group: '', description: '', image_path: null, sort_order: 0, ...patch,
    })).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试并确认解析器缺失**

Run: `npx vitest run src/lib/__tests__/catalogItem.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现公共字段和 kind 分支校验**

实现必须满足：

- 所有行校验 `id/kind/code/name/model/manufacturer/resource_group/description/image_path/sort_order/spec`；
- connector 要求合法 `connectorType`、正整数 `pinCount`、字符串 `pinLabels`；
- wire 复用 `parseCatalogWireSpec`，并把数据库 `spec` 转为其现有输入形状；
- protective sleeve、overmold、model、accessory、packaging 只读取第 3.4 节列出的字段；
- 返回值不共享可变的 `spec` 或数组引用。

- [ ] **Step 4: 改造 `CatalogRepository` 查询**

三个动态读取方法使用单表：

```ts
const { data, error } = await client
  .from('catalog_items')
  .select(CATALOG_ITEM_COLUMNS)
  .eq('kind', kind)
  .order('sort_order')
  .order('name');
```

`listConnectors()`、`listWires()`、`listOvermolds()` 分别映射已解析行。`image_path` 非空时从私有 `catalog-assets` 生成一小时签名 URL；签名失败不丢弃目录项。

- [ ] **Step 5: 改造 `DrawingCatalogRepository.listResources`**

只查询一次 `catalog_items`。过滤继续支持 `resourceType/query/gender/pinCount/rowCount/pitchMm/resourceGroup/series`；热缩套管仍只暴露 `spec.sleeveType === 'heat-shrink'` 的行。

- [ ] **Step 6: 将公司物料创建改为单行原子插入**

```ts
const payload = {
  kind: 'accessory',
  code: legacyKey(input.code),
  name: input.nameAndSpecification,
  model: input.code,
  manufacturer: '',
  resource_group: '绘图辅材',
  description: input.note,
  sort_order: 0,
  spec: { specification: input.nameAndSpecification, unit: input.unit },
};
```

删除 `insertDraft`、`insertSpecification`、`activate` 三阶段接口；调用 `.insert(payload).select(CATALOG_ITEM_COLUMNS).single()`，成功后映射为 `CompanyMaterial`。

- [ ] **Step 7: 更新并运行三个仓储测试**

Run: `npx vitest run src/lib/__tests__/catalogItem.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/drawingMaterialRepository.test.ts src/lib/__tests__/autoAssociateTwoDImages.test.ts`

Expected: PASS；fake client 只需要模拟 `catalog_items`、过滤、排序、插入和签名 URL。

- [ ] **Step 8: 检查旧目录表引用已从生产 TypeScript 消失**

Run: `rg -n "resource_items|resource_item_images|from\('connectors'\)|from\('wires'\)|from\('protective_sleeves'\)|from\('overmolds'\)|from\('models'\)|from\('accessories'\)|from\('packagings'\)" src --glob '!src/lib/__tests__/**'`

Expected: 无匹配。

- [ ] **Step 9: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add src/lib/catalogItem.ts src/lib/catalogRepository.ts src/lib/drawingCatalogRepository.ts src/lib/drawingMaterialRepository.ts src/lib/__tests__/catalogItem.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/drawingMaterialRepository.test.ts src/lib/__tests__/autoAssociateTwoDImages.test.ts
git commit -m "refactor: 统一公共资源目录模型"
```

### Task 4: 将项目元数据与文档合并，并删除恢复历史

**Files:**

- Modify: `src/types/user.ts`
- Modify: `src/repositories/projectRepository.ts`
- Modify: `src/stores/projectStore.ts`
- Modify: `src/components/project/ProjectList.tsx`
- Modify: `src/components/project/ProjectWizard.tsx`
- Modify: `src/pages/HarnessLibraryPage.tsx`
- Modify: `src/lib/__tests__/projectRepository.test.ts`

**Interfaces:**

- `Project` 只保留 `id/userId/name/description/createdAt/updatedAt`。
- `ProjectRepository` 只保留 `listProjects/createProject/updateProject/load/save/remove/emergencySave`。
- Removes: `list()`、`ProjectRecoveryPoint`、`listRecoveryPoints()`。
- `projects.config` 是唯一远程项目文档。

- [ ] **Step 1: 重写项目仓储测试为单表和硬删除语义**

```ts
it('creates and loads a project in one row', async () => {
  const { client, rows } = fakeClient();
  const repository = new SupabaseProjectRepository(client);
  const project = makeProject();
  const config = { ...createFallbackConfig(), id: project.id, name: project.name };

  await repository.createProject(project, config);

  expect(rows.get(project.id)).toEqual(expect.objectContaining({
    id: project.id,
    owner_id: project.userId,
    name: project.name,
    config,
  }));
  await expect(repository.load(project.id)).resolves.toEqual({ status: 'ok', config });
});

it('hard deletes a project', async () => {
  const { client, rows } = fakeClient();
  const repository = new SupabaseProjectRepository(client);
  await repository.createProject(makeProject(), { ...createFallbackConfig(), id: 'project-1' });
  await repository.remove('project-1');
  expect(rows.has('project-1')).toBe(false);
});
```

- [ ] **Step 2: 运行项目仓储测试并确认旧实现失败**

Run: `npx vitest run src/lib/__tests__/projectRepository.test.ts`

Expected: FAIL，旧实现仍写 `project_documents`、版本表和软删除字段。

- [ ] **Step 3: 收敛 `Project` 与仓储接口**

`toProject` 从 `projects` 行映射六个领域字段。`createProject` 单次插入 `{ id, owner_id, name, description, config }`。`load` 选择 `config`。`save` 校验 `HarnessConfig` 后更新：

```ts
await client.from('projects').update({
  name: document.name,
  config: document,
  updated_at: new Date().toISOString(),
}).eq('id', projectId);
```

`remove` 使用 `.delete().eq('id', projectId)`。删除版本读取、版本写入和 soft-delete 过滤。

- [ ] **Step 4: 统一项目与配置 ID**

`projectStore.createProject` 只生成一个 `projectId`，并保存 `{ ...initialConfig, id: projectId, name }`。删除 `configId` 和 `harnessConfigId`。`ProjectWizard` 使用 `project.id` 更新当前文档。

- [ ] **Step 5: 删除恢复入口和无效状态展示**

从 `ProjectList.tsx` 删除 `History` import、`handleRestoreLatest`、恢复按钮和恢复提示。从 `HarnessLibraryPage.tsx` 删除状态徽标。从所有项目构造处删除 `status` 和 `harnessConfigId`。

- [ ] **Step 6: 运行项目和导入导出回归**

Run: `npx vitest run src/lib/__tests__/projectRepository.test.ts src/lib/__tests__/designFile.test.ts`

Expected: PASS。旧软删除 SQL 测试保留到 Task 6 再删除，本任务不运行该旧规范测试。

- [ ] **Step 7: 检查旧项目版本概念已从生产代码消失**

Run: `rg -n "harnessConfigId|listRecoveryPoints|ProjectRecoveryPoint|project_documents|project_document_versions|deleted_at|status: 'draft'" src --glob '!src/lib/__tests__/**'`

Expected: 无匹配。

- [ ] **Step 8: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add src/types/user.ts src/repositories/projectRepository.ts src/stores/projectStore.ts src/components/project/ProjectList.tsx src/components/project/ProjectWizard.tsx src/pages/HarnessLibraryPage.tsx src/lib/__tests__/projectRepository.test.ts
git commit -m "refactor: 合并项目元数据与设计文档"
```

### Task 5: 将制作图纸改为四字段单表持久化

**Files:**

- Create: `src/lib/__tests__/drawingDocumentRepository.test.ts`
- Modify: `src/repositories/drawingDocumentRepository.ts`
- Modify: `src/stores/drawingStore.ts`
- Modify: `src/lib/__tests__/drawingStore.test.ts`
- Modify: `src/lib/__tests__/drawingStoreHydration.test.ts`

**Interfaces:**

- Preserves: `list(ownerId): Promise<DrawingDocument[]>`。
- Preserves: `load(documentId): Promise<DrawingDocument | null>`。
- Changes: `save(ownerId, document): Promise<void>`，删除未使用的 `projectId` 参数。
- Preserves: `remove(ownerId, documentId): Promise<void>`，实现改为硬删除。

- [ ] **Step 1: 写图纸仓储失败测试**

```ts
it('upserts one drawing row without a version read', async () => {
  const { client, rows, calls } = fakeDrawingClient();
  const repository = new DrawingDocumentRepository(client);
  const document = createBlankDrawingDocument('测试图纸');

  await repository.save('owner-1', document);

  expect(rows.get(document.id)).toEqual(expect.objectContaining({
    id: document.id,
    owner_id: 'owner-1',
    document,
  }));
  expect(calls).not.toContain('select:revision');
});

it('hard deletes only the owner drawing', async () => {
  const { client, rows } = fakeDrawingClient();
  const repository = new DrawingDocumentRepository(client);
  const document = createBlankDrawingDocument('测试图纸');
  await repository.save('owner-1', document);
  await repository.remove('owner-1', document.id);
  expect(rows.has(document.id)).toBe(false);
});
```

- [ ] **Step 2: 运行仓储测试并确认旧实现失败**

Run: `npx vitest run src/lib/__tests__/drawingDocumentRepository.test.ts`

Expected: FAIL，旧实现查询 revision、写版本表并软删除。

- [ ] **Step 3: 实现单行 upsert、读取和硬删除**

```ts
await client.from('drawings').upsert({
  id: document.id,
  owner_id: ownerId,
  document,
  updated_at: new Date().toISOString(),
});
```

`list` 查询 `document` 并按 `updated_at desc` 排序；`load` 查询 `document`；`remove` 使用 `.delete().eq('id', documentId).eq('owner_id', ownerId)`。继续使用现有 `isDrawingDocument` 校验，不删除 JSON 内业务修订表。

- [ ] **Step 4: 更新 store 调用和 hydration fake**

删除所有第三个 `projectId` 参数假设，把测试 fake 表名改为 `drawings`，保持未登录时禁止保存和 hydration 失败回退行为。

- [ ] **Step 5: 运行图纸持久化回归**

Run: `npx vitest run src/lib/__tests__/drawingDocumentRepository.test.ts src/lib/__tests__/drawingStore.test.ts src/lib/__tests__/drawingStoreHydration.test.ts src/lib/__tests__/drawingWorkbenchSession.test.ts`

Expected: PASS。

- [ ] **Step 6: 检查旧图纸持久化字段已消失**

Run: `rg -n "drawing_documents|drawing_document_versions|drawing_json|schema_version|select\('revision'\)|project_id" src/repositories src/stores/drawingStore.ts`

Expected: 无匹配。

- [ ] **Step 7: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add src/repositories/drawingDocumentRepository.ts src/stores/drawingStore.ts src/lib/__tests__/drawingDocumentRepository.test.ts src/lib/__tests__/drawingStore.test.ts src/lib/__tests__/drawingStoreHydration.test.ts
git commit -m "refactor: 简化制作图纸持久化"
```

### Task 6: 重建三表规范 SQL 和统一目录种子

**Files:**

- Create: `supabase/sql/10_schema/01_core.sql`
- Create: `supabase/sql/40_seed/01_catalog_items.sql`
- Create: `src/lib/__tests__/databaseSchemaSql.test.ts`
- Modify: `supabase/sql/10_schema/02_catalog.sql`
- Modify: `supabase/sql/00_reset/01_drop_all_tables.sql`
- Delete: `supabase/sql/10_schema/01_foundation.sql`
- Delete: `supabase/sql/10_schema/03_integrity.sql`
- Delete: `supabase/sql/10_schema/04_drawing_resources.sql`
- Delete: `supabase/sql/10_schema/05_business_options.sql`
- Delete: `supabase/sql/10_schema/06_document_persistence.sql`
- Delete: `supabase/sql/40_seed/01_example_catalog.sql`
- Delete: `supabase/sql/40_seed/02_image_manifest.sql`
- Delete: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- Delete: `supabase/sql/40_seed/04_frontend_catalog.sql`
- Delete: `supabase/sql/40_seed/05_business_options.sql`
- Delete: `src/lib/__tests__/foundationSql.test.ts`
- Delete: `src/lib/__tests__/drawingResourceSql.test.ts`
- Delete: `src/lib/__tests__/projectSoftDeleteSql.test.ts`

**Interfaces:**

- Produces exactly three `public` application tables and three supporting indexes.
- Produces 47 idempotent `catalog_items` seed rows.
- Produces: 可同时清理新三表结构与全部旧结构的 reset SQL。

- [ ] **Step 1: 写三表结构失败测试**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const core = read('supabase/sql/10_schema/01_core.sql');
const catalog = read('supabase/sql/10_schema/02_catalog.sql');
const schema = `${core}\n${catalog}`;

describe('minimal database schema', () => {
  it('defines only the three application tables', () => {
    const names = [...schema.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/gi)]
      .map((match) => match[1]);
    expect(names).toEqual(['projects', 'drawings', 'catalog_items']);
  });

  it('keeps JSON documents and removes database history fields', () => {
    expect(core).toContain('config jsonb not null');
    expect(core).toContain('document jsonb not null');
    expect(schema).not.toMatch(/\b(deleted_at|deleted_by|created_by|updated_by|schema_version|revision)\b/);
  });
});
```

- [ ] **Step 2: 运行结构测试并确认新文件缺失**

Run: `npx vitest run src/lib/__tests__/databaseSchemaSql.test.ts`

Expected: FAIL，`01_core.sql` 尚不存在。

- [ ] **Step 3: 按第 3 节精确创建 `01_core.sql` 和 `02_catalog.sql`**

`01_core.sql` 只包含 `pgcrypto`、`projects`、`drawings` 和两个 owner/update 索引。`02_catalog.sql` 只包含 `catalog_items` 和一个 kind/order 索引。不创建枚举、函数、触发器、版本表、审计字段或软删除字段。

- [ ] **Step 4: 重写 reset SQL**

按外键依赖顺序先删除新表，再列出旧 27 张表以保证旧测试库能被清空。随后删除旧函数和旧枚举。reset 中保留旧名称只用于清理，规范 schema 和生产 TypeScript 不得再引用这些名称。

- [ ] **Step 5: 合并 47 个目录种子**

逐条转换三个现有资源种子文件：

| 来源 | 数量 | 目标 |
|---|---:|---|
| `01_example_catalog.sql` | 4 | 4 个 demo `catalog_items`，保留现有主图路径 |
| `03_drawing_workbench_resources.sql` | 8 | 8 个绘图资源 `catalog_items` |
| `04_frontend_catalog.sql` | 35 | 34 个连接器和 1 个外模 |

公共列按 `resource_type→kind`、`legacy_key→code`、`resource_name→name`、`manufacturer_name→manufacturer`、`short_description→description`、`display_order→sort_order` 映射。专属表字段按第 3.4 节转换为 camelCase `spec`；`image_path` 取 `02_image_manifest.sql` 中每个资源 `is_primary = true` 的 `storage_path`，无主图时写 `null`。

以下两行固定列顺序、空值策略、主图选择和 JSON 命名；最终同一 `values` 列表必须逐条包含上述 47 行，不得省略任何目录项：

```sql
insert into public.catalog_items
  (id, kind, code, name, model, manufacturer, resource_group, description, image_path, sort_order, spec)
values
  (
    '20000000-0000-4000-8000-000000007001',
    'connector',
    'demo-m12-4pin',
    'M12 4-pin connector',
    'DEMO-M12-4P',
    null,
    'Circular connectors',
    'Example connector',
    'catalog/connector/20000000-0000-4000-8000-000000007001/connector_before_left/connector-before-left.png',
    10,
    '{"connectorType":"male","series":"M12 A-coded","pinCount":4,"rowCount":1,"pitchMm":1.0,"pinLabels":["1","2","3","4"],"housingMaterial":"PA66+GF","contactMaterial":"Brass nickel plated"}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000007002',
    'wire',
    'demo-ul2464-4c-24awg',
    'UL2464 4-core 24 AWG cable',
    'DEMO-UL2464-4C-24',
    null,
    'Jacketed wires',
    'Example jacketed wire',
    'catalog/wire/20000000-0000-4000-8000-000000007002/product/wire-product.png',
    10,
    '{"kind":"jacketed","awg":24,"ulNumber":"UL2464","jacketMaterial":"PVC","jacketColor":"black","coreCount":4,"shielded":false,"coreColors":["red","black","white","green"]}'::jsonb
  )
on conflict (kind, code) do update set
  name = excluded.name,
  model = excluded.model,
  manufacturer = excluded.manufacturer,
  resource_group = excluded.resource_group,
  description = excluded.description,
  image_path = excluded.image_path,
  sort_order = excluded.sort_order,
  spec = excluded.spec;
```

上面只展开两行作为不可变映射样例；实现 Agent 必须继续从四个现有 seed 文件机械转换其余 45 行，使最终种子总数为 47。转换完成后测试必须断言总数和 kind 分布；种子中不得再出现其他 `insert into public.*` 目标表。

- [ ] **Step 6: 扩展 SQL 测试覆盖字段数、种子和旧对象缺席**

测试读取两个 schema 文件，按顶层列定义断言 `projects=7`、`drawings=4`、`catalog_items=11`。读取种子并断言代表项 `demo-m12-4pin`、`xh254-4p-f`、`jst-xh-2`、`pvc-45p-pe`、`coil-bag` 以及 `on conflict (kind, code)` 存在，并加入以下精确分布断言：

```ts
const seed = read('supabase/sql/40_seed/01_catalog_items.sql');
const kinds = [...seed.matchAll(
  /\(\s*'[0-9a-f-]{36}'\s*,\s*'(connector|wire|protective_sleeve|overmold|model|accessory|packaging)'\s*,/gi,
)].map((match) => match[1]);

expect(kinds).toHaveLength(47);
expect(
  kinds.reduce<Record<string, number>>((counts, kind) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {}),
).toEqual({
  connector: 37,
  wire: 3,
  protective_sleeve: 2,
  overmold: 2,
  model: 1,
  accessory: 1,
  packaging: 1,
});

expect(
  [...seed.matchAll(/insert into public\.([a-z_]+)/gi)].map((match) => match[1]),
).toEqual(['catalog_items']);
```

- [ ] **Step 7: 运行 SQL 静态测试**

Run: `npx vitest run src/lib/__tests__/databaseSchemaSql.test.ts`

Expected: PASS。

- [ ] **Step 8: 检查 schema 与 seed 文件集合**

Run: `rg --files supabase/sql/10_schema supabase/sql/40_seed | Sort-Object`

Expected: 只列出 `10_schema/01_core.sql`、`10_schema/02_catalog.sql`、`40_seed/01_catalog_items.sql`。

- [ ] **Step 9: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add -A -- supabase/sql/00_reset/01_drop_all_tables.sql supabase/sql/10_schema supabase/sql/40_seed src/lib/__tests__/databaseSchemaSql.test.ts src/lib/__tests__/foundationSql.test.ts src/lib/__tests__/drawingResourceSql.test.ts src/lib/__tests__/projectSoftDeleteSql.test.ts
git commit -m "feat: 重建三表数据库结构与目录种子"
```

### Task 7: 简化 RLS、Auth 用户和 Storage

**Files:**

- Create: `src/lib/__tests__/databaseSecuritySql.test.ts`
- Modify: `supabase/sql/30_security/01_rls.sql`
- Modify: `supabase/sql/20_storage/01_buckets.sql`
- Modify: `supabase/sql/00_reset/01_drop_all_tables.sql`
- Modify: `src/lib/storageBootstrap.ts`
- Modify: `src/lib/__tests__/storageBootstrap.test.ts`
- Modify: `src/lib/__tests__/storageSetupBanner.test.tsx`
- Modify: `scripts/lib/storageBootstrap.mjs`
- Modify: `scripts/lib/storageBootstrap.test.mjs`
- Modify: `scripts/create-user.mjs`

**Interfaces:**

- `get_storage_bootstrap_status()` 只返回 `catalog-assets` 状态。
- `REQUIRED_STORAGE_BUCKETS` 在浏览器和 Node 侧都只包含 `catalog-assets`。
- `create-user.mjs` 只调用 Supabase Auth Admin，不检查 `public."user"`。
- RLS 精确实现第 5 节四类数据策略和一个 Storage 读取策略。

- [ ] **Step 1: 写最小权限失败测试**

```ts
it('uses auth.users directly and exposes only minimal policies', () => {
  expect(coreSql).toContain('references auth.users(id) on delete cascade');
  expect(rlsSql).toContain('create policy "projects owner access"');
  expect(rlsSql).toContain('create policy "drawings owner access"');
  expect(rlsSql).toContain('create policy "catalog public read"');
  expect(rlsSql).toContain('create policy "catalog accessory insert"');
  expect(rlsSql).not.toContain('is_catalog_admin');
  expect(rlsSql).not.toContain('public."user"');
});

it('authorizes catalog images by catalog_items.image_path', () => {
  expect(rlsSql).toContain('item.image_path = storage.objects.name');
  expect(rlsSql).not.toContain('resource_item_images');
  expect(rlsSql).not.toContain('project-assets');
});
```

- [ ] **Step 2: 运行安全测试并确认旧策略失败**

Run: `npx vitest run src/lib/__tests__/databaseSecuritySql.test.ts src/lib/__tests__/storageBootstrap.test.ts scripts/lib/storageBootstrap.test.mjs`

Expected: FAIL，旧 SQL 仍包含目录管理员、27 表策略和两个桶。

- [ ] **Step 3: 重写表授权和 RLS**

先撤销 anon/authenticated 对三张表的默认权限，再精确授予：项目和图纸的 authenticated CRUD；目录的 anon/authenticated SELECT；目录的 authenticated INSERT。创建第 5 节策略，删除动态临时函数、批量策略循环和所有旧策略。

- [ ] **Step 4: 收敛 Storage SQL 和状态解析**

`01_buckets.sql` 只确保私有 `catalog-assets` 存在。RPC 的 required CTE 只含一行：

```sql
with required_buckets(bucket_id) as (
  values ('catalog-assets'::text)
)
```

`src/lib/storageBootstrap.ts` 的 `REQUIRED_STORAGE_BUCKETS` 改为 `['catalog-assets'] as const`；Node 脚本规格数组只保留 `{ id: 'catalog-assets', public: false }`。更新测试期望。

- [ ] **Step 5: 在 reset 中删除测试用 `project-assets`**

在明确的 Storage 清理段加入：

```sql
delete from storage.objects where bucket_id = 'project-assets';
delete from storage.buckets where id = 'project-assets';
```

该段只会在用户明确授权执行开发重置时运行。规范建表和应用启动不会自动删除远程对象。

- [ ] **Step 6: 简化用户创建脚本**

删除 `.from('user')` 的执行前检查和创建后确认。保留环境读取、参数校验、`auth.admin.createUser`、安全错误输出和非零退出码。

- [ ] **Step 7: 运行权限和 Storage 回归**

Run: `npx vitest run src/lib/__tests__/databaseSecuritySql.test.ts src/lib/__tests__/storageBootstrap.test.ts src/lib/__tests__/storageSetupBanner.test.tsx scripts/lib/storageBootstrap.test.mjs`

Expected: PASS。

- [ ] **Step 8: 检查权限遗留名称**

Run: `rg -n "catalog_admin|is_catalog_admin|public\.\"user\"|project-assets|resource_item_images" supabase/sql/20_storage supabase/sql/30_security src/lib/storageBootstrap.ts scripts/lib/storageBootstrap.mjs scripts/create-user.mjs`

Expected: 无匹配；`project-assets` 只允许出现在 reset 的显式清理段和说明文档中。

- [ ] **Step 9: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add supabase/sql/00_reset/01_drop_all_tables.sql supabase/sql/20_storage/01_buckets.sql supabase/sql/30_security/01_rls.sql src/lib/storageBootstrap.ts src/lib/__tests__/storageBootstrap.test.ts src/lib/__tests__/storageSetupBanner.test.tsx src/lib/__tests__/databaseSecuritySql.test.ts scripts/lib/storageBootstrap.mjs scripts/lib/storageBootstrap.test.mjs scripts/create-user.mjs
git commit -m "refactor: 简化数据库权限与存储初始化"
```

### Task 8: 删除升级链并更新运行文档

**Files:**

- Delete: `supabase/sql/50_upgrade/01_drawing_workbench_resources.sql`
- Delete: `supabase/sql/50_upgrade/02_rename_profiles_to_user.sql`
- Delete: `supabase/sql/50_upgrade/03_catalog_resource_main_tables.sql`
- Delete: `supabase/sql/50_upgrade/04_frontend_business_data.sql`
- Delete: `supabase/sql/50_upgrade/05_resource_master_rename.sql`
- Delete: `supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql`
- Delete: `supabase/sql/50_upgrade/07_project_soft_delete_rls.sql`
- Modify: `supabase/sql/README.md`
- Modify: `README.md`
- Modify: `docs/supabase-backend-database-integration.md`

**Interfaces:**

- Documents one clean reset/install path.
- Documents one Storage bucket and one seed file.
- Removes every recommendation to run `50_upgrade` files.

- [ ] **Step 1: 删除七个升级 SQL**

Run: `rg --files supabase/sql/50_upgrade`

Expected before deletion: 七个文件；删除后该命令无输出。空目录不需要保留。

- [ ] **Step 2: 重写 SQL 执行顺序**

`supabase/sql/README.md` 只记录：

1. 经授权的开发重置：`00_reset/01_drop_all_tables.sql`；
2. `10_schema/01_core.sql`；
3. `10_schema/02_catalog.sql`；
4. `20_storage/01_buckets.sql`；
5. `30_security/01_rls.sql`；
6. `40_seed/01_catalog_items.sql`；
7. 管理员环境运行 `npm run supabase:bootstrap-storage`。

明确说明业务选项和图纸静态资源随前端发布，数据库删除为硬删除，项目/图纸最后保存覆盖。

- [ ] **Step 3: 更新根文档和后端集成说明**

将表清单、桶清单、字段名、RLS 和初始化命令对齐新模型。删除版本恢复、软删除、目录管理员和迁移链说明。保留服务端密钥安全警告。

- [ ] **Step 4: 执行遗留名称扫描**

Run:

```powershell
rg -n "project_documents|project_document_versions|drawing_documents|drawing_document_versions|resource_items|resource_item_images|wire_types|wire_gauges|lead_time_options|protection_options|pricing_rules|quantity_discount_rules|drawing_templates|drawing_template_versions|drawing_common_phrases|drawing_icons|50_upgrade" README.md docs/supabase-backend-database-integration.md supabase/sql/README.md supabase/sql/10_schema supabase/sql/20_storage supabase/sql/30_security supabase/sql/40_seed
```

Expected: 无匹配。该命令只扫描当前运行文档和规范 SQL；历史设计/计划文档不在本验收范围内。

- [ ] **Step 5: 验证差异并设置提交检查点**

Run: `git diff --check`

若用户已授权提交：

```powershell
git add README.md docs/supabase-backend-database-integration.md supabase/sql/README.md
git add -u -- supabase/sql/50_upgrade
git commit -m "docs: 更新最小数据库部署流程"
```

### Task 9: 全量验证、页面走查与远程执行授权门

**Files:**

- Verify only: all files changed by Tasks 1–8.
- Do not modify unrelated files to silence pre-existing warnings.

**Interfaces:**

- Produces a verification report with commands, exit codes, test counts, manual scenarios and remaining risks.
- Produces a remote SQL execution checklist but does not execute it without explicit authorization.

- [ ] **Step 1: 运行定向数据库与仓储测试**

Run:

```powershell
npx vitest run src/lib/__tests__/catalogOptions.test.ts src/lib/__tests__/drawingStaticResources.test.ts src/lib/__tests__/catalogItem.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/drawingMaterialRepository.test.ts src/lib/__tests__/projectRepository.test.ts src/lib/__tests__/drawingDocumentRepository.test.ts src/lib/__tests__/databaseSchemaSql.test.ts src/lib/__tests__/databaseSecuritySql.test.ts src/lib/__tests__/storageBootstrap.test.ts scripts/lib/storageBootstrap.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行项目级检查**

Run: `npm test`

Expected: PASS。

Run: `npm run lint`

Expected: PASS；若存在与本任务无关的既有错误，记录精确文件、规则和行号，不修改无关代码。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 3: 执行结构和遗留引用检查**

Run:

```powershell
rg -n "\.from\('(project_documents|project_document_versions|drawing_documents|drawing_document_versions|resource_items|resource_item_images|wire_types|wire_gauges|lead_time_options|protection_options|pricing_rules|quantity_discount_rules|drawing_templates|drawing_template_versions|drawing_common_phrases|drawing_icons)'\)" src
```

Expected: 无匹配。

Run: `git diff --check`

Expected: 无空白错误。

- [ ] **Step 4: 本地页面走查**

使用 `localhost` 启动 Vite，依次验证：

1. 登录后项目列表只显示当前用户项目；
2. 新建项目后自动保存，刷新页面可恢复；
3. 重命名、导出、导入、硬删除项目正常，项目列表没有恢复按钮和状态徽标；
4. 连接器库、线材弹窗、外模选择、报价面板数据完整；
5. 制作图纸能新建、保存、刷新恢复、删除；
6. 图纸向导可读取 2 个模板、3 条常用语、4 个图标；
7. 公司物料可新增并被其他登录账号读取；
8. `catalog-assets` 主图可显示，缺图只显示资源级错误；
9. Storage 状态提示只检查 `catalog-assets`。

- [ ] **Step 5: 本地或临时数据库 RLS 验证**

使用两个测试账号验证：用户 A 无法 select/update/delete 用户 B 的 `projects` 和 `drawings`；anon 能 select `catalog_items` 但不能 insert；authenticated 能 insert `kind='accessory'`，不能 insert `kind='connector'`，也不能 update/delete 目录项。

- [ ] **Step 6: 输出远程重建影响并请求授权**

在执行远程 SQL 前向用户明确报告：远程 `public` 旧表、项目、制作图纸、目录数据、版本历史和 `project-assets` 对象将被清空；这是不可恢复的测试数据重建。等待用户明确确认目标 Supabase 项目和执行窗口。

- [ ] **Step 7: 获授权后按固定顺序执行远程 SQL**

只在获得授权后执行第 8 节记录的七步顺序。每一步记录执行时间和结果；任一步失败立即停止，不继续 seed 或推送。执行后重新运行 RLS 验证和页面走查。

- [ ] **Step 8: 提交/推送授权门**

提交前运行：

```powershell
git status --short
git diff --cached --name-only
git diff --cached
```

只精确暂存本任务文件。若用户明确要求提交但未指定消息，建议：

```text
feat: 简化数据库为项目图纸目录三表模型
```

推送前再次确认本次暂存 SQL 已在远程阿里云 Supabase 执行成功；不能确认时停止推送并报告。

---

## 验收标准

- [ ] `supabase/sql/10_schema` 只包含两个文件，并且只创建 `projects`、`drawings`、`catalog_items`。
- [ ] 三张表合计 22 个字段：7 + 4 + 11。
- [ ] 规范 schema、RLS、seed 和生产 TypeScript 不再依赖旧表、软删除、审计、版本或生命周期字段。
- [ ] `CatalogSnapshot` 不再包含 `wireTypes`、`wireGauges`，报价和编辑器行为与当前基线一致。
- [ ] 47 个目录项可从 `catalog_items` 加载，主图从 `image_path` 签名访问。
- [ ] 2 个图纸模板、3 条常用语、4 个图标来自静态模块且不会被调用方修改。
- [ ] 项目和制作图纸支持同账号跨设备 CRUD；删除为硬删除；项目没有恢复入口。
- [ ] 公司物料通过单次 `catalog_items` insert 创建。
- [ ] `public."user"`、`catalog_admin` 和 `project-assets` 不再是运行依赖。
- [ ] RLS 隔离两个账号的项目和图纸；公共目录只读，登录用户仅能新增 accessory。
- [ ] `npm test`、`npm run build` 通过；lint 结果有实际命令和精确报告。
- [ ] 未触碰、暂存或提交用户原有无关改动。

## 剩余风险

1. 最后保存覆盖可能使同账号多设备并发编辑丢失较早一次保存；这是已接受的非协作语义。
2. `catalog_items.spec` 的详细约束从 PostgreSQL 转移到 TypeScript；所有目录读取必须经过 `parseCatalogItemRow`，不得在页面直接消费原始行。
3. 静态业务参数修改需要重新构建并发布前端，不能通过 Supabase 在线修改。
4. 移除多图表后数据库只认识主图；当前未消费的多角度 Storage 对象不会自动展示。
5. 远程 reset 会永久删除测试数据和 `project-assets` 对象，必须经过 Task 9 的明确授权门。

## 执行交接

计划完成后有两种实施方式：

1. **Subagent-Driven**：仅在用户明确要求使用子 Agent 时，按任务分派独立实现并逐任务评审。
2. **Inline Execution**：在当前任务中使用 `superpowers:executing-plans` 按 Task 1–9 顺序执行，并在每个提交检查点汇报。

无论采用哪种方式，远程重建、提交和推送都保留独立授权门，不因选择执行方式而自动获得授权。
