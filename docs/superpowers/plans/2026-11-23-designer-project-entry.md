# 线束设计器统一项目入口实施方案

**目标**　移除侧栏「首页」，将「线束设计器」放到第一项。工程师和管理员从这里管理项目，打开项目后再进入「设计图」或「成品图」。

**实施方式**　复用 `ProjectList` 和现有项目打开、保存、恢复流程。为项目列表使用独立路由，明确区分“正在浏览哪个页面”和“当前打开了哪个项目”。沿用 React 19、TypeScript、Zustand、现有 History API 路由和 Vitest。

**需求依据**　现有首页展示项目卡片、新建和导入入口，设计器父项与「设计图」则指向同一路由。尚未打开项目时，用户要在简易选择器和完整列表之间往返。实施后的界面以本文交互表为准。[可复制的 AI 实施提示词](./2026-11-23-designer-project-entry-prompt.md)

## 用户操作与验收结果

| 用户操作 | 页面、导航与项目状态 |
| --- | --- |
| 工程师或管理员登录默认入口、点击一级「线束设计器」 | 进入 `/designer`。一级项高亮，正文标题为「项目管理」。列表保留项目数、新建、导入、打开、编辑、导出、删除及相应反馈。零项目时也能新建、导入。 |
| 从列表打开项目 A，或完成新建向导 | 进入 `/designer/design?projectId=A`，以实际项目 ID 为准。一级项和「设计图」按层级高亮，显示当前项目及编辑工具。取消向导返回原列表。 |
| 导入设计文件 | 新项目出现在当前账号列表，停留列表。已有活动项目继续保留，与 `createProject(..., { activate: false })` 的现有行为一致。 |
| 在项目 A 中切换设计图、成品图 | 两个子项始终使用 A 的 ID。同一项目内切换视图保留编辑状态。刷新成品图链接后仍进入 A 的成品图。 |
| 从编辑器点击一级「线束设计器」 | 立即浏览列表，地址为 `/designer`，当前会话中的项目和自动保存继续保留。只要 A 仍打开，子项可直接回 A。列表中只高亮父项，编辑器顶栏工具仅在编辑页出现。刷新列表地址仍显示列表。 |
| 从列表改开项目 B，或显式关闭 A | 打开 B 或新建前沿用保存检查。保存失败或存在阻塞切换的冲突时，保留 A 的内容、草稿和反馈，可以回 A 处理。显式关闭沿用原关闭流程，成功后停在列表并收起子项。 |
| 未打开任何项目 | 侧栏只显示一级「线束设计器」。访问裸 `/designer/design` 或 `/designer/product-image` 进入列表。有效的带 ID 直达链接优先恢复指定项目和原视图，恢复期间显示加载态。 |
| 销售、访客及其他工具使用者进入 | 销售仍进入「自动报价」，直接输入项目 URL 也只看到报价。访客访问项目页面时先登录，原有匿名「制作图纸」入口可用。物料库、DWG、3D 等独立入口保留各自行为。 |

## 实施步骤

基线为 `dev` 的 `23c7f18`。开始实施时核对当前工作树，以当时的代码为准。下面三步都属于一次前端导航调整，现有项目数据、数据库和存储无需迁移。

### 1. 定义列表路由和默认落点

- [ ] 在 `src/lib/appRoute.ts` 中将默认路由定义为 `designer-projects`，路径 `/designer`，标题「线束设计器」。为列表使用独立于编辑页 `section: 'designer'` 的分组，例如 `projects`。这样列表不会继承编辑页的 `projectId`、快捷键或专属资源加载。
- [ ] 将 `/`、原 `/home` 和未知路径落到同一个默认列表。复用 `src/hooks/useAppRoute.ts` 的地址规范化逻辑，首次进入用 `replaceState`。列表 URL 始终去掉 `projectId`。两条编辑页 URL 继续支持 `?projectId=`，浏览器前进、后退能恢复 URL 对应页面。
- [ ] 在 `src/lib/__tests__/appRoute.test.ts` 和 `requiresAuth.test.ts` 先写出新预期，再调整实现。覆盖默认地址、列表携带旧 ID、两个编辑视图、登录后返回原带 ID 链接、独立工具的 `file` 和 `modelId` 参数。

### 2. 让父项和子项各自有明确去向

- [ ] 在 `src/components/layout/AdminShell.tsx` 移除「首页」，将有项目权限的「线束设计器」放到第一项，父项指向列表。子项按活动项目 ID 是否存在显示，使用 ID 判断而非项目名称或列表数量。沿用角色过滤、折叠导航的可访问名称和编辑器顶栏视图切换。
- [ ] 在 `src/App.tsx` 显式渲染列表路由并复用 `src/components/project/ProjectList.tsx`。父项点击只导航，两条子项导航才附加活动项目 ID。列表标题由现有组件提供。无活动项目且无目标 ID 的编辑入口归到列表，移除旧的“尚未打开项目 / 前往项目管理”卡片。
- [ ] 列表和编辑器分别判定高亮、顶栏和快捷键。在列表上即使 A 已打开，也不能因按下撤销快捷键而修改 A。用 `src/lib/__tests__/adminShellAccess.test.tsx`、`adminShellViewToggle.test.tsx` 和 `projectRestoreUi.test.tsx` 覆盖普通及折叠侧栏、有无项目、匿名和销售状态。

### 3. 接上项目恢复与保存保护

- [ ] 逐一检查 `src/App.tsx` 中 `handleNavigate`、`handleNewProject`、`handleOpenProject`、`handleCloseProject`、登录/换账号重置和恢复失败的返回地址。浏览列表时保留文档、撤销历史、保存定时器和会话。打开其他项目或新建仍走 `saveBeforeLeavingWorkspace`，显式关闭仍走 `handleCloseProject`。
- [ ] 深链接有 ID 时先等待当前账号的项目列表和加载结果。网络异常应在可重试的列表上反馈，项目不存在或不属于当前账号则回列表并给出不泄露他人项目信息的提示。区分请求失败与读到损坏设计，后者保留原有恢复副本、保存阻止和下载能力。列表加载失败沿用现有重试入口。
- [ ] 保留打开请求序号和账号会话检查。用可控的异步加载验证打开 A 未完成时再打开 B 或换账号，迟到的 A 不得覆盖新状态。验证从 A 编辑页返回列表，修改仍能保存，切换 B 失败后仍能回到 A 处理并重试。
- [ ] 调整 `src/lib/__tests__/projectOpenLifecycle.test.tsx`、`projectSaveLifecycle.test.tsx` 中依赖旧选择器或 `/home` 的断言与测试挂载方式。保留对草稿、保存冲突、恢复原视图、仅显示本人项目及关闭竞态的原有断言；把选择项目的动作改成点击真实的项目卡片。检查 `tests/e2e/release-smoke.spec.ts` 和 `release-performance.spec.ts` 的登录助手及 URL 断言，常规入口改用 `/designer`，另用一例验证原首页地址落点。

## 验证与交付

先运行本次直接影响的测试。在仓库根目录用 PowerShell 执行：

```powershell
npm test -- src/lib/__tests__/appRoute.test.ts src/lib/__tests__/requiresAuth.test.ts src/lib/__tests__/adminShellAccess.test.tsx src/lib/__tests__/adminShellViewToggle.test.tsx src/lib/__tests__/projectRestoreUi.test.tsx src/lib/__tests__/projectOpenLifecycle.test.tsx src/lib/__tests__/projectSaveLifecycle.test.tsx src/lib/__tests__/workspaceExit.test.tsx
npx tsc -b
```

实施改动按明确路径暂存后，对所有新增、修改和重命名的代码执行 ESLint。运行前核对暂存区只包含当前任务的文件。

```powershell
$changedCode = @(git diff --cached --name-only --diff-filter=ACMR -- '*.ts' '*.tsx' '*.js' '*.jsx')
$changedCode
if ($changedCode.Count -gt 0) { npx eslint --max-warnings=0 @changedCode }
```

浏览器冒烟使用本地或已授权的隔离测试环境。现有带账号冒烟会实际修改项目名称，应使用专用测试账号与项目。

```powershell
npm run test:e2e -- tests/e2e/release-smoke.spec.ts
```

- [ ] 浏览器依次验证「默认列表 → 打开 A → 成品图 → 刷新 → 父项回列表 → 子项回 A → 关闭回列表」。记录关键页面 URL、选中项、项目名和保存结果。
- [ ] 检查登录后零项目、导入后留在列表、销售直接访问编辑地址、匿名制作图纸。需要写入的步骤仅使用测试数据。未提供专用账号时，分别报告匿名实测、组件测试覆盖以及跳过的认证用例。
- [ ] 检查差异仅涉及本次路由、页面及相应测试。报告检查命令和结果，按仓库规则完成一次精准本地提交，推送和发布以用户另行授权为准。
