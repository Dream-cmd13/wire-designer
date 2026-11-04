## 三维模型私有保存（2026-11-04）

现有库执行 `supabase/updates/20261104_model_preview.sql`；全新库按下方顺序先创建 `10_schema/10_model_assets.sql`，再执行桶与安全策略脚本。迁移仅新增本功能表、私有桶和权限，不清空既有表或文件。执行前备份数据库及 Storage 实际文件并记录对象清单，执行后核对原数据及对象清单不变。应用回退时保留新增表、桶和文件；详见 [三维模型实施与验收记录](../../docs/model-preview-validation.md)。

## 外模材质收紧为黑色 PVC 45P（2026-10-13）

数据库不存在 TPE 外模记录，统一收紧为“外模仅支持黑色 PVC 45P”。现有库执行 `supabase/updates/20261013_overmold_pvc_only.sql`；新库直接使用 `10_schema/02_catalog.sql` 中已收紧的约束。
脚本仅替换 `catalog_items_overmold_spec_check` 约束，不修改任何业务数据、目录 ID、图片绑定或关联关系，两条现有 PVC 种子记录保持原样。执行前脚本断言现有外模均符合黑色 PVC 45P，不符合则中止且不产生变更；执行前用 `pg_get_constraintdef` 保存原约束定义（脚本注释中也附有原定义），需要回退时按原定义恢复约束即可，无需恢复数据。

## 项目与图纸文档版本控制（2026-10-14）

现有库在密码迁移之后执行 `supabase/updates/20261014_document_revision.sql`，保留全部既有项目、图纸与账号数据。迁移为 `projects`、`drawings` 增加 `revision` 列（既有行默认 1），新增只经版本校验的写入 RPC，并撤销 authenticated 对两张表的直接 INSERT/UPDATE/DELETE，只保留 SELECT 与原 RLS。未升级前端前不得执行本迁移：旧前端将因权限收紧而明确保存失败，不会做无保护写入。

执行前备份 `projects`、`drawings`（含行数、主键集、`config`/`document` JSON 哈希与 owner）；执行后核对行数、主键、业务 JSON、owner 与 `revision=1` 均符合预期，并重复执行一次确认幂等。回退边界：迁移失败由事务回滚；上线后不能回退为旧版无条件写入前端，应暂停编辑、保留本地草稿，再部署带新写入契约的已验证版本。详细核对与恢复流程见 [数据保留升级说明](../../docs/data-preserving-upgrades.md)。

## 账号密码管理（2026-10-13）

现有库及新库在业务表和安全策略就绪后执行 `supabase/updates/20261013_password_change_required.sql`，保留全部已有账号和业务数据。迁移新增强制改密权限检查与密码并发保护触发器；必须配套部署 `account-password`、`quote` 云函数及前端。备份恢复、部署顺序和验收见 [账号密码管理](../../docs/account-password.md)。本次升级不得执行下面的清库重建流程。

## 价格更新人信息（2026-10-12）

现有库执行 `supabase/updates/20261012_material_price_updater.sql`；新库在价格表、角色权限脚本之后执行 `10_schema/09_material_price_updater.sql`。
新增 `updated_by` 和 `updated_by_name`，触发器按 `auth.uid()` 保存身份及当时显示名称（无名称时使用邮箱账号部分）。页面编辑、Excel 导入及直接价格写入均覆盖；系统写入标记“系统”。已有更新时间保持原字段，页面按北京时间展示。
历史更新人保持空值并显示“未记录”，不推测补填。执行前备份价格表与审计表；迁移只增加字段和触发器，需核对原单价、更新时间和审计记录未变。回退前端即可恢复原展示，保留新增字段与记录，不删除数据。

## 物料单价页面编辑（2026-10-12）

上线前先执行 `supabase/updates/20261012_material_price_edit.sql`，再部署前端。全新库在 `10_schema/07_pricing_permissions.sql` 之后执行 `10_schema/08_material_price_edit.sql`。
脚本仅新增可重复安装的保存函数，不更新或删除现有数据。执行前备份价格表、审计表并记录行数；执行后核对原记录、金额及行数未变。
恢复方案：回退前端版本；若需撤销接口，撤销 `save_material_prices(jsonb)` 的 authenticated 执行权限，保留价格数据及审计记录。已编辑的价格如需恢复，应按审计记录逐项核对后单独授权处理。
工程师、管理员可编辑连接器、外模、内模单价及线材整条长度档位价格；允许零元和最多六位小数，未定价空值不写入，已有档位不改长度、不删除。
保存仅提交修改行并校验原更新时间，新档位要求原记录不存在；任一冲突或无效值使整批回滚。Excel 导入仍为明确覆盖导入，后续手工保存将检测其版本变化。

# Supabase SQL 执行顺序

权限实施新增必跑脚本：在第 8 步之后执行 `10_schema/07_pricing_permissions.sql`，
在第 10 步之后执行 `30_security/02_pricing_permissions.sql`。后者必须晚于旧策略文件，
否则旧文件会重新安装宽松策略。全部脚本完成后才能部署前端。

部署报价 Edge Function：先运行 `npm run quote:build`，再由已授权的部署人员执行
`supabase functions deploy quote`。浏览器只调用该函数，不再本地计算成本。
函数内部校验访问令牌，`verify_jwt = false` 仅关闭网关旧 JWT 校验，不允许匿名核价。
第一个管理员由受信任的 SQL 管理控制台显式设置（使用准确账号 UUID）：

```sql
insert into public.user_roles(user_id, role)
values ('替换为准确的管理员账号UUID'::uuid, 'admin');
```

其余账号默认业务员；管理员在物料库的“定价参数与用户权限”中分配角色。

现有测试库更新电测、外观、包装人工的线长档位配置时，执行 `supabase/updates/20261012_finishing_labor_rates.sql`，同时部署重新构建的 `quote` 函数和前端。该事务更新 `save_pricing_settings` 校验规则，并仅在缺少 `finishingLaborRates` 时初始化五档价格、删除三项统一工价及递增版本；重复执行不覆盖已编辑的档位价格。全新建库已在 `10_schema/07_pricing_permissions.sql` 中包含相同结构。
业务员只显示自动报价入口；工程师、管理员保留其他入口，且仍只能访问自己的项目。
业务员不能访问价格、成本分析、定价参数、成本 Excel；普通报价只返回单价和总价。
成品安全视图只公开正式 `quote_price`，内部参考价不作兜底。
账号角色每 30 秒及页面恢复焦点时刷新，变更后清理成本缓存并卸载旧页面；服务端每次请求实时判权。

## 现行约定：保留数据初始化与升级

所有环境都必须保留现有账号、项目、图纸、价格、成本分析与来源文件。禁止清空表数据、删表重建或重置数据库；种子脚本只新增或更新，不删除本次来源之外的既有记录。

### 现有库升级

按变更时间顺序，在目标库逐个执行尚未安装的迁移；所有迁移均可重复执行，只增列/函数/触发器与收紧权限，不修改既有业务行：

1. `supabase/updates/20261012_material_price_edit.sql`
2. `supabase/updates/20261012_material_price_updater.sql`
3. `supabase/updates/20261012_finishing_labor_rates.sql`（同时重新构建并部署 `quote` 函数与前端）
4. `supabase/updates/20261012_outer_strip_rate.sql`、`20261012_tinning_labor_rates.sql`（如有对应业务变更）
5. `supabase/updates/20261013_initial_password_accounts.sql`、`20261013_password_change_required.sql`（配套部署 `account-password`、`quote` 函数）
6. `supabase/updates/20261013_overmold_pvc_only.sql`
7. `supabase/updates/20261014_document_revision.sql`（配套发布新前端）
8. `supabase/updates/20261104_model_preview.sql`（三维模型元数据、私有桶及权限）

执行前备份相关表并记录行数/哈希；执行后核对既有数据未变；回退与验证细节见 [数据保留升级说明](../../docs/data-preserving-upgrades.md)。

### 全新环境初始化

全新环境不需要也不得使用 `00_reset/` 下任何重置脚本，直接按顺序执行：

1. `10_schema/01_core.sql`：创建 `projects`、`drawings`。
2. `10_schema/02_catalog.sql`：创建 `catalog_items`。
3. `10_schema/03_material_prices.sql`：创建共享材料价格表、校验触发器和登录用户读写权限。
4. `10_schema/04_suppliers.sql`：创建供应商表及基础供应商数据（仅登录用户可查询）。
5. `10_schema/05_finished_harness_materials.sql`：创建现有成品线束物料表（仅已登录用户可查询）。
6. `10_schema/06_finished_harness_cost_analyses.sql`：创建成品线束成本分析与定价公式推导明细表，并扩充成品线束物料主表价格汇总列与唯一约束。
7. `10_schema/07_pricing_permissions.sql`：角色、定价参数、审计与价格权限函数。
8. `10_schema/08_material_price_edit.sql`、`10_schema/09_material_price_updater.sql`：价格页面编辑与更新人信息函数。
9. `10_schema/10_model_assets.sql`：创建三维模型原文件元数据表与校验触发器，必须先于下方模型权限策略。
10. `20_storage/01_buckets.sql`：确保私有 `catalog-assets`、私有 `cost-analysis-sources`、私有 `finished-harness-drawings`、私有 `dwg-drawings` 与私有 `model-files` 桶存在，并安装只读状态 RPC；模型桶上限 20 MiB。
11. `30_security/01_rls.sql`：安装项目/图纸 owner 策略（项目与图纸只授予 SELECT）、仅登录可读的目录/供应商/成品图纸策略，以及三维模型仅工程师或管理员本人可读写的表与文件策略。
12. `30_security/02_pricing_permissions.sql`：安装价格与角色权限策略（必须晚于旧策略文件）。
13. `supabase/updates/20261013_password_change_required.sql`、`20261014_document_revision.sql`：与现有库使用同一迁移，保证新库具备强制改密门禁与文档版本控制。
14. `40_seed/01_catalog_items.sql`：写入统一目录基线数据。
15. `40_seed/02_real_harness_catalog.sql`：写入 12 个真实连接器和 10 个真实线材。
16. `40_seed/04_material_prices.sql`：写入 24 个目录项的 54 条共享价格档位（依赖第 14、15 步的目录项，可单独重复执行）。
17. `40_seed/05_finished_harness_materials.sql`：写入外部系统导出的成品线束物料（可单独重复执行）。
18. `40_seed/06_finished_harness_cost_analyses.sql`：写入 43 个成品方案成本分析、工序工时与定价公式推导基线数据（只新增或更新，可单独重复执行）。
19. `40_seed/07_finished_harness_drawings.sql`：为原本无图纸的成品方案回填补充 2D 图纸对象路径（仅当 `file_2d` 为空时更新，可单独重复执行）。

新增成品线束表与成本分析也可以在已有数据库上单独执行第 5、6、17、18、19 步，共享价格种子（第 16 步）同样可单独重复执行，无需执行任何 reset。若后续更新了 `excel/` 目录下的成本分析表格，运行 `npm run supabase:export-cost-seed` 刷新第 18 步种子后重新执行该文件：种子只新增或更新，不删除来源之外的历史记录；如需处理旧料号重命名，必须单独提供有准确旧新映射的迁移，不得以“本次未出现”作为删除授权。刷新前先确认本地 Excel 来源完整并审查种子差异，禁止直接执行到远程库。

来源定位统一使用“内容哈希版本对象路径”（`cost-analyses/<序号>_<名称>_<sha256前12位>.xlsx`），`sync-cost-analyses.mjs` 上传、`import-cost-analyses.mjs` 写入、`upload-cost-analysis-excels.mjs` 上传与 `verify-cost-analyses.mjs` 核对共用同一规则。导入/种子生成默认不访问远程：未确认对象存在时保留既有种子定位；显式传入 `node scripts/import-cost-analyses.mjs --export-sql --verify-storage` 时通过 Storage 只读确认对象存在，已确认的使用版本路径，未确认的继续保留既有定位，都没有则不写地址。数据库写入同样只在对象已确认存在（同步上传成功或验证通过）时更新 `source_excel_path/url`，其余记录保留原引用，避免改回旧路径或引用不存在的对象。生成的种子按来源状态分组：**已验证**的版本路径允许替换既有引用；**未验证**的历史定位只填补空值（`coalesce(现有引用, excluded)`），不会覆盖数据库较新的地址，因此“先同步新路径、再执行离线种子”不会造成来源定位回退。

### 开发隔离说明（不用于升级）

`00_reset/01_drop_all_tables.sql` 与 `node scripts/reset-project-assets.mjs --confirm-delete-bucket project-assets` 仅用于用户明确授权的空白/可丢弃开发实例，不属于初始化或升级步骤，任何升级文档不得引用。运行重置会永久删除对应表数据和桶内对象。

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
- `drawings.id` 为 `text`，保存客户端生成的图纸文档 id（`drawing-<uuid>`），不得改回 `uuid` 列，否则云端图纸保存会因类型转换失败。
- 目录公共字段和按 `kind` 区分的 `spec` 存在 `catalog_items`。
- `02_real_harness_catalog.sql` 是真实 Excel 目录的唯一 seed 责任文件；同一 `kind + code` 不得在基线 seed 中重复维护。
- `finished_harness_materials.son_price_low` 是 CRM 平台最低售价，只随外部导入写入：有值即保留，缺失保持 null；成本分析、Excel 导入与同步脚本一律禁止回填或覆盖该列。
- `finished_harness_materials.sales_price` 与 `finished_harness_cost_analyses.sales_price` 仅保存 Excel 成本分析表的售价，必须能追溯到对应文件、工作表和原表数值/公式；CRM 导入不得写入或回填这两列。
- 全部页面和复制报告中，“最低售价”专指 CRM `son_price_low`，“售价”专指 Excel `sales_price`。列表和详情独立展示两者，禁止互相兜底；缺失保持 null，零价格正常展示。Excel 原表标签即使写作“最低售价”，系统生成的名称也统一为“售价”，原表预览保留原文。
- 历史 Excel 误写到 `son_price_low` 的数据不能作为 CRM 价格继续保留。须先备份并结合来源 ID、原始 CRM 数据、历史导入代码及旧 Excel 值确认误写范围，再事务清理并验证真实 CRM 价格和 Excel 价格均未改变；不得只按价格相同或来源 ID 为空判断。完整规则见[成品方案成本分析文档](../../docs/finished-harness-cost-analysis-plan.md#售价与最低售价来源规则2026-09-18-确认)。
- `finished_harness_materials.son_unit` 是外部导入单位，成本分析建档不写入、缺失保持 null；`son_name` 只写 Excel 来源名称（如 B2 描述），无来源名称时保持 null，界面以“未命名”兜底，CRM 已有名称不被覆盖。
- 成本分析的来源定位以 `source_excel_path`（私有桶 `cost-analysis-sources` 内对象路径）为准；`source_excel_url` 仅作 URL 形式的展示/兼容定位，私有桶下不可匿名访问。
- 成本分析 `platform_no` 直接取规范命名的 Sheet 名（`WL-*`，长度统一为 mm 数字后缀，如 `WL-B21-414-2000`）；Sheet 无规范命名时取来源文件名中的规范料号；同一 Excel 内多个非规范 sheet 共用一个料号时，统一追加 sheet 名后缀以区分。重新执行第 17 步种子（或同步脚本）只新增或更新，不删除未出现在本次来源中的历史记录；旧料号重命名必须走单独授权的映射迁移。
- 成品库只展示有来源图纸或被成本分析引用的物料由数据本身决定：种子与同步脚本不删除既有物料；若确需隐藏无图纸且无成本分析的旧记录，必须单独提供影响清单并经授权执行。
- 成品方案补充的 2D 图纸存放在私有桶 `finished-harness-drawings`（对象名 `<platform_no>.<png|jpeg>`）；`file_2d` 保存对象路径或外部 CRM 链接，登录用户在物料库中通过签名 URL 查看；`file_2d` 仅在该列为空时回填，原本已有图纸的记录永不被覆盖。上传与回填使用 `node scripts/upload-cost-drawings.mjs`（默认只读预览，`--apply` 写入，`--write-seed` 刷新第 16 步种子）。
- `excel/` 下每个成本分析 xlsx 存放在同名子文件夹中，从 xlsx 提取的 2D 图纸校对图片与 `2d-drawings-manifest.csv` 清单位于同目录；解析、同步与核验脚本均递归扫描该目录。
- M12/M8 目录与价格来源表存放在 `catalog-source/`（`M12、M8线束报价 - IT版本(1).xlsx`、`M12单线材料价格导入.xlsx`），目录与价格计划通过 `node scripts/prepare-real-catalog.mjs <源文件>` 生成；目录源表不得放进 `excel/`，否则会被成本分析扫描器误收录。
- 目录源表只以 `成本分析-M12单线` sheet 为准；同工作簿的 `M12单线`、`M12-M12`、`成本分析-M12双头`、`成本分析-M12工业以太网`、`成本分析-M8单线`、`M8单线`、`M8-M8`、`M8-M12`、`线材价格`、`M系列线束编码原则` 等 sheet 尚未完善或不准确，不得作为导入来源。
- 成本分析解析器（`parseCostWorkbook`）在找不到 BOM/工序表头或汇总标签时输出告警摘要；导出的种子与数据库核对使用 `npm run supabase:verify-cost-analyses`。
- 真实线材的原始描述保存在 `description`，工程字段保存在 `spec`；当来源文本与结构化值冲突时，两者都保留。
- `kind = 'overmold'` 的目录项只允许黑色 PVC 45P 与直头 / 弯头两种组合（硬度 45P 必填）；可用内模固定为低密度透明 PE，且内模外型必须与外模一致。
- 不创建只有内模、没有外模的独立 `overmold` 目录项；内模是外模目录项的可选属性。
- 两条 canonical 外模记录（黑色 PVC 45P 直头、弯头）共用一张外模图片；内模没有独立图片字段，也不在成品图中单独展示。
- 业务选项、图纸模板、常用语和图标随前端代码发布。
- 项目和图纸使用硬删除；重复保存采用最后一次成功写入覆盖。
- 浏览器只能读取被 `catalog_items.image_path` 引用的私有目录图片；上传由受信任的服务端或 Supabase 管理界面完成。
- 目录、供应商、材料价格、成品线束与成品图纸均仅登录用户可读；匿名用户对 `catalog_items` 无任何增删改查权限，前端对受保护路由与制作图纸的目录入口显示登录引导。
