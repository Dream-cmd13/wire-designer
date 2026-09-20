# 线束设计系统 Supabase 最小数据库集成

更新日期：2026-09-20

## 目标与边界

系统保留 Supabase Auth、跨设备项目保存、制作图纸保存、共享目录、共享材料价格与成品线束成本分析，暂不实现多人实时协作、团队权限、数据库版本历史或后台目录管理。

数据库业务表：

| 表 | 用途 |
| --- | --- |
| `projects` | 用户项目及完整 `HarnessConfig`（`id`, `owner_id`, `name`, `description`, `config`, `created_at`, `updated_at`） |
| `drawings` | 独立制作图纸文档（`id`, `owner_id`, `document`, `updated_at`） |
| `catalog_items` | 共享物料目录（`id`, `kind`, `code`, `name`, `model`, `resource_group`, `description`, `image_path`, `image_variants`, `sort_order`, `spec`, `supplier_id`） |
| `material_prices` | 连接器、线材、外模的共享价格档位 |
| `suppliers` | 供应商编号与名称 |
| `finished_harness_materials` | 现有成品线束物料、来源图纸与价格汇总 |
| `finished_harness_cost_analyses` | 成品方案成本分析与定价公式推导明细 |

`projects.owner_id` 和 `drawings.owner_id` 直接引用 `auth.users.id`。应用不维护用户资料表、审计人字段、软删除字段、revision 或数据库文档版本表。

## JSON 文档与目录规格

`projects.config` 保存编辑器、BOM、报价与导出共同使用的完整项目聚合；`drawings.document` 保存制作图工作台文档。两者不拆成 PIN、线材或画布对象关系表。

`catalog_items.kind` 支持 `connector`、`wire`、`protective_sleeve`、`overmold`、`model`、`accessory`、`packaging`。类型专属字段存入 `spec`，由前端运行时解析器校验；供应商通过 `supplier_id` 关联 `suppliers`，价格档位存放在 `material_prices`。图片仅保存私有 `catalog-assets` 中的对象路径。

成品线束成本分析数据由来源 Excel 解析导入，原表缺失值保持 null，不做回退推算；来源 Excel 存放在私有 `cost-analysis-sources`，补充的 2D 图纸存放在公开 `finished-harness-drawings`。

线材颜色、交期、保护方案、报价规则、数量折扣、图纸模板、常用语和图标属于静态前端资源，随应用版本发布。

## 权限模型

- `projects`：登录用户仅能 CRUD 自己的行。
- `drawings`：登录用户仅能 CRUD 自己的行。
- `catalog_items`：匿名和登录用户均可读；登录用户只能新增 `accessory`，供制作图公司物料使用。
- `material_prices`：仅登录用户可读可写，全表共享。
- `suppliers`：匿名和登录用户均可读。
- `finished_harness_materials`、`finished_harness_cost_analyses`：仅登录用户可读，由种子或受信任脚本写入。
- `catalog-assets`：保持私有；匿名和登录用户只能读取被 `catalog_items.image_path` 或 `catalog_items.image_variants` 引用的对象。浏览器没有 Storage 写权限。
- `cost-analysis-sources`：保持私有，登录用户可读，用于认证下载成本分析来源 Excel。

项目和图纸均为硬删除。保存不做乐观锁或版本冲突检测，最后一个成功写入覆盖之前内容；浏览器内撤销/重做以及设计文件导入/导出不受影响。

## 初始化与运维

测试环境不迁移旧数据。得到明确重置授权后，按 [SQL 执行说明](../supabase/sql/README.md) 清理旧结构并从空库创建全部业务表、三个存储桶、RLS 和种子数据。

创建登录用户使用：

```powershell
npm run user:create -- user@example.com "password" "显示名"
```

脚本只调用 Supabase Auth Admin API，不写应用用户表。`SUPABASE_SECRET_KEY` 只能存在于受信任的服务端环境，不得暴露到前端、日志或仓库。

## 验收清单

1. 用户 A 无法读取或修改用户 B 的项目和图纸。
2. 同一账号更换浏览器后可加载并继续编辑项目与制作图纸。
3. 匿名用户可加载目录，登录用户可新增公司辅材但不能新增其他目录类型。
4. 只有目录表引用的图片路径可通过私有桶读取。
5. 项目保存、图纸保存、目录加载、BOM/报价、导入导出与 PDF 导出正常。
6. 远程重置前再次确认目标项目和测试数据可删除；未经授权不执行重置 SQL。
