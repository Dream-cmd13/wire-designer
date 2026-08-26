# 代码库级 Agent 可执行技术设计与实施计划

## 1. 目标与范围

### 目标

解决浏览器标签页长时间处于后台后，Supabase 私有 `catalog-assets` 图片失效的问题，使连接器、线材、外模及成品图中的目录图片在以下场景仍可恢复显示：

- 标签页休眠一小时以上后回到页面；
- 页面保持打开但签名 URL 已过期；
- 单张图片请求因过期令牌返回 `400 InvalidJWT`。

### 范围

- 仅修改前端目录图片的签名 URL 生命周期管理和相关状态同步。
- 保持 `catalog-assets` 为私有桶，不改 Storage 权限、不公开对象。
- 不修改目录表结构、项目业务数据结构或 Supabase RLS。
- 不处理与目录图片无关的项目图片、PDF、图纸导出资源。

### 已确认的复现证据

用户提供的签名令牌包含：

- `iat = 1787710495`（2026-08-26 10:14:55，中国时间）；
- `exp = 1787714095`（2026-08-26 11:14:55，中国时间）；
- 有效期正好 `3600` 秒。

对原 URL 发起 GET 得到：

```text
400 Bad Request
{"statusCode":"400","error":"InvalidJWT","message":"\\"exp\\" claim timestamp check failed","code":"InvalidJWT"}
```

对相同 Storage path 使用当前 publishable key 重新签名后，GET 返回 `200 image/png`。因此主因是签名 URL 过期，不是对象路径、对象丢失或 RLS 权限异常。

## 2. 代码库现状与约束

### 当前调用链

1. [`src/lib/catalogRepository.ts`](../src/lib/catalogRepository.ts) 的 `imageUrl()` 对每个 `image_path` 调用 `createSignedUrl(path, 60 * 60)`。
2. [`src/stores/catalogStore.ts`](../src/stores/catalogStore.ts) 的 `initialize()` 只在状态不是 `ready` 时加载目录；进入 `ready` 后不会按时间自动重新签名。
3. [`src/App.tsx`](../src/App.tsx) 仅在挂载时调用一次 `initializeCatalog()`。
4. [`src/lib/autoAssociateTwoDImages.ts`](../src/lib/autoAssociateTwoDImages.ts) 将目录返回的签名地址写入 `TwoDImage.dataUrl`，并用于成品图渲染。
5. [`src/repositories/projectRepository.ts`](../src/repositories/projectRepository.ts) 会把完整 `HarnessConfig` JSON 保存到 `projects.config`，所以当前签名 URL 也可能被持久化。
6. 目录弹窗和图纸资源面板会各自调用目录 repository；它们在打开时通常会拿到新 URL，但已挂起的视图没有续签机制。

### 现有风险

- 标签页继续使用同一个已过期 token，浏览器刷新图片只会重复请求失败 URL。
- `resourceImageUrl`、`Connector.image`、`TwoDImage.dataUrl` 中的旧 URL 可能跨会话保存，不能作为长期资产标识。
- 直接把签名有效期改成长时间只能延后问题，无法覆盖无限期后台休眠，也会扩大泄露窗口。
- 重新加载目录后，必须同步当前画布/成品图状态；否则运行时 snapshot 已更新，但已存在的 `TwoDImage` 仍引用旧 URL。

## 3. 技术方案

采用“路径作为权威数据 + 运行时签名地址 + 回到前台刷新 + 单次失败重试”的组合方案。

### 3.1 资产标识与签名地址分离

- 目录数据库中的 `image_path` 继续作为唯一 Storage path 来源。
- 在运行时目录对象中增加内部签名元数据（至少包含 `storagePath` 和 `expiresAt`，不暴露服务端密钥）。
- 新建或更新画布元素时，优先保存 `resourceItemId`/`storagePath`；签名 URL 只作为当前会话渲染值。
- 读取旧项目时兼容已有 URL：先正常加载，再用当前目录项按 `resourceItemId` 重建图片地址；找不到目录项时暂时保留旧值，避免无图数据被误删。
- 保存项目时不再把新的签名 URL 当作长期资产来源；如本轮实施范围不适合立即调整数据库 JSON，则至少保证刷新时覆盖运行时值，并在后续步骤逐步移除 URL 持久化。

### 3.2 集中的签名 URL 服务

在 `src/lib` 增加一个小型的 Storage 图片 URL 服务（名称可定为 `catalogImageUrl.ts`），职责限定为：

- 接受 bucket/path，调用 `createSignedUrl`；
- 使用常量有效期（建议 1 小时）和安全提前量（建议提前 5 分钟视为过期）；
- 按 path 缓存进行中的请求，避免同一 path 并发重复签名；
- 对错误返回可诊断信息，但不让单张图片失败阻塞整个目录列表；
- 提供 `isLikelyExpired(url)` 或等价判断，供失败重试和前台刷新使用。

`CatalogRepository` 和 `DrawingCatalogRepository` 共用该服务，避免两套续签逻辑产生不同生命周期。

### 3.3 目录刷新与状态同步

扩展 `catalogStore`：

- 保留现有 `initialize()`；新增幂等的 `refresh()`/`refreshIfStale()`，复用并发 loading promise。
- 记录最近一次成功签名时间和下一次刷新截止时间；页面回到前台时，如果已接近过期就重新加载 snapshot。
- 重新加载成功后更新 `catalogRuntime`，并触发当前 harness 配置的图片关联重算，但不把“仅 URL 更新”标记为用户业务修改。
- 如果刷新失败，保留旧 snapshot 并记录错误；图片组件仍可执行一次按 path 的即时重试。

### 3.4 页面生命周期触发

在 [`src/App.tsx`](../src/App.tsx) 或一个独立 hook 中注册：

- `document.visibilitychange`：从 hidden 变为 visible 时调用 `refreshIfStale()`；
- `window.pageshow`：处理浏览器从 bfcache 恢复的场景；
- `window.focus`：作为部分浏览器不触发 visibilitychange 时的补充，但需节流；
- 可选的前台定时器：按 `expiresAt - safetyWindow` 触发一次刷新，不能只依赖定时器。

所有触发器共享同一并发锁，避免回到前台时发起多次相同目录查询。

### 3.5 图片失败重试

对目录图片渲染入口（至少 [`src/components/drawings/TwoDImageCard.tsx`](../src/components/drawings/TwoDImageCard.tsx)、线材选择预览、图纸资源预览）增加受控的 `onError` 行为：

1. 仅对目录 Storage 图片执行一次重试；
2. 调用当前 path 的签名服务重新获取 URL，更新对应运行时对象/目录 snapshot；
3. 若仍失败，显示现有的缺图/错误状态，不进入无限重试循环；
4. 记录带 path 的非敏感错误信息，禁止把完整 token 写入日志。

优先通过 `resourceItemId + storagePath` 定位资源；无法定位时才使用旧 URL 的 path 解析作为兼容兜底。

### 3.6 失败与并发策略

- 目录查询失败：保持上一份可用 snapshot，UI 显示可重试提示。
- 单图签名失败：该资源 `image`/`imageUrl` 为空并显示资源级错误，不丢弃整个目录项。
- 多个图片同时过期：合并为一次目录刷新，刷新完成后统一替换 URL。
- 用户正在编辑时刷新 URL：只替换不可见的资源地址，不改位置、旋转、镜像、连接关系、数量等业务字段，也不触发自动保存。

## 4. 涉及文件

### 必改文件

- `src/lib/catalogRepository.ts`：改为使用集中签名服务，并返回 path/过期元数据或可刷新引用。
- `src/lib/drawingCatalogRepository.ts`：复用相同签名服务和错误语义。
- `src/stores/catalogStore.ts`：增加刷新、过期判断、并发去重和刷新状态。
- `src/App.tsx`：挂载页面生命周期刷新 hook，并在目录刷新后同步当前运行时图片。
- `src/lib/autoAssociateTwoDImages.ts`：按稳定资源标识重建图片，避免旧 token 长期优先级过高。
- `src/types/harness.ts`、`src/lib/harnessConfigSchema.ts`：补充稳定的图片 path 字段（如采用路径分离方案），并保持 v3 配置校验一致。
- `src/components/drawings/TwoDImageCard.tsx`：增加一次性失效重试和最终错误状态。

### 视实际调用链修改

- `src/components/canvas/WireMaterialDialog.tsx`：预览 URL 过期时触发刷新，不把失败 URL 固化到新对象。
- `src/components/shared/PartPickerDialog.tsx`：打开弹窗时使用统一目录刷新结果。
- `src/components/drawings/standalone/DrawingResourcePanel.tsx`：复用统一资源加载和错误状态。
- `src/types/catalog.ts`、`src/types/drawing.ts`：如需向 UI 暴露 `storagePath`/刷新状态，补充类型。

### 测试文件

- `src/lib/__tests__/catalogRepository.test.ts`
- `src/lib/__tests__/drawingCatalogRepository.test.ts`
- `src/lib/__tests__/autoAssociateTwoDImages.test.ts`
- 新增 `src/lib/__tests__/catalogImageUrl.test.ts`
- 新增或扩展 `src/lib/__tests__/catalogStore.test.ts`
- 必要时新增 `src/components/drawings/__tests__/TwoDImageCard.test.tsx`

## 5. 分步实施计划

### 第 1 步：建立回归测试基线

- 用 fake Supabase Storage 控制签名 URL 的 `expiresAt`。
- 编写“已过期 URL -> 重新签名 -> 返回新 URL”的失败测试。
- 编写“同一 path 并发刷新只调用一次 `createSignedUrl`”测试。
- 编写“刷新 URL 不改变图片位置/旋转/镜像及业务配置”的测试。
- 先运行测试，确认新测试在当前实现下失败。

### 第 2 步：实现集中签名服务

- 提取签名有效期、提前量、缓存和并发锁。
- 更新两套 repository 使用该服务。
- 保持签名失败不阻塞其他目录项的现有行为。

### 第 3 步：实现目录刷新状态机

- 在 `catalogStore` 增加 `refreshIfStale()` 和刷新状态。
- 刷新成功后更新 runtime snapshot；刷新失败时保留旧快照。
- 确保 `initialize()`、前台事件和图片错误重试共享同一个 loading promise。

### 第 4 步：同步当前画布和成品图

- 用稳定的 `resourceItemId/storagePath` 找到现有元素。
- 只替换目录图片 URL；保留用户布局和编辑状态。
- 将 URL 刷新标记为非业务变更，避免产生脏保存和历史记录。

### 第 5 步：接入页面生命周期及图片错误重试

- 接入 `visibilitychange`、`pageshow`、节流后的 `focus`。
- 在图片组件中实现最多一次重试和最终错误展示。
- 清理 token 日志，保留可诊断的 path 与错误码。

### 第 6 步：兼容持久化数据并收敛模型

- 读取旧项目时从目录重新生成当前签名 URL。
- 新建/保存项目时以稳定 path 为主，不再把新 token 作为长期依赖。
- 更新 schema、导入导出和相关测试。

### 第 7 步：回归、构建和人工走查

- 运行单元测试、lint、TypeScript build。
- 用浏览器走查：打开设计器，等待/模拟 URL 过期，切换后台再回来，确认图片恢复。
- 验证多图、连接器 before/after/pin-map、线材、外模和图纸资源面板。

## 6. 验证方案

### 自动化验证

```text
npm test -- src/lib/__tests__/catalogImageUrl.test.ts src/lib/__tests__/catalogRepository.test.ts src/lib/__tests__/drawingCatalogRepository.test.ts src/lib/__tests__/autoAssociateTwoDImages.test.ts
npm run lint
npm run build
```

测试必须覆盖：

- 过期时间边界（刚过期、提前量内、有效期内）；
- 过期 token 返回 400 后只重试一次；
- 刷新失败不清空可用目录；
- 并发事件只触发一次签名请求；
- URL 刷新不产生业务脏状态；
- 旧项目 JSON 中存在旧 signed URL 时仍能恢复并替换为新 URL。

### 浏览器走查

1. 打开包含连接器、护套线和外模图片的项目。
2. 在测试桩中把签名有效期缩短到数秒，等待过期。
3. 切换标签页后回到应用，确认 network 中出现新的 sign 请求且图片返回 200。
4. 直接让一张图片请求返回 `400 InvalidJWT`，确认只重试一次并恢复显示。
5. 检查画布位置、图纸布局、旋转和镜像没有变化。
6. 刷新浏览器后重新打开同一项目，确认不会依赖旧 token。

## 7. 验收标准

- 标签页后台一至两小时后回到前台，目录图片自动恢复，无需整页刷新。
- 原 URL 过期时，网络请求返回 400 后最多一次自动续签，最终图片请求返回 200 或显示明确的资源级错误。
- 连接器三种图片变体、线材、外模和图纸资源均使用同一续签策略。
- 私有 bucket、RLS 和 publishable key 使用方式不变，浏览器不接触服务端密钥。
- 目录刷新不会覆盖用户对图片的排布、旋转、镜像或其他业务编辑，也不会触发无意义的自动保存。
- 自动化测试、lint 和 build 全部通过。

## 8. 风险与取舍

- **只延长 `expiresIn` 不作为最终方案**：仍会在更长时间休眠后失效，且扩大 token 暴露时间。
- **完全改为公开 URL 不可接受**：与当前私有目录和 RLS 设计冲突。
- **路径分离需要 schema 兼容处理**：应先保留旧 URL 读取兜底，再逐步让稳定 path 成为唯一来源。
- **前台刷新期间网络不可用**：必须保留旧快照并显示可重试状态，不能让整个设计器变空。
- **图片错误事件可能集中发生**：并发去重和单次重试是必要的，否则会产生请求风暴。
- **导出流程读取图片的时机**：导出前应确保目录 URL 未过期，必要时显式等待一次 `refreshIfStale()`。

## 9. 执行前确认

本阶段仅交付本设计计划，不修改业务代码。请明确回复：

- `执行`：按本计划开始实现并验证；
- `停止`：保留计划，不进行实现改动。
