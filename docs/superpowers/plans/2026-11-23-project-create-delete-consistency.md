# 项目重复创建与删除后列表回显修复方案

**验收目标**：一次向导提交只创建一个项目。删除成功后，早于删除发出的列表响应不能让该项目重新出现在页面或本地缓存。用户仍可分别创建两个同名项目，并按 ID 单独管理它们。

## 排查依据

2026-11-23 的只读排查发现，`admin` 的两个 `new` 在北京时间 2026-11-20 09:59:16 先后写入云端，相隔约 109 毫秒，ID 不同，版本均为 1。去掉标识和时间字段后，两份设计内容一致。从创建前到 11 月 23 日 13:37，所查 API 日志中，项目删除 RPC 和直接删除项目的 HTTP 请求计数均为 0。现有证据无法还原用户当时的具体操作。

| 已在隔离环境复现的操作 | 结果 | 对应修复 |
| --- | --- | --- |
| 暂停创建请求的响应，在向导最后一步双击「创建项目」，再释放响应 | 发出 2 次创建请求，产生 2 个不同 ID，刷新后有 2 张同名卡片 | 在向导首次提交时锁定本次操作 |
| 先发起列表读取，暂缓返回旧快照，删除其中一个项目，最后让旧快照返回 | 卡片在删除成功后消失，随后又被旧响应写回 store 和缓存 | 删除成功后，使之前发出的列表请求失效 |

实施基线为 `dev` 的 `731d700`。改动范围是前端向导、项目列表状态和对应测试。现有两条 `new` 均保留，复现和验收使用本地模拟数据。

## 1. 防止一次向导重复提交

修改 `src/components/project/ProjectWizard.tsx` 的 `handleComplete`。当前每次调用都会进入 `createProject`，后者为每次调用生成新 ID。

- [ ] 在第一个异步操作之前同步取得提交锁。用 `useRef` 阻止同一向导内重入，用渲染状态显示「创建中…」并禁用创建按钮。提交期间同时禁用上一步和关闭按钮，防止请求在后台完成时跳转。
- [ ] 成功时只执行一次 `replaceDocument` 和 `onComplete`。沿用现有账号及会话校验，切换账号后旧请求即使返回也不能打开项目。明确创建失败时保留名称、模板等输入，显示可操作的错误提示并解锁，让用户主动重试。对于服务端结果未知的网络中断，提示先回列表核对，再决定是否重试。
- [ ] 在 `tests/e2e/designer-project-entry.spec.ts` 复用模拟保存接口，延迟响应后双击。断言创建请求数、请求中的不同项目 ID 数和刷新后的同名卡片数都为 **1**。再用两个独立向导分别创建同名项目，断言产生两个不同 ID。增加一次明确失败后重试成功的用例。
- [ ] 保留 `src/lib/__tests__/projectWizardCreation.test.tsx` 中切换账号或退出后不替换工作区的断言。该测试目前直接调用组件并模拟 React Hooks，引入 `useRef` 时需相应调整测试，优先用真实挂载验证按钮状态。

## 2. 阻止旧列表覆盖删除结果

修改 `src/stores/projectStore.ts` 的 `loadProjects` 和 `deleteProject`。当前列表读取只校验账号会话，删除成功后，同一会话里先前发出的请求仍能提交旧结果。

- [ ] 为列表读取单独记录请求序号。实际发起请求时捕获序号和账号会话，成功、失败两个分支都校验二者，之后才能更新列表、缓存、加载状态或错误。普通并发读取仍共用同一请求，强制刷新以较新的请求为准。
- [ ] 删除开始时记录账号和会话。沿用仓库现有的项目 ID、版本校验与删除结果处理。在确认删除成功或目标已不存在后，仅对仍有效的会话更新状态：使旧列表请求失效，按 ID 从 store 和该账号缓存移除目标，保留其他同名项目。删除失败时保留卡片和重试入口。
- [ ] 处理已失效的在途请求，使下一次正常刷新能发出新请求。旧请求的 `finally` 只能清理自身。若删除成功时列表仍在加载，完成一次有效的新读取以收敛状态，期间持续展示已移除目标的列表。保留现有的账号切换隔离和读取失败时展示缓存的行为。
- [ ] 在 `src/lib/__tests__/projectStore.test.ts` 用手动释放的 Promise 控制顺序。先让读取捕获 `[A, B]`（A、B 同名），再成功删除 A，最后释放旧响应。断言 store 和 `getCachedProjects` 均只保留 B。补测旧请求迟到报错、删除失败、下一次刷新成功，以及删除等待期间切换账号。

## 验证命令

从仓库根目录运行。ESLint 文件列表按最终实际改动增减。

```powershell
npx eslint --max-warnings=0 src/components/project/ProjectWizard.tsx src/stores/projectStore.ts src/lib/__tests__/projectWizardCreation.test.tsx src/lib/__tests__/projectStore.test.ts tests/e2e/designer-project-entry.spec.ts
npx tsc -b
npm test -- src/lib/__tests__/projectWizardCreation.test.tsx src/lib/__tests__/projectStore.test.ts src/lib/__tests__/projectListCache.test.ts src/lib/__tests__/projectListFeedback.test.ts
npm run test:e2e:designer
```

验收记录应包含慢响应下的创建请求数、刷新后的项目 ID 数，以及旧列表响应返回后 store 和缓存中的项目 ID。用独立同名的 A、B 验证按 ID 删除，避免仅凭卡片名称判断结果。

## 可直接复制给 AI 的提示词

```text
请在 D:\wire-harness-designer 实施 docs/superpowers/plans/2026-11-23-project-create-delete-consistency.md，先阅读 AGENTS.md 和当前实现。

修复两个已复现的问题。第一，创建项目接口响应较慢时，双击向导最后一步会创建两个不同 ID。为单次提交加同步防重入保护，展示创建中状态，保留明确失败后的重试和账号切换保护。用户仍可用两个独立向导创建同名项目。第二，删除成功前发出的旧列表响应会把已删除项目写回页面和缓存。沿用按 ID 和版本删除，校验列表请求顺序及账号会话，同时处理成功、失败、下一次刷新与加载状态。

先用可控异步响应复现，再做最小修改。用本地模拟项目验证创建请求数、刷新后卡片数、按 ID 删除后的 store 与缓存，以及同名项目和账号切换。保留云端现有两条 new，本次验证仅用模拟数据。执行方案中的 ESLint、TypeScript、Vitest 和 Playwright 命令，报告实际结果，并按仓库约定只提交本任务改动到本地。
```
