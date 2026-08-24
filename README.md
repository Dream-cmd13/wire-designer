# 线束设计器（Wire Harness Designer）

基于 React 的线束设计工具，支持连接器选型、线材接线、保护套配置、BOM、报价预估、等距预览，以及独立制作图纸工作台。

## 当前架构

- 前端：React 19、TypeScript、Vite、Tailwind CSS、React Flow、Zustand。
- 云端：Supabase Auth、Postgres、Storage 和 RLS。
- 项目与制作图纸按账号保存，可跨浏览器或电脑继续编辑。
- 公共目录由所有用户共享；暂不提供多人实时协作、团队共享、复杂角色或数据库版本历史。
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

## 环境变量

浏览器只配置公开连接信息：

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

管理员脚本另需服务端专用 `SUPABASE_SECRET_KEY`。该密钥不得添加 `VITE_` 前缀、提交到仓库或输出到浏览器。

## 数据模型

数据库仅包含：

- `projects`：项目元数据和完整 `HarnessConfig` JSON。
- `drawings`：独立制作图纸 JSON。
- `catalog_items`：七类物料的公共字段和 `spec` JSON。

业务选项以及图纸模板、常用语、图标随前端代码发布。项目和图纸采用硬删除；重复保存以最后一次成功写入为准。详细字段、权限和验收见 [Supabase 集成说明](docs/supabase-backend-database-integration.md)。

## 初始化 Supabase

测试阶段采用清空重建，不保留升级 SQL。必须确认目标项目和测试数据可删除后，按 [SQL 执行顺序](supabase/sql/README.md) 操作。未经明确授权，不应执行重置脚本。

数据库部署后，可在受信任环境幂等确保私有目录桶存在：

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
- BOM、报价预估、设计校验与等距预览。
- 制作图纸新建、编辑、保存和 PDF 导出。
- 共享目录加载与制作图公司辅材新增。

报价仍是前端估算结果，不作为正式商业报价；目录基线数据用于当前产品验证，生产使用前需由业务方复核。
