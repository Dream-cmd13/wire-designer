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
9. `20_storage/01_buckets.sql`：确保私有 `catalog-assets`、私有 `cost-analysis-sources` 与公开 `finished-harness-drawings` 桶存在，并安装只读状态 RPC。
10. `30_security/01_rls.sql`：安装项目、图纸、目录与目录图片读取策略。
11. `40_seed/01_catalog_items.sql`：写入统一目录基线数据。
12. `40_seed/02_real_harness_catalog.sql`：写入 12 个真实连接器和 10 个真实线材。
13. `40_seed/05_finished_harness_materials.sql`：写入外部系统导出的成品线束物料（已剔除无图纸且未被成本分析引用的记录，可单独重复执行）。
14. `40_seed/06_finished_harness_cost_analyses.sql`：写入 43 个成品方案成本分析、工序工时与定价公式推导基线数据（可单独重复执行）。
15. `40_seed/07_finished_harness_drawings.sql`：为原本无图纸的成品方案回填补充 2D 图纸公网地址（仅当 `file_2d` 为空时更新，已有图纸的记录不受影响，可单独重复执行）。

新增成品线束表与成本分析也可以在已有数据库上单独执行第 6、7、8、13、14、15 步，无需执行 `drop all`。若后续更新了 `excel/` 目录下的成本分析表格（含料号命名变化），运行 `npm run supabase:export-cost-seed` 刷新第 14 步种子后只需重新执行该文件：种子会先清理当前解析结果之外的历史成本分析与无分析引用的自动建档物料，再写入最新结果，直接替换旧命名，无需清库或重建。

完成第 13、14 步或刷新种子后，可运行只读核对命令验证数据库与原始 Excel、种子的一致性：

```powershell
npm run supabase:verify-cost-analyses
```

该命令逐字段比对解析结果与数据库、独立核对原始单元格与公式、校验推导步骤自洽性、核对 BOM/工序明细的缺失值语义，并守卫 `son_price_low` 的 CRM 导入值不被改动；发现差异时以非 0 退出码结束。

完成 SQL 后，可在 CI、部署服务器或管理员工作站运行：

```powershell
npm run supabase:bootstrap-storage
```

该命令只幂等创建或修复私有 `catalog-assets` 桶，不安装数据库结构或 RLS。它需要 `SUPABASE_URL`（兼容 `VITE_SUPABASE_URL`）和服务端专用的 `SUPABASE_SECRET_KEY`（兼容旧名 `SUPABASE_SERVICE_ROLE_KEY`）。服务端密钥不得使用 `VITE_` 前缀，也不得进入浏览器代码。

## 当前数据约定

- 项目和制作图纸直接保存完整 JSON 文档；数据库不保留版本历史。
- 目录公共字段和按 `kind` 区分的 `spec` 存在 `catalog_items`。
- `02_real_harness_catalog.sql` 是真实 Excel 目录的唯一 seed 责任文件；同一 `kind + code` 不得在基线 seed 中重复维护。
- `finished_harness_materials.son_price_low` 是 CRM 平台最低售价，只随外部导入写入：有值即保留，缺失保持 null；成本分析、Excel 导入与同步脚本一律禁止回填或覆盖该列。
- `finished_harness_materials.son_unit` 是外部导入单位，成本分析建档不写入、缺失保持 null；`son_name` 只写 Excel 来源名称（如 B2 描述），无来源名称时保持 null，界面以“未命名”兜底，CRM 已有名称不被覆盖。
- 成本分析的来源定位以 `source_excel_path`（私有桶 `cost-analysis-sources` 内对象路径）为准；`source_excel_url` 仅作 URL 形式的展示/兼容定位，私有桶下不可匿名访问。
- 成本分析 `platform_no` 直接取规范命名的 Sheet 名（`WL-*`，长度统一为 mm 数字后缀，如 `WL-B21-414-2000`）；Sheet 无规范命名时取来源文件名中的规范料号；同一 Excel 内多个非规范 sheet 共用一个料号时，统一追加 sheet 名后缀以区分。重新执行第 14 步种子（或同步脚本）会直接清理替换旧命名残留，无需清库重建。
- 成品库只展示有来源图纸或被成本分析引用的物料；第 13 步种子已剔除无图纸且未被引用的记录，第 14 步种子（或同步脚本）会在成本分析写入完成后对已有库执行同样的清理。
- 成品方案补充的 2D 图纸存放在公开桶 `finished-harness-drawings`（对象名 `<platform_no>.<png|jpeg>`）；`file_2d` 仅在该列为空时回填，原本已有图纸的记录永不被覆盖。上传与回填使用 `node scripts/upload-cost-drawings.mjs`（默认只读预览，`--apply` 写入，`--write-seed` 刷新第 15 步种子）。
- `excel/` 下每个成本分析 xlsx 存放在同名子文件夹中，从 xlsx 提取的 2D 图纸校对图片与 `2d-drawings-manifest.csv` 清单位于同目录；解析、同步与核验脚本均递归扫描该目录。
- 成本分析解析器（`parseCostWorkbook`）在找不到 BOM/工序表头或汇总标签时输出告警摘要；导出的种子与数据库核对使用 `npm run supabase:verify-cost-analyses`。
- 真实线材的原始描述保存在 `description`，工程字段保存在 `spec`；当来源文本与结构化值冲突时，两者都保留。
- `kind = 'overmold'` 的目录项只允许黑色 PVC 45P / 黑色 TPE 与直头 / 弯头四种组合；可用内模固定为低密度透明 PE，且内模外型必须与外模一致。
- 不创建只有内模、没有外模的独立 `overmold` 目录项；内模是外模目录项的可选属性。
- 四条 canonical 外模记录共用一张外模图片；内模没有独立图片字段，也不在成品图中单独展示。
- 业务选项、图纸模板、常用语和图标随前端代码发布。
- 项目和图纸使用硬删除；重复保存采用最后一次成功写入覆盖。
- 浏览器只能读取被 `catalog_items.image_path` 引用的私有目录图片；上传由受信任的服务端或 Supabase 管理界面完成。
