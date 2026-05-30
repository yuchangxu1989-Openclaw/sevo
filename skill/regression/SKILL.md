---
name: regression
description: "Run the SEVO regression stage to confirm no regressions remain. Use when 用户说跑回归测试、验证没有回归、确认没破坏已有功能，or say regression test, verify no regressions."
hooks:
  bootstrap: scripts/inject.ts
---

# RegressionSkill

回归测试 / run the regression stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`review`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
