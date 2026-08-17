# 简化独立制作图纸配置向导设计

## 状态

已获得用户对推荐方向的口头确认，等待书面规格复核后进入实施计划。

## 背景

独立制作图纸的“线图配置向导”当前包含“类型”“子类型”“线材类型”三个选择项。其中：

- “类型”混合了内线、外线和图库三种不同概念；内线与外线对生成结果没有实质差异，图库则属于加载模板流程。
- “线材类型”是前端固定枚举，当前不影响生成结果，也没有与所选 `wires` 资源建立可靠映射。
- “子类型”实际决定单头或双头、连接器数量和目标 PIN 校验，具有明确业务作用。
- 热缩套管当前是自由文本，但数据库已经有 `resource_items + protective_sleeves` 的规范资源模型和公开读取策略。

远程数据中还存在重复建模：一条热缩套管使用 `protective_sleeves`，另一条绘图用热缩套管使用 `accessories`。新流程应只认 `protective_sleeves`。

## 目标

- 将向导从四步简化为三步。
- 保留真正影响图纸结构的单头/双头选择，并将名称改为“端头形式”。
- 移除无效或容易误导的“类型”和手工“线材类型”选择。
- 将图库模板改为独立入口。
- 将热缩套管由自由文本改为 Supabase 资源选择。
- 保持已保存独立图纸和旧 `wizardSource` JSON 的兼容性。

## 非目标

- 不修改 `protective_sleeves` 表结构。
- 不在本次设计中增加热缩套管裁切长度、成本或库存计算。
- 不实现普通线、绞线、排线、并线、屏蔽线的不同渲染算法。
- 不在实施过程中自动修改远程数据库；远程 SQL 执行需要单独确认。
- 不重构与该向导无关的项目设计器或报价流程。

## 用户流程

### 入口

向导顶部提供两个清晰命令：

- “新建图纸”：进入三步配置流程。
- “从模板创建”：直接展示 Supabase 图库模板并载入选中版本。

图库不再作为“类型”下拉框中的一个选项。

### 第一步：连接器/模型

- 使用“端头形式”分段控件选择“单头”或“双头”。
- 单头时选择一个连接器或模型。
- 双头时分别选择左、右连接器或模型。
- 连接器和模型继续从 `resource_items` 及对应规格表读取。

### 第二步：属性与颜色

- 保留图号、线材规格、总长度、公差、模具有/无、批量编辑和逐芯线配置。
- 线材规格继续从 `resource_items + wires` 读取。
- 删除手工“线材类型”选择。界面展示所选数据库线材的名称和规格，不再维护独立枚举。
- 将热缩套管自由文本替换为可清空的数据库下拉选择。

### 第三步：预览

- 展示端头形式、连接器、线材、热缩套管、芯数、长度、公差和物料种类。
- 沿用现有错误与警告校验。
- 确认后生成 `DrawingDocument`，保存行为仍由 `drawing_documents` 和 `drawing_document_versions` 负责。

## 热缩套管数据设计

### 数据来源

读取以下联表数据：

- `resource_items`：`id`、`legacy_key`、`resource_name`、`model`、`resource_group`、`lifecycle_status`、`deleted_at`
- `protective_sleeves`：`material`、`color`、`sleeve_type`、`shrink_ratio`、`nominal_length_m`、`inner_diameter_as_supplied_mm`、`inner_diameter_recovered_mm`、`recovered_wall_thickness_mm`
- `resource_item_images`：可选主图

查询只返回：

- `resource_type = 'protective_sleeve'`
- `lifecycle_status = 'active'`
- `deleted_at is null`
- `sleeve_type = 'heat-shrink'`

现有 RLS 已允许匿名和登录用户读取有效资源，无需新增读取策略。

### 前端模型

- `DrawingCatalogResourceType` 增加 `protective_sleeve`，不再把该类型折叠成通用 `accessory`。
- `DrawingCatalogResource` 为套管提供可展示的规格摘要。
- `DrawingWizardDraft` 新增可选 `heatShrinkResource`，保存选中资源的稳定 ID 和显示快照。
- 旧字段 `heatShrink?: string` 暂时保留为只读兼容回退，新向导不再写入该字段。

### 生成结果

- 未选择热缩套管时，不生成套管图形和 BOM 行。
- 选择后，图纸标签使用资源名称，BOM 物料编码使用资源型号，物料去重使用 `resource_item_id`。
- 本次保持现有“一件套管”的用量语义，不新增裁切长度输入。

## 种子数据与升级策略

- 标准种子数据应使用 `resource_items(resource_type='protective_sleeve') + protective_sleeves` 表达绘图热缩套管。
- 新增幂等的绘图热缩套管种子记录，至少覆盖当前 Φ6 示例。
- 不再新增 `accessories.accessory_kind='heat-shrink'` 数据。
- 对已经存在的 accessory 版本只提供升级 SQL：先创建规范套管资源，再将旧资源设为 inactive 或软删除。
- 升级 SQL 不由前端执行，也不在未获得明确授权时自动执行到远程数据库。

## 兼容策略

- `DrawingTopology.drawingType` 和 `wireKind` 暂时保留在内部数据结构中，并为新草稿写入稳定默认值，避免扩大 JSON 迁移范围。
- 新界面不展示这两个字段，生成逻辑也不依赖它们。
- 已保存图纸中只有 `heatShrink` 字符串时，仍按旧标签生成；重新选择后改用 `heatShrinkResource`。
- `wizardSource` 仍可被旧图纸读取，不提升 `DrawingDocument.schemaVersion`。

## 错误处理

- 公共资源加载失败时显示可重试错误，不回退到硬编码套管列表。
- 套管列表为空时显示“暂无可用热缩套管”，但允许用户不选择并继续。
- 已选资源在刷新后失效时清除选择并提示重新选择，不能静默提交失效资源。
- 模板加载失败继续使用现有错误提示和重试行为。

## 测试范围

- Repository 能正确联表映射 `protective_sleeves`，并过滤非热缩、非 active 和软删除资源。
- 向导只显示三步，不再出现“类型”“线材类型”和“子类型”标签。
- “端头形式”正确控制单头和双头连接器数量及 PIN 校验。
- “从模板创建”仍能读取 `drawing_templates` 和 `drawing_template_versions`。
- 热缩套管选择正确影响物料种类、图纸对象和 BOM 行。
- 不选择热缩套管时不生成相关对象。
- 旧 `heatShrink` 字符串仍能生成旧图纸。
- 运行相关 Vitest、TypeScript 构建和 ESLint 检查。

## 验收标准

- 向导呈现“连接器/模型 → 属性与颜色 → 预览”三步流程。
- 单头/双头功能无回归。
- 图库模板有独立入口且功能无回归。
- 线材类型不再由用户手工选择。
- 热缩套管完全由有效 `protective_sleeves` 资源驱动，新图纸不再写自由文本。
- 标准种子 SQL 能幂等创建绘图热缩套管资源。
- 不执行未经授权的远程数据库写入。
