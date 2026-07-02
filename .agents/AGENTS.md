# Wire Harness Designer — 代码变更记录与提交规则

## 提交消息规则
每次修改完代码后在回复的最后面加上建议的提交消息
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



