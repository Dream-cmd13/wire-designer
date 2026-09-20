# 保存可靠性与加载性能修复计划

> **For agentic workers:** 使用 superpowers:executing-plans 按任务实施；未经用户选择，不默认启动子代理。步骤采用复现、最小实现、回归验证的顺序。

**Goal:** 消除图纸保存中继续编辑导致的自动保存停摆，补齐退出恢复及账号异步边界，再降低首次加载成本。

**Architecture:** 先在现有 drawingStore 内集中处理图纸编辑版本、串行保存和会话失效，页面只负责展示及操作。应用级保存生命周期覆盖页面卸载；本地草稿仅作按账号隔离的恢复副本，云端仍是正式数据源。性能优化单独验收，先做功能延迟加载，不全面拆分现有模块。

**Tech Stack:** React 19、Zustand、TypeScript、Supabase、Vite 8、Vitest、PowerShell。

**Spec:** 本计划依据当前会话中五项问题的核实结论；退出可靠性约束参考 `SAVE_CONCURRENCY_AND_REALTIME_STRATEGY.md:106-116`，项目规则见 `AGENTS.md`。用户当前只要求计划，不授权本计划自动开始实施或提交推送。

## 全局约束与当前基线

- 保留已经完成的账号重置、图纸加载令牌、项目列表和创建结果检查，不重复重做。
- 项目规模小，优先直接实现；不引入通用任务队列、多人协作、后端版本表或兼容层。
- 不通过 useEffect 同步无条件 setState 解决派生状态；不直接突变外部 DOM/ref 属性。
- 当前 README 已说明七张业务表，第五项不再作为缺陷任务；只按实际新增保存行为更新文档。
- 2026-09-20 构建基线：入口 JS 1937.40 kB / gzip 563.68 kB；CSS 96.49 kB / gzip 15.86 kB。
- 当前四组相关测试 19 项通过，但未覆盖保存中编辑和浏览器退出；不能把已有通过结果当作本计划验收结果。
- 不执行数据库修改、清库、提交或推送；远端 RLS 仅在有可用访问条件时做只读核验，不输出密钥。

## 审查重点

1. 保存期间连续编辑、同毫秒多次编辑：不能靠 updatedAt 判断全部版本，最终最新内容必须写入。
2. 慢请求、失败、重试：同一文档不能出现旧请求晚落库覆盖新内容，也不能假报已保存。
3. A→B、退出登录、A→B→A、同账号连续打开两个项目：旧会话及旧请求不能修改当前工作区。
4. 站内跳转、浏览器后退、刷新、关闭：不因组件卸载取消唯一的保存机会；恢复副本不能跨账号读取。
5. 草稿配额不足、存储不可用、云端另有更新、分块加载失败：明确告知用户，不静默覆盖或丢弃。

## 阶段一：数据可靠性

### 任务 1：修复图纸自动保存闭环（第一优先）

**修改文件：** `src/stores/drawingStore.ts`、`src/pages/DrawingWorkbenchPage.tsx`、`src/components/drawings/standalone/DrawingWorkbenchToolbar.tsx`、`src/App.tsx`。

**测试文件：** 新增 `src/lib/__tests__/drawingStoreAutosave.test.ts`；回归现有 `drawingStore.test.ts`、`drawingStoreHydration.test.ts`。

**接口与约定：** 保留 `saveActiveDocument(): Promise<void>` 供手动保存和账号切换调用；新增 `flushDrawingSaves(): Promise<void>` 用于等待当前会话的待保存图纸。编辑采用单调递增 revision，成功确认采用 savedRevision；时间戳继续服务文档字段，不作为唯一并发依据。

- [ ] 先用延迟 Promise 和假定时器复现：编辑 v1 → 500ms 发起保存 → 请求中编辑 v2 → v1 成功 → 断言 v2 最终保存。修复前该断言必须失败。
- [ ] 增加同毫秒两次编辑、失败后重试、连续多次编辑合并、手动保存与自动保存重叠的测试。
- [ ] 在现有 store 中集中调度：保持从第一次变脏开始 500ms 的调度语义；在途时只记录最新版本，不再发起同文档并发写入。
- [ ] 每次请求捕获 ownerId、会话令牌、documentId、revision 和文档快照。请求成功后仅确认该版本；若仍有新版本，继续补存最新快照。
- [ ] 保存失败后保留 dirty revision 并显示 error，停止紧密自动重试；手动重试或下一次编辑可重新发起保存。不能把失败显示为“已保存”。
- [ ] 移除页面中仅依赖 saveState 的旧自动保存 effect；由应用级生命周期启动/清理保存监听，站内离开不终止待保存工作。
- [ ] 生产工具栏显示“未保存 / 保存中 / 已保存 / 保存失败”，错误提供重试。手动保存入口捕获 Promise 拒绝，避免未处理异常。
- [ ] 审核 replaceWithNewDocument、openDocument、removeDocument：被替换文档的旧任务不得回填新文档状态；删除后不得被待保存任务重新创建。

核心状态流：

```text
编辑 → revision++ → 调度保存
请求中编辑 → revision++，不并发写
成功 → savedRevision = 请求版本
       若 revision > savedRevision，继续保存最新快照
失败 → 保留最新版本和错误，等待重试/下一次编辑
切号/重置 → 会话令牌失效，旧结果不得回填
```

**验收：** 请求期间再编辑后，无需手动操作，最新版本最终落库；最大同时在途请求数为 1；失败可见且可重试；路由切换不造成静默停摆。

### 任务 2：补齐账号及打开项目的异步边界

**修改文件：** `src/App.tsx`、`src/stores/projectStore.ts`、`src/stores/drawingStore.ts`。

**测试文件：** 扩展 `src/lib/__tests__/projectStore.test.ts`、`drawingStoreHydration.test.ts`；新增 `src/lib/__tests__/projectOpenLifecycle.test.tsx`。

**接口与约定：** 项目打开有效性由当前账号、会话代次及打开请求序号共同决定；resetProjects/工作区重置必须使旧请求失效。仅比较账号 ID 不足以覆盖 A→B→A。

- [ ] 复现名称同步 updateProject 等待期间切号，断言旧流程不得导航、修改错误状态或结束新流程的恢复状态。
- [ ] 复现同账号连续打开 P1/P2 且逆序返回、A→B→A 后旧列表返回。
- [ ] handleOpenProject 每个 await 后检查有效性；finally 仅允许对应的当前请求修改恢复状态和历史暂停状态。确保旧请求退出后历史不会永久暂停，也不会提前恢复新请求。
- [ ] 列表请求与创建请求捕获会话代次；重置使旧代次失效。inFlightLoads 只允许对应 Promise 删除自己的条目，不跨会话复用旧 Promise。
- [ ] 图纸 flush 与异步保存结果使用任务 1 的会话令牌；reset 清除调度并防止旧请求结果写入新账号 UI。
- [ ] 浏览器验证 A 建图 → 切 B → 打开工作台，不显示 A 图纸；检查保存请求 owner 与当前账号匹配。
- [ ] 将远端 RLS 核验结果与前端隔离验证分开记录。无远端证据时，不宣称已确认或排除数据库越权。

**验收：** 旧会话和旧打开请求均不再影响当前文档、导航、列表或恢复状态；已有账号创建隔离测试继续通过。

### 任务 3：退出保护与本地草稿恢复

**修改文件：** `src/App.tsx`、`src/hooks/useAppRoute.ts`（仅必要的离开协调）、`src/stores/drawingStore.ts`、`src/repositories/projectRepository.ts`、`src/pages/DrawingWorkbenchPage.tsx`。

**新增文件：** `src/lib/workspaceDraftCache.ts`、`src/lib/__tests__/workspaceDraftCache.test.ts`、`src/lib/__tests__/workspaceExit.test.tsx`。该模块仅负责草稿读写，不负责路由、云端保存或 UI。

**草稿数据契约：**

```ts
type WorkspaceDraft = {
  version: 1;
  ownerId: string;
  kind: 'project' | 'drawing';
  documentId: string;
  revision: number;
  baseUpdatedAt: number;
  savedAt: number;
  document: HarnessConfig | DrawingDocument;
};
// 存储键：wh_draft_v1:<ownerId>:<kind>:<documentId>
// 读取时校验 ownerId、kind、documentId 和相应文档结构。
```

- [ ] 先测试按账号隔离、损坏 JSON、写入配额失败、旧保存成功不能删除较新草稿、云端/草稿内容不同的恢复选择。
- [ ] 编辑时维护恢复副本，采用短合并间隔；visibilitychange(hidden)、pagehide 和 beforeunload 补写最新内存快照。本地存储失败必须可见，不假报“已备份”。
- [ ] 云端确认成功后，仅清理该次确认版本的草稿；若本地已经有更新，保留更新副本。
- [ ] 应用内明确离开/切号操作尽量等待保存完成；失败停留并提示重试。浏览器后退至少保证应用级保存任务继续和草稿存在，避免通过复杂 history 回滚机制强行拦截。
- [ ] beforeunload 仅在 dirty、saving 或 error 且有待保存内容时调用 preventDefault 并设置 returnValue，使用浏览器原生提示；无未保存数据不提示。
- [ ] 不将 emergencySave 当作可靠路径。退出阶段只做 best effort，正式保障来自正常保存、提示及恢复副本；本任务不以增加 keepalive 作为验收标准。
- [ ] 同账号重新进入时读取对应草稿；与云端一致则清理，不一致则提示“恢复本地草稿 / 使用云端版本”，禁止自动覆盖更新的云端内容。明确丢弃后才清理草稿。
- [ ] 切号后旧账号草稿不显示、不自动恢复；同浏览器回到原账号仍可恢复其未保存内容。
- [ ] 用浏览器慢网/断网验证编辑后立即站内离开、刷新、关闭再打开、切号以及恢复选择。记录浏览器版本及无法保证的异常进程终止边界。

**验收：** 正常站内离开不静默丢失；浏览器正常退出存在未保存保护；未确认上云的本地修改可在同账号恢复。浏览器崩溃、强杀、存储禁用等情况不得宣称绝对零丢失。

## 阶段二：加载性能（独立交付）

### 任务 4：按页面与重型功能延迟加载

**修改文件：** `src/App.tsx`、`src/components/materials/ExcelPreviewModal.tsx` 及其直接调用入口、`src/lib/productImageExport.ts`；`vite.config.ts` 仅在真实分块分析表明确有必要时修改。

- [ ] 保存当前构建数字和首页实际初始请求列表；统计入口及静态依赖的总传输量，不只看入口文件名。
- [ ] 对制作图纸、物料库等非首页功能采用 React.lazy + Suspense，保留中文加载提示和失败后可重试入口。
- [ ] 对截图导出等用户触发的重型功能使用动态 import。排查 xlsx 的所有静态引用，避免只改一个入口却仍被其他入口提前引入。
- [ ] 如确需手工分块，按当前 Vite 8 支持的构建配置实施；不机械照搬旧版本 manualChunks 配置，也不单纯提高警告阈值。
- [ ] 构建后验证首页、深链接、首次进入图纸/物料库、Excel 预览、报价导出、截图导出；模拟分块加载失败，确认提示可恢复。

**验收目标：** 首页入口及其立即加载的 JS 总 gzip 较 563.68 kB 基线下降至少 30%（目标不超过约 395 kB）；非当前路由模块不提前请求。若共享依赖导致目标无法达成，报告构成与实测差距，不引入大规模重构硬凑指标。

## 检查命令与交付门禁

每项先运行明确失败的相关回归用例，再实施最小修复；每项修改后执行对应文件 ESLint、类型检查、相关测试。

```powershell
npx eslint <本任务实际修改的代码文件列表> --max-warnings 0
npx tsc -b
npm test -- src/lib/__tests__/drawingStoreAutosave.test.ts src/lib/__tests__/drawingStoreHydration.test.ts src/lib/__tests__/drawingStore.test.ts
npm test -- src/lib/__tests__/projectStore.test.ts src/lib/__tests__/projectWizardCreation.test.tsx src/lib/__tests__/projectOpenLifecycle.test.tsx
npm test -- src/lib/__tests__/workspaceDraftCache.test.ts src/lib/__tests__/workspaceExit.test.tsx
```

阶段一改动涉及应用保存和导航生命周期，交付前运行完整 `npm test`、`npm run build` 和浏览器关键流程；阶段二再运行构建与相应功能回归。必要时使用 localhost 进行自动页面验证。

每项输出：实际改动、执行命令与结果、浏览器验证证据、未验证项、剩余风险。新增保存契约稳定后，同步 README 与保存策略文档；不重写已正确的七表数据模型。

## 建议执行顺序

1. 任务 1：先消除最常触发的图纸持续漏存。
2. 任务 2：在新增保存机制之上补齐会话与请求失效，避免草稿及退出逻辑放大切号问题。
3. 任务 3：补齐退出保护和恢复，完成数据可靠性验收。
4. 任务 4：独立优化性能，方便比较构建数字和回滚。

本计划不安排自动 Git 提交。用户确认开始实施后，默认在当前会话逐项执行，每项完成必要验证；需要提交时再遵循用户明确授权和精准暂存规则。
