# 线束设计器（Wire Harness Designer）

基于 React 的线束设计工具，支持连接器选型、线材接线、保护套配置、BOM、报价预估，共享物料库与成品线束方案成本分析，以及独立制作图纸工作台。

## 当前架构

- 前端：React 19、TypeScript、Vite、Tailwind CSS、React Flow、Zustand。
- 云端：Supabase Auth、Postgres、Storage 和 RLS。
- 项目与制作图纸按账号保存，可跨浏览器或电脑继续编辑；目录、材料价格、供应商与成品方案成本分析为登录用户共享。
- 编辑中的项目和图纸会在本机按账号保留恢复副本：切换账号前等待保存，关闭页面前提示未保存内容，异常退出后可在同账号选择恢复本地草稿或使用云端版本。
- 暂不提供多人实时协作、团队共享、复杂角色或数据库版本历史。
- 未配置 Supabase 环境变量时，应用可启动，但登录和云端持久化不可用。

## 快速开始

```powershell
npm install
npm run dev
```

常用检查：

```powershell
npm test
npm run lint
npm run build
```

## DWG 图纸页

「DWG 图纸」页面在浏览器内使用 [LibreDWG](https://www.gnu.org/software/libredwg/)（WASM 构建，GPL-3.0）解析 DWG 并矢量渲染（按黑白二色输出：白底全黑、黑底全白），支持缩放/平移、图层面板、黑白底切换，以及 PNG/PDF 导出。

- `npm run dev` 与 `npm run build` 前会自动执行 `scripts/prepare-dwg-viewer-assets.mjs`：将 `node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm` 复制到 `public/libredwg/`，并在根目录存在 `线束设计器.dwg` 时复制到 `public/dwg/`（两个目录均已加入 `.gitignore`）。
- 示例 DWG 未入库时页面会提示「未找到内置示例图纸」，可直接打开本地 DWG 文件；此时 `tests/dwgViewer.test.ts` 中的真实图纸用例会自动跳过。
- 首次进入页面需下载约 9 MB 解析引擎（按需懒加载，之后由浏览器缓存）；解析在浏览器内完成，图纸不会上传到服务端。

## 图纸字体约定

制作图纸与成品图（图框、接线图、BOM、件号标注与尺寸标注）中的文字统一使用宋体：优先 `SimSun`，依次回退 `STSong`、`Songti SC`、`serif`；常量见 `src/lib/drawingFont.ts` 的 `DRAWING_FONT_FAMILY`，屏幕渲染、SVG 与 PDF 导出共用。DWG 图纸页的文字同样固定使用宋体。

## 环境变量

浏览器只配置公开连接信息：

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

管理员脚本另需服务端专用 `SUPABASE_SECRET_KEY`。该密钥不得添加 `VITE_` 前缀、提交到仓库或输出到浏览器。

## 数据模型

数据库包含七张业务表：

- `projects`、`drawings`：按账号保存的项目元数据与完整 `HarnessConfig` JSON、独立制作图纸 JSON。
- `catalog_items`：七类物料（连接器、线材、保护套、外模、模型、辅材、包装）的公共字段、`spec` JSON 和供应商引用。
- `material_prices`：连接器、线材、外模的共享价格档位。
- `suppliers`：供应商编号与名称。
- `finished_harness_materials`、`finished_harness_cost_analyses`：现有成品线束物料、成本分析与定价公式推导明细。

`catalog_items`、`suppliers`、`material_prices`、成品线束与成品图纸均仅登录用户可读，匿名用户对 `catalog_items` 无任何增删改查权限；登录用户只能向 `catalog_items` 新增 `accessory`（制作图公司辅材）；`projects` 和 `drawings` 仅本人可读写。

存储使用三个桶：私有 `catalog-assets`（目录图片）、私有 `cost-analysis-sources`（成本分析来源 Excel）、私有 `finished-harness-drawings`（成品方案补充 2D 图纸，登录后通过签名 URL 查看）；另有只读 RPC `get_storage_bootstrap_status` 检查目录桶状态。

业务选项以及图纸模板、常用语、图标随前端代码发布。项目和图纸采用硬删除；重复保存以最后一次成功写入为准。详细字段、权限和验收见 [Supabase 集成说明](docs/supabase-backend-database-integration.md)，成本分析口径见[成品方案成本分析文档](docs/finished-harness-cost-analysis-plan.md)，建库步骤与数据约定见 [SQL 执行说明](supabase/sql/README.md)。

## 初始化 Supabase

测试阶段采用清空重建，不保留升级 SQL。必须确认目标项目和测试数据可删除后，按 [SQL 执行顺序](supabase/sql/README.md) 操作。未经明确授权，不应执行重置脚本。

数据库部署后，可在受信任环境幂等确保私有目录桶存在（完整建库会创建全部三个桶，该命令只创建或修复 `catalog-assets`）：

```powershell
npm run supabase:bootstrap-storage
```

创建测试登录用户：

```powershell
npm run user:create -- user@example.com "password" "显示名"
```

## 功能范围

- 新建、编辑、保存和导入导出线束项目。
- 连接器、线材、保护套和外模的可视化编辑。
- PIN 接线、短接、标签和号码管配置。
- BOM、报价预估与设计校验。
- 物料库：连接器、线材、模具与套管、现有成品线束方案，含共享价格、成本分析和来源 Excel 预览。
- 制作图纸新建、编辑、保存和 PDF 导出。
- DWG 图纸查看：浏览器内解析（含块引用、椭圆、文字与填充），图层显示控制、黑白底切换，PNG/PDF 导出。
- 共享目录加载与制作图公司辅材新增。

报价仍是前端估算结果，不作为正式商业报价；目录与成品方案基线数据用于当前产品验证，生产使用前需由业务方复核。
