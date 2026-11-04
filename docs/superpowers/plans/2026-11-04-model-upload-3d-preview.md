# STEP / STL 文件上传与三维预览实施方案

> **交给实施 AI：**逐项完成本文任务并勾选检查项。若环境提供技能，可使用 `superpowers:executing-plans`；技能不可用时按本文执行。遵循当前项目 AGENTS.md 和用户明确授权。本次交付是方案文档，不表示已实现功能、执行远程 SQL、提交、推送或发布。

**目标：**在现有系统增加“3D 模型”页面，支持选择或拖入 STEP/STP/STL 文件后交互预览，并支持用户主动上传保存、从本人模型列表重新打开。

**架构：**浏览器通过 Web Worker 调用 Open CASCADE WASM 解析 STEP，通过 STLLoader 解析 STL；Three.js 渲染统一的网格数据。Supabase 私有 Storage 保存原始文件，数据库保存模型记录；重新打开时下载原文件并在浏览器解析，不新增后台 CAD 转换服务。

**技术栈：**现有 React 19、TypeScript、Vite、Supabase；新增 Three.js、occt-import-js 及必要的类型声明。锁定实际验证过的依赖版本并更新 lockfile。

**需求依据：**本文第 1 节为完整一期规格。前序调查汇总位于 `C:\Users\Redmi\.codex\visualizations\2026\11\04\01a1a449-4c0c-76a0-89df-98350adce1ac\嘉立创3D预览与自动报价-上下文汇总.md`；该文件缺失不阻塞实施，本文包含实施所需决策。

**项目：**`D:\wire-harness-designer`。文中相对代码路径均以此目录为根。制定日期：2026-11-04。

## 1. 一期功能规格与范围

### 1.1 必须交付

- 新页面 `/model-viewer`，名称“3D 模型”，挂在现有导航中，按 DWG 页模式接入。
- 页面要求登录，仅工程师和管理员可用，保持现有销售角色限制。模型记录和文件仅本人可读写；管理员本期也不自动获得他人的模型访问权。
- 一次查看一个文件，支持大小写不敏感的 `.step`、`.stp`、`.stl`。多文件拖入时提示“一次请选择一个模型文件”，不静默取首个。
- 选择文件后先本地解析和预览；用户点击“保存到云端”才上传。明确区分“仅本地预览”“保存中”“已保存”“保存失败，可重试”。
- 渲染灰白实体、可切换特征边线；支持旋转、缩放、平移、等轴测/前/顶/右视图、重置视角。
- 文件加载成功后自动居中并适配窗口，窗口缩放时正确更新相机和画布。
- 显示文件名、格式、原始大小、网格包围盒尺寸。STEP 输出统一为毫米；STL 没有可靠单位，用户先选择毫米/厘米/米/英寸，默认毫米并持续标记其为用户指定单位。
- 云端保存原始文件及元信息，列表显示本人记录，支持重新打开；支持 `/model-viewer?modelId=<uuid>` 直达本人已保存模型。
- 解析和下载可取消；切换模型后旧任务的结果不能覆盖新任务。
- 错误、空模型、无 WebGL 能力、引擎加载失败、超限、保存失败都给出可操作的中文提示。

### 1.2 本期不做

- 自动报价、材料费、优惠券、制造风险判断。
- 精确 CAD 测量、体积与表面积、壁厚检查、模型修复、编辑、剖切封口。
- DWG 三维化、图片生成三维、OBJ/3MF/IGES、压缩包或批量上传。
- 公共分享、跨用户协作、云端删除/重命名、自动上传、后台转换队列、GLB 云端缓存。
- 复制嘉立创的 FMesh/SGLB/F3D 私有格式，调用其接口或复用临时签名凭证。

### 1.3 显示精度和资源限制

- 默认 STEP 网格化输出单位 `millimeter`，初始配置 `linearDeflectionType: 'absolute_value'`、`linearDeflection: 0.05`、`angularDeflection: 0.3`；实施时核对安装版本 API 和角度单位，以真实样本验证。
- 尺寸来源为显示网格 AABB，标注“包围盒尺寸（网格近似）”。不得宣称精确 CAD 尺寸，不用它作为未来报价的权威数据。
- 所有格式转换到毫米进行渲染；STL 缩放因子为毫米 1、厘米 10、米 1000、英寸 25.4，原始文件不改写。
- 一期默认文件上限 20 MiB，即 `20 * 1024 * 1024` 字节；解析超时 60 秒；返回后最多接受 1,000,000 个三角形。常量集中维护，提示与实际检查一致。
- 三角形数限制发生在导入返回后，不能保证限制 WASM 导入期间的峰值内存。使用独立 Worker、超时终止、文件大小预检降低影响，不承诺任意 20 MiB 文件都能成功解析。
- 以上为本项目初始限制，不来自嘉立创的能力承诺；若实测需要调整，记录依据并同步测试。

## 2. 全局约束

- 开始前读取项目 AGENTS.md，检查 `git status --short`。制定方案时工作区已有大量用户改动，包括 App.tsx、package.json、lockfile、权限 SQL 和构建配置；必须基于最终工作区内容增量修改，不覆盖、回滚或混入无关改动。
- 不创建不必要的新框架、通用插件系统、任务调度层或全局模型状态仓库。页面局部状态足够。
- 保留所有现有数据库与 Storage 数据。禁止执行 `supabase/sql/00_reset`、数据库重置、删表重建、清空桶。
- 仅新增保留数据的迁移。远程写入、生产变更、Git 提交推送和发布必须依据用户明确授权；本计划不是这些操作的授权。
- React 19：禁止在 effect 中同步/无条件 setState 造成级联重渲染；状态切换优先由事件或异步任务结果触发。禁止直接赋值外部传入 DOM/Ref 的可变属性。
- Three.js 在组件内部自行创建和管理对象，清理自己拥有的 renderer、geometry、material、controls、worker、observer 和动画帧。
- 只从同站点静态目录加载 WASM/配套 JS，不依赖运行时公共 CDN。懒加载新页面及解析引擎，不增加首页的 CAD 引擎下载。
- 所有自定义文件名作为文本渲染，不注入 HTML。签名 URL 不入数据库、不持久缓存到 localStorage、不打印凭证。

## 3. 项目接入位置与文件职责

已核查的现有文件：

| 路径 | 接入要求 |
|---|---|
| `src/lib/appRoute.ts` | 新增路由、登录后保留规则及 modelId query 读写；buildRoutePath 保留 modelId |
| `src/App.tsx` | lazy 加载 ModelViewerPage，保持现有角色跳转、登录和项目状态逻辑 |
| `src/components/layout/AdminShell.tsx` | 导航入口及当前页文案，沿用 engineer/admin 可见规则 |
| `src/pages/DwgViewerPage.tsx` | 只参考其页面和加载提示，不把三维功能塞入 DWG 页 |
| `src/lib/storageSignedUrl.ts` | 复用签名 URL 获取方式，确认过期与失败处理 |
| `scripts/prepare-dwg-viewer-assets.mjs` | 参考资产准备方式，保留原脚本与现有执行顺序 |
| `src/lib/storageBootstrap.ts` | 纳入新桶状态检查，且失败不应阻塞页面的本地预览 |
| `scripts/lib/storageBootstrap.mjs` | 为新桶提供幂等配置，保留现有桶声明和行为 |
| `supabase/sql/20_storage/01_buckets.sql` | 新桶及状态 RPC 的首次安装定义 |
| `supabase/sql/30_security/01_rls.sql` | 按当前 SQL 结构增加新对象策略，不重写无关策略 |

建议新增：

```text
src/pages/ModelViewerPage.tsx                 页面、文件选择、云端列表和状态协调
src/components/models/ModelViewer.tsx       画布、Three.js 场景及工具栏交互
src/lib/models/modelTypes.ts                解析消息与网格类型、单位和限制常量
src/lib/models/modelParser.ts               文件校验、Worker 生命周期及取消/超时
src/lib/models/modelParser.worker.ts        引擎加载、解析、数据校验与网格归一化
src/repositories/modelRepository.ts         本人模型保存、分页列表、下载和恢复保存
scripts/prepare-model-viewer-assets.mjs     复制本版本引擎所需静态资源
supabase/updates/20261104_model_preview.sql  现有环境增量迁移
supabase/sql/10_schema/08_model_assets.sql   首次安装表定义；编号冲突时顺延并记录
```

可为安装版本缺失的类型添加最小 `.d.ts`，不可用 `any` 淹没解析边界。复杂度确有需要时才增加独立 helper 文件。

## 4. 数据与模块接口

### 4.1 解析输出

以下类型作为契约，可以按现有代码风格组织：

```typescript
type ModelFormat = 'step' | 'stl';
type StlUnit = 'mm' | 'cm' | 'm' | 'inch';
type Vec3 = [number, number, number];
type ModelViewPreset = 'iso' | 'front' | 'top' | 'right';
interface ParsedMesh {
  name: string;
  positions: Float32Array;
  normals?: Float32Array;
  indices: Uint32Array;
}
interface ParsedModel {
  meshes: ParsedMesh[];
  boundsMm: { min: Vec3; max: Vec3 };
  triangleCount: number;
}
interface ParseModelOptions {
  format: ModelFormat;
  stlUnit: StlUnit;
  signal: AbortSignal;
  onPhase?: (phase: 'engine' | 'parsing') => void;
}
// modelParser.ts
function parseModel(file: Blob, options: ParseModelOptions): Promise<ParsedModel>;
```

Worker 消息带递增 requestId，分为 phase/result/error。解析器用 Transferable 传输 TypedArray buffer，避免重复复制；保存上传继续使用原 File，不使用已 detach 的 ArrayBuffer。

输出坐标必须有限，索引合法，三角形结构完整，网格非空；超限立即拒绝渲染。保留多个 mesh 的相对位置，不能逐个网格居中造成装配散架。读取实际库的 root/meshes 定义，不能假定只返回第一个实体。

固定模型坐标 Z 向上，视图定义为前视从 -Y 看向中心、右视从 +X 看向中心、顶视从 +Z 看向中心；顶视选择非平行 up 向量。将导入模型挂到统一 Group，在渲染层整体平移居中，不修改源尺寸。

### 4.2 页面状态

- 预览状态：`idle / reading / engine / parsing / ready / error`。
- 保存状态：`local / uploading / finalizing / saved / error`，与预览状态独立。
- 使用 requestId/sessionId 约束解析、下载、保存回调；文件切换、路由变更、退出登录后旧结果不得写回当前模型。
- 本地选择新文件时移除当前 URL 的旧 modelId，防止刷新后打开错误对象；仅保存完成或打开云端模型后设置新 modelId。
- 上传期间禁用切换文件、改变 STL 单位和重复保存；离开页面时允许中止网络请求，但不能把请求取消当作服务端已回滚。
- 不伪造解析百分比。只显示真实上传进度（SDK 若不提供则显示阶段提示）和解析阶段。

### 4.3 私有持久化

新增私有桶 `model-files`，原文件对象键固定为 `<auth-user-id>/<model-id>/source.<step|stp|stl>`。规范扩展名不使用原始文件名构造路径；禁止覆盖已存在的 ready 文件。

新增 `public.model_assets`：

| 字段 | 类型与约束 |
|---|---|
| id | uuid 主键，由保存会话生成并复用 |
| owner_id | uuid 非空，默认 auth.uid()；关联对象按现有用户 schema 核对，禁止级联删除用户模型 |
| original_name | text 非空 |
| format | text，step 或 stl |
| source_unit | text，STEP 固定 mm，STL 为所选单位 |
| object_key | text 非空、唯一，必须符合本人和当前 id 的路径规则 |
| file_size | bigint，1 至 20 MiB |
| sha256 | text，64 位十六进制，识别保存重试对应的同一份字节 |
| status | text，uploading 或 ready；不能把未上传成功的记录当成已保存 |
| bounds_mm | jsonb，已解析的近似包围盒；只供展示，重新打开后以本次解析为准 |
| created_at / updated_at | timestamptz，默认 now()，更新时按现有约定维护 |

新表及 Storage 策略均限定 `owner_id = auth.uid()` 且 `public.current_app_role()` 为 engineer/admin。对象上传策略还应检查对应的本人 uploading 记录和 object_key，读权限限定本人合法路径；不授予公开访问、跨 owner 操作或本期不需要的 DELETE 权限。不要仅依赖 UI 隐藏菜单或可伪造的客户端 owner_id。

保存协议：

1. 为当前文件生成稳定 modelId，计算 SHA-256，插入 uploading 记录。重复点击和重试复用该 modelId，不生成多份记录。
2. 使用 `upsert: false` 上传固定 object_key。成功后再把记录更新为 ready，只有这时显示“已保存”。
3. DB finalize 失败保留记录和对象，重试只做必要步骤，不删除原文件。页面刷新后，列表可显示“保存未完成”的本人记录，并提供“恢复保存”。
4. 上传返回冲突或网络结果不确定时，先检查本人目标对象；若已存在，下载并校验大小与 SHA-256 再 finalize；不盲目覆盖或误报成功。
5. 若对象不存在，提示重新选择原文件，以大小和 SHA-256 确认匹配后重试上传。不得要求用户重建模型。
6. 本期不自动清理未完成记录或对象；不把数据库和 Storage 两个写入当成原子事务。

仓库接口建议：`listModels(cursor?)`（每页 20 条）、`getModel(id)`、`saveModel(file, parsed, context, signal)`、`resumeSave(id, optionalFile, signal)`、`downloadModel(id, signal)`。构造函数注入 Supabase client 方便测试。save context 保存稳定 id、格式、单位与 hash；认证身份从当前 session 获取并由 RLS 强制校验。

## 5. 重点审查与对应验证

| 风险 | 预期行为 | 所属任务 |
|---|---|---|
| A 文件解析慢，用户已切换到 B | A 终止或丢弃，最终只显示 B | 任务 1、2 |
| STL 单位错误或多实体错位 | 显式单位转换，保留整体相对位置 | 任务 1、2 |
| Storage 成功而数据库 finalize 失败 | 可恢复，不重复上传、不误报已保存 | 任务 3 |
| 他人 modelId、路径伪造、角色被撤销 | 数据库与 Storage 均拒绝越权，前端清理旧数据 | 任务 3、4 |
| 重复开关页面、损坏/大模型、WebGL 丢失 | 可取消、可重试，释放资源且页面可操作 | 任务 1、2、5 |

## 6. 分步实施任务

### 任务 0：核对基线和执行边界

- [x] 阅读 AGENTS.md，记录已有改动，确认不会重置用户工作区；只检查本功能直接相关文件。
- [x] 核对依赖实际版本、Worker 中加载 occt-import-js 的可用入口、WASM 路径及许可证文件要求，采用包发布的构建产物。
- [x] 确认 SQL 首次安装顺序、角色函数和 Storage 策略。这里使用 `supabase/updates`，不要凭习惯新建另一个迁移体系。
- [x] 对现有基线运行必要检查，区分既有失败与本任务引入的问题，不能宣称存在未验证的基线故障。

交付物：范围清晰的修改清单及可复用的现有入口，不执行远程数据库写入。

### 任务 1：打通真实文件到网格的解析链路

涉及 `modelTypes.ts`、`modelParser.ts`、`modelParser.worker.ts`、资产准备脚本、package.json/lockfile 和必要类型声明。

- [x] 编写 `src/lib/__tests__/modelParser.test.ts`：大小/格式预检、单位因子、损坏文件、空结果、非法索引、超三角形数、超时及 AbortSignal 取消；先确认测试在缺实现时失败。
- [x] 安装所需依赖并实现统一解析输出。STEP 调用 ReadStepFile；STL 使用 STLLoader，必要时生成索引与法线，保持几何原点关系。
- [x] 实现 Worker 协议、取消和超时终止；重新导入可重新创建引擎，不遗留失效 Worker。Worker 失败转为中文业务错误。
- [x] 准备静态资产，按 Vite BASE_URL 解析路径，保留现有 predev/prebuild 步骤。开发与生产构建均不能出现 WASM 404 或错 MIME。
- [x] 使用用户真实文件在浏览器 Worker 中解析验证，不能只用 mock 宣称 STEP 可用。
- [x] 执行 `npm test -- src/lib/__tests__/modelParser.test.ts`，确认通过，并记录真实样本导入耗时和三角形数。

真实样本：`D:\xwechat_files\wxid_x48e6n5jrdea22_058f\msg\file\2026-11\male_4.stp`。若缺失，完成可独立工作的部分并准确报告；不从第三方网站下载未知模型替代该验收。

### 任务 2：完成独立三维查看器

涉及 `ModelViewer.tsx` 和 `src/lib/__tests__/modelViewer.test.tsx`。

接口：props 接收 `ParsedModel | null`；视角状态和画布资源由组件拥有；父页不直接修改其 DOM 或 renderer。

- [x] 写视角与适配测试：极小/极大/扁平包围盒、多个 mesh 相对位置、尺寸缩放、窗口零尺寸后恢复。
- [x] 建立场景、灯光、灰白材质、Group 与 OrbitControls；实现约定视角和自动适配，合理计算 near/far。
- [x] 增加特征边线开关（EdgesGeometry 阈值建议 30°），明确只是网格特征边，不承诺完整 CAD 曲面边界。边线不可把所有三角形边当成默认效果。
- [x] 添加 ResizeObserver、WebGL 初始化失败与 contextlost 处理；设备像素比上限建议 2。
- [x] 覆盖切换模型与 StrictMode 重挂载清理测试；移除事件、终止动画、dispose controls/material/geometry/renderer、断开 observer。
- [x] 用真实模型检查外形、孔洞、平滑度和交互；执行 `npm test -- src/lib/__tests__/modelViewer.test.tsx`。

交付物：本地文件可交互查看的真实画布，而非截图占位。

### 任务 3：实现私有保存、列表、下载及失败恢复

涉及 modelRepository、新表、增量迁移、Storage bootstrap 和相关测试。

- [x] 写 `src/lib/__tests__/modelRepository.test.ts`：正常保存、对象上传失败、finalize 失败、冲突校验、哈希不匹配、恢复保存、签名过期与取消。
- [x] 按第 4.3 节实现保存协议和分页读取，避免记录/对象之间的半成功状态被隐藏。
- [x] 新增幂等、保留数据的迁移，同步首次安装表、桶与权限 SQL；更新状态 RPC 与启动检查。只处理新功能对象，不改其他业务数据。
- [x] 编写本地数据库/RLS 集成验证，覆盖未登录、销售、本人、其他工程师、管理员访问他人模型、伪造 owner/path。mock 与 SQL 文本断言不能替代真实权限测试。
- [ ] 若 PGlite 不能运行 Storage 权限集成，用本地 Supabase 或明确授权的测试环境验证；记录环境限制，不擅自连接生产执行。
- [x] 在迁移说明中列出：目标环境确认、既有模型/业务数据备份、对象清单备份、执行前后行数核对、恢复步骤。回退应用功能时保留新表和文件，不 DROP 或清空数据。
- [x] 执行 `npm test -- src/lib/__tests__/modelRepository.test.ts` 及实际新增权限测试，保留验证结果。

交付物：代码、迁移和本地验证结果。远程未授权时不执行迁移，明确将“真实云端端到端验证”列为待执行，不将功能称为全部上线完成。

### 任务 4：页面、路由、权限和保存流程集成

涉及 ModelViewerPage、App、appRoute、AdminShell 和现有相关路由测试。

- [x] 编写 `src/lib/__tests__/modelViewerPage.test.tsx`：拖入多文件、STL 单位变化、新旧解析乱序、保存失败保留预览、连续保存去重、退出登录清理、modelId 切换。
- [x] 实现页面空态、文件选择、单位、阶段提示、画布、保存按钮、本人模型列表和恢复保存入口。
- [x] 新增 `/model-viewer`、modelId 参数 helper，并扩展 `buildRoutePath` 和 `shouldKeepRouteAfterLogin`；使用项目现有路由机制，不引入新 router。
- [x] App 中 lazy 加载；菜单与直接路由保持相同权限规则，不改变销售角色既有行为。
- [x] 云端配置缺失时本地预览可用，云端按钮明确提示无法保存；不偷偷保存为 localStorage 并显示云端成功。
- [x] 扩展现有 `appRoute.test.ts`、`requiresAuth.test.ts`、`adminShellAccess.test.tsx`，确认 DWG 和其他路由无回归。
- [x] 执行上述针对性测试，确保本任务所有场景通过。

### 任务 5：浏览器端到端验证和交付

- [x] 新增 `tests/e2e/model-viewer.spec.ts`，沿用现有 Playwright 配置及可用的测试登录方式，不硬编码账号，不使用 CRM 项目专属凭证。
- [x] 原始私有 STEP 默认通过 `MODEL_PREVIEW_STEP_PATH` 指定外部 fixture 路径，不自动提交模型文件到仓库。无环境变量时明确报告该验收未执行；不得静默跳过后宣称全通过。
- [x] 使用可公开的小型自建 ASCII/binary STL 和必要多实体 STEP 测试样本验证格式分支；真实浏览器必须加载实际解析库与 WebGL，不能全部 mock。
- [x] 验证真实 male_4.stp 外形与孔洞正确，网格 AABB 各轴尺寸与 19.60/19.60/24.00 mm 的误差各不超过 0.10 mm；比较前考虑明确的轴方向约定，不通过硬编码样本尺寸过关。
- [x] 验证旋转、缩放、平移、四种视角、边线开关、窗口尺寸变化及连续替换 20 次。检查资源数不随替换无限增长，不设无法保证的统一 FPS 承诺。
- [ ] 验证“保存→刷新→本人列表→重新打开”与保存恢复；跨账号访问拒绝。只有真实测试环境完成后才勾选该项。
- [x] 检查控制台无新增错误、WASM 无 404、页面离开后无遗留动画/事件；开发服务和生产预览都走查。
- [x] 运行第 7 节检查并记录命令、结果和未覆盖项。更新部署文档，仅说明新静态资源与保留数据的迁移需求。

## 7. 必跑检查与验收标准

实施后必须执行，命令以项目当时 scripts 为准：

```powershell
# 对新增/修改的 TS、TSX、JS、MJS 逐项列出路径，不把无关工作区修改纳入
npx eslint <本任务代码文件列表> --max-warnings=0
npx tsc -b
npm test
npm run build
$env:MODEL_PREVIEW_STEP_PATH = 'D:\xwechat_files\wxid_x48e6n5jrdea22_058f\msg\file\2026-11\male_4.stp'
npx playwright test tests/e2e/model-viewer.spec.ts
```

必要时按实际改动补跑 server/functions 类型检查和 Storage bootstrap 的脚本测试。发现基线问题要提供证据和影响范围，不能为通过检查而关闭规则、排除新文件或降低类型约束。

完成定义：

- STEP/STP/STL 的真实预览与所有一期交互可用，尺寸与单位语义正确。
- 本人私有云端保存、刷新重新打开、半失败恢复和权限验证通过。
- 不影响既有 DWG、制作图纸、设计器、自动报价和登录角色限制。
- ESLint 0 错误/0 告警，TypeScript 0 错误，测试、构建和相关浏览器验收通过。
- 未授权的远程迁移若尚未执行，交付明确区分“本地实现与验证完成”与“云端配置/验收未完成”。

## 8. 给实施 AI 的启动指令

> 请按照本实施方案，在当前工作区增量实现文件上传与三维预览。先读取 AGENTS.md 并核对现有改动，按任务推进，不只停留在方案描述。保留现有数据与其他任务改动，使用真实 STEP 文件验证；保存功能必须区分上传与数据库写入的完成状态。先完成所有本地可执行工作；远程 SQL、真实外部文件上传、Git 提交推送或发布如无明确授权，准备好具体变更后报告待执行事项。最终交付修改清单、实际验证结果、剩余限制和中英文建议 commit message。不要把网格近似参数称为精确 CAD 数据，不实现本计划范围外的报价或 AI 建模。

## 9. 实施参考

- STEP 导入与输出结构：https://github.com/kovacsv/occt-import-js
- STL 加载：https://threejs.org/docs/pages/STLLoader.html
- 相机交互：https://threejs.org/docs/pages/OrbitControls.html
- 已有项目实现参考：`src/pages/DwgViewerPage.tsx`、`src/lib/dwg/dwgLibrary.ts`、`src/repositories/drawingDocumentRepository.ts`。

交付时提供一条中文建议提交消息（以 feat: 开头）及一条英文建议消息；没有用户明确指示则不要实际提交。


## 10. 本次实施记录（2026-11-04）

当前工作区已增量实现，本地测试与真实 STEP 浏览器验证见 [实施与验收记录](../../model-preview-validation.md)。未勾选项涉及真实 Storage/远程端到端：本机 Docker daemon 未运行，且没有远程写入/上传授权。本地 HTTP 模拟的刷新恢复及跨身份 SQL/RLS 验证已完成，但不据此勾选真实云端验收。未执行 Git 提交、推送或发布。
