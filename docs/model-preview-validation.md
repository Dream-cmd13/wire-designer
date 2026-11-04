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

本次不执行远程 SQL、真实外部上传、Git 提交推送或发布。远程操作须在明确授权后按以下步骤执行：

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
