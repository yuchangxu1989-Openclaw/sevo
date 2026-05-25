---
name: resume
description: "Resume SEVO pipelines from a failed or blocked point. Use when 用户说继续流水线、修复后继续、从失败点恢复、重试，or say resume pipeline, retry stage, recover run."
hooks:
  bootstrap: scripts/inject.ts
---

# PipelineResumeSkill

流水线恢复 / resume failed pipelines。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`implement`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
