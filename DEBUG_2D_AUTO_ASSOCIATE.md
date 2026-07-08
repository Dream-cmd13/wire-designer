# 2D图自动关联调试指南

## 问题排查步骤

### 1. 检查图片文件

**确认以下图片文件在项目根目录：**

```
项目根目录/
├── 连接器注塑前.png
├── 连接器注塑后.png
├── 护套线.png
└── 外模.png
```

**支持的格式：** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`

### 2. 查看控制台日志

打开浏览器开发者工具（F12），切换到 Console 标签，查找以下日志：

#### 启动时的日志
```
[autoAssociate] Available image assets: 4
```
- 如果数字是 0，说明根目录没有图片文件
- 如果数字小于 4，说明部分图片缺失

#### 添加元素时的日志
```
[autoAssociate] Starting auto-association...
[autoAssociate] Processing connector: m12a04-07-093
[autoAssociate] Found image: "连接器注塑前" -> /assets/连接器注塑前.png
[autoAssociate] ✅ Connector image associated: 连接器注塑前
[autoAssociate] Total images associated: 1
```

#### 常见错误日志

**找不到图片：**
```
[autoAssociate] Image asset not found: "连接器注塑前". Available: []
```
→ 解决：将图片文件放到项目根目录

**连接器ID不匹配：**
```
[autoAssociate] Processing connector: some-other-id
[autoAssociate] ⚠️ No image match for connector: some-other-id
```
→ 解决：确保使用的是 M12 连接器（ID: `m12a04-07-093`）

**线材参数不匹配：**
```
[autoAssociate] Processing material: W1 护套线
[autoAssociate] ⚠️ No image match for material: W1 护套线
```
→ 解决：检查线材参数是否为：4芯、PVC、黑色、22AWG、无屏蔽

### 3. 验证图片加载

在开发者工具的 **Network** 标签中：
1. 刷新页面
2. 筛选：`Img`
3. 查看是否有 `连接器注塑前.png` 等图片请求
4. 状态应该是 `200 OK`

### 4. 检查 2D 图视图

1. 切换到"成品图"标签页（之前叫"2D图"）
2. 应该能看到关联的图片
3. 如果看不到，检查控制台是否有错误

## 手动测试步骤

### 测试1：M12连接器自动关联

1. **清空设计**（如果已有内容）
2. **添加 M12 连接器**
   - 点击"添加连接器"
   - 选择：`M12成型式防水连接器 4芯 A编码 焊线式公头 非屏蔽款+11.8L双网纹螺丝`
3. **切换到成品图**
   - 应该看到"连接器注塑前.png"
4. **查看控制台日志**：
   ```
   [autoAssociate] Processing connector: m12a04-07-093
   [autoAssociate] ✅ Connector image associated: 连接器注塑前
   ```

### 测试2：外模触发连接器切换

1. **添加外模**
   - 点击"添加外模"
2. **移动外模靠近连接器**（距离 < 150px）
3. **查看成品图**
   - 应该自动切换为"连接器注塑后.png"
4. **查看控制台日志**：
   ```
   [autoAssociate] Processing connector: m12a04-07-093
   [autoAssociate] ✅ Connector image associated: 连接器注塑后
   ```

### 测试3：护套线自动关联

1. **添加线材**
   - 点击"添加线材"
2. **配置参数**：
   - 类型：护套线
   - 芯数：4
   - 外被材质：PVC
   - 外被颜色：黑色
   - 线号 AWG：22
   - 是否带屏蔽：否（不勾选）
3. **查看成品图**
   - 应该看到"护套线.png"
4. **查看控制台日志**：
   ```
   [autoAssociate] Processing material: W1 护套线
   [autoAssociate] ✅ Material image associated: 护套线
   ```

## 常见问题

### Q1: 示例项目有图片，但新添加的元素没有

**可能原因：**
- 图片文件名不对（区分大小写）
- 连接器 ID 不是 `m12a04-07-093`
- 线材参数不完全匹配

**解决方法：**
1. 检查控制台日志中的 `Available:` 列表
2. 确保文件名与日志中的完全一致
3. 使用正确的连接器和参数

### Q2: 控制台显示 "Available image assets: 0"

**原因：** 项目根目录没有图片文件

**解决方法：**
1. 确认图片放在项目根目录（不是 `src/` 或 `public/`）
2. 重启开发服务器：`npm run dev`
3. 刷新浏览器

### Q3: 图片文件存在，但 imageAssets 为空

**原因：** Vite 的 `import.meta.glob` 只在构建时扫描

**解决方法：**
1. 停止开发服务器
2. 确认图片在根目录
3. 重新启动：`npm run dev`

### Q4: 修改了线材参数，但图片没有更新

**原因：** 参数不匹配或缓存问题

**解决方法：**
1. 确认所有参数都匹配
2. 查看控制台日志确认匹配结果
3. 尝试刷新页面（Ctrl+F5）

### Q5: 手动上传的图片被覆盖了

**这不应该发生！** 手动上传的图片有保护机制。

**检查：**
1. 查看控制台日志
2. 检查 `source` 字段（应该是 `'upload'`）
3. 如果被覆盖，这是一个 bug，请报告

## 开发环境运行

```bash
# 确保图片文件在根目录
ls *.png

# 启动开发服务器
npm run dev

# 在浏览器中打开
# 按 F12 打开开发者工具
# 切换到 Console 标签查看日志
```

## 图片文件清单

请确保以下文件存在于项目根目录：

- [ ] `连接器注塑前.png` - M12连接器未连接外模时显示
- [ ] `连接器注塑后.png` - M12连接器连接外模后显示
- [ ] `护套线.png` - 4芯PVC黑色22AWG护套线
- [ ] `外模.png` - 外模元素

## 成功标志

当自动关联正常工作时，您应该看到：

1. ✅ 控制台无错误
2. ✅ `Available image assets: 4` 或更多
3. ✅ 每个元素都有 `✅ xxx image associated` 日志
4. ✅ 成品图视图中显示对应的图片
5. ✅ 移动外模时连接器图片自动切换

## 需要帮助？

如果按照以上步骤仍然无法解决问题：

1. 复制完整的控制台日志
2. 截图当前的设计图和成品图
3. 列出根目录的文件列表：`ls *.png`
4. 提供上述信息以便诊断
