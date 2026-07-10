# 制作图纸 tab 仿制开发分析文档

日期：2026-07-09  
参考站点：`https://linegraph365.com/wire/config`  
本地目标：`wire-harness-designer` 前端的“制作图纸”工作台 / tab  

## 1. 本次交叉验证结论

本次在已登录的 in-app browser 中继续操作 `https://linegraph365.com/wire/config?type=1&id=2071797880118165506`，与上一次空白 `/wire/config` 页面走查形成对照。

### 验证 A：空白配置页，单头普通线

上一轮输入路径：

- 类型：内线
- 子类型：单头
- 线材类型：普通线
- 资源：`A1008H-2X25P` 单侧连接器
- 属性：未填写总长、线号、线长等关键字段

结果：

- 向导进入“选择连接器/模型”，资源总量 8536 条。
- 搜索 `A1008H-2X20P` 可把结果缩到 6 条。
- 未选择资源时会提示“请选择连接器/模型”。
- 选择资源后进入“配置属性和颜色”，按 PIN 数生成线材行。
- 未填关键参数仍可确认生成，画布生成多条黑线，但业务信息不足。

### 验证 B：已有图纸页，双头屏蔽线/多芯线

本轮输入路径：

- 类型：内线
- 子类型：双头
- 线材类型：屏蔽线/多芯线
- 左连接器：搜索 `A1008H-2X20P`，选择 `A1008H-2X20P 正面 Male(公）左边`
- 右连接器：自动沿用型号筛选，选择 `A1008H-2X20P 正面 Male(公）右边`
- 总长度：`320`
- 公差：`10`
- 线材 1：颜色红，长度 320，线号 `RD-01`，接线自动为 1
- 线材 2：颜色红，长度 280，线号 `YL-02`，接线自动为 2
- 线材 3：颜色灰，长度 300，线号 `BU-03`，接线自动为 3

结果：

- 双头流程把资源选择拆成“选择左连接器/模型”和“选择右连接器/模型”。
- 左侧默认资源量是 4268 条，约为单头资源量 8536 条的一半，说明资源按左右方向分组。
- 左端搜索 `A1008H-2X20P` 后得到 3 条左边资源：正面、俯面、反面。
- 选择左端后，右端选择页自动保留型号筛选，并切换为右边资源 3 条。
- 属性页根据 40PIN 资源生成 40 条线材配置。
- 屏蔽线/多芯线属性页出现“热缩套管”字段；单头普通线出现的是“尾部剥皮上锡 / 半剥”等字段。
- 颜色字段是只读选择器，枚举包括：黑、白、灰、红、黄、蓝、橙、绿、紫、棕、金、粉、黄注绿、空白。
- 生成后图纸包含 A4 图框、连接器图、外模/护套束、多根线材、尺寸标注 `320±10mm`、技术要求、BOM 表、标题栏。

## 2. 对 linegraph365 制作图纸能力的抽象

linegraph365 的核心不是“普通画布工具”，而是一个业务向导驱动的制图器：

1. 先选择线束拓扑：内线/外线、单头/双头/两头上锡/1:1:N、普通线/绞线/排线/并线/屏蔽线。
2. 再选择与拓扑匹配的连接器资源：单头只选一个端，双头拆成左端和右端。
3. 再填写物料和工艺属性：模具、线号、总长、公差、热缩套管、线材颜色、线长、线号、接线号。
4. 最后把业务参数自动转为制造图纸：图框、连接器、线束走线、尺寸、标注、BOM、标题栏、技术要求。

这给本地系统的启发是：制作图纸 tab 不应该只是上传/排版图片，而应该具备“从 HarnessConfig 或向导草稿生成制造图纸”的能力。

## 3. 本地现状

当前本地项目已有基础：

- `src/pages/DrawingWorkbenchPage.tsx`
  - 当前是制作图纸工作台骨架。
  - 能显示当前项目统计，入口跳转到 PDF 和成品图。
  - 中央“图纸画布”区域仍是预留区。

- `src/components/drawings/TwoDView.tsx`
  - 已具备 A4 图框背景、缩放、平移、图片分组拖拽。
  - 已有 BOM 表生成和接线图组件。
  - 已能从 `HarnessConfig` 的 connectors/materials/models/sleeves/twoDImages 组合生产图纸视图。

- `src/lib/productionDrawingLayout.ts`
  - 已定义 1200x800 图框、BOM 区域、接线图区、组装图区安全间距。

- `src/types/harness.ts`
  - 数据模型已经围绕三类业务对象收敛：Connector、CanvasWireMaterial、ProtectiveSleeve。
  - 多芯线可用 `JacketedWireSpec` 表达。
  - 线材接线明细可用 `MaterialCircuit` 表达。

- `src/lib/commands.ts`
  - 已有添加连接器、添加线材、端点连接、更新 circuit、短接、保护套等原子命令。

主要缺口：

- 缺少 linegraph365 式的“制作图纸向导”。
- 缺少向导草稿到 `HarnessConfig` 的生成器。
- 缺少可编辑的制造图纸对象层，例如尺寸标注、技术要求、修订表、标题栏字段、引线编号、标注气泡。
- 连接器/端子资源库目前不足以表达正面/俯面/反面、左边/右边、公母、系列、PIN 位数、排位、间距等筛选维度。

## 4. 推荐目标

第一阶段目标不是完整复刻 linegraph365 的全部画图工具，而是在“制作图纸 tab”中实现一个可用的专业制图闭环：

- 从当前项目的线束数据或新建向导生成一张 A4 制造图。
- 支持双头/单头两类主流程。
- 支持普通线和屏蔽线/多芯线两类线材。
- 自动生成连接器、线束、尺寸、BOM、接线表、技术要求、标题栏。
- 支持预览、局部编辑、导出，不直接破坏原设计图。

## 5. 信息架构建议

制作图纸工作台建议拆成 5 个区域：

1. 顶部工具栏
   - 画图向导
   - 绘图资源
   - 撤销/重做
   - 选择/拖动/文字/尺寸/标注工具
   - 适配画布、放大、缩小、还原
   - 图纸信息
   - 保存草稿
   - 导出 PDF/PNG

2. 左侧资源面板
   - 连接器/模型
   - 线材
   - 线材图型
   - 辅材
   - 包装方式
   - 接线表
   - 物料表
   - 分岔线
   - 交叉线
   - 物料规格

3. 中央 A4 图纸画布
   - 固定图框
   - 可缩放/平移
   - 可选择图纸对象
   - 支持对象拖拽、对齐、尺寸标注

4. 右侧属性检查器
   - 位置、宽高、缩放、旋转
   - 线宽、颜色、文字样式
   - 对业务对象显示专用属性，例如线长、公差、PIN、线号

5. 底部状态/校验区
   - 未保存提示
   - 缺失字段提示
   - 图纸生成摘要

## 6. 向导设计

建议新增 `DrawingWizardDialog`，包含以下步骤。

### Step 1：拓扑与线材类型

字段：

- 类型：内线、外线
- 子类型：单头、双头、两头上锡、1:1:N
- 线材类型：普通线、绞线、排线、并线、屏蔽线/多芯线

输出草稿：

```ts
interface DrawingWizardTopology {
  harnessType: 'internal' | 'external';
  topology: 'single-end' | 'double-end' | 'both-tinned' | 'one-to-many';
  wireKind: 'electronic' | 'twisted' | 'ribbon' | 'parallel' | 'jacketed';
}
```

### Step 2：连接器/模型选择

单头：

- 选择连接器/模型

双头：

- 选择左连接器/模型
- 选择右连接器/模型

筛选字段：

- 资源范围：公共、个人
- 资源类型：连接器、模型
- 名称
- 公/母 + 左/右
- 类别
- 系列
- PIN 位数
- 排位
- 间距

资源选择后的摘要必须清晰展示，例如：

- 左端：`A1008H-2X20P 正面 Male(公）左边 / 40PIN / 双排 / 1.0mm`
- 右端：`A1008H-2X20P 正面 Male(公）右边 / 40PIN / 双排 / 1.0mm`

### Step 3：属性与线材配置

公共字段：

- 模具
- 线号
- 总长度 mm
- 长度公差

普通线字段：

- 尾部剥皮上锡
- 半剥

屏蔽线/多芯线字段：

- 热缩套管
- 芯线颜色
- 芯线长度
- 芯线线号
- 接线号

建议支持批量操作：

- 批量长度
- 批量线号前缀和递增
- 批量颜色序列
- 自动按 PIN 生成接线号

### Step 4：生成预览

生成前显示摘要：

- 拓扑：双头
- 连接器：左/右资源
- 线材类型：屏蔽线/多芯线
- 总长：320±10mm
- 芯线数：40
- 已填写线号：3/40
- 未填写长度：37/40

缺失字段需要阻断或二次确认，避免生成低质量图纸。

## 7. 数据模型扩展建议

### 7.1 向导草稿

```ts
interface DrawingWizardDraft {
  topology: DrawingWizardTopology;
  leftResource?: DrawingConnectorResource;
  rightResource?: DrawingConnectorResource;
  singleResource?: DrawingConnectorResource;
  attributes: DrawingHarnessAttributes;
  wires: DrawingWireRowDraft[];
}

interface DrawingConnectorResource {
  id: string;
  name: string;
  view: 'front' | 'top' | 'back';
  gender: 'male' | 'female';
  side: 'left' | 'right' | 'none';
  category: string;
  series: string;
  pinCount: number;
  rowCount?: number;
  pitchMm?: number;
  heightMm?: number;
  imageAssetId?: string;
}

interface DrawingHarnessAttributes {
  moldId?: string;
  drawingWireNo?: string;
  totalLengthMm?: number;
  lengthToleranceMm?: number;
  heatShrinkId?: string;
  tailTreatment?: {
    stripTinLengthMm?: number;
    toleranceMm?: number;
    halfStrip?: boolean;
  };
}

interface DrawingWireRowDraft {
  index: number;
  color: string;
  lengthMm?: number;
  signalName?: string;
  connectionNo: string;
}
```

### 7.2 图纸对象层

当前 `TwoDView` 主要依赖 `twoDImages` 和 BOM 自动排版。若要复刻 linegraph365 的可编辑制图，需要新增图纸对象层：

```ts
type DrawingObject =
  | DrawingConnectorObject
  | DrawingWireBundleObject
  | DrawingDimensionObject
  | DrawingCalloutObject
  | DrawingTextObject
  | DrawingBomTableObject
  | DrawingTitleBlockObject
  | DrawingTechRequirementObject;
```

建议先不要把所有对象塞进 `TwoDImage`。`TwoDImage` 适合“图片资产”，不适合表达尺寸线、标注气泡、BOM 单元格、标题栏字段。

可以在 `HarnessConfig` 中新增：

```ts
productionDrawing?: {
  schemaVersion: 1;
  page: { size: 'A4'; orientation: 'landscape'; width: 1200; height: 800 };
  objects: DrawingObject[];
  revisionTable: RevisionRow[];
  titleBlock: DrawingTitleBlockData;
  techRequirements: string[];
};
```

## 8. 生成器设计

新增纯函数模块：

- `src/lib/drawingWizard.ts`
- `src/lib/productionDrawingGenerator.ts`

核心函数：

```ts
function createHarnessConfigFromDrawingWizard(
  baseConfig: HarnessConfig,
  draft: DrawingWizardDraft,
): HarnessConfig

function generateProductionDrawingObjects(
  config: HarnessConfig,
  options?: ProductionDrawingGenerateOptions,
): ProductionDrawingObject[]
```

生成规则：

- 单头普通线：
  - 生成一个连接器。
  - 生成一组 electronic wire 或多条 electronic material。
  - 只绑定一端，另一端按工艺字段显示剥皮/上锡/半剥。

- 双头屏蔽线/多芯线：
  - 生成左右两个连接器。
  - 生成一个 jacketed material。
  - `coreCount` 来自 PIN 数或用户输入。
  - 每根芯线生成一个 `MaterialCircuit`。
  - start 绑定左端 PIN，end 绑定右端 PIN。
  - `signalName` 写入线号，例如 `RD-01`。
  - `spec.coreColors` 写入颜色枚举。
  - `spec.lengthMm` 写入总长。
  - 芯线局部长度可先写入 circuit 扩展字段，或作为 drawing object 的标注属性。

## 9. UI 组件拆分建议

新增组件：

- `src/components/drawings/workbench/DrawingWorkbenchToolbar.tsx`
- `src/components/drawings/workbench/DrawingWizardDialog.tsx`
- `src/components/drawings/workbench/DrawingResourcePanel.tsx`
- `src/components/drawings/workbench/DrawingCanvas.tsx`
- `src/components/drawings/workbench/DrawingObjectInspector.tsx`
- `src/components/drawings/workbench/DrawingValidationPanel.tsx`

复用组件：

- `TwoDView` 中的缩放/平移逻辑可以抽到 `usePanZoomCanvas`。
- `BOMTable` 可拆出并升级为可配置的 `ProductionBomTable`。
- `productionDrawingLayout.ts` 保留为 A4 图框布局基础。

## 10. 与本地现有数据模型的映射

| linegraph365 概念 | 本地现有模型 | 需要补充 |
| --- | --- | --- |
| 连接器/模型资源 | `Connector`, `ConnectorInstance`, `CanvasModel` | 视图方向、左右方向、公母、系列、排位、间距、资源图片 |
| 普通线 | `ElectronicWireSpec` | 向导批量生成、尾部工艺字段展示 |
| 屏蔽线/多芯线 | `JacketedWireSpec` | 支持 40PIN 以上芯线数，当前类型只允许 1/2/3/4/5/6/8/12/17 |
| 线材行 | `MaterialCircuit` | 局部长度、接线号、线号显示规则 |
| 颜色枚举 | `WIRE_COLORS` | 增加中文颜色枚举：黑、白、灰、红、黄、蓝、橙、绿、紫、棕、金、粉、黄注绿、空白 |
| 热缩套管 | `ProtectiveSleeve` type `heat-shrink` | 在向导中作为可选辅材生成 |
| BOM 表 | `generateBOM`, `BOMTable` | 图纸级 BOM 行、倒序/符号编号、规格字段排版 |
| 技术要求 | 暂无专用模型 | 新增 drawing tech requirements |
| 尺寸标注 | 暂无专用模型 | 新增 dimension object |
| 标注气泡 | 暂无专用模型 | 新增 callout object |
| 标题栏/修订表 | 图框背景图片 | 新增可编辑 title block / revision table |

重要注意：本轮验证使用 40PIN 连接器，而当前 `JacketCoreCount` 类型不支持 40。若要覆盖 linegraph365 的 40PIN/50PIN 场景，需要把 `JacketCoreCount` 从窄联合类型改为受校验约束的 number，或扩展允许值。

## 11. 分阶段开发计划

### Phase 1：向导 MVP

目标：能从向导生成双头/单头的基础 `HarnessConfig`。

范围：

- 新增 `DrawingWizardDialog`。
- 支持内线 + 单头/双头。
- 支持普通线、屏蔽线/多芯线。
- 支持连接器搜索与左右端选择。
- 支持总长、公差、颜色、线号、接线号输入。
- 生成后进入制作图纸画布预览。

验收：

- 双头 40PIN 输入后生成左右连接器、一条 jacketed material、40 条 circuits。
- 单头普通线输入后生成一个连接器和对应线材。
- 未选择连接器不能下一步。
- 总长为空时给出阻断或明确风险确认。

### Phase 2：制造图纸对象层

目标：制作图纸 tab 不再只是图片排版，而能绘制专业制造图。

范围：

- 新增 `productionDrawing.objects`。
- 支持图框、尺寸、文本、标注、BOM、技术要求。
- 生成 `320±10mm` 这类尺寸标注。
- 支持连接器旁 PIN/颜色/线号标注。

验收：

- 生成结果能复现本轮验证里的 A4 结构：连接器、线束、尺寸、技术要求、BOM、标题栏。
- 对象可选中，右侧属性面板可修改位置/尺寸/文字。

### Phase 3：资源库与资产映射

目标：向导可从本地资源库选择真实连接器/端子/模型图。

范围：

- 扩展连接器 catalog 字段。
- 增加正面/俯面/反面图片。
- 增加左右方向和 flip/mirror 规则。
- 增加个人资源和公共资源的抽象接口。

验收：

- 左端资源只显示左边候选，右端只显示右边候选。
- 选择左端后可自动带出右端同型号候选。

### Phase 4：保存与导出

目标：形成可持久保存、可导出的制作图纸。

范围：

- 图纸草稿保存到项目。
- 导出 PDF/PNG。
- 保存前缺失项校验。
- 未保存离开提示。

验收：

- 生成图纸后刷新仍可恢复。
- 导出 PDF 与页面预览一致。
- 未保存修改不会静默丢失。

## 12. 风险与注意事项

- 不建议直接照搬 linegraph365 的 UI 密度。它的工具栏和属性面板对窄视口不友好，本地应优先保证可读性。
- linegraph365 允许关键参数缺失时生成图纸，本地应更严格，至少提供风险摘要。
- 颜色选择器需要更稳定的交互，建议本地用可见色块 + 文本下拉，而不是窄输入框。
- 本地现有源码中部分中文显示已经出现编码异常，需要先避免在新增组件中延续乱码。
- 当前 `TwoDView` 文件职责偏重，后续若继续增加制图能力，应拆出画布、BOM、接线图、工具栏、对象检查器。
- 现有 `DrawingWorkbenchPage` 是骨架，建议把新的制图能力落在它里面，而不是继续堆到 `TwoDView`。

## 13. 推荐落地顺序

1. 先修 `JacketCoreCount` 表达能力，让 40PIN/50PIN 多芯线可以进入模型。
2. 新增 `DrawingWizardDraft` 和纯函数生成器，用单元测试覆盖单头/双头。
3. 在 `DrawingWorkbenchPage` 接入 `DrawingWizardDialog`，生成后写入 store 的临时图纸草稿。
4. 拆 `TwoDView` 中可复用的 A4 图框、BOM、接线图渲染能力。
5. 新增生产图纸对象层，逐步替代纯图片排版。
6. 最后做保存、导出、缺失项校验和响应式优化。

## 14. 最小验收用例

### 用例 1：单头普通线

- 类型：内线
- 子类型：单头
- 线材类型：普通线
- 连接器：任意 20PIN 或 40PIN
- 总长：100mm
- 颜色：黑

预期：

- 生成一个连接器、一组普通线。
- 图纸上有连接器、单端线束、尾部处理标注、BOM。

### 用例 2：双头屏蔽线/多芯线

- 类型：内线
- 子类型：双头
- 线材类型：屏蔽线/多芯线
- 左连接器：`A1008H-2X20P` 左边
- 右连接器：`A1008H-2X20P` 右边
- 总长：320mm
- 公差：10mm
- 前 3 芯：红/RD-01、黄/YL-02、蓝/BU-03

预期：

- 生成左右两个连接器。
- 生成一条 40 芯 jacketed material。
- 图纸上有 `320±10mm` 尺寸标注。
- 左连接器旁显示颜色/线号/接线关系。
- BOM 至少包含连接器、线材、端子或辅材行。

### 用例 3：缺失字段校验

- 不填写总长，直接生成。

预期：

- 不直接生成低质量图纸。
- 显示缺失字段摘要：总长为空、线号未填写、部分线材长度为空。

