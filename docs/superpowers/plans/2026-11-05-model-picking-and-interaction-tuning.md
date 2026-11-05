# CAD 面点击高亮与拖拽手感校准 Implementation Plan

> **交给执行 AI：**使用 `superpowers:executing-plans` 按任务实施并勾选。先核对 AGENTS.md、当前代码及已有未提交修改。本文件仅提供实施方案，不授权提交、推送、部署、数据库修改或真实云端写入。

**Goal：**恢复轻快且可量化的旋转响应，保留无极点自由翻转；点击 STEP 的局部 CAD 面时显示黄色高亮，拖动不会误触选择。

**Architecture：**继续使用 TrackballControls，按画布短边校准角速度。Worker 保留 OCCT 已有 CAD 面三角形范围；Viewer 用 Raycaster 命中实体三角形，再映射 CAD 面，以单个选区叠加层高亮，不为每个面创建独立渲染对象。

**Tech Stack：**现有 React 19 / TypeScript / Three.js 0.187.0 / occt-import-js 0.0.23 / Vitest / Playwright；不新增依赖。

**Spec：**本文件第 3–5 节为本轮规格；承接 `2026-11-05-model-free-rotation-controls.md` 与 `2026-11-04-model-preview-quality-improvements.md`，保留其已实现功能。

## 1. 审查结论：两个不同问题

### 1.1 拖动费劲：已确认灵敏度回退，尚未确认掉帧

当前 `src/lib/models/modelView.ts:6` 已换成 TrackballControls，设置 `staticMoving=true`，却没有校准 `rotateSpeed`，沿用默认值 1。旧版本 `d1b4a8d` 使用 OrbitControls，其默认值虽同为 1，但换算方式不同：

- 当前 Trackball：中心附近直线拖动，转角约 `2 × 像素位移 / 画布宽度 × rotateSpeed`。
- 旧 Orbit：横向方位角约 `2π × 像素位移 / 画布高度 × rotateSpeed`；正常前视的短程纵向拖动同量级。
- 因而把两个库的默认速度当作相同手感并不成立。画布变宽而高度不变时，当前实现还会进一步变慢。

使用真实控件及当前工厂函数，前视相机 `(0,-100,0)`、Z-up、中心起拖、10 段 pointermove/update，横向与纵向各拖 100 CSS px，实测如下。这里列的是相机 quaternion 角差，不是根据截图猜测。

| 测试画布 CSS 尺寸 | 旧 Orbit | 当前 Trackball | 当前/旧值 | 校准候选 |
| --- | ---: | ---: | ---: | ---: |
| 800 × 600 | 60.00° | 14.32° | 23.9% | 60.00° |
| 1330 × 706 | 50.99° | 8.62° | 16.9% | 50.99° |
| 1760 × 706 | 50.99° | 6.51° | 12.8% | 50.99° |

三种尺寸横向与纵向结果一致；1330×706 是接近截图布局的测试尺寸，**不是对用户正在运行页面的 DOM 实测**。候选在诊断脚本中设置 `rotateSpeed = π × width / min(width,height)`，未修改应用。

这证明了“需要拖很远才转一点”的回退。上一份计划规定保留默认速度，验收只要求转角大于 0.01 rad、能累计转满一圈，没有规定每次拖动应转多少，遗漏了手感门槛。本轮应补角速度验收，不能仅再次证明“能转动”。

当前 `ModelViewer.tsx` 的 RAF 每帧更新控件，绘制主要由 change 事件触发；几何与边线在模型 replace 时建立，未发现普通拖动每帧重新解析/生成 EdgesGeometry 的路径，`freeView` 也已避免每帧重复设置自由视角状态。因此暂不把问题归因于“模型太大”“阻尼太强”或“React 每帧重建”。本轮没有采集用户浏览器 CPU/GPU 帧时序，真实卡顿仍需按任务 4 验证。

### 1.2 点击局部变色：缺失选择链路和面映射

截图中嘉立创显示的是局部曲面区域黄色填充及边界，用户描述为点击触发。本轮不推断其内部库、面合并算法或私有 F3D 格式。

当前代码：

- `modelParser.worker.ts` 得到 `brep_faces`，只交给 `attachSurfaceEdges()` 生成边线。
- `ParsedMesh` 只传递 positions、normals、indices、surfaceEdges，没有保留面范围。
- Viewer 没有 Raycaster、点击与拖拽区分、选中对象或高亮层。
- 当前共享一个实体材质，直接改它的颜色会影响所有使用该材质的网格，不能实现局部 CAD 面高亮。

本机实际用当前 STEP 参数解析 `male_5.stp`：

| 质量 | Mesh 数 | 三角形数 | CAD 面分组数 | 范围完整性 |
| --- | ---: | ---: | ---: | --- |
| standard | 1 | 5,632 | 35 | 从 0 开始连续覆盖，last 为包含端点 |
| fine | 1 | 11,228 | 35 | 同上 |

因此不能简单选择整个 Mesh：本样件只有一个 Mesh，却有 35 个 CAD 面分组。可以利用现有 OCCT 数据实现点击局部曲面；35 个面数相同不证明它们跨质量或跨解析具有稳定拓扑 ID。

### 1.3 截图中其他差异

嘉立创样件占画布更大、材质更亮；本系统显示模型更小、留白较多。两图相机、缩放、画布及灯光不一致，不能据此判断网格错误，也不能将放大模型当作灵敏度修复。本轮不扩大到灯光重做、测量、剖切、方向立方体或报价。

## 2. 已做验证与证据文件

本轮审查执行结果：

审查期间已有功能改动被提交为 `970a461`，收尾复核的控件及面数据实现仍与上述结论一致。本轮只新增本计划文档，没有执行该提交或修改功能代码；实施者以启动时实际工作区状态为准。

- `npm test -- src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelViewer.test.tsx src/lib/__tests__/modelViewerPage.test.tsx src/lib/__tests__/modelEdges.test.ts src/lib/__tests__/modelParser.test.ts`：5 文件 / **61 项通过**。
- `npx tsc -b`：通过。
- `npx eslint src/lib/models/modelView.ts src/components/models/ModelViewer.tsx src/lib/models/modelParser.worker.ts src/lib/models/modelTypes.ts src/lib/models/modelEdges.ts --max-warnings=0`：通过，0 错误 / 0 告警。
- 当前灵敏度与旧 Orbit 的差分实验：低于旧值 80% 的诊断门槛，按预期失败；候选校准恢复表中角度。80% 是捕捉回退的诊断阈值，不是嘉立创实测参数。
- 本轮没有执行新的浏览器 E2E 或 GPU 性能采样；已有验证文档中的历史结果不能写成本轮重新验证结果。

本机可复核的只读诊断：

```powershell
node 'C:\Users\Redmi\.codex\visualizations\2026\11\04\01a1a449-4c0c-76a0-89df-98350adce1ac\model-interaction-audit.cjs' 'D:\wire-harness-designer'
```

当前预期退出码 1（捕捉到灵敏度回退）；同时输出样件面数。CommonJS Three.js 弃用提示属于诊断工具加载方式，不是应用构建问题。实施者须把必要回归写入仓库测试，不依赖该个人路径。

## 3. 方案选择与全局约束

选择**尺寸归一化的 Trackball + CAD 面拾取**：保留无极点翻转，用可测量角度恢复手感；保留面索引而不拆分全部网格。

其他方案不作为本轮默认：只设固定 `rotateSpeed=4` 不能解决宽高比例变化；回退 Orbit 会重新引入极点限制；整个 Mesh 染色无法选中本样件的局部曲面；每个 CAD 面一个 Mesh 会增加对象与 draw call；自研四元数控件或引入 BVH 缺少当前必要性。

全局约束：保留未提交成果、现有数据和原始文件；不改存储/权限/数据库，不新增依赖和双控件模式。高亮只影响显示，不修改原始顶点/索引或制造颜色数据用于保存。复用现有本地 API 拦截验收，不访问真实云端写入。

重点风险及任务归属：

1. 全屏或收起侧栏后灵敏度再次改变：任务 1、4。
2. 三角形编号和 index buffer 下标混淆，导致错面或越界：任务 2、3。
3. 拖出去又回到原点被当作点击；拖后或取消后误选：任务 3、4。
4. 精细质量重新解析后继续使用旧 faceId，选错区域：任务 2、3。
5. 高亮自身拦截射线、背面穿透、重复选择泄漏或每面 draw call 爆炸：任务 3、4。

## 4. 灵敏度规格

统一以 CSS 像素计算，不使用 drawingBuffer 像素或 devicePixelRatio。定义画布短边 `s = min(width,height)`，目标直线拖动 `s/4` 旋转约 90°，分段连续拖动 `s` 累计约 360°。完整一圈可能回到初始姿态，测试要累计中间角度。

配置公式：

```ts
// Trackball 当前版本将横纵移动均除以 screen.width / 2。
controls.rotateSpeed = Math.PI * width / Math.min(width, height);
```

保持 `staticMoving=true`，不引入惯性来掩盖低灵敏度；右键平移、滚轮和中键缩放保留当前行为。这是恢复旧桌面旋转量级的初始产品基线，不声称完全复制嘉立创。

在工厂初始化、有效 resize、pointerdown 前的位置刷新、全屏/显式重建后统一同步。零尺寸不计算比例、不产生 Infinity/NaN，也不重置相机。两种 CSS 宽度但同一短边下，同样 100 px 操作角度应一致；DPR 变化不改变手感。

新增接口放在 `modelView.ts`：

```ts
export function syncModelControlsViewport(controls: TrackballControls): void;
```

该函数调用 `handleResize()`，仅在宽高有效时设置速度。现有 `createModelTrackballControls(camera, canvas)` 调用它；Viewer 中已有直接 `handleResize()` 的相关入口统一使用它，避免新实例恢复为速度 1。

## 5. 点击高亮规格与数据接口

### 5.1 用户行为

| 场景 | 行为 |
| --- | --- |
| 左键点击 STEP 面 | 单选完整 CAD 面分组，黄色填充及黄色边界 |
| 点击其他面 | 替换原选区 |
| 再次点击同一面 | 保持选中，不切换、不重复创建资源 |
| 点击空白 / 点击“清除选择” | 清除高亮 |
| 左键拖动 | 只旋转，保留已有选择，不在释放后改变选区 |
| 右键平移 / 中键 / 滚轮 | 不触发选择 |
| 质量切换、重新解析、换文件、重建画布 | 清除选区；相机仍按现有规则保留或初始化 |
| 背景、边线、resize、全屏、视角按钮 | 保留选区，跟随模型显示 |
| STL 或缺少有效面分组 | 点击高亮整个命中的 Mesh，提示“网格选择”；不把单个三角形冒充 CAD 面 |

默认不做 hover、框选、多选、Ctrl 选择、选区持久化或面面积测量。提示增加“点击选择曲面”；状态可显示“曲面 12”或“网格：STL”，编号仅用于当前解析结果，不是稳定 CAD 编号。

鼠标单击判定：左键主指针从 canvas 开始，整个路径相对起点的最大位移不超过 **4 CSS px**，释放点仍在 canvas 内，期间没有取消、多指、失焦、全屏切换或模型替换。路径超过阈值即永久标记本次为拖动，不能只比较起终点。右键不清空选择。pointerup 时先消费控件尚未处理的输入，再更新相机/对象矩阵并射线检测，避免用上一帧相机选错面。

触控选择不作为本轮声明能力；若添加，必须单独验证点击与单指旋转/双指操作的区分。现有触控旋转不能被新增鼠标选择逻辑阻断。

### 5.2 面数据

在 `modelTypes.ts` 新增并扩展：

```ts
export interface ModelFaceRange {
  faceId: number; // 当前 Mesh 中的解析顺序，不能跨解析复用
  firstTriangle: number;
  lastTriangle: number; // 包含端点
}
// ParsedMesh 新增 faceRanges?: ModelFaceRange[]
export type ModelSelection =
  | { kind: 'face'; meshIndex: number; faceId: number }
  | { kind: 'mesh'; meshIndex: number }
  | null;
```

仅小型数值元数据用 structured clone；positions/indices 等仍走已有 Transferable。选择只绑定当前 `ParsedModel`，任何 replace 即失效，即使 modelKey 相同。不要把 faceId 存进云端。

新增 `src/lib/models/modelFaces.ts` 集中纯数据逻辑：

```ts
export function normalizeFaceRanges(
  source: readonly { first: number; last: number }[] | undefined,
  triangleCount: number,
): ModelFaceRange[] | undefined;

export function findFaceRange(
  ranges: readonly ModelFaceRange[], triangleIndex: number,
): ModelFaceRange | undefined;

export function extractFaceMesh(mesh: ParsedMesh, range: ModelFaceRange): ParsedMesh;
```

验证 first/last 为非负整数、first≤last、last<triangleCount，按顺序连续无重叠覆盖全部三角形。无效则当前 Mesh 不提供 faceRanges，仍显示实体并允许网格选择，不拒绝整个模型。避免在 `modelEdges.ts` 引入相互导入；如复用校验，让边线模块单向依赖 faces 模块。

Raycaster 的 `intersection.faceIndex` 是 Mesh 三角形序号；查找命中区间 `firstTriangle ≤ faceIndex ≤ lastTriangle`。真正截取 index buffer 时才乘 3：`[first*3, (last+1)*3)`。不要按共面法线合并曲面，也不要从显示边线反推 CAD 拓扑。

### 5.3 高亮显示与资源

只对实体 Mesh 列表 raycast，取最近可见命中；边线、辅助层和高亮层不参与命中。使用实时 canvas rect 转换 NDC，支持滚动、全屏、模型居中 group 变换以及相机刚更新的情况。

选中面使用一个可替换的高亮 Mesh 和最多一个边线对象。`extractFaceMesh()` 只复制选中面的引用顶点并重新建立紧凑索引，保留原顶点身份和可用法线，不复用将被独立 dispose 的 GPU 属性、不复制整模型、不修改源数据。边界可复用 `extractSurfaceEdges()`，但输入必须是紧凑子网格和从 0 开始的完整单面范围，不能把原始非零 first 范围直接传给它。

初始显示参数：填充 `#FFD54F`、opacity 0.45、transparent=true、depthTest=true、depthWrite=false；边线 `#FFD600`、depthTest=true。高亮 Mesh 使用 polygonOffset 避免与实体共面闪烁，并固定在实体之后绘制；边界有闪烁时小幅调整深度偏移，不得关闭 depthTest 展示背面。叠加层和实体必须共享同一模型空间变换。填充可用 MeshBasicMaterial，保持高亮不受强灯光影响。

网格退化选择优先为命中的 Mesh 临时替换独立高亮材质，取消时恢复原材质；禁止修改共享实体材质。全局原始材质由 Viewer 统一释放，独立选择材质只释放一次。

边线预算不足时保留面填充、略去该选区轮廓；已校验的 faceRanges 不应因为全模型边线提取失败而被删除。一次选择只生成一次高亮数据，拖动只改变相机，不重复提取几何；再次选同一对象直接复用。

## 6. 实施任务

### 任务 1：先修复手感回退

文件：`modelView.ts`、`ModelViewer.tsx`、`modelTrackballControls.test.ts`、`modelViewer.test.tsx`。

- [x] 添加真实指针回归：前视、800×600、横/纵向 100 px 应为 60°±1°；确认当前约 14.32° 导致失败。
- [x] 添加 1330×706 与 1760×706 的同距离测试，均为约 50.99°±1°，不得随宽度改变；补 600×800 画布的短边基线。
- [x] 实现第 4 节同步接口，并覆盖工厂、resize、pointerdown 与重建路径；DPR 1/2 相同 CSS 尺寸角度一致。
- [x] 保留并重跑越极点、累计整圈、右键平移、缩放、取消手势、全屏和预设回归。不要通过放宽旧断言掩盖旋转失效；完整圈采样分足够小的步长避免角差混叠。
- [x] 组件测试显式预设后、失焦重建后仍使用校准速度；零尺寸恢复正常且数值有限。

### 任务 2：保留 CAD 面映射

文件：`modelTypes.ts`、新 `modelFaces.ts`、`modelParser.worker.ts`；必要时小范围调整 `modelEdges.ts`；新 `modelFaces.test.ts`、扩展 parser/edges 测试。

- [x] 为 normalizeFaceRanges 写首尾、连续范围、缺失、重叠、空洞、越界、非整数测试；为 findFaceRange 写 first/last 包含端点和多 Mesh 编号隔离测试。
- [x] 实现接口，并在 Worker 解析 STEP 时把经过验证的 faceRanges 挂到对应 ParsedMesh；STL 不伪造 CAD 面分组。
- [x] 测试 structured clone/Worker 结果保留 faceRanges；TypedArray 传输不变、源数据没有因提取边界或选面被改写。
- [x] 测试边线预算失败仍保留有效 faceRanges；面数据无效仍成功显示实体。沿用现有 parse 超时及三角形上限，不添加宽泛容错吞掉解析错误。
- [x] 为 extractFaceMesh 写准确三角形数量、顶点重映射、周期接缝身份、法线保留及源数组不变测试。

### 任务 3：点击选择与局部高亮

文件：`ModelViewer.tsx`、新 `src/lib/models/modelSelection.ts`、新 `modelSelection.test.ts`、扩展 `modelViewer.test.tsx`。Viewer 负责事件与生命周期；selection 模块只处理命中解析、选择层创建/清除，不另建全局 store。

- [x] 定义 `resolveModelSelection(meshes: readonly ParsedMesh[], meshIndex: number, triangleIndex: number): ModelSelection`，面映射存在时选面，否则选网格；无效命中返回 null。为不同 Mesh、同 Mesh 不同 CAD 面、非法 faceIndex 写测试。
- [x] 建立实体 Mesh 到 meshIndex 的明确映射和 raycast 列表；只在合法单击时执行一次拾取，不在每帧或普通 pointermove 中求交。
- [x] 先测试手势阈值，再实现：轻微抖动可选、超过 4 px 后回原点仍不可选、右拖/滚轮不选、canvas 外释放不选、pointercancel/blur/fullscreen/replace 清理点击候选。保留 Trackball 事件与既有取消处理。
- [x] 测试 pointerup 和 RAF 交错：最后一个移动尚未 update 时也按最新相机命中；取消路径不消费已废弃增量。使用真实 Raycaster 和非对称多面夹具，不仅 mock 高亮状态文字。
- [x] 实现第 5.3 节单选层和清除按钮；点击空白清除，同一面复点不分配新几何。面选中的黄色覆盖范围必须等于该 faceRange，不能只亮一个三角形或整个 Mesh。
- [x] 测试 quality replace/新文件清除选择，主题/边线/resize/全屏/视图改变保留选择；主题切换不还原掉黄色，高亮不会被自己射线选中。
- [x] 测试旧选择层、材质、监听器在替换、清除和卸载时释放；最多一个面高亮层，不能积累每个历史选区。

### 任务 4：真实浏览器与性能验收

文件：`tests/e2e/model-viewer.spec.ts`、按需扩展 `model-fixtures.ts`、`docs/model-preview-validation.md`。

- [x] 使用本地鉴权/API 拦截及真实 Worker/WebGL。增加可预测的“单 Mesh、至少两个 CAD 面”的 STEP 夹具，明确固定相机和点击位置；不同三角形属于同一面时高亮区域相同。
- [x] 基于相机矩阵测量前视固定 100 px 拖动角差；分别验证侧栏展开/收起和全屏，不能只断言“自由视角”。跨越极点后的横向响应继续有效。
- [x] 点击不同曲面、空白、轻微抖动、往返拖拽和右键平移；同时断言选区状态及真实渲染颜色/截图，不能仅检查标签。检查可见背面遮挡和孔内区域，避免整模染色或黄色穿透。
- [x] 外部 `male_5.stp` 标准/精细两档补测；记录本次实际面数和三角数，不将本机数据硬编码为所有文件规则。切精细后清除选择，再点击应正确；不要要求旧 faceId 自动对应新网格。
- [x] 同机器/浏览器/画布/DPR/模型/质量下，各做 3 次 5 秒拖动，记录角度/100px、RAF 帧间隔 P50/P95、>50ms 长帧数、draw calls/triangles 及是否软件渲染。采样前预热，区分“旋转距离不足”和“帧不连续”。
- [x] 有高亮与无高亮对比：高亮最多增加 2 个 draw calls（面填充+边界），拖动期间不重新解析、不生成几何、不触发新 Worker；不因每个 CAD 面创建 Mesh 增加大量绘制。相同环境若 P95 恶化超过 20%，查 profile 再优化；接近计时噪声时重复采样后判断，不用 headless FPS 冒充用户设备结果。
- [x] 性能确有问题再按证据处理：先检查事件/几何重复工作，其次检查像素填充率和边线；无需默认引入 BVH、LOD、自动降精度或更换引擎。点击求交耗时也单独记录，不能为了点击功能把昂贵 raycast 放入拖动循环。
- [x] 连续选择/清除 50 次、质量切换和换文件后，活跃 GPU 资源不单调增长；离页 RAF/Worker/选择资源按现有测试口径释放。重复点击同一面不能持续创建资源。
- [x] 更新验证文档，写清用户可感知结果、命令、测量条件、真实/模拟边界和剩余未验项。

## 7. 验证命令与交付门槛

在 `D:\wire-harness-designer` 执行；实际额外修改的代码文件补入 ESLint。

```powershell
npx eslint src/lib/models/modelView.ts src/lib/models/modelTypes.ts src/lib/models/modelFaces.ts src/lib/models/modelSelection.ts src/lib/models/modelParser.worker.ts src/lib/models/modelEdges.ts src/components/models/ModelViewer.tsx src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelFaces.test.ts src/lib/__tests__/modelSelection.test.ts src/lib/__tests__/modelViewer.test.tsx src/lib/__tests__/modelParser.test.ts src/lib/__tests__/modelEdges.test.ts tests/e2e/model-viewer.spec.ts tests/e2e/model-fixtures.ts --max-warnings=0
npx tsc -b
npm test -- src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelFaces.test.ts src/lib/__tests__/modelSelection.test.ts src/lib/__tests__/modelViewer.test.tsx src/lib/__tests__/modelViewerPage.test.tsx src/lib/__tests__/modelParser.test.ts src/lib/__tests__/modelEdges.test.ts
npm run build
npx playwright test tests/e2e/model-viewer.spec.ts
```

真实样件补测使用现有 `MODEL_PREVIEW_STEP_PATH` 指向本机文件，不提交样件或硬编码个人路径。先 build 再使用 localhost:4173 的生产 preview，确认已有服务使用当前构建。

完成门槛：角速度满足第 4 节量化标准；保留 360° 翻转；STEP 局部面点击高亮、STL 网格降级、点击/拖动区分全部通过；切质量不选错面；无持续资源增长；ESLint 0 错误/0 告警、tsc、局部单测、build、真实页面回归通过。性能有实测记录，未测项目明确写“未验证”。不要求实现嘉立创所有工具。

## 8. 可直接复制给执行 AI

> 请实施 `docs/superpowers/plans/2026-11-05-model-picking-and-interaction-tuning.md`。先用真实指针测试确认当前 Trackball 默认速度导致灵敏度回退，按 CSS 画布短边校准，保留连续翻转。再保留 OCCT CAD 面范围，使用 Raycaster 实现单面黄色高亮，并正确区分点击和拖拽；STL 退化为网格选择。保留已有未提交成果，不修改云端、报价和存储结构，不盲目重做渲染引擎。完成规定验证与性能记录，交付改动、实际测试结果、截图和未覆盖项；未经授权不提交、推送或部署。

## 9. 本轮实施完成记录（2026-11-05）

在现有 dev 工作区按任务 1–4 实施，未提交、推送、部署或真实云端写入。量化指针测试先复现约 14.32° 的回退再通过；完成 CAD 面映射、单面高亮、网格退化、手势/裁剪/资源回归。固定工具栏提示行，避免自由视角文字在拖动中改变画布高度。独立只读审查的开放网格背面材质和相机裁剪拾取两项问题均已 RED→GREEN 修复。

最终：ESLint 0 错误/0 告警，npx tsc -b 通过；npm test 为 127 文件/1,132 项通过；npm run build 通过；生产 preview 的 Playwright 15 项全部通过，male_5/female_5/male_4 均已执行。male_5 标准/精细分别为 5,632/11,228 三角形、各 35 面；各做有无高亮 3×5 秒拖动，高亮增加 2 draw calls，拖动不创建新 buffer/Worker。环境为 headless Chromium/SwiftShader，真实硬件 GPU 与触控仍未验证，未据此宣称用户设备帧率。

详见 [本轮验证记录](../../model-preview-validation.md#2026-11-05cad-面点击高亮与拖拽手感校准)，本机截图及原始指标位于忽略目录 test-results/model-picking-release/。
