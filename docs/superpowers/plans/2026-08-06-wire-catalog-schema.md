# 线材库字段对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将测试阶段的 `public.wires` 重塑为与线材填写弹窗一致的可复用线材库规格，并让目录读取和弹窗选择真正使用这些字段。

**Architecture:** `public.resource_items` 保存资源身份，`public.wires` 保存电子线/护套线的默认规格；项目长度、OD、左右端加工和接线关系继续由 `CanvasWireMaterial` 保存在项目文档 JSONB。新增一个纯 TypeScript 规格适配模块承载数据库行校验、目录规格类型和“应用目录规格但保留项目字段”的逻辑，Supabase 仓库与弹窗都通过该模块交互。

**Tech Stack:** PostgreSQL/Supabase SQL、TypeScript 6、React 19、Vitest 3、Vite。

## Global Constraints

- 只维护测试阶段的标准建库与种子 SQL，不新增旧字段迁移、双写或线上兼容分支。
- `public.wires` 只保存可复用规格；`lengthMm`、`odMm`、`endTreatment`、画布位置/宽度、`circuits` 和图片 URL 不进入线材表。
- 数据库中的 `wire_kind` 只能是 `electronic` 或 `jacketed`。
- 护套线芯数必须使用弹窗允许集合 `1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50`。
- 未经用户另行授权不执行 `git commit`、`git push`、远程 SQL 或生产数据操作。

---

## 文件与职责

- Modify: `supabase/sql/10_schema/02_catalog.sql`，定义精简后的 `public.wires` 字段、检查约束和审计字段。
- Modify: `supabase/sql/10_schema/03_integrity.sql`，更新线材查询索引，去除对已删除字段的索引依赖。
- Modify: `supabase/sql/40_seed/01_example_catalog.sql`，把示例线材改写为新字段。
- Modify: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`，提供电子线和 UL20276/屏蔽护套线的新种子；UL2464 示例由 `01_example_catalog.sql` 提供。
- Modify: `src/types/catalog.ts`，增加带判别联合的目录线材规格类型。
- Create: `src/lib/wireCatalog.ts`，提供数据库规格行解析和应用目录规格的纯函数。
- Modify: `src/lib/catalogRepository.ts`，联表读取 `wires` 规格并委托纯函数映射。
- Modify: `src/lib/drawingCatalogRepository.ts`，将绘图资源摘要查询从 `cable_type` 改为 `wire_kind`。
- Modify: `src/components/canvas/WireMaterialDialog.tsx`，选择目录线材时应用规格，保留当前实例长度和端部加工。
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`，更新 SQL 字段契约断言。
- Create: `src/lib/__tests__/wireCatalog.test.ts`，覆盖规格解析和项目字段保留逻辑。
- Create: `src/lib/__tests__/catalogRepository.test.ts`，覆盖 Supabase 目录行映射和稳定错误。
- Create: `src/lib/__tests__/wireMaterialDialog.test.ts`，锁定弹窗对目录规格适配函数的接线。

## Task 1: 先锁定 SQL 契约

**Files:**
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`
- Modify: `supabase/sql/10_schema/02_catalog.sql`
- Modify: `supabase/sql/10_schema/03_integrity.sql`

**Interfaces:**
- Produces the SQL contract consumed by seed scripts, Supabase repositories, and later tests.

- [ ] **Step 1: Replace stale static assertions with failing new assertions**

在现有 `drawing workbench SQL resources` 测试中，将旧断言替换为以下契约：

```ts
expect(catalog).toContain('wire_kind text not null');
expect(catalog).toContain('awg numeric(8, 2) not null');
expect(catalog).toContain('ul_number text');
expect(catalog).toContain('core_colors jsonb not null');
expect(catalog).toContain("wire_kind in ('electronic', 'jacketed')");
expect(catalog).not.toContain('spool_length_m numeric');
expect(catalog).not.toContain('wire_type_id uuid references public.wire_types(id)');
expect(catalog).not.toContain('wire_gauge_id uuid references public.wire_gauges(id)');
expect(catalog).not.toContain('conductor_color_id uuid references public.wire_colors(id)');
expect(catalog).not.toContain('jacket_color_id uuid references public.wire_colors(id)');
expect(catalog).not.toContain('cable_type text');
expect(catalog).not.toContain('core_specs jsonb');
expect(integrity).toContain('wires_lookup_idx on public.wires (wire_kind, awg, core_count)');
```

- [ ] **Step 2: Run the focused SQL test and verify it fails**

Run: `npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts`

Expected: FAIL because the canonical schema still exposes the old wire fields and lacks `wire_kind`/`core_colors`.

- [ ] **Step 3: Replace the `public.wires` definition**

在 `supabase/sql/10_schema/02_catalog.sql` 中将线材表替换为以下结构，保留现有 `resource_item_id` 外键和审计字段：

```sql
create table if not exists public.wires (
  resource_item_id uuid primary key references public.resource_items(id) on delete cascade,
  wire_kind text not null check (wire_kind in ('electronic', 'jacketed')),
  awg numeric(8, 2) not null check (awg > 0),
  ul_number text,
  conductor_color text,
  jacket_material text,
  jacket_color text,
  core_count integer,
  is_shielded boolean not null default false,
  core_colors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public."user"(id) on delete set null,
  updated_by uuid references public."user"(id) on delete set null,
  check (jsonb_typeof(core_colors) = 'array'),
  check (
    (
      wire_kind = 'electronic'
      and ul_number = '1007'
      and nullif(btrim(conductor_color), '') is not null
      and jacket_material is null
      and jacket_color is null
      and core_count is null
      and is_shielded = false
      and jsonb_array_length(core_colors) = 0
    )
    or
    (
      wire_kind = 'jacketed'
      and jacket_material in ('PVC', 'PUR')
      and jacket_color in ('black', 'green')
      and core_count in (1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50)
      and (ul_number is null or ul_number in ('UL2464', 'UL20276'))
      and jsonb_array_length(core_colors) = core_count
      and conductor_color is null
    )
  )
);
```

保留同文件中其他资源表，不改动旧升级脚本；本任务的标准测试库通过 reset + canonical schema + seed 重建。

- [ ] **Step 4: Update the wire lookup index**

在 `supabase/sql/10_schema/03_integrity.sql` 删除旧的 `wire_type_id/wire_gauge_id` 索引定义，改为：

```sql
create index if not exists wires_lookup_idx on public.wires (wire_kind, awg, core_count);
```

- [ ] **Step 5: Run the focused SQL test and verify it passes**

Run: `npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts`

Expected: PASS。

## Task 2: 建立规格类型和纯适配模块

**Files:**
- Modify: `src/types/catalog.ts`
- Create: `src/lib/wireCatalog.ts`
- Create: `src/lib/__tests__/wireCatalog.test.ts`

**Interfaces:**
- Consumes: `CanvasWireSpec`, `ElectronicWireSpec`, `JacketedWireSpec`, `WireEndTreatment` from `src/types/harness.ts`.
- Produces: `CatalogWireSpec`, `parseCatalogWireSpec(row)`, `applyCatalogWireSpec(current, catalog)`.

- [ ] **Step 1: Write failing parser and preservation tests**

在 `src/lib/__tests__/wireCatalog.test.ts` 写入：

```ts
import { describe, expect, it } from 'vitest';
import { applyCatalogWireSpec, parseCatalogWireSpec, WireCatalogError } from '@/lib/wireCatalog';

const endTreatment = {
  start: { stripped: true, stripLengthMm: 4, termination: 'tinned' as const },
  end: { stripped: false, termination: 'none' as const },
};

it('parses an electronic catalog row', () => {
  expect(parseCatalogWireSpec({
    wire_kind: 'electronic', awg: 24, ul_number: '1007', conductor_color: 'red',
    jacket_material: null, jacket_color: null, core_count: null,
    is_shielded: false, core_colors: [],
  })).toEqual({ kind: 'electronic', awg: 24, ulNumber: '1007', color: 'red' });
});

it('parses a jacketed catalog row and preserves ordered core colors', () => {
  expect(parseCatalogWireSpec({
    wire_kind: 'jacketed', awg: 26, ul_number: 'UL20276', conductor_color: null,
    jacket_material: 'PVC', jacket_color: 'black', core_count: 2,
    is_shielded: true, core_colors: ['red', 'black'],
  })).toEqual({
    kind: 'jacketed', awg: 26, ulNumber: 'UL20276', jacketMaterial: 'PVC',
    jacketColor: 'black', coreCount: 2, shielded: true, coreColors: ['red', 'black'],
  });
});

it('keeps project length and end treatment while applying catalog defaults', () => {
  const current = {
    kind: 'electronic' as const, color: 'blue', awg: 22, ulNumber: '1007' as const,
    lengthMm: 720, endTreatment,
  };
  expect(applyCatalogWireSpec(current, {
    kind: 'jacketed', jacketMaterial: 'PUR', jacketColor: 'green', awg: 24,
    coreCount: 4, shielded: false, coreColors: ['red', 'black', 'white', 'green'],
    ulNumber: 'UL2464',
  })).toMatchObject({
    kind: 'jacketed', awg: 24, lengthMm: 720, endTreatment,
    jacketMaterial: 'PUR', coreCount: 4, odMm: expect.any(Number),
  });
});

it('rejects a mismatched core color array and unknown kind', () => {
  expect(() => parseCatalogWireSpec({
    wire_kind: 'jacketed', awg: 24, ul_number: null, conductor_color: null,
    jacket_material: 'PVC', jacket_color: 'black', core_count: 2,
    is_shielded: false, core_colors: ['red'],
  })).toThrow(WireCatalogError);
  expect(() => parseCatalogWireSpec({ wire_kind: 'other' })).toThrow(WireCatalogError);
});
```

- [ ] **Step 2: Run the new unit test and verify it fails**

Run: `npm test -- --run src/lib/__tests__/wireCatalog.test.ts`

Expected: FAIL because `src/lib/wireCatalog.ts` and the new catalog types do not exist.

- [ ] **Step 3: Define the discriminated catalog types**

在 `src/types/catalog.ts` 引入 `ElectronicWireSpec` 和 `JacketedWireSpec`，新增：

```ts
export type CatalogWireSpec =
  | Pick<ElectronicWireSpec, 'kind' | 'color' | 'awg' | 'ulNumber'>
  | Pick<JacketedWireSpec, 'kind' | 'jacketMaterial' | 'jacketColor' | 'awg' | 'coreCount' | 'shielded' | 'coreColors' | 'ulNumber'>;

export interface CatalogWire {
  id: string;
  resourceItemId: string;
  name: string;
  image?: string;
  spec: CatalogWireSpec;
}
```

- [ ] **Step 4: Implement pure parsing and application**

在 `src/lib/wireCatalog.ts` 中：

1. 定义 `CatalogWireRow = Record<string, unknown>`。
2. `parseCatalogWireSpec(row: CatalogWireRow): CatalogWireSpec` 只接受 `electronic`/`jacketed`，将数据库数值转换为有限正数，并校验 UL、材质、颜色、芯数和 `core_colors.length`。
3. 电子线返回 `{ kind, color, awg, ulNumber: '1007' }`。
4. 护套线返回 `{ kind, jacketMaterial, jacketColor, awg, coreCount, shielded, coreColors, ulNumber }`，没有 UL 时省略 `ulNumber`。
5. `applyCatalogWireSpec(current: CanvasWireSpec, catalog: CatalogWireSpec): CanvasWireSpec` 保留 `current.lengthMm` 和 `current.endTreatment`；护套线重新调用 `calculateCableOd`，电子线不带 `odMm`。
6. 错误统一使用 `WireCatalogError`，消息至少区分未知类型、缺失必填字段和芯线颜色数量不匹配。

- [ ] **Step 5: Run the unit test and verify it passes**

Run: `npm test -- --run src/lib/__tests__/wireCatalog.test.ts`

Expected: PASS。

## Task 3: 让目录仓库读取真实线材规格

**Files:**
- Modify: `src/lib/catalogRepository.ts`
- Create: `src/lib/__tests__/catalogRepository.test.ts`

**Interfaces:**
- Consumes: `parseCatalogWireSpec(row)` and `CatalogWireSpec` from Task 2.
- Produces: `CatalogRepository.listWires(): Promise<CatalogWire[]>` with populated `spec`.

- [ ] **Step 1: Write failing repository mapping tests**

新增假 Supabase 客户端测试。先定义能支持 `.select().eq().is().order()` 和 `await` 的链式假客户端：

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { CatalogRepository, CatalogRepositoryError } from '@/lib/catalogRepository';

function fakeClient(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from(table: string) {
      const result = Promise.resolve({ data: tables[table] ?? [], error: null });
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        then: result.then.bind(result),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
```

然后断言 `listWires()` 将 `resource_items.wires` 的一对一关系映射成目录规格，并在规格缺失时抛出 `CatalogRepositoryError`：

```ts
it('loads wire catalog specs with name and image', async () => {
  const repository = new CatalogRepository(fakeClient({
    resource_items: [{
      id: 'wire-1', legacy_key: 'ul1007-red-24', resource_name: 'UL1007 24AWG 红线',
      wires: { wire_kind: 'electronic', awg: 24, ul_number: '1007', conductor_color: 'red',
        jacket_material: null, jacket_color: null, core_count: null, is_shielded: false, core_colors: [] },
      resource_item_images: [], lifecycle_status: 'active', deleted_at: null,
    }],
  }));
  await expect(repository.listWires()).resolves.toEqual([expect.objectContaining({
    resourceItemId: 'wire-1', name: 'UL1007 24AWG 红线',
    spec: { kind: 'electronic', awg: 24, ulNumber: '1007', color: 'red' },
  })]);
});

it('rejects an active wire resource without a valid wire spec', async () => {
  const repository = new CatalogRepository(fakeClient({
    resource_items: [{ id: 'wire-2', resource_name: 'invalid', wires: null, resource_item_images: [] }],
  }));
  await expect(repository.listWires()).rejects.toThrow(CatalogRepositoryError);
});
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `npm test -- --run src/lib/__tests__/catalogRepository.test.ts`

Expected: FAIL because the query does not select `wires(...)` and `CatalogWire` has no `spec`.

- [ ] **Step 3: Extend the `listWires()` select and mapping**

将查询改为：

```ts
const { data, error } = await client.from('resource_items')
  .select('id,legacy_key,resource_name,wires(wire_kind,awg,ul_number,conductor_color,jacket_material,jacket_color,core_count,is_shielded,core_colors),resource_item_images(storage_path,is_primary,display_order)')
  .eq('resource_type', 'wire').eq('lifecycle_status', 'active').is('deleted_at', null)
  .order('display_order').order('updated_at', { ascending: false });
```

使用现有 `firstRelation()` 取得 `wires` 行，调用 `parseCatalogWireSpec(specs)`，并把结果放到 `CatalogWire.spec`；名称、资源 ID 和签名图片逻辑保持不变。捕获 `WireCatalogError` 后抛出 `CatalogRepositoryError`，消息包含当前 `resource_name`，使仓库调用方不依赖纯适配模块的内部错误文本。

- [ ] **Step 4: Run the repository test and the existing catalog tests**

Run: `npm test -- --run src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/drawingResourceSql.test.ts`

Expected: PASS。

## Task 4: 将目录规格接入线材填写弹窗

**Files:**
- Modify: `src/components/canvas/WireMaterialDialog.tsx`
- Create: `src/lib/__tests__/wireMaterialDialog.test.ts`

**Interfaces:**
- Consumes: `CatalogWire.spec` and `applyCatalogWireSpec(current, catalog)`.
- Produces: A dialog selection that changes reusable wire fields while preserving instance-only length and end treatment.

- [ ] **Step 1: Add a failing dialog wiring test**

在 `wireMaterialDialog.test.ts` 增加源文件契约测试；纯函数行为已经由 Task 2 覆盖，这里只验证弹窗确实调用它：

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync('src/components/canvas/WireMaterialDialog.tsx', 'utf8');

describe('WireMaterialDialog catalog defaults', () => {
  it('applies the selected catalog spec through the pure adapter', () => {
    expect(dialogSource).toContain("import { applyCatalogWireSpec } from '@/lib/wireCatalog'");
    expect(dialogSource).toContain('applyCatalogWireSpec(current, selected.spec)');
    expect(dialogSource).toContain('[catalogWires, selectedCatalogWireId]');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/lib/__tests__/wireMaterialDialog.test.ts`

Expected: FAIL because the dialog has not imported or invoked `applyCatalogWireSpec`.

- [ ] **Step 3: Apply selected catalog defaults in the dialog**

在 `WireMaterialDialog.tsx` 中，在目录加载和选择状态之后增加 effect：

```ts
useEffect(() => {
  const selected = catalogWires.find((wire) => wire.resourceItemId === selectedCatalogWireId);
  if (!selected) return;
  setSpec((current) => applyCatalogWireSpec(current, selected.spec));
}, [catalogWires, selectedCatalogWireId]);
```

从 `@/lib/wireCatalog` 导入 `applyCatalogWireSpec`。不要在 effect 中重置 `lengthMm` 或 `endTreatment`；目录名称、图片和资源 ID 仍使用当前 `handleSubmit()` 的值。

- [ ] **Step 4: Run the focused tests and build**

Run: `npm test -- --run src/lib/__tests__/wireCatalog.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/wireMaterialDialog.test.ts`

Expected: PASS。

## Task 5: 更新绘图资源查询和种子数据

**Files:**
- Modify: `src/lib/drawingCatalogRepository.ts`
- Modify: `supabase/sql/40_seed/01_example_catalog.sql`
- Modify: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- Modify: `src/lib/__tests__/drawingCatalogRepository.test.ts`
- Modify: `src/lib/__tests__/drawingResourceSql.test.ts`

**Interfaces:**
- Consumes: `public.wires.wire_kind` from Task 1.
- Produces: Seed rows and drawing resource summaries that no longer depend on `cable_type`.

- [ ] **Step 1: Add failing seed/query assertions**

在 SQL 契约测试中增加：

```ts
const drawingSeed = read('supabase/sql/40_seed/03_drawing_workbench_resources.sql');
const exampleSeed = read('supabase/sql/40_seed/01_example_catalog.sql');
expect(drawingSeed).toContain('wire_kind');
expect(drawingSeed).toContain("'UL20276'");
expect(exampleSeed).toContain("'UL2464'");
expect(drawingCatalogRepository).toContain('wires(wire_kind)');
expect(drawingCatalogRepository).not.toContain('wires(cable_type)');
```

在 `drawingCatalogRepository.test.ts` 增加行为测试，确认线材种类进入资源规格摘要：

```ts
it('maps wire_kind as the drawing resource specification', async () => {
  const repository = new DrawingCatalogRepository(fakeClient({
    resource_items: [{
      id: 'wire-1', legacy_key: 'shielded-4c', resource_type: 'wire',
      resource_name: '4芯屏蔽线', model: 'SHIELD-4C', resource_group: '绘图线材',
      short_description: '', display_order: 1, lifecycle_status: 'active', deleted_at: null,
      wires: { wire_kind: 'jacketed' }, resource_item_images: [],
    }],
  }));
  await expect(repository.listResources({ resourceType: 'wire' })).resolves.toEqual([
    expect.objectContaining({ resourceType: 'wire', specification: 'jacketed' }),
  ]);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts`

Expected: FAIL because seeds and the drawing repository still use `cable_type` or omit the new UL20276 row.

- [ ] **Step 3: Rewrite both wire seed inserts**

`01_example_catalog.sql` 的 demo UL2464 行使用：

```sql
insert into public.wires (
  resource_item_id, wire_kind, awg, ul_number, jacket_material, jacket_color,
  core_count, is_shielded, core_colors
) values (
  '20000000-0000-4000-8000-000000007002', 'jacketed', 24, 'UL2464',
  'PVC', 'black', 4, false,
  '["red","black","white","green"]'::jsonb
)
on conflict (resource_item_id) do update set
  wire_kind = excluded.wire_kind, awg = excluded.awg, ul_number = excluded.ul_number,
  jacket_material = excluded.jacket_material, jacket_color = excluded.jacket_color,
  core_count = excluded.core_count, is_shielded = excluded.is_shielded,
  core_colors = excluded.core_colors, updated_at = now();
```

`03_drawing_workbench_resources.sql` 保留两个资源身份：UL1007 行填 `wire_kind = 'electronic'`、`awg = 24`、`ul_number = '1007'`、`conductor_color = 'red'`、空芯线数组；`shielded-4c` 行填 `wire_kind = 'jacketed'`、`awg = 24`、`ul_number = 'UL20276'`、PVC 黑色、4 芯、`is_shielded = true` 和四个芯线颜色。

- [ ] **Step 4: Update drawing repository query**

在 `listResources()` 的 select 字符串中把 `wires(cable_type)` 改为 `wires(wire_kind)`，并在 `mapCatalogRow()` 中把：

```ts
const specification = text(accessory.specification) || text(packaging.specification) || text(wire.cable_type) || text(model.model_kind);
```

改为：

```ts
const specification = text(accessory.specification) || text(packaging.specification) || text(wire.wire_kind) || text(model.model_kind);
```

- [ ] **Step 5: Run SQL and drawing tests**

Run: `npm test -- --run src/lib/__tests__/drawingResourceSql.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts`

Expected: PASS。

## Task 6: 完成回归验证

**Files:**
- No new source files; inspect all files changed by Tasks 1-5.

**Interfaces:**
- Consumes: the completed SQL, seed, adapter, repository, and dialog changes.
- Produces: verified test-stage implementation with no stale canonical wire-field references.

- [ ] **Step 1: Search for stale canonical references**

Run: `rg -n "wires\((cable_type|wire_type_id|wire_gauge_id)|wire_gauge_awg|conductor_color_id|jacket_color_id|core_specs" src supabase/sql/10_schema supabase/sql/40_seed`

Expected: no matches in canonical schema, seeds, repositories, or frontend code. Historical `supabase/sql/50_upgrade` references may remain because they are explicitly outside this test-stage redesign; do not add new references.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- --run src/lib/__tests__/wireCatalog.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/wireMaterialDialog.test.ts src/lib/__tests__/drawingResourceSql.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts`

Expected: PASS。

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: PASS with no failed tests.

- [ ] **Step 4: Run type checking and production build**

Run: `npm run build`

Expected: TypeScript compilation and Vite production build pass. Existing chunk-size warnings are acceptable if no new errors appear.

- [ ] **Step 5: Review final diff and report unverified external actions**

Run: `git diff --check` and `git status --short`。

确认没有执行远程 SQL、提交、推送或生产数据操作；在最终交付中列出实际运行的测试命令、结果和任何未验证项。

## Handoff

计划已按方案 A 拆分为 SQL 契约、纯规格适配、目录仓库、弹窗交互、种子/绘图查询和回归验证六个任务。执行时可选择 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`；无论选择哪一种，都不执行未授权 Git 提交。
