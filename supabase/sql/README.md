# Supabase SQL 执行顺序

当前项目处于测试阶段，只维护一条空库重建路径，不维护旧结构升级链。

## 开发环境重建

确认目标 Supabase 项目和测试数据可删除后，在 SQL Editor 中按顺序执行：

1. `npm run supabase:reset-project-assets`：通过 Storage API 清空并删除旧 `project-assets` 桶；仅在明确授权的开发重置时执行。
2. `00_reset/01_drop_all_tables.sql`：删除业务测试数据和旧数据库对象。
3. `10_schema/01_core.sql`：创建 `projects`、`drawings`。
4. `10_schema/02_catalog.sql`：创建 `catalog_items`。
5. `20_storage/01_buckets.sql`：确保私有 `catalog-assets` 桶存在，并安装只读状态 RPC。
6. `30_security/01_rls.sql`：安装三张表与目录图片读取策略。
7. `40_seed/01_catalog_items.sql`：写入统一目录基线数据。

完成 SQL 后，可在 CI、部署服务器或管理员工作站运行：

```powershell
npm run supabase:bootstrap-storage
```

该命令只幂等创建或修复私有 `catalog-assets` 桶，不安装数据库结构或 RLS。它需要 `SUPABASE_URL`（兼容 `VITE_SUPABASE_URL`）和服务端专用的 `SUPABASE_SECRET_KEY`（兼容旧名 `SUPABASE_SERVICE_ROLE_KEY`）。服务端密钥不得使用 `VITE_` 前缀，也不得进入浏览器代码。

## 当前数据约定

- 项目和制作图纸直接保存完整 JSON 文档；数据库不保留版本历史。
- 目录公共字段和按 `kind` 区分的 `spec` 存在 `catalog_items`。
- 业务选项、图纸模板、常用语和图标随前端代码发布。
- 项目和图纸使用硬删除；重复保存采用最后一次成功写入覆盖。
- 浏览器只能读取被 `catalog_items.image_path` 引用的私有目录图片；上传由受信任的服务端或 Supabase 管理界面完成。
