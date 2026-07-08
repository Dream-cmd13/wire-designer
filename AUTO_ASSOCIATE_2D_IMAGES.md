# 自动关联 2D 图功能说明

## 功能概述

系统会根据设计元素的类型和参数，自动匹配并关联对应的 2D 图片到"成品图"视图。

## 自动关联规则

### 1. 连接器（Connector）

**M12 连接器**（`m12a04-07-093`）：
- **未连接外模时** → `连接器注塑前.png`
- **已连接外模时** → `连接器注塑后.png`

**判断逻辑**：
- 如果连接器与外模的距离在 150px 以内，视为"已连接"
- 自动切换对应的图片

### 2. 外模（Model）

**所有外模** → `外模.png`

**规格**：
- 外模材质：黑色PVC胶料 硬度45P
- 内模材质：低密度透明PE胶料（可选）

### 3. 护套线（Material）

**匹配条件**（必须全部满足）：
- 芯数：4芯
- 外被材质：PVC
- 外被颜色：黑色
- 线径：22AWG
- 屏蔽：否

**匹配结果** → `护套线.png`

**规格详情**：
- 外径 OD：4.5mm（自动计算）
- 芯线颜色：棕、白、蓝、黑（自动分配）

## 工作机制

### 自动触发时机

以下操作会自动触发 2D 图同步：

1. **添加元素**
   - 添加连接器
   - 添加线材
   - 添加外模

2. **更新元素**
   - 移动连接器或外模位置
   - 修改线材参数（芯数、材质、颜色、AWG、屏蔽等）
   - 修改外模参数

3. **手动触发**
   - 调用 `syncTwoDImagesAuto()` 方法

### 图片来源优先级

1. **手动上传的图片**（`source: 'upload'`）
   - 始终保留，不会被自动关联覆盖

2. **自动关联的图片**（`source: 'asset'`）
   - 每次同步时重新匹配和更新
   - 根据当前元素状态动态生成

### 关联逻辑

```typescript
// 1. 保留所有手动上传的图片
const manualImages = existing.filter((img) => img.source === 'upload');

// 2. 重新计算自动关联的图片
const autoImages = autoAssociateTwoDImages(config);

// 3. 合并结果
return [...manualImages, ...autoImages];
```

## 实现文件

- **核心逻辑**：`src/lib/autoAssociateTwoDImages.ts`
- **Store 集成**：`src/stores/harnessStore.ts`
- **自动触发**：`addConnector`、`updateConnector`、`addMaterial`、`updateMaterial`、`addModel`、`updateModel`

## 扩展指南

### 添加新的连接器匹配规则

编辑 `src/lib/autoAssociateTwoDImages.ts` 的 `getConnectorImage()` 函数：

```typescript
function getConnectorImage(
  connector: ConnectorInstance,
  models: CanvasModel[],
): TwoDImage | null {
  // M12 connector
  if (connector.connector.id === 'm12a04-07-093') {
    const isConnected = isConnectorConnectedToModel(connector, models);
    return assetImageByName(isConnected ? '连接器注塑后' : '连接器注塑前');
  }

  // 添加新规则
  if (connector.connector.id === 'your-connector-id') {
    return assetImageByName('your-image-name');
  }

  return null;
}
```

### 添加新的线材匹配规则

编辑 `getMaterialImage()` 函数：

```typescript
function getMaterialImage(material: CanvasWireMaterial): TwoDImage | null {
  if (material.spec.kind === 'jacketed') {
    const spec = material.spec;
    
    // 4芯 PVC 黑色 22AWG 无屏蔽
    if (spec.coreCount === 4 && spec.jacketMaterial === 'PVC' &&
        spec.jacketColor === 'black' && spec.awg === 22 && !spec.shielded) {
      return assetImageByName('护套线');
    }

    // 添加新规则
    if (spec.coreCount === 2 && spec.awg === 24) {
      return assetImageByName('your-wire-image');
    }
  }

  return null;
}
```

## 注意事项

1. **图片文件位置**
   - 所有 2D 图片必须放在项目根目录
   - 支持格式：`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`

2. **图片命名**
   - 文件名（不含扩展名）必须与匹配规则中的名称一致
   - 区分大小写

3. **连接器距离判断**
   - 当前使用简单的 150px 距离阈值
   - 可根据实际需求调整判断逻辑

4. **手动上传优先**
   - 用户手动上传的图片不会被自动覆盖
   - 如需重新自动关联，需先删除手动上传的图片

## 测试验证

### 测试步骤

1. **连接器自动切换**
   - 添加 M12 连接器 → 应显示"连接器注塑前.png"
   - 添加外模并移到连接器附近 → 应自动切换为"连接器注塑后.png"
   - 移开外模 → 应切换回"连接器注塑前.png"

2. **护套线匹配**
   - 添加护套线，设置为：4芯、PVC、黑色、22AWG、无屏蔽
   - 应自动关联"护套线.png"
   - 修改任一参数（如改为3芯）→ 关联应被移除

3. **外模关联**
   - 添加任何外模 → 应自动关联"外模.png"

## 故障排查

**问题：图片没有自动关联**
- 检查图片文件是否在根目录
- 检查文件名是否正确（不含扩展名部分）
- 检查元素参数是否完全匹配规则

**问题：连接器图片没有切换**
- 检查连接器 ID 是否为 `m12a04-07-093`
- 检查连接器与外模的距离（应在 150px 内）
- 尝试移动元素位置触发更新

**问题：手动上传的图片被覆盖**
- 这不应该发生，请检查代码实现
- 手动上传的图片 `source` 字段应为 `'upload'`
