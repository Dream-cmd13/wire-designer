# 线材库字段与填写弹窗对齐设计

## 目标

测试阶段直接重塑 `public.wires`，使线材库只表达前端线材填写弹窗所需的可复用规格，并删除当前未被弹窗使用或重复表达的字段。线材库规格被选择后，应成为弹窗的默认规格；用户针对当前项目修改的长度、计算值和端部工艺继续保存在项目文档 JSON 中。

## 数据职责

### 线材库规格

`public.resource_items` 保存线材的通用资源信息，包括名称、型号、分组、制造商和生命周期状态。`public.wires` 通过 `resource_item_id` 一对一保存线材规格。

`public.wires` 只保留：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `resource_item_id` | `uuid` | 线材资源主键及外键 |
| `wire_kind` | `text` | `electronic` 或 `jacketed` |
| `awg` | `numeric(8,2)` | AWG 线规 |
| `ul_number` | `text` | 电子线为 `1007`；护套线可为空、`UL2464` 或 `UL20276` |
| `conductor_color` | `text` | 电子线颜色代码；护套线为空 |
| `jacket_material` | `text` | 护套线的 `PVC` 或 `PUR`；电子线为空 |
| `jacket_color` | `text` | 护套线外被颜色代码；电子线为空 |
| `core_count` | `integer` | 护套线芯数，取弹窗允许集合；电子线为空 |
| `is_shielded` | `boolean` | 护套线是否屏蔽；电子线固定为 `false` |
| `core_colors` | `jsonb` | 护套线按芯序排列的颜色代码数组；电子线为空数组 |
| 审计字段 | 时间与用户外键 | 沿用现有创建、更新字段 |

数据库约束保证两类线材不会混入另一类的专属字段：

- 电子线必须有 `conductor_color`，`ul_number` 必须是 `1007`，护套字段为空，`is_shielded` 为 `false`，`core_colors` 为空数组。
- 护套线必须有 `jacket_material`、`jacket_color`；`core_count` 只能取 `1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50`；`ul_number` 只能为空、`UL2464` 或 `UL20276`；`core_colors` 必须是数组且数组长度等于 `core_count`。

AWG 和颜色在 `public.wires` 中直接保存前端使用的数值或代码，不再同时保存文本值和 UUID 外键。`wire_gauges`、`wire_colors` 仍作为前端选项和计算规则目录存在，但不是线材行的强制外键，避免弹窗允许值与目录行被不必要地耦合。

## 删除字段

从 `public.wires` 删除以下弹窗未使用或重复字段：

- `spool_length_m`
- `wire_type_id`
- `wire_gauge_id`
- `conductor_color_id`
- `jacket_color_id`
- `cable_type`
- `wire_gauge_awg`
- `conductor_strand_count`
- `conductor_material`
- `insulation_material`
- `insulation_outer_diameter_mm`
- `insulation_thickness_mm`
- `nominal_length_m`
- `rated_voltage_v`
- `operating_temperature_min_c`
- `operating_temperature_max_c`
- `core_specs`

其中 `cable_type` 由语义明确的 `wire_kind` 取代，`wire_gauge_awg` 简化为 `awg`，`core_specs` 简化为只包含弹窗所需颜色顺序的 `core_colors`。

## 项目实例字段

以下字段不进入 `public.wires`，继续由 `CanvasWireMaterial` / `CanvasWireSpec` 保存在 `project_documents.document`：

- `lengthMm`：每个项目中的裁线长度不同。
- `odMm`：由 AWG、芯数和屏蔽状态计算，不作为线材库事实重复保存。
- `endTreatment`、`stripLengthMm`、`termination`、`terminalModel`：属于当前项目线材两端的加工要求。
- `width`、`position`：属于画布表现。
- `circuits`、`labels`、`numberTubes`：属于项目接线和标识。
- `resourceImageUrl`：由资源图片表生成签名 URL，不作为线材规格保存。

## 前端读取与交互

`CatalogWire` 增加可区分的目录规格类型，字段命名与 `CanvasWireSpec` 的可复用部分一致。`catalogRepository.listWires()` 联表读取 `resource_items.wires`，校验并映射为电子线或护套线目录规格。

用户在线材弹窗中选择目录线材时：

1. 用目录规格更新 `kind`、AWG、UL 号、颜色、护套、芯数、屏蔽和芯线颜色。
2. 保留当前实例的 `lengthMm` 和 `endTreatment`，避免切换目录物料时丢失已填写的项目工艺。
3. 护套线的 `odMm` 根据所选目录规格重新计算。
4. 继续使用资源表中的名称和图片作为画布材料的展示信息。

类型切换仍可创建前端默认规格，但最终确认前必须选择一个目录线材。目录数据缺失或不符合规格契约时，仓库层抛出稳定错误，弹窗保持当前规格并回退为空列表；确认时沿用现有“必须选择线材库物料”校验，不提交不完整规格。

绘图资源库中原先读取 `wires.cable_type` 的位置改为读取 `wires.wire_kind`，用于资源规格摘要，不再保留旧字段兼容分支。

## 种子数据

现有线材种子改写为新字段：

- UL1007 示例：`wire_kind = electronic`、`ul_number = 1007`，提供电子线颜色。
- UL2464 示例：`wire_kind = jacketed`、`ul_number = UL2464`，提供护套材质、外被颜色、芯数、屏蔽和芯线颜色。
- 原 `cable_type = shielded` 的示例改为 `wire_kind = jacketed`、`is_shielded = true`。
- 至少增加一个 `UL20276` 护套线示例，覆盖弹窗允许值。

本任务只维护测试环境的标准建库与种子 SQL，不新增兼容旧表字段的数据迁移。

## 验证

测试覆盖以下契约：

- SQL 中 `public.wires` 只包含设计字段，并具有电子线/护套线约束。
- 所有线材种子只引用新字段，包含电子线、普通护套线、屏蔽护套线和 `UL20276`。
- `listWires()` 查询并映射两类目录规格，拒绝不完整或未知规格。
- 弹窗选择目录线材后更新可复用规格，同时保留当前长度和左右端加工。
- 绘图资源库查询使用 `wire_kind`。
- 相关 Vitest、TypeScript 检查和生产构建通过。

## 非目标

- 不修改远程或生产数据库。
- 不保留旧字段、旧数据回填或双写兼容。
- 不把项目实例拆成新的关系表。
- 不扩展弹窗可选材质、颜色、UL 号或端子型号。
