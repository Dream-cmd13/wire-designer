# Supabase SQL 执行顺序

当前项目处于测试阶段，只维护一条空库重建路径，不维护旧结构升级链。

## 开发环境重建

确认目标 Supabase 项目和测试数据可删除后，在 SQL Editor 中按顺序执行：

1. `npm run supabase:reset-project-assets`：通过 Storage API 清空并删除旧 `project-assets` 桶；仅在明确授权的开发重置时执行。
2. `00_reset/01_drop_all_tables.sql`：删除业务测试数据和旧数据库对象。
3. `10_schema/01_core.sql`：创建 `projects`、`drawings`。
4. `10_schema/02_catalog.sql`：创建 `catalog_items`。
5. `10_schema/03_material_prices.sql`：创建共享材料价格表、校验触发器和登录用户读写权限。
6. `10_schema/04_suppliers.sql`：创建供应商表及基础供应商数据。
7. `10_schema/05_finished_harness_materials.sql`：创建现有成品线束物料表（仅已登录用户可查询）。
8. `10_schema/06_finished_harness_cost_analyses.sql`：创建成品线束成本分析与定价公式推导明细表，并扩充成品线束物料主表价格汇总列与唯一约束。
9. `20_storage/01_buckets.sql`：确保私有 `catalog-assets` 桶和公开 `cost-analysis-sources` 桶存在，并安装只读状态 RPC。
10. `30_security/01_rls.sql`：安装项目、图纸、目录与目录图片读取策略。
11. `40_seed/01_catalog_items.sql`：写入统一目录基线数据。
12. `40_seed/02_real_harness_catalog.sql`：写入 12 个真实连接器和 10 个真实线材。
13. `40_seed/05_finished_harness_materials.sql`：写入外部系统导出的成品线束物料（可单独重复执行）。
14. `40_seed/06_finished_harness_cost_analyses.sql`：写入 44 个成品方案成本分析、工序工时与定价公式推导基线数据（可单独重复执行）。

新增成品线束表与成本分析也可以在已有数据库上单独执行第 6、7、8、13、14 步，无需执行 `drop all`。若后续更新了 `excel/` 目录下的成本分析表格，可运行 `npm run supabase:export-cost-seed` 自动刷新第 14 步种子文件。

完成 SQL 后，可在 CI、部署服务器或管理员工作站运行：

```powershell
npm run supabase:bootstrap-storage
```

该命令只幂等创建或修复私有 `catalog-assets` 桶，不安装数据库结构或 RLS。它需要 `SUPABASE_URL`（兼容 `VITE_SUPABASE_URL`）和服务端专用的 `SUPABASE_SECRET_KEY`（兼容旧名 `SUPABASE_SERVICE_ROLE_KEY`）。服务端密钥不得使用 `VITE_` 前缀，也不得进入浏览器代码。

## 当前数据约定

- 项目和制作图纸直接保存完整 JSON 文档；数据库不保留版本历史。
- 目录公共字段和按 `kind` 区分的 `spec` 存在 `catalog_items`。
- `02_real_harness_catalog.sql` 是真实 Excel 目录的唯一 seed 责任文件；同一 `kind + code` 不得在基线 seed 中重复维护。
- 真实线材的原始描述保存在 `description`，工程字段保存在 `spec`；当来源文本与结构化值冲突时，两者都保留。
- `kind = 'overmold'` 的目录项只允许黑色 PVC 45P / 黑色 TPE 与直头 / 弯头四种组合；可用内模固定为低密度透明 PE，且内模外型必须与外模一致。
- 不创建只有内模、没有外模的独立 `overmold` 目录项；内模是外模目录项的可选属性。
- 四条 canonical 外模记录共用一张外模图片；内模没有独立图片字段，也不在成品图中单独展示。
- 业务选项、图纸模板、常用语和图标随前端代码发布。
- 项目和图纸使用硬删除；重复保存采用最后一次成功写入覆盖。
- 浏览器只能读取被 `catalog_items.image_path` 引用的私有目录图片；上传由受信任的服务端或 Supabase 管理界面完成。
