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

### 待接入（已实现未使用）
- `src/lib/validation.ts` 的 `validateHarness` 完整校验引擎目前没有任何调用方，是最优先的功能接入点。
- `src/lib/commands.ts` 的 `removeNode` / `removeConnection` / `removeWire` 带 `policy` 参数的版本未被调用，删除操作直接走 store，绕过了命令层。
