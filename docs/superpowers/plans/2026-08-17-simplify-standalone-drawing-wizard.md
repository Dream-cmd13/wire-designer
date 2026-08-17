# Simplify Standalone Drawing Wizard Implementation Plan

> **Superseded compatibility note:** 旧字段兼容步骤已由 `2026-08-17-remove-standalone-drawing-wizard-compatibility.md` 取代；当前实现不保留 `DrawingTopology`、`heatShrink` 或 `heatShrinkResource`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将独立制作图纸向导简化为三步，并让新图纸的热缩套管完全由有效的 `protective_sleeves` 公共资源驱动，同时兼容旧 `heatShrink` 字符串。

**Architecture:** 保留现有 `DrawingWizardDraft` 与 `DrawingDocument.schemaVersion = 1`，仅增加可选资源快照字段。公共资源仓库负责联表、状态过滤和套管规格摘要；生成器负责新资源与旧字符串的统一解析；向导仅负责三步交互与模板独立入口；SQL 只提供幂等种子和人工执行的升级脚本。

**Tech Stack:** React 19、TypeScript 6、Zustand、Supabase JS、Vitest、Vite、PostgreSQL SQL。

## Global Constraints

- 不修改 `protective_sleeves` 表结构。
- 不增加热缩套管裁切长度、成本或库存计算。
- 不提升 `DrawingDocument.schemaVersion`，继续使用 `1`。
- `DrawingTopology.drawingType` 与 `wireKind` 保留在内部结构，新草稿固定写入 `internal` 与 `electronic`。
- 新向导不写入 `heatShrink`，旧 `heatShrink?: string` 只用于兼容读取。
- 不执行远程 Supabase SQL，不提交、不推送；这些外部操作需要用户另行授权。
- 保留工作区内已有 Storage bootstrap 改动，只修改本计划列出的文件。

---

## File Structure

- `src/types/drawing.ts`：扩展绘图目录资源类型和向导草稿资源快照。
- `src/lib/drawingCatalogRepository.ts`：读取、过滤并映射 `protective_sleeves`。
- `src/lib/drawingGenerator.ts`：统一生成套管图形、物料种类和 BOM 行，并保留旧字符串回退。
- `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`：实现三步向导、端头形式控件、模板独立入口和热缩套管选择器。
- `src/lib/__tests__/drawingCatalogRepository.test.ts`：覆盖套管联表映射与过滤。
- `src/lib/__tests__/standaloneDrawingGenerator.test.ts`：覆盖新资源、空选择和旧字符串三种生成路径。
- `src/lib/__tests__/standaloneDrawingWizard.test.tsx`：使用真实 SSR 输出验证首屏三步结构和移除字段。
- `src/lib/__tests__/drawingResourceSql.test.ts`：执行 SQL 文件契约检查。
- `supabase/sql/40_seed/03_drawing_workbench_resources.sql`：将 Φ6 示例改为规范套管资源。
- `supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql`：为现有数据库提供幂等 accessory 到 protective sleeve 的升级脚本。
- `supabase/sql/README.md`：记录新增升级脚本的人工执行顺序和远程执行限制。

### Task 1: Protective Sleeve Catalog Contract

**Files:**
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/drawingCatalogRepository.ts`
- Test: `src/lib/__tests__/drawingCatalogRepository.test.ts`

**Interfaces:**
- Consumes: Supabase `resource_items.protective_sleeves(...)` 联表结果。
- Produces: `DrawingCatalogResourceType` 的 `'protective_sleeve'` 分支，以及 `DrawingWizardDraft.heatShrinkResource?: DrawingCatalogResource`。

- [ ] **Step 1: 写入会失败的套管联表映射测试**

```typescript
it('maps only active heat-shrink protective sleeves', async () => {
  const repository = new DrawingCatalogRepository(fakeClient({
    resource_items: [
      {
        id: 'sleeve-1', legacy_key: 'heat-shrink-6', resource_type: 'protective_sleeve',
        resource_name: 'Φ6热缩套管', model: 'HS-6MM', resource_group: '绘图辅材',
        lifecycle_status: 'active', deleted_at: null,
        protective_sleeves: {
          material: 'polyolefin', color: 'black', sleeve_type: 'heat-shrink', shrink_ratio: 2,
          nominal_length_m: 1, inner_diameter_as_supplied_mm: 6,
          inner_diameter_recovered_mm: 3, recovered_wall_thickness_mm: 0.55,
        },
        resource_item_images: [],
      },
      {
        id: 'sleeve-2', legacy_key: 'braided-6', resource_type: 'protective_sleeve',
        resource_name: '编织套管', model: 'BRAID-6', resource_group: '绘图辅材',
        lifecycle_status: 'active', deleted_at: null,
        protective_sleeves: { sleeve_type: 'braided' }, resource_item_images: [],
      },
      {
        id: 'sleeve-3', legacy_key: 'inactive-6', resource_type: 'protective_sleeve',
        resource_name: '停用热缩套管', model: 'HS-INACTIVE', resource_group: '绘图辅材',
        lifecycle_status: 'inactive', deleted_at: null,
        protective_sleeves: { sleeve_type: 'heat-shrink' }, resource_item_images: [],
      },
    ],
  }));

  await expect(repository.listResources({ resourceType: 'protective_sleeve' })).resolves.toEqual([
    expect.objectContaining({
      resourceItemId: 'sleeve-1', resourceType: 'protective_sleeve', model: 'HS-6MM',
      specification: 'Φ6mm · 2:1 · polyolefin · black', unit: 'PCS',
    }),
  ]);
});
```

- [ ] **Step 2: 运行测试并确认因类型/映射缺失而失败**

Run: `npm test -- src/lib/__tests__/drawingCatalogRepository.test.ts`

Expected: FAIL，结果为空或 `protective_sleeve` 类型不被接受。

- [ ] **Step 3: 最小实现类型与仓库映射**

```typescript
export type DrawingCatalogResourceType =
  | 'connector'
  | 'model'
  | 'wire'
  | 'protective_sleeve'
  | 'accessory'
  | 'packaging';

export type DrawingWizardDraft = {
  // existing fields
  heatShrink?: string;
  heatShrinkResource?: DrawingCatalogResource;
};
```

仓库查询增加：

```typescript
protective_sleeves(
  material,color,sleeve_type,shrink_ratio,nominal_length_m,
  inner_diameter_as_supplied_mm,inner_diameter_recovered_mm,recovered_wall_thickness_mm
)
```

`resource_type = 'protective_sleeve'` 映射为同名类型；只有 `sleeve_type === 'heat-shrink'` 的记录进入结果。规格摘要固定按“供货内径、收缩比、材料、颜色”的非空值连接，单位写为 `PCS`。

- [ ] **Step 4: 运行仓库测试并确认通过**

Run: `npm test -- src/lib/__tests__/drawingCatalogRepository.test.ts`

Expected: PASS，所有仓库测试为 0 failures。

### Task 2: Generator and Legacy Compatibility

**Files:**
- Modify: `src/lib/drawingGenerator.ts`
- Test: `src/lib/__tests__/standaloneDrawingGenerator.test.ts`

**Interfaces:**
- Consumes: `DrawingWizardDraft.heatShrinkResource`，并回退读取 `DrawingWizardDraft.heatShrink`。
- Produces: 套管 accessory 图形、按稳定资源 ID 去重的物料种类、带资源型号的 BOM 行。

- [ ] **Step 1: 写入新资源、未选择和旧数据三个失败测试**

```typescript
const heatShrinkResource: DrawingCatalogResource = {
  id: 'heat-shrink-6', resourceItemId: 'sleeve-1', resourceType: 'protective_sleeve',
  name: 'Φ6热缩套管', model: 'HS-6MM', resourceGroup: '绘图辅材',
  specification: 'Φ6mm · 2:1 · polyolefin · black', unit: 'PCS',
};

it('uses the selected protective sleeve for material count, drawing label, and BOM code', () => {
  const drawingDraft = { ...draft(), heatShrink: undefined, heatShrinkResource };
  expect(countDrawingMaterialKinds(drawingDraft)).toBe(4);
  const drawing = createDrawingFromWizard(drawingDraft);
  expect(drawing.objects).toContainEqual(expect.objectContaining({
    kind: 'accessory', accessoryType: 'sleeve', label: 'Φ6热缩套管',
  }));
  const bom = drawing.objects.find((object) => object.kind === 'bom-table');
  expect(bom?.kind).toBe('bom-table');
  if (bom?.kind === 'bom-table') {
    expect(bom.rows.find((row) => row['物料名称/规格'] === 'Φ6热缩套管')).toMatchObject({
      物料编码: 'HS-6MM', 单位: 'PCS', 用量: '1',
    });
  }
});

it('omits sleeve objects and BOM rows when no sleeve is selected', () => {
  const drawingDraft = { ...draft(), heatShrink: undefined, heatShrinkResource: undefined };
  expect(countDrawingMaterialKinds(drawingDraft)).toBe(3);
  const drawing = createDrawingFromWizard(drawingDraft);
  expect(drawing.objects.some((object) => object.kind === 'accessory' && object.accessoryType === 'sleeve')).toBe(false);
});

it('keeps legacy heatShrink text readable without inventing a resource code', () => {
  const drawing = createDrawingFromWizard({ ...draft(), heatShrinkResource: undefined, heatShrink: '旧热缩套管' });
  const bom = drawing.objects.find((object) => object.kind === 'bom-table');
  expect(bom?.kind).toBe('bom-table');
  if (bom?.kind === 'bom-table') {
    expect(bom.rows.find((row) => row['物料名称/规格'] === '旧热缩套管')).toMatchObject({ 物料编码: '' });
  }
});
```

- [ ] **Step 2: 运行生成器测试并确认预期失败**

Run: `npm test -- src/lib/__tests__/standaloneDrawingGenerator.test.ts`

Expected: FAIL，新资源不影响计数、图形或 BOM 编码。

- [ ] **Step 3: 实现统一套管解析和 BOM 编码**

新增内部解析：优先返回 `heatShrinkResource` 的 `resourceItemId/name/model/unit`；否则在旧字符串非空时返回只含名称的兼容值。`countDrawingMaterialKinds` 使用 `resourceItemId` 去重；`drawingBomRows` 的 Map 值增加 `code`；套管图形标签使用解析后的名称。

- [ ] **Step 4: 运行生成器测试并确认通过**

Run: `npm test -- src/lib/__tests__/standaloneDrawingGenerator.test.ts`

Expected: PASS，三条新用例和原有生成器用例均通过。

### Task 3: Three-Step Wizard and Template Entry

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`
- Create: `src/lib/__tests__/standaloneDrawingWizard.test.tsx`

**Interfaces:**
- Consumes: `drawingCatalogRepository.listResources()`、`listTemplates()`、`loadTemplate()` 和 `DrawingWizardDraft.heatShrinkResource`。
- Produces: “连接器/模型 → 属性与颜色 → 预览”三步界面，以及独立“从模板创建”视图。

- [ ] **Step 1: 写入真实 SSR 首屏失败测试**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StandaloneDrawingWizard } from '@/components/drawings/standalone/StandaloneDrawingWizard';

it('renders three drawing steps with endpoint form and separate template command', () => {
  const html = renderToStaticMarkup(
    <StandaloneDrawingWizard open onClose={vi.fn()} onGenerate={vi.fn()} />,
  );
  expect(html).toContain('1. 连接器/模型');
  expect(html).toContain('2. 属性与颜色');
  expect(html).toContain('3. 预览');
  expect(html).toContain('端头形式');
  expect(html).toContain('从模板创建');
  expect(html).not.toContain('>类型<');
  expect(html).not.toContain('>子类型<');
  expect(html).not.toContain('线材类型');
  expect(html).not.toContain('4. 预览');
});
```

- [ ] **Step 2: 运行向导测试并确认四步旧界面导致失败**

Run: `npm test -- src/lib/__tests__/standaloneDrawingWizard.test.tsx`

Expected: FAIL，旧首屏仍包含类型、子类型、线材类型和四步导航。

- [ ] **Step 3: 实现三步与独立模板视图**

将导航改为固定三项。第一步使用两个按钮组成的分段控件更新 `topology.topology`；初始 `drawingType` 固定为 `internal`，`wireKind` 固定为 `electronic`。顶部增加“新建图纸”和“从模板创建”命令；模板视图直接列出 `drawing_templates`，载入时继续调用 `loadTemplate()`。

- [ ] **Step 4: 接入可清空的热缩套管资源选择**

第二步从 `resources.filter(resource => resource.resourceType === 'protective_sleeve')` 构造下拉框，值使用 `resourceItemId`，选择后写入完整 `heatShrinkResource` 并清除旧 `heatShrink`。空列表显示“暂无可用热缩套管”。刷新后若旧选择不在有效列表中，则清空并显示“已选热缩套管已失效，请重新选择。”。

- [ ] **Step 5: 完善预览和下一步条件**

预览展示端头形式、连接器名称、线材名称与规格、套管名称、芯数、总长度、公差和物料种类。第一步只有连接器条件满足时可继续；第二步允许不选套管；第三步按现有 `validation.errors` 控制生成。

- [ ] **Step 6: 运行向导和生成器测试**

Run: `npm test -- src/lib/__tests__/standaloneDrawingWizard.test.tsx src/lib/__tests__/standaloneDrawingGenerator.test.ts`

Expected: PASS，0 failures。

### Task 4: Canonical Seed and Manual Upgrade SQL

**Files:**
- Modify: `supabase/sql/40_seed/03_drawing_workbench_resources.sql`
- Create: `supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql`
- Modify: `supabase/sql/README.md`
- Test: `src/lib/__tests__/drawingResourceSql.test.ts`

**Interfaces:**
- Consumes: 当前固定资源 ID `30000000-0000-4000-8000-000000001006` 与 `legacy_key = 'heat-shrink-6'`。
- Produces: 幂等的规范 `resource_items + protective_sleeves` 数据，以及不会由前端自动执行的升级脚本。

- [ ] **Step 1: 写入 SQL 行为失败测试**

```typescript
const sleeveUpgrade = read('supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql');

expect(seed).toContain("'protective_sleeve', 'heat-shrink-6'");
expect(seed).toContain('insert into public.protective_sleeves');
expect(seed).not.toContain("'heat-shrink', 'Φ6mm 2:1'");
expect(sleeveUpgrade).toContain("legacy_key = 'heat-shrink-6'");
expect(sleeveUpgrade).toContain('delete from public.accessories');
expect(sleeveUpgrade).toContain("resource_type = 'protective_sleeve'");
expect(sleeveUpgrade).toContain('insert into public.protective_sleeves');
expect(sleeveUpgrade).toContain('begin;');
expect(sleeveUpgrade).toContain('commit;');
```

- [ ] **Step 2: 运行 SQL 测试并确认失败**

Run: `npm test -- src/lib/__tests__/drawingResourceSql.test.ts`

Expected: FAIL，种子仍使用 `accessories`，升级文件不存在。

- [ ] **Step 3: 修改标准种子**

将固定 Φ6 资源的 `resource_type` 改为 `protective_sleeve`，从 `accessories` 插入中移除该行，并增加：

```sql
insert into public.protective_sleeves (
  resource_item_id, material, color, sleeve_type, shrink_ratio,
  nominal_length_m, inner_diameter_as_supplied_mm,
  inner_diameter_recovered_mm, recovered_wall_thickness_mm
) values (
  '30000000-0000-4000-8000-000000001006', 'polyolefin', 'black',
  'heat-shrink', 2, 1, 6, 3, 0.55
)
on conflict (resource_item_id) do update set
  material = excluded.material, color = excluded.color, sleeve_type = excluded.sleeve_type,
  shrink_ratio = excluded.shrink_ratio, nominal_length_m = excluded.nominal_length_m,
  inner_diameter_as_supplied_mm = excluded.inner_diameter_as_supplied_mm,
  inner_diameter_recovered_mm = excluded.inner_diameter_recovered_mm,
  recovered_wall_thickness_mm = excluded.recovered_wall_thickness_mm,
  updated_at = now();
```

- [ ] **Step 4: 创建幂等人工升级脚本**

脚本在一个事务中：将目标资源临时设为 `inactive`；删除其 `accessories` 行；改 `resource_type`；upsert `protective_sleeves`；最后恢复 `active`。所有定位均使用固定 `legacy_key`，不存在目标行时不创建重复资源。

- [ ] **Step 5: 更新 SQL README**

在现有升级顺序末尾加入 `50_upgrade/06_normalize_drawing_heat_shrink.sql`，并明确该脚本需管理员人工执行，前端和 Storage bootstrap 都不会运行数据库写入。

- [ ] **Step 6: 运行 SQL 测试并确认通过**

Run: `npm test -- src/lib/__tests__/drawingResourceSql.test.ts`

Expected: PASS，0 failures。

### Task 5: Full Verification and UI Walkthrough

**Files:**
- Verify only; no new production behavior.

**Interfaces:**
- Consumes: Tasks 1-4 的最终工作区状态。
- Produces: 可复核的自动测试、构建、静态检查和本地页面证据。

- [ ] **Step 1: 运行聚焦测试**

Run: `npm test -- src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/standaloneDrawingWizard.test.tsx src/lib/__tests__/drawingResourceSql.test.ts`

Expected: PASS，0 failures。

- [ ] **Step 2: 运行完整测试套件**

Run: `npm test`

Expected: PASS，0 failures。

- [ ] **Step 3: 运行 TypeScript 与生产构建**

Run: `npm run build`

Expected: exit code 0。

- [ ] **Step 4: 运行 ESLint**

Run: `npm run lint`

Expected: exit code 0，0 errors。

- [ ] **Step 5: 启动本地开发服务器并走查页面**

Run: `npm run dev -- --host localhost`

在浏览器确认：三步标签完整；不存在类型/子类型/线材类型；单头隐藏右连接器；双头显示左右连接器；模板入口可进入并返回；热缩套管可选和可清空；空列表与失效提示不阻止无套管生成。

- [ ] **Step 6: 复核差异和远程边界**

Run: `git diff -- src/types/drawing.ts src/lib/drawingCatalogRepository.ts src/lib/drawingGenerator.ts src/components/drawings/standalone/StandaloneDrawingWizard.tsx src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/standaloneDrawingWizard.test.tsx src/lib/__tests__/drawingResourceSql.test.ts supabase/sql/40_seed/03_drawing_workbench_resources.sql supabase/sql/50_upgrade/06_normalize_drawing_heat_shrink.sql supabase/sql/README.md`

Expected: 仅包含本功能改动；没有远程 SQL 执行、提交或推送。
