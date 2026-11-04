# 项目风险修复与上线验收实施方案

> 实施执行说明：后续实施时按 `superpowers:executing-plans` 逐项执行并更新复选框；只有用户明确选择代理协作时才采用 `superpowers:subagent-driven-development`。本次仅交付方案，不代表已实施、已部署或已授权写入远程数据库。

**目标：** 修复本轮审查发现的六项问题，补齐真实交互测试、服务端类型检查和上线验收，在保留现有数据的前提下建立可靠的编辑、保存、同步与发布流程。

**方案：** 保留 React、Zustand、Supabase 现有架构。局部修复保存状态联动；为文档写入增加数据库原子版本校验；将成本同步改为完整校验后事务新增或更新；统一检查入口并修复 Excel 依赖。无需实时协作、事件总线、微服务或全仓重构。

**技术栈：** React 19、TypeScript、Vite、Zustand、Supabase/Postgres、Vitest、PGlite、PowerShell；真实组件测试按任务引入 Testing Library/jsdom；Edge Function 使用 Deno 检查。

**需求来源：** 2026-10-14 当前对话的项目审查结果及用户“给出全部解决问题修复的实施方案 md 文档”要求；执行时同时遵守仓库 `AGENTS.md`。本文件即此次修复的范围与验收依据。

## 一、约束与基线

- 现有账号、项目、图纸、价格、成本分析、来源文件必须保留。禁止清库、删表重建或用种子覆盖现有库完成升级。
- 本方案中的新增文件、接口、命令和 SQL 均为计划项，未创建前不得视为已经可用。
- 不读出或记录密钥、密码、令牌；不借用其他项目测试账号。
- 不自动执行提交、推送、发布、远程 SQL、远程文件删除。实际执行这些操作须有明确授权及准确目标。
- 每个代码任务完成后：修改文件 ESLint 0 错误、0 告警；`npx tsc -b` 通过；运行受影响测试。最终执行完整测试与构建。
- 按现有项目规模保持简单；允许保留数据所需迁移，不增加没有需求依据的兼容层。
- 方案实施前重新核实目标代码和工作区差异。已被其他任务修复的问题只验证，不重复改动。

### 本轮实际验证结果

| 项目 | 结果与解释 |
|---|---|
| 工作区 | 审查结束时没有受版本控制文件的修改 |
| `npm test` | 114 个测试文件、952 项测试通过 |
| `npx tsc -b` | 通过，但不能代表所有服务端和 Edge Function 入口均已检查 |
| 限定业务目录 ESLint | 通过，0 错误、0 告警 |
| 部署脚本对应 ESLint | 通过，不能把全量 lint 失败直接等同于部署失败 |
| `npm run lint` | 失败，587 个错误，主要来自临时副本与 TSConfig 根目录歧义 |
| `npm run build` | 通过；主入口约 594.35 kB、gzip 169.51 kB；存在大分包和 WASM 依赖兼容提示 |
| `npm audit --omit=dev --json` | `xlsx` 一个高危依赖，涉及两条漏洞公告 |
| 保存 Effect 隔离验证 | `saving`、`error` 被改为 `dirty`；选中状态及视口被清空 |
| 成本清理 SQL 隔离验证 | 不在本次解析结果中的已有方案及自动建档物料被删除 |
| 未完成 | 真实登录浏览器走查、远程迁移/RLS 状态核对、实际备份恢复演练 |

> 上表为方案实施前的基线。实施后的实际命令、结果、性能数据与未验证项见 `docs/release-validation.md`。

### 风险与任务对应

| 编号 | 问题/完善项 | 优先级 | 任务 |
|---|---|---|---|
| R1 | 保存状态触发整文档替换，覆盖错误并重置编辑状态 | P1 | T2 |
| R2 | 成本同步部分解析失败后继续清理，缺少整体事务 | P1 | T3 |
| R3 | `xlsx 0.18.5` 已知高危漏洞 | P1 | T4 |
| R4 | 多标签页/多设备文档保存静默覆盖 | P1（数据保护） | T5 |
| R5 | 全量 ESLint 扫描临时目录导致失败 | P2 | T1 |
| R6 | 初始化说明仍引导清库重建，与数据保留要求冲突 | P2 | T7 |
| Q1 | 页面测试 mock Effect 或只检查源码，未覆盖真实生命周期 | P2 | T2、T5、T8 |
| Q2 | 服务端与云函数类型检查覆盖不足 | P2 | T6 |
| Q3 | 大分包/WASM 提示与运行性能缺少实际测量 | P3 | T8 |
| Q4 | 线上权限、迁移及备份状态尚未核实 | 上线必验 | T8 |

### 重点复核场景

1. 编辑过程中保存失败、延迟成功及用户继续修改：错误必须可见，新编辑不可被旧响应标记为已保存（T2）。
2. 单个 Excel 解析失败、源文件缺失或导入中途报错：既有数据必须不被删改或部分提交（T3）。
3. 恶意、超大、损坏 Excel：失败可控，不阻塞整个编辑会话，不污染全局对象（T4）。
4. 两窗口同时编辑、旧窗口恢复草稿、云端已删除：不得静默覆盖、误删他人草稿或复活旧文档（T5）。
5. 初始密码、权限撤销、异步切换账号和迁移未安装：不得放宽访问，必须保留待保存内容并明确提示（T5、T6、T8）。

## 二、实施顺序与文件边界

推荐顺序：**T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8**。各任务独立交付可验证结果，T2 的真实组件测试基础由 T5 复用；T7 汇总已经确定的接口和命令；T8 是整体上线门禁。

本方案放在一个文档中便于完整验收，但按任务分批修改，避免把依赖升级、数据迁移和交互修复混成一个不可定位的大改动。未获提交授权时只保留工作区改动。

| 任务 | 主要修改文件 | 计划新增文件 |
|---|---|---|
| T1 | `eslint.config.js`、`package.json`、`scripts/deploy.mjs` | 无 |
| T2 | `src/App.tsx`、`src/stores/harnessStore.ts`、相关测试及测试依赖 | `src/lib/__tests__/projectSaveLifecycle.test.tsx` |
| T3 | `scripts/sync-cost-analyses.mjs`、`scripts/import-cost-analyses.mjs`、现有种子及解析测试、`package.json` | `scripts/lib/costAnalysisSync.mjs`、`scripts/lib/costAnalysisSync.test.mjs` |
| T4 | `package.json`、`package-lock.json`、实际受影响 Excel 读写入口和测试 | 按基准结果决定是否增加解析 Worker；不预先创建通用 Excel 框架 |
| T5 | 两个文档 repository、两个 store、`App.tsx`、`DrawingWorkbenchPage.tsx`、草稿缓存、相关类型与测试 | `supabase/updates/20261014_document_revision.sql`、`src/lib/documentWriteError.ts`、`src/lib/__tests__/documentRevisionSql.test.ts` |
| T6 | TS 配置、`package.json`、`scripts/deploy.mjs`、`scripts/build-quote-function.mjs`、需要修正的服务端代码 | `tsconfig.server.json`、`supabase/functions/deno.json` |
| T7 | `README.md`、`supabase/sql/README.md`、`docs/deployment.md`、`docs/account-password.md`、成本同步说明、重置入口 | `docs/data-preserving-upgrades.md` |
| T8 | 必要的浏览器回归脚本及发布说明；性能确有问题才改导入边界 | `tests/e2e/release-smoke.spec.ts`、`playwright.config.ts`、`docs/release-validation.md` |

## 三、实施任务

### T1：修复并统一静态检查范围

**依据：** `eslint.config.js` 只忽略 dist/generated/coverage/worktrees，未忽略 `.tmp`、`tmp`；全量扫描临时副本产生配置根目录歧义。

**接口：** 保留 `npm run lint`，使它成为文档和部署共用的静态检查入口；命令附带 `--max-warnings=0`。

- [x] 保存当前全量 lint 失败摘要，确认问题仍是临时目录污染，不把所有错误当成业务缺陷。（587 个解析错误，全部来自 `.tmp/mold-commit-check` 嵌套 tsconfig 造成的 tsconfigRootDir 歧义）
- [x] 在全局忽略中增加 `.tmp`、`tmp` 及明确的工具输出目录；不要通过忽略 `src`、`server`、`tests`、`supabase/functions` 来绕过检查。
- [x] 在 TypeScript parserOptions 中显式设置仓库根目录，避免嵌套配置影响根目录推断。
- [x] 统一 `package.json` 和部署入口使用的范围。实际涉及的维护脚本补齐 Node globals；不盲目对所有历史脚本扩张规则。
- [x] 分别运行 `npm run lint` 和部署使用的同一入口，确保临时目录存在时仍为 0 错误、0 告警。
- [x] 执行 `npm test -- tests/deploy.test.ts`，确认门禁失败时停止后续打包/发布；不运行真实部署。

**完成条件：** 全量 lint 命令稳定通过；临时文件保留原样；真实代码检查未被禁用。

### T2：修复保存状态与目录同步耦合，加入真实生命周期回归

**依据：** `src/App.tsx:319` 的 Effect 依赖保存状态，调用会重置状态的 `replaceDocument`。

**实施边界：** 保留 `replaceDocument` 用于打开项目、显式导入、切换文档等现有语义；目录刷新走独立、幂等的同步动作，不复用整文档替换。

**计划接口：** `useHarnessStore.getState().refreshCatalogReferences(): void`。更新目录引用与派生图片时保留 selection、canvasViewport、twoDViewport 及现有 saveState；没有实际变化时不写 store。目录同步不得覆盖用户填写的线长、接线、标注等业务字段；只有引用失效等确实需要用户修复的情况才显示问题。

- [x] 增加与 React 19 兼容的 `@testing-library/react`、`jsdom` 开发依赖，测试文件单独启用 jsdom，不将全部 PGlite/解析测试改到 DOM 环境。（另显式加入 `@testing-library/dom`）
- [x] 新建真实组件回归，挂载保存生命周期，mock 网络/目录边界，不 mock `useEffect`、`useState` 或 Zustand 订阅。（`src/lib/__tests__/projectSaveLifecycle.test.tsx`，仅 mock 布局组件、Canvas 与 supabase 客户端）
- [x] 先验证下列测试在当前代码上失败：编辑一次后选中对象及视口保持；保存请求挂起时保持 saving；请求失败后保持 error 且错误可见；状态变化不会再次做目录替换。（旧代码下选中/视口被重置；失败后 error 被改回 dirty 并进入无限保存循环导致事件循环阻塞，测试无法完成）
- [x] 修改目录同步触发条件：只响应有效目录快照变化和文档切换；使用现有快照标识或对象引用，禁止依赖 `saveState.status` 驱动。
- [x] 实现 `refreshCatalogReferences`，复用既有目录对齐函数，避免创建一份并行目录模型。对同步结果无变化的情况保持文档引用。
- [x] 核查历史记录订阅：目录派生刷新不能制造伪编辑记录、清空重做栈或把保存失败变成新的自动重试。（`catalogSyncCount` 标记来源，历史订阅跳过目录刷新）
- [x] 验证保存期间继续编辑时，旧响应只确认它对应的快照，新编辑保持 dirty 并随后保存；对同毫秒编辑使用明确的本地递增修订号或快照身份，不能只依赖 `Date.now()` 相等判断。（改用 config 对象身份确认；`markDirty` 在快照不一致时恢复等待保存）
- [x] 保留失败后的显式重试入口；网络失败不形成无限循环；账号或项目切换后的旧响应不能改变新上下文。
- [x] 执行局部测试及门禁：

```powershell
npm test -- src/lib/__tests__/projectSaveLifecycle.test.tsx src/lib/__tests__/projectOpenLifecycle.test.tsx src/lib/__tests__/workspaceExit.test.tsx src/lib/__tests__/harnessStoreViewport.test.ts
npx eslint src/App.tsx src/stores/harnessStore.ts src/lib/__tests__/projectSaveLifecycle.test.tsx --max-warnings=0
npx tsc -b
```

**完成条件：** 错误状态可持续展示；保存不改变用户视口/选择；目录正常刷新；撤销重做和新编辑不丢失。真实浏览器走查列入 T8。

### T3：成本同步改为保留数据的完整校验与事务写入

**依据：** 解析失败只输出日志；之后按剩余料号清理数据库；后续逐项更新无整体事务。种子生成器包含相同的删除逻辑。

**计划接口：** 在 `scripts/lib/costAnalysisSync.mjs` 集中纯校验与数据库写入逻辑，脚本入口继续负责参数、文件及连接管理。

- `validateCostAnalysisBatch(analyses, sourceFiles, parseFailures, parseWarnings)`：无返回值，校验不通过抛错。
- `applyCostAnalysisBatch(client, analyses, fileUrlMap)`：在单个事务中新增或更新，返回 `{ createdCount, updatedCount }`；任何失败回滚；不删除任何未出现在源文件中的已有记录。

- [x] 先写 PGlite 隔离测试：两个已有方案，仅解析到一个时，另一个仍完整存在；中途第二条写入失败时，第一条写入回滚。（`scripts/lib/costAnalysisSync.test.mjs`，9 项）
- [x] 完整扫描并解析后才允许远程写入。任一文件读取/解析失败、结构不完整告警、料号重复、空输入均以非零退出码中止，不能先上传再报告失败。
- [x] 对本次预览记录源文件列表、文件哈希、解析数量和计划新增/更新列表。`--commit` 执行前再次确认输入未变化；明确输出目标项目标识但不输出密钥。
- [x] 删除正常同步和正常种子生成路径中的 `buildStaleCleanupStatements`、`NO_DRAWING_MATERIAL_CLEANUP_SQL` 调用；种子只新增或更新，保留来源之外的数据。（两个函数已删除，种子已本地重新生成并审查差异：仅删除 29 行删除语句）
- [x] 旧料号重命名如确需处理，单独提供有准确旧新映射的迁移，保留主键、图纸绑定和引用；不能把“本地没出现”当作删除授权。（当前无双轨旧命名来源，无需迁移；保留旧记录由同步逻辑保证）
- [x] 将数据库写入包进 `BEGIN/COMMIT`，异常 `ROLLBACK`，连接在 `finally` 关闭；预期计数/数据约束在提交前检查。
- [x] 将 `pg` 声明为脚本所需的直接开发依赖，去掉对 `.tmp/db-runtime/node_modules/pg` 的隐式依赖；连接使用提供方可信 CA，禁止默认关闭证书验证。（`buildPgSslConfig` 默认 `rejectUnauthorized: true`，可用 `SUPABASE_DB_CA_CERT` 指定 CA）
- [x] 来源文件采用不可覆盖的版本对象路径，例如内容哈希。先成功上传版本对象，再在数据库事务中更新引用；失败时不删除旧对象，也不自动清理孤立新对象，输出后续核查清单。
- [x] 保留 `son_price_low`、`son_unit`、CRM 来源名称及既有图纸字段的现有保护规则；明确测试 null、0、六位小数以及幂等重复同步。
- [x] 更新 `scripts/import-cost-analyses.test.mjs` 中过去要求删除的测试，转为数据保留断言。只在确认本地 Excel 来源完整后重新生成受控种子并审查差异，禁止执行到远程。（删除断言实际位于 `finishedHarnessMaterialsSql.test.ts`，已改为禁止 delete 的数据保留断言）
- [x] 运行测试：

```powershell
npm test -- scripts/lib/costAnalysisSync.test.mjs scripts/import-cost-analyses.test.mjs src/lib/__tests__/finishedHarnessMaterialsSql.test.ts
npx eslint scripts/sync-cost-analyses.mjs scripts/import-cost-analyses.mjs scripts/lib/costAnalysisSync.mjs scripts/lib/costAnalysisSync.test.mjs --max-warnings=0
npx tsc -b
```

**完成条件：** 部分来源失败时零远程写入；数据库失败时整批回滚；遗漏方案不删除；旧来源文件可恢复；连续运行不新增重复记录。实际同步前先完成第五节备份要求。

### T4：修复 Excel 依赖漏洞并保持业务精度

**公告：** GHSA-4r6h-8v6p-xvw6（原型污染，受影响版本 `<0.19.3`）、GHSA-5pgg-2g8v-p4x9（ReDoS，受影响版本 `<0.20.2`）。版本阈值来自本轮审计，不代表 `0.20.2` 仍是实施日推荐版本。

**决策：** 优先保留 SheetJS API，使用实施日官方可信分发渠道中已修复上述问题的稳定版本，固定精确版本与 lockfile integrity；先核实来源、许可证及已知公告。若官方修复发行版不可用或回归不通过，再选择替代库并重新评估 `bookFiles`、图片、公式和格式支持，不盲目执行 `npm audit fix --force`。

- [x] 确认所有浏览器和 Node 脚本的 `xlsx` 入口，特别是价格导入、Excel 预览、成本解析、报价导出、图纸材料导出和 SSF 格式化。（`priceImport`、`ExcelPreviewModal`、`quoteExport`、`drawingMaterialExport`、`costNumberFormat`、成本解析脚本）
- [x] 在升级前固定业务金样：价格 0/null/六位小数、中文 Sheet、合并单元格、公式缓存值、嵌入图片、金额显示精度、报价导出再读入。（由既有测试覆盖，升级后全部通过）
- [x] 更新依赖与锁文件，不通过仅修改包名或忽略审计来消除报告；记录新版本来源及两条公告不再适用的依据。（`xlsx@0.20.3` 官方 CDN 固定 URL；GHSA-4r6h-8v6p-xvw6 修复于 0.19.3、GHSA-5pgg-2g8v-p4x9 修复于 0.20.2，`npm audit --omit=dev` 降为 0 条）
- [x] 回归现有 20 个工作簿/43 个方案基线；如实际来源数量已变化，按已确认的新清单验证，不默默改变业务口径。（43 个方案与提交种子逐字节一致）
- [x] 保留价格导入 5 MB、10000 行/5 列的既有约束。预览入口与服务端桶限制保持一致，并在解析前检查大小；对解压后尺寸、Sheet 范围及损坏压缩包补边界测试。（新增 `src/lib/zipBudget.ts` 与 `excelParseGuards.test.ts`）
- [x] 对浏览器解析做有界压力测试。超过交互预算（主线程连续阻塞超过 200 ms）则将该重解析入口移入 Worker，并提供取消/超时；不能只把 `async` 函数当作后台执行。（实测最大工作簿解析约 482 ms，超预算；`ExcelPreviewModal` 已改为 `src/workers/excelPreview.worker.ts` 解析，带 30 s 超时与卸载取消）
- [x] 使用可信公告回归样本或可控的最小异常样本，放在可超时终止的子进程/Worker 验证；不在主测试进程无限执行恶意文件。（ZIP 解压体积预检 + 手工构造的最小高压缩比样本，同步、有界）
- [x] 执行依赖审计和 Excel 相关测试：

```powershell
npm audit --omit=dev --json
npm test -- scripts/import-cost-analyses.test.mjs src/lib/__tests__/pricing.test.ts src/lib/__tests__/pricingSettingsImport.test.ts src/lib/__tests__/excelEmbeddedImages.test.ts src/lib/__tests__/drawingMaterialExport.test.ts src/lib/__tests__/serverQuote.test.ts
npx tsc -b
npm run build
```

**完成条件：** 两条公告已解决，有可核实版本依据；输入输出与金样一致；新的外部分发包即使不在 npm 审计库中也不得仅凭“0 漏洞”判断安全。

### T5：项目与图纸保存的并发控制、草稿保护

**依据：** 项目按 ID 无条件 update，图纸 upsert；localStorage 草稿以账号/文档共用键存储，仅按本地 revision 清理，多窗口修订号不具备全局可比性。

**数据方案：** 为 `projects`、`drawings` 各新增 `revision integer not null default 1`；版本由数据库触发器维护，成功更新递增。对外写入只通过带期望版本的 RPC，撤销 authenticated 对这些表的直接 INSERT/UPDATE/DELETE 权限，保留 SELECT 和原 RLS，防止旧客户端绕过版本检查。使用 SECURITY INVOKER RPC 时需保留相应表权限；本方案选择严格校验身份的 SECURITY DEFINER RPC，由函数逐项验证 `auth.uid()`、owner、工程师/管理员角色及强制改密状态，固定 `search_path` 并撤销 PUBLIC/anon 执行权限。

**计划契约：**

```ts
type DocumentVersion = { revision: number; updatedAt: string };
type WriteFailureCode = 'conflict' | 'missing' | 'forbidden' | 'network';
// 新建期望版本为 null；更新必须提供读取到的版本；禁止不带版本的盲写。
// 项目/图纸各自使用其既有 payload 类型，不引入通用业务文档框架。
```

- SQL RPC：`save_project_document(project_id uuid, expected_revision integer, project_payload jsonb)`、`save_drawing_document(document_id text, expected_revision integer, document_payload jsonb)`，返回数据库 revision 和 updated_at。
- 删除 RPC：`delete_project_document(project_id uuid, expected_revision integer)`、`delete_drawing_document(document_id text, expected_revision integer)`，检测旧版本；不返回其他用户文档存在性。
- `ProjectLoadResult` 的成功分支及图纸加载结果携带 `DocumentVersion`。版本元数据放在 repository/store 中，不混入用于导入导出的业务 JSON。
- `DocumentWriteError` 放在 `src/lib/documentWriteError.ts`，携带 `WriteFailureCode`；数据库冲突映射为 conflict，不作为普通网络错误自动重试。

- [x] 先写 `documentRevisionSql.test.ts`：两个会话读取 revision=1，A 保存得到 2，B 持 1 保存失败且数据库内容仍是 A；版本递增由数据库完成。（PGlite 隔离库，7 项）
- [x] 在隔离数据库验证迁移前后每张表行数、主键集、业务 JSON 哈希及 owner 完全相同；迁移可重复执行；原有价格、角色、密码策略不变。（projects/drawings 行数、主键、owner、config/document 哈希、描述哈希均一致；迁移重复执行通过）
- [x] SQL 更新使用 `WHERE id = ... AND owner_id = ... AND revision = expected_revision` 原子条件，不能先查询再无条件更新；创建只 INSERT，冲突不转为覆盖。
- [x] 元数据改名、描述更新与完整内容保存都走同一版本规则。新增时校验 JSON 文档 ID 与行 ID 一致，避免列表显示和保存目标分离。（调整说明：另设 `update_project_metadata` RPC，只改行字段不覆盖文档内容，避免元数据保存用陈旧内容覆盖未保存编辑）
- [x] repository 返回真实数据库版本；store 在请求成功后更新基线，即使还有新编辑也必须更新下一次保存用的云端基线。只有对应本地快照才标记 saved。
- [x] 列表缓存不作为保存版本的最终依据：打开时读取内容及版本；无版本的旧缓存触发刷新，不伪造 revision=1。（`load` 读取 revision/updated_at）
- [x] 冲突时暂停该文档自动保存，保留内存和本地副本。提供“下载本地副本”“读取云端版本”“另存为新文档”；读取云端前明确告知替换本地，默认不提供无条件强制覆盖。（项目与图纸页面均已实现，项目侧有真实组件回归）
- [x] 草稿记录新增窗口实例标识、唯一 draftId、本地修订号及 baseServerRevision。写入使用独立实例键，保存成功只删除属于本次实例且确认已保存的草稿；不能按另一个窗口的 revision 删除。
- [x] 保留并识别现有 v1 草稿。恢复前核对云端版本；无法确认基线时保留为待人工选择的恢复候选，不自动覆盖。此迁移用于保留已有用户数据，不新增长期双轨逻辑。
- [x] 验证当前图纸删除入口是否实际可达；如可达，删除完成前保留本地文档和草稿，失败恢复或保持可重试状态；不要只设置 error 后把文档丢出 store。若入口不可达，仅修复本次新删除契约，不扩展产品功能。（核实：UI 无删除入口，删除不可达；`removeDocument` 已按新版本契约修复，删除失败不清理草稿并保持 error 可重试）
- [x] 新增真实生命周期/双页面回归：B 冲突后草稿仍在；A 保存不能清理 B 草稿；远程删除后旧图纸保存不会 upsert 复活；切换账号不串写；断网恢复不自动覆盖。
- [x] 将新库定义与保留数据迁移对齐，旧客户端在权限切换后明确保存失败而不是无保护写入。通过短维护窗口升级前端并提示刷新，不设计长期双写兼容。
- [x] 运行局部与安全回归：

```powershell
npm test -- src/lib/__tests__/documentRevisionSql.test.ts src/lib/__tests__/projectRepository.test.ts src/lib/__tests__/projectStore.test.ts src/lib/__tests__/drawingDocumentRepository.test.ts src/lib/__tests__/drawingStoreAutosave.test.ts src/lib/__tests__/workspaceDraftCache.test.ts src/lib/__tests__/projectSaveLifecycle.test.tsx src/lib/__tests__/passwordSecuritySql.test.ts src/lib/__tests__/pricingSecuritySql.test.ts
npx tsc -b
npm run lint
```

**完成条件：** 并发第二次写入明确冲突；云端和本地编辑均可找回；旧客户端不能绕过门禁；权限不扩大；所有现有业务数据保留。

### T6：补齐服务端及 Edge Function 类型门禁

**依据：** 当前 `tsconfig.app.json` 显式 include 为 src，node 配置仅 include Vite；部分被测试引用的服务端模块可能间接进入检查，但不等于服务端全部入口均被覆盖。

**接口：** 新增 `npm run typecheck:server`、`npm run typecheck:functions`、`npm run typecheck`。聚合命令先执行现有 `tsc -b`，再执行 server 与函数检查。

- [x] 增加 `tsconfig.server.json`，明确包含 `server/**/*.ts`，继承适合 Node 的模块/路径配置；不通过排除报错的业务文件获取通过。
- [x] 增加函数侧 Deno 配置，固定运行工具版本并处理 npm 依赖。`quote/engine.js` 是生成物，先 `npm run quote:build` 再检查 quote 入口；生成物不提交。（`deno@2.9.6` 固定为开发依赖；`supabase/functions/deno.json` + `deno.lock`；`engine.js` 已加入 .gitignore 并解除版本跟踪，本地生成文件保留；类型检查前自动重新构建）
- [x] 显式检查 `supabase/functions/account-password/index.ts`、`supabase/functions/quote/index.ts` 和 `_shared/passwordService.ts`，修复真实接口类型问题，不靠整文件 `@ts-nocheck`。
- [x] 将聚合类型命令接入部署预检，避免仅前端 `build` 通过时漏掉服务端问题；无 Deno 运行工具时预检应明确失败并给出安装说明，不静默跳过。
- [x] 用临时、可撤回的服务端类型错误验证命令确实能失败，验证后恢复且不纳入提交；确认函数入口类型错误同样失败。
- [x] 执行：

```powershell
npm run typecheck
npm test -- src/lib/__tests__/serverQuote.test.ts server/passwordService.test.ts tests/deploy.test.ts
npm run lint
```

**完成条件：** 本地和部署预检使用同一完整门禁；前端、服务端、云函数检查结果分别可见。

### T7：统一数据保留文档与维护脚本行为

- [x] 修改 README 与 SQL 执行说明，删除“当前测试阶段只维护清库重建路径”的现行指导，改成现有库保留数据升级。
- [x] 新库流程不包含 reset；列出 schema、权限、必要 updates、函数构建/部署的准确顺序，尤其是价格权限、强制改密与文档版本控制。
- [x] `docs/data-preserving-upgrades.md` 记录各迁移的前置条件、影响表/函数/权限、备份位置要求、行数/哈希校验与回滚边界。
- [x] 成本同步文档明确默认预览、完整校验后新增或更新、不因来源缺失删除；旧命名转换独立授权。
- [x] 移除普通 package scripts 中容易误执行的远程 reset 快捷入口，或改为默认只读预览且必须给出准确目标和显式确认参数；保留历史脚本时加开发专用隔离说明，不执行或删除已有资产。（移除 `supabase:reset-project-assets` 入口；`reset-project-assets.mjs` 强制 `--confirm-delete-bucket project-assets` 并输出目标项目）
- [x] 重置 SQL 如保留，仅用于用户明确授权的空白/可丢弃开发实例，不列为升级步骤，不允许更新脚本引用它。
- [x] 修正部署文档中 SQL、函数、前端的职责：前端 deploy 不等于后端已升级；quote 部署前必须生成新 engine。
- [x] 检查所有文档命令的脚本名称与相对路径，区分“本地检查命令”和“需授权的远程执行命令”。（清点 README/文档中的 npm 命令全部存在；历史方案文档已加数据保留横幅）

**完成条件：** 新接手人员按默认说明操作不会清空现有库；文档与最终脚本行为一致。纯文档改动只需路径、链接和差异检查，不重复全量运行代码测试。

### T8：整体回归、浏览器验收与性能验证

**实现边界：** 复用仓库已有浏览器运行方式；自动化文件需登录时仅从本项目专用环境变量读取账号。新增固定 Playwright 开发依赖与配置时，同步 ESLint 范围。Vitest 排除 `tests/e2e/**`，浏览器测试由 `npm run test:e2e` 独立执行，避免两种 runner 混跑。

- [x] 完成统一本地门禁：`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、生产依赖审计；与本轮 952 项基线比较，减少或跳过测试必须说明理由。（118 文件 / 992 项通过；生产审计 0 漏洞；主入口 gzip +1.85%）
- [ ] 用专用测试账号做真实浏览器走查；本地访问被拒绝时使用 `localhost`。登录信息不写进仓库、报告或截图。（未验证：无本项目专用测试账号，`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` 未提供）
- [x] `release-smoke.spec.ts` 覆盖下表核心流程；未具备账号或隔离环境的项目明确记为未验证，不冒称通过。（匿名流程 6 项通过；登录相关 3 项按环境变量跳过）
- [x] 采集首页冷加载、设计器首次进入、DWG 首次打开、Excel 预览的资源大小和耗时；记录浏览器、网络/CPU 条件与样本文件，至少取三次结果的中位数。（首页与制作图纸各 3 次中位数已记录于 `docs/release-validation.md`；DWG/Excel 需登录，标注未测）
- [x] 主入口体积以本轮 gzip 169.51 kB 为参考，若增长超过 10% 必须说明来源；该阈值用于回归调查，不通过调高 Vite 告警阈值掩盖问题。（当前 172.65 kB，+1.85%）
- [x] 仅在测量确认首页无关依赖提前加载或交互阻塞时调整动态导入/Worker；不为了消除 500 kB 提示盲目拆 chunk。保留 DWG WASM 按需加载与避免重复资产的现有设计。（Excel 预览解析 482 ms 超预算，已移入带超时/取消的 Worker；其余保持现状）
- [ ] 在生产构建预览中验证 DWG 解析、缩放、图层及导出，确认浏览器外部化 `module` 提示未进入实际失败路径；如失败按具体依赖路径修复。（未验证：DWG 源文件在私有桶且需登录；生产预览仅确认页面级登录引导）
- [ ] 经远程只读核查后记录实际迁移、RPC、RLS、角色、Storage 私有桶与函数部署状态；本地 PGlite 测试不能替代线上配置验证。（未执行：未获远程只读授权）
- [x] 将实际命令、结果、环境、版本、未验证项及证据位置写入 `docs/release-validation.md`，不填入假定结果。

| 场景 | 必须达到的行为 |
|---|---|
| 项目新建→编辑→自动保存→刷新 | 内容一致，选中/视口在保存过程中不跳变 |
| 保存时断网→继续编辑→重试 | 错误持续可见，最新内容最终写入且草稿只按已确认快照清理 |
| 同账号双标签/双设备编辑 | 后提交的旧版本被拒绝，两个版本均可保留 |
| 图纸新建→保存→恢复→导出 | 图元、表格、字体、图片及 PDF 结果正确 |
| 图纸删除失败/旧页面续写 | 有明确结果，不静默丢失本地内容或复活旧记录 |
| 业务员/工程师/管理员 | 只获得对应可见字段和写入权限，直接 API 请求同样受限 |
| 初始密码/管理员重置 | 改密前业务被阻断，改密后恢复；现有账号数据未丢失 |
| 报价 | 数量边界、单/双头、内模、沾锡、五档线长及超过 5m 人工核价结果正确 |
| Excel 导入/预览/导出 | 正常文件精度/图片/格式保持；异常文件失败可控 |
| 成本同步失败注入 | 未提交数据库变化，旧来源仍可访问 |
| 后端版本未就绪 | 发布预检或应用明确失败，不降级为无版本写入 |

**完成条件：** 必验项有实际证据；未完成项明确阻止对应上线结论；性能优化只有测量证明必要时实施。

## 四、统一测试策略

1. 修复前先增加能复现对应错误的行为测试，验证失败原因正确；修复后运行同一测试。
2. Store/repository 测试覆盖状态转换、迟到响应和错误；真实 React 测试覆盖 Effect、订阅与清理时序。
3. PGlite 验证 SQL 原子更新、事务回滚和权限；并发语义还要在隔离的真实 Postgres/Supabase 上用两个连接验证。
4. 浏览器覆盖 DOM、React Flow、下载、WASM 和真实认证链路；不把源码字符串断言当作行为验收。
5. SQL 验证样本只写隔离数据库；故障注入不得对生产执行。
6. 每任务局部验证通过后再做最终完整回归；没有新增修改/失败，不反复重跑同一套检查。

## 五、数据迁移、发布与回退

### 迁移前

- [ ] 确认准确 Supabase 项目标识、数据库环境与维护时间窗；记录当前前端、函数、迁移版本。
- [ ] 备份相关业务表、权限/函数/触发器定义；账号功能验收涉及 Auth 时同时采用受控 Auth 备份措施，禁止日志输出账号敏感内容。
- [ ] 记录 projects/drawings、价格、成品物料、成本分析的行数、主键集和稳定字段/业务 JSON 哈希；新 revision 字段不计入原数据哈希。
- [ ] 记录 Storage 对象清单、路径和校验信息；数据库备份不能代替源文件备份。
- [ ] 在隔离实例完成一次恢复验证，确认样本项目能打开、图纸能导出、来源文件能读取。

### 发布顺序

1. 完成所有本地验证；停止使用旧版成本同步维护脚本。
2. 在隔离环境演练保留数据迁移、函数部署与新前端；验证旧客户端被安全拒绝。
3. 经授权在目标库执行新增 revision/RPC 迁移，核对数据与权限。
4. 生成 quote engine，检查并部署本次确实受影响的云函数；未变更函数不无故重发。
5. 发布前端，提示旧页面刷新；检查真实登录、一次保存、一次冲突和报价。
6. 经单独授权后才运行新版成本同步；先预览再执行，保留输入清单与结果报告。

### 回退原则

- 数据库迁移失败由事务回滚；不通过整库恢复覆盖维护窗口之后的用户数据。
- 文档版本控制上线后不能简单回退为旧版无条件写入前端。优先暂停编辑、保留本地草稿，再部署带新写入契约的已验证版本；禁止临时恢复直接表写权限绕过保护。
- 依赖升级有回归时暂停受影响 Excel 入口并修复；不要无提示恢复有漏洞版本继续接收不可信文件。
- 成本同步数据库失败自动回滚，已上传但未引用的新对象保留待核查；已成功业务修改需按备份与审计逐项授权恢复，不能全表覆盖。
- 仅移除确实需要回退的函数/权限变更时，先证明不会导致数据丢失或权限扩大；保留已增加的版本字段和已有业务记录。

## 六、最终交付清单

- [x] R1–R6 均有对应修改、回归证据和可定位文件。
- [x] 真实保存生命周期、并发/草稿、成本事务、Excel 异常输入测试齐全。
- [x] ESLint、前端/服务端/函数类型检查、完整单测与构建通过。（118 文件 / 992 项；`npm run deploy:check` 端到端通过）
- [x] 依赖漏洞修复有来源与版本证据，不能仅靠审计忽略规则。（xlsx@0.20.3 官方 CDN 固定版本，生产审计 0）
- [x] 新库初始化、现有库升级、维护脚本、部署命令文档一致。
- [ ] 备份恢复演练、数据前后核对、真实浏览器验收有记录。（本地浏览器匿名流程与性能已记录；真实登录走查、远程核对与恢复演练待账号/授权，记录于 `docs/release-validation.md`）
- [x] 如尚无远程授权，交付可审查 SQL/脚本、验证结果和待执行清单，明确“未执行远程迁移/未发布”。
- [x] 报告实际改动、实际命令、失败/未验证项和剩余风险；不以测试数量代替功能验收。
- [ ] 用户授权提交后，只暂存本任务修改；提交前检查状态、暂存文件和暂存差异，使用 `feat: <实际改动的简明中文总结>`。（未提交，等待用户授权；建议信息见最终汇报）

## 七、本方案文档交付状态

- 本轮已在本工作区实施 T1–T8 的本地部分：代码修改、保留数据迁移 SQL、隔离数据库测试、回归测试与文档更新均已完成并通过本地验证。
- 各任务复选框按实际完成情况勾选；需要专用账号、远程授权或线上环境的项目保持未勾选，并在 `docs/release-validation.md` 记录为未验证。
- 未执行任何 Git 提交/推送、远程数据库写入或迁移、函数部署、真实成本同步与前端发布。


## 2026-11-04 提交前复核补充

已修复多窗口克隆 sessionStorage 导致草稿覆盖/误删、图纸另存提前报成功、来源哈希版本对象可覆盖、部分上传失败遗漏核查清单，以及项目冲突读取的失效异步结果。已新增 13 项回归，全量 118 文件 / 1019 项通过。实际验证、静态检查范围与尚未完成的远程验收见 [上线验收记录](../../release-validation.md#八2026-11-04-提交前复核与补充修复)。

本轮按六批提交：工具与依赖基础、成本同步、Excel 预览防护、保存与版本冲突、验收与升级说明、3D 方案文档。工具批需包含 `XLSX.set_fs(fs)` 最小初始化变更；保存前后端与权限迁移保留同批。Git 提交不代表远程数据库迁移或功能发布完成。
