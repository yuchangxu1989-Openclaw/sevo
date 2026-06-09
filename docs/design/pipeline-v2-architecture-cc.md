# SEVO Pipeline V2 Architecture Design

cc（OpenClaw ACP Agent）2026-06-09

---

## 设计决策总结

SEVO Pipeline V2 将当前 14000+ 行单文件插件重构为 **4 个职责单一的模块 + 1 入口胶水层**，核心变更：

1. **身份模型**：`PipelineRun` 是一次研发波次的独立实例，同项目可并行多条。外键链路为 `pipelineRunId → stageTaskId → dispatchId`，不再通过 `projectSlug` 反查。
2. **advance 机制**：从"持久化队列 + replay + reconcile"改为"事件驱动一次性计算"——completion 到达时动态生成注入文本，注入完即丢弃。
3. **状态机**：从 22-stage 固定链改为动态 `stagePlan`——创建时按模板确定阶段列表，运行中可跳过。
4. **监督能力保留**：`before_prompt_build` 每轮注入阶段纪律 + 当前下一步建议，保证主会话不失焦。

### 与两份 ADR 的共识

- Pipeline 身份必须从 projectSlug 升级为 pipelineRunId（两份 ADR 一致）
- 保留 before_prompt_build 监督注入（两份 ADR 一致）
- 砍掉持久 advance queue / replay / reconcile / pendingNotices（两份 ADR 一致）
- 先止血再切换的过渡策略（两份 ADR 一致）

### 与 codex ADR 的分歧

| 议题 | codex 方案 | 本设计 | 理由 |
|------|-----------|--------|------|
| Run ID 格式 | `run_` 前缀 | 裸 UUID | 与现有 `data/pipelines/<uuid>/` 目录兼容，避免迁移路径 |
| scopeFingerprint | 必填 | 可选（goal hash 自动回填） | 多数创建入口没有显式 scope，强制会阻塞创建流 |
| 状态枚举 | created/running/completed/cancelled | running/completed/cancelled/stale | created 合入 running（创建即启动）；增加 stale 支持自动归档 |
| StageTask 独立文件 | 每 stage 独立 JSON | 内嵌于 run state | 减少文件 IO，单次 read 获取完整 run 快照 |

---

## 一、新数据模型

### 1.1 PipelineRun Schema

```jsonc
// 文件位置: data/pipelines/<pipelineRunId>/state.json
{
  "schemaVersion": 2,
  "pipelineRunId": "4aabebe2-785b-4e90-a5ac-27bb822a11b4",  // UUID
  "projectSlug": "kivo",
  "projectRoot": "projects/kivo",
  "goal": "实现 KIVO 知识卡片编辑器",
  "scopeFingerprint": "sha256:abc123...",  // 可选，自动从 goal hash
  "status": "running",  // running | completed | cancelled | stale
  "entryType": "create",  // create | fix | from | implement

  "lifecycle": {
    "createdAt": "2026-06-09T05:51:53.910Z",
    "startedAt": "2026-06-09T05:51:53.910Z",
    "completedAt": null,
    "cancelledAt": null,
    "lastActivityAt": "2026-06-09T06:30:00.000Z",
    "staleDetectedAt": null,
    "terminalReason": null
  },

  "stagePlan": {
    "ordered": ["spec", "spec-review-gate", "implement", "review", "deploy", "ledger"],
    "skipped": []
  },

  "currentStageId": "implement",

  "stages": {
    "spec": {
      "status": "passed",
      "startedAt": "2026-06-09T05:51:53.910Z",
      "completedAt": "2026-06-09T06:00:00.000Z",
      "dispatchId": "d_abc123",
      "artifacts": ["projects/kivo/docs/product-requirements.md"],
      "attempt": 1
    },
    "implement": {
      "status": "active",
      "startedAt": "2026-06-09T06:10:00.000Z",
      "completedAt": null,
      "dispatchId": "d_def456",
      "artifacts": [],
      "attempt": 1
    }
  },

  "metadata": {
    "createdBy": "user",
    "maintenanceRun": false,
    "parentRunId": null
  }
}
```

### 1.2 实体关系

```
Project (projectSlug)
  └── 1:N PipelineRun (pipelineRunId)
             └── 1:N StageTask (内嵌于 stages map, key = stageId)
                        └── 1:1 Dispatch (dispatchId, 关联 subagent label)
```

- **Project → PipelineRun**: 多对一。同项目可有 N 条 running 状态的 run。
- **PipelineRun → StageTask**: 一对多。stages map 的 key 是 stageId，value 是该阶段的执行状态。
- **StageTask → Dispatch**: 一对一。dispatchId 是 subagent spawn 时分配的，写入 label。
- **Label 格式**: `sevo:<projectSlug>:<pipelineRunId-short>:<stageId>:<attempt>`（8 字符短 ID 足够区分同项目并行 run）。

### 1.3 状态枚举与转换

```
                 ┌─────────┐
  create ───────►│ running │
                 └────┬────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
   ┌───────────┐ ┌──────────┐ ┌───────┐
   │ completed │ │cancelled │ │ stale │
   └───────────┘ └──────────┘ └───┬───┘
                                   │ auto-archive
                                   ▼
                              (deleted from active index)
```

- **running**: 至少一个 stage 是 active 或 pending。创建即进入 running。
- **completed**: 所有 stagePlan.ordered 中的 stage 都 passed/skipped。
- **cancelled**: 用户或系统显式取消（`sevo:cancel`）。
- **stale**: `lastActivityAt` 超过阈值（默认 7 天）且无 active dispatch。自动检测，可配置。

### 1.4 存储布局

```
projects/sevo/
├── data/
│   ├── pipelines/
│   │   ├── <uuid>/state.json        ← 单 run 完整状态
│   │   └── <uuid>/ledger.jsonl      ← 该 run 的事件流
│   └── active-index.json            ← { pipelines: { <uuid>: { projectSlug, status, currentStageId } } }
├── state/                            ← V1 遗留（过渡期保留只读）
└── ...
```

- `active-index.json`: 轻量索引，只存 running/stale 的 run 摘要。查询不需要遍历所有 state.json。
- 单 run state.json: 完整快照。单次 IO 获取全部信息。
- ledger.jsonl: 不可变事件追加日志，仅用于审计回溯。

---

## 二、模块拆分

### 2.1 拆分原则

按 hook 入口 + 数据边界自然分离。每个模块对外暴露纯函数接口，不共享可变全局状态。

### 2.2 模块清单

| # | 模块 | 文件路径建议 | 职责（一句话） | 代码行数估算 |
|---|------|-------------|--------------|-------------|
| 1 | **run-store** | `src/run-store.js` | PipelineRun 的 CRUD + active-index 维护 + 生命周期状态转换 | 200-300 |
| 2 | **completion-handler** | `src/completion-handler.js` | subagent_ended hook：label 解析 → run 定位 → stage 推进 → advance 计算 | 300-400 |
| 3 | **prompt-injector** | `src/prompt-injector.js` | before_prompt_build hook：纪律注入 + 当前下一步建议 + 路由提示 | 300-400 |
| 4 | **pipeline-commands** | `src/pipeline-commands.js` | 用户命令处理：create/cancel/pause/skip/resume/from/status/diagnose | 200-300 |
| 5 | **index** | `index.js` | 入口胶水：hook 注册 + 模块加载 + 递归防护 + 错误边界 | 100-150 |

**辅助模块（保留/迁移自旧代码）**:

| 模块 | 来源 | 职责 |
|------|------|------|
| `label-protocol.js` | 已存在 | label encode/decode（扩展为含 pipelineRunId-short） |
| `task-mapper.js` | 已存在 | 阶段 prompt 模板 + AC 提取 + 角色映射 |
| `role-templates.js` | 已存在 | 角色注入模板 |
| `advance-prompt-templates.js` | 已存在 | advance 注入文本模板 |
| `event-log.js` | 已存在 | JSONL 事件追加 |

### 2.3 模块接口定义

#### run-store

```javascript
// 创建新 run，返回完整 PipelineRun 对象
createRun({ projectSlug, projectRoot, goal, entryType, stagePlan }) → PipelineRun

// 按 ID 获取 run（从 state.json 读取）
getRun(pipelineRunId) → PipelineRun | null

// 按 projectSlug 列出所有 non-terminal run
listActiveRuns(projectSlug?) → PipelineRun[]

// 推进 stage 状态
advanceStage(pipelineRunId, stageId, { status, artifacts?, dispatchId? }) → PipelineRun

// 终结 run
closeRun(pipelineRunId, { status: 'completed'|'cancelled', reason? }) → void

// 标记 stale（由定时扫描调用）
markStale(pipelineRunId) → void

// 更新 lastActivityAt
touch(pipelineRunId) → void
```

#### completion-handler

```javascript
// subagent_ended hook 主入口
handleCompletion(evt) → void

// 内部步骤:
//   1. 从 evt 提取 label → decode → 拿到 pipelineRunId + stageId + attempt
//   2. getRun(pipelineRunId) 验证 run 存在且 stage 匹配
//   3. 根据 evt.status 更新 stage（passed/failed/blocked）
//   4. 如果 stage passed，计算下一步 advance（见第三节）
//   5. 写入 run-store，发布 advance-ready 事件
```

#### prompt-injector

```javascript
// before_prompt_build hook 主入口
buildInjection(ctx) → { text: string, metadata: object } | null

// 内部步骤:
//   1. 列出当前 active runs（限制注入总量：最多 3 条 run 的摘要）
//   2. 对每条 run，生成「纪律 + 下一步建议」文本
//   3. 如有 pending advance（本轮刚计算出的），合并注入
//   4. 拼接路由提示（trackedPaths / 流水线纪律标记）
//   5. 返回注入文本
```

#### pipeline-commands

```javascript
// 统一命令分发入口
handleCommand(commandName, args, ctx) → string  // 返回用户可见响应文本

// 支持的 commandName:
//   create, cancel, pause, skip, resume, from, status, diagnose, retry
```

### 2.4 模块间通信

模块间 **不使用共享可变状态**（消灭 `sevoGlobal`）。通信方式：

1. **函数调用**：completion-handler 调用 run-store 的 `advanceStage()`。
2. **返回值传递**：completion-handler 计算出的 advance 文本，通过返回值传给 index，index 在同一轮 prompt build 中传给 prompt-injector。
3. **事件日志**：所有模块通过 `event-log.js` 追加 JSONL 事件，供审计用，不作为模块间通信手段。

```
┌────────────┐      ┌─────────────────────┐      ┌─────────────────┐
│   index    │─────►│ completion-handler   │─────►│   run-store     │
│ (hook reg) │      │ (subagent_ended)     │      │ (CRUD + state)  │
└─────┬──────┘      └──────────┬──────────┘      └─────────────────┘
      │                        │ advance text
      │  ┌─────────────────────┘
      ▼  ▼
┌─────────────────┐
│ prompt-injector  │
│(before_prompt)   │
└─────────────────┘
```

---

## 三、Advance 生成机制

### 3.1 设计原则

- **不持久化**：advance 文本是 ephemeral 的计算结果，不写磁盘、不进队列。
- **事件驱动**：只有两个时机触发 advance 计算——completion 到达、prompt build 周期。
- **幂等**：同一 run 状态下多次计算得到相同 advance 文本。
- **有界**：单轮 prompt build 注入的 advance 文本总长不超过 2000 字符。

### 3.2 触发时机

| 事件 | 触发源 | 产出 |
|------|--------|------|
| `subagent_ended`（stage passed） | completion-handler | 计算"下一步建议"，暂存于本轮内存 |
| `before_prompt_build` | prompt-injector | 读取 run 当前状态，生成注入文本 |

两个时机的关系：

```
subagent_ended
  └─► completion-handler
        ├─► advanceStage(run, stage, passed)    // 状态写盘
        └─► computeAdvance(run, nextStageId)    // 纯函数，结果暂存 process memory
                                                 // 生命周期 = 当前 Gateway 事件循环

before_prompt_build（紧接着触发）
  └─► prompt-injector
        ├─► 读 active runs 当前状态
        ├─► 如有暂存 advance → 合并注入
        └─► 否则 → 根据 run.currentStageId 生成"静态提醒"
```

### 3.3 计算逻辑伪代码

```javascript
function computeAdvance(run, completedStageId) {
  const nextStageId = getNextStage(run.stagePlan, completedStageId);
  if (!nextStageId) {
    // 所有阶段完成 → 产出 completion notice
    return { type: 'run-complete', text: buildCompletionText(run) };
  }

  const template = getStageAdvanceTemplate(nextStageId);
  const context = {
    projectSlug: run.projectSlug,
    goal: run.goal,
    completedStage: completedStageId,
    nextStage: nextStageId,
    artifacts: run.stages[completedStageId].artifacts,
    stagePromptSupplement: getStagePromptSupplement(nextStageId, run),
  };

  return {
    type: 'stage-advance',
    text: renderTemplate(template, context),
    dispatchHint: {
      label: encodeLabel(run.pipelineRunId, run.projectSlug, nextStageId, 1),
      role: getExpectedRole(nextStageId),
    },
  };
}
```

### 3.4 注入方式

prompt-injector 在 `before_prompt_build` 中组装最终注入文本：

```javascript
function buildInjection(ctx) {
  const runs = listActiveRuns();  // 最多取 3 条
  const sections = [];

  // 1. 流水线纪律（固定文本，始终注入）
  sections.push(PIPELINE_DISCIPLINE_TEXT);

  // 2. 每条 run 的状态摘要 + advance 建议
  for (const run of runs) {
    const advance = consumePendingAdvance(run.pipelineRunId);
    if (advance) {
      // 有刚计算出的 advance → 注入具体下一步
      sections.push(formatAdvanceInjection(run, advance));
    } else {
      // 无新 advance → 注入静态状态提醒
      sections.push(formatStatusReminder(run));
    }
  }

  // 3. 路由提示（tracked paths）
  sections.push(buildRouteGuidance(runs));

  return { text: sections.join('\n\n'), metadata: { runCount: runs.length } };
}
```

### 3.5 与旧机制对比

| 维度 | V1（旧） | V2（新） |
|------|---------|---------|
| 存储 | `pending-runtime.json` + `pending-advances.jsonl` + 内存 Map | 无持久化，纯内存暂存（单事件循环生命周期） |
| 恢复 | Gateway 重启时 hydrate + replay | 无需恢复——重启后下次 prompt build 从 run state 重新计算 |
| 去重 | injectedAdvances Map + label ack | 不需要——无队列就无重复投递 |
| 上限 | ADVANCE_REPLAY_CAP = 6 | 不适用——每轮最多注入 3 条 run × 1 条 advance |

---

## 四、递归防护

### 4.1 问题定义

SEVO 自身代码位于 `projects/sevo/`。当修复 SEVO 本身时，路由检测（path-match / LLM trigger）会识别为研发活动并尝试创建新 pipeline，形成递归。

### 4.2 识别方式

在 `createRun` 入口增加 **maintenance run 标记**：

```javascript
function createRun({ projectSlug, projectRoot, goal, entryType, ...rest }) {
  const isMaintenanceRun = projectSlug === 'sevo'
    || projectRoot?.startsWith('projects/sevo')
    || projectRoot?.startsWith('extensions/sevo');

  return {
    ...baseRun,
    metadata: {
      maintenanceRun: isMaintenanceRun,
      parentRunId: rest.parentRunId || null,
    },
  };
}
```

### 4.3 递归深度限制

实现位置：`index.js` 的 hook 注册层（入口最外层）。

规则：
1. **同项目同时最多 1 条 maintenance run**。第二次触发时返回 advisory 提示而非创建。
2. **禁止 maintenance run 内部 hook 自动创建 sibling run**。检测条件：当前 prompt build 上下文中已有 `maintenanceRun=true` 的 active run + 被触发路径在 `projects/sevo/` 下。
3. **depth=1 硬上限**：maintenance run 的 completion-handler 中，如果检测到 review/fix 循环要创建新 run 且 `parentRunId` 非空，拒绝创建并发出 advisory。

```javascript
// index.js — 递归防护 guard
function shouldBlockRecursiveCreate(projectSlug, activeRuns) {
  const existingMaintenance = activeRuns.filter(
    r => r.metadata.maintenanceRun && r.status === 'running'
  );
  if (existingMaintenance.length > 0 && projectSlug === 'sevo') {
    return { blocked: true, reason: 'maintenance-run-already-active', existingRunId: existingMaintenance[0].pipelineRunId };
  }
  return { blocked: false };
}
```

### 4.4 自动路由豁免

`projects/sevo/**` 路径命中 path-match route 时：
- 如果已有 sevo maintenance run → 不创建新 run，只注入 advisory（"已有流水线在跑"）。
- 如果没有 maintenance run → 允许创建，但自动标记 `maintenanceRun: true`。

---

## 五、过渡期策略

### 5.1 双轨共存原则

新旧逻辑通过 **run schemaVersion** 区分：

| schemaVersion | 走什么逻辑 | 数据位置 |
|---|---|---|
| 1（或无） | 旧 index.js 全量逻辑 | `state/active-pipelines.json` |
| 2 | 新模块逻辑 | `data/pipelines/<uuid>/state.json` + `data/active-index.json` |

### 5.2 切换机制

```javascript
// index.js — hook 注册时的分流
api.on('subagent_ended', async (evt) => {
  const label = extractLabel(evt);
  const runId = resolveRunIdFromLabel(label);

  if (runId && isV2Run(runId)) {
    // 新逻辑
    return completionHandler.handleCompletion(evt);
  }
  // 旧逻辑（保留原 subagent_ended handler）
  return legacyCompletionHandler(evt);
});

api.on('before_prompt_build', (ctx) => {
  const v2Runs = listActiveRuns().filter(r => r.schemaVersion === 2);
  const v1Active = loadLegacyActivePipelines();

  const injections = [];
  if (v2Runs.length > 0) {
    injections.push(promptInjector.buildInjection(ctx, v2Runs));
  }
  if (Object.keys(v1Active.pipelines || {}).length > 0) {
    injections.push(legacyPromptInjector(ctx, v1Active));
  }
  return mergeInjections(injections);
});
```

### 5.3 迁移路径

1. **新创建的 pipeline 全部走 V2**。`createRun` 直接写 schemaVersion=2。
2. **已有 V1 pipeline 自然收尾**。不做数据迁移——旧 run 完成/取消后从 `active-pipelines.json` 移除。
3. **手动迁移**：提供 `sevo:migrate <pipelineId>` 命令，将 V1 run 转为 V2 格式（可选，非必须）。
4. **安全删除旧代码时机**：`active-pipelines.json` 中所有 pipelines 为空（全部终结），且 7 天内无新 V1 run 产生。

### 5.4 回滚方案

如果 V2 有严重 bug：
- 在 `index.js` 中设置 `FORCE_V1_MODE=true` 环境变量，所有新创建回退到 V1 逻辑。
- V2 已有的 running run 状态不受影响（数据已写盘），但 hook 处理回退到 legacy handler。

---

## 六、止血层设计

### 6.1 止血目标

在 V2 重写落地前，用最小改动止住当前噪音。止血改动应该是 V2 的子集或不冲突项。

### 6.2 具体改动项

| # | 改动 | 位置 | 效果 | 与 V2 关系 |
|---|------|------|------|-----------|
| 1 | 关闭 advance replay | `hydratePendingRuntimeState()` 入口加 early return | Gateway 重启不再重放僵尸 advance | V2 直接删除该函数 |
| 2 | `reconcileStartupActiveStageAdvances()` 置空 | startup 路径 | 不再 startup 时批量生成 advance | V2 无此概念 |
| 3 | pendingNotices terminal filter | `before_prompt_build` 注入前检查 run status | terminal run 的 notice 不注入 | V2 无 pendingNotices |
| 4 | 放宽 AC-4.57 单项目限制 | `findActivePipelineAtOrAfterStage()` 返回 null（不去重） | 允许同项目多 pipeline | V2 天然支持 |
| 5 | completion 归属加 pipelineId 优先 | `resolveCompletionSevoLabel()` 中如果 label 含 pipelineId 短码则直接定位 | 减少串线 | V2 的 label 协议子集 |
| 6 | maintenance run guard | `before_prompt_build_create` 检测 projectSlug=sevo 时拒绝自动创建 | 止递归 | V2 递归防护的简化版 |

### 6.3 止血与 V2 的关系

```
止血 ──────────────────────────────────── V2 重写
 │                                         │
 ├─ 改动 1,2,3: 禁用旧机制          ────► 旧机制整体删除
 ├─ 改动 4: 放宽去重               ────► 新身份模型天然多 run
 ├─ 改动 5: label 扩展             ────► 新 label 协议
 └─ 改动 6: 递归 guard             ────► 完整递归防护模块
```

止血改动全部是 V2 方向的"提前落子"，不会产生与 V2 矛盾的遗留。

---

## 七、实施顺序建议

| 阶段 | 天数 | 交付物 | 验收 |
|------|------|--------|------|
| 0. 止血 | 1-2d | 上述 6 项改动落地 | 主会话不再收到终态 pipeline 的 advance 噪音 |
| 1. run-store | 2-3d | 模块 + active-index + 单元测试 | CRUD 测试通过，V2 run 可创建/读取/关闭 |
| 2. completion-handler | 2-3d | 模块 + label 协议扩展 | subagent_ended 能精确定位 V2 run 并推进 |
| 3. prompt-injector | 2d | 模块 + 注入模板迁移 | before_prompt_build 对 V2 run 产出正确注入 |
| 4. pipeline-commands | 2d | 命令模块 | create/cancel/status 对 V2 run 工作 |
| 5. 双轨集成 | 1-2d | index.js 分流逻辑 | 新建 run 走 V2，旧 run 走 V1，互不干扰 |
| 6. 验证 + 旧代码清理 | 2-3d | 三条真实 pipeline 验证 | 并行 run 不串线，maintenance run 不递归 |

**总计约 12-16 工作日**，与 sa-01 ADR 估算的 5-8 天（不含止血）大致对齐（本设计含止血 + 验证）。

---

## 八、保留与砍掉清单

### 保留（迁移到 V2）

| 能力 | 来源函数/文件 | 迁移目标 |
|------|--------------|---------|
| before_prompt_build 纪律注入 | `buildSevoPipelineDiscipline()` | prompt-injector |
| 阶段 prompt 模板 + supplements | `STAGE_PROMPT_SUPPLEMENTS` + `task-mapper.js` | prompt-injector + task-mapper |
| label encode/decode | `label-protocol.js` | 扩展后保留 |
| subagent_ended completion 推进 | hook 1 (line 11083+) | completion-handler |
| 角色映射 + agent 轮换 | `getExpectedRole()` + `pickDifferentImplementAgent()` | completion-handler |
| review-fix loop | `handleReviewAutoFix()` 系列 | completion-handler 内部 |
| 阶段 advance prompt 模板 | `advance-prompt-templates.js` | 保留原文件 |
| 事件日志 | `event-log.js` | 保留原文件 |

### 砍掉（不迁移）

| 机制 | 来源 | 砍掉理由 |
|------|------|---------|
| pending-runtime.json 持久化 | `serializePendingRuntimeState()` 系列 | V2 无持久 advance |
| hydrate + replay | `hydratePendingRuntimeState()` | V2 无队列 |
| reconcileStartupActiveStageAdvances | startup 路径 | V2 无 reconcile |
| pendingNotices string[] | `sevoGlobal.pendingNotices` | V2 用 run state 直接计算 |
| injectedAdvances Map + ack ledger | `sevoGlobal.injectedAdvances` | V2 无重复投递 |
| 22-stage FULL_PIPELINE_STAGES 固定链 | `STAGE_IDS` 全量 | V2 用动态 stagePlan |
| AC-4.57 单项目单 pipeline 约束 | `findActivePipelineAtOrAfterStage()` | V2 天然多 run |
| terminal gap scan (全局) | `runTerminalGapScan()` | V2 每条 run 独立管理 |
| sevoGlobal 共享可变状态 | 文件顶部 | V2 模块间无共享 mutable |

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 旧 V1 run 长期不终结，双轨代码维护成本高 | 中 | 止血层改动 4 放宽后，用 `sevo:cancel --all-v1` 批量清理 |
| label 协议变更导致旧 subagent 无法被识别 | 高 | 新 label 向后兼容——decode 时如果缺少 pipelineRunId 段则 fallback 到 projectSlug 查找 |
| advance 不持久化导致 Gateway 重启后丢失上下文 | 低 | 重启后下次 prompt build 从 run state 重新计算静态提醒，不丢信息只丢"刚算好还没注入"的一次性文本 |
| 同项目多 run 注入文本过长，token 浪费 | 中 | 硬限制：单轮最多注入 3 条 run 摘要，超出的 run 只列 ID + status 一行 |

---

*文档结束。设计产出供交叉印证和实现参考。*
