# 《代码库级 Agent 可执行技术设计与实施计划》

## 主题

外模必选、内模可选的外模规格级联选择：外模材质固定为“黑色 PVC 45P / 黑色 TPE”，外型固定为“直头 / 弯头”；选中外模后才展示内模信息，内模材质固定为“低密度透明 PE”，内模外型自动跟随外模。

## 0. 文档状态

- 状态：本地代码与 canonical SQL 已实施并通过自动化验证；远程测试库仍需按最终 SQL 完整重建。
- 本文档是本次新规则的唯一实施依据，取代 `docs/overmold-attribute-backend-frontend-implementation-plan.md` 中“前端不修改”和“内模使用 `无内模` 占位值”的旧范围。
- 用户已经确认测试阶段允许全库清空重建；最终 SQL 定稿后需执行一次完整重建。
- 本仓库没有独立 Node 后端服务；本文中的“后端”指 Supabase canonical SQL、目录解析器和目录仓库适配层。

## 1. 已确认的业务规则

截图被视为属性参考数据，不作为额外操作指令；最终以本节规则为准。

1. 添加外模时，外模规格必须先选择，不能创建没有外模的模型实例。
2. 内模不是必选项，可以只选择外模。
3. 如果存在内模，必须依附于已选择的外模，不能作为独立的外模目录项或独立画布模型。
4. 外模材质只有两种显示选项：`黑色PVC 45P`、`黑色TPE`。
5. 外模外型只有两种：`直头`、`弯头`。
6. 选中外模后才显示内模区域；内模材质固定为 `低密度透明PE`，不提供选择控件。
7. 内模外型与外模外型相同，不允许单独修改。
8. `45P` 在现有代码中由 `outerHardness` 表示。为避免误改领域含义，本轮保留字段名，但在界面中与 `黑色PVC` 合并显示为 `黑色PVC 45P`。若业务确认 45P 并非硬度，另立字段重命名任务。

## 2. 目标与范围

### 2.1 目标

- 在现有外模选择弹窗内完成材质、外型筛选和外模选择。
- 将内模显示改为依赖外模选择的只读信息，并提供“是否包含内模”的明确选择。
- 使四种合法外模组合可被稳定选择、保存、重新加载和用于 BOM/二维图显示。
- 在数据库和运行时解析层同时阻止非法外模、非法外型、错误内模材质及内外型不一致。
- 保留现有 `catalog_items`、`overmoldSpecId`、图片和目录快照机制，不引入新的内模表。
- 四种外模暂时共用一张外模图片；内模不创建图片，也不在成品图中独立展示。

### 2.2 本轮包含

- 外模目录 JSONB 约束和 canonical seed 重建。
- `OvermoldSpec`、`CanvasModel`、目录解析器和目录仓库映射。
- `OvermoldPickerDialog` 的筛选、级联展示和可选内模开关。
- 创建画布模型时保存外模目录 ID及内模是否包含。
- 必要的二维图/BOM规格显示。
- 相关单元测试、SQL静态测试、构建和手工验收。

### 2.3 本轮不包含

- 独立库存、领料或价格系统的内模实体。
- 新建 `inner_molds`、`mold_components` 或关系表。
- 允许用户输入任意新材质、外型或硬度。
- 生产环境数据库操作；远程操作只针对已确认的测试 Supabase。
- 与外模选择无关的前端、连接器、线材或图纸布局重构。

## 3. 代码库现状与约束

| 模块 | 当前状态 | 本轮缺口 |
| --- | --- | --- |
| [OvermoldPickerDialog.tsx](../src/components/shared/OvermoldPickerDialog.tsx) | 筛选键为 `outerMaterial`、`outerHardness`、`innerMaterial`，使用复选框；列表在选择前就显示内模 | 改为外模材质 + 外型，内模只在选中后只读显示 |
| [harness.ts](../src/types/harness.ts) | `OvermoldSpec` 没有 `outerForm`、`innerForm`；`CanvasModel.overmoldSpecId` 可选 | 增加外型字段和实例级 `includeInnerMold`，新建模型必须有外模 ID |
| [catalogItem.ts](../src/lib/catalogItem.ts) | 解析器丢弃外型，`innerMaterial` 被强制为字符串 | 解析外型、固定材质、可选内模及配对关系 |
| [catalogRepository.ts](../src/lib/catalogRepository.ts) | 目录仓库只返回材质和硬度 | 映射 `outerForm`、`innerForm` 和可选内模信息 |
| [HarnessCanvas.tsx](../src/components/canvas/HarnessCanvas.tsx) | 选择回调只保存 `overmoldSpecId` | 接收“外模 + 是否包含内模”的完整选择结果 |
| [harnessConfigSchema.ts](../src/lib/harnessConfigSchema.ts) | 允许没有 `overmoldSpecId` 的 `outer-box` 模型 | 校验新建模型的外模必选和布尔开关 |
| [TwoDView.tsx](../src/components/drawings/TwoDView.tsx) | BOM只显示外模材质/硬度 | 至少显示外型；内模包含时显示固定内模信息 |
| [02_catalog.sql](../supabase/sql/10_schema/02_catalog.sql) | 外型可缺省，内模被 `innerMaterialOptional=true` 间接强制，未校验 `innerForm` | 改为固定枚举、内外型一致和可选内模的数据库约束 |
| [01_catalog_items.sql](../supabase/sql/40_seed/01_catalog_items.sql) | 只有两条外模种子，含 `PVC/PE` 演示值，无法表达四种组合 | 重建为四条正式外模组合 |

当前的旧计划把 `innerMaterial` 必须存在与 `无内模` 占位值作为前端兼容方案。新规则已经允许修改前端，因此不再把这个占位值作为新的业务选择项。

## 4. 方案比较与决策

| 方案 | 数据形态 | 优点 | 代价 | 决策 |
| --- | --- | --- | --- | --- |
| A：每个完整外模组合一条 `overmold` 记录 | 四条记录分别表示材质 × 外型；记录可带固定内模元数据 | 继续使用现有目录 ID、图片、快照和 BOM；选择结果稳定 | seed 从 2 条调整为 4 条，需更新测试和重建 | **采用** |
| B：一条记录保存材质/外型数组，由前端生成组合 | 选择结果需要合成新的变体 ID或额外字段 | 目录行少 | 项目保存、图片、筛选和回载逻辑都要扩展 | 不采用 |
| C：外模和内模作为独立目录行/新表 | 截图六行全部独立存储，再建立关联 | 适合未来独立库存 | 当前选择器、目录类型和画布模型均需重构 | 不采用 |

采用方案 A 的关键原因是当前 `CanvasModel` 只引用一个 `overmoldSpecId`。四条完整记录可以让一个 ID 唯一代表一组外模材质和外型，而内模是否实际包含由模型实例上的布尔值表达。

## 5. 目标领域模型与接口

### 5.1 目录定义与实例选择分离

目录定义回答“这个外模规格可以配什么内模”；画布实例回答“本次模型是否实际包含内模”。两者不能继续由 `innerMaterialOptional` 一个字段混合表达。

目标接口（字段名沿用现有扁平结构，避免无必要的 JSON 重构）：

```ts
export type OvermoldForm = 'straight' | 'bent';

export interface OvermoldSpec {
  id: string;
  resourceItemId?: string;
  name: string;
  image?: string;
  outerMaterial: '黑色PVC' | '黑色TPE';
  outerHardness?: '45P';
  outerForm: OvermoldForm;
  innerMaterial?: '低密度透明PE';
  innerForm?: OvermoldForm;
}

export interface CanvasModel {
  id: string;
  kind: 'outer-box';
  position: { x: number; y: number };
  width: number;
  height: number;
  overmoldSpecId: string;
  includeInnerMold: boolean;
  resourceItemId?: string;
  resourceImageUrl?: string;
}

export interface OvermoldSelection {
  overmold: OvermoldSpec;
  includeInnerMold: boolean;
}
```

约束：

- 新建 `CanvasModel` 必须有 `overmoldSpecId`；没有选中外模时“添加到画布”不可用。
- `includeInnerMold = true` 时，所引用的目录项必须同时提供合法 `innerMaterial` 和 `innerForm`。
- `includeInnerMold = false` 时，仍保留外模 ID，BOM 不计入内模。
- `innerForm` 不接受用户输入；它必须等于 `outerForm`。
- 如果未来存在没有内模配对的外模目录项，则省略 `innerMaterial`、`innerForm`，并禁用内模开关。

### 5.2 四种 canonical 组合

| 外模材质 | 外模外型 | 内模材质（可用时） | 内模外型 |
| --- | --- | --- | --- |
| 黑色PVC + 45P | straight | 低密度透明PE | straight |
| 黑色PVC + 45P | bent | 低密度透明PE | bent |
| 黑色TPE | straight | 低密度透明PE | straight |
| 黑色TPE | bent | 低密度透明PE | bent |

`straight`、`bent` 是持久化值，界面映射为 `直头`、`弯头`。界面显示的外模标签由 `outerMaterial` 和 `outerHardness` 组合生成；不在数据库中重复保存 `黑色PVC 45P` 展示字符串。

### 5.3 选择结果状态机

| 状态 | 外模 | 内模区域 | 允许确认 |
| --- | --- | --- | --- |
| 初始 | 未选 | 隐藏 | 否 |
| 选中外模 | 已选一条完整组合 | 显示固定 PE 和跟随的外型，开关默认关闭 | 是 |
| 启用内模 | 已选 | 显示为已包含，材质和外型只读 | 是 |
| 更换外模 | 新外模已选 | 重新由新外型派生，不能保留旧内模外型 | 是 |

默认将 `includeInnerMold` 设为 `false`，避免用户只想添加外模时被静默添加内模；如果业务后续要求默认包含，只需改变默认值，不改变数据契约。

## 6. 前端技术方案

### 6.1 弹窗筛选

修改 [OvermoldPickerDialog.tsx](../src/components/shared/OvermoldPickerDialog.tsx)：

1. `FilterKey` 改为 `outerMaterial | outerForm`。
2. 外模材质选项固定为 `黑色PVC 45P`、`黑色TPE`，筛选匹配仍使用结构化字段，不能直接把显示文本当作数据库值。
3. 外型选项固定为 `直头`、`弯头`，映射到 `straight`、`bent`。
4. 删除“外模硬度”和“内模材质”筛选；固定的低密度透明 PE 不是筛选维度。
5. 组内筛选逻辑保持“同组 OR、不同组 AND”。若产品希望筛选本身严格单选，将 `FilterGroup` 改成单选控件，但不改变结果集合规则。
6. 选项使用显式顺序，不使用当前 `Set(...).sort()` 让中文排序决定界面顺序。
7. 搜索范围包含名称、型号、代码、外模材质和外型，不把内模材质作为搜索条件。

### 6.2 级联展示

- 列表未选中前只显示外模：`外模：黑色PVC 45P · 直头`。
- 点击列表行后，详情区域增加“内模”区块：
  - `材质：低密度透明PE`
  - `外型：直头（与外模一致）`
  - `包含内模` 开关
- 不渲染内模材质下拉框、内模筛选复选框或独立内模列表。
- 没有内模元数据的目录项，显示“该规格无可用内模”并禁用开关。
- 清除筛选只清除筛选和搜索，不应把已经选中的外模对象误当成内模选择。

### 6.3 选择接口和画布写入

- 将 `onSelect` 的参数改为 `OvermoldSelection`，避免把实例级的 `includeInnerMold` 写入目录对象。
- [HarnessCanvas.tsx](../src/components/canvas/HarnessCanvas.tsx) 在创建模型时保存：
  - `overmoldSpecId: selection.overmold.id`
  - `includeInnerMold: selection.includeInnerMold`
  - 原有 `resourceItemId`、`resourceImageUrl` 保持不变。
- `CanvasModelDialog.tsx` 当前没有生产代码引用；本轮不把它作为实施入口。若后续重新接入，必须同步删除“当前提供 1 个可选外模”等过期数量文案。
- 本轮不新增模型右键编辑入口；如果后续增加编辑，应复用同一选择接口，并传入当前的 `includeInnerMold`。

### 6.4 共享格式化和输出

- 在 `src/lib` 增加一个小型纯函数模块（建议 `overmoldSpec.ts`），集中提供：
  - `formatOvermoldOuterLabel(spec)`
  - `formatOvermoldForm(form)`
  - `getAvailableInnerMold(spec)`
- 弹窗和 BOM 共用这些函数，避免不同界面再次出现“黑色PVC”“黑色PVC 45P”两套文案。
- [TwoDView.tsx](../src/components/drawings/TwoDView.tsx) 的外模 BOM 至少输出外模材质 + 外型；当 `includeInnerMold` 为真且目录有内模时，再输出固定内模材质 + 同外型。未包含内模时不能计入内模材料。
- [drawingCatalogRepository.ts](../src/lib/drawingCatalogRepository.ts) 若向图纸资源列表展示外模规格，应把外型加入 `specification`，避免图纸资源中四个组合不可区分。

## 7. 后端和目录适配方案

### 7.1 数据库约束

重写 [02_catalog.sql](../supabase/sql/10_schema/02_catalog.sql) 中的 `catalog_items_overmold_spec_check`，约束逻辑必须包括：

1. `kind = 'overmold'` 时，`outerMaterial` 必须存在、类型为非空字符串，并且只能是 `黑色PVC` 或 `黑色TPE`。
2. `outerForm` 必须存在、类型为字符串，并且只能是 `straight` 或 `bent`。
3. `outerMaterial = '黑色PVC'` 时必须有 `outerHardness = '45P'`。
4. `outerMaterial = '黑色TPE'` 时不写入 `outerHardness`，不凭空推断 TPE 硬度。
5. 内模字段整体可缺省；但不能只出现 `innerForm` 而没有 `innerMaterial`。
6. 内模存在时，`innerMaterial` 必须是 `低密度透明PE`，`innerForm` 必须存在且等于 `outerForm`。
7. 约束整体使用 `IS TRUE` 或等效显式布尔判断，不能依赖 PostgreSQL `CHECK` 对 `NULL` 的“通过”行为。

建议的逻辑形态（实施时按现有 SQL 风格展开，不保留一行长表达式）：

```sql
kind <> 'overmold' or (
  valid_outer_material
  and valid_outer_form
  and valid_pvc_grade
  and (
    (not spec ? 'innerMaterial' and not spec ? 'innerForm')
    or valid_fixed_inner_material_and_matching_form
  )
) is true
```

不再把 `innerMaterialOptional = true` 设为数据库必填；最终约束明确拒绝该废弃字段，全库重建后不保留旧值。

### 7.2 canonical seed

修改 [01_catalog_items.sql](../supabase/sql/40_seed/01_catalog_items.sql)：

- 保留 `pvc-45p-pe` 作为黑色 PVC 45P 直头的稳定代码，避免无必要地改变现有引用。
- 新增 PVC 45P 弯头、TPE 直头、TPE 弯头三个正式组合代码；代码只使用小写字母、数字、下划线或连字符。
- 移除或替换 `demo-pvc-overmold` 这条会显示第三种 `PVC/PE` 值的演示外模记录；不能让演示值污染正式的两种材质筛选。
- 四条正式记录的 `spec` 都写入 `outerForm`；当前确认有内模配对的记录写入固定 `innerMaterial` 和匹配的 `innerForm`。
- 外模记录的 `resource_group` 统一为“外模”，名称必须包含材质和外型，禁止新增“胶料”字样。
- 四条记录统一复用 `catalog/overmold/40000000-0000-4000-8000-000000000201/overmold.png`；后续获得真实分型图片时再分别替换路径。
- 因为 seed 的 `on conflict` 不会删除旧行，实施后必须执行完整测试库重建，不能只运行 seed 文件。

目录分布已从 47 条、2 条 `overmold` 调整为 49 条、4 条 `overmold`（删除 1 条演示记录并新增 3 条正式记录）。

### 7.3 解析器和目录仓库

修改 [catalogItem.ts](../src/lib/catalogItem.ts)：

- `CatalogItemSpecByKind.overmold` 增加 `outerForm`、`innerForm`，将 `innerMaterial` 改为可选固定值。
- 解析并校验材质、PVC 的 `45P` 配对、外型枚举。
- 内模字段全部缺省合法；只缺内模外型或出现未知内模材质非法。
- 拒绝废弃的 `innerMaterialOptional` 字段，canonical seed 不再写入。

修改 [catalogRepository.ts](../src/lib/catalogRepository.ts)：

- `listOvermolds()` 完整映射 `outerForm`、`innerMaterial`、`innerForm`。
- 不在 UI 中重复从原始 JSON 推断内外型关系；关系在适配层验证后再交给弹窗。
- 保持 `id = item.code` 和 `resourceItemId = item.id` 的现有引用方式。

修改 [harnessConfigSchema.ts](../src/lib/harnessConfigSchema.ts)：

- `readModel()` 要求 `overmoldSpecId` 为非空字符串。
- 要求 `includeInnerMold` 为显式布尔值，不再把缺失值归一化为 `false`。
- 更新现有模型测试夹具，使每个 `outer-box` 都引用一个外模 ID，并明确写入是否包含内模。

## 8. 分步实施顺序

### 阶段 A：实施前基线

1. 记录 `git status --short`，只允许修改本计划列出的文件。
2. 搜索所有 `overmoldSpecId`、`innerMaterialOptional`、`outerForm`、`innerForm` 使用点，确认没有未列出的写入入口。
3. 记录当前种子数量、目录测试断言和远程测试库状态；不执行远程写入。

### 阶段 B：后端目录契约

1. 先改 `02_catalog.sql` 约束并用四种合法/非法样例验证逻辑。
2. 改 `01_catalog_items.sql` 为四种正式组合，清理旧演示外模值。
3. 更新 `supabase/sql/README.md` 的字段规则和重建步骤，删除 `无内模` 作为新业务输入的描述。

### 阶段 C：共享类型和适配层

1. 增加 `OvermoldForm`、可选内模字段和 `CanvasModel.includeInnerMold`。
2. 更新目录解析器、仓库映射和模型配置解析。
3. 增加格式化/派生纯函数，并先为其编写单元测试。

### 阶段 D：前端选择流程

1. 重构 `OvermoldPickerDialog` 筛选键和固定选项顺序。
2. 将内模详情改为外模选中后的只读区块。
3. 增加“包含内模”开关，确认按钮只在外模选中时可用。
4. 更新 `HarnessCanvas` 的选择回调和 `CanvasModelDialog` 过期文案。

### 阶段 E：图纸输出

1. 更新 `TwoDView` 外模 BOM 的外型和内模包含逻辑。
2. 检查 `drawingCatalogRepository` 的外模规格摘要是否需要外型。
3. BOM 渲染与布局计数共用同一外模行生成函数，不修改连接器或线材逻辑。

### 阶段 F：测试和构建

1. 更新目录种子数量断言和模型配置夹具。
2. 增加筛选、级联显示、固定 PE、内外型一致和只选外模的测试。
3. 运行第 9 节的局部测试、构建和静态检查。

### 阶段 G：测试库重建（单独授权后）

1. 确认目标 Supabase 项目仍是测试库且允许删除。
2. 按 `supabase/sql/README.md` 顺序清空并重建。
3. 用第 9 节 SQL 查询验证 49 条目录和四条外模组合。
4. 记录重建结果后再考虑提交；本阶段不自动 push。

## 9. 验证方案

### 9.1 自动化命令

```powershell
npx vitest run `
  --exclude ".worktrees/**" `
  src/lib/__tests__/catalogItem.test.ts `
  src/lib/__tests__/catalogRepository.test.ts `
  src/lib/__tests__/databaseSchemaSql.test.ts `
  src/lib/__tests__/normalizeHarnessConfig.test.ts `
  src/lib/__tests__/partPickerDialog.test.ts `
  src/lib/__tests__/overmoldSpec.test.ts `
  src/lib/__tests__/productionDrawingLayout.test.ts `
  src/lib/__tests__/autoAssociateTwoDImages.test.ts `
  src/lib/__tests__/bom.test.ts
npm run build
npm run lint
```

若 `npm run lint` 仍报告 `TwoDView.tsx` 中实施前已经存在的规则问题，必须区分既有问题与本轮新增问题，并在交付中明确记录，不能把 lint 未通过表述为通过。

### 9.2 SQL 静态和数据库验收

```sql
select
  code,
  spec->>'outerMaterial' as outer_material,
  spec->>'outerHardness' as outer_hardness,
  spec->>'outerForm' as outer_form,
  spec->>'innerMaterial' as inner_material,
  spec->>'innerForm' as inner_form
from public.catalog_items
where kind = 'overmold'
order by sort_order, code;
```

必须验证：

- 返回四条正式外模组合，材质集合严格为两种，外型集合严格为两种。
- 缺少或为空的 `outerMaterial` 失败。
- 缺少 `outerForm`、未知外型失败。
- PVC 缺少 `45P` 或 TPE 伪造未知硬度失败。
- 固定 PE + 与外模不同的 `innerForm` 失败。
- 只含外模字段的记录成功，证明内模确实可选。
- 只有内模字段、没有外模字段的记录失败。

### 9.3 前端手工场景

1. 打开弹窗，筛选中只看到两种外模材质和两种外型，没有内模材质筛选。
2. 不选外模时，内模区块不可见，确认按钮不可用。
3. 选择 PVC 直头，内模区块显示低密度透明 PE + 直头。
4. 选择 PVC 弯头，内模区块显示低密度透明 PE + 弯头。
5. 选择 TPE 两种外型，均能正确显示对应的内模外型。
6. 保持“包含内模”关闭并确认，模型只保存外模；打开后确认，模型保存外模和内模开关。
7. 重新加载项目后，外模 ID、内模开关和 BOM 显示保持一致。

## 10. 验收标准

- [ ] 外模没有选择时不能添加画布模型。
- [ ] 外模材质选项严格为“黑色PVC 45P”和“黑色TPE”。
- [ ] 外型选项严格为“直头”和“弯头”。
- [ ] 内模只在外模选中后出现，且没有材质选择控件。
- [ ] 内模材质固定为“低密度透明PE”，内模外型始终等于外模外型。
- [ ] 可以只选择外模；启用内模时仍然引用同一个外模目录 ID。
- [ ] 数据库拒绝无外模、非法材质、非法外型和内外型不一致数据。
- [ ] 不存在只有内模、没有外模的独立 `overmold` 目录项。
- [ ] 四种外模组合可在目录中独立筛选、选择和回载。
- [ ] BOM/二维图不会把未包含的内模计入材料，也不会丢失外型。
- [ ] 既有连接器、线材、保护套种子数据不被删除；完整重建后目录总量和分布断言已更新。
- [ ] 自动化测试和构建通过；任何既有 lint 问题单独记录。

## 11. 风险与处理

| 风险 | 处理 |
| --- | --- |
| `45P` 实际不是硬度 | 本轮保留 `outerHardness` 兼容字段，只改变组合显示；确认后另立字段重命名任务 |
| 旧演示行污染固定选项 | 全库重建前删除/替换 `demo-pvc-overmold`，不能只依赖前端隐藏 |
| seed upsert 不删除旧数据 | 必须执行完整测试库重建；只跑 seed 不视为完成 |
| 外模 ID 改动导致旧图纸引用失效 | 保留 `pvc-45p-pe` 代码；测试阶段如需清理其余旧记录，先确认项目/图纸已清空 |
| 外模图片未区分直头/弯头 | 没有真实资源时复用现有图片并保持字段正确，不伪造图片路径 |
| 内模开关与目录元数据混淆 | `OvermoldSpec` 只描述可用内模，`CanvasModel.includeInnerMold` 只描述本次是否包含 |
| 旧计划与新计划冲突 | 实施只遵循本文档，旧文档作为历史记录，不再作为执行依据 |

## 12. 实施结果

- 已按“内模可不包含；如果包含则固定 PE、外型跟随外模”的规则完成本地实现。
- 四条外模种子记录共用同一 `image_path`；成品图关联仍只读取外模目录图片，`includeInnerMold` 不增加图片。
- 已增加目录解析、SQL 契约、BOM 分组/布局计数和内模不出图的回归测试。
- 远程 Supabase 未在本轮写入；须按 `supabase/sql/README.md` 的顺序用最终 canonical SQL 重建。
