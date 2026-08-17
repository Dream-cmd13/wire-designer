# 线束设计器 (Wire Harness Designer)

基于 Web 的线束设计工具，支持连接器选型、线材接线、保护套配置、BOM 生成和等距预览。

## 当前运行模式

当前仓库默认运行模式已经收敛为前端单体：

- UI、画布编辑、BOM、报价预估都在 `Vite + React` 前端内运行；
- 项目和登录仍使用浏览器 `localStorage`，方便快速原型和单机演示；
- `Supabase` 作为下一步轻量云端方案预留，不再要求先搭 `NestJS` 后端。

**限制：**
- 当前 UI 登录仍是本地模拟，不能用于生产
- 报价为前端估算价格，非正式报价
- 当前项目数据只保存在本机浏览器，不会自动云端同步
- 暂无多人实时协作
- 连接器目录为演示数据，不可直接用于生产

## 功能范围

- 项目创建（空白项目 + 模板项目）
- 完整设计 JSON 导入/导出（导入先校验并创建新项目，不覆盖现有项目）
- React Flow 画布进行连接器、线材、保护套的可视化编辑
- 连接器选型和有效侧锁定
- 线材接线明细（PIN、颜色、SIG）— 支持单端连接和同侧多 PIN
- 同连接器电子线自动合并信息表（最下方统一展示，每条线一行）
- 信息表按连接器标签和型号动态生成 PIN 列，并支持 `Pin+数字` 编辑
- 同侧 PIN 短接（Connector Jumper）
- 保护套配置（可覆盖一条、任意子集或整组线材）
- 线材标签与号码管配置
- 画布“添加模型”入口（当前提供 1 个“方块外模”，自动显示在线材与连接器之间并遮住中间连接线）
- 护套线 UL 号（UL2464 / UL20276 / 无）
- 等距预览（SVG 投影）
- BOM（物料清单）生成与导出
- 估算报价
- 报价估算 JSON 导出
- 设计校验（实时问题反馈）

## 技术栈

| 层级 | 方案 |
|------|------|
| UI 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 画布 | @xyflow/react 12 (React Flow) |
| 状态 | Zustand 5 |
| 图标 | Lucide React |
| 数据持久化 | 浏览器 `localStorage` |
| 预留云端方案 | Supabase Auth + Postgres |
| 校验 | TypeScript + 领域规则校验 |
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

### 环境变量

如需提前准备后续直连 Supabase，可复制 `.env.example` 为 `.env`：

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

当前代码仍可在没有这些变量的情况下本地运行；它们主要用于后续切换到
Supabase 直连时复用。

### 初始化 Supabase Storage

远程环境完成数据库 SQL 部署后，在 CI、部署服务器或管理员本机配置
server-only 的 `SUPABASE_SECRET_KEY`，然后运行：

```powershell
npm run supabase:bootstrap-storage
```

命令使用 `SUPABASE_URL`，未配置时兼容读取 `VITE_SUPABASE_URL`；密钥也兼容旧的
`SUPABASE_SERVICE_ROLE_KEY` 名称。脚本会幂等创建 `catalog-assets` 与
`project-assets`，并将误设为公开的桶恢复为私有。任何检查或修改失败都会返回非零退出码。

`SUPABASE_SECRET_KEY` 只能存在于服务端环境，不得添加 `VITE_` 前缀。该命令只管理
Storage bucket，不会安装 RLS 策略；仍需按
`supabase/sql/README.md` 的顺序执行 SQL。前端仅调用只读状态函数，发现缺桶或公开桶时显示提示。

## 数据模型 (schemaVersion 3)

系统收敛为三类业务对象：

1. **连接器** (`ConnectorInstance`) — 含 PIN 定义和短接 (`jumpers`)
2. **线材** (`CanvasWireMaterial`) — 含接线明细 (`circuits: MaterialCircuit[]`)
3. **保护套** (`ProtectiveSleeve`) — 含波纹管材质及 `attachedMaterialIds` 覆盖线材集合

PIN、颜色、SIG 直接归属于线材的接线明细 (`MaterialCircuit`)，不再通过独立的 Wire / Connection 对象间接表达。

### 核心类型

- `HarnessConfig` — 顶层配置（schemaVersion 3）
- `ConnectorInstance` — 连接器实例（含 `jumpers: ConnectorJumper[]`）
- `CanvasWireMaterial` — 线材（含 `circuits: MaterialCircuit[]`）
- `WireLabel` / `WireNumberTube` — 线材标签和号码管
- `MaterialCircuit` — 接线明细（start/end 可选、color、signalName、coreIndex）
- `ConnectorPinRef` — 连接器 PIN 引用（connectorId + side + pin）
- `ConnectorJumper` — 同侧 PIN 短接（pins 数组）

### 交互规则

- 线材支持单端连接，颜色和 SIG 立即显示
- 同一线材端点可连接同一连接器同侧多个 PIN（创建多条接线明细）
- 连接器首次连接后锁定有效侧，另一侧 Handle 隐藏
- 同侧 PIN 可短接，短接网络可继续扩展
- 两端触碰后保持原线材，不创建新线材
- 护套线支持依次点击线材端点和连接器 PIN 建立连接，连接边使用实线
- PIN 信息输入只接受 `Pin+数字`（不区分大小写）或空白；空白表示断开该端点
- 多条电子线连接到同一连接器时组成信息展示组，组内最下方线材显示合并信息表
- 保护套通过 `attachedMaterialIds` 明确选择覆盖线材，可选择四条中的任意两条

## 前端当前数据存储

所有数据存储在浏览器的 `localStorage` 中：
- 项目列表：`harness-projects`
- 项目配置：`harness-project-config-{projectId}`
- 自动恢复点：`harness-project-snapshot-{projectId}-{timestamp}`（每 5 分钟最多 1 个，保留最近 3 个）
- 损坏数据恢复副本：`harness-project-recovery-{projectId}-{timestamp}`
- 用户信息：`harness-users`（演示模式）

编辑器内存状态不再额外写入无项目归属的 `harness-config`，避免草稿与项目副本互相覆盖。
项目配置统一通过异步 `ProjectRepository` 接口读写；本地实现仍使用 `localStorage`。
加载和导入时会深层校验 `HarnessConfig` 及其连接器、线材、接线、保护套和外模。
结构损坏时自动保存原始副本、暂停自动保存，并提供下载恢复入口。
项目卡可将最新自动恢复点另存为新项目，不覆盖当前项目。

## 架构说明

### 状态管理

- `useHarnessStore` — 编辑器状态（配置、选择、保存状态）
- `useProjectStore` — 项目元数据；项目文档通过异步 `ProjectRepository` 持久化
- `useUserStore` — 用户认证（本地演示模式）
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

## 当前轻量架构结论

- 当前阶段不默认引入 `NestJS`；
- 先保持前端单体和本地持久化，继续快速迭代产品交互；
- 当你准备把项目上云时，优先采用 `Supabase Auth + Supabase Postgres` 直连；
- 只有在出现复杂权限、复杂事务或多系统集成时，再补业务后端层。

相关决策和演进步骤见
`FRONTEND_REVIEW_AND_BACKEND_IMPLEMENTATION_PLAN.md` 第 20 节。

当前风险审计、前端 MVP 范围和后端接入时机见
`CURRENT_SYSTEM_RISK_AND_FRONTEND_MVP_PLAN.md`。

当前保存流程、乐观锁、Realtime 取舍与冲突处理见
`SAVE_CONCURRENCY_AND_REALTIME_STRATEGY.md`。

## 后续生产化方向

- 前端替换为 Supabase Auth session
- 项目存储从 `localStorage` 切到 Supabase 表
- 将现有异步 `ProjectRepository` 的本地实现替换为 Supabase 实现
- 连接器/端子/密封件完整目录
- 真实报价规则和订单系统
- 多人协作和版本管理
- 3D 真实预览（当前为等距 SVG 投影）
- 代码分割和懒加载优化
- 撤销/重做 UI 暴露
