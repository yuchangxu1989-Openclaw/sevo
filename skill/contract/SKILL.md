---
name: contract
description: "Run the SEVO contract stage for architecture design and work package definition. Use when 用户说做架构设计、拆分工作包、出技术方案、写 contract，or say plan architecture, write contract, define work packages."
hooks:
  bootstrap: scripts/inject.ts
---

# ContractSkill

架构契约 / run the contract stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`plan`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
