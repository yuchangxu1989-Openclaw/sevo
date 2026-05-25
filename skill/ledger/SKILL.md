---
name: ledger
description: "Record and query SEVO delivery ledger entries. Use when 用户说生成交付记录、查看账本、证据链，or say delivery ledger, evidence chain, record release."
hooks:
  bootstrap: scripts/inject.ts
---

# LedgerSkill

账本记录 / record pipeline ledgers。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`review`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
