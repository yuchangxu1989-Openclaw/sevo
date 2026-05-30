---
name: gate
description: "Evaluate SEVO gate results and aggregate review conclusions. Use when 用户说过门禁、检查能不能进下一步、评审结果怎么样，or say gate check, can we proceed, review verdict."
hooks:
  bootstrap: scripts/inject.ts
---

# GateSkill

门禁检查 / evaluate pipeline gates。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`review`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
