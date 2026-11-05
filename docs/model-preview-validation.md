# 3D 模型实施与验收记录

本地新增 `/model-viewer`，沿用工程师/管理员登录规则；销售不开放。文件先在浏览器本地解析，主动点击保存才上传原文件。不包含报价、AI 建模或精确 CAD 测量。

## 修改清单

- `src/lib/models/`：限制和单位契约、STEP/STL Worker、取消/超时、TypedArray 归一化、相机与 OrbitControls。
- `src/components/models/ModelViewer.tsx`：实体/网格特征边、四种视角、旋转/缩放/平移、窗口适配、WebGL 错误与资源清理。
- `src/pages/ModelViewerPage.tsx`：文件选择/单文件拖入、STL 用户指定单位、本地与云端状态、本人列表、直达/恢复保存、会话隔离。
- `src/repositories/modelRepository.ts`：固定 ID 与原文件键、SHA-256、上传不覆盖、数据库确认、结果不确定后的校验、下载重签与取消、分页。
- `src/App.tsx`、`src/lib/appRoute.ts`、`src/components/layout/AdminShell.tsx`：懒加载与现有导航/权限集成。
- `scripts/prepare-model-viewer-assets.mjs`、`package.json`/lockfile、`vite.config.ts`：固定 `three@0.187.0`、`occt-import-js@0.0.23`；保留 DWG predev/prebuild，新增同站点 OCCT ESM/WASM/许可证准备；Worker 使用 ESM 构建。生成目录 `public/model-engine/` 不入 Git。
- `supabase/sql/10_schema/10_model_assets.sql`、`20_storage/01_buckets.sql`、`30_security/01_rls.sql`、`supabase/updates/20261104_model_preview.sql`：保留数据的新增表/私有桶/权限；08/09 已占用，首次安装表编号采用 10。
- Storage 检查与 bootstrap 脚本及对应测试：增加 `model-files` 私有桶和 20 MiB 限制，保留其他桶行为。
- `src/lib/__tests__/model*.test.*`、路由/权限/Storage 现有测试、`tests/e2e/model-viewer.spec.ts` 和 `model-fixtures.ts`：单元、真实 PostgreSQL RLS、本地 HTTP 模拟与真实浏览器验证。

## 保存状态与恢复

1. 预览与保存状态独立。选择文件仅显示“仅本地预览”。
2. 生成稳定 modelId、SHA-256，先插入 `uploading`；对象键为 `<owner>/<modelId>/source.<step|stp|stl>`，原文件名仅作为文本元数据。
3. 文件上传成功后显示“原文件已上传，正在写入数据库确认…”。仅 `ready` 更新被数据库确认后显示“已保存”。数据库触发器还会检查原对象及其大小存在。
4. finalize 失败保留记录和对象；刷新后列表显示“保存未完成”，可恢复。已有对象须校验大小/哈希，不重复上传，也不覆盖；对象缺失则要求重新选择原文件并校验。恢复界面可明确结束恢复并预览/保存新模型。
5. 即使原对象已存在，重新选择的本地文件也须与恢复会话匹配，防止把另一个模型误标已保存。
6. 离开、路由切换、退出或角色变化会隔离旧结果。SDK 的 `upload()` 没有 AbortSignal 参数，因此已经发出的上传可能在服务器继续；客户端不会在取消后继续确认数据库，不把取消当作服务端回滚。未完成记录仍可恢复。

## 已执行验证

基线：`npx tsc -b` 通过；原有 `npm test` 为 118 个文件 / 1019 项通过。

最终结果（2026-11-04）：

| 命令/范围 | 结果 |
| --- | --- |
| `npx eslint <本任务全部变更/新增 TS、TSX、JS、MJS 路径> --max-warnings=0` | 通过，0 错误、0 告警 |
| `npx tsc -b` | 通过，0 类型错误 |
| `npm test` | 124 个文件、1049 项全部通过 |
| `npm run build` | 通过；保留大 chunk 体积提示 |
| `npx playwright test tests/e2e/model-viewer.spec.ts`（生产 preview） | 6 项通过，真实 STEP 已执行 |
| 同上，`E2E_BASE_URL=http://localhost:5173`（开发服务） | 6 项通过，真实 STEP 已执行 |
| `git diff --check` | 通过 |

独立只读审查发现的两项问题已修复并回归：顶视改变 up 轴时重建 OrbitControls（真实库数值测试），以及恢复已有云端对象时仍核对本地文件哈希（单元与浏览器回归）。本地 SDK HTTP 验证发现的浏览器原生 fetch 接收者问题也已修复，刷新恢复链路已通过。

真实私有样本通过 `MODEL_PREVIEW_STEP_PATH` 引用外部 `male_4.stp`，未复制到仓库、未上传远程。生产浏览器 Worker 的首轮结果：5,848 个三角形、1 个网格，网格 AABB 为 `19.60 × 19.60 × 24.00 mm`，加载约 1.2–1.5 秒；各轴与目标值误差小于 0.10 mm。检查了等轴测与顶视截图，外形和孔洞可见。时间为本机样本观测值，不是性能承诺。

使用自建 ASCII/binary STL 和自建双实体 STEP 验证格式及相对位置。双实体 STEP 返回 8 个三角形 / 2 个网格，整体尺寸 `12 × 3 × 4 mm`。真实 WebGL 连续替换 20 次前后活跃 buffer 数同为 4（累计创建 8→88，删除 4→84），并验证 contextlost 后重建；没有用截图替代画布。

浏览器 API 请求通过 Playwright 本地拦截，登录使用虚构 fixture，解析库与 WebGL 不 mock。另验证真实 Supabase SDK 的“上传成功 → finalize 失败 → 刷新 → 恢复 → 再刷新/列表打开”链路；此项属于本地 HTTP 模拟，不等同于真实云端验收。只对真实失败的输入校验测试写预期错误；正常流程检查无新增 `pageerror`，OCCT WASM 返回 200 且 MIME 为 `application/wasm`。

PGlite 执行的是实际 PostgreSQL 表约束、触发器与 RLS，不是 SQL 文本断言。Storage 使用隔离表结构夹具，覆盖未登录、销售、本人、他人工程师、管理员访问他人、伪造 owner/path、ready 前置检查、禁止覆盖/删除、角色撤销及重复迁移保留业务数据。它不能证明真实 Storage HTTP 服务行为。

本机已安装 Docker / Supabase CLI，但 `docker info` 报告 `dockerDesktopLinuxEngine` 管道不存在（daemon 未运行），因此未运行完整本地 Supabase Storage 服务。没有为此启动远程服务或对远程数据执行任何操作。

### 审查后修复（2026-11-04）

初版实现已按授权提交并推送至 `origin/dev`，提交号 `423e68b`。以下修复单独保留在工作区：

- 取得本人云端记录后立即保留 modelId 与保存状态，解析失败/重试不再改写保存身份，防止重复创建记录及上传。
- WebGL 错误绑定模型与画布代次，模型变化时清除旧错误及其网格引用；覆盖直接切换、空态过渡、初始化失败及同一模型重新显示，保留手动重建入口。
- 补齐 `supabase/sql/README.md` 的新表、私有桶、现有库迁移和首次安装顺序，核对清单涉及的 21 个 SQL 文件均存在，模型表和桶先于权限脚本。
- 新增 5 项回归场景，均在修复前观察到预期失败，修复后页面/画布相关 13 项测试通过。修复没有修改数据库脚本或执行远程 SQL、真实外部文件上传、发布。

最终复验：修改代码的 `npx eslint <文件路径> --max-warnings=0` 与 `npx tsc -b` 通过；`npm test` 为 124 个文件 / 1054 项通过；`npm run build` 通过，保留已知的大 chunk 提示。对最终生产构建运行 `npx playwright test tests/e2e/model-viewer.spec.ts`，6 项全部通过，真实 STEP 未跳过：5,848 个三角形 / 1 个网格，网格近似 AABB 为 `19.60 × 19.60 × 24.00 mm`，约 1.48 秒，WASM 为 200 / `application/wasm`。连续替换 20 次后活跃 GPU buffer 仍为 4；本地 HTTP 模拟的上传/数据库确认故障恢复通过，仍不等同于真实 Storage 验收。

建议复现：

```powershell
npx tsc -b
npm test
npm run build
$env:MODEL_PREVIEW_STEP_PATH = 'D:\xwechat_files\wxid_x48e6n5jrdea22_058f\msg\file\2026-11\male_4.stp'
npx playwright test tests/e2e/model-viewer.spec.ts
# 开发服务走查：另一个窗口先 npm run dev -- --host localhost --port 5173 --strictPort
$env:E2E_BASE_URL = 'http://localhost:5173'
npx playwright test tests/e2e/model-viewer.spec.ts
```

真实 STEP 环境变量缺失时该项会明确标为未执行，不能把其余通过称为全部验收通过。私有模型截图默认仅在忽略的 `test-results/` 下。

## 部署与远程待执行事项

初次实施阶段未执行远程操作；后续已按明确授权完成 Git 提交推送、远程 SQL 与前端发布，详见 [三维模型发布记录](deployment.md#三维模型发布记录2026-11-04)。真实外部模型上传及真实账号保存端到端验收仍未执行。远程操作规程如下：

1. 确认目标项目 URL/数据库、授权角色和备份位置，避免误连生产或其他项目。确认现有 `auth.users`、`public.current_app_role()` 和 Storage schema 已安装。
2. 备份既有数据库（包含业务表、权限、桶与对象清单），例如使用已有受保护环境变量运行 `pg_dump --dbname=$env:MODEL_DATABASE_URL --format=custom --file=model-preview-before.dump`。另备份 Storage 实际文件：数据库备份只包含对象元数据，不包含文件字节。备份不得进 Git；先在隔离环境验证可恢复。
3. 记录业务表与 Storage 对象行数，例如 `select count(*) from public.projects`、`public.drawings`、`public.catalog_items` 和 `storage.objects`；如已存在 `model_assets`，另记录其行数/状态/哈希清单。导出桶配置与 `storage.objects(bucket_id,name,metadata,created_at)` 清单。
4. 经授权只执行 `supabase/updates/20261104_model_preview.sql`。脚本有事务且幂等，仅新增/配置本功能对象；不执行 `00_reset`，不清表、不删表、不清桶。首次安装则沿现有 SQL 顺序加载编号 10 的表及桶/安全脚本。
5. 核对原业务行数、对象清单和数据校验值不变；新表/桶私有、20 MiB 限制和 RLS 正确。真实测试账号分别覆盖工程师本人、其他工程师、管理员、销售、未登录及角色撤销。
6. 在授权的测试环境执行“保存 → 刷新 → 本人列表 → 重新打开”和故障恢复，覆盖上传失败、finalize 失败/响应不确定、签名过期、取消；确认同一个 modelId 不产生重复对象、ready 对象不可覆盖，他人文件不可签名/下载。
7. 发布包含完整 `dist/model-engine/` 与 Worker chunk 的构建，WASM 必须由服务器返回 `application/wasm`，`.mjs` 返回 JavaScript MIME；子路径部署保持 Vite BASE_URL 一致。检查首页未请求 OCCT，引擎在首次 STEP 解析时才下载。

恢复方案：迁移失败时事务回滚；应用功能回退时恢复上一个前端包并保留 `model_assets`、桶与所有文件，禁止 DROP 或清空。若发生非预期数据变动，先停止写入并保存现场，在隔离环境从备份核实后制定数据保留式恢复，不直接覆盖当前数据库。未完成记录本期不自动清理。

## 限制与语义

- 所有展示尺寸都是“包围盒尺寸（网格近似）”；STEP 输出统一毫米，STL 没有可靠单位，单位始终为用户指定。不能据此声称精确 CAD 数据或直接作为报价依据。
- 文件上限 20 MiB，60 秒终止 Worker，返回后最多接受 1,000,000 个三角形。三角形限制发生在导入返回后，不能保证任意 20 MiB 文件的 WASM 峰值内存或成功率。
- 几何解析结果不持久缓存；重新打开下载原文件重新解析。签名 URL 不写入数据库或 localStorage。
- 模型云端表/桶不可用不会阻塞已登录用户的本地预览；若整个认证服务未配置，仍保持应用现有登录门禁，不引入匿名工程师身份。
- 本期无删除/重命名/公共分享/跨用户协作、无报价、AI 建模或 CAD 编辑。
- Vite 构建仍有大于 500 kB 的 chunk 提示，新 Three.js 页面已懒加载，未通过提高阈值隐藏提示。

## 2026-11-05：曲面质量与预览交互增量实现

基线 `d1b4a8d`，当前工作区 `dev`，按 `2026-11-04-model-preview-quality-improvements.md` 执行。开始时仅该方案为未跟踪文件；未改写其他任务代码。未执行 Git 暂存/提交/推送、发布、远程 SQL 或真实外部文件上传。本轮没有数据库、Storage、角色或 RLS 变更，无新迁移待执行，保留全部现有数据与原文件。

### 本轮修改

- `ModelViewer.tsx`：初始化、几何替换、显示更新分离；必传 `modelKey` 表示原文件查看会话，同 key 换质量保留相机，不同 key 自动等轴测适配。普通 resize 仅更新画布尺寸及 aspect/projection；适配窗口、重置及标准视角主动适配。保留顶视 up 轴切换时重建 OrbitControls 的修复。零尺寸恢复只补首次必要适配。
- `modelTypes.ts` / `modelParser.ts` / Worker：显式 standard/fine 协议及固定 STEP 参数；STL 继续使用原网格，单位语义不变。新任务取消旧 Worker，沿用 20 MiB / 60 秒 / 1,000,000 三角形预算。
- 新增 `modelEdges.ts`：Worker 内由面分组提取边界，面内按索引消除共享三角边，之后按尺度容差对端点去重，累计 300,000 线段上限。校验失败/缺信息/超预算整体回退特征边，实体仍可显示。TypedArray 校验、同单位换算及 Transferable 已覆盖。核对包内 `occt-import-js/src/js-interface.cpp`：`first=triangleOffset`、`last=triangleCount-1`，范围为含端点的三角形编号。
- `ModelViewerPage.tsx`：requested/applied 质量分离，解析期间保留当前网格；失败/取消回到已生效档位。质量任务不重建 saveSession、不变更 modelId/hash/URL/保存状态、不触发上传。保存与质量解析互斥，列表打开新 ready 模型可取消旧质量任务。新增背景、三种互斥边线模式、适配窗口、标准/自由视角、列表折叠、详情与 Fullscreen API；全屏内仍显示文件、近似尺寸、保存及质量状态和取消入口。
- 增量单元及 E2E：真实 OCCT/Worker/WebGL，自建双实体与圆柱+环面圆角 STEP；HTTP 夹具仍只模拟认证/远程保存。独立只读整体审查发现普通加载期间恢复保存入口使用陈旧 loading 的冲突，已用失败测试复现并修复，回归通过。

### 真实样本与可复现测量

私有样本通过 `MODEL_PREVIEW_STEP_PATH` 指向外部 `male_5.stp`，未复制入仓库或上传。Windows / Intel Core i5-13420H / Node 22.19.0 / Playwright 1.60.0；生产 preview，1440×900 与 1024×768。浏览器版本与最终资源计数见下方最终回归记录。

| male_5 | 标准 | 精细 |
| --- | ---: | ---: |
| STEP 线性偏差 mm / 角度参数 | 0.05 / 0.3 | 0.02 / 0.2 |
| 三角形 / 网格 / 面分组 | 5,632 / 1 / 35 | 11,228 / 1 / 35 |
| 派生边界线段 | 844 | 1,272 |
| 原网格 TypedArray 字节 | 156,192 | 300,768 |
| 增加边界 TypedArray 字节 | 20,256 | 30,528 |
| 网格近似尺寸 mm | 19.60 × 19.60 × 24.00 | 19.60 × 19.58 × 24.00 |
| Node 单次导入 / 边界提取 ms | 712 / 16 | 356 / 21 |

Node 同进程依次新建 WASM 实例：引擎初始化约 61 / 1,525 ms，两次具有不同编译/缓存条件，不能据此比较两档速度，更不是普遍性能承诺。上表只计传回的 TypedArray，不含 OCCT/WASM、JS 原始数组、提取 Map 或 GPU 峰值内存。浏览器最终首轮标准预览约 1.47 秒，WASM 200 / `application/wasm`。

自建圆柱+环面圆角模型：标准 2,854 三角形 / 160 线段，精细 6,674 / 241，4 面；近似尺寸约 10×10×9 mm。双实体保持 12×3×4 mm 与两个实体相对位置；ASCII/binary STL 和英寸换算继续回归。

### 截图与视觉结论

本机忽略目录 `test-results/model-quality-baseline/` 保留本轮开始时尚未重建的旧构建截图。历史测试文件名仍带 `male-4-*`，但实际输入与页面文件名均为 **male_5.stp**，不能误记为 male_4。该组用于旧界面及渲染效果对照，旧/新版布局不同，不能用其做逐像素质量比较。

`test-results/model-quality-final/` 包含新实现同一文件、1440×900、同视角同相机矩阵的标准/精细、无边线/特征边/曲面边界、浅色/深色组合，以及 1024/1440 布局截图。每个视角先在标准档固定相机，再切精细，避免分别适配带来的构图差异。已目视检查等轴测孔口、外环、侧面相切区域、纵向接缝及自建圆角模型：曲面分界更清楚，下部轮廓细分增加；当前视角未见整片三角网格线、明显背面穿透或大面积共面闪烁。这是本机样本观察，不能证明所有模型或所有观察角度无此问题。

曲面边界仍为离散网格派生线，包含周期曲面接缝；不同分段方式的重合线只做端点一致去重。大坐标原始 Float32 精度无法通过容差恢复。细化不会改变原 STEP 精度，网格近似 AABB 轻微变化是离散采样差异；不能作为精确 CAD 数据、测量或报价依据。未新增报价或 AI 建模。

### 远程待执行与边界

本轮本地 HTTP 故障夹具证明上传完成后数据库 finalize 失败仍显示未完成、刷新恢复不重复上传；保存成功仅在数据库 ready 确认之后成立。全量测试中的 PGlite 真实 SQL/RLS 仍为隔离 PostgreSQL 加 Storage schema 夹具，不能替代真实 Storage HTTP 验收。

真实 Supabase 服务端到端仍待针对目标环境、测试账号及自建无敏感信息文件的明确授权：保存→刷新→列表打开→重新签名、跨账号权限、重复保存及允许环境下故障恢复。本轮不重跑既有迁移、不修改角色、不上传私有样本、不注入远程故障。现有前端构建已在 `dist/` 准备好，发布及 Git 操作待用户授权。保留已知 >500 kB chunk 提示。

### 最终回归结果（2026-11-05）

| 实际命令 / 范围 | 结果 |
| --- | --- |
| `npx eslint src/components/models/ModelViewer.tsx src/pages/ModelViewerPage.tsx src/lib/models/modelTypes.ts src/lib/models/modelParser.ts src/lib/models/modelParser.worker.ts src/lib/models/modelEdges.ts src/lib/__tests__/modelEdges.test.ts src/lib/__tests__/modelParser.test.ts src/lib/__tests__/modelViewer.test.tsx src/lib/__tests__/modelViewerPage.test.tsx tests/e2e/model-viewer.spec.ts tests/e2e/model-fixtures.ts --max-warnings=0` | 通过，0 错误、0 告警 |
| `npx tsc -b` | 通过，0 错误 |
| `npm test` | 125 文件 / 1,079 项通过，含保存、权限、隔离 PGlite 回归 |
| `npm run build` | 通过，保留既有大 chunk 提示 |
| `$env:MODEL_PREVIEW_STEP_PATH='<外部 male_5.stp 路径>'; npx playwright test tests/e2e/model-viewer.spec.ts --output test-results/model-quality-final` | Chromium 148.0.7778.96，生产 preview，7 项全部通过，真实 STEP 未跳过 |
| `git diff --check` | 通过 |

真实浏览器质量/背景/边线连续切换 20 次并多次全屏退出：GPU buffers 创建/释放累计 20/15→100/96，活动数 5→4；Worker 创建 4→24，结束时活动数均 0。显示参数/布局切换不创建 Worker；同一查看会话中 canvas 节点保持连接。离开页面后 buffer 与 Worker 均为 0。初始 surface=5、末次 none=4，因边线可见性及 GPU 延迟分配不同，不把二者相等当作门禁；断言不超过基线，且退出为零。STL 连续替换 20 次活动 buffer 仍为 4。监听器/observer 释放由组件 StrictMode 生命周期回归辅助覆盖。

相机探针截取实际 WebGL `modelViewMatrix`；无环境贴图时未使用的 `viewMatrix` 被 shader 优化掉，因此未采用它做判断。同质量 resize/折叠/全屏与跨质量矩阵均按 1e-4 比较，跨质量模型 Float32 中心变化实测约 3e-8，不是缩放复位。缩放和平移保持标准视角标记，手动旋转显示自由视角。Fullscreen API 拒绝/不支持及原生 fullscreenchange 退出由组件测试覆盖；Chromium headless 不保证分发 Esc 原生退出，浏览器 E2E 先发送 Esc，必要时通过可见退出按钮退出，不将该 fallback 描述为真实物理 Esc 验收。

本轮所有本地可执行任务已完成；真实云端服务验收、Git 提交推送和发布保持待授权。

## 2026-11-05：自由旋转与平移控件增量实现

本节承接上一节尚未提交的质量/边线成果，按 `2026-11-05-model-free-rotation-controls.md` 的任务 1–3 实施。启动文案沿用旧 A–E，但新方案明确要求保留现有能力、只替换交互；当前 resize 保姿已在上一轮修复，本轮复验通过，没有人为回退后重做。工作区仍在 dev，未暂存、提交、推送、发布、远程 SQL 或真实外部上传；未修改解析、网格、权限、存储和保存状态机。

### 本轮修改清单

- `src/lib/models/modelView.ts`：以 Three.js 自带 TrackballControls 替换 Orbit 工厂，不新增依赖或双模式；显式静态移动、左/中/右旋转/缩放/平移，保留默认速度，关闭 A/S/D 模式键；工厂不改写相机 up。
- `src/components/models/ModelViewer.tsx`：单个存活 RAF 更新当前控件，仅 change 或场景变化绘制；普通 resize 更新尺寸、投影及屏幕范围；pointerdown 捕获阶段刷新位置，覆盖仅滚动/位移。预设、重置、适配清除旧输入后重建控件；自由滚转、质量切换和显示操作保留相机。取消、失去捕获、失焦和拖动中全屏变化仅在有活动手势时清理，保留完整姿态后重建，无私有字段修改。卸载成对取消 RAF、监听器及 GPU 资源。
- `src/lib/__tests__/modelTrackballControls.test.ts` 替换旧 Orbit 测试：真实 Three.js 指针序列、整圈中间姿态、上下半球、平移、滚轮/中键及距离限制；`modelViewer.test.tsx` 仅模拟 WebGLRenderer，实际运行 Trackball，覆盖 RAF、滚转、取消、位置刷新、视角重置、零尺寸与资源释放。
- `tests/e2e/model-viewer.spec.ts`：非对称四面体真实 WebGL 的纯横/纵向、观察方向、矩阵、平移缩放、DOM 滚动、全屏、重复换文件及 contextlost 重建；沿用质量/保存身份回归，增加 RAF 探针。通过外部路径读取 female_5/male_4 样件，未将模型或私有截图入库。
- 新方案勾选进度，并追加本验收记录；其余上一轮文件保留原状。

### 失败证据与修复结果

正式单测先用旧工厂复现：800×600，camera=(100,-100,100)、up=Z，纵向 120 px 再横向 120 px（每段 10 次 move/update），观察方向夹角 **0.000001175776 rad < 0.01**；连续纵拖累计仅 **0.9553 rad < 2π**，两项按预期失败。换 Trackball 后同序列约 **0.3 rad**，真实控件 9 项通过。整圈测试累计中间姿态且实际遍历上下半球，未用相同起终点判断旋转无效。

旧生产 preview 的真实页面同样失败：同一非对称 STL、1440×900、初始等轴测和相同纵/横 120 px 序列，观察方向仅 **0.000001345237 rad**；虽然旋转矩阵差为 1.90247（相机滚转），仍不满足观察方向变化目标。新构建同条件方向变化 **0.2733485 rad**，矩阵差 0.38537，通过 >0.01 的门槛。页面画布实际宽度与单测 800 px 不同，因此角度不要求相等，也不据此宣称普遍手感指标。

原生 Trackball 单独探针确认：pointercancel/lostpointercapture/blur/fullscreenchange 后，后续 document 指针移动仍可使相机移动约 42.7568 单位。应用仅对这些实测缺口补清理。组件失败测试还确认缺 RAF 不消费输入、仅位移时 screen 坐标陈旧；修复后取消事件丢弃未消费增量、下一次普通拖动可用，松手后静止，预设重建后 RAF 更新新实例。控件源码、应用注册/清理路径和 StrictMode 测试用于检查监听器释放，未用浏览器监听器绝对数量作断言。

### 验证命令与实际结果

机器延续上一节：Windows / Intel Core i5-13420H / Node 22.19.0 / Playwright 1.60.0，生产 preview 的 Chromium **148.0.7778.96**，默认 1440×900 并回归 1024×768。

| 实际命令 | 结果 |
| --- | --- |
| `npx eslint src/lib/models/modelView.ts src/components/models/ModelViewer.tsx src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelViewer.test.tsx tests/e2e/model-viewer.spec.ts --max-warnings=0` | 通过，0 错误 / 0 告警 |
| `npx tsc -b` | 通过 |
| `npm test -- src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelViewer.test.tsx src/lib/__tests__/modelViewerPage.test.tsx src/lib/__tests__/modelEdges.test.ts src/lib/__tests__/modelParser.test.ts` | 5 文件 / 61 项通过 |
| `npm test` | 125 文件 / 1,095 项全部通过 |
| `npm run build` | 通过，保留既有 >500 kB chunk 提示 |
| `$env:MODEL_PREVIEW_STEP_PATH='<外部 male_5.stp>'; npx playwright test tests/e2e/model-viewer.spec.ts --output test-results/free-rotation-current` | 12 项全部通过，male_5、female_5、male_4 三个真实 STEP 均未跳过 |
| 同样环境下 `npx playwright test tests/e2e/model-viewer.spec.ts --grep 'private sample free rotation' --output test-results/free-rotation-samples-final` | 2 项通过，补充倒置顶部及底部截图 |
| `git diff --check` | 通过 |

浏览器实际用不对称 STL 采样 modelViewMatrix 的旋转、平移及观察方向，纯横向在多个纵向姿态均持续有效；右拖/滚轮改变位置或距离但保持旋转部分。DOM 真正滚动造成 canvas 位置变化、宽高不变后拖动有效；带滚转进出全屏保姿且仍可拖动。20 次质量/背景/边线切换后：活跃 GPU buffer **5→4**（surface/none 差异）、Worker **0→0**、待执行 RAF **1→1**；离页三者均为 0。STL 换文件 20 次活动 buffer 仍为 4。未把静态界面每帧重绘作为更新方式。

### 同条件截图与视觉核对

- 修改前：忽略目录 `test-results/free-rotation-before/` 内 female_5/male_4 的 `*-initial.png`、`*-after-identical-sequence.png`；另 `free-rotation-before-exact/` 保留非对称 STL 的极点失败截图及 trace。
- 修改后：`test-results/free-rotation-current/` 内相同样件、1440×900、浅色/标准质量/曲面边界、初始等轴测，以及相同纵 120 px→横 120 px 的截图。鼠标坐标由实时 canvas bbox 计算，非模拟画布；新旧提示文字不同，截图用于比较真实观察姿态，不作逐像素材质比较。
- 补充翻转：`test-results/free-rotation-samples-final/` 保留倒置顶部与继续纵拖越过另一半球的底部截图。检查连接器孔口与缺口，视觉仅作补充，旋转有效性以非对称模型矩阵和方向变化为依据。

### 审查、限制与待执行

一次独立只读整体审查对本轮工作区增量、真实控件源码与测试逐项核对，未发现 Critical/Important/Minor 问题。审查明确：私有样件主要验证整体序列，精确的极点后纯横向由单测及不对称 STL 页面回归覆盖；未额外实测触屏/多指及真实设备原生取消事件，不宣称这些已验证。取消分支由真实 Trackball 加 DOM 事件测试覆盖；平台对自然失焦/取消的分发仍可能不同。

真实云端 Storage/数据库端到端验收保持待授权；现有本地 HTTP 保存/恢复夹具只证明客户端状态链路，上传与数据库 ready 确认仍分开，没有自动上传或质量换档写库。本轮无需 SQL 迁移。私有模型原字节、尺寸单位及保存身份保持。网格尺寸和曲面边界继续属于近似显示数据，不代表精确 CAD；未新增报价或 AI 建模。Git 提交推送及发布未执行。
