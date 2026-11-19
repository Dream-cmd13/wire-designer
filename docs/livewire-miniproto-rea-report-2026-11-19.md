# Livewire CAD 与 MiniProto REA 调研报告

调研日期为 2026 年 11 月 19 日。本文汇总公开页面、编辑器实测、实际下载文件及 REA 6.7.0 对浏览器已加载脚本的静态分析。

## 核心结论

| 对比项 | Livewire CAD | MiniProto |
| --- | --- | --- |
| 编辑方式 | 同一设计包含原理图与线束两份文档，可在编辑器内切换 | 访客可在画布上配置连接器、针脚和物料，并查看接线表 |
| 本轮核验的产出 | DEMO 的 From-To CSV，包含 50 条 `Routed` 记录 | 现有草稿的逐孔端子、锁片、线材用量及阶梯试算 |
| 确认的计算行为 | 脚本显示自动布线和自动成束请求由服务端处理 | 前端按业务配置计算独立导线的 BOM 用量，成品估价由服务端返回 |

## Livewire CAD

- **项目与文档。** 登录后打开 DEMO，从 `Harness` 切换到 `Schematic`。两视图共享 `taskId`，各自使用不同的文档 ID 和 `module`。两视图加载同一个编辑器包 `main.f59364e24f42eae50200.js`，原理图画布的根元素为 SVG。脚本包含跨视图的元件依赖检查。
- **自动布线与成束。** 脚本显示，原理图按信号发起自动布线。`Auto Bundle` 会先检查是否有导线及足够的连接器或端子，随后调用服务端并根据响应更新画布节点、连接器及线束段。已有线束段时，界面代码会要求确认替换，并提示已有覆盖层和设定长度会丢失。
- **工程输出。** 实际下载的 From-To CSV 有 50 条记录，状态均为 `Routed`。列为 `From Connector`、`From Pin`、`To Connector`、`To Pin`、`Status`、`Description`。导出菜单还提供 BOM、连接器表、裁线表、整张或按图框导出的 PDF，以及 HRX 入口。
- **公开资料。** 官网描述了从 Excel `from-to` 表导入、自然语言选件、设计规则检查，以及原理图变更自动传递至线束。本轮只在登录后的 DEMO 中执行了视图切换和 From-To 导出。 [Livewire 应用](https://livewirecad.ai/) · [Livewire 产品页](https://www.livewirecad.com/)

## MiniProto

- **选型与校验。** 在空白访客会话中搜索并选中 `DT06-3S`，画布上的 `J1` 显示三个引脚。校验面板提示缺少 `W3S` 锁片，并提供补选入口。此时仍缺少接线，加入购物车入口保持禁用，页面已显示试算价。
- **接线与 BOM。** 另一个已有访客草稿中，`J1 → J2` 有三条 18 AWG GXL 独立导线，长度为 500、1000、1000 mm，另有一条接到 `CA1` 的电缆芯线。BOM 列出了连接器、逐孔端子及 `W3S`、`W4P` 锁片。此草稿的校验面板显示 `No design errors`。
- **导线用量。** 公开配置的 `wireWasteFactorPercent` 为 `15`。前端计算独立导线的 BOM 用量时，使用 `长度（mm）÷ 304.8 × (1 + 损耗百分比 ÷ 100)`。现场的 500 mm → 1.89 ft、1000 mm → 3.77 ft 与此公式一致。 [公开业务配置](https://www.miniproto.com/api/public/business-variables)
- **成品试算。** 前端汇总材料与工序数据，向服务端请求估价。已有草稿在标准交期下显示 1 件 `$117.68`，10 件总计 `$414.95`，其中可变装配费用为 `$352.10`，设置费为 `$62.85`。金额适用于本次查看的具体草稿和配置。 [MiniProto 配置器](https://www.miniproto.com/configuratorV2)
- **公开 API。** JSON Schema 用连接器、接续点和导线描述线束。导线端点引用连接器针脚或接续点。OpenAPI 分别定义了可制造性校验、签名价格快照以及需认证的报价草稿或人工询价。本轮核对了文档中的契约。 [JSON Schema](https://www.miniproto.com/docs/api/schema.json) · [OpenAPI](https://www.miniproto.com/docs/api/openapi.yaml)

## 待验证项

| 产品 | 待验证内容 |
| --- | --- |
| Livewire CAD | 编辑原理图后线束文档的实际同步与冲突处理，自动布线和成束的服务端算法，以及本轮菜单中其余格式的下载内容 |
| MiniProto | 从空白画布完成接线的全过程，仅修改一条导线长度后的价格变化，以及登录后的云保存和采购流程 |

## 证据索引

REA 证据与源文件字节索引保存在执行机器的 `%TEMP%\rea-harness-31915aee`。Livewire 整包分析达到超时限制后，改为分析五段关键函数。MiniProto 也按五段关键函数进行静态分析。两组取样均通过语法解析，且已逐段核对原始脚本字节范围。

| 证据 | 本机文件 | REA Evidence ID |
| --- | --- | --- |
| Livewire 编辑器关键函数 | `livewire.editor.features.static.json` | `ev_4f8236d45f6e98127d9c1fc93af84de1b78e769e8ed42bdd4966a22b7591945b` |
| Livewire 函数源字节索引 | `livewire.editor.feature-provenance.json` | — |
| MiniProto 访客选型场景 | `miniproto.part-retry.json` | `ev_0209814a5c770051821e4c21cebca821497506251e720ff8eef0c4c13548b685` |
| MiniProto 关键函数 | `miniproto.features.static.json` | `ev_aa754445d4273e4314e15042b18c9aa85f0c020b936c4f74891e3ce7f338f1a7` |
| MiniProto 函数源字节索引 | `miniproto.feature-provenance.json` | — |

Livewire 的实际下载位于 `%USERPROFILE%\Downloads\demo_task_import_from_to_2026-11-19.csv`。此前的操作过程见 [早期调研记录](livewire-miniproto-research-context-2026-11-16.md) 和 [MiniProto 操作手册](miniproto-operation-manual-2026-11-17.md)。
