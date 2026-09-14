# 厂商编号替代厂商名称显示方案

## 1. 背景

当前物料和连接器数据使用 `manufacturer` 字段保存厂商名称，页面、BOM 和导出结果可能直接显示“昌骏”“鼎力”等真实厂商名称。

现有对照表提供了厂商名称与厂商编号的对应关系，例如：

| 厂商名称 | 厂商编号 |
| --- | --- |
| 昌骏 | A227 |
| 鼎力 | A118 |
| 东莞市友源电工材料有限公司 | A526 |
| 犇凯 | A486 |

目标是：内部保留厂商名称，面向用户的物料库、BOM、图纸和导出结果显示厂商编号。

## 2. 推荐方案

新增厂商字典表，并在物料表中通过外键关联厂商。厂商名称和厂商编号集中维护，前端不直接维护硬编码映射。

数据关系如下：

```text
suppliers
  ├─ supplier_name  厂商名称，仅供内部管理
  └─ supplier_no    厂商编号，对外显示

catalog_items
  └─ supplier_id    关联 suppliers.id
```

## 3. 数据库设计

建议新增表：

```sql
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  supplier_no text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_unique unique (supplier_name),
  constraint suppliers_no_unique unique (supplier_no)
);
```

在现有物料表使用关联字段：

```sql
alter table public.catalog_items
  add column supplier_id uuid references public.suppliers(id);

测试阶段直接完成结构切换，删除旧的 `manufacturer` 字段：

```sql
alter table public.catalog_items
  drop column manufacturer;
```

`supplier_id` 成为厂商信息的唯一来源，所有用户可见编号通过关联的 `suppliers.supplier_no` 获取。
```

如果线材、护套等其他物料表也保存厂商信息，应同步增加 `supplier_id`。原有 `manufacturer` 字段可在第一阶段保留，作为导入和历史数据核对依据；完成回填并确认所有读取路径切换后，再决定是否删除或改名。

## 4. 数据导入与回填

将现有对照表整理为去重后的厂商字典，只保留一条名称与编号关系。例如多个“犇凯 A486”重复行只导入一次。由于当前仍是测试数据，种子脚本和现有数据直接调整为新结构，不保留双写或兼容字段。

回填流程：

1. 从现有种子数据和对照表提取厂商名称，导入 `suppliers`。
2. 按原始厂商名称回填 `catalog_items.supplier_id`。
3. 查询未匹配的厂商名称，补充对照表后再次回填。
4. 检查同一厂商是否对应多个编号、同一编号是否对应多个厂商。
5. 确认所有物料都完成关联后，删除 `manufacturer` 字段。

示例检查 SQL：

```sql
select distinct supplier_id
from public.catalog_items
where supplier_id is null;
```

## 5. 前端和业务层调整

### 5.1 数据读取

物料查询接口应返回：

```ts
{
  supplierId: string | null;
  supplierNo: string | null;
  supplierName?: string;
}
```

普通业务接口只返回 `supplierNo`；厂商名称仅在管理和数据维护接口内部使用，不再进入普通物料模型。

### 5.2 显示范围

以下位置统一显示厂商编号：

- 物料库列表及筛选器；
- 连接器选择弹窗和属性弹窗；
- BOM 明细；
- 图纸或生产数据中的厂商字段；
- Excel、CSV、PDF 等导出结果。

搜索功能建议同时支持厂商编号和内部厂商名称，但搜索结果和页面展示只显示厂商编号。

### 5.3 缺失编号处理

当 `supplier_id` 为空或厂商没有编号时，显示“未配置厂商编号”，不要回退显示真实厂商名称。这样可以避免未完成映射的数据意外暴露厂商名称。

## 6. 权限和安全

- 普通业务接口只返回 `supplier_no`，不返回 `supplier_name`。
- 管理接口可返回名称和编号，用于维护对照表。
- 导入文件和数据库脚本不应把厂商名称写入面向用户的导出文件。
- 对 `supplier_name` 和 `supplier_no` 保持唯一约束，避免产生歧义映射。

## 7. 实施顺序

1. 创建 `suppliers` 表和唯一约束。
2. 增加物料表的 `supplier_id` 字段。
3. 导入并去重厂商对照表。
4. 回填现有物料数据并处理未匹配项。
5. 删除 `catalog_items.manufacturer`。
6. 修改查询层、类型定义、种子脚本和业务组装逻辑。
7. 修改物料库、选择弹窗、属性弹窗、BOM、图纸和导出显示。
8. 更新所有相关测试夹具和断言。
9. 增加缺失编号和重复映射检查。

## 8. 验收标准

- “昌骏”对应的所有用户可见位置显示 `A227`。
- “鼎力”“犇凯”等对照表中的厂商显示正确编号。
- 页面、BOM 和导出结果不显示真实厂商名称。
- 未配置编号的记录显示“未配置厂商编号”，不会泄露厂商名称。
- 物料库可以按厂商编号筛选和搜索。
- 新增物料只需选择厂商字典项，不需要在前端代码中新增映射。
- 重复厂商名称或编号无法保存，未匹配数据可以被检查出来。
- 数据库和代码中不再依赖 `catalog_items.manufacturer`。

## 9. 结论

测试阶段直接采用“厂商字典表 + 物料关联字段”的最终结构，并同步完成前后端、种子数据和测试切换。`manufacturer` 删除后，厂商编号由 `suppliers.supplier_no` 统一提供，避免前端硬编码和多处数据源不一致。
