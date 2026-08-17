# Remove Standalone Drawing Wizard Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除独立制作图纸向导中过渡保留的旧字段和回退逻辑，使端头形式与保护套管只使用当前规范模型。

**Architecture:** 将 `DrawingWizardDraft` 收敛为直接的 `endpointForm` 和 `protectiveSleeveResource` 字段，生成器、向导组件和 `wizardSource` 统一消费这一结构。先用生成结果测试锁定规范 JSON，再让 TypeScript 构建定位所有旧字段消费者，最后更新组件和文档，不增加迁移器、别名或双写。

**Tech Stack:** React 19、TypeScript 6、Vitest 3、Vite 8、Supabase 公共资源读取。

## Global Constraints

- 只清理独立制作图纸向导，不修改 `src/types/harness.ts`、`src/lib/drawingWizard.ts` 或 `DrawingWizardDialog.tsx` 中仍有业务作用的字段。
- 删除 `DrawingTopology`、`drawingType`、旧嵌套 `topology`、独立向导 `wireKind`、`heatShrink` 和 `heatShrinkResource`。
- 规范字段固定为 `endpointForm: 'single-end' | 'double-end'` 和可选 `protectiveSleeveResource: DrawingCatalogResource`。
- 不为旧测试草稿或旧 `wizardSource` 增加解析、迁移、默认值、别名或双写。
- `DrawingDocument.schemaVersion` 保持为 `1`；本次不改变可渲染图纸对象结构。
- 不修改 Supabase SQL。若实施中意外产生 SQL 变更，必须先在远程阿里云 Supabase 成功执行并验证，才允许推送。
- 保留工作区已有的 `supabase/.temp/cli-latest` 和 `docs/superpowers/specs/2026-07-21-external-catalog-image-association-design.md`，不得纳入本任务。
- 未获得新的明确 Git 授权前，只实现和验证，不提交、不推送。

---

## File Map

- `src/types/drawing.ts`：定义独立向导唯一的规范字段和字段类型。
- `src/lib/drawingGenerator.ts`：校验端头形式、读取保护套管资源、生成图形/BOM/`wizardSource`。
- `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`：编辑规范草稿，不再创建或清理旧字段。
- `src/lib/__tests__/standaloneDrawingGenerator.test.ts`：覆盖规范草稿、保护套管和输出 JSON。
- `src/lib/__tests__/drawingCanvasTemplates.test.ts`：更新独立向导测试夹具到新结构。
- `src/lib/__tests__/standaloneDrawingWizard.test.tsx`：保留三步 UI 和端头形式契约。
- `docs/superpowers/specs/2026-08-17-simplify-standalone-drawing-wizard-design.md`：记录最终规范模型和完成状态。
- `docs/superpowers/plans/2026-08-17-simplify-standalone-drawing-wizard.md`：标记原兼容方案已由本计划取代。

---

### Task 1: Canonical Draft and Generator Contract

**Files:**
- Modify: `src/lib/__tests__/standaloneDrawingGenerator.test.ts`
- Modify: `src/types/drawing.ts`
- Modify: `src/lib/drawingGenerator.ts`

**Interfaces:**
- Consumes: `DrawingCatalogResource`、`DrawingConnectorResource`、现有 `createDrawingFromWizard(draft)`。
- Produces: `DrawingEndpointForm`、规范 `DrawingWizardDraft`、仅资源驱动的保护套管生成逻辑。

- [x] **Step 1: Write the failing canonical-output test**

将测试夹具改为规范结构，并新增输出断言。测试阶段先通过 `unknown` 转换让旧生产类型能够执行到运行时失败：

```typescript
const protectiveSleeveResource: DrawingCatalogResource = {
  id: 'heat-shrink-6',
  resourceItemId: 'sleeve-1',
  resourceType: 'protective_sleeve',
  name: 'Φ6热缩套管',
  model: 'HS-6MM',
  resourceGroup: '绘图辅材',
  specification: 'Φ6mm · 2:1 · polyolefin · black',
  unit: 'PCS',
};

function draft(): DrawingWizardDraft {
  return {
    endpointForm: 'double-end',
    leftConnector: connector,
    rightConnector: connector,
    drawingNo: 'WH-4P',
    totalLengthMm: 320,
    toleranceMm: 5,
    hasMold: true,
    protectiveSleeveResource,
    wires,
    wireResource,
  } as unknown as DrawingWizardDraft;
}

it('persists only canonical endpoint and protective sleeve fields', () => {
  const drawing = createDrawingFromWizard(draft());

  expect(drawing.wizardSource).toMatchObject({
    endpointForm: 'double-end',
    protectiveSleeveResource,
  });
  expect(drawing.wizardSource).not.toHaveProperty('topology');
  expect(drawing.wizardSource).not.toHaveProperty('drawingType');
  expect(drawing.wizardSource).not.toHaveProperty('wireKind');
  expect(drawing.wizardSource).not.toHaveProperty('heatShrink');
  expect(drawing.wizardSource).not.toHaveProperty('heatShrinkResource');
});
```

删除“旧 `heatShrink` 字符串仍可生成”的测试；将无套管测试改为：

```typescript
const drawingDraft = { ...draft(), protectiveSleeveResource: undefined };
expect(countDrawingMaterialKinds(drawingDraft)).toBe(3);
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- --run src/lib/__tests__/standaloneDrawingGenerator.test.ts`

Expected: FAIL，旧生成器访问 `draft.topology.topology`，或规范 `wizardSource` 断言失败。

- [x] **Step 3: Replace the transitional type contract**

在 `src/types/drawing.ts` 删除 `DrawingTopology`，并写入：

```typescript
export type DrawingEndpointForm = 'single-end' | 'double-end';

export type DrawingWizardDraft = {
  endpointForm: DrawingEndpointForm;
  leftConnector?: DrawingConnectorResource;
  rightConnector?: DrawingConnectorResource;
  singleConnector?: DrawingConnectorResource;
  drawingNo: string;
  totalLengthMm: number;
  toleranceMm: number;
  hasMold: boolean;
  protectiveSleeveResource?: DrawingCatalogResource;
  wires: DrawingWireDraft[];
  wireResource?: DrawingCatalogResource;
  modelResource?: DrawingCatalogResource;
  templateId?: string;
};
```

- [x] **Step 4: Make the generator consume only canonical fields**

将套管解析收敛为单一资源来源：

```typescript
function resolveProtectiveSleeveMaterial(draft: DrawingWizardDraft) {
  const resource = draft.protectiveSleeveResource;
  if (!resource) return undefined;
  return {
    key: `protective_sleeve:${resource.resourceItemId}`,
    name: resource.name,
    code: resource.model,
    unit: resource.unit ?? 'PCS',
  };
}
```

将两处端头判断改为：

```typescript
const isSingle = draft.endpointForm === 'single-end';
```

`countDrawingMaterialKinds`、`drawingBomRows`、附件图形生成都只调用 `resolveProtectiveSleeveMaterial`，不得读取旧字符串。

- [x] **Step 5: Run the generator test and verify GREEN**

Run: `npm test -- --run src/lib/__tests__/standaloneDrawingGenerator.test.ts`

Expected: PASS，包含规范字段断言、资源套管 BOM、无套管和校验测试。

---

### Task 2: Migrate the Wizard and Remaining Fixtures

**Files:**
- Modify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`
- Modify: `src/lib/__tests__/drawingCanvasTemplates.test.ts`
- Test: `src/lib/__tests__/standaloneDrawingWizard.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `DrawingEndpointForm`、`DrawingWizardDraft.endpointForm` 和 `protectiveSleeveResource`。
- Produces: 只写规范草稿的三步向导。

- [x] **Step 1: Run TypeScript build and verify the old consumers fail**

Run: `npm run build`

Expected: FAIL，错误应集中在 `StandaloneDrawingWizard.tsx` 和测试夹具仍访问 `topology`、`heatShrink` 或 `heatShrinkResource`。

- [x] **Step 2: Migrate initial state and endpoint selection**

初始草稿改为：

```typescript
function initialDraft(wireColors: Array<{ hex: string }>): DrawingWizardDraft {
  return {
    endpointForm: 'double-end',
    drawingNo: '',
    totalLengthMm: 320,
    toleranceMm: 5,
    hasMold: false,
    wires: [defaultWire(0, 320, wireColors)],
  };
}
```

端头状态和更新函数改为：

```typescript
const isSingle = draft.endpointForm === 'single-end';

const selectEndpointForm = (endpointForm: DrawingEndpointForm) => setDraft((current) => {
  const next = { ...current, endpointForm };
  const pinCount = endpointForm === 'single-end'
    ? next.singleConnector?.pinCount
    : Math.min(next.leftConnector?.pinCount ?? 1, next.rightConnector?.pinCount ?? 1);
  return { ...next, wires: resizeWires(next, pinCount ?? 1, wireColors) };
});
```

- [x] **Step 3: Migrate protective sleeve selection and refresh**

统一局部命名并只写规范字段：

```typescript
const protectiveSleeveResources = resources.filter(
  (resource) => resource.resourceType === 'protective_sleeve',
);

const selectProtectiveSleeve = (resourceItemId: string) => {
  const protectiveSleeveResource = protectiveSleeveResources.find(
    (resource) => resource.resourceItemId === resourceItemId,
  );
  setDraft((current) => ({ ...current, protectiveSleeveResource }));
  setNotice('');
};
```

刷新保留、下拉框值、已选摘要和预览全部改读 `protectiveSleeveResource`。不得出现清除旧 `heatShrink` 的赋值。

- [x] **Step 4: Update the remaining standalone draft fixture**

在 `drawingCanvasTemplates.test.ts` 将：

```typescript
topology: { drawingType: 'internal', topology: 'single-end', wireKind: 'electronic' },
```

替换为：

```typescript
endpointForm: 'single-end',
```

- [x] **Step 5: Run focused UI tests and build**

Run: `npm test -- --run src/lib/__tests__/standaloneDrawingWizard.test.tsx src/lib/__tests__/drawingCanvasTemplates.test.ts`

Expected: PASS。

Run: `npm run build`

Expected: PASS，生产代码与测试夹具不再引用被删除字段。

---

### Task 3: Remove Stale Documentation and Verify the Boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-simplify-standalone-drawing-wizard-design.md`
- Modify: `docs/superpowers/plans/2026-08-17-simplify-standalone-drawing-wizard.md`
- Verify: `src/types/drawing.ts`
- Verify: `src/lib/drawingGenerator.ts`
- Verify: `src/components/drawings/standalone/StandaloneDrawingWizard.tsx`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的最终字段名。
- Produces: 无矛盾的设计记录和可机械检查的兼容层删除边界。

- [x] **Step 1: Mark the design as implemented**

将设计文档状态改为：

```markdown
已按确认方案实施：独立向导只使用 `endpointForm` 和 `protectiveSleeveResource`，不保留旧字段或迁移回退。
```

- [x] **Step 2: Mark the original compatibility plan as superseded**

在原计划标题后增加：

```markdown
> **Superseded compatibility note:** 旧字段兼容步骤已由 `2026-08-17-remove-standalone-drawing-wizard-compatibility.md` 取代；当前实现不保留 `DrawingTopology`、`heatShrink` 或 `heatShrinkResource`。
```

- [x] **Step 3: Verify production code contains no transitional fields**

Run:

```powershell
rg -n "drawingType|draft\.topology|topology\.topology|heatShrinkResource|draft\.heatShrink|legacy-heat-shrink" `
  src/types/drawing.ts `
  src/lib/drawingGenerator.ts `
  src/components/drawings/standalone/StandaloneDrawingWizard.tsx
```

Expected: no matches and exit code `1` from `rg`.

Run:

```powershell
rg -n "endpointForm|protectiveSleeveResource" `
  src/types/drawing.ts `
  src/lib/drawingGenerator.ts `
  src/components/drawings/standalone/StandaloneDrawingWizard.tsx
```

Expected: matches in all three production files.

---

### Task 4: Full Verification and Handoff

**Files:**
- Verify only; do not modify unrelated files.

**Interfaces:**
- Consumes: 完成后的工作树。
- Produces: 可提交的验证证据和精确文件清单。

- [x] **Step 1: Run focused ESLint**

Run:

```powershell
npx eslint `
  src/types/drawing.ts `
  src/lib/drawingGenerator.ts `
  src/components/drawings/standalone/StandaloneDrawingWizard.tsx `
  src/lib/__tests__/standaloneDrawingGenerator.test.ts `
  src/lib/__tests__/drawingCanvasTemplates.test.ts `
  src/lib/__tests__/standaloneDrawingWizard.test.tsx
```

Expected: exit code `0`。

- [x] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all test files and tests pass with zero failures.

- [x] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit code `0`；允许现有的大包体积警告，不允许 TypeScript 或构建错误。

- [x] **Step 4: Record the known repository-wide lint result**

Run: `npm run lint`

Expected: 若仍仅有 `src/components/canvas/WireMaterialDialog.tsx:96` 的既有 `react-hooks/set-state-in-effect`，记录为本任务外问题；若出现本轮文件错误，必须修复后重跑。

- [x] **Step 5: Review the exact diff**

Run:

```powershell
git diff --check
git status --short
git diff -- `
  src/types/drawing.ts `
  src/lib/drawingGenerator.ts `
  src/components/drawings/standalone/StandaloneDrawingWizard.tsx `
  src/lib/__tests__/standaloneDrawingGenerator.test.ts `
  src/lib/__tests__/drawingCanvasTemplates.test.ts `
  src/lib/__tests__/standaloneDrawingWizard.test.tsx `
  docs/superpowers/specs/2026-08-17-simplify-standalone-drawing-wizard-design.md `
  docs/superpowers/plans/2026-08-17-simplify-standalone-drawing-wizard.md `
  docs/superpowers/plans/2026-08-17-remove-standalone-drawing-wizard-compatibility.md
```

Expected: 只包含本计划文件；`supabase/.temp/cli-latest` 和 2026-07-21 的无关设计文档保持未暂存、未修改。

- [x] **Step 6: Stop before Git commit or push**

报告改动与验证结果，等待用户明确授权提交和推送。本计划没有 SQL 变更，因此不需要远程数据库执行。
