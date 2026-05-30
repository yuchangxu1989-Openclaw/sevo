---
name: pipeline-create
description: "Create SEVO pipelines, classify task level, and emit required stages. Use when 用户说新建研发任务、启动流水线、开始做某个功能、走流程，or say create pipeline, start task, new feature, kick off SEVO."
hooks:
  bootstrap: scripts/inject.ts
---

# PipelineCreateSkill

创建流水线 / create SEVO pipelines。

- 主入口：`scripts/run.ts`
- Bootstrap 注入：`scripts/inject.ts`
- Bootstrap 映射阶段：`specify`

约束：优先复用 `src/` 现有模块；没有直接业务执行器的部分保持轻量 wrapper 或 TODO stub，不重复实现核心逻辑。
