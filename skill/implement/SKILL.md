---
name: implement
description: "Run the SEVO implement stage and advance implementation results. Use when 用户说开始编码、执行实现、开发这个功能、跑 implement，or say implement, start coding, execute development."
hooks:
  bootstrap: scripts/inject.ts
---

# ImplementSkill

实现 / run the implement stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`implement`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
