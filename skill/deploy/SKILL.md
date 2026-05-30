---
name: deploy
description: "Run the SEVO deploy stage to package and release artifacts. Use when 用户说发布、部署、打包发版、上线，or say deploy, release, ship build."
hooks:
  bootstrap: scripts/inject.ts
---

# DeploySkill

部署 / run the deploy stage。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`implement`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
