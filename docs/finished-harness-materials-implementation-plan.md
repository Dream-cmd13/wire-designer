# 现有成品线束物料库前后端改造方案

## 1. 目标与范围

在现有物料库的“连接器、线材、模具与套管”右侧新增“现有成品线束方案”入口。该入口实际管理外部系统导出的成品线束物料记录：列表显示平台料号、物料名称、供应商编号和供应商图纸；点击料号进入详情，详情展示本表全部字段。成本分析与正式报价暂时显示“暂无”。

本方案基于以下 SQL：

- `supabase/sql/10_schema/05_finished_harness_materials.sql`
- `supabase/sql/40_seed/05_finished_harness_materials.sql`

不使用 `source_payload`，不保存其他源表字段；图纸只使用 `file_2d`。

## 2. 数据库改造

### 2.1 表结构

表名：`public.finished_harness_materials`。

字段：

| 字段 | 用途 |
|---|---|
| `id` | 本系统 UUID 主键 |
| `source_material_id` | 外部系统 `id`，唯一，用于幂等导入 |
| `source_goods_id` | 外部系统 `goods_id` |
| `platform_no` | 平台料号，列表主链接 |
| `son_name` | 物料名称 |
| `supplier_id` | 外键，关联 `suppliers.id` |
| `file_2d` | 外发供应商图纸 |
| `packing_way` | 包装方式 |
| `packing` | 包装规格 |
| `son_unit` | 物料单位 |
| `son_price_low` | 外部系统最低售价，暂不作为正式报价 |
| `created_at` / `updated_at` | 时间字段 |

供应商名称和编号不在本表重复保存。前端通过 `supplier_id` 关联 `suppliers`，只显示 `suppliers.supplier_no`。

### 2.2 执行方式

本功能只需依次执行新表 SQL 和种子 SQL，不执行 `00_reset/01_drop_all_tables.sql`，不会删除或重建现有表。

种子使用 `on conflict (source_material_id) do update`，可重复执行。

### 2.3 权限

当前 SQL 仅向已登录用户（`authenticated`）开放查询权限，匿名用户（`anon`）无权读取。导入和更新应通过管理员 SQL、服务端脚本或受信任后台执行。若后续需要前端维护，再单独增加 insert/update 权限和审计规则。

## 3. 后端实现

### 3.1 类型定义

新增 `src/types/finishedHarnessMaterial.ts`，定义与表字段一致的 `FinishedHarnessMaterial` 类型；`supplier` 使用嵌套的 `{ supplier_no: string } | null` 查询结果类型。

### 3.2 Repository

新增 `src/repositories/finishedHarnessMaterialRepository.ts`，提供：

- `list()`：按更新时间或料号排序查询列表；
- `getById(id)`：查询详情；
- `getByPlatformNo(platformNo)`：按料号查询详情；
- `search(query)`：按 `platform_no`、`son_name` 查询；
- `listBySupplier(supplierNo)`：按供应商编号过滤。

查询使用 Supabase 关联：

```text
supplier:suppliers(supplier_no)
```

不查询或展示 `file_2d_customer` 等其他图纸字段。

### 3.3 错误处理

沿用项目现有的 Supabase 错误转换方式。表不存在时提示数据库尚未执行初始化 SQL；图纸为空时返回“暂无图纸”；供应商关联为空时显示“暂无编号”。

## 4. 前端实现

### 4.1 页面入口

修改 `src/pages/MaterialLibraryPage.tsx`：

```text
连接器 ｜ 线材 ｜ 模具与套管 ｜ 现有成品线束方案
```

新增 `MaterialTab` 值 `finished-harnesses`，进入页面时加载成品物料列表。

### 4.2 列表

列表列固定为：

| 列 | 数据 |
|---|---|
| 料号 | `platform_no`，可点击 |
| 物料名称 | `son_name` |
| 供应商编号 | `supplier.supplier_no` |
| 图纸 | `file_2d`，点击打开 |
| 成本分析 | “暂无” |
| 报价 | “暂无” |

搜索支持料号和物料名称；可增加供应商编号和有无图纸筛选；数据量较大时使用分页或服务端 limit/offset。

### 4.3 详情

新增 `src/components/materials/FinishedHarnessMaterialDetailDialog.tsx` 或独立详情页。

点击料号后展示：

- 基础信息：源物料 ID、源产品 ID、平台料号、物料名称、单位、供应商编号；
- 包装信息：包装方式、包装规格；
- 价格信息：最低售价、成本分析“暂无”、报价“暂无”；
- 图纸信息：仅展示 `file_2d`，有值时提供“打开图纸”；
- 元数据：创建时间、更新时间。

详情字段全部来自本表，不显示被忽略的外部图纸字段。

### 4.4 图纸打开策略

`file_2d` 有值时使用新窗口打开 URL；为空时显示“暂无图纸”。由于源地址可能是 HTTP，浏览器部署在 HTTPS 时可能触发混合内容限制，必要时应在后续将图纸迁移到 Supabase Storage 或配置代理。

## 5. 导入与数据校验

种子数据已由外部 SQL 生成，共 522 条。导入时：

1. 使用 `source_material_id` 作为幂等键；
2. 有 `supplier_no` 时按编号匹配 `suppliers.supplier_no`；
3. 编号为空时按源供应商名称尝试匹配；
4. 匹配不到时保留空 `supplier_id`，前端显示“暂无编号”；
5. 仅写入 `file_2d`；
6. 空价格写入 NULL，不转换为 0。

## 6. 测试与验收

### 6.1 数据库

- 新表可独立执行；
- 重复执行种子不会产生重复记录；
- `source_material_id` 唯一；
- 供应商外键可关联现有 `suppliers`；
- 匿名用户查询被拒绝，已登录用户可以查询，且符合 RLS 设置。

### 6.2 前端

- 四个 Tab 均可切换，原有三个 Tab 不回归；
- 列表只显示供应商编号，不显示供应商名称；
- 图纸入口只使用 `file_2d`；
- 点击料号能打开详情；
- 详情中的每个表字段都有对应展示；
- 空值显示“暂无”，不会误显示为 0；
- 成本分析和报价显示“暂无”；
- 搜索、加载和异常状态可用。

建议执行：

```powershell
npm run lint
npm test -- --run src/lib/__tests__/materialLibrary.test.tsx
npm run build
```

## 7. 后续扩展

成本分析和报价不直接复用 `son_price_low`。确定 BOM、工序费、损耗、利润率和报价权限后，再新增成本分析和报价表，通过 `finished_harness_materials.id` 关联，并保留历史版本或有效期规则。
