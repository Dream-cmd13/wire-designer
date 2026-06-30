# Wire Harness Designer — 代码变更记录与提交规则

## 提交消息规则

所有提交消息使用 Conventional Commits 格式：

```
<type>(<scope>): <简短描述>
```

| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| refactor | 重构，不改变外部行为 |
| types | 仅修改类型定义 |
| style | 仅 UI 样式调整 |
| chore | 构建、配置、工具变更 |

scope 使用受影响的主要文件/模块名，如 `canvas`、`store`、`types`、`dialog`。




## 编码规范记录

### 状态管理
- store 的原子 mutation（`addNode`、`removeNode` 等）供内部使用；跨实体的批量变更用 `replaceDocument` 保证原子性，避免中间状态触发多次渲染。
- `harnessStore` 的 `persist` 与 `projectStore.saveCurrentConfig` 存在双重持久化；未来统一前，`replaceDocument` 后两者都会写入，注意切换项目时清空旧快照。

### 画布尺寸
- 线材画布宽度统一用 `lengthMmToCanvasWidth(mm)`（`src/lib/canvasMaterials.ts`）换算，不可硬编码 `width: 260`。
- 保护套高度常量 `PROTECTIVE_SLEEVE_HEIGHT` 影响画布吸附计算，修改时同步检查 `HarnessCanvas.tsx` 中 `centerSleeveOnMaterial` 和 `onNodeDragStop` 的相关计算。

### 类型扩展
- 新增可选字段时在 `createDefaultConfig`、`createDefaultCanvasMaterial`、Dialog 默认值三处同步初始化，避免运行时 `undefined` 防御散落各处。
- `ProtectiveSleeveType` 是字符串联合类型，枚举顺序决定 Dialog 展示顺序；新增类型时同步更新 `PROTECTIVE_SLEEVE_LABELS`、`PROTECTIVE_SLEEVE_PRICE_PER_METER`、`sleeveStyles`（Node）。

## 本会话改动记录

### fix(canvas): 保护套文字双行截断
- **问题**：`ProtectiveSleeveNode` 高度固定 24px，文字自动折行后被 `overflow-hidden` 裁掉
- **改动**：`PROTECTIVE_SLEEVE_HEIGHT` 24→36；文字改为明确双行 flex-col + `leading-none` + `gap-0.5`
- **提交消息**：`fix(canvas): fix protective sleeve label clipping by splitting into two lines`

### feat(canvas): 线材自动绑定 Connection
- **问题**：手动连接线材两端到连接器后出现"两端已连接但无导线"提示，重复拖拽连接器才能激活逻辑层
- **改动**：`addAttachment` 末尾检测两端均已连接到不同连接器时，自动创建 Connection + 默认 Wire 并绑定 `connectionId`
- **提交消息**：`feat(canvas): auto-create connection when wire material has both ends attached`

### feat(types): 护套线支持 lengthMm + 统一画布比例
- **问题**：护套线无长度参数；线材和保护套画布宽度使用不同比例函数，无法做到等比显示
- **改动**：`JacketedWireSpec` 加 `lengthMm`；新增 `lengthMmToCanvasWidth`（0.6px/mm，40–600px）作为统一函数；Dialog 加护套线长度字段；`handleSubmit` 带 `width`；`ensureConnectionMaterial` 不再硬编码 `width: 260`
- **提交消息**：`feat(types): add lengthMm to JacketedWireSpec and unify canvas width scale`

### feat(canvas): 波纹管材质子类型（PP/PA/不锈钢）
- **问题**：波纹管只有一种，实际有 PP、PA、不锈钢三种材质，价格差异大
- **改动**：`ProtectiveSleeve` 加可选 `corrugatedMaterial: CorrugatedMaterial`；Dialog 选波纹管时展示材质子选项（3列）；Node 显示材质名；`onConfirm` 签名透传 `corrugatedMaterial`
- **提交消息**：`feat(canvas): add corrugated tube material variants (PP/PA/stainless-steel)`

### fix(ux): 去除线材右键菜单重复项
- **问题**："编辑线材信息"（打开连接面板）和"编辑线材参数"（打开 Dialog）功能高度重叠，用户困惑
- **改动**：删除"编辑线材信息"，保留"编辑线材参数"（配置线材 Dialog）
- **提交消息**：`fix(ux): remove duplicate "edit material info" menu item`

### feat(canvas): 线材支持单端连接 + 同侧多 Pin
- **问题**：①线材必须双端连接才能在信息面板显示 Pin；②同连接器同侧不同 Pin 的连接被去重逻辑拦截
- **改动**：
  - `getMaterialWireEntries` 放开"必须有 startAttachment 和 endAttachment"限制，单端时按已连接侧过滤导线
  - Pin 行渲染：未连接一侧显示 `—`（灰色只读），不允许编辑
  - `addAttachment` 去重 key 加入 `connectorHandle`，精确到 Pin 级别
  - 自动创建 Connection 的条件加入 `fromNodeId !== toNodeId`，防止自引用
- **提交消息**：`feat(canvas): support single-side material attachment and multi-pin fan-out on same connector`

---

### 待接入（已实现未使用）
- `src/lib/validation.ts` 的 `validateHarness` 完整校验引擎目前没有任何调用方，是最优先的功能接入点。
- `src/lib/commands.ts` 的 `removeNode` / `removeConnection` / `removeWire` 带 `policy` 参数的版本未被调用，删除操作直接走 store，绕过了命令层。
