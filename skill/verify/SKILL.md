---
name: verify
description: "Run the SEVO verify stage in a clean environment before delivery. Use when 用户说验证交付物、清洁环境测试、确认可交付，or say verify deliverable, clean environment test."
hooks:
  bootstrap: scripts/inject.ts
---

# VerifySkill

验证 / run the verify stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`review`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
