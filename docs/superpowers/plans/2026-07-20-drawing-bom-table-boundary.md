# 配置向导物料表边界与线色实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复配置向导生成的左下角物料表向下溢出问题，并让独立画布、Canvas 导出和旧版预览中的表格线统一为 `#181818`。

**Architecture:** 在 `createDrawingFromWizard` 生成 BOM 行时，依据现有表格布局规则同步写入 `rowHeights`、`height` 和以图框内底边为锚点的 `y`，从数据源头保证表格几何完整。在线色方面增加表格专用常量，由三个现有渲染入口共同使用，不修改普通绘图对象的默认描边。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 3、Tailwind CSS 4。

## Global Constraints

- 表格底边固定为 `page.height - DRAWING_PAGE_INSET`，新增物料行整体向上扩展。
- 所有表格外框、表头线、列线和数据行线使用 `#181818`。
- 不改变列宽、字体、字号、物料排序、普通图形线色或数据库结构。
- 只修改本任务相关文件；保留当前工作区已有的数据库暂存改动。
- 按 TDD 顺序先写能失败的回归测试，再修改生产代码。

---

## 文件结构与职责

- Modify: `src/lib/__tests__/standaloneDrawingGenerator.test.ts` — 验证向导生成 BOM 的动态高度、底边锚定和单页内布局。
- Create: `src/lib/__tests__/drawingTableLineColor.test.ts` — 验证统一表格线色常量及三个渲染入口的引用。
- Modify: `src/lib/drawingGenerator.ts` — 生成物料行后同步表格行高、总高和顶部位置。
- Modify: `src/lib/drawingTableLayout.ts` — 暴露表格渲染共用的 `DRAWING_TABLE_LINE_COLOR` 常量。
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx` — 统一独立绘图编辑画布中的表格边线。
- Modify: `src/lib/drawingRenderer.ts` — 统一 Canvas 绘制和导出的表格描边。
- Modify: `src/components/drawings/workbench/DrawingCanvas.tsx` — 统一旧版预览中的物料表、接线表和标题块表格边线。

---

### Task 1: 建立通过基线

**Files:** 无生产代码改动。

- [ ] **Step 1: 运行完整现有测试。**

```powershell
npm test -- --run
```

Expected: 当前基线测试完成；若失败，记录失败用例并保持其作为既有问题，不把它误判为本任务回归。

- [ ] **Step 2: 运行类型构建基线。**

```powershell
npm run build
```

Expected: TypeScript 与 Vite 构建成功。

### Task 2: 先写物料表边界回归测试（RED）

**Files:**
- Test: `src/lib/__tests__/standaloneDrawingGenerator.test.ts`

**Interfaces:**
- Consumes: 已有 `draft()`、`createDrawingFromWizard()` 和 `resolveDrawingTableCells()`。
- Produces: 能证明当前生成物料表的渲染单元超出存储表高的失败用例。

- [ ] **Step 1: 扩展导入并添加失败测试。**

在测试文件中增加以下导入：

```typescript
import { DRAWING_PAGE_INSET } from '@/lib/drawingDocument';
import { resolveDrawingTableCells } from '@/lib/drawingTableLayout';
```

在 `describe('standalone drawing generator', () => {` 内追加：

```typescript
  it('anchors generated BOM rows to the drawing frame bottom', () => {
    const drawing = createDrawingFromWizard(draft());
    const bom = drawing.objects.find((object) => object.kind === 'bom-table');

    expect(bom?.kind).toBe('bom-table');
    if (bom?.kind !== 'bom-table') return;

    expect(bom.rows).toHaveLength(4);
    expect(bom.rowHeights).toEqual([18, 18, 18, 18]);
    expect(bom.height).toBe(96);
    expect(bom.y + bom.height).toBe(drawing.page.height - DRAWING_PAGE_INSET);

    const renderedBottom = Math.max(...resolveDrawingTableCells(bom).map((cell) => cell.y + cell.height));
    expect(renderedBottom).toBe(bom.height);
  });
```

- [ ] **Step 2: 只运行该回归测试。**

```powershell
npm test -- src/lib/__tests__/standaloneDrawingGenerator.test.ts
```

Expected: FAIL，当前 BOM 只有初始 `height: 24`、没有按四条物料行写入 `rowHeights`，因此期望的高度或底边断言失败。

### Task 3: 修复生成阶段的 BOM 几何（GREEN）

**Files:**
- Modify: `src/lib/drawingGenerator.ts:1-8,152-163`

**Interfaces:**
- Consumes: `createBlankDrawingDocument()` 返回的 BOM 表、`drawingBomRows()`、`resolveDrawingTableLayout()` 和 `DRAWING_PAGE_INSET`。
- Produces: `createDrawingFromWizard()` 返回的 BOM 表包含与数据行数量一致的 `rowHeights`，并保持底边锚定。

- [ ] **Step 1: 增加布局依赖导入。**

将 `drawingDocument` 导入扩展为包含 `DRAWING_PAGE_INSET`，并增加：

```typescript
import { resolveDrawingTableLayout } from '@/lib/drawingTableLayout';
```

- [ ] **Step 2: 在 BOM 分支中先构造完整布局，再计算底边锚定位置。**

将当前只返回 `{ ...object, rows: drawingBomRows(...) }` 的分支替换为：

```typescript
    if (object.kind === 'bom-table') {
      const rows = drawingBomRows(draft, left, right);
      const tableWithRows = {
        ...object,
        rows,
        rowHeights: rows.map(() => 18),
      };
      const layout = resolveDrawingTableLayout(tableWithRows);
      const height = (layout.showTitleRow ? layout.titleRowHeight : 0)
        + layout.headerRowHeight
        + layout.rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0);

      return {
        ...tableWithRows,
        rowHeights: layout.rowHeights,
        height,
        y: base.page.height - DRAWING_PAGE_INSET - height,
      };
    }
```

`showTitleRow`、标题行高、表头行高和最小行高继续由 `resolveDrawingTableLayout()` 决定；当前 BOM 的四条物料行会产生 `24 + 4 * 18 = 96` 的总高，顶部移动到 `684`，底边保持在 `780`。

- [ ] **Step 3: 重新运行生成器回归测试。**

```powershell
npm test -- src/lib/__tests__/standaloneDrawingGenerator.test.ts
```

Expected: PASS，包含原有生成器断言和新增底边锚定断言。

### Task 4: 先写表格线色回归测试（RED）

**Files:**
- Create: `src/lib/__tests__/drawingTableLineColor.test.ts`

**Interfaces:**
- Consumes: 三个表格渲染入口的源码文件。
- Produces: 能在统一常量或任一渲染入口未接入时失败的回归测试。

- [ ] **Step 1: 创建源码引用检查测试。**

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererFiles = [
  'src/components/drawings/standalone/StandaloneDrawingCanvas.tsx',
  'src/lib/drawingRenderer.ts',
  'src/components/drawings/workbench/DrawingCanvas.tsx',
];

describe('drawing table line color', () => {
  it('shares #181818 across every table renderer', () => {
    const layoutSource = readFileSync(resolve(process.cwd(), 'src/lib/drawingTableLayout.ts'), 'utf8');

    expect(layoutSource).toContain("export const DRAWING_TABLE_LINE_COLOR = '#181818'");
    rendererFiles.forEach((file) => {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8')).toContain('DRAWING_TABLE_LINE_COLOR');
    });
  });
});
```

- [ ] **Step 2: 运行线色测试确认它能失败。**

```powershell
npm test -- src/lib/__tests__/drawingTableLineColor.test.ts
```

Expected: FAIL，因为目前没有 `DRAWING_TABLE_LINE_COLOR` 常量或三个渲染入口的统一引用。

### Task 5: 接入统一表格线色（GREEN）

**Files:**
- Modify: `src/lib/drawingTableLayout.ts:28-35`
- Modify: `src/components/drawings/standalone/StandaloneDrawingCanvas.tsx:9-12,324-369`
- Modify: `src/lib/drawingRenderer.ts:3-4,38-42`
- Modify: `src/components/drawings/workbench/DrawingCanvas.tsx:1-20,137-235`

**Interfaces:**
- Consumes: `DRAWING_TABLE_LINE_COLOR`，值固定为 `#181818`。
- Produces: 编辑画布、Canvas 导出和旧版预览都用同一常量绘制表格线。

- [ ] **Step 1: 在表格布局模块声明专用线色常量。**

在表格布局常量附近增加：

```typescript
export const DRAWING_TABLE_LINE_COLOR = '#181818' as const;
```

- [ ] **Step 2: 修改独立绘图编辑画布。**

从 `@/lib/drawingTableLayout` 导入 `DRAWING_TABLE_LINE_COLOR`，并完成三处替换：

```tsx
boxShadow: `inset 0 0 0 1px ${DRAWING_TABLE_LINE_COLOR}`,
```

标题行保留 `border-b`，在其样式中加入 `borderColor: DRAWING_TABLE_LINE_COLOR`；单元格统一使用：

```tsx
className="box-border border-b border-r"
style={{
  borderColor: DRAWING_TABLE_LINE_COLOR,
  gridColumn: `${cell.columnIndex + 1} / span ${cell.columnSpan}`,
  gridRow: `${cell.rowIndex + 2} / span ${cell.rowSpan}`,
  // 保留现有字体、行高和溢出配置
}}
```

删除 `cell.header ? 'border-slate-900' : 'border-slate-300'` 的分支颜色，避免表头和数据行再次出现深浅差异。

- [ ] **Step 3: 修改 Canvas 表格导出绘制。**

从 `@/lib/drawingTableLayout` 导入常量，在 `drawTable()` 开头设置：

```typescript
context.strokeStyle = DRAWING_TABLE_LINE_COLOR;
```

该设置必须位于 `strokeRect()`、标题分隔线和单元格遍历之前，使表格外框、标题线和所有单元格描边都使用 `#181818`；普通对象的 `style.stroke` 逻辑保持不变。

- [ ] **Step 4: 修改旧版预览表格。**

导入常量并声明：

```tsx
const drawingTableLineStyle = { borderColor: DRAWING_TABLE_LINE_COLOR };
```

在 BOM 表、接线表和标题块中，保留 `border`、`border-b`、`border-r` 结构类，把外框及每个内部边线的 `style` 合并为 `drawingTableLineStyle`；颜色行圆点继续保留原有的 `backgroundColor: row.color`，写成：

```tsx
style={{ ...drawingTableLineStyle, backgroundColor: row.color }}
```

不修改预览页面自身的图框边线、技术要求框或其他非表格对象。

- [ ] **Step 5: 运行线色和相关布局测试。**

```powershell
npm test -- src/lib/__tests__/drawingTableLineColor.test.ts src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/drawingTableLayout.test.ts
```

Expected: PASS，统一线色测试、生成器测试和既有表格布局测试全部通过。

### Task 6: 完整验证与交付检查

**Files:** 无新增文件；仅检查 Task 2-5 的修改。

- [ ] **Step 1: 运行完整 Vitest。**

```powershell
npm test -- --run
```

Expected: 所有测试通过，包含新增边界和线色回归测试。

- [ ] **Step 2: 运行 TypeScript/Vite 构建。**

```powershell
npm run build
```

Expected: 构建成功，无 TypeScript 错误。

- [ ] **Step 3: 运行 ESLint。**

```powershell
npm run lint
```

Expected: ESLint 成功退出，无新增错误。

- [ ] **Step 4: 检查差异和工作区边界。**

```powershell
git diff --check
git status --short
git diff -- src/lib/drawingGenerator.ts src/lib/drawingTableLayout.ts src/lib/drawingRenderer.ts src/components/drawings/standalone/StandaloneDrawingCanvas.tsx src/components/drawings/workbench/DrawingCanvas.tsx src/lib/__tests__/standaloneDrawingGenerator.test.ts src/lib/__tests__/drawingTableLineColor.test.ts
```

Expected: 差异检查通过；只出现本任务相关的前端源文件、测试文件和本实施计划文件，原有数据库暂存改动保持不变。

## Plan Self-Review

- Spec coverage: 底边锚定由 Task 2-3 覆盖；三处渲染器线色由 Task 4-5 覆盖；自动化、构建、Lint 与手动检查由 Task 6 覆盖；非目标通过修改范围和 Global Constraints 保持不变。
- Placeholder scan: 本计划没有 `TBD`、`TODO`、`FIXME` 或未决步骤。
- Type consistency: `DRAWING_TABLE_LINE_COLOR` 定义在 `drawingTableLayout.ts`，三个渲染器均从该模块导入；生成器只消费现有 `resolveDrawingTableLayout()` 返回的布局字段。
