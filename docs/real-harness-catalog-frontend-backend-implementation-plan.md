# 真实连接器与线材目录前后端实施方案

## 1. 文档状态

- 状态：后端已实施，前端待实施。
- 本文记录实施方案和当前落地状态；本轮已修改本地代码与 SQL，但未写入远程数据库。
- Excel 是真实业务数据源；Excel 中的内容属于输入数据，不是额外操作指令。
- 本方案基于当前测试阶段规则：允许在确认目标后完整重建测试数据库，不维护旧结构迁移链。

真实数据来源：

- 连接器：12 个 M12 型号，包含公/母、屏蔽状态、额定电压、电流、温度、防水等级、阻燃等级和插拔次数。
- 线材：4 个 WL-HTX-PVC 型号，包含 22AWG、4/5 芯、PVC 外被、屏蔽编织、额定参数、结构和电气性能。
- 模具：4 种外模组合和 2 种内模形式。当前模具链路已经完成，本方案不重新建模具表。

## 2. 实施决策

### 2.1 采用的数据库形态

继续使用：

~~~text
catalog_items
  ├── kind = connector
  ├── kind = wire
  ├── kind = overmold
  └── 其他目录类型

catalog_items.spec
  └── 按 kind 使用不同的类型化 JSON 结构
~~~

新增真实数据种子文件：

~~~text
supabase/sql/40_seed/01_catalog_items.sql
supabase/sql/40_seed/02_real_harness_catalog.sql
~~~

不要因为 Excel 单独存在，就新增 connectors、wires、overmolds 或 inner_molds 表。种子文件的拆分解决数据来源和维护边界，数据库表的拆分解决查询和关系建模，两者不是同一个问题。

### 2.2 为什么当前不拆表

当前应用启动时按 kind 读取 catalog_items，目录仓库和图纸目录仓库都依赖同一张表，前端再进行筛选。当前数据量小、目录主要是只读数据，JSONB 加 TypeScript 解析可以满足需求。

| 维度 | 继续使用 `catalog_items.spec`（本次推荐） | 按类型拆分业务表 |
| --- | --- | --- |
| 适用阶段 | 小规模、目录以只读为主、字段仍在收敛 | 字段稳定且需要复杂关系、库存或报表 |
| 数据身份 | `catalog_items.id` 统一，项目只保存一个资源 ID | 需要公共资源表加类型表外键，关系更多 |
| 查询实现 | 一次按 `kind` 查询，仓库解析 `spec` | 多表查询或 JOIN，类型过滤更直观 |
| 类型约束 | SQL 做基础 JSONB 检查，TypeScript 做完整解析 | 列级约束、数值范围和索引更强 |
| 迭代成本 | 新增少量工程字段可直接扩展 JSONB 和类型 | 新增字段通常要迁移、回填和更新多套仓库 |
| 关系建模 | 不适合 PIN、兼容件、批次等强关系 | 适合 PIN 子表、兼容关系、库存批次和价格版本 |
| 当前改造量 | 延续现有仓库、RLS、图片和前端入口，改动小 | 需要同步仓库、RLS、seed、图片引用和测试，改动大 |
| 风险 | 字段拼写漂移、JSONB 运行时校验不足 | 表间数据不一致、迁移和 JOIN 遗漏 |

拆表的短期代价包括：

- 多表查询或 JOIN；
- 每种目录单独的 RLS、权限和测试；
- Storage 图片引用策略改造；
- 目录仓库和图纸仓库重复映射；
- 更复杂的 seed 执行顺序；
- 每次字段调整都需要 SQL 迁移。

因此本次将“真实 Excel 数据独立成 seed 文件”和“数据库按类型拆表”分开处理：前者解决数据来源、审计和重复责任，后者解决强关系和查询模型，不能因为有多个 seed 文件就推导出必须拆表。

### 2.3 未来可升级形态

满足下列任一条件时，再评估拆分类型表：库存/批次/价格版本需要独立生命周期；连接器 PIN、端子或兼容关系需要子表；需要按线材电气字段进行大量 SQL 聚合报表；或者 JSONB 校验和索引已经成为性能或数据质量瓶颈。届时再升级为：

~~~text
catalog_items
catalog_connector_specs
catalog_wire_specs
catalog_overmold_specs
~~~

保留 catalog_items 作为统一资源身份表，不建议直接完全抛弃统一目录。

### 2.4 本次最终架构结论

- **数据库**：保留一张 `catalog_items`，连接器、线材、模具继续通过 `kind` 区分；连接器和线材工程字段进入各自类型的 `spec`。
- **种子数据**：新增独立的 `02_real_harness_catalog.sql` 保存 Excel 中确认后的 12 个连接器和 4 个线材；同一 `kind + code` 只能由一个 seed 负责。
- **项目数据**：项目配置只保存 `resourceItemId`、长度、端部处理、接线和绘图几何；不复制整行 Excel 属性。
- **模具边界**：现有 4 种外模组合及其 PE 内模配对已经完成，本次只做回归验证，不新增模具表或重做模具模型。

## 3. 当前代码库基线

当前已完成：

- catalog_items 已有四条正式 overmold 记录；
- 外模材质、硬度、外型和内模配对有数据库约束；
- OvermoldSpec、CanvasModel.includeInnerMold、外模选择器、BOM 已形成闭环；
- 模具不需要重新实现。

当前未完成：

- 连接器虽然有基础字段和演示数据，但未覆盖 Excel 的 12 个真实型号及工程参数；
- 线材虽然有电子线和护套线抽象，但未覆盖 4 个真实 WL-HTX-PVC 型号及完整工程属性；
- 目录解析器会丢弃尚未声明的 spec 字段；
- BOM 和图纸输出仍存在按描述字符串匹配和单个 M12 型号硬编码的问题。

## 4. 数据契约

### 4.1 公共目录字段

继续使用 catalog_items 的公共字段：

- id：数据库 UUID；
- kind：connector、wire、overmold 等；
- code：稳定的小写 slug，满足现有数据库正则；
- name：界面显示名称；
- model：原始物料型号，例如 M12A04-07-093；
- manufacturer：制造商；
- resource_group：目录分组；
- description：补充说明；
- image_path、image_variants：图片资源；
- sort_order：显示顺序；
- spec：按 kind 区分的工程规格。

同一个真实型号只能由一个 seed 文件负责，不能同时出现在 baseline seed 和 real seed 中。

### 4.2 连接器 spec

现有字段继续保留：

- connectorType；
- series；
- pinCount；
- rowCount；
- pitchMm；
- pinLabels；
- housingMaterial；
- contactMaterial；
- nutMaterial。

新增字段：

- shielded：是否屏蔽；
- ratedVoltageV：额定电压；
- ratedCurrentA：额定电流；
- temperatureRangeC：温度范围，包含 min 或 max；
- ingressProtection：防水等级；
- flammabilityRating：阻燃等级；
- matingCyclesMin：最小插拔次数。

示例：

~~~json
{
  "connectorType": "male",
  "series": "M12 A-Coded",
  "pinCount": 4,
  "rowCount": 1,
  "pinLabels": ["1", "2", "3", "4"],
  "shielded": false,
  "ratedVoltageV": 60,
  "ratedCurrentA": 4,
  "temperatureRangeC": { "min": -40, "max": 105 },
  "ingressProtection": "IP67",
  "flammabilityRating": "UL94V-0",
  "matingCyclesMin": 500
}
~~~

Excel 中没有独立的端接方式、螺纹规格或外壳材质列时，不从型号字符串中自动猜测；原始型号保存在 model，后续确认后再新增字段。

### 4.3 线材 spec

现有字段继续保留：

- kind；
- ulNumber；
- awg；
- coreCount；
- shielded；
- coreColors；
- jacketMaterial；
- jacketColor。

新增字段：

- ratedVoltageV；
- temperatureRangeC；
- flameTest；
- rohsCompliant；
- conductorMaterial；
- conductorStructure；
- insulationMaterial；
- insulationDiameterMm；
- insulationDiameterToleranceMm；
- braidStructure；
- shieldCoverageRatio；
- jacketHardnessP；
- outerDiameterMm；
- outerDiameterToleranceMm；
- tensileStrengthPsi；
- elongationPercent；
- conductorResistanceOhmPerKmAt20C；
- insulationResistanceMOhmKm；
- coreColorDescription。

示例：

~~~json
{
  "kind": "jacketed",
  "ulNumber": "UL2464",
  "awg": 22,
  "coreCount": 4,
  "shielded": true,
  "coreColors": ["black", "black", "black", "black"],
  "coreColorDescription": "绞合黑色",
  "jacketMaterial": "PVC",
  "jacketHardnessP": 60,
  "jacketColor": "black",
  "ratedVoltageV": 300,
  "temperatureRangeC": { "max": 80 },
  "flameTest": "VW-1",
  "rohsCompliant": true,
  "conductorMaterial": "镀锡铜丝",
  "conductorStructure": "17/0.16TC",
  "insulationMaterial": "PVC",
  "insulationDiameterMm": 1.3,
  "braidStructure": "16*5/0.10TC",
  "shieldCoverageRatio": 0.6,
  "outerDiameterMm": 5.2,
  "outerDiameterToleranceMm": 0.2,
  "tensileStrengthPsi": 1500,
  "elongationPercent": 100,
  "conductorResistanceOhmPerKmAt20C": 59.4,
  "insulationResistanceMOhmKm": 10
}
~~~

芯线颜色在 Excel 中是描述性文本，不一定是每一芯的独立颜色。coreColors 只有在业务确认映射后才能写入，不能用默认颜色掩盖不确定性。

### 4.4 项目实例与目录事实的边界

目录中保存：

- 额定电压、电流、温度；
- 材料、结构、认证；
- 屏蔽和编织；
- 外径及公差；
- 原始型号和制造商。

CanvasWireMaterial 中保存：

- 项目长度；
- 端部剥皮和端接；
- 接线明细和芯线绑定；
- 画布位置和宽度；
- 用于绘图的名义外径。

不要把完整 Excel 行复制进 CanvasWireSpec，避免目录修改后项目快照出现大量重复和不一致。

## 5. 后端实施方案

本项目后端指 Supabase SQL、目录解析器、目录仓库和配置 JSON 适配层。

### B0：契约和数据门禁

文件：

- docs/real-harness-catalog-frontend-backend-implementation-plan.md

工作：

1. 冻结字段名、单位和 optional/required 规则。
2. 确认真实型号的稳定 code 和 UUID。
3. 确认 WL-HTX-PVC-034 的 65% 与 0.6 覆盖率冲突。
4. 确认是否需要 source/dataset 字段来区分演示数据和真实数据。

产出：

- 连接器和线材字段字典；
- 真实 seed 的唯一数据责任边界；
- 允许进入实现阶段的未决问题清单。

### B1：SQL schema 和 seed

文件：

- supabase/sql/10_schema/02_catalog.sql
- supabase/sql/40_seed/01_catalog_items.sql
- supabase/sql/40_seed/02_real_harness_catalog.sql
- supabase/sql/README.md

工作：

1. 保留 catalog_items、kind/code 唯一约束和现有模具约束。
2. 新建 02_real_harness_catalog.sql，插入 12 个真实连接器和 4 个真实线材。
3. 将 baseline seed 中重复的真实 M12 行移到 real seed。
4. real seed 使用事务和 on conflict (kind, code) 保证幂等。
5. 对新增 JSON 字段增加基础类型检查；旧演示记录缺少工程字段时允许为空。
6. 需要区分演示和真实数据时，增加公共 source/dataset 字段，而不是把来源写进 resource_group。
7. README 增加 seed 执行顺序和测试库重建说明。

不做：

- 不新增 connectors、wires、overmolds、inner_molds 表；
- 不修改 projects 和 drawings 表；
- 不修改外模四种组合；
- 不增加价格字段，Excel 没有价格数据。

### B2：目录行解析

文件：

- src/lib/catalogItem.ts
- src/lib/wireCatalog.ts

工作：

1. 扩展 CatalogItemSpecByKind.connector。
2. 扩展 CatalogItemSpecByKind.wire。
3. 增加 temperatureRangeC、数字、公差和布尔值的解析辅助函数。
4. 解析后返回完整的已知字段，不能静默丢弃新增字段。
5. 对 connectorType、pinCount、pinLabels、shielded、额定参数进行校验。
6. 对 wire kind、UL、AWG、芯数、屏蔽、外径、公差和核心颜色进行校验。
7. 继续允许旧的通用目录记录使用缺省工程属性。
8. 对无明确芯线颜色映射的真实线材保留 coreColorDescription。

### B3：目录仓库

文件：

- src/lib/catalogRepository.ts
- src/lib/drawingCatalogRepository.ts

工作：

1. listConnectors() 映射完整连接器工程属性。
2. listWires() 映射真实型号、制造商、资源分组、描述和完整线材规格。
3. CatalogWire 必须携带 model 或等价的真实型号字段。
4. 线材选择时优先使用目录 outerDiameterMm；无目录值时才计算 OD。
5. DrawingCatalogRepository 为连接器和线材生成可读规格摘要。
6. 继续保留 overmold 到图纸 model 资源的现有投影，避免误删模具能力。

### B4：配置 JSON 适配

文件：

- src/lib/harnessConfigSchema.ts
- src/types/harness.ts
- src/types/catalog.ts

工作：

1. Connector 领域类型增加新增工程字段。
2. readConnector() 保存和加载新增字段。
3. 修复现有 housingMaterial、contactMaterial、nutMaterial 等字段在配置解析时被裁剪的问题。
4. CanvasWireSpec 只增加绘图所需的外径公差或名义外径字段，不复制全部目录属性。
5. resourceItemId 继续作为项目实例和目录资源的关联键。

### B5：后端测试和数据库验证

文件：

- src/lib/__tests__/catalogItem.test.ts
- src/lib/__tests__/catalogRepository.test.ts
- src/lib/__tests__/wireCatalog.test.ts
- src/lib/__tests__/drawingCatalogRepository.test.ts
- src/lib/__tests__/databaseSchemaSql.test.ts

测试内容：

1. 12 个真实连接器的代表性公/母、屏蔽/非屏蔽、4/5/8 PIN 数据可解析。
2. 4 个真实线材的 4/5 芯、屏蔽/非屏蔽、外径和公差可解析。
3. 错误温度、额定值、外径、芯数和布线数组会被拒绝。
4. 多个 seed 文件汇总后的型号和 kind 数量正确。
5. baseline 和 real seed 不存在同一 kind/code 重复责任。
6. 四条模具记录和现有外模约束继续通过。

只有获得明确授权后，才按 supabase/sql/README.md 的顺序重建测试 Supabase。远程数据库当前是否已经执行最新 SQL，不能由本地仓库推断。

## 6. 前端实施方案

### F0：共享类型和目录快照

文件：

- src/types/harness.ts
- src/types/catalog.ts
- src/lib/catalogRuntime.ts
- src/stores/catalogStore.ts

工作：

1. 扩展 Connector 和 CatalogWire 类型。
2. 保持 CatalogSnapshot 的 connectors、wires、overmolds 入口不变。
3. 确认 catalogRuntime 和 catalogStore 能直接承载扩展后的快照。
4. 不把 Supabase 原始 JSON 行暴露给组件。

### F1：连接器选择和目录页

文件：

- src/components/shared/PartPickerDialog.tsx
- src/pages/ConnectorLibraryPage.tsx
- src/components/canvas/ConnectorPropertiesDialog.tsx

工作：

1. 选择器增加屏蔽状态、系列等筛选。
2. 详情区域显示额定电压、电流、温度、防水、阻燃和插拔次数。
3. 连接器库显示真实 model，而不只显示 slug code。
4. 连接器属性弹窗显示目录只读工程属性。
5. 选择和替换连接器时保留 resourceItemId。
6. 连接器节点本身不承担目录属性编辑，避免项目实例修改制造商数据。

### F2：线材选择和配置

文件：

- src/components/canvas/WireMaterialDialog.tsx
- src/components/canvas/WireMaterialNode.tsx
- src/components/drawings/standalone/DrawingResourceSelect.tsx
- src/components/drawings/standalone/StandaloneDrawingWizard.tsx

工作：

1. 线材列表显示真实型号和关键规格。
2. 详情显示额定电压、温度、VW-1、ROHS、导体结构、编织、覆盖率和外径公差。
3. 选择真实目录线材后使用目录名义外径。
4. 长度和端部处理仍然由项目实例编辑。
5. 修改目录决定字段后解除 resourceItemId 关联或重新匹配。
6. 线材芯线颜色显示结构化颜色和原始描述。
7. 线材节点只使用项目实例中的几何值，不直接读取原始 Supabase 行。

### F3：BOM、图片和图纸规格

文件：

- src/lib/bom.ts
- src/components/panels/BomPanel.tsx
- src/components/drawings/TwoDView.tsx
- src/lib/productionDrawingLayout.ts
- src/lib/productionDrawingGenerator.ts

工作：

1. BOMItem 增加 resourceItemId 或等价目录身份字段。
2. 连接器 BOM 按真实目录身份分组并显示 model。
3. 线材 BOM 按资源 ID、长度和端部处理区分，不再只靠 AWG/芯数。
4. 删除 TwoDView 中单个 M12 型号的硬编码特判。
5. 删除 TwoDView 中固定导体结构、固定外径公差和固定无纺布描述。
6. 线材规格从目录 spec 和项目实例组合生成。
7. BomPanel 图片关联按 resourceItemId，不再按描述字符串反查。
8. 模具 BOM 和布局计数逻辑保持原样，只补回归测试。

### F4：前端测试

文件：

- src/lib/__tests__/partPickerDialog.test.ts
- src/lib/__tests__/wireMaterialDialog.test.ts
- src/lib/__tests__/bom.test.ts
- src/lib/__tests__/productionDrawingLayout.test.ts
- src/lib/__tests__/normalizeHarnessConfig.test.ts
- 必要时新增组件交互测试

测试内容：

1. 连接器筛选可区分屏蔽和非屏蔽。
2. 连接器详情显示完整工程字段。
3. 线材选择后保留项目长度和端部处理。
4. 线材选择后应用真实外径和公差。
5. 4 芯屏蔽、4 芯非屏蔽、5 芯屏蔽和 5 芯非屏蔽不会合并成同一 BOM 项。
6. 项目保存和重新加载不会丢失目录关联。
7. 图纸输出使用真实型号和真实结构字段。
8. 模具选择、内模开关和模具 BOM 回归通过。

## 7. 跨层实施顺序

~~~text
1. 冻结字段、单位、code 和数据来源规则
2. 将 Excel 原始描述与结构化字段同时写入真实 seed，不以冲突阻塞入库
3. 新增真实 seed SQL，移除 baseline 中重复真实型号
4. 更新目录类型、解析器和仓库
5. 更新配置 JSON 的保存/加载
6. 更新连接器前端
7. 更新线材前端
8. 重构 BOM、图片关联和图纸规格输出
9. 运行定向测试、Lint 和构建
10. 获得授权后重建测试数据库并做页面走查
~~~

后端契约必须先于前端组件；BOM 重构必须在 resourceItemId 和完整目录映射完成后进行。

## 8. 验收标准

### 数据库和后端

- 真实 seed 独立存在且可重复执行；
- 12 个连接器和 4 个线材都能通过目录解析；
- 真实型号、额定参数和线材工程属性没有被丢弃；
- 旧通用目录记录仍可正常加载；
- catalog_items 仍然是唯一公共目录入口；
- 模具四种组合和内模关联不发生回归；
- 没有未经授权的远程数据库写入。

### 前端

- 连接器可以按型号、PIN、类型、屏蔽状态和系列筛选；
- 连接器工程参数可以查看但不会被项目实例随意修改；
- 线材可以选择 4 个真实型号并查看工程属性；
- 项目长度、端部处理和接线明细仍然独立可编辑；
- BOM 显示真实型号，且相似线材不会错误合并；
- 图纸规格不再使用固定 M12、固定导体结构或固定公差；
- 模具选择和模具 BOM 行为保持不变。

## 9. 风险和处理

| 风险 | 处理 |
| --- | --- |
| real seed 与 baseline seed 重复 | 由单一 seed 文件负责每个真实型号 |
| code 和原始 model 大小写不同 | code 使用稳定 slug，model 保留原文 |
| Excel 芯线颜色不是逐芯数据 | 保存 coreColorDescription，确认后再生成 coreColors |
| WL-HTX-PVC-034 覆盖率冲突 | seed 定稿前人工确认，不在代码中猜测 |
| JSONB 字段拼写漂移 | CatalogItemSpecByKind + 解析器严格校验 |
| 真实数据和演示数据混在 UI | 需要时增加 source/dataset，并在目录查询处过滤 |
| 目录修改后项目规格过期 | 项目保存 resourceItemId 和绘图必要的名义外径 |
| 远程库仍是旧结构 | 先读取确认，授权后按完整重建流程执行 |
| 拆表后重复改造仓库和 RLS | 当前阶段维持统一表，达到升级条件再做子表化 |

## 10. 不在本次范围内

- 模具外模/内模领域模型重做；
- 新增独立内模库存；
- 连接器库存、供应商报价和采购管理；
- 线材批次、库存和价格版本；
- Excel 自动上传服务；
- 生产环境数据库重建；
- 从 Excel 推导未提供的端接方式、螺纹规格或材料；
- 修改现有报价规则。

## 11. 执行前确认项

- [ ] 确认采用 catalog_items + spec，不拆三张业务表；
- [ ] 确认真实种子文件名为 02_real_harness_catalog.sql；
- [ ] 确认是否保留演示数据并在 UI 中区分；
- [ ] 确认连接器和线材字段命名、单位；
- [x] 已将 WL-HTX-PVC-034 的结构化覆盖率 `0.6` 与原始描述 `65%` 同时写入 seed；
- [ ] 确认芯线颜色到 coreColors 的映射；
- [ ] 确认测试 Supabase 可在授权后完整重建；
- [x] 后端类型、解析器、仓库、配置适配和 SQL 静态/自动化测试已完成；
- [ ] 前端目录展示、BOM 和图纸改造仍待实施。
