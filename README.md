# 线束设计器 (Wire Harness Designer)

基于 Web 的线束设计工具，支持连接器选型、线材接线、保护套配置、BOM 生成和等距预览。

## ⚠️ 演示模式说明

当前版本为**前端演示原型**，使用浏览器 `localStorage` 存储数据，适用于单机演示和评估。

**限制：**
- 登录为本地模拟，密码以明文存储（非安全认证）
- 报价为前端估算价格，非正式报价
- 无后端持久化、无多用户协作、无版本管理
- 连接器目录为演示数据，不可直接用于生产

## 功能范围

- 项目创建（空白项目 + 模板项目）
- React Flow 画布进行连接器、线材、保护套的可视化编辑
- 连接器选型和有效侧锁定
- 线材接线明细（PIN、颜色、SIG）— 支持单端连接和同侧多 PIN
- 同侧 PIN 短接（Connector Jumper）
- 保护套配置（含波纹管材质：PP / PA / 不锈钢）
- 护套线 UL 号（UL2464 / UL20276 / 无）
- 等距预览（SVG 投影）
- BOM（物料清单）生成与导出
- 估算报价
- JSON 配置导入/导出
- 设计校验（实时问题反馈）

## 技术栈

| 层级 | 方案 |
|------|------|
| UI 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 画布 | @xyflow/react 12 (React Flow) |
| 状态 | Zustand 5 (persist) |
| 图标 | Lucide React |
| 测试 | Vitest 3 |

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

# 运行测试
npm test
```

## 数据模型 (schemaVersion 3)

系统收敛为三类业务对象：

1. **连接器** (`ConnectorInstance`) — 含 PIN 定义和短接 (`jumpers`)
2. **线材** (`CanvasWireMaterial`) — 含接线明细 (`circuits: MaterialCircuit[]`)
3. **保护套** (`ProtectiveSleeve`) — 含波纹管材质

PIN、颜色、SIG 直接归属于线材的接线明细 (`MaterialCircuit`)，不再通过独立的 Wire / Connection 对象间接表达。

### 核心类型

- `HarnessConfig` — 顶层配置（schemaVersion 3）
- `ConnectorInstance` — 连接器实例（含 `jumpers: ConnectorJumper[]`）
- `CanvasWireMaterial` — 线材（含 `circuits: MaterialCircuit[]`）
- `MaterialCircuit` — 接线明细（start/end 可选、color、signalName、coreIndex）
- `ConnectorPinRef` — 连接器 PIN 引用（connectorId + side + pin）
- `ConnectorJumper` — 同侧 PIN 短接（pins 数组）

### 交互规则

- 线材支持单端连接，颜色和 SIG 立即显示
- 同一线材端点可连接同一连接器同侧多个 PIN（创建多条接线明细）
- 连接器首次连接后锁定有效侧，另一侧 Handle 隐藏
- 同侧 PIN 可短接，短接网络可继续扩展
- 两端触碰后保持原线材，不创建新线材

## 数据存储

所有数据存储在浏览器的 `localStorage` 中：
- 项目列表：`harness-projects`
- 项目配置：`harness-project-config-{projectId}`
- 草稿配置：`harness-config`
- 用户信息：`harness-users`（演示模式）

配置加载时自动通过 `migrateHarnessConfig` 校验 schemaVersion 3 并规范化。
非 v3 数据被替换为默认配置（系统处于开发阶段，无需历史数据迁移）。

## 架构说明

### 状态管理

- `useHarnessStore` — 编辑器状态（配置、选择、保存状态）
- `useProjectStore` — 项目元数据和持久化
- `useUserStore` — 用户认证（演示模式）
- `useHistoryStore` — 撤销/重做历史

### 领域命令

`src/lib/commands.ts` 提供原子化的纯函数命令，确保数据一致性：
- `attachMaterialEndpoint` / `detachMaterialEndpoint` — 线材端点绑定
- `removeMaterialCircuit` / `updateMaterialCircuit` — 接线明细管理
- `addConnectorJumper` / `removeConnectorJumper` — 短接管理
- `changeConnectorPart` — 连接器换型（自动裁剪超范围 PIN）
- `getActiveConnectorSide` — 派生连接器有效侧
- `getConnectorPinBindings` — 派生 PIN 绑定状态

### 设计校验

`src/lib/validation.ts` 提供设计规则校验引擎，检测结果包括：
- PIN 越界和悬空引用
- 连接器有效侧冲突
- 接线明细自环
- 芯线索引越界
- 短接 PIN 不足
- 保护套材质缺失
- 重复 ID（含 circuit 和 jumper）

校验结果实时展示在 ConfigPanel 的"校验问题"区块中。

## 后续生产化方向

- 后端 API（NestJS/Fastify + PostgreSQL）
- 真实认证和授权
- 连接器/端子/密封件完整目录
- 真实报价规则和订单系统
- 多人协作和版本管理
- 3D 真实预览（当前为等距 SVG 投影）
- 代码分割和懒加载优化
- 撤销/重做 UI 暴露
