# 3D 模型自由旋转与平移 Implementation Plan

> **交给执行 AI：**按 `superpowers:executing-plans` 逐项实施，使用下方复选框记录进度。先读项目 AGENTS.md、当前代码和本计划，再修改；本计划不授权提交、推送、部署或真实云端写入。

**Goal：**模型可以连续越过顶部、底部进行自由旋转，横向和纵向拖拽均持续有效，并支持平移、缩放、标准视图和重置。

**Architecture：**将固定上方向的 OrbitControls 替换为项目现有 Three.js 附带的 TrackballControls。保留现有解析、网格质量、边线、存储和页面结构，只调整控件创建、更新循环、相机状态和对应测试。

**Tech Stack：**React 19、TypeScript、Three.js 0.187.0、Vitest/jsdom、Playwright；不新增依赖。

**Spec：**本文件第 2 节为本轮需求规格；承接 `docs/superpowers/plans/2026-11-04-model-preview-quality-improvements.md`，保留已实现能力。

## 1. 审查结论与证据边界

### 1.1 已确认的问题

`src/lib/models/modelView.ts` 的 `createModelOrbitControls()` 使用 OrbitControls。现有代码没有设置水平旋转锁定；依赖默认的水平角范围已是负无穷到正无穷，因此“再放开水平角度”不能解决问题。

OrbitControls 维护固定的相机上方向，并将极角约束在 0 到 π 之间，在极点附近通过 `makeSafe()` 留出约 10⁻⁶ 弧度余量。相机接近上/下轴线时，横向拖动对观察方向的改变极小；纵向也不能自由越过极点。这与“任意方向连续翻转”的目标不一致。

使用当前工厂函数、真实 Three.js 控件和 jsdom 指针事件进行了对照实验：

- 画布 800 × 600，相机位置 `(100, -100, 100)`，上方向 `(0, 0, 1)`，观察目标原点。
- 从画布中心左键向下拖动 120 px，释放，再向右拖动 120 px；每段拆分 10 次移动，并调用 `update()`。
- 当前 OrbitControls：第二段前后观察方向夹角约 **0.0000011758 rad**。
- TrackballControls 候选：同样输入下约 **0.3 rad**，超过本次诊断采用的 0.01 rad 有效变化阈值。
- 正常等轴测、前视和使用 Y-up 的顶视下，当前 OrbitControls 横向旋转有效。

结论是**确认了极点附近观察方向退化和无法连续翻转的问题**，不是确认“任何姿态都不能左右拖动”。极点附近还可能表现为画面绕轴转动，不能把观察方向几乎不变描述为相机绝对静止。

诊断脚本保存在仓库外，可在当前机器复核：

```powershell
node 'C:\Users\Redmi\.codex\visualizations\2026\11\04\01a1a449-4c0c-76a0-89df-98350adce1ac\rotation-diagnostic.cjs' 'D:\wire-harness-designer'
```

该脚本在当前实现不满足阈值时**预期退出码为 1**；这不是现有测试套件失败。脚本中的 CommonJS 弃用提示属于诊断工具加载方式，不代表应用构建告警。正式回归应落入仓库测试，不能依赖此个人路径。

### 1.2 尚未确认的部分

本轮截图为嘉立创参考界面，不能据此证明我们的页面事件没有被遮挡。本轮没有在用户当前部署页面复现完整交互，也没有证明嘉立创内部使用 TrackballControls。

若新加载模型在正常等轴测状态也完全无法横向旋转，需继续检查画布命中元素、pointer 事件、页面遮罩、模型 key 是否变化、组件是否重建。不要将这些尚未复现的可能性写成已确认缺陷。

### 1.3 现有实现应保留

- Worker 中解析 STEP/STL、标准/精细网格、CAD 面边界和特征边线。
- 同一 `modelKey` 切换质量时保持视角，普通 resize 不自动 fit。
- 背景、全屏、标准视图、适配窗口、WebGL 错误恢复及资源释放。
- 原文件保存、哈希和恢复流程。本轮不涉及数据库或存储结构变更。

当前相关 5 个测试文件的 **45 项测试通过**，`npx tsc -b` 通过。现有 Orbit 测试直接调用 `rotateLeft()`，端到端测试以斜向拖拽和“自由视角”文字检查为主，未覆盖关键的极点操作序列；测试通过不等于新需求已经满足。

## 2. 交互规格与验收目标

| 操作 | 目标行为 |
| --- | --- |
| 左键横向/纵向拖动 | 自由旋转，可连续越过上下极点，无固定世界上方向约束 |
| 左键斜向/画布边缘拖动 | 允许 Trackball 自然产生滚转；不强行保持模型竖直 |
| 右键拖动 | 在屏幕平面平移，保持观察方向和相机到目标距离 |
| 滚轮 / 中键拖动 | 缩放，保留合理的最小/最大距离限制 |
| 等轴测、前视、顶视、右视 | 恢复各自明确的方向与 up；随后仍可自由旋转 |
| 重置视角 | 恢复等轴测、模型居中、适配窗口 |
| 适配窗口 | 保留当前观察方向和滚转，将模型重新居中并调整距离 |
| 质量、边线、背景切换 | 同一文件保持相机位置、目标、up、旋转和缩放 |
| 窗口尺寸/全屏变化 | 更新投影及控件屏幕范围，保持观察姿态，不自动重置 |
| 更换文件 | 初始化新模型的等轴测视图，清理旧资源 |

交互提示统一为：**“左键拖动旋转 · 右键拖动平移 · 滚轮缩放”**。旋转与平移是两种操作，不让一次普通左键拖动同时执行两者。

桌面鼠标交互为本轮必验项。保留 Trackball 内置触控能力；若交付宣称支持触屏，必须另行实测单指旋转和双指缩放/平移，不能仅凭库支持作结论。

## 3. 全局约束与重点风险

- 保留工作区已有修改；不重做上一轮方案、不回滚现有网格及页面能力。
- 只提供一种默认自由旋转模式，不增加 Orbit/Trackball 双模式、自研四元数引擎或设置系统。
- 不修改模型坐标、三角网格或导出文件来解决观察交互问题。
- 不通过扩大 `minPolarAngle/maxPolarAngle`、固定每帧 `camera.up` 或持续 `fit()` 伪装修复。
- 遵守项目 React 19 规则；不要把每帧相机值写入 React state。
- 不访问真实云端写入；浏览器回归复用现有本地鉴权/API 拦截。

审查重点与所属任务：

1. 越过极点后纯横向拖动仍有效：任务 1、3。
2. 画布仅发生位置变化而尺寸不变时，拖动坐标仍准确：任务 2、3。
3. 滚转后切质量、全屏、预设视图，不被旧控件增量拉回：任务 2、3。
4. 拖拽中失焦、取消、退出页面后无粘滞和监听器/RAF 泄漏：任务 2、3。
5. 非对称模型确实发生空间姿态变化，不能用对称外观或文字标签判断：任务 1、3。

## 4. 文件范围与接口

| 文件 | 改动职责 |
| --- | --- |
| `src/lib/models/modelView.ts` | 替换控件工厂，保留 `getCameraFit()` |
| `src/components/models/ModelViewer.tsx` | 控件更新循环、标准视图、resize、清理和提示文字 |
| `src/lib/__tests__/modelOrbitControls.test.ts` | 替换为 `modelTrackballControls.test.ts`，使用真实控件和指针事件 |
| `src/lib/__tests__/modelViewer.test.tsx` | 更新控件 mock，验证循环、姿态、重建和清理 |
| `tests/e2e/model-viewer.spec.ts` | 增加纯横/纵向、极点连续旋转和平移回归 |
| `tests/e2e/model-fixtures.ts` | 仅在已有非对称 STL 不足时补充小型非对称夹具 |
| `docs/model-preview-validation.md` | 记录实际命令、结果、浏览器及未覆盖项 |

建议工厂接口（返回类型显式使用 TrackballControls）：

```ts
export function createModelTrackballControls(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
): TrackballControls;
```

工厂只配置新实例，不改写传入相机的 up。旧控件解绑和 dispose 由 Viewer 统一负责。Viewer 现有 `view/fit/replace/display` 接口无需变化。

## 5. 实施任务

### 任务 1：用真实指针回归定义自由旋转，替换控件工厂

- [x] 在现有控件测试中先加入第 1.1 节精确序列，验证当前实现的观察方向变化未达到 0.01 rad，保留失败证据。
- [x] 将测试迁移命名为 `modelTrackballControls.test.ts`。模拟有效画布尺寸、`getBoundingClientRect()`、pointer capture；发出真实 pointerdown/move/up 事件，每次移动执行 `controls.update()`，不 mock 控件算法。
- [x] 实现 `createModelTrackballControls(camera, canvas)`，使用 `three/addons/controls/TrackballControls.js`。显式配置 `staticMoving=true`、`noRotate/noPan/noZoom=false`；左/中/右键分别为 `MOUSE.ROTATE/DOLLY/PAN`。初始采用库默认速度，手感调整必须重跑对应测试。
- [x] 关闭默认 A/S/D 模式快捷键，避免业务输入场景误切模式。当前 `@types/three` 的 `keys` 是三元素元组，可设为 `['', '', '']`；不要直接赋空数组造成类型错误，也不要用 `any` 绕过。
- [x] 用新工厂重跑极点序列，断言方向夹角 `> 0.01`。分别测试纯横向和纯纵向旋转，检查相机、up 和 quaternion 均为有限数值。
- [x] 增加连续旋转测试：小步连续拖动并累计中间姿态变化，覆盖上下半球及完整一圈；不要只比较一圈起点和终点（二者可能相同）。
- [x] 增加平移与缩放测试：右拖使 target、position 同向位移且观察方向不变；滚轮改变距离并受上下限约束。
- [x] 运行 `npm test -- src/lib/__tests__/modelTrackballControls.test.ts`，全部通过后进入 Viewer 集成。

### 任务 2：接入 Viewer 的生命周期与姿态管理

- [x] 先为组件补充会在缺少更新循环时失败的测试：指针事件后运行模拟 RAF，真实或 mock 的 `controls.update()` 被调用；组件销毁后停止调用。
- [x] 替换 Viewer 的工厂引用及 Orbit 类型/mock。每个存活 Viewer 只有一个 scoped RAF，循环调用当前实例 `controls.update()`；通过控件 change 事件渲染，场景/尺寸改变时主动渲染，不必每帧无条件绘制。
- [x] RAF 闭包读取最新控件变量，避免预设视图重建后还更新旧实例。清理时取消 RAF、解绑自身监听器、dispose 控件及现有 GPU 资源；StrictMode 重挂载后不能留下重复循环。
- [x] 先测再实现标准视图和重置：设置指定 position、target、up，清除旧手势增量。采用解绑并重建控件的简单方式处理显式预设/重置，恢复距离限制和 change 监听；构造时的 update 不得误标记为用户旋转。
- [x] 普通自由旋转允许 `camera.up` 连续变化；不在 RAF、resize、质量切换时恢复 Z-up。保持原有 programmatic 标识及自由视角判断，但不要每帧重复 setState。
- [x] 测试自由滚转后的适配窗口：模型中心回到 target，方向与滚转保持，距离按包围盒调整；普通 resize 仅改 aspect/projection 和 renderer 尺寸。
- [x] 在有效尺寸更新后调用 `controls.handleResize()`。另在画布 pointerdown 的捕获阶段调用它，保证库读取首个指针坐标前获得最新位置；这样覆盖页面滚动、布局位移、全屏，不仅依赖 ResizeObserver。
- [x] 用位置变化但宽高不变的测试验证 `screen.left/top` 更新；测试零尺寸容器恢复显示后不会出现 NaN 或突跳。
- [x] 为 `pointercancel`、`lostpointercapture`、窗口 blur 和拖拽中 fullscreenchange 写测试，验证下一次普通拖拽正常且松手后不继续移动。先验证库原生行为，仅为真实缺口补应用层处理；需要取消活动手势时可保留当前完整姿态后重建控件，不直接改库私有字段。
- [x] 对同一文件的质量、边线、背景、全屏/resize 保持 position、target、up、quaternion、zoom；aspect 可以变化。新文件仍重新初始化。对应测试先保留带滚转的非默认姿态再执行操作，不能只测初始等轴测。
- [x] 更新交互提示；验证右键只在画布区域抑制上下文菜单，不干扰页面其他区域。
- [x] 运行控件与 Viewer 测试，确认资源清理、视角标签及上一轮能力通过。

### 任务 3：真实页面回归与交付记录

- [x] 在现有 Playwright 测试中复用本地 API 拦截、非对称 STL 和 `cameraMatrix(page)` 采样，不依赖真实登录或外部上传。
- [x] 增加 `free rotation remains effective after crossing poles`：分段执行纯纵向旋转越过上下区域，并在多个中间姿态执行纯横向拖动，断言渲染矩阵旋转部分产生实质变化；不能只断言“自由视角”文字出现。
- [x] 增加 `pan and zoom preserve orientation`：右键平移导致矩阵平移部分变化，旋转部分保持；滚轮有效。控件单元测试负责精确 target/距离断言，页面测试验证真实事件链路。
- [x] 增加 `scrolled and fullscreen canvas remains interactive`：改变画布在页面的位置、进出全屏，重复横向/纵向拖动。每次从实际 canvas bounding box 计算落点，避免工具栏和遮罩区域。
- [x] 扩展现有质量/resize 保姿测试，使用带滚转的姿态；同一网格的矩阵按数值误差比较，质量切换沿用现有 Float32 中心误差容差，不能要求投影矩阵完全一致。
- [x] 检查清理：重复换文件、进出页面、WebGL 重建后，无重复事件、RAF 或资源增长。记录浏览器 pageerror，不能仅验证画布存在。
- [x] 本机存在时，用 `female_5.stp` 和 `male_4.stp` 补充视觉检查，重点看连接器孔位、缺口、顶部/底部的切换；对称外形不能作为“没旋转”的唯一判断。保留截图或短录屏作为验收证据，不把用户样件提交进仓库。
- [x] 更新验证记录，区分单元测试、真实 WebGL 本地页面、真实云端测试；未执行的项目明确写“未验证”。

## 6. 验证命令与完成标准

在 `D:\wire-harness-designer` 执行。若实际额外修改代码文件，将其补入 ESLint 列表；旧 Orbit 测试已替换后使用新文件名。

```powershell
npx eslint src/lib/models/modelView.ts src/components/models/ModelViewer.tsx src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelViewer.test.tsx tests/e2e/model-viewer.spec.ts --max-warnings=0
npx tsc -b
npm test -- src/lib/__tests__/modelTrackballControls.test.ts src/lib/__tests__/modelViewer.test.tsx src/lib/__tests__/modelViewerPage.test.tsx src/lib/__tests__/modelEdges.test.ts src/lib/__tests__/modelParser.test.ts
npm run build
npx playwright test tests/e2e/model-viewer.spec.ts
```

可选真实 STEP 样件补测（仅本地，复用既有拦截）：

```powershell
$env:MODEL_PREVIEW_STEP_PATH = 'D:\xwechat_files\wxid_x48e6n5jrdea22_058f\msg\file\2026-11\female_5.stp'
npx playwright test tests/e2e/model-viewer.spec.ts
Remove-Item Env:MODEL_PREVIEW_STEP_PATH
```

Playwright 使用当前配置的 localhost:4173；先完成 build，避免测试旧构建。若已有服务占用该地址，确认服务属于本项目且提供本次构建，不盲目终止其他服务。

完成必须同时满足：

- [x] 极点后的横向真实指针回归通过，连续翻转可跨越上下区域。
- [x] 左键旋转、右键平移、滚轮缩放与提示一致。
- [x] 标准视图/重置正常，适配窗口保留当前方向和滚转。
- [x] 质量/主题/全屏/布局变化不意外重置姿态，变化后仍可正常拖动。
- [x] 取消手势和卸载不遗留拖动状态、监听器或 RAF。
- [x] ESLint 0 错误 0 告警、类型检查、受影响单测、构建及上述页面回归通过；如环境阻塞，明确报告阻塞项，不声称全部完成。

## 7. 本轮之后的优先级

**先完成本计划的交互修复与回归。**目前不需要重做上传、解析、边线和网格精度，也不需要引入嘉立创的私有 F3D 格式。

方向立方体、更多标准视角、交互速度配置可在自由旋转实测后按需要追加，不作为本轮门槛。真实云端保存/恢复和权限的未覆盖验收应单独跟踪，不以本轮本地控件测试替代，也不扩展本次修改范围。

## 8. 可复制的执行指令

> 请实施 `docs/superpowers/plans/2026-11-05-model-free-rotation-controls.md`。先核对现有代码及未提交修改，保留上一轮成果；用真实指针事件复现极点问题，再将 OrbitControls 替换为 TrackballControls，完成更新循环、标准视图、滚转保留、resize/fullscreen 与取消手势的处理。不要修改解析/存储架构，不新增双控件模式。完成局部 ESLint、tsc、受影响单测、build 和真实页面交互回归，更新验证记录。未授权不得提交、推送、部署或向真实云端写入。最终说明改动、实际验证结果、未覆盖项和剩余风险。

实施记录（2026-11-05）：任务1–3本地实现及验收完成；真实指针RED→GREEN，相关61项、全量1095项、真实WebGL页面12项通过；female_5/male_4/male_5本地解析未跳过。截图和限制见 docs/model-preview-validation.md 的自由旋转增量章节。触屏和真实云端未验证，未执行提交推送、发布或数据库写入。
