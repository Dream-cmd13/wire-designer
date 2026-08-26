# 《代码库级 Agent 可执行技术设计与实施计划》

## 主题

外模/内模目录属性的最小范围调整：外模必填、内模选填，并记录直头/弯头外型。

## 0. 文档状态与执行闸门

- 状态：已按方案 B 完成后端代码实施，等待测试数据库重建验收。
- 本文档在实施前作为唯一设计交付物；实施阶段仅修改计划中列出的后端 SQL/说明文件。
- 本计划保留上一条范围约束：前端业务代码不改；本轮实施目标是后端目录结构/种子数据兼容调整。
- “后端”在本仓库中指 Supabase canonical SQL（表结构与种子数据）；没有独立 Node 服务端 API。

## 1. 目标与范围

### 1.1 目标

1. 所有 `kind = 'overmold'` 的目录项必须有非空外模属性。
2. 内模可以存在，也可以不存在。
3. 保留图片中的外型信息（直头/弯头），以便后续前端或制图功能使用。
4. 不改变现有 `catalog_items` 表的总体结构、目录 ID、图片路径和项目保存格式。
5. 现有前端在不改代码的情况下仍能读取并显示目录项。

### 1.2 本轮包含

- 修改 `supabase/sql/10_schema/02_catalog.sql`，增加外模目录项的 JSONB 约束。
- 修改 `supabase/sql/40_seed/01_catalog_items.sql`，补齐外型并统一“无内模”编码方式。
- 根据需要更新 `supabase/sql/README.md` 的重建说明。
- 运行静态 SQL 检查、现有目录测试、构建检查，并确认 `src` 无业务代码改动。

### 1.3 本轮不包含

- 不修改 `src` 下的类型、解析器、仓库映射、选择器或任何 UI。
- 不新增 `mold_components`、`inner_molds` 等表。
- 不增加“先选外模、再选内模”的前端交互。
- 不修改 BOM、报价、二维图显示逻辑；外型字段本轮只负责后端保存。
- 不执行远程 Supabase 重置、写入或发布操作；除非用户另行明确授权。
- 不创建旧数据库升级链。项目当前按“测试库清空后重建”运行。

## 2. 代码库现状与约束

### 2.1 当前数据模型

- `catalog_items.spec` 是按 `kind` 解释的 JSONB 对象：[02_catalog.sql](../supabase/sql/10_schema/02_catalog.sql)。
- 前端 `OvermoldSpec` 当前包含 `outerMaterial`、`outerHardness`、`innerMaterial`、`innerMaterialOptional`：[harness.ts](../src/types/harness.ts:249)。
- 目录解析器当前对 `innerMaterial` 使用 `requiredText`，因此即使业务上内模选填，后端返回值也不能直接省略该键：[catalogItem.ts](../src/lib/catalogItem.ts:220)。
- 目录仓库只映射已知字段；未知的 `outerForm` 会被前端忽略，但不会影响当前解析：[catalogRepository.ts](../src/lib/catalogRepository.ts:139)。
- 外模选择器会直接调用 `o.innerMaterial.toLowerCase()`，所以后端必须返回非空字符串：[OvermoldPickerDialog.tsx](../src/components/shared/OvermoldPickerDialog.tsx:60)。
- 当前 canonical seed 中有两个 `overmold` 项，字段定义位于：[01_catalog_items.sql](../supabase/sql/40_seed/01_catalog_items.sql:11)。

### 2.2 领域解释

- “外模”是完整目录项的必选主体。
- “内模”是外模的可选附加属性，不应作为只有内模、没有外模的独立 `overmold` 项。
- “直头/弯头”是外型字段，不改变 `kind`，也不需要拆表。
- 界面术语统一使用“内模”；数据库兼容哨兵值使用现有代码注释约定的 `无内模`。

## 3. 方案比较与推荐

### 方案 A：只修改种子数据

- 做法：不增加数据库约束，只在 seed 中保证外模字段存在，用 `innerMaterial = '无内模'` 表示没有内模。
- 优点：改动最小，几乎没有数据库风险。
- 缺点：其他写入路径仍可能插入缺少外模的非法目录项。

### 方案 B：增加一条 JSONB 约束并同步 seed（推荐）

- 做法：在 `catalog_items` 上增加仅针对 `kind = 'overmold'` 的检查；外模非空，内模必须是实际材料或 `无内模`，外型若存在只能是 `straight`/`bent`。
- 优点：仍是两份 SQL 的小改动，但把核心业务规则放到数据库边界；前端无需改动。
- 代价：已有测试库需要按项目约定重建；不能把旧的非法数据直接留在原表中。

### 方案 C：拆分外模/内模部件表

- 做法：建立独立部件表，再由组合表关联外模和内模。
- 优点：适合独立库存、领料、配对和多种内模复用。
- 代价：会扩大数据库、目录 API、前端选择流程和项目引用范围，不符合本次最小改动要求。

**采用方案 B。** 方案 C 留作后续独立库存需求出现时的架构升级。

## 4. 目标数据契约

### 4.1 后端 JSONB 形态

由于前端本轮不改，`innerMaterial` 仍然保留为字符串字段：

有内模：

```json
{
  "outerMaterial": "黑色PVC",
  "outerHardness": "45P",
  "outerForm": "straight",
  "innerMaterial": "低密度透明PE",
  "innerMaterialOptional": true,
  "innerForm": "straight"
}
```

无内模：

```json
{
  "outerMaterial": "黑色TPE",
  "outerForm": "bent",
  "innerMaterial": "无内模",
  "innerMaterialOptional": true
}
```

字段规则：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `outerMaterial` | 是 | 非空字符串；不能用“无外模”或空字符串表示缺失 |
| `outerHardness` | 否 | 保留供应商原始写法，例如 `45P`；不在本轮擅自换算硬度体系 |
| `outerForm` | 是（canonical seed） | `straight` 或 `bent`，界面对应直头/弯头 |
| `innerMaterial` | 是（兼容字段） | 实际材料，或哨兵值 `无内模` |
| `innerMaterialOptional` | 是（现有兼容字段） | 当前规则固定为 `true` |
| `innerForm` | 条件必填 | `innerMaterial` 不是 `无内模` 时可写入；无内模时省略 |

### 4.2 数据录入原则

- 不把图片中的“内模”行直接插入为独立 `overmold` 项，因为它没有必填外模。
- 每个可被系统选择的 `overmold` 项都必须描述一个外模；内模只是该项的附加属性。
- 如果业务尚未确认某个外模与某个内模的实际配对关系，不凭图片自动组合新编码；先保留已确认的外模项。
- `outerForm` 和 `innerForm` 使用稳定英文值，中文只用于名称、描述或展示文案。

## 5. 分前后端实施设计

### 5.1 后端实施项

#### 文件 1：`supabase/sql/10_schema/02_catalog.sql`

在 `catalog_items` 表上增加命名检查约束，逻辑如下：

```sql
constraint catalog_items_overmold_spec_check check (
  kind <> 'overmold'
  or (
    spec ? 'outerMaterial'
    and jsonb_typeof(spec->'outerMaterial') = 'string'
    and length(btrim(spec->>'outerMaterial')) > 0
    and spec ? 'innerMaterial'
    and jsonb_typeof(spec->'innerMaterial') = 'string'
    and length(btrim(spec->>'innerMaterial')) > 0
    and spec ? 'innerMaterialOptional'
    and jsonb_typeof(spec->'innerMaterialOptional') = 'boolean'
    and spec->>'innerMaterialOptional' = 'true'
    and (
      not (spec ? 'outerForm')
      or spec->>'outerForm' in ('straight', 'bent')
    )
  )
)
```

实施注意：

- `outerForm` 在 canonical seed 中必须存在；约束暂时允许旧记录缺少它，以避免扩大兼容范围。
- `innerMaterial` 不设为 SQL NULL，因为当前前端解析器要求字符串。
- 约束只作用于 `kind = 'overmold'`，不改变其他目录项。

#### 文件 2：`supabase/sql/40_seed/01_catalog_items.sql`

逐条处理现有外模种子：

1. `demo-pvc-overmold`：补 `outerForm: 'straight'`，保留实际内模 `PE` 和 `innerMaterialOptional: true`。
2. `pvc-45p-pe`：补 `outerForm: 'straight'`，保留低密度透明 PE 内模。
3. 若新增黑色 TPE 或弯头规格，必须以“外模项”为根记录；无内模的记录使用 `innerMaterial: '无内模'`，不能创建只有内模的记录。
4. 保持现有 `(kind, code)` 冲突更新逻辑和图片路径不变。

#### 文件 3：`supabase/sql/README.md`（必要时）

补充一条说明：该规则随 canonical schema 和 seed 生效，测试环境按既有 `00_reset → schema → RLS → seed` 顺序重建；本轮不新增升级 SQL。

### 5.2 前端范围与处理

本轮不修改任何前端生产文件，以下内容只作为兼容验证边界：

- `innerMaterial: '无内模'` 可通过当前 `requiredText` 校验。
- `innerMaterialOptional: true` 可被现有选择器识别并显示“内模可选”。
- `outerForm`、`innerForm` 会被当前前端解析器忽略，不会导致加载失败，但本轮也不会在界面或图纸中显示。
- 不改变 `OvermoldSpec`、`CanvasModel.overmoldSpecId`、目录快照和项目 JSON。

如果验收要求用户在界面看到“直头/弯头”，那属于下一轮前端需求，不能在“前端不动”的范围内承诺。

## 6. 可执行实施步骤

### 阶段 A：实施前检查

1. 记录 `git status --short`，确认只将本任务涉及的 SQL/文档纳入后续变更。
2. 搜索所有 `kind = 'overmold'` 的 canonical seed，确认没有第二份基线种子需要同步。
3. 确认目标是测试 Supabase；不执行远程重置或写入。

### 阶段 B：后端修改

1. 在 `02_catalog.sql` 加入命名检查约束。
2. 在 `01_catalog_items.sql` 补齐 `outerForm`，规范无内模哨兵值。
3. 如执行顺序文档缺少说明，更新 `supabase/sql/README.md`。
4. 不改 `src` 生产代码、不改 RLS、不改 Storage。

### 阶段 C：静态验证

1. 检查 SQL 事务、括号和 JSON 字符串平衡。
2. 检查每条 `overmold` seed 都包含非空 `outerMaterial`。
3. 检查没有 `kind = 'overmold'` 的“内模独立行”。
4. 检查 `outerForm` 只出现 `straight` 或 `bent`。
5. 检查 `git diff --name-only -- src` 为空。

### 阶段 D：代码库回归

运行：

```powershell
npx vitest run src/lib/__tests__/databaseSchemaSql.test.ts src/lib/__tests__/catalogItem.test.ts src/lib/__tests__/catalogRepository.test.ts
npm run build
npm run lint
```

这些命令只验证现有前端读取兼容性，不代表本轮修改了前端。

### 阶段 E：测试数据库验收（需单独授权）

在得到明确授权后，按 `supabase/sql/README.md` 重建测试库，并执行：

```sql
select
  code,
  spec->>'outerMaterial' as outer_material,
  spec->>'innerMaterial' as inner_material,
  spec->>'outerForm' as outer_form
from public.catalog_items
where kind = 'overmold'
order by sort_order, code;
```

还应验证以下三类写入结果：

- 缺少或空 `outerMaterial`：失败。
- 有外模、`innerMaterial = '无内模'`：成功。
- 有外模、有实际内模：成功。

## 7. 验收标准

- [x] `overmold` 目录项的外模字段在数据库层面非空。
- [x] 内模可以是实际材料，也可以用 `无内模` 表示不存在。
- [x] canonical seed 中不出现只有内模、没有外模的目录项。
- [x] 直头/弯头信息以 `outerForm` 保存；有内模时可保存 `innerForm`。
- [x] 现有前端解析器、目录仓库和选择器无需修改即可读取数据。
- [x] `src` 下没有本轮业务代码改动（工作区已有的其他前端改动未触碰）。
- [x] 目录测试和构建通过；lint 仍受仓库既有问题阻断。
- [x] 远程数据库写入和重建均在用户明确授权后执行；本轮未提交或推送。

## 8. 风险、假设与后续边界

- 使用 `无内模` 是为了兼容当前前端类型，不是最终理想的数据模型；未来允许前端改动时，可将 `innerMaterial` 正式改为可空字段。
- 当前前端不会展示 `outerForm`；这不影响后端保存，但会造成“数据已存、界面不可见”的预期差异。
- 图片只展示了材料和外型，没有提供外模与内模的配对编码；新增组合记录前必须确认业务配对关系。
- 项目处于测试阶段，按文档采用清空重建路径，不设计旧数据库迁移脚本。
- `45P` 保留供应商原始文本，不在本任务中推断 Shore A、Shore D 或其他硬度体系。

## 9. 下一步

本轮已完成：

- 已在 `02_catalog.sql` 增加外模目录 JSONB 检查约束。
- 已为现有两条外模种子补充 `outerForm`/`innerForm`，未改变 47 条种子目录的数量与分类。
- 已更新 Supabase SQL 约定，明确外模必填、内模可选和无内模哨兵值。
- 已确认 `src` 下没有本轮业务代码改动。

远程验收已完成：

- 已在确认的测试 Supabase 项目执行清空重建，项目和图纸数量均为 0。
- 目录恢复为 47 条种子数据：37 个连接器、3 个线材、2 个保护套、2 个外模、1 个模型、1 个辅材、1 个包装。
- 已验证公共目录读取接口可返回全部 47 条数据，外模字段和约束正常。
- 尚未让前端展示 `outerForm`；该项不在本轮“前端不动”范围内。

## 10. 前端显示同步计划（新增需求）

### 10.1 目标

将前端显示与后端目录实际值同步，去除兜底文案中的“胶料”，并在不改变数据结构的前提下支持外模/内模名称显示。

### 10.2 拟修改文件

- `src/components/drawings/TwoDView.tsx`
  - 将外模默认兜底文案从 `45P 黑色 PVC胶料` 改为 `45P 黑色PVC`。
  - 目录值存在时继续优先使用目录值。
- `src/components/shared/OvermoldPickerDialog.tsx`
  - 将 `innerMaterial` 的读取改为兼容显示，避免未来无内模记录造成空值调用异常。
  - 保留现有外模必选选择流程，不新增交互。
- `src/types/harness.ts`、`src/lib/catalogItem.ts`、`src/lib/catalogRepository.ts`（仅在类型检查证明需要时修改）
  - 是否将 `outerForm`/`innerForm` 接入前端类型与映射，取决于验收是否要求界面显示直头/弯头；默认只修正文案，避免扩大范围。

### 10.3 不修改内容

- 不修改 Supabase 表结构、种子或远程数据。
- 不改变外模必填、内模选填业务规则。
- 不新增前端选择步骤，不改变项目 JSON 和画布模型引用。

### 10.4 验证方案

```powershell
npx vitest run src/lib/__tests__/partPickerDialog.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/catalogItem.test.ts
npm run build
npm run lint
```

补充静态检查：

- `rg -n "PVC胶料|PE胶料|45P 黑色 PVC胶料" src`
- 检查外模选择器、二维图和目录详情中的材质显示。

### 10.5 验收标准

- [x] 前端不再出现旧兜底文案“PVC胶料/PE胶料”。
- [x] 外模目录值“黑色PVC”和内模目录值“低密度透明PE”原样显示。
- [x] 后端目录加载、外模选择和二维图生成不回归。
- [x] 本轮未修改前端之外的数据库或远程资源。

前端计划已执行完成。
