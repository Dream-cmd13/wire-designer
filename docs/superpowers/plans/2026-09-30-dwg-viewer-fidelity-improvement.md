# DWG 查看器显示还原完善方案

> 执行说明：本文件为方案与实施记录；功能已按任务实施并由门禁与验收证据复核（见文末“八、实施状态与验收入口”）。不授权提交、推送或上传图纸资源。

**目标：** 修复已确认的图案填充缺失，建立可复核的显示验收；再改善文字排版、线宽和外部图片提示。

**实现方式：** 保留现有 LibreDWG → 标准化图元 → Canvas 链路，优先局部修复。屏幕预览与导出继续复用渲染器，不引入新的 CAD 引擎、服务端转换服务或通用绘图框架。

**技术栈：** React 19、TypeScript、Canvas 2D、`@mlightcad/libredwg-web`、Vite、Vitest。

**需求依据：** 本轮原文件与实际页面对照，以及用户要求生成完善方案。第一阶段实施规格直接写在本文；后续改善项先核实原因和收益，不将待确认方案伪装成已确定实现。

**状态：** 已实施（2026-09-30，含第二轮审查修复）。任务 1、2 完成；任务 3、4 完成诊断与最小修复，剩余字体/排版差异记录在案；任务 5 仅完成缺失提示，图片关联为条件性需求未实施。

## 一、证据与问题边界

核查日期：2026-09-30。基线提交：`a683796e2dac130c28c90f3ed4e1bd2c1efb6990`。

实际通过查看器“打开 DWG 文件”逐一加载仓库的 9 个原始文件，并对 `M12A04-07-093-1-10-500.dwg` 与同名 PDF 进行视觉对照。不是用独立绘图脚本冒充应用截图。

| 项目 | 已确认事实 | 处理决定 |
| --- | --- | --- |
| 图案填充 | 04-093 的锁紧环交叉滚花缺失，全部图层显示及本地原文件均复现 | 第一阶段必须修复 |
| 同类渲染问题 | 04-093、05-093 各 4 个、08-093 共 5 个图案填充区域，当前渲染器生成的线段与各自区域包围盒相交数均为 0 | 全部纳入回归；不能把 13 个区域都称为锁紧环 |
| 文字换行 | 04-093 线材规格在 PDF 第二行以“棕、白、蓝、黑”开始，查看器将“棕、”放在上一行 | 第二阶段核查并改善；此处未确认文字丢失 |
| 公章 | PDF 有实际图片，DWG 引用外部 JPG，查看器显示框和路径 | 明确资源缺失；关联图片功能独立评估 |
| 线宽 | 屏幕使用约 1 CSS px 线宽，密集螺纹与线圈缩小时偏黑；导出另用 3 画布像素线宽 | 第二阶段比较不同缩放及导出结果后调整 |
| 解析覆盖 | 8 个 M12 文件顶层 skipped 为空；可达块定义各有 9 个 Defpoints POINT；示例图跳过一个空 MTEXT | 不将此结果等同于全部图元正确显示 |
| 自动测试 | `npm test -- tests/dwgViewer.test.ts` 为 57/57 通过，但未发现实际填充缺失 | 补充可见几何验证 |

本地证据目录（不依赖其永久存在）：

```text
C:/Users/Redmi/.codex/visualizations/2026/09/30/01a0efa3-345e-7de2-a77d-4d6d5331f49e/dwg-comparison/
```

其中 `report.md`、`connector-comparison.png`、`bom-comparison.png`、`browser-observations.json`、`entity-audit.json`、`hatch-probe-results.json` 分别保留结论、对照图、页面记录和诊断数据。正式回归应将最小必要的匿名几何数据写入测试，不能依赖该机器的绝对路径。

只有 04-093 有独立 PDF 参照。其余图纸只能验证已知实体行为和页面正常显示，不能宣称已与 AutoCAD 原始出图全面一致。本方案不沿用旧报告的 344px/4138px 数值。

## 二、全局约束

- 遵循现有目录和代码风格，不为本次修复拆分大量模块。
- 不变更数据库、存储桶权限、登录逻辑或业务数据；不设计兼容层、双轨或迁移脚本。
- 不承诺任意 DWG、SHX 字体、CTB/STB 打印样式的完整兼容。
- 不按文件名、图号、实体 handle 或某段业务文字硬编码绘图结果。
- 保留当前单色模式；颜色和原生 CAD 字体精确复刻不纳入必要修复。
- 修改代码后执行受影响文件 ESLint（零错误、零告警）、`npx tsc -b` 和受影响测试集。
- React 状态更新遵循项目规则，不在 effect 中同步无条件 setState；DOM 操作使用标准 API。
- 仅用户明确要求时提交和推送，精准控制提交范围。

## 三、重点审查场景

| 场景 | 预期行为 | 对应任务 |
| --- | --- | --- |
| 图案基点距离实体很远、世界坐标整体平移 | 填充位置和密度不变，不因有限线段长度消失 | 任务 1 |
| 图案负间距、旋转、多个边界和孔洞 | 正确重复并按 evenodd 裁剪，不填进孔洞 | 任务 1 |
| 虚线图案沿线移动起点 | 修复可见范围时保持虚线相位，不改变图案形态 | 任务 1 |
| 中英文混排、显式换行、窄框和旋转文字 | 内容不丢失、不越框，预览与导出布局一致 | 任务 3 |
| 高 DPI、缩放、隐藏图层、缺失图片 | 线条保持可辨识；图层及资源状态反映真实结果 | 任务 2、4、5 |

## 四、文件影响范围

| 文件 | 责任及修改条件 |
| --- | --- |
| `src/lib/dwg/renderDwg.ts` | 必改：图案线段范围和裁剪；文字与线宽变更按后续诊断结果实施 |
| `tests/dwgViewer.test.ts` | 必改：填充回归、坐标不变性和实际样本验证 |
| `src/lib/dwg/parseDwg.ts` | 仅文字或资源结构确需调整时修改；不为填充位置问题重写解析器 |
| `src/lib/dwg/textMetrics.ts`、`mtextFormat.ts` | 文字度量与格式的相关入口，先核查再决定修改 |
| `src/lib/dwg/dwgTypes.ts` | 只有确认需要保留额外文字/图片元数据时修改 |
| `src/pages/DwgViewerPage.tsx` | 线宽选项或资源提示需要 UI 时修改 |
| `src/lib/dwg/dwgExport.ts` | 检查预览与导出的共享行为；必要时调整导出线宽 |
| `src/lib/__tests__/dwgViewerUi.test.ts` | UI 行为确有改变时同步契约测试，不替代真实页面验证 |

## 五、实施任务

### 任务 1：修复图案填充线段不覆盖实体（必须）

**文件：** `renderDwg.ts`、`tests/dwgViewer.test.ts`。

**接口：** 保持 `renderDwgToCanvas(context, drawing, options): void` 和内部 `strokeHatchPattern(context, entity, color): void`；消费现有 `entity.pattern`、`entity.paths`、`entity.bounds`，无需新增页面状态。

已定位原因：当前按法向投影确定重复线编号，却以 `base + k * offset` 为短线段中心，只向两侧延伸区域对角线长度。图案基点沿线方向远离区域时，整条有限线段在裁剪区域之外。

- [x] 增加失败测试：远离原点的矩形填充区域，图案基点沿切向远离区域。调用真实渲染入口，断言区域内部存在预期方向的图案线段，而非只断言 `stroke` 被调用或 `pattern.length > 0`。（`covers the region when the pattern base is far away along the line direction`）
- [x] 运行 `npm test -- tests/dwgViewer.test.ts`，确认新用例在修改前失败且旧用例仍通过。（修复前 5 个新增用例失败，修复后全通过）
- [x] 对每一条重复直线 `p(k) = base + k * offset`，把区域四角相对 `p(k)` 投影到单位方向 `d`：`t = dot(corner - p(k), d)`；用最小/最大投影值确定线段起止范围，保留原有边界裁剪。（`renderDwg.ts` `strokeHatchPattern`）
- [x] 连续图案可直接使用投影端点；虚线图案须以原基点为相位参照。按完整 dash 周期移动起点，或用经过验证的 `lineDashOffset` 补偿，不能任意平移起点而改变虚线相位。（按整周期回退起点，`anchors dash phase...`；奇数长度数组周期按 Canvas 重复规则翻倍，`repeats odd-length dash arrays...`）
- [x] 保留有限数值检查和现有最多 2048 条重复线保护；异常密度不要直接取消保护而卡死页面。
- [x] 增加平移不变性测试：区域与基点同时平移 `(100000, -100000)` 后，相对区域的交点应在浮点容差内一致（建议 `1e-6` 世界单位）。（`keeps hatch intersection geometry translation-invariant`）
- [x] 覆盖 0°、45°、90°、负间距、双向交叉图案及非空 dash；对有孔洞的区域检查真实画布裁剪结果，不能仅用包围盒相交代替。（`handles rotated, negative-spacing...`；孔洞真实画布与导出的暗像素验证见 `output/dwg-comparison` 第 11.3 节）
- [x] 从已确认缺陷提取最小合成夹具，保证无本地 DWG 文件的测试环境也能复现问题。实际文件存在时，再验证三张 093 中已发现的 13 个区域。（13 个区域中 12 个恢复覆盖，剩余 1 个为区域小于图案间距的合法空填充）

**完成条件：** 远基点填充回归通过，04-093 锁紧环交叉滚花在实际页面和导出中恢复；图层、缩放、孔洞与虚线相位无回归。包围盒相交只能作为必要条件，不作为最终视觉一致证明。

### 任务 2：保留可复核的第一阶段验收（必须）

**文件：** 复用现有测试；运行证据放在 `output/dwg-comparison/`，不自动提交大体积截图或原图。

**接口：** 消费任务 1 的真实页面、同一原始 DWG 和 PDF；不创建独立替代渲染器作为最终证据。

- [x] 记录提交号、输入文件 SHA256、浏览器视口、DPR、背景色、图层状态、缩放比例和所用字体。（`output/dwg-comparison/raw/inputs.json` 等）
- [x] 用“打开 DWG 文件”直接加载 04-093 原文件，分别截取全图、锁紧环、明细表、公章区域；同时保存导出 PNG/PDF，区分实屏与导出来源。（`app/`、`export/`、`lockring-3way-4x.png`、`bom-3way.png`、`stamp-3way.png`）
- [x] 原 PDF 按明确分辨率栅格化，在相同图纸区域对照；几何对齐仅使用平移、旋转和等比缩放，不用透视或非等比拉伸吸收比例错误。（200dpi；`estimateAffinePartial2D`）
- [x] 若做像素比较，固定图纸宽度 2400px，报告阈值、3px 距离容差、双向差异及差异区域图；该值只用于定位，不直接当作工程尺寸精度。（`comparison-*-metrics.json`）
- [x] 文字、图片与几何分别检查；记录所有遮罩区域，不能用遮罩掩盖邻近真实线条。修复前的锁紧环差异必须能被比较流程识别。（修复前锁紧环 missing 461px → 修复后 0px）
- [x] 全部 9 个本地文件重新加载，检查非空画面、图层切换、缩放与适应窗口；输出逐文件“已验证/有差异/无独立参照”状态。（`report.md` 第 7、11.4 节）

**完成条件：** 报告链接到原始截图、参数和测试结果；不再出现“解析 100% 即显示 100%”或“只对一张 PDF 就证明九张完全一致”的表述。

### 任务 3：完善 MTEXT 排版（第二阶段）

**文件：** `parseDwg.ts`、`textMetrics.ts`、`mtextFormat.ts`、`renderDwg.ts` 及 `tests/dwgViewer.test.ts`，只修改诊断涉及的部分。

**接口：** 核查当前 `wrapMTextLines(lines, width, height): string[]`、`textWidthOf(line, height): number` 与渲染时 `measureText` 的一致性。以原始内容和参考宽度作为依据，不针对“棕、”调整常量。

- [x] 提取线材规格的原始 MTEXT 内容、显式换行、内联格式、字高、参考宽度及方向，判定差异来自格式丢失、估算度量还是字体回退。（原文无显式换行；实测 SimSun 度量与估算相差约 2%）
- [x] 若丢失了原始显式换行或格式，先建立对应失败测试，再做最小修复；显式段落边界不能被自动折行合并。（未发现显式换行丢失，无需修改）
- [x] 若问题仅来自字体差异，先固定已安装字体并记录度量结果；不承诺替代字体能够逐字复现 AutoCAD。不要只为一个样本修改全局字宽系数。（实测 `° ± × ÷ · — ‰` 为全角并修正分类；`棕、` 折行与行距差异保留说明）
- [x] 若需要真实字体度量参与布局，应让预览与导出使用同一套布局计算，字体可用后计算，并同步更新文字包围盒；不要在 render 阶段私自换行而留下旧包围盒。（`measureText` 注入 + `geometryBounds` 同度量，第二轮修复）
- [x] 覆盖显式换行、英文单词、数值单位、中文标点、窄框、旋转和块缩放，验证原始内容无丢失、无意外重复。（`mtext-wrap`、`mtext-long-word`、`text-fit` 等用例 + 9 文件页面复核）
- [x] 复核 04-093 明细表和技术要求，其余 8 张图纸检查溢出、重叠及换行回归。（`bom-3way.png`、`text10-3way.png` 与逐文件截图）

**完成条件：** 原始显式格式得到保留，文字不溢出/截断，预览与导出布局一致。自动换行能否与 PDF 完全一致需基于字体条件说明，不能把版式变化统称为字体无关差异。

### 任务 4：改善密集线条可读性（第二阶段）

**文件：** `renderDwg.ts`、`DwgViewerPage.tsx`、`dwgExport.ts`，以及相应测试。

**接口：** 优先使用已有 `DwgRenderOptions.lineWidth`，由屏幕和导出调用方传入各自线宽；本阶段不新增完整 CAD 打印样式系统。

- [x] 保存现有 1 CSS px 屏幕、3 画布像素导出的基线截图，固定同一图纸范围后比较。（`linewidth-*.png`）
- [x] 在屏幕试验 0.75 与 1 CSS px，在导出试验 2 与 3 画布像素；检查 DPR 1/2 和适应窗口、200%、400% 下的螺纹、细表格线、尺寸箭头与填充。（1.0/0.75、100%/400% 已完成；导出 3px 保留，未做 2px 对照）
- [x] 仅在密集区域可辨识性提高且细线无明显丢失时调整默认值，否则保留现值并记录限制；不把更细线宽当成缺失填充的修复。（保留屏幕 1 CSS px；0.75 在 100% 下墨迹减少约 25%，有细线变灰风险）
- [x] 增加屏幕线宽随 DPR 正确换算、导出不依赖当前视口缩放的验证；检查白底与黑底。（设备像素→世界单位单测；DPR1 + 黑底抽查见 `raw/visual-coverage.json`；黑底导出 `export/093-dark_DWG.png`）

**完成条件：** 所选参数有前后对照依据，细节不会因过细而消失，导出与屏幕参数职责清晰。原始实体线宽及 CTB/STB 支持另立需求。

### 任务 5：明确外部图片状态（提示优先，关联功能可选）

**文件：** 需要提示时修改 `dwgTypes.ts`、`parseDwg.ts`、`DwgViewerPage.tsx` 及相关测试；真正关联图片再涉及渲染和导出。

- [x] 将 IMAGE 外部资源缺失作为明确状态呈现，文案面向用户，例如“此图纸引用了外部图片，当前仅显示占位框”。不要显示为图纸已经完整还原。（`externalImages` + 工具栏提示“N 张外部图片未加载（仅显示占位框）”）
- [x] 若业务接受占位，保留框和必要文件名即可；提示不会被误当作原始图纸内容写入正式出图。
- [ ] 若业务要求完整公章，取得对应原始图片后再实施“选择本地图片并关联引用”的独立功能。只在当前会话内关联，不默认上传服务器或永久保存。（条件性需求，未实施）
- [ ] 关联功能按原 IMAGE 的位置、U/V 方向、像素尺寸绘制，验证旋转、缩放、图层隐藏、透明度以及预览/导出一致；释放对象 URL，限制异常图片尺寸，加载失败保留明确占位。（随图片关联功能，未实施）

**完成条件：** 缺失状态清晰；没有原始 JPG 时不能宣称公章恢复。关联功能不阻塞必要的填充修复。

## 六、验证门禁与交付顺序

建议先完成任务 1、2 并交付可验收结果，再实施任务 3、4；任务 5 的图片关联按实际资源与交付要求决定。不将所有改善绑定成一次大改。

PowerShell 命令示例，ESLint 路径应限定为本次实际改动的代码文件：

```powershell
# 第一阶段代码检查
npx eslint src/lib/dwg/renderDwg.ts tests/dwgViewer.test.ts --max-warnings 0
npx tsc -b
npm test -- tests/dwgViewer.test.ts

# 若修改了页面交互，增加对应测试
npm test -- src/lib/__tests__/dwgViewerUi.test.ts

# 第二阶段跨解析/渲染/导出修改，或局部验证不足时
npm test
npm run build
```

- [x] 静态检查和类型检查零错误、零告警；受影响测试全部通过。
- [x] 新增填充回归明确在修复前失败、修复后通过。（5 个用例修复前失败）
- [x] 三张 093 的已知缺失填充不再被静默裁掉，04-093 实屏和导出与 PDF 细节对照完成。（锁紧环 missing 461px → 0px）
- [x] 9 个文件页面回归完成，差异和无参照项逐项记录。（见 `output/dwg-comparison/report.md` 第 7、11.4 节）
- [x] 原解析库的 `Open dwg file with error code: 4` 输出保留并注明；若影响验证，查明含义再判断，不擅自静默屏蔽。
- [x] 不宣称未验证的全图精确一致；不将截图放大后的线宽差异当作精密测量。
- [x] 交付说明包含实际修改、执行命令、结果、未覆盖项和剩余限制。

## 七、本方案交付范围

本方案已实施，交付物为代码修复、回归测试、验收证据与限制说明；不包含提交/推送、图纸资源上传，以及图片关联功能（条件性需求）。

## 八、实施状态与验收入口

**代码与测试（2026-09-30）**

| 内容 | 位置 |
| --- | --- |
| 填充线段覆盖与虚线相位 | `src/lib/dwg/renderDwg.ts`（`strokeHatchPattern`），含奇数虚线段周期按 Canvas 重复规则修正 |
| 真实文字度量：折行、FIT/ALIGNED、包围盒 | `src/lib/dwg/parseDwg.ts`（`measureText` 选项、`geometryBounds`）、`src/pages/DwgViewerPage.tsx`（`measureDwgText`）、`src/lib/dwg/textMetrics.ts`（全角符号分类） |
| 外部图片缺失提示 | `src/lib/dwg/dwgTypes.ts`（`externalImages`）、`src/pages/DwgViewerPage.tsx` |
| 回归测试 | `tests/dwgViewer.test.ts`（新增：远基点、平移不变性、虚线相位、奇数虚线周期、0/45/90/负间距/交叉、孔洞描边、FIT 度量包围盒、中段视口不剔除、线宽换算）；`src/lib/__tests__/dwgViewerUi.test.ts`（度量注入与图片提示契约） |

**验收证据（`output/dwg-comparison/`，已被 .gitignore 忽略，不入库）**

- `report.md`：汇总报告（含第二轮修复与限制说明）。
- `raw/inputs.json`：九文件 SHA256、视口/DPR/缩放/图层等运行参数。
- `comparison-pre-*`、`comparison-post-*`：与 04-093 PDF 的相似变换对齐、遮罩记录、双向差异与指标（锁紧环 missing 461px → 0px）。
- `app/`、`export/`、`lockring-3way-4x.png`、`bom-3way.png`、`stamp-3way.png`：实屏、导出与局部对照。
- `raw/hole-canvas.json`、`raw/hole-export.json`、`export/hole-fixture_DWG.png|pdf`：孔洞在真实画布与导出中的留白验证。
- `raw/visual-coverage.json`、`export/093-dark_DWG.png`：DPR1 与黑底抽查（画布后备尺寸=CSS 尺寸；黑底墨色为白；导出背景 `#111827`）。

**验证命令**

```powershell
npx eslint src/lib/dwg/parseDwg.ts src/lib/dwg/renderDwg.ts src/lib/dwg/textMetrics.ts src/lib/dwg/dwgTypes.ts src/pages/DwgViewerPage.tsx tests/dwgViewer.test.ts src/lib/__tests__/dwgViewerUi.test.ts --max-warnings 0
npx tsc -b
npm test
npm run build
```

结果：ESLint 0 错误 0 告警；类型检查通过；96 个测试文件 775 个用例全部通过；生产构建通过。

**保留限制（不宣称完全一致）**

- 除 04-093 外没有 AutoCAD 原始出图可对照，其余 8 张仅验证已知实体行为与页面显示。
- 文字排版仍存在字体度量差异：线材规格 `棕、` 折行位置、技术要求行距/末两行位置；不承诺替代字体逐字复现 AutoCAD。
- 公章为外部参照图片缺失，当前仅显示占位框与路径；完整公章需先取得原始图片并实施关联功能。
- 颜色、SHX 字体、CTB/STB 打印样式与原始实体线宽不在本轮范围。
- 视觉场景抽查为 DPR1/黑底单文件，其余仍以 DPR2/白底为准；像素差异只用于定位显示问题，不当作工程尺寸精度。
