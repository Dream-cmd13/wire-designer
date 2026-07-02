# Project Memory - wire-harness-designer

## 项目概述
线束设计器（wire-harness-designer），React + TypeScript + Vite + @xyflow/react + Zustand + Tailwind CSS v4。

## 数据模型（v3, 2026-07-02 重构后）
三类业务对象：**连接器**（ConnectorInstance）、**线材**（CanvasWireMaterial）、**保护套**（ProtectiveSleeve）。
- PIN/颜色/SIG 归属于线材的 `circuits: MaterialCircuit[]`（接线明细）
- 短接存放在连接器实例的 `jumpers: ConnectorJumper[]`
- 不存在独立的 Wire / Connection / WireBundle 对象
- HarnessConfig.schemaVersion = 3

## 关键约定
- 连接器有效侧锁定：首次连接（材料或短接）后锁定左/右侧，另一侧 Handle 不渲染
- 线材端点可单端保存，颜色/SIG 立即显示
- 同一线材端点可连接同一连接器同侧多个 PIN（创建多条 MaterialCircuit）
- 短接也锁定有效侧
- 同一 PIN 不允许重复连接完全相同的线材端点
- 护套线 UL 号：UL2464 / UL20276 / 无
- 波纹管显示材质：`getProtectiveSleeveDisplayName()`
- 无需旧数据迁移

## 技术栈版本
- TypeScript ~6.0.2, Vite ^8.0.12, React ^19.2.6, @xyflow/react ^12.11.0, Zustand ^5.0.14
- 构建命令：`npm run build`（tsc -b && vite build）
- 无自动化测试框架
