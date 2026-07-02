# 线材连接模型重构与交互修改执行方案

> 文档日期：2026-07-02  
> 适用项目：`wire-harness-designer`  
> 文档目的：把本次需求整理为可直接执行、可验证、可回滚的数据与交互修改方案。本文档只描述修改计划，不包含本轮代码实现。

---

## 1. 需求结论

本次修改不是局部 UI 调整，而是一次核心数据模型收敛。

当前系统同时维护：

- `Wire`：导线及 PIN、颜色、SIG 等信息；
- `Connection`：连接器之间的连接关系；
- `CanvasWireMaterial`：画布上可拖动的线材；
- `MaterialAttachment`：线材与连接器端点的视觉连接关系。

这四套数据需要相互同步。当前“单端不显示 PIN”“两端触碰后又生成新线材”“多点连接受限”等问题，正是视觉线材与 `Wire/Connection` 电气数据不同步造成的。

本次重构后的业务对象只保留：

1. 连接器；
2. 线材（电子线或护套线）；
3. 保护套。

`Wire`、`Connection`、`WireBundle` 及其“导线列表/连接矩阵”等旧概念应从业务模型和界面中移除。PIN、颜色、接线定义 SIG 等数据直接归属于线材的接线明细，不再通过额外的“导线”对象间接表达。

---

## 2. 对需求的逐项解释

| 编号 | 原始要求 | 执行解释 |
|---|---|---|
| R1 | 线材只连接一边也要支持 | 线材左右端点均为可选连接；任意一端连接后立即保存，不要求另一端存在 |
| R2 | 左侧连接时左侧显示 PIN，右侧空白 | 线材信息窗按物理方向显示左右两列；未连接侧显示空白，不填充虚假 PIN |
| R3 | 同一个连接器同一侧可连接多个点 | 同一线材端点允许保存多条 PIN 绑定，不能用单个 `startAttach/endAttach` 覆盖前一条绑定 |
| R4 | 去除导线，只保留连接器、线材、保护套 | 删除独立 `Wire/Connection/WireBundle` 领域对象及其操作入口；PIN、颜色、SIG 下沉到线材接线明细 |
| R5 | 护套线有可选 UL 号，单选且可无 | 护套线规格增加 `ulNumber?: ...`，界面提供“无 + 一个 UL 号”的单选控件 |
| R6 | 波纹管显示材质 | 画布、BOM、报价明细等位置统一显示“PA波纹管”“PP波纹管”“不锈钢波纹管” |
| R7 | 单端连接也显示 PIN、颜色、SIG | 线材一端首次连接时立即创建接线明细；颜色和 SIG 不再等待第二端连接 |
| R8 | 连接器一面连接后，另一面端点消失 | 连接器首次在左/右侧建立有效连接后，将可用侧锁定为该侧，另一侧所有 PIN Handle 隐藏且不可命中 |
| R9 | 连接器同侧 PIN 可短接且不限继续连接 | 同一连接器同一可用侧的 PIN 之间可建立短接；PIN 不采用“一次占用后禁用”的规则 |
| R10 | 线材两端触碰连接器后保持原线材 | 触碰操作只更新当前 `materialId` 的连接状态，禁止在该流程中创建新的 `CanvasWireMaterial` |

---

## 3. 当前代码现状与根因

### 3.1 单端连接当前不会形成电气数据

`src/components/canvas/HarnessCanvas.tsx` 中的 `reconcileMaterialConnection` 明确要求线材的 `start` 和 `end` 都存在，才创建 `Connection/Wire`。只有一端时会调用 `stripMaterialElectricalConnection`，因此信息窗找不到可展示的 `Wire`。

### 3.2 信息窗仍然依赖旧 `Wire`

`src/components/canvas/WireMaterialNode.tsx` 的 PIN、颜色、SIG 行来自 `config.wires`。即使 `MaterialAttachment` 已记录单端触碰，只要没有生成 `Wire`，窗口仍显示“连接另一端后，导线 Pin 将自动显示”。

### 3.3 多点连接被现有补丁逻辑限制

`attachNearbyMaterialEndpoints` 只有在特定条件下才把第二条绑定当作同侧分支，其余情况会改写已有绑定。该逻辑无法稳定表达“同一端点连接同一连接器同侧多个 PIN”。

### 3.4 连接器两侧 Handle 始终同时存在

`src/components/canvas/ConnectorNode.tsx` 对每个 PIN 固定渲染：

- `left-pin-N`
- `right-pin-N`

目前没有“有效连接侧”的状态或派生规则，因此另一面的端点不会消失。

### 3.5 连接器同侧 Handle 类型不支持直接短接

当前左侧 Handle 为 `target`，右侧 Handle 为 `source`。同侧两个 Handle 类型相同，默认 React Flow 连接模式下无法直接相连。需要改为宽松连接模式并在领域层校验，而不是依赖 source/target 类型表达业务规则。

### 3.6 波纹管材质已保存，但显示函数没有使用

`ProtectiveSleeve` 已有 `corrugatedMaterial`，配置弹窗也可选择 PP、PA、不锈钢；但 `ProtectiveSleeveNode` 和 BOM 只读取通用标签“波纹管”，因此材质没有显示。

### 3.7 护套线当前没有 UL 字段

`JacketedWireSpec` 没有 `ulNumber`；电子线的 UL 又被固定为 `'1007'`。需要扩展护套线 schema、表单、显示、持久化和 BOM。

---

## 4. 推荐的唯一数据模型

### 4.1 顶层文档

```ts
interface HarnessConfig {
  schemaVersion: 3;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  connectors: ConnectorInstance[];
  materials: CanvasWireMaterial[];
  protectiveSleeves: ProtectiveSleeve[];
  quantity: number;
  leadTime: 'rush' | 'standard' | 'economy';
}
```

说明：

- 可为降低一次性改动保留 `nodes` 字段名，但其元素类型只能是连接器；不再保留 `junction/terminal`。
- 删除 `connections`、`wires`、`bundles` 和全局字符串型 `protection`。
- `schemaVersion` 用于把旧项目安全迁移到新模型。

### 4.2 线材接线明细

推荐把 PIN、颜色、SIG 直接放在线材内：

```ts
type ConnectorSide = 'left' | 'right';
type MaterialEndpoint = 'start' | 'end';

interface ConnectorPinRef {
  connectorId: string;
  connectorSide: ConnectorSide;
  pin: number;
}

interface MaterialCircuit {
  id: string;
  start?: ConnectorPinRef;
  end?: ConnectorPinRef;
  color: string;
  signalName: string;
  coreIndex?: number;
}

interface CanvasWireMaterial {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  spec: CanvasWireSpec;
  circuits: MaterialCircuit[];
  expandedByDefault?: boolean;
}
```

该模型的行为：

- 只连接左端：`start` 有值，`end` 为 `undefined`；
- 只连接右端：`start` 为 `undefined`，`end` 有值；
- 两端连接：同一条 `MaterialCircuit` 的 `start/end` 都有值；
- 同一线材端点连接多个 PIN：增加多条 `MaterialCircuit`，不创建新线材；
- 颜色和 SIG 始终属于接线明细，因此单端也能立即显示；
- 护套线可通过 `coreIndex` 将明细绑定到具体芯线；
- 电子线默认一条明细，但允许按业务要求扩展为多个连接点。

代码命名建议使用 `MaterialCircuit` 或 `PinAssignment`，界面统一称“接线明细”，不要再显示“导线”。

### 4.3 连接器短接

短接建议存放在连接器实例内部，不增加第四类画布物料：

```ts
interface ConnectorJumper {
  id: string;
  side: ConnectorSide;
  pins: number[];
}

interface ConnectorInstance {
  id: string;
  position: { x: number; y: number };
  connector: Connector;
  label: string;
  jumpers: ConnectorJumper[];
}
```

使用 `pins: number[]` 而不是固定的 `fromPin/toPin`，可以表达：

- Pin1 与 Pin2 短接；
- 在同一短接网络中继续加入 Pin3、Pin4；
- 同一 PIN 参与多个连接或短接时不被前端强行禁用。

如果产品希望每次短接都只画一条二点边，也可内部保存为多个二元 jumper，但领域层需要能计算同一短接网络。

### 4.4 护套线 UL 号

```ts
type JacketUlNumber = string; // 最终应收敛为产品确认后的目录枚举

interface JacketedWireSpec {
  kind: 'jacketed';
  ulNumber?: JacketUlNumber;
  // 其余现有字段保持
}
```

表单应使用单选或单选式下拉：

- 无；
- 产品确认后的 UL 号列表。

空值必须保存为 `undefined`，不能保存空字符串。

### 4.5 波纹管名称

增加唯一显示函数，所有界面复用：

```ts
function getProtectiveSleeveDisplayName(sleeve: ProtectiveSleeve): string {
  if (sleeve.type !== 'corrugated') {
    return PROTECTIVE_SLEEVE_LABELS[sleeve.type];
  }
  return `${sleeve.corrugatedMaterial ?? '未指定材质'}波纹管`;
}
```

示例：

- `PA波纹管`
- `PP波纹管`
- `不锈钢波纹管`

---

## 5. 交互规则与状态机

### 5.1 线材端点连接

1. 用户拖动现有线材，或从线材端点拖出连接线。
2. `start/end` 端点触碰连接器的某个可见 PIN Handle。
3. 系统锁定当前 `materialId`，只更新该线材的 `circuits`。
4. 若当前端点存在可补齐的单端接线明细，则补到该明细的空白侧。
5. 若不存在可补齐项，则在线材内新建一条接线明细。
6. 新明细立即显示 PIN、颜色和 SIG。
7. 整个流程不得调用 `createDefaultCanvasMaterial`，不得生成第二条线材。

为避免两条空白明细配对错误，建议记录本次手势上下文：

```ts
interface PendingMaterialConnectGesture {
  materialId: string;
  endpoint: 'start' | 'end';
  circuitId?: string;
}
```

第二端连接时优先补齐用户当前选中的 `circuitId`；没有选中时才按“最早未配对明细”补齐。

### 5.2 单端信息窗

信息窗固定为：

```text
左侧 PIN | 颜色 | 接线定义 | 右侧 PIN
Pin1     | 红色 | SIG      |
```

或：

```text
左侧 PIN | 颜色 | 接线定义 | 右侧 PIN
         | 黑色 | GND      | Pin3
```

规则：

- 未连接侧保持空白，不显示破折号形式的虚假 PIN；
- PIN 使用连接器真实标签时，可显示 `Pin1 / VCC`，但数字 PIN 必须保留；
- 颜色默认来自线材规格或护套线对应芯线颜色；
- SIG 是可编辑值；未定义时的显示规则见“待确认问题”；
- 单端连接后自动展开信息窗；
- 删除某一端绑定后，另一端数据继续保留。

### 5.3 同一线材端点连接同一连接器多个 PIN

- 每次连接手势增加或更新一条 `MaterialCircuit`；
- 不能覆盖前一条 PIN；
- 不因 PIN 已连接而禁用；
- 信息窗每个接线明细显示一行；
- 删除一行只删除该接线明细，不删除整条线材；
- 电子线与护套线是否都允许无限多明细，见待确认问题。

### 5.4 连接器有效侧锁定

为每个连接器派生：

```ts
type ActiveConnectorSide = 'left' | 'right' | undefined;
```

建议规则：

1. 无外部线材绑定时：左右两侧端点都显示；
2. 首条外部线材接到左侧：`activeSide = 'left'`，右侧全部 Handle 隐藏；
3. 首条外部线材接到右侧：`activeSide = 'right'`，左侧全部 Handle 隐藏；
4. 同侧后续连接不受限制；
5. 删除该连接器全部外部绑定后：恢复左右两侧端点；
6. 数据导入时若同一连接器左右两侧同时存在旧连接，迁移器标记冲突，不静默删除任何一侧。

隐藏必须同时做到：

- 不渲染或设置为不可交互；
- 不进入自动吸附候选；
- 不接受 React Flow 连接；
- 不能只做 CSS `opacity: 0`。

### 5.5 同侧 PIN 短接

建议开启 React Flow 宽松连接模式，使同类 Handle 可以连接，再由 `isValidConnection` 和领域命令判断：

- 起点和终点必须属于同一个连接器；
- 两个 PIN 必须位于同一可用侧；
- PIN 可继续参与其他短接或线材连接；
- 不能将一个 PIN 与自身建立无意义短接；
- 连接成功后创建/扩展 `ConnectorJumper`，不创建线材；
- 短接边使用独立视觉样式，避免与线材混淆；
- 删除短接边只修改 `jumpers`。

### 5.6 拖动触碰与显式连线统一

当前“移动线材靠近连接器自动吸附”和“拖 Handle 建立连接”必须调用同一个领域命令，例如：

```ts
attachMaterialEndpoint({
  materialId,
  endpoint,
  connectorId,
  connectorSide,
  pin,
  circuitId,
});
```

禁止两个入口各自拼装数组，否则会再次出现触碰结果和显式连线结果不同的问题。

---

## 6. 领域命令

需要以纯函数或原子 Store Action 实现以下命令：

```ts
attachMaterialEndpoint(...)
detachMaterialEndpoint(...)
removeMaterialCircuit(...)
updateMaterialCircuit(...)
addConnectorJumper(...)
extendConnectorJumper(...)
removeConnectorJumper(...)
removeMaterial(...)
removeConnector(...)
changeConnectorPart(...)
```

命令约束：

- 一次操作原子更新所有引用；
- 不在 React 组件中直接拼接 `circuits/jumpers`；
- 删除连接器时，保留线材本体，仅清空受影响的一侧 PIN 引用；
- 删除线材时，保护套自动解除 `attachedMaterialId`，保护套本体是否保留沿用当前行为；
- 更换连接器型号后，超范围 PIN 不得静默保留；
- 所有命令更新 `updatedAt` 并进入撤销历史；
- 连接或短接不使用“PIN 已占用”作为拒绝条件。

---

## 7. 分阶段执行顺序

### Phase 0：建立基线和自动化测试

1. 记录当前 `npm run lint`、`npm run build` 结果；
2. 引入 Vitest，优先覆盖领域命令和迁移函数；
3. 如环境允许，引入 React Testing Library 与 Playwright；
4. 先写本需求的失败测试，再修改模型。

当前基线（2026-07-02）：

- `npm run lint`：通过；
- `npm run build`：通过；
- 构建有单个 JS chunk 超过 500 kB 的警告；
- 项目当前未配置自动化测试。

### Phase 1：新增 schema 与迁移器

1. 给 `HarnessConfig` 增加 `schemaVersion`；
2. 新增 `MaterialCircuit`、`ConnectorPinRef`、`ConnectorJumper`；
3. 给护套线增加可选 `ulNumber`；
4. 实现旧 `Wire/Connection/MaterialAttachment` 到新线材明细的迁移；
5. 迁移成功前保留旧数据备份，迁移失败时不覆盖原项目。

### Phase 2：重写领域命令和 Store

1. 实现线材端点绑定/解绑命令；
2. 实现多 PIN 明细；
3. 实现短接命令；
4. 删除 `addWire/updateWire/removeWire`；
5. 删除 `addConnection/updateConnection/removeConnection`；
6. 将选择模型调整为 `connector/material/sleeve/jumper`；
7. 删除 `selectedWireId/selectedBranchId/branches` 等兼容别名。

### Phase 3：重写画布连接交互

1. `HarnessCanvas` 不再创建 `Connection/Wire`；
2. 线材触碰和 Handle 连线统一调用 `attachMaterialEndpoint`；
3. 第二端连接保持同一个 `materialId`；
4. 自动吸附候选排除连接器隐藏侧；
5. 开启并校验同侧 PIN 短接；
6. 为短接增加独立 Edge 类型；
7. 删除 `ensureConnectionMaterial`、`reconcileMaterialConnection`、`stripMaterialElectricalConnection`。

### Phase 4：连接器节点

1. 按绑定数据派生 `activeSide`；
2. 有效侧锁定后不渲染另一侧 Handle；
3. PIN 状态直接读取线材 `circuits` 和连接器 `jumpers`；
4. 一个 PIN 显示多个连接标记；
5. 短接中的 PIN 显示独立标记；
6. 保留大于 6 PIN 的折叠逻辑，但确保被折叠 PIN 仍可通过完整视图操作。

### Phase 5：线材节点与配置弹窗

1. 信息窗改读 `material.circuits`；
2. 单端绑定立即显示一行；
3. 未连接侧留空；
4. 将“X 根导线”改为“X 条接线”或“X 个连接点”；
5. 删除“连接另一端后，导线 Pin 将自动显示”；
6. 护套线配置增加 UL 单选，可选择“无”；
7. 线材详情同步显示护套线 UL；
8. 删除一条明细不得删除线材。

### Phase 6：删除旧导线界面

删除或重写以下模块：

- `src/components/panels/WireListPanel.tsx`
- `src/components/panels/WireTablePanel.tsx`
- `src/components/panels/PinMatrixPanel.tsx`
- `src/components/panels/ConnectorPinView.tsx` 中依赖 `Wire` 的部分
- `src/components/panels/PropertyInspector.tsx` 中的导线与连接编辑器
- `src/components/canvas/WireEdge.tsx` 及旧 Connection Edge
- `src/lib/commands.ts` 中的 Wire/Connection 命令

`ConfigPanel` 建议只保留：

- 当前连接器属性；
- 当前线材属性与接线明细；
- 当前保护套属性；
- 项目级设置。

所有用户可见的“导线”文案应通过全局搜索清理，保留“线材”“芯线”“接线明细”等明确术语。

### Phase 7：波纹管、BOM、报价与预览

1. 增加统一的保护套名称函数；
2. 画布节点显示材质；
3. BOM 按“类型 + 材质 + 长度”分组，避免 PA 与 PP 合并；
4. 报价明细显示材质；
5. BOM 从 `materials` 计算线材，不再读取 `wires`；
6. 护套线作为一个物料计价，芯线接线明细不重复计线材成本；
7. 预览直接读取线材及其左右连接器位置；
8. 状态栏不再显示“连接数/导线数”，改为“连接器/线材/保护套”。

### Phase 8：项目模板、导入导出和文档

1. 重写 `ProjectWizard` 模板生成逻辑；
2. 模板直接生成线材与 `circuits`；
3. JSON 导入先迁移再校验；
4. JSON 导出只输出新模型；
5. 更新 README 的领域模型说明；
6. 说明旧数据迁移策略和不可逆边界。

### Phase 9：最终清理

1. 删除 `Wire`、`Connection`、`WireBundle` 类型；
2. 删除不再引用的旧数据常量和组件；
3. 全局确认不存在 `config.wires/config.connections`；
4. 运行类型检查、lint、构建和全量测试；
5. 完成桌面尺寸及 1024px 宽度下的手工验收。

---

## 8. 预计修改文件

### 核心类型与状态

- `src/types/harness.ts`
- `src/stores/harnessStore.ts`
- `src/stores/projectStore.ts`
- `src/lib/commands.ts`
- `src/lib/validation.ts`

### 画布

- `src/components/canvas/HarnessCanvas.tsx`
- `src/components/canvas/ConnectorNode.tsx`
- `src/components/canvas/WireMaterialNode.tsx`
- `src/components/canvas/WireMaterialDialog.tsx`
- `src/components/canvas/ProtectiveSleeveNode.tsx`
- `src/components/canvas/ProtectiveSleeveDialog.tsx`
- `src/components/canvas/ContextMenu.tsx`
- 新增短接 Edge 组件
- 删除或替换旧连接 Edge 组件

### 面板、BOM、报价与预览

- `src/components/panels/ConfigPanel.tsx`
- `src/components/panels/PropertyInspector.tsx`
- `src/components/panels/BomPanel.tsx`
- `src/components/panels/QuotePanel.tsx`
- `src/components/preview3d/Preview3D.tsx`
- `src/lib/bom.ts`
- `src/lib/pricing.ts`
- `src/lib/canvasMaterials.ts`

### 项目创建和文档

- `src/components/project/ProjectWizard.tsx`
- `README.md`
- 新增 schema migration 文件和测试文件

---

## 9. 数据迁移方案

### 9.1 迁移优先级

对每条旧 `CanvasWireMaterial`：

1. 找出其 `materialAttachments`；
2. 如有 `connectionId`，读取该连接下全部 `Wire`；
3. 每个旧 `Wire` 生成一条 `MaterialCircuit`；
4. 按旧附件的 handle 解析实际左右 PIN；
5. 只有一侧附件时，仅填充对应一侧；
6. 颜色、SIG 优先取旧 `Wire`，缺失时取线材规格默认值；
7. 护套线通过颜色和顺序匹配 `coreIndex`；
8. 迁移完成后移除旧 `connectionId`。

对没有 `CanvasWireMaterial` 的旧 `Connection`：

1. 自动生成一条线材；
2. 将原连接下的 `Wire` 转换为接线明细；
3. 使用原长度、AWG、颜色生成尽可能接近的线材规格；
4. 若同一连接中的旧导线规格不同，标记迁移警告，不能无提示丢弃差异。

### 9.2 冲突处理

以下情况必须记录为迁移问题并展示给用户：

- 同一连接器旧数据同时使用左、右两侧；
- PIN 超出新连接器范围；
- 旧 `Wire` 找不到对应线材；
- 一个护套线的接线明细超过芯数；
- 同一旧 Connection 中存在无法合并的不同长度或线规；
- 波纹管缺少材质。

### 9.3 安全策略

- 读取旧项目后先在内存迁移和校验；
- 校验通过后才写入新 schema；
- 首次迁移保留一份旧 JSON 备份；
- 迁移失败显示原因并允许导出原始数据；
- 不允许用空数组覆盖无法迁移的数据。

---

## 10. 校验规则

新 `validateHarness` 至少检查：

- 线材引用的连接器是否存在；
- PIN 是否在连接器范围内；
- `connectorSide` 是否与连接器当前有效侧冲突；
- 同一条接线明细是否错误地把同一 PIN 同时作为左右端；
- 护套线 `coreIndex` 是否越界；
- 护套线 UL 是否在允许目录内；
- 波纹管是否已选择材质；
- 短接 PIN 是否存在且不少于两个不同 PIN；
- 保护套的 `attachedMaterialId` 是否存在；
- 所有 ID 是否唯一。

允许但不报错：

- 线材只有一端连接；
- 线材两端均未连接；
- 同一线材端点连接同一连接器的多个 PIN；
- 同一 PIN 参与多个线材连接或短接；
- 接线定义暂时为空（若产品确认必须默认 SIG，则改为必填）。

---

## 11. 验收用例

### A. 单端连接

1. 新建一条红色电子线；
2. 仅将左端接到连接器左侧 Pin2；
3. 信息窗立即显示左侧 `Pin2`、红色和 SIG；
4. 右侧 PIN 单元格为空；
5. 保存并重新打开项目，状态不丢失。

### B. 反方向单端连接

1. 仅将线材右端接到连接器右侧 Pin4；
2. 左侧 PIN 为空，右侧显示 `Pin4`；
3. 颜色和 SIG 正常显示并可编辑。

### C. 同端多点

1. 将同一线材左端依次接到同一连接器左侧 Pin1、Pin2、Pin5；
2. 不生成新线材；
3. 信息窗出现三条接线明细；
4. 删除 Pin2 明细后，Pin1 和 Pin5 保留。

### D. 两端连接保持身份

1. 记录线材 `materialId`；
2. 左端接连接器 A 的 Pin1；
3. 右端接连接器 B 的 Pin3；
4. 前后 `materialId` 不变；
5. `materials.length` 不增加；
6. 同一行显示 `Pin1 → Pin3`、颜色和 SIG。

### E. 连接器侧锁定

1. 连接器未连接时左右端点都可见；
2. 左侧任一 PIN 接上线材后，右侧全部端点消失且不可命中；
3. 左侧可继续连接其他 PIN；
4. 删除左侧全部外部连接后，右侧端点恢复。

### F. 同侧短接

1. 在连接器右侧 Pin1 与 Pin2 之间建立短接；
2. 继续把 Pin3 加入同一短接网络；
3. Pin1、Pin2、Pin3 仍可接线材；
4. 删除一条短接关系不删除线材；
5. 保存并重新打开后短接关系保留。

### G. 护套线 UL

1. 新建护套线；
2. UL 号可选择“无”；
3. 也可从确认后的目录中单选一个 UL 号；
4. 保存、重开、BOM 和详情显示一致。

### H. 波纹管材质

1. 分别创建 PP、PA、不锈钢波纹管；
2. 画布显示对应材质名称；
3. BOM 不把不同材质合并；
4. 报价使用对应材质系数。

### I. 旧数据迁移

1. 打开包含 `connections/wires/materialAttachments` 的旧项目；
2. 迁移后线材数量和可见拓扑合理；
3. PIN、颜色、SIG 不丢失；
4. 单端旧附件被保留；
5. 导出 JSON 不再包含旧 `wires/connections`。

---

## 12. 必须执行的验证命令

```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

如果本轮不引入 E2E，至少必须完成：

- 领域命令单元测试；
- schema 迁移测试；
- 连接器节点和线材信息窗组件测试；
- 按第 11 节逐项手工验收，并记录结果。

---

## 13. 待确认问题

以下问题会影响最终数据结构或默认行为，实施前请确认：

1. **护套线 UL 号可选项有哪些？**  
   当前只明确“单选、可无”，但没有给出允许选择的 UL 号目录。请提供完整选项，例如 `UL2464`、`UL20276` 等。

2. **未填写接线定义时，`SIG` 是默认真实值，还是仅作为占位提示？**  
   如果是默认真实值，新接线明细应保存 `signalName: 'SIG'`；如果只是提示，则数据保持空值，界面用 placeholder 显示 SIG。

3. **“同一线材同一侧连接多个点”表示多个独立接线明细，还是这些 PIN 必须视为电气短接？**  
   本文暂按“多个独立接线明细”设计；只有显式短接操作才把 PIN 视为同一网络。

4. **电子线同一端连接多个 PIN 是否允许？**  
   从物理上通常意味着分叉或并接。本文按“不限制”实现；如果只有护套线允许多芯多点，需要增加类型限制。

5. **短接是否需要线材属性？**  
   本文按“连接器内部跳线/短接关系”处理，不要求长度、颜色、AWG、UL 或 SIG。如果短接实际也是一段线材，则应改为引用现有线材，而不是 `ConnectorJumper`。

6. **短接是否会锁定连接器有效侧？**  
   本文建议只有外部线材连接才锁定左右侧，内部短接本身不锁定；但短接只能在当前有效侧建立。

7. **同一个 PIN 是否允许重复连接完全相同的线材端点？**  
   “不做限制”可理解为 PIN 可参与多个不同连接，但通常仍应阻止同一 `materialId + endpoint + connectorId + side + pin` 的完全重复记录。请确认是否需要允许完全重复。

8. **旧项目是否必须无损迁移？**  
   本文按“必须迁移并保留备份”设计。如果可以放弃旧本地项目，可大幅减少迁移工作，但会丢失现有用户数据。

9. **连接器一侧锁定后，是否允许用户手动切换到另一侧？**  
   本文仅在删除该连接器全部外部连接后自动恢复双侧。如果需要“一键翻面”，需要增加带冲突提示的翻面命令。

10. **护套线多芯颜色是否仍沿用当前固定颜色序列？**  
    当前代码自动生成固定芯线颜色且不可逐芯修改。若实际产品允许自定义每芯颜色，应同时纳入本次线材接线明细编辑。

---

## 14. 完成定义

只有同时满足以下条件，才能认为本次需求完成：

- 业务数据中不再存在独立 `Wire/Connection/WireBundle`；
- 单端线材可保存，并显示正确方向的 PIN、颜色、SIG；
- 同一线材端点可以连接同一连接器同侧多个 PIN；
- 两端触碰后仍是原线材，不增加线材数量；
- 连接器有效侧锁定和恢复行为正确；
- 同侧 PIN 可短接并继续参与其他连接；
- 护套线 UL 可单选或无；
- 波纹管所有用户可见位置均显示材质；
- 旧项目迁移经过确认并有测试；
- lint、build、自动化测试和手工验收全部通过。

