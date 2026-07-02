# 当前前端修改复核与后端分阶段实施方案

> 文档日期：2026-07-02  
> 项目：`wire-harness-designer`  
> 目标：在不考虑历史数据和旧项目迁移的前提下，复核当前前端改动，并规划适合单人开发、少量并发、优先快速可用的 NestJS + Supabase 方案。

---

## 1. 已确认的范围和前提

本方案基于以下明确前提：

1. 不迁移旧 schema；
2. 不保留以前在本系统创建的项目；
3. 只保证此次改造之后新建的项目能够正确创建、保存和再次打开；
4. 第一阶段由单人开发；
5. 初期同时在线用户预计最多几人；
6. 第一阶段目标是“能够稳定使用”，不是提前解决高并发；
7. 暂不实现多人实时协作、微服务、消息队列、分布式缓存；
8. 当前线束文档继续使用 `schemaVersion: 3`；
9. 连接器、线材、保护套是唯一三类画布业务对象；
10. PIN、颜色和 SIG 直接归属于线材的接线明细。
11. 使用 Supabase 托管 PostgreSQL，不自行维护生产数据库；
12. NestJS 仍然是项目和线束文档的唯一业务 API；
13. 前端不直接通过 Supabase Data API 读写项目表。

因此，旧数据迁移、旧项目备份和 v1/v2 到 v3 的字段转换不再是阻塞项。对于非 v3 数据，直接清空并返回新的 v3 空项目即可。

---

## 2. 当前仓库状态

### 2.1 Git 状态

当前暂存区为空，所有新修改均位于未暂存修改区。

当前主要修改包括：

- 前端缺陷修复；
- Vitest 测试接入；
- v3 配置规范化；
- README 更新；
- BOM 分组修复；
- 设计校验面板；
- 全 PIN 画布显示；
- SIG placeholder 修正；
- package-lock 更新。

未跟踪文件包括：

- `src/lib/__tests__/`
- `src/lib/migration.ts`
- `.claude/settings.local.json`

提交前建议：

- 应提交 `src/lib/__tests__/` 和 `src/lib/migration.ts`；
- 不提交 `.claude/settings.local.json`；
- `.workbuddy/memory/*` 是否入库需要按团队约定决定；如果只是本地代理记忆，建议不提交；
- 在一次最终复核后统一暂存产品代码、测试、README、`package.json` 和 `package-lock.json`。

### 2.2 当前验证结果

2026-07-02 实际执行结果：

| 命令 | 结果 |
|---|---|
| `npm.cmd test` | 通过，2 个测试文件、18 个测试 |
| `npm.cmd run lint` | 通过 |
| `npm.cmd run build` | 通过 |
| 构建警告 | 主 JS 约 504.75 kB，超过 500 kB 提示线 |

当前自动化测试覆盖：

- 单端连接；
- 两端补齐；
- 重复绑定拒绝；
- 连接器有效侧锁定；
- 同侧多 PIN；
- 短接建立与网络合并；
- 连接器换型后的越界 PIN；
- 端点解绑；
- 非 v3 配置回退；
- v3 顶层字段规范化。

---

## 3. 当前前端是否符合需求

### 3.1 已符合的部分

| 需求 | 当前状态 | 说明 |
|---|---|---|
| 只保留连接器、线材、保护套 | 已完成 | 独立 `Wire/Connection/WireBundle` 已移除 |
| 单端连接可保存 | 已完成 | `MaterialCircuit.start/end` 均为可选 |
| 单端显示 PIN、颜色、SIG | 已完成 | 信息窗直接读取 `circuits` |
| 未连接侧留空 | 已完成 | 不再显示虚假 PIN |
| 同一线材同侧连接多个 PIN | 已完成 | 每个连接点可形成独立 `MaterialCircuit` |
| 两端连接保持原线材 | 基本完成 | 连接过程不创建新线材 |
| 连接器单侧锁定 | 已完成 | 另一侧 Handle 不渲染 |
| 同侧 PIN 短接 | 已完成 | 使用 `ConnectorJumper` |
| 短接网络继续扩展 | 已修复 | 交叉短接网络会合并 |
| 护套线 UL 可无 | 已完成 | 当前选项为 UL2464、UL20276、无 |
| 波纹管显示材质 | 已完成 | 画布、BOM、报价使用统一名称函数 |
| Pin7 以后可操作 | 已修复 | 连接器现在渲染全部 PIN |
| BOM 不错误合并不同护套线 | 已修复 | 分组键包含全部关键规格 |
| 设计校验可见 | 已完成 | `ConfigPanel` 实时显示校验问题 |
| README 使用新模型 | 已完成 | 已删除旧 Wire/Connection 说明 |

### 3.2 仍需修改的高优先级问题

#### P0：重连接口仍然可能丢失原端点和接线属性

位置：

- `src/components/canvas/HarnessCanvas.tsx`
- `onReconnect`

当前流程是：

1. 先调用 `detachMaterialEndpoint` 删除旧端点；
2. 再调用 `attachMaterialEndpoint` 连接新端点；
3. 如果第二步失败，保留“已经断开”的结果；
4. 代码注释明确接受这一有损结果。

风险：

- 用户只是拖错位置，旧连接就丢失；
- 对仅连接一端的 circuit，第一步会直接删除整个 circuit；
- 第二步重新创建 circuit 时会生成新 ID；
- 原 circuit 的颜色、SIG、`coreIndex` 可能丢失；
- 该操作不是原子操作，不符合领域命令约束。

必须新增原子命令：

```ts
reassignMaterialEndpoint(config, {
  materialId,
  circuitId,
  endpoint,
  connectorId,
  connectorSide,
  pin,
})
```

命令规则：

1. 先验证新连接器存在；
2. 验证 PIN 范围；
3. 验证连接器有效侧；
4. 验证完全重复；
5. 所有校验通过后一次性替换端点；
6. 保持 circuit ID、颜色、SIG、`coreIndex` 不变；
7. 任一校验失败时返回原配置，不得先删除旧端点。

这是当前前端提交前唯一明确的阻塞级业务缺陷。

#### P1：自定义 localStorage 防抖存储属于过早优化

位置：

- `src/stores/harnessStore.ts`
- `createSafeStorage`

当前实现对 Zustand persist 写入增加 300ms 防抖，但：

- 页面在 300ms 内关闭时，最后一次草稿写入可能丢失；
- 没有公开 `flush()`；
- 没有在 `pagehide/beforeunload` 调用 flush；
- 项目配置本身已经由 `projectStore` 和 `App` 的自动保存负责；
- 同时保留 `harness-config` 和 `harness-project-config-*` 会形成两个文档真相源；
- 少量用户场景不需要为 localStorage 写入做性能优化。

推荐的简单方案：

1. `harnessStore` 只管理当前编辑器内存状态，不 persist 整份 config；
2. 项目配置统一由 `ProjectRepository` 保存；
3. 当前纯前端阶段由 `LocalProjectRepository` 使用 `harness-project-config-*`；
4. 后端接入后替换为 `ApiProjectRepository`；
5. 如果需要本地崩溃恢复，只保留一个明确命名的 recovery draft，并实现同步 flush。

第一阶段优先单一数据源，不做防抖存储层。

#### P1：配置“迁移”命名和注释不准确

`src/lib/migration.ts` 实际没有迁移旧数据，只做：

- v3 顶层规范化；
- 非 v3 回退为空项目。

但部分注释仍写有“backs up the original”或“migration”，实际并没有备份。

在“无需历史数据”的前提下，推荐：

- 文件改名为 `documentSchema.ts` 或 `normalizeHarnessConfig.ts`；
- 函数改名为 `normalizeHarnessConfig`；
- 明确说明非 v3 数据直接丢弃；
- 删除“备份旧配置”的错误注释；
- 保留当前非 v3 回退测试。

#### P1：测试仍缺少关键交互路径

虽然已有 18 个领域测试，但还应补充：

1. `reassignMaterialEndpoint` 成功后保留 circuit ID、颜色、SIG；
2. `reassignMaterialEndpoint` 失败时原端点不变；
3. 两个线材端点在一次拖动停止中同时吸附，两个端点都保留；
4. BOM 对外被颜色、屏蔽、OD、UL、端部处理分别分组；
5. `validateHarness` 检测 circuit/jumper 重复 ID；
6. 新建项目保存后重新载入仍是同一 v3 文档；
7. 至少一个 React Testing Library 组件测试验证单端信息窗口方向；
8. 后续增加一个 Playwright 主流程测试。

### 3.3 可延后优化

以下问题不阻塞第一阶段：

- React Flow 节点的 `memo` 优化效果有限，因为节点仍订阅整份 config；
- `validateHarness` 在每次 config 更新时全量执行；
- 16P 连接器节点较高；
- 主 JS 超过 500 kB；
- 没有真正的 3D；
- 没有多人实时协作；
- 没有 Redis；
- 没有队列系统；
- 没有复杂审计日志。

当项目文档规模和用户数量实际增大后再基于性能数据优化。

---

## 4. 当前是否只有前端

是。

当前仓库只有：

- React 19；
- Vite；
- Zustand；
- `@xyflow/react`；
- 浏览器 localStorage；
- 前端 BOM、报价和预览逻辑；
- Vitest 领域测试。

当前不存在：

- HTTP API；
- NestJS 服务；
- 数据库；
- Prisma；
- 服务端认证；
- 服务端文件存储；
- 服务端权限校验；
- Redis；
- WebSocket 服务；
- 服务端日志和健康检查。

当前 `AuthModal`、`userStore` 和密码存储仍属于本地演示实现，不能作为正式认证。

---

## 5. 推荐技术栈结论：改用 Supabase

### 5.1 第一阶段采用

| 层级 | 推荐方案 | 决策 |
|---|---|---|
| 前端 | React 19 + Vite + Zustand + `@xyflow/react` | 保留 |
| 后端 | NestJS + TypeScript | 采用 |
| HTTP 平台 | NestJS 默认 Express Adapter | 第一阶段采用 |
| 数据库平台 | Supabase 托管 PostgreSQL | 采用 |
| ORM | Prisma ORM + Prisma Migrate | 采用 |
| 文档存储 | Supabase PostgreSQL JSONB | 采用 |
| 认证 | Supabase Auth 签发 JWT，NestJS Guard/Passport 验证 | 推荐采用 |
| API 文档 | Swagger / OpenAPI | 采用 |
| 请求校验 | Nest `ValidationPipe` + 共享 Harness Zod schema | 采用 |
| 文件存储 | Supabase Storage | 推荐采用 |
| 后端部署 | 单 NestJS 实例或容器 | 采用 |
| 缓存 | 无 Redis | 第一阶段不采用 |
| 实时通信 | 无 WebSocket | 第一阶段不采用 |
| 消息队列 | 无 | 第一阶段不采用 |

### 5.2 是否建议 Supabase

建议。

Supabase 并不是另一种数据库，它提供托管 PostgreSQL，并附带 Auth、Storage、连接池和管理界面。当前应用本来就计划使用 PostgreSQL + JSONB，因此切换到 Supabase 不需要改变线束文档模型，也不影响 Prisma。

它特别适合当前阶段：

- 单人开发，不需要维护 PostgreSQL 服务；
- 同时用户很少，不需要复杂基础设施；
- 可以快速获得托管数据库、认证和文件存储；
- Prisma 仍负责业务表和 migration；
- NestJS 仍承载项目权限、领域校验、乐观锁和 API；
- 后续仍可使用标准 PostgreSQL 工具导出和迁移数据。

需要接受的代价：

- 增加对 Supabase Auth/Storage API 的依赖；
- 数据库连接方式需要区分 direct、session pooler 和 transaction pooler；
- 免费或低配项目的资源、休眠、备份和网络能力以实际套餐为准；
- 如果未来离开 Supabase，Auth 和 Storage 比纯 PostgreSQL 更需要迁移工作。

综合当前“快速开发、先能用、少量用户”的目标，收益大于代价。

### 5.3 为什么第一阶段使用 Express 而不是 Fastify

NestJS 默认使用 Express。对当前“同时几名用户”的规模，Express 性能足够，并且：

- Nest 内置文件上传方案基于 Multer；
- Nest 官方文档明确说明该 Multer 上传模块不兼容 Fastify Adapter；
- 第一阶段需要连接器图片或文件上传时，Express 实现最直接；
- 少一个适配层和第三方插件差异，更适合单人快速开发。

如果以后 API QPS 明显升高，再评估 Fastify。当前不应为了尚不存在的性能问题增加开发成本。

### 5.4 Supabase 与 PostgreSQL 16 的关系

使用 Supabase 后，不再自行部署或锁定本地 PostgreSQL 16 镜像，而使用 Supabase 项目提供的 PostgreSQL 版本和升级策略。

业务设计不依赖 PostgreSQL 16 的独占特性，只依赖：

- UUID；
- JSONB；
- 普通索引和唯一约束；
- 事务；
- 行级锁或乐观锁更新。

如果必须自托管，PostgreSQL 16 仍受官方支持到 2028-11-09；但采用 Supabase 时，应跟随平台支持的稳定 PostgreSQL 版本，不在应用中硬编码大版本假设。

### 5.5 为什么使用 JSONB

线束文档具有以下特点：

- 连接器、线材、接线明细和短接形成嵌套结构；
- 前端需要一次性加载完整画布文档；
- 文档内部结构会持续迭代；
- 初期不需要跨项目按每个 PIN 做复杂 SQL 统计；
- Prisma 的 `Json` 字段在 PostgreSQL 中映射为 JSONB。

因此第一阶段推荐混合模型：

- 用户、项目、权限、版本号、文件元数据使用关系字段；
- 完整线束设计使用单个 JSONB 字段；
- 连接器公共目录使用关系表；
- 不把每个 circuit、PIN、jumper 拆成数据库表。

这样既保留事务、权限和查询能力，又不把画布领域模型过度关系化。

### 5.6 Supabase 的使用边界

推荐架构：

```text
React
  ├─ Supabase Auth：注册、登录、刷新 Token
  ├─ Supabase Storage：图片上传，可按需启用
  └─ NestJS API：项目、线束文档、连接器目录、权限和业务校验
                         │
                         ├─ Prisma
                         └─ Supabase PostgreSQL
```

关键规则：

1. 前端可以直接调用 Supabase Auth；
2. 前端不得直接读写 `projects`、`project_revisions` 等业务表；
3. 项目数据统一通过 NestJS；
4. NestJS 验证 Supabase access token；
5. NestJS 从 token 的 `sub` 获取用户 ID；
6. Supabase `service_role`、Prisma 数据库密码只存在于服务端；
7. 绝不把 service role key 放进 Vite 环境变量；
8. 如果只使用 Prisma 访问业务表，可关闭不需要的 Supabase Data API，或为业务表启用默认拒绝的 RLS；
9. Swagger 使用 Bearer Auth 描述 Supabase JWT。

### 5.7 数据库连接方式

NestJS 是长生命周期服务，推荐顺序：

1. 部署环境支持 IPv6：使用 direct connection；
2. 部署环境只有 IPv4：使用 Supavisor session mode，端口 5432；
3. 只有把 API 部署成 serverless/edge 时，才使用 transaction mode，端口 6543。

不要在长期运行的 NestJS 容器中默认使用 transaction mode。Supabase 官方说明 transaction mode 更适合短生命周期的 serverless/edge 请求，并且不支持 prepared statements。

Prisma 环境变量建议区分：

```dotenv
# NestJS 运行时。IPv4 环境使用 Supavisor session mode :5432
DATABASE_URL=postgresql://prisma.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:5432/postgres

# migration、pg_dump 和管理命令优先使用 direct connection
DIRECT_URL=postgresql://prisma:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

如果开发或部署网络不能访问 Supabase direct IPv6 地址：

- 运行时使用 session pooler；
- migration 按 Supabase/Prisma 当前官方指引配置；
- 不要为了连通性把数据库开放到公网任意来源；
- 可使用 Supabase Network Restrictions 限制来源。

建议为 Prisma 创建独立数据库角色，不要让应用直接使用最高权限的默认 postgres 账号。

### 5.8 为什么第一阶段不需要 Redis

当前场景：

- 单 NestJS 实例；
- 同时在线几人；
- JWT 验证不需要服务端 Session；
- 连接器目录规模小；
- PostgreSQL 查询压力很低；
- 没有任务队列和 WebSocket 横向扩展。

因此 Redis 暂时不会带来可感知收益，反而增加：

- 一个需要部署和备份的服务；
- 缓存失效逻辑；
- 本地开发配置；
- 故障排查面；
- 额外依赖和资源占用。

Redis 的引入条件应是出现以下真实需求之一：

- 多实例部署后的共享限流或共享 Session；
- 连接器目录查询成为热点；
- 异步导出/报价任务需要队列；
- WebSocket 多实例广播；
- 明确的数据库性能瓶颈。

---

## 6. 推荐仓库结构

第一阶段不必立即搬动当前前端目录。建议保留现有 Vite 根目录，并新增：

```text
wire-harness-designer/
├─ src/                         # 当前 React 前端
├─ public/
├─ apps/
│  └─ api/                     # NestJS 后端
│     ├─ src/
│     ├─ test/
│     ├─ prisma/
│     │  ├─ schema.prisma
│     │  └─ migrations/
│     └─ package.json
├─ packages/
│  └─ harness-schema/          # 前后端共享文档 schema
│     ├─ src/
│     │  ├─ harness.schema.ts
│     │  └─ index.ts
│     └─ package.json
├─ package.json
└─ README.md
```

根 `package.json` 使用 npm workspaces：

```json
{
  "workspaces": [
    "apps/api",
    "packages/*"
  ]
}
```

暂不把当前前端移动到 `apps/web`，避免第一阶段产生大量无业务价值的路径改动。后续需要完整 monorepo 规范时再移动。

生产环境数据库由 Supabase 托管，因此不需要在本仓库的 Docker Compose 中运行 PostgreSQL。若希望完全本地开发，可后续使用 Supabase CLI 启动本地栈；单人第一阶段也可以直接创建彼此隔离的 Supabase development 和 production 项目。

---

## 7. 后端模块设计

```text
AppModule
├─ ConfigModule
├─ PrismaModule
├─ HealthModule
├─ AuthModule（验证 Supabase JWT）
├─ ProfilesModule
├─ ProjectsModule
├─ ConnectorCatalogModule
├─ AssetsModule
└─ ExportModule（后续）
```

### 7.1 AuthModule

职责：

- 验证 Supabase JWT；
- 从 JWT `sub` 读取用户 UUID；
- 提供 NestJS Guard/Passport Strategy；
- 向 Swagger 注册 Bearer Auth；
- 提供 `/auth/me` 或 `/profiles/me`；
- 不签发自己的 access/refresh token；
- 不保存密码；
- 不维护第二套 refresh token 表。

推荐：

- React 使用 Supabase SDK 注册、登录、退出和刷新；
- Supabase Auth 负责签发和刷新 JWT；
- React 调用 NestJS 时携带 Supabase access token；
- NestJS 通过 Supabase JWKS/issuer/audience 验证 token；
- NestJS 不信任客户端提交的 userId；
- 所有 ownerId 均来自已验证 token 的 `sub`；
- 若继续使用 Passport，实现 `SupabaseJwtStrategy`，不要再实现本地密码策略。

如果产品明确要求完全脱离 Supabase Auth，也可以退回“NestJS 自建 JWT + Passport + Argon2id + RefreshToken 表”，但开发量和安全责任都会增加，不符合当前快速交付优先级。

### 7.2 ProjectsModule

职责：

- 创建项目；
- 项目列表；
- 项目详情；
- 保存整个 HarnessDocument；
- 删除或归档项目；
- 乐观锁版本控制；
- 所有操作校验 `ownerId`。

第一阶段不做字段级局部更新，直接保存完整 JSONB 文档。文档尺寸在当前产品阶段很小，完整 PUT 更简单可靠。

### 7.3 ConnectorCatalogModule

职责：

- 连接器目录列表；
- 搜索与筛选；
- 单个连接器详情；
- 管理员维护目录（可延后）。

第一阶段：

- 把当前 `src/lib/data.ts` 连接器数据做成 Prisma seed；
- API 从 Supabase PostgreSQL 返回；
- 不使用 Redis；
- 前端可以在一次请求后内存缓存。

### 7.4 AssetsModule

职责：

- 连接器图片上传；
- MIME 和大小校验；
- 保存文件元数据；
- 返回受控访问 URL；
- 删除未引用文件。

使用 Supabase Storage，并在 NestJS 保留统一接口：

```ts
interface StorageService {
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}
```

实现：

1. `SupabaseStorageService`：第一阶段；
2. `LocalStorageService`：仅用于离线开发或测试；
3. 后续如果离开 Supabase，可替换为 `S3StorageService`。

数据库只保存 bucket、storage path、文件元数据，不把图片二进制存入 PostgreSQL。

上传可以有两种方式：

- 简单方案：前端使用登录用户 token 直接上传到受 RLS 保护的 bucket；
- 中央控制方案：NestJS 生成短期 signed upload URL。

不允许前端持有 service role key。

### 7.5 HealthModule

接口：

- `GET /api/health/live`
- `GET /api/health/ready`

ready 检查 Supabase PostgreSQL 连接；Storage 检查可以作为非阻塞依赖，不应因为图片服务短暂异常阻止项目文档读写。

---

## 8. 推荐 Prisma 数据模型

```prisma
enum ProjectStatus {
  DRAFT
  ARCHIVED
}

model Profile {
  // 与 Supabase auth.users.id 使用相同 UUID。
  // 不让 Prisma 管理 auth schema；Profile 由注册触发器或首次登录时创建。
  id          String    @id @db.Uuid
  email       String?
  displayName String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  projects    Project[]
  assets      Asset[]
}

model Project {
  id                    String        @id @default(uuid()) @db.Uuid
  ownerId               String        @db.Uuid
  name                  String
  description           String        @default("")
  status                ProjectStatus @default(DRAFT)
  document              Json          @db.JsonB
  documentSchemaVersion Int           @default(3)
  revision              Int           @default(1)
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt
  owner                 Profile       @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  revisions             ProjectRevision[]
  assets                Asset[]

  @@index([ownerId, updatedAt])
  @@index([ownerId, status])
}

model ProjectRevision {
  id                    String   @id @default(uuid()) @db.Uuid
  projectId             String   @db.Uuid
  revision              Int
  document              Json     @db.JsonB
  documentSchemaVersion Int
  createdAt             DateTime @default(now())
  project               Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, revision])
  @@index([projectId, createdAt])
}

model ConnectorPart {
  id           String   @id
  name         String
  manufacturer String
  pinCount     Int
  pitch        Float?
  type         String
  pinLabels    Json     @db.JsonB
  metadata     Json?    @db.JsonB
  imageAssetId String?  @db.Uuid
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([manufacturer])
  @@index([pinCount])
  @@index([active])
}

model Asset {
  id           String   @id @default(uuid()) @db.Uuid
  ownerId      String   @db.Uuid
  projectId    String?  @db.Uuid
  bucket       String
  storagePath  String
  originalName String
  mimeType     String
  sizeBytes    Int
  createdAt    DateTime @default(now())
  owner        Profile  @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  project      Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([bucket, storagePath])
  @@index([ownerId])
  @@index([projectId])
}
```

第一阶段可以不创建 `ProjectRevision`，但建议预留模型。最简单的做法是：

- 正常自动保存只更新 `Project.document`；
- 用户执行“生成版本”或导出前创建 revision；
- 后续再增加定时快照和保留策略。

Supabase Auth 的用户位于平台维护的 `auth.users` 中，不要使用 Prisma migration 修改该表。推荐通过 Supabase SQL migration 创建触发器，在新用户注册时向 `public.Profile` 插入相同 UUID；也可以由 NestJS 在用户首次访问 `/auth/me` 时幂等创建 Profile。

---

## 9. JSONB 文档校验

不能仅依赖 TypeScript interface，因为网络请求中的 JSON 在运行时没有类型保证。

推荐新增共享包：

```text
packages/harness-schema
```

使用 Zod 定义：

- `ConnectorPinRefSchema`
- `MaterialCircuitSchema`
- `CanvasWireSpecSchema`
- `CanvasWireMaterialSchema`
- `ConnectorInstanceSchema`
- `ProtectiveSleeveSchema`
- `HarnessConfigSchema`

前端用途：

- 新建项目校验；
- API 响应解析；
- 导入 JSON 校验；
- 本地恢复校验。

后端用途：

- 保存项目文档前校验；
- 拒绝非法 PIN 结构和未知字段；
- 确认 `schemaVersion === 3`；
- 写入 JSONB 前执行领域 `validateHarness`。

Nest 的 `ValidationPipe` 继续用于普通 DTO，例如登录、创建项目和分页参数。完整 HarnessDocument 使用共享 Zod schema，避免前后端各维护一套庞大的 DTO。

---

## 10. API 设计

统一前缀：

```text
/api/v1
```

### 10.1 认证

注册、登录、退出、密码重置和 token 刷新由 Supabase Auth API/SDK 完成，NestJS 不重复提供这些端点。

NestJS 只提供：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/auth/me` | 验证 Supabase JWT 并返回应用 Profile |
| PATCH | `/profiles/me` | 修改应用显示名称等资料 |

所有受保护 API 使用：

```http
Authorization: Bearer <supabase-access-token>
```

NestJS 应校验 token 的签名、过期时间、issuer 和 audience，不能只解码 payload。

### 10.2 项目

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/projects` | 当前用户项目列表 |
| POST | `/projects` | 创建项目 |
| GET | `/projects/:id` | 项目元数据与文档 |
| PATCH | `/projects/:id` | 修改名称、描述、状态 |
| PUT | `/projects/:id/document` | 保存完整线束 JSONB |
| POST | `/projects/:id/revisions` | 创建显式版本，可后续实现 |
| DELETE | `/projects/:id` | 第一阶段建议归档，后续再物理删除 |

保存请求：

```json
{
  "revision": 7,
  "documentSchemaVersion": 3,
  "document": {}
}
```

保存响应：

```json
{
  "revision": 8,
  "updatedAt": "2026-07-02T00:00:00.000Z"
}
```

### 10.3 乐观锁

更新条件必须同时匹配：

- `project.id`
- `project.ownerId`
- 客户端提交的 `revision`

成功后：

- `revision + 1`
- 返回新 revision。

匹配不到时返回：

```text
409 Conflict
```

第一阶段不需要 WebSocket。乐观锁足以防止用户在两个浏览器标签页中互相覆盖。

### 10.4 连接器目录

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/connectors` | 搜索、分页、筛选 |
| GET | `/connectors/:id` | 详情 |
| POST | `/connectors` | 管理员新增，后续 |
| PATCH | `/connectors/:id` | 管理员修改，后续 |

查询参数：

```text
q
manufacturer
pinCount
type
page
pageSize
```

### 10.5 文件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/assets` | 上传连接器图片 |
| GET | `/assets/:id` | 读取文件 |
| DELETE | `/assets/:id` | 删除未引用文件 |

限制：

- 图片最大 5MB；
- 只允许明确 MIME；
- 服务端生成 storage key；
- 不直接使用客户端文件名作为路径；
- 禁止目录穿越；
- 上传接口必须鉴权。

---

## 11. 前端接入方式

### 11.1 保留 Zustand 的职责

Zustand 继续负责：

- 当前打开的文档；
- 画布选择状态；
- 保存状态；
- 撤销/重做；
- 编辑过程中的本地即时反馈。

Zustand 不负责：

- 用户数据库；
- 项目最终持久化；
- 权限；
- Refresh Token；
- 服务端项目列表。

### 11.2 Repository 抽象

```ts
interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  create(input: CreateProjectInput): Promise<ProjectRecord>;
  load(projectId: string): Promise<ProjectRecord>;
  saveDocument(
    projectId: string,
    revision: number,
    document: HarnessConfig,
  ): Promise<{ revision: number; updatedAt: string }>;
  archive(projectId: string): Promise<void>;
}
```

实现：

- `LocalProjectRepository`：当前纯前端阶段；
- `ApiProjectRepository`：后端接入后；
- 组件不直接调用 localStorage 或 fetch。

### 11.3 API 客户端

建议使用原生 `fetch` 封装即可，第一阶段不必引入 Axios。

统一处理：

- API base URL；
- access token；
- 401 时刷新一次；
- AbortController；
- 错误结构；
- JSON schema 解析；
- 409 冲突提示；
- 网络离线状态。

### 11.4 自动保存

推荐流程：

1. Zustand 文档变为 dirty；
2. 1.5 到 2 秒 debounce；
3. 调用 `PUT /projects/:id/document`；
4. 携带当前 revision；
5. 成功后更新 revision 和 saved 状态；
6. 409 时提示用户重新载入或另存为；
7. 网络失败保留 dirty，不伪装成已保存；
8. 返回项目列表前执行 flush。

---

## 12. 第一阶段实施顺序

### Phase 0：前端提交前收尾

预计 1 到 2 天。

1. 实现 `reassignMaterialEndpoint` 原子命令；
2. 替换有损 `onReconnect`；
3. 补充重连、BOM、validation 测试；
4. 简化 `harnessStore` 的持久化；
5. 明确唯一项目真相源；
6. 将 migration 命名改为 normalize；
7. 清理错误注释；
8. 不提交 `.claude/settings.local.json`；
9. 执行 test、lint、build；
10. 手工完成核心画布验收。

### Phase 1：后端骨架

预计 1 到 2 天。

1. 创建 `apps/api` NestJS 项目；
2. 使用默认 Express Adapter；
3. 增加 ConfigModule；
4. 增加全局 `/api/v1` 前缀；
5. 增加全局 ValidationPipe：

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

6. 接入 Swagger；
7. 创建 Supabase development 项目；
8. 为 Prisma 创建独立数据库角色；
9. 配置 direct 或 Supavisor session 连接；
10. 接入 Prisma；
11. 创建第一条 migration；
12. 增加 health API；
13. 增加统一错误返回和请求日志。

### Phase 2：认证

预计 1 天。

1. 开启 Supabase Auth 邮箱/密码登录；
2. React 接入 Supabase Auth SDK；
3. 创建 public Profile 表；
4. 创建 auth user 到 Profile 的触发器，或实现首次访问幂等创建；
5. NestJS 实现 Supabase JWT Guard/Passport Strategy；
6. 校验 issuer、audience、签名和过期时间；
7. 实现 `/auth/me`；
8. 替换前端明文用户 Store；
9. 增加未登录、过期 token、伪造 token 测试；
10. 确保 service role key 不进入前端构建。

### Phase 3：项目 API

预计 2 到 3 天。

1. Project 表；
2. JSONB document；
3. `documentSchemaVersion`；
4. revision 乐观锁；
5. 项目 CRUD；
6. owner 权限过滤；
7. 共享 Harness schema 校验；
8. 保存失败和 409 错误；
9. API 集成测试；
10. Swagger 补全。

### Phase 4：前端切换到 API

预计 2 到 4 天。

1. 提取 `ProjectRepository`；
2. 实现 `ApiProjectRepository`；
3. 项目列表改读 API；
4. 新建项目写入 API；
5. 打开项目读取 JSONB；
6. 自动保存写入 API；
7. 接入 revision；
8. 显示离线/保存失败/冲突；
9. localStorage 仅保留恢复草稿；
10. 完成端到端验收。

### Phase 5：连接器目录和文件

预计 2 到 3 天，可按业务需要延后。

1. ConnectorPart 表；
2. seed 当前目录；
3. 列表、搜索、筛选 API；
4. Supabase Storage bucket 和访问策略；
5. `SupabaseStorageService`；
6. 图片上传或 signed upload URL；
7. 前端连接器选择器改读 API；
8. 不使用 Redis。

### Phase 6：部署

预计 1 到 2 天。

推荐：

```text
Supabase Cloud
  ├─ PostgreSQL
  ├─ Auth
  └─ Storage

应用部署
  ├─ web 静态站点
  └─ NestJS API 单实例
```

Web 和 API 可以部署在同一 VPS，也可以分别部署到静态托管和容器平台。NestJS 使用 direct connection 或 Supavisor session mode 连接 Supabase。

第一阶段不部署 Redis。

---

## 13. 开发环境

建议：

- 前端：本机 `npm run dev`
- API：本机 `npm run start:dev`
- 数据库：Supabase development 项目；
- 认证：Supabase Auth；
- 文件：Supabase Storage；
- 可选：以后用 Supabase CLI 提供完全本地的开发环境。

环境变量：

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://prisma.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:5432/postgres
DIRECT_URL=postgresql://prisma:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_JWT_ISSUER=https://PROJECT_REF.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_SERVICE_ROLE_KEY=server-only-secret
CORS_ORIGIN=http://localhost:5173
STORAGE_DRIVER=supabase
SUPABASE_STORAGE_BUCKET=connector-assets
SWAGGER_ENABLED=true

# 只有下面两个值可以进入 Vite 前端；service role 和数据库 URL 绝不能进入前端
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=publishable-anon-key
```

要求：

- `.env` 不提交；
- 提交 `.env.example`；
- development 和 production 使用不同 Supabase 项目；
- `SUPABASE_SERVICE_ROLE_KEY` 只允许服务端读取；
- 数据库密码和 direct URL 只允许服务端/CI 读取；
- 不在前端使用 Prisma；
- 不从浏览器直连 PostgreSQL；
- 根据部署网络选择 direct 或 session pooler；
- Swagger 生产环境默认关闭或限制访问。

---

## 14. 测试策略

### 前端

- Vitest：领域命令、BOM、validation、schema；
- React Testing Library：信息窗口、连接器侧锁定、错误状态；
- Playwright：注册、登录、新建项目、接线、保存、重新打开。

### 后端

- 单元测试：Supabase JWT Guard、ProjectsService、document validation；
- 集成测试：Prisma + Supabase development/test 项目，或 Supabase CLI 本地栈；
- E2E：Supertest 调用 Nest API；
- 权限测试：用户 A 不能读取用户 B 项目；
- 冲突测试：旧 revision 保存返回 409；
- 文件测试：MIME、大小、未授权、非法 storage path；
- 密钥测试：前端构建产物不得包含 service role key。

### CI 必须执行

```bash
npm run lint
npm run test
npm run build
npm --workspace apps/api run test
npm --workspace apps/api run test:e2e
npm --workspace apps/api run build
```

---

## 15. 数据备份和运维

即使使用托管平台，也必须做最基础的数据安全：

- 确认当前 Supabase 套餐实际提供的备份和恢复能力；
- 不把“托管”误认为“不需要备份”；
- 定期通过 direct connection 导出 `pg_dump`；
- 至少保留最近 7 天，或采用与业务重要程度匹配的周期；
- Supabase Storage 文件和数据库元数据分别纳入备份策略；
- 定期执行恢复演练；
- 应用日志不记录 JWT、数据库 URL、service role key；
- 监控 Supabase 数据库容量、连接数和 API 使用量。

不需要第一阶段部署：

- Prometheus；
- Grafana；
- ELK；
- 分布式追踪。

可先使用：

- Nest 结构化日志；
- Docker 日志；
- `/health`；
- 可选 Sentry。

---

## 16. 第一阶段明确不做

- Redis；
- Fastify；
- 微服务；
- Kafka、RabbitMQ；
- WebSocket 协作；
- CRDT；
- Kubernetes；
- Elasticsearch；
- 数据库按 circuit/PIN 全量拆表；
- 异步导出队列；
- 多租户组织系统；
- 复杂 RBAC；
- 对旧 localStorage 项目的迁移。
- 自托管 PostgreSQL；
- 自建密码和 Refresh Token 系统；
- 前端直接读写 Supabase 项目业务表。

这些都不是当前几名用户场景的必要条件。

---

## 17. 第一阶段完成定义

满足以下条件即可上线给少量用户试用：

1. 新用户可注册和登录；
2. 注册、登录、刷新和密码安全由 Supabase Auth 负责；
3. 用户只能查看自己的项目；
4. 新建项目生成合法 v3 文档；
5. 单端、多点、短接、侧锁定行为正确；
6. 线材重连失败不会破坏旧连接；
7. 项目可以保存到 Supabase PostgreSQL JSONB；
8. 关闭浏览器后重新登录仍能打开项目；
9. 自动保存失败有明确提示；
10. 两个页面同时编辑时旧 revision 返回 409；
11. Swagger 可查看 API；
12. 已确认 Supabase 套餐备份能力，并配置独立导出策略；
13. 前后端 test、lint、build 全部通过；
14. Redis 未部署也不影响任何功能；
15. 浏览器构建中不存在 service role key 或数据库连接串。

---

## 18. 最终建议

当前前端重构方向正确，上一轮发现的大部分问题已经修复，现有 18 个测试也证明核心领域模型开始稳定。

提交前应优先完成：

1. 原子化线材端点重连；
2. 简化并统一前端项目持久化；
3. 补充重连与 BOM 测试；
4. 清理本地配置和过程记忆文件；
5. 最终运行 test、lint、build。

后端采用：

```text
NestJS + Express + TypeScript
Supabase PostgreSQL + JSONB
Prisma
Supabase Auth JWT + NestJS Guard/Passport
Swagger
Supabase Storage
```

Supabase 托管数据库、认证和文件存储，NestJS 保留业务 API 和权限边界。Redis、Fastify、消息队列和实时协作全部延后。对单人开发和少量并发用户，这是开发速度、运维成本和后续扩展能力之间更合适的平衡点。

---

## 19. 官方参考

- NestJS Fastify/Express 适配说明：<https://docs.nestjs.com/techniques/performance>
- NestJS 文件上传及 Fastify 兼容限制：<https://docs.nestjs.com/techniques/file-upload>
- NestJS JWT 认证：<https://docs.nestjs.com/security/authentication>
- NestJS Passport：<https://docs.nestjs.com/recipes/passport>
- NestJS ValidationPipe：<https://docs.nestjs.com/techniques/validation>
- NestJS Swagger/OpenAPI：<https://docs.nestjs.com/openapi/introduction>
- Supabase 数据库连接模式：<https://supabase.com/docs/guides/database/connecting-to-postgres>
- Supabase + Prisma：<https://supabase.com/docs/guides/database/prisma>
- Supabase Auth：<https://supabase.com/docs/guides/auth>
- Supabase Auth 架构：<https://supabase.com/docs/guides/auth/architecture>
- Supabase JWT：<https://supabase.com/docs/guides/auth/jwts>
- Supabase Network Restrictions：<https://supabase.com/docs/guides/platform/network-restrictions>
- Prisma PostgreSQL 连接器：<https://docs.prisma.io/docs/orm/core-concepts/supported-databases/postgresql>
- Prisma JSON 字段：<https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields>
- PostgreSQL 版本支持策略：<https://www.postgresql.org/support/versioning/>
