# Supabase Storage 自动初始化设计

## 目标

为远程 Supabase 增加可重复执行的 Storage 初始化流程：部署、CI 或管理员本机运行命令后，系统确保 `catalog-assets` 与 `project-assets` 两个桶存在且保持私有；前端只读取初始化状态并提示，不持有或调用任何管理权限。

## 非目标

- 不在浏览器启动时创建或修改桶。
- 不把 `SUPABASE_SECRET_KEY`、service role key 或数据库密码暴露给前端。
- 不由初始化脚本创建 Storage RLS 策略；策略继续由 `supabase/sql/30_security/01_rls.sql` 管理。
- 不自动上传种子图片或修改已有对象。

## 方案比较

1. **Storage 管理 API 脚本 + 只读状态 RPC（采用）**：沿用现有 Node/Supabase SDK，部署依赖少，能够创建桶并修复公开状态，前端通过受限 RPC 安全检测。
2. **直接 PostgreSQL 连接脚本**：可以复用 SQL，但要求部署环境开放数据库连接并管理额外连接参数，网络与证书配置更复杂。
3. **服务端运行时自愈接口**：可在请求时创建桶，但当前项目没有常驻后端，新增服务和鉴权面的成本不符合本次范围。

## 架构

### 部署初始化脚本

新增 `npm run supabase:bootstrap-storage`。脚本从 `.env` 和进程环境读取 `SUPABASE_URL`（兼容 `VITE_SUPABASE_URL`）与 `SUPABASE_SECRET_KEY`（兼容 `SUPABASE_SERVICE_ROLE_KEY`），创建禁用 session 持久化的 Supabase 管理客户端。

脚本逐个检查必需桶：

- 缺失时以 `public: false` 创建。
- 已存在且为公开桶时，在保留文件大小与 MIME 类型限制的前提下改回私有。
- 已存在且为私有桶时不修改。
- 任一管理 API 调用失败时输出不含凭据的错误并以非零状态退出。
- 并发部署导致“另一进程已创建”时重新读取状态，保证幂等。

### 数据库只读状态接口

在 Storage SQL 中增加 `public.get_storage_bootstrap_status()`。函数以固定的两个桶为输入，只返回桶名、是否存在、是否公开，不返回对象、所有者或其他管理信息。

函数使用 `security definer`、固定搜索路径并撤销默认权限，只向 `anon` 与 `authenticated` 授予执行权限。现有建桶 SQL 和 RLS SQL 仍按原顺序部署。

### 前端检测与提示

前端配置了 Supabase 时，在应用启动后调用一次只读 RPC：

- 两个桶均存在且私有：不显示提示。
- 存在缺失桶或公开桶：显示全局琥珀色提示，列出具体桶，并提示运行初始化命令。
- RPC、网络或 SQL 初始化失败：显示“无法确认远程存储状态”，避免把未知状态误判为正常。
- 未配置 Supabase：保持当前本地运行行为，不显示 Storage 提示。

提示提供重新检测按钮，管理员完成远程初始化后无需刷新整个页面。

## 数据流

1. 部署环境先执行既有 SQL，安装表、状态函数和 RLS 策略。
2. 部署环境运行 `npm run supabase:bootstrap-storage`，创建或修复两个私有桶。
3. 前端使用 publishable key 调用只读状态函数。
4. 前端仅根据返回状态展示提示，不执行任何写操作。

## 测试与验收

- 单元测试覆盖：两个桶都缺失、部分缺失、误设公开、已正确初始化、并发创建和管理 API 失败。
- 前端状态测试覆盖：未配置、就绪、缺失、公开、RPC 错误和异常返回。
- 组件测试确认提示包含具体桶、初始化命令和重新检测入口。
- SQL 静态测试确认状态函数、权限收敛和两个固定桶均存在于规范 SQL 中。
- `npm test`、`npm run build` 和相关 lint 检查通过。

## 运维约束

“自动创建”由部署或管理员流程显式调用初始化命令实现，不由普通用户打开网页触发。首次部署仍必须执行数据库 SQL；初始化脚本只负责 Storage bucket 本身，不能替代 RLS 策略部署。
