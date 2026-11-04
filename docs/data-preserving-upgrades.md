# 数据保留升级说明

本文件记录现有库从旧结构升级到当前版本的迁移要求。所有迁移均可重复执行，只新增列、函数、触发器或收紧权限，不修改既有业务行；禁止清库、删表重建或重置数据库。全新环境初始化见 [SQL 执行说明](../supabase/sql/README.md#全新环境初始化)。

## 通用要求

- 执行前确认准确的 Supabase 项目标识、数据库连接信息与维护时间窗，并记录当前前端、函数与迁移版本。
- 备份受影响表（结构与数据）、权限/函数/触发器定义，以及 Storage 对象清单；数据库备份不能代替来源文件备份。
- 记录受影响表的行数、主键集、稳定字段/业务 JSON 哈希（新增 revision 等列不计入原数据哈希）。
- 在隔离实例完成一次恢复演练：样本项目能打开、图纸能导出、来源文件能读取。
- 每一步执行后立即核对；发现差异时通过事务回滚或按备份恢复，不通过整库覆盖维护窗口之后的用户数据。

## 迁移清单

### 20261012_material_price_edit.sql

- 前置条件：`10_schema/07_pricing_permissions.sql` 已安装（角色与定价函数存在）。
- 影响范围：新增 `save_material_prices(jsonb)` 函数；不改数据。
- 备份：`material_prices`、`pricing_audit` 行数与内容。
- 校验：函数可创建；既有价格行数、金额、更新时间、审计记录不变；工程师/管理员可保存，业务员被拒。
- 回退：撤销函数执行权限并回退前端；不得删除价格或审计数据。

### 20261012_material_price_updater.sql

- 前置条件：价格表存在。
- 影响范围：`material_prices` 新增 `updated_by`、`updated_by_name` 列与身份触发器。
- 备份：价格表与审计表。
- 校验：原单价、更新时间、审计记录不变；新列对既有行为 null；页面编辑与导入会写入更新人。
- 回退：回退前端展示即可，保留新增列与已记录数据。

### 20261012_finishing_labor_rates.sql

- 前置条件：`pricing_settings` 存在且已有人工工价档位。
- 影响范围：更新 `save_pricing_settings` 校验规则；仅在缺少 `finishingLaborRates` 时初始化五档价格并递增版本。
- 备份：`pricing_settings`（含 `settings`、`version`）。
- 校验：既有已编辑档位不被覆盖；重复执行不重复递增；随后必须重新构建并部署 `quote` 函数与前端。
- 回退：按备份恢复 `pricing_settings.settings`/`version`，并回退函数/前端到同一版本。

### 20261012_outer_strip_rate.sql / 20261012_tinning_labor_rates.sql

- 前置条件：对应业务变更已确认。
- 影响范围：仅调整工价配置或校验规则。
- 备份：`pricing_settings`。
- 校验：既有价格档位与版本语义符合变更说明。
- 回退：按备份恢复设置。

### 20261013_initial_password_accounts.sql / 20261013_password_change_required.sql

- 前置条件：业务表与安全策略就绪；已安排 `account-password`、`quote` 云函数与前端同批发布。
- 影响范围：账号元数据（强制改密标记、密码版本）；`auth.users` 密码并发保护触发器；所有已启用 RLS 表新增 restrictive `password_change_gate` 策略；受限视图与 RPC 增加改密门禁。
- 备份：相关表定义与数据、`auth.users` 的 `raw_app_meta_data`（受控环境内操作，禁止输出账号敏感内容）。
- 校验：现有账号可登录；改密前业务被阻断、改密后恢复；无法通过 RPC 或直接读绕过门禁；既有业务数据行数与内容不变。
- 回退：不能放宽权限绕过门禁；如需回退函数版本，必须先证明不会导致未改密账号获得访问能力。

### 20261013_overmold_pvc_only.sql

- 前置条件：现有外模目录记录均符合黑色 PVC 45P。
- 影响范围：仅替换 `catalog_items_overmold_spec_check` 约束。
- 备份：保存原约束定义（`pg_get_constraintdef`）。
- 校验：外模记录、目录 ID、图片绑定与关联关系不变；不符合约束时脚本中止且无变更。
- 回退：按原定义恢复约束，无需恢复数据。

### 20261014_document_revision.sql（项目与图纸版本控制）

- 前置条件：已完成后端迁移并在同一维护窗口发布新前端；旧前端在权限收紧后会明确保存失败，不做无保护写入。
- 影响范围：
  - `projects`、`drawings` 新增 `revision integer not null default 1`，既有行自动为 1；触发器在成功更新时递增。
  - 新增 RPC：`save_project_document`、`update_project_metadata`、`delete_project_document`、`save_drawing_document`、`delete_drawing_document`；全部校验身份、owner、工程师/管理员角色与强制改密状态，固定 `search_path`，撤销 PUBLIC/anon 执行权限。
  - 撤销 authenticated 对两张表的直接 INSERT/UPDATE/DELETE，只保留 SELECT 与原 RLS。
- 备份：`projects`、`drawings` 全量数据与行数、主键集、`config`/`document` JSON 哈希、owner；记录原表权限与策略定义。
- 校验：
  - 迁移前后行数、主键、业务 JSON 哈希、owner 完全一致，`revision` 均为 1；重复执行迁移无变化。
  - 两会话并发：先写入者 revision 递增，持旧版本的写入被拒绝且数据库保留新内容。
  - 删除后旧版本保存返回“文档不存在”，不复活记录；跨账号访问被拒且不泄露存在性。
  - 业务员与强制改密账号调用写入 RPC 返回 Forbidden；直接表写返回权限错误。
- 回退边界：迁移失败由事务回滚。上线后不能回退为旧版无条件写入前端：应暂停编辑、保留本地草稿，再部署带新写入契约的已验证版本；禁止临时恢复直接表写权限作为兜底。

## 发布顺序（现有库）

1. 完成全部本地验证（`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、生产依赖审计）。
2. 在隔离环境演练保留数据迁移、函数部署与新前端，验证旧客户端被安全拒绝。
3. 经授权在目标库执行未安装的迁移，逐项核对数据与权限。
4. `npm run quote:build` 后按变更范围部署 `quote`、`account-password` 等云函数；未变更的函数不无故重发。
5. 发布前端，提示旧页面刷新；验证登录、一次保存、一次冲突与报价。
6. 成本同步等维护脚本在单独授权后运行：先预览（完整校验 + 来源哈希 + 计划新增/更新清单），再 `--commit` 单事务写入。导入脚本只在来源对象已确认存在时更新 `source_excel_path/url`；需要刷新种子引用时使用 `--export-sql --verify-storage`，未确认的对象保持既有定位。

## 远程执行授权

以上远程数据库写入、迁移、函数部署、成本同步与前端发布均需要单独授权。未获授权时可以完成并交付：可审查的 SQL/脚本、隔离环境验证结果与待执行清单。
