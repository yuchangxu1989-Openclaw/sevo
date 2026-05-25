# ADR-002: 阶段生命周期采用有限状态机

状态：已采纳 | 2026-04-19

## 上下文

SEVO 的 8 个阶段 + 2 个门禁需要统一的生命周期管理。阶段可能被跳过、阻断、失败后修复续跑，流程不是简单的线性序列。

## 决策

每个阶段采用 6 态有限状态机：pending → active → passed / failed / blocked / skipped。状态流转规则在 Pipeline Engine 中统一管理，所有阶段共享同一套状态语义。

## 替代方案

| 方案 | 优势 | 放弃原因 |
|------|------|---------|
| 硬编码 if-else 流程 | 实现简单 | 不支持跳过、并行分支、修复续跑，扩展性差 |
| 事件溯源（Event Sourcing） | 完整审计轨迹、时间旅行 | Wave 1 复杂度过高，收益不匹配 |
| 工作流引擎（如 Temporal） | 成熟的长流程编排 | 引入重量级外部依赖，违反零外部依赖约束 |

## 后果

- 统一 6 态语义，所有阶段行为一致，降低理解和维护成本。
- 支持 failed → active 修复续跑，满足 NFR-5.8。
- 支持 pending → skipped 裁剪，满足 Level 0 快速通道需求。
- 并行分支（Test Case Authoring ∥ Contract）通过 Pipeline Orchestrator 同时激活多个阶段的 pending → active 实现。
- 状态机定义可配置化，Wave 2 支持自定义阶段时无需修改核心代码。
