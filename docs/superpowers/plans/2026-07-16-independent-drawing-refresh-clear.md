# Independent Drawing Refresh and Clear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Drawing Workbench independent from projects, retain its canvas across module switches, ask after browser refresh whether to resume or replace the local draft, and make Clear restore the three default tables.

**Architecture:** Keep drawing data in the existing persisted Zustand drawing store. Add a small runtime-session helper that distinguishes route remounts from full JavaScript reloads, wait for store hydration before initializing the page, and rebuild clear/reset output from `createBlankDrawingDocument` so every entry point shares one default template.

**Tech Stack:** React 19, TypeScript, Zustand persist, Vitest, Tailwind CSS.

## Global Constraints

- Only change Drawing Workbench and the shared shell text needed to remove project association from that route.
- Do not read or write Harness project configuration.
- Module switches preserve the active independent drawing without prompting.
- Browser refresh prompts even after a successful PDF export.
- A newly created or cleared canvas contains the BOM, revision table, and lower-right title table.
- Use Chinese UI copy: “是否丢弃当前制作的图纸？”, “继续制作”, and “丢弃并新建”.
- Preserve existing object interaction, material, undo/redo, and PDF export behavior.

---

### Task 1: Rebuild Clear from the Default Drawing Template

**Files:**
- Modify: `src/lib/drawingCommands.ts`
- Modify: `src/lib/__tests__/drawingCommands.test.ts`

**Interfaces:**
- Consumes: `createBlankDrawingDocument(name: string, date?: Date): DrawingDocument`.
- Produces: `clearDrawingCanvas(document: DrawingDocument, date?: Date): DrawingDocument`.

- [ ] **Step 1: Replace the old clear expectation with failing reset tests**

Import `createBlankDrawingDocument`, then add:

```ts
it('restores the three default tables and removes every added object', () => {
  const date = new Date(2026, 6, 16);
  const source = createBlankDrawingDocument('当前图纸', date);
  const changed = {
    ...source,
    objects: [
      ...source.objects.map((object) => object.tableRole === 'bom'
        ? { ...object, x: 500, rows: [{ 序号: '1' }] }
        : object),
      line('extra', 10, 99),
    ] as DrawingObject[],
  };
  const cleared = clearDrawingCanvas(changed, date);
  const template = createBlankDrawingDocument('当前图纸', date);

  expect(cleared.id).toBe(source.id);
  expect(cleared.name).toBe(source.name);
  expect(cleared.createdAt).toBe(source.createdAt);
  expect(cleared.page).toEqual(source.page);
  expect(cleared.objects.map((object) => object.tableRole).filter(Boolean))
    .toEqual(['bom', 'revision', 'title-block']);
  expect(cleared.objects.some((object) => object.id === 'extra')).toBe(false);
  expect(cleared.objects.find((object) => object.tableRole === 'bom'))
    .toMatchObject({ x: template.objects.find((object) => object.tableRole === 'bom')!.x, rows: [] });
});

it('does not update an already-default canvas', () => {
  const date = new Date(2026, 6, 16);
  const source = createBlankDrawingDocument('当前图纸', date);
  expect(clearDrawingCanvas(source, date)).toBe(source);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingCommands.test.ts`

Expected: the first test fails because Clear retains only the hidden title object; the second fails because the complete default template is not recognized.

- [ ] **Step 3: Implement semantic default comparison and template rebuild**

In `drawingCommands.ts`, import `createBlankDrawingDocument` and add:

```ts
function defaultCanvasSignature(document: DrawingDocument) {
  return JSON.stringify({
    page: document.page,
    titleBlock: document.titleBlock,
    revisionTable: document.revisionTable,
    techRequirements: document.techRequirements,
    objects: document.objects.map(({ id: _id, ...object }) => object),
  });
}

export function clearDrawingCanvas(document: DrawingDocument, date = new Date()): DrawingDocument {
  const template = createBlankDrawingDocument(document.name, date);
  const replacement: DrawingDocument = {
    ...template,
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    page: { ...document.page },
    updatedAt: Date.now(),
  };
  return defaultCanvasSignature(document) === defaultCanvasSignature(replacement)
    ? document
    : replacement;
}
```

Do not retain edited default-table objects; the template is the source of truth.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingCommands.test.ts src/lib/__tests__/drawingDefaultTables.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/lib/drawingCommands.ts src/lib/__tests__/drawingCommands.test.ts
git commit -m "fix: restore default drawing tables when clearing"
```

---

### Task 2: Add Atomic Independent-Drawing Reset and Runtime Entry Policy

**Files:**
- Create: `src/lib/drawingWorkbenchSession.ts`
- Create: `src/lib/__tests__/drawingWorkbenchSession.test.ts`
- Modify: `src/stores/drawingStore.ts`
- Create: `src/lib/__tests__/drawingStore.test.ts`

**Interfaces:**
- Produces: `enterDrawingWorkbench(hasExistingDrawing: boolean): 'create' | 'resume' | 'confirm'`.
- Produces: `DrawingStore.replaceWithNewDocument(name?: string): DrawingDocument`.

- [ ] **Step 1: Write failing runtime-session tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('drawing workbench runtime entry', () => {
  beforeEach(() => vi.resetModules());

  it('confirms a restored drawing only on the first entry in this runtime', async () => {
    const session = await import('@/lib/drawingWorkbenchSession');
    expect(session.enterDrawingWorkbench(true)).toBe('confirm');
    expect(session.enterDrawingWorkbench(true)).toBe('resume');
  });

  it('creates when the first entry has no stored drawing', async () => {
    const session = await import('@/lib/drawingWorkbenchSession');
    expect(session.enterDrawingWorkbench(false)).toBe('create');
    expect(session.enterDrawingWorkbench(true)).toBe('resume');
  });
});
```

- [ ] **Step 2: Run the session test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchSession.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the runtime-session helper**

```ts
export type DrawingWorkbenchEntry = 'create' | 'resume' | 'confirm';

let enteredThisRuntime = false;

export function enterDrawingWorkbench(hasExistingDrawing: boolean): DrawingWorkbenchEntry {
  if (enteredThisRuntime) return hasExistingDrawing ? 'resume' : 'create';
  enteredThisRuntime = true;
  return hasExistingDrawing ? 'confirm' : 'create';
}
```

- [ ] **Step 4: Run the session test and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchSession.test.ts`

Expected: both tests pass.

- [ ] **Step 5: Write a failing store reset test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useDrawingStore } from '@/stores/drawingStore';

describe('independent drawing store', () => {
  beforeEach(() => {
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
  });

  it('atomically replaces the library with one new default drawing', () => {
    useDrawingStore.getState().createDocument('旧图纸一');
    useDrawingStore.getState().createDocument('旧图纸二');
    const next = useDrawingStore.getState().replaceWithNewDocument('未命名图纸');
    const state = useDrawingStore.getState();

    expect(Object.keys(state.documents)).toEqual([next.id]);
    expect(state.activeDocumentId).toBe(next.id);
    expect(next.objects.filter((object) => object.visible).map((object) => object.tableRole))
      .toEqual(['bom', 'revision', 'title-block']);
  });
});
```

- [ ] **Step 6: Run the store test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingStore.test.ts`

Expected: FAIL because `replaceWithNewDocument` is not defined.

- [ ] **Step 7: Implement atomic replacement**

Extend `DrawingStore` with:

```ts
replaceWithNewDocument: (name?: string) => DrawingDocument;
```

Implement:

```ts
replaceWithNewDocument: (name) => {
  const document = createBlankDrawingDocument(name);
  set({
    documents: { [document.id]: document },
    activeDocumentId: document.id,
    saveState: 'dirty',
  });
  return document;
},
```

- [ ] **Step 8: Run Task 2 tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchSession.test.ts src/lib/__tests__/drawingStore.test.ts`

Expected: all tests pass.

- [ ] **Step 9: Commit Task 2**

```powershell
git add src/lib/drawingWorkbenchSession.ts src/lib/__tests__/drawingWorkbenchSession.test.ts src/stores/drawingStore.ts src/lib/__tests__/drawingStore.test.ts
git commit -m "feat: add independent drawing refresh session"
```

---

### Task 3: Hydrate Before Initialization and Add the Refresh Decision Toast

**Files:**
- Modify: `src/pages/DrawingWorkbenchPage.tsx`
- Modify: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Consumes: `enterDrawingWorkbench`, `replaceWithNewDocument`, and `useDrawingStore.persist.hasHydrated/onFinishHydration`.
- Produces: refresh confirmation UI and complete transient-state reset.

- [ ] **Step 1: Add failing page contract assertions**

```ts
it('waits for drawing hydration and offers refresh resume or replacement', () => {
  expect(pageSource).toContain('useDrawingStore.persist.hasHydrated()');
  expect(pageSource).toContain('useDrawingStore.persist.onFinishHydration');
  expect(pageSource).toContain('enterDrawingWorkbench');
  expect(pageSource).toContain('replaceWithNewDocument');
  expect(pageSource).toContain('是否丢弃当前制作的图纸？');
  expect(pageSource).toContain('继续制作');
  expect(pageSource).toContain('丢弃并新建');
});
```

- [ ] **Step 2: Run the page contract test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: FAIL because hydration, entry policy, and refresh toast are not wired.

- [ ] **Step 3: Replace eager initialization with hydration-aware entry**

Import `enterDrawingWorkbench`, read `replaceWithNewDocument` from the store, and add:

```ts
const [drawingStoreHydrated, setDrawingStoreHydrated] = useState(
  useDrawingStore.persist.hasHydrated(),
);
const [refreshDecisionOpen, setRefreshDecisionOpen] = useState(false);
const [entryReady, setEntryReady] = useState(false);
const entryHandledRef = useRef(false);

useEffect(() => useDrawingStore.persist.onFinishHydration(() => {
  setDrawingStoreHydrated(true);
}), []);

useEffect(() => {
  if (!drawingStoreHydrated || entryHandledRef.current) return;
  entryHandledRef.current = true;
  const state = useDrawingStore.getState();
  const hasExisting = Boolean(
    state.activeDocumentId && state.documents[state.activeDocumentId],
  );
  const entry = enterDrawingWorkbench(hasExisting);
  if (entry === 'confirm') setRefreshDecisionOpen(true);
  if (entry === 'create') replaceWithNewDocument('未命名图纸');
  setEntryReady(true);
}, [drawingStoreHydrated, replaceWithNewDocument]);
```

Remove the old eager `createDocument` effect. Return `null` while `!drawingStoreHydrated || !entryReady || !drawing`. The explicit state update is required because changing `entryHandledRef` alone does not trigger a render when a same-runtime route remount chooses `resume`.

- [ ] **Step 4: Add transient-state reset and decision handlers**

```ts
const resetTransientState = () => {
  setPast([]);
  setFuture([]);
  setSelectedObjectIds([]);
  setClipboard([]);
  setContextMenu(null);
  setLineEditorObjectId(null);
  setMaterialTableObjectId(null);
  setResourcesOpen(false);
  setTableDialogOpen(false);
  setPdfDialogOpen(false);
  setWizardOpen(false);
  setToolMode('select');
};

const discardAndCreate = () => {
  replaceWithNewDocument('未命名图纸');
  resetTransientState();
  setRefreshDecisionOpen(false);
};
```

Closing the toast and “继续制作” call `setRefreshDecisionOpen(false)` without changing the drawing.

- [ ] **Step 5: Render the accessible action toast**

```tsx
{refreshDecisionOpen && (
  <ActionToast
    role="alertdialog"
    position="center"
    title="当前制作图纸"
    message="是否丢弃当前制作的图纸？"
    secondaryAction={{ label: '继续制作', onClick: () => setRefreshDecisionOpen(false) }}
    primaryAction={{ label: '丢弃并新建', destructive: true, onClick: discardAndCreate }}
    onClose={() => setRefreshDecisionOpen(false)}
  />
)}
```

PDF export success must not affect refresh prompting.

- [ ] **Step 6: Close local editors after Clear**

```ts
const clear = () => {
  applyCommand(clearDrawingCanvas);
  setSelectedObjectIds([]);
  setContextMenu(null);
  setLineEditorObjectId(null);
  setMaterialTableObjectId(null);
};
```

- [ ] **Step 7: Run Task 3 tests and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts src/lib/__tests__/drawingWorkbenchSession.test.ts src/lib/__tests__/drawingStore.test.ts`

Expected: all tests pass.

- [ ] **Step 8: Commit Task 3**

```powershell
git add src/pages/DrawingWorkbenchPage.tsx src/lib/__tests__/drawingWorkbenchUi.test.ts
git commit -m "feat: confirm drawing replacement after refresh"
```

---

### Task 4: Remove Project Context from the Drawing Workbench Header

**Files:**
- Modify: `src/components/layout/AdminShell.tsx`
- Modify: `src/lib/__tests__/drawingWorkbenchUi.test.ts`

**Interfaces:**
- Consumes: `route.id`.
- Produces: route-specific subtitle “独立制图 · 新建后导出”.

- [ ] **Step 1: Add a failing shell contract test**

Load `AdminShell.tsx` and assert:

```ts
const shellSource = readFileSync(
  new URL('../../components/layout/AdminShell.tsx', import.meta.url),
  'utf8',
);

it('shows independent drawing context instead of the active project', () => {
  expect(shellSource).toContain("route.id === 'drawing-workbench'");
  expect(shellSource).toContain('独立制图 · 新建后导出');
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: FAIL because the shell always prefers `currentProjectName`.

- [ ] **Step 3: Implement the route-specific subtitle**

```ts
const contextLabel = route.id === 'drawing-workbench'
  ? '独立制图 · 新建后导出'
  : currentProjectName || '选择项目后可进入完整设计流程';
```

Render `contextLabel` in the subtitle. Keep `showDesignerActions` unchanged; Drawing Workbench is already outside the designer section.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run: `npm.cmd test -- src/lib/__tests__/drawingWorkbenchUi.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/components/layout/AdminShell.tsx src/lib/__tests__/drawingWorkbenchUi.test.ts
git commit -m "fix: remove project context from drawing workbench"
```

---

### Task 5: Full Verification and Browser Acceptance

**Files:**
- Verify all files changed by Tasks 1-4.

**Interfaces:**
- Consumes: completed implementation.
- Produces: test, build, lint, and browser evidence.

- [ ] **Step 1: Run complete automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: tests pass, lint exits zero, build exits zero, and diff check is clean. The existing Vite large-chunk warning may remain.

- [ ] **Step 2: Verify first entry and module switching**

Start Vite on `localhost`. Clear only `standalone-drawing-library`, open `/drawing-workbench`, and verify three visible default tables. Add a text object, navigate to another module, then return. Expected: text remains and no refresh decision toast appears.

- [ ] **Step 3: Verify refresh decisions**

Refresh. Expected: centered toast asks “是否丢弃当前制作的图纸？”. Choose “继续制作”; the added text remains. Refresh again, choose “丢弃并新建”; only the three visible default tables remain.

- [ ] **Step 4: Verify Clear and export independence**

Add a line, add a BOM row, move a default table, then click Clear. Expected: the line disappears and the three tables return to original content and positions. Export PDF, refresh, and verify the discard confirmation still appears.

- [ ] **Step 5: Review repository scope**

Run:

```powershell
git status --short
git log -6 --oneline
```

Expected: only intentional task commits plus pre-existing unrelated untracked files. Do not add `.claude/` or `docs/superpowers/plans/2026-07-15-chinese-errors-wheel-table-interactions.md`.
