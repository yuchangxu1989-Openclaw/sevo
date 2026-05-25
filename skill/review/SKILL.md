---
name: review
description: "Run the SEVO review stage for independent audit and code review. Use when 用户说审查代码、质量审计、做 review、检查实现，or say review, audit quality, code review."
hooks:
  bootstrap: scripts/inject.ts
---

# ReviewSkill

审查 / run the review stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`review`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
