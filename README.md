# 线束设计器 (Wire Harness Designer)

基于 Web 的线束设计工具，支持连接器选型、导线配置、BOM 生成和等距预览。

## ⚠️ 演示模式说明

当前版本为**前端演示原型**，使用浏览器 `localStorage` 存储数据，适用于单机演示和评估。

**限制：**
- 登录为本地模拟，密码以明文存储（非安全认证）
- 报价为前端估算价格，非正式报价
- 无后端持久化、无多用户协作、无版本管理
- 连接器目录为演示数据，不可直接用于生产

## 功能范围

- 项目创建（空白项目 + 模板项目）
- React Flow 画布进行节点和连接的可视化编辑
- 连接器选型和 PIN 映射
- 导线配置（线规、线材、颜色、长度、屏蔽）
- 等距预览（SVG 投影）
- BOM（物料清单）生成与导出
- 估算报价
- JSON 配置导入/导出

## 技术栈

| 层级 | 方案 |
|------|------|
| UI 框架 | React 19 + TypeScript |
| 构建 | Vite |
| 样式 | Tailwind CSS |
| 画布 | @xyflow/react (React Flow) |
| 状态 | Zustand |
| 图标 | Lucide React |

## 快速开始

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev

# 生产构建
npm run build

# 代码检查
npm run lint
```

## 数据存储

所有数据存储在浏览器的 `localStorage` 中：
- 项目列表：`harness-projects`
- 项目配置：`harness-project-config-{projectId}`
- 用户信息：`harness-users`（演示模式）

**注意：** 清除浏览器缓存会丢失所有数据。

## 架构说明

### 数据模型

- `HarnessConfig` - 线束设计完整配置
- `HarnessNode` - 画布节点（连接器/接点/端子）
- `Connection` - 节点间的线缆连接
- `Wire` - 单根导线，包含精确的 PIN 到 PIN 映射

### 状态管理

- `useHarnessStore` - 编辑器状态（配置、选择、保存状态）
- `useProjectStore` - 项目元数据和持久化
- `useUserStore` - 用户认证（演示模式）

### 领域命令

`src/lib/commands.ts` 提供原子化的数据操作命令，确保数据一致性：
- `addConnectorNode` / `updateNodeProperties` / `changeConnectorPart`
- `createConnection` / `updateConnectionInfo`
- `addWireToConnection` / `updateWireProperties`
- `removeNode` / `removeConnection` / `removeWire`

### 设计校验

`src/lib/validation.ts` 提供设计规则校验引擎，检测：
- PIN 越界和悬空引用
- 连接/导线关系不一致
- 非法长度、数量
- 孤儿导线和空连接

## 后续生产化方向

- 后端 API（NestJS/Fastify + PostgreSQL）
- 真实认证和授权
- 连接器/端子/密封件完整目录
- 真实报价规则和订单系统
- 多人协作和版本管理
- 3D 真实预览（当前为等距 SVG 投影）
