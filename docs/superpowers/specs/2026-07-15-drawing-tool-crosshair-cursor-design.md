# 绘图工具十字光标设计

## 目标

当直线、折线、曲线或自由画笔工具激活时，画布鼠标显示十字准星；选择工具保持现有默认光标。

## 设计

- 仅修改 `StandaloneDrawingCanvas` 的 `<canvas>` 样式，不改变外围面板、工具栏或弹窗光标。
- 根据 `toolMode` 动态拼接 Tailwind 类名：`select` 使用现有类名，其他四种绘图模式增加 `cursor-crosshair`。
- 不增加新状态、CSS 文件或依赖，不改变绘制、选择、右键和双击逻辑。

## 验证

- 交互合约测试断言画布按 `toolMode` 应用 `cursor-crosshair`。
- 运行聚焦测试、完整测试、ESLint、生产构建和 `git diff --check`。
