# 线束设计器（Wire Harness Designer）

基于 React 的工业线束工程设计与核价系统，支持连接器选型、线材接线、保护套与外模配置、2D 成品图与 BOM、服务端权威自动报价、共享物料与成品方案成本分析、独立制作图纸工作台、浏览器端 DWG 图纸解析与 3D 模型预览导出。

## 当前架构

- 前端：React 19、TypeScript、Vite、Tailwind CSS、React Flow、Zustand、Three.js、`occt-import-js`（STEP/STP）与 `STLLoader`（STL）、`@mlightcad/libredwg-web`（LibreDWG WASM 浏览器端解析 DWG）。
- 云端：Supabase Auth、PostgreSQL（RLS、带 `revision` 乐观锁的版本校验 RPC 与审计触发器）、Private Storage（全部私有桶，登录后按策略签发短期签名 URL）与 Deno Edge Functions（`quote`、`account-password`）。
- 线束项目按账号保存到云端，支持跨设备继续编辑。项目用 `revision` 检查并发修改，在本机保留未同步的草稿。遇到版本冲突可读取云端版本、另存项目或下载本地副本。
- 独立制作图纸按访客或登录账号保存在当前浏览器。换浏览器或设备前，请先从工作台导出图纸 JSON 副本。
- 共享数据与权限隔离：物料目录、供应商、材料价格、定价参数与成品方案成本分析为登录用户共享，并按账号角色控制访问边界。
- 暂不提供多人实时协作或数据库历史版本回滚。未配置 Supabase 环境变量时，应用可启动，「制作图纸」支持匿名本地使用，其余受保护功能与云端持久化不可用。

## 角色与权限

系统采用三级角色模型（`sales`、`engineer`、`admin`）：

- `sales`（业务员，默认角色）：仅显示并可访问「自动报价」（`/auto-quote`）；无法访问物料底价、成本分析、定价参数及成本 Excel，服务端报价仅返回单价与总价（超 5 米提示需工程师人工核价）。
- `engineer`（工程师）：开放全部六个功能模块，可管理本人项目、制作图纸、DWG 与 3D 模型资产，查看完整报价成本明细，并编辑共享物料单价与定价参数。
- `admin`（管理员）具备工程师权限，可在物料库的「定价参数与用户权限」抽屉分配角色，在右上角「账户」弹窗重置其他账号的密码。价格、定价参数及角色变更记录在数据库 `pricing_audit` 表中，管理员具有读取权限。
- 首次登录改密门禁：通过 `npm run user:create` 创建的新账号初始密码为 `888888`，首次登录或被管理员重置后必须修改为 8–128 位的新密码方可使用业务功能（前端门禁、数据库 `current_app_role()` 与 Edge Function 联防校验）。

## 快速开始

```powershell
npm install
npm run dev
```

常用检查：

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

## 一键部署到宝塔

在干净的 Git 分支运行 `npm run deploy:check`，完成检查并记下发布 ID。将该提交推送到 `origin` 后，用 `npm run deploy:publish -- <发布ID>` 发布同一份前端包。已推送且尚未准备发布包时，可执行 `npm run deploy` 一次完成全流程。

`scripts/deploy.mjs` 当前直接固定生产服务器目标配置（主机与站点根目录），仅部署私钥路径支持通过 `DEPLOY_SSH_KEY` 环境变量覆盖；详细配置、密钥登录、备份与回滚步骤见 [一键部署说明](docs/deployment.md)。此命令仅发布前端静态包，SQL 迁移与 Supabase Edge Functions 须按对应说明单独部署。

## DWG 图纸页（`/dwg-viewer`）

「DWG 图纸」页面需工程师或管理员登录后使用，在浏览器内使用 [LibreDWG](https://www.gnu.org/software/libredwg/)（WASM 构建，GPL-3.0）本地解析 DWG 并按黑白二色矢量渲染（白底全黑、黑底全白），支持块引用、椭圆、文字、实体/图案填充、线型虚线（CENTER 等）、尺寸标注与引线（外部参照图片读不到源文件时绘制边框并在框内居中显示图片路径），以及缩放/平移、图层面板、黑白底切换、PNG/PDF 导出和基于 M12 单段线缆图纸标注的 3D 示意预览。

- 云端私有图库：登录后通过 `dwg_assets` 与私有桶 `dwg-files` 管理并加载当前账号的云端 DWG 原图（支持通过「选择文件」或拖入打开本地 `.dwg` 文件并保存到云端，单文件上限 20 MiB，保存与读取均校验大小及 SHA-256）；支持 `/dwg-viewer?file=<资产ID>` 直达本人云端图纸。
- 草稿编辑边界：受支持的 AC1018 图纸可在浏览器内编辑草稿、撤回并导出 PNG/PDF。原图写回与云端另存新版已永久搁置，日常使用与发布保持 `VITE_DWG_WRITEBACK_ENABLED=false`。[写回方案归档](server/dwg-edit/README.md)
- 历史内置桶迁移：旧版内置图纸桶 `dwg-drawings`（`node scripts/upload-dwg-drawings.mjs` 默认预览，追加 `--apply` 才上传）合并到管理员私有图库的迁移步骤见 [SQL 执行说明](supabase/sql/README.md)。
- 运行时资源：`npm run dev` 与 `npm run build` 前会自动执行 `scripts/prepare-dwg-viewer-assets.mjs`，将 `node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm` 复制到 `public/libredwg/`（该目录已加入 `.gitignore`）。首次进入页面需下载约 9 MB 解析引擎（按需懒加载，之后由浏览器缓存）；解析在浏览器内完成，本地预览不会上传到服务端。

## 3D 模型页（`/model-viewer`）

「3D 模型」页面需工程师或管理员登录后使用，支持打开本地 STEP / STP / STL 模型文件（单文件上限 20 MiB；STL 支持 `mm` / `cm` / `m` / `inch` 单位切换），在独立 Web Worker 中解析并以 Three.js 渲染。STEP/STP 使用 `occt-import-js`，STL 使用 Three.js 的 `STLLoader`。

- STEP/STP 支持标准 / 精细画质切换。两类格式都支持自由旋转/预设视角观察、正交三视图（前视/右视/顶视）PDF 导出，以及保存原文件到私有桶 `model-files` 和数据库 `model_assets`（两阶段上传并校验大小与 SHA-256），支持 `/model-viewer?modelId=<UUID>` 直达本人云端模型。
- `npm run dev` 与 `npm run build` 前会自动执行 `scripts/prepare-model-viewer-assets.mjs`，将 OCCT 运行时 JS/WASM 及许可证复制至 `public/model-engine/`（已加入 `.gitignore`）。

## 图纸字体约定

制作图纸与成品图（图框、接线图、BOM、件号标注与尺寸标注）中的文字统一使用宋体：优先 `SimSun`，依次回退 `STSong`、`Songti SC`、`serif`；常量见 `src/lib/drawingFont.ts` 的 `DRAWING_FONT_FAMILY`，屏幕渲染、SVG 与 PDF 导出共用。DWG 图纸页的文字与 3D 三视图导出同样固定使用宋体。

## 环境变量

浏览器只配置公开连接信息（日常与生产保持 `VITE_DWG_WRITEBACK_ENABLED=false`）：

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

管理员脚本另需服务端专用 `SUPABASE_SECRET_KEY`。该密钥不得添加 `VITE_` 前缀、提交到仓库或输出到浏览器。

## 数据模型、存储桶与云函数

数据库包含以下核心业务、权限与资产表：

- `projects` 保存本人项目的元数据和完整 `HarnessConfig`，前端通过带 `revision` 校验的 RPC 保存和删除项目。数据库另有 `drawings` 表。当前独立制作图纸工作台使用浏览器本地存储。
- `catalog_items`：七类物料（连接器、线材、保护套、外模、模型、辅材、包装）的公共字段、`spec` JSON 与图片引用。
- `material_prices`：连接器、线材、外模与内模的共享价格档位（仅工程师和管理员可读写，带更新人信息与价格校验触发器）。
- `suppliers`：供应商编号与名称。
- `finished_harness_materials`、`finished_harness_cost_analyses`：成品线束物料、成本分析、工序工时与定价公式推导明细；业务员只可通过安全视图 `finished_harness_materials_visible` 读取非敏感字段与公开 `quote_price`。
- `user_roles`、`pricing_settings`、`pricing_audit`：账号角色、全局定价参数（含版本乐观锁与分长度后道工价）以及角色/价格/参数变更审计日志。
- `model_assets`、`dwg_assets`：3D 模型与 DWG 图纸的两阶段上传元数据表，仅本人（工程师/管理员）可读写。

存储全部使用私有桶，登录后按角色与归属策略通过签名 URL 访问：

- `catalog-assets`：目录物料图片。
- `cost-analysis-sources`：成本分析来源 Excel（仅工程师/管理员可读）。
- `finished-harness-drawings`：成品方案补充 2D 图纸（仅工程师/管理员可读）。
- `dwg-files`：用户本人上传保存的 DWG 原文件（单文件上限 20 MiB）。
- `model-files`：用户本人上传保存的 STEP/STP/STL 原文件（单文件上限 20 MiB）。
- `dwg-drawings`：历史内置 DWG 图纸桶（保留兼容与迁移用途）。
- 另有只读 RPC `get_storage_bootstrap_status` 检查必需桶（`catalog-assets`、`dwg-drawings`、`model-files`）就绪状态。

Supabase Edge Functions 位于 `supabase/functions/`：

- `quote`：服务端权威核价函数（由 `server/quoteService.ts` 与 `server/pricing.ts` 经 `npm run quote:build` 打包为 `supabase/functions/quote/engine.js` 后部署），每次请求实时从数据库读取 `quote_snapshot` 校验权限、物料、价格与定价参数。
- `account-password`：用户自主改密及管理员重置他人密码为初始密码 `888888`。

业务选项以及图纸模板、常用语、图标随前端代码发布。详细字段、权限和验收见 [Supabase 集成说明](docs/supabase-backend-database-integration.md)，成本分析口径见 [成品方案成本分析文档](docs/finished-harness-cost-analysis-plan.md)，建库步骤与数据约定见 [SQL 执行说明](supabase/sql/README.md)。

## 初始化与升级 Supabase

现有库升级时先备份数据库与 Storage 原件，再按 [SQL 执行说明](supabase/sql/README.md) 的适用清单执行缺少的迁移。全新环境先安装基础 schema、storage、security、seed，再执行清单中的补充迁移。其中 [`20261118_dwg_preview.sql`](supabase/updates/20261118_dwg_preview.sql) 创建 DWG 私有图库的 `dwg_assets` 表和 `dwg-files` 桶。新库与现有库都跳过已归档的 `20261120_dwg_asset_parent.sql`。迁移校验与恢复步骤见 [数据保留升级说明](docs/data-preserving-upgrades.md)。

完成数据库迁移后，可在受信任环境运行以下命令检查并补齐 `catalog-assets` 和 `model-files` 两个私有桶。DWG 私有图库由上述 SQL 迁移创建。

```powershell
npm run supabase:bootstrap-storage
```

创建测试登录用户：

```powershell
npm run user:create -- username "显示名"
```

新账号初始密码为 `888888`，首次登录必须修改为 8–128 位的新密码才能使用业务功能。也可传入完整邮箱。已有账号密码不变。用户在右上角“账户”中修改密码，管理员在物料库“定价参数与用户权限”中调整角色，并在账号弹窗重置其他账号为 `888888`（重置后同样要求改密）。

上线前须按 [账号密码管理](docs/account-password.md) 与 [宝塔一键部署](docs/deployment.md) 完成保留数据的迁移并部署 `account-password`、`quote` 云函数，再发布前端。

## 功能范围

- 当前可用连接器目录与自动报价方案为 M12；尚未提供 M8 物料，代码允许 M8 系列不代表当前业务可用。
- 项目管理与线束设计器：新建、编辑、保存、导入导出线束项目，连接器、线材、保护套和外模的可视化编辑，PIN 接线、短接、标签和号码管配置，BOM、报价弹窗、设计校验与 2D 成品图（含图框编辑、件号标注、接线表、BOM 表及 PNG/PDF 导出）。
- 自动报价（`/auto-quote`）：M12 单头/双头护套线快速配置、加工点数推算与服务端权威报价（超 5000 mm 转人工核价，业务员隐藏成本明细）。
- 物料库与成本分析（`/materials`）：连接器、线材、模具与现有成品线束方案浏览筛选，单价在线编辑与 Excel 批量导入导出，43+ 成品方案成本推导公式与来源 Excel 在线预览，以及定价参数与角色权限管理。
- 独立制作图纸工作台（`/drawing-workbench`）支持匿名本地制图，登录后可使用目录物料。图纸自动保存在当前浏览器，访客和各登录账号分别保存。要换设备继续编辑，先导出图纸 JSON 副本，到另一设备导入。交付成图时可单独导出 PDF。
- DWG 图纸查看（`/dwg-viewer`）：浏览器内解析与黑白矢量渲染、图层控制、AC1018 草稿编辑/撤回、PNG/PDF 导出、M12 单段线缆 3D 示意预览及私有云端保存。
- 3D 模型预览（`/model-viewer`）：STEP/STP/STL 浏览器端 Worker 解析与 Three.js 渲染、画质切换、正交三视图 PDF 导出及私有云端保存。

自动报价基于当前数据库价格与参数快照计算，用于当前业务核价参考，正式商务报价前仍须由业务与工程人员复核；目录与成品方案基线数据在生产使用前需由业务方复核。
