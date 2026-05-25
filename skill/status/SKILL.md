---
name: status
description: "Query current SEVO pipeline status and stage progress. Use when 用户说流水线进度如何、当前在哪个阶段、任务状态，or say pipeline status, current stage, progress."
hooks:
  bootstrap: scripts/inject.ts
---

# PipelineStatusSkill

流水线状态 / query pipeline status。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`implement`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
