# DWG 原图限定编辑

前端默认提供浏览器内草稿预览、撤回及 PNG／PDF 导出。需要启用 DWG 生成和云端另存新版时，使用 `VITE_DWG_WRITEBACK_ENABLED=true` 启动或构建前端，并按本页配置写入服务与云端迁移。

工程师或管理员可以在 DWG 页面编辑本地或本人云端的 AC1018 图纸。草稿在浏览器中预览。确认生成后，浏览器向同源写入服务发送原图与操作，下载和云端另存使用同一份修订字节。云端新版与原版分别保存在 `dwg-files` 私有桶中。

## 本地启动

从仓库根目录运行。需要 Node.js、Git、.NET 8 SDK 和现有前端依赖。

```powershell
node server/dwg-edit/prepare-acadsharp.mjs
$env:DwgEdit__SupabaseUrl = '<与前端一致的 Supabase URL>'
$env:DwgEdit__SupabaseKey = '<同一项目的 publishable 或 anon key>'
dotnet run --project server/dwg-edit/DwgEdit.csproj --urls http://127.0.0.1:5198
```

另开终端，用项目现有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 配置执行 `npm run dev`，登录后访问 `/dwg-viewer`，打开图纸并点「编辑图纸」。`prepare-acadsharp.mjs` 按固定 Git 提交和子模块提交拉取 ACadSharp 3.8.35，并核对替换上下文。生成源码位于被忽略的 `vendor/`。

正式环境把前端同源的 `POST /api/dwg/edit` 代理到服务，保留 `Authorization` 请求头，允许 21 MiB 请求体和至少 60 秒的代理读取时间。请求内的 DWG 上限为 20 MiB，最多 100 个操作，操作 JSON 受表单字段大小限制。服务用 Supabase Auth 和 `current_app_role()` 验证调用者，转换并发为 2，请求时限为 45 秒。给服务配置私有临时目录，并由运行环境监控异常退出后的残留文件。身份验证不需要 service role key。

## 数据升级与回退

依次使用已有的 `20261118_dwg_preview.sql` 和增量 `20261120_dwg_asset_parent.sql`。先在隔离环境停止相关写入，备份数据库及 `dwg-files` 对象字节，记录对象路径、大小和 SHA-256，保留备份时点及恢复脚本。将备份恢复到另一隔离实例后，对照旧资产 ID、状态、摘要、对象路径与下载权限，再执行迁移。迁移后旧行的 `parent_asset_id` 为空。检查同用户已就绪父项可以挂多个子版本，跨用户和未就绪父项被拒绝。对象恢复时按原键还原字节，再逐项与元数据哈希核验。升级后的新版本要单独备份，避免从旧快照恢复时丢失新增文件。

`dwgSecuritySql.test.ts` 用 PGlite 演练迁移、快照恢复和上述约束，并用独立 `bytea` 夹具核对真实样图字节。Playwright 用本地模拟的 Supabase Auth、PostgREST 和私有 Storage 验证读写流程，写回与下载走真实 ASP.NET Core。

## 复验命令

```powershell
$env:DWG_EDIT_EVIDENCE_DIR = Join-Path $env:TEMP 'dwg-limited-edit-evidence'
dotnet test server/dwg-edit/tests/DwgEdit.Tests.csproj
npx tsc -b
npm test -- tests/dwgViewer.test.ts src/lib/__tests__/dwgEdit.test.ts src/lib/__tests__/dwgSecuritySql.test.ts src/lib/__tests__/dwgRepository.test.ts src/lib/__tests__/dwgViewerPage.test.tsx
npm run build
```

浏览器测试使用本地夹具。将 API 的 `DwgEdit__SupabaseUrl` 和 Vite 的 `VITE_SUPABASE_URL` 都设为 `http://localhost:5199`，两端 key 都设为 `local-fixture`。设置 `VITE_DWG_WRITEBACK_ENABLED=true` 后，使用 `npm run dev -- --host localhost --port 5197 --strictPort` 启动 Vite。测试自行启动 5199 上的身份校验夹具。首次运行需要安装 Playwright Chromium。

```powershell
$env:E2E_DWG_EDIT = '1'
$env:E2E_BASE_URL = 'http://localhost:5197'
npx playwright test tests/e2e/dwg-edit.spec.ts --workers=1
node server/dwg-edit/verify-roundtrip.mjs $env:DWG_EDIT_EVIDENCE_DIR 'C:\path\to\dwgread.exe'
```

复现 ACadSharp 原版对照时，在单独终端设置 `DWG_EDIT_SAMPLE_DIR` 为仓库根目录、`DWG_EDIT_STOCK_BASELINE=1`，把 `DWG_EDIT_EVIDENCE_DIR` 指向另一个目录，用 `dotnet test server/dwg-edit/tests/DwgEdit.Tests.csproj -p:DwgUseStockAcadSharp=true --filter UnmodifiedSamples` 生成原版空改写件。可以把该目录作为 `verify-roundtrip.mjs` 的第三个参数。

## 可写范围与 CAD 验收

- 支持模型空间顶层 `TEXT`、可按统一格式重写的 `MTEXT`，以及有独占匿名显示块和明确覆盖文字的尺寸。共享块、属性、自动字段、复杂格式和无法唯一定位的对象保持只读。检测到外部 DWG 参照、现存 `DIMASSOC` 或服务发现未知图形实体时，整张图仅支持预览。
- 九张样图的前端 LibreDWG 错误码分别为原件 `4`、ACadSharp 原版空改写 `64`、修补后空改写 `0`。原版页映射计数少 1，且重写时会把布局最大范围写成最小范围。修补后的对照覆盖实体和块数、中文代码页、字体记录、图层、线型、布局和打印设置、外部光栅路径、变换及裁剪。样图里的光栅路径指向外部文件，检查实际出图需提供对应图片与字体。
- 写入库会重建部分非图形元数据。样图对照报告可能包含 `VISUALSTYLE`、`SECTIONVIEWSTYLE`、`DETAILVIEWSTYLE`、`CELLSTYLEMAP` 及其字典记录的缺失。可写范围面向这批二维线束图的已验证布局与实体，不能据此推断其他 CAD 工作流可往返保真。
- **目标 CAD 验收待完成。** 在 AutoCAD 或中望 CAD 打开实际浏览器下载件 `M12_浏览器下载_修订.dwg`。记录软件版本、打开时是否提示修复、模型和布局结果。核对目标尺寸显示 `*750±10`、实际测量约 `105.64115`、技术要求仍显示 `插拔次数：500次`。原图与修订件使用同一字体、外部图片和打印配置对照预览并输出 PDF。将修订件另存到新路径后关闭重开，再检查文字、尺寸、图层、布局和打印。完成这些检查后再对外提供 DWG 写回。
