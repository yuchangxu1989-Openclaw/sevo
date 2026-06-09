# SEVO Pipeline V2 Architecture

Codex（OpenClaw ACP Agent）2026-06-09

## 设计结论

SEVO Pipeline V2 采用“研发波次 Run”模型：`Project` 是长期项目容器，`PipelineRun` 是一次研发任务波次，同一个 `projectSlug` 可以同时存在多条 active run。所有任务归属必须通过 `pipelineRunId`、`stageTaskId`、`dispatchId` 精确关联，禁止再用 `projectSlug` 反查第一条 active pipeline。

V2 的职责边界只有三件事：

1. 记录每条研发波次的状态、阶段任务和完成证据。
2. 在每轮 `before_prompt_build` 注入阶段纪律和当前下一步建议，持续监督主会话。
3. 在 `subagent_ended` 到达时按外键推进对应 run，动态计算一次性的 advance 注入。

V2 不保留旧实现的持久 advance queue、replay、startup reconcile、22-stage 固定状态机、`pendingNotices` 字符串队列，也不保留 AC-4.57 的“单项目单 pipeline”约束。

## 一、第一性原理

旧 `projects/sevo/index.js` 当前 14258 行，把路由、状态、prompt 注入、completion 推进、pending runtime、角色推荐、terminal gap、reconcile 全部放在一个文件里。根因不是文件太大，而是三个模型混用：

- `PipelineRun` 被当作一次研发波次。
- `projectSlug` 被当作 active pipeline 身份。
- `advance` 被当作持久队列、恢复提示、监督提醒、自动派发 fallback。

V2 将三者拆开：

- `projectSlug` 只回答“属于哪个项目”。
- `pipelineRunId` 回答“属于哪一波研发任务”。
- `advance` 只回答“本轮 prompt 应该提醒主会话做什么”，计算完注入完就丢弃。

## 二、新数据模型

### 2.1 Project 与 PipelineRun

`Project` 是多条 `PipelineRun` 的父容器。V2 不要求 Project 新增复杂状态，只要求 active index 能按 `projectSlug` 列出 run。

关系：

- `Project 1 -> N PipelineRun`
- `PipelineRun.projectSlug` 是 Project 外键。
- 同一 Project 可同时有多条 `created|running` run。
- 创建去重只能基于 `scopeFingerprint` 或显式外部 `requestId`，不能基于 `projectSlug`。

### 2.2 PipelineRun JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sevo.pipeline-run.v2.schema.json",
  "title": "SEVO PipelineRun V2",
  "type": "object",
  "required": [
    "schemaVersion",
    "pipelineRunId",
    "projectSlug",
    "goal",
    "scopeFingerprint",
    "status",
    "lifecycle",
    "stageTasks",
    "createdAt",
    "updatedAt"
  ],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "integer", "const": 2 },
    "pipelineRunId": {
      "type": "string",
      "pattern": "^run_[A-Za-z0-9_-]+$"
    },
    "projectSlug": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]{0,80}$"
    },
    "goal": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2000
    },
    "scopeFingerprint": {
      "type": "string",
      "minLength": 16,
      "maxLength": 128
    },
    "status": {
      "type": "string",
      "enum": ["created", "running", "completed", "cancelled"]
    },
    "lifecycle": {
      "type": "object",
      "required": ["createdAt", "startedAt", "completedAt", "cancelledAt", "terminalReason"],
      "additionalProperties": false,
      "properties": {
        "createdAt": { "type": "string", "format": "date-time" },
        "startedAt": { "type": ["string", "null"], "format": "date-time" },
        "completedAt": { "type": ["string", "null"], "format": "date-time" },
        "cancelledAt": { "type": ["string", "null"], "format": "date-time" },
        "terminalReason": { "type": ["string", "null"], "maxLength": 1000 }
      }
    },
    "entry": {
      "type": "object",
      "required": ["type", "source", "userPromptHash"],
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": ["create", "from", "fix", "maintenance", "manual"]
        },
        "source": {
          "type": "string",
          "enum": ["before_prompt_build", "cli", "manual", "migration"]
        },
        "userPromptHash": { "type": ["string", "null"], "maxLength": 128 }
      }
    },
    "relationships": {
      "type": "object",
      "required": ["causedByPipelineRunId", "parentPipelineRunId"],
      "additionalProperties": false,
      "properties": {
        "causedByPipelineRunId": {
          "type": ["string", "null"],
          "pattern": "^run_[A-Za-z0-9_-]+$"
        },
        "parentPipelineRunId": {
          "type": ["string", "null"],
          "pattern": "^run_[A-Za-z0-9_-]+$"
        }
      }
    },
    "selfHosting": {
      "type": "object",
      "required": ["isSevoInternal", "recursionDepth", "guardMode"],
      "additionalProperties": false,
      "properties": {
        "isSevoInternal": { "type": "boolean" },
        "recursionDepth": { "type": "integer", "minimum": 0, "maximum": 2 },
        "guardMode": {
          "type": "string",
          "enum": ["none", "internal-only", "manual-confirm"]
        }
      }
    },
    "workPackages": {
      "type": "array",
      "items": { "$ref": "#/$defs/WorkPackage" }
    },
    "stageTasks": {
      "type": "array",
      "items": { "$ref": "#/$defs/StageTask" }
    },
    "completionLog": {
      "type": "array",
      "items": { "$ref": "#/$defs/CompletionRecord" }
    },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "$defs": {
    "WorkPackage": {
      "type": "object",
      "required": ["workPackageId", "pipelineRunId", "title", "status", "dependsOn"],
      "additionalProperties": false,
      "properties": {
        "workPackageId": { "type": "string", "pattern": "^wp_[A-Za-z0-9_-]+$" },
        "pipelineRunId": { "type": "string", "pattern": "^run_[A-Za-z0-9_-]+$" },
        "title": { "type": "string", "minLength": 1, "maxLength": 500 },
        "status": { "type": "string", "enum": ["pending", "running", "completed", "cancelled"] },
        "dependsOn": {
          "type": "array",
          "items": { "type": "string", "pattern": "^wp_[A-Za-z0-9_-]+$" },
          "uniqueItems": true
        }
      }
    },
    "StageTask": {
      "type": "object",
      "required": [
        "stageTaskId",
        "pipelineRunId",
        "workPackageId",
        "stageId",
        "status",
        "attempt",
        "label",
        "acceptanceRefs",
        "expectedArtifacts",
        "createdAt",
        "updatedAt"
      ],
      "additionalProperties": false,
      "properties": {
        "stageTaskId": { "type": "string", "pattern": "^st_[A-Za-z0-9_-]+$" },
        "pipelineRunId": { "type": "string", "pattern": "^run_[A-Za-z0-9_-]+$" },
        "workPackageId": { "type": ["string", "null"], "pattern": "^wp_[A-Za-z0-9_-]+$" },
        "stageId": {
          "type": "string",
          "enum": [
            "spec",
            "spec-review-gate",
            "test-case-authoring",
            "contract",
            "contract-review-gate",
            "implement",
            "review",
            "regression",
            "publish-generalization-gate",
            "deploy",
            "verify",
            "ledger"
          ]
        },
        "status": {
          "type": "string",
          "enum": ["pending", "suggested", "running", "completed", "blocked", "cancelled"]
        },
        "attempt": { "type": "integer", "minimum": 1 },
        "label": {
          "type": "string",
          "pattern": "^sevo:[a-z0-9-]+:run_[A-Za-z0-9_-]+:[a-z0-9-]+:[0-9]+$"
        },
        "dispatchId": {
          "type": ["string", "null"],
          "pattern": "^disp_[A-Za-z0-9_-]+$"
        },
        "acceptanceRefs": {
          "type": "array",
          "items": { "type": "string", "minLength": 1, "maxLength": 120 },
          "uniqueItems": true
        },
        "expectedArtifacts": {
          "type": "array",
          "items": { "type": "string", "minLength": 1, "maxLength": 500 }
        },
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    },
    "CompletionRecord": {
      "type": "object",
      "required": ["completionId", "pipelineRunId", "stageTaskId", "status", "receivedAt"],
      "additionalProperties": false,
      "properties": {
        "completionId": { "type": "string", "minLength": 1, "maxLength": 200 },
        "pipelineRunId": { "type": "string", "pattern": "^run_[A-Za-z0-9_-]+$" },
        "stageTaskId": { "type": "string", "pattern": "^st_[A-Za-z0-9_-]+$" },
        "status": { "type": "string", "enum": ["passed", "failed", "blocked", "ignored"] },
        "summary": { "type": ["string", "null"], "maxLength": 4000 },
        "receivedAt": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### 2.3 Task 关系

`Task` 指外部看板或子 Agent 任务。V2 中 Task 不再通过 `projectSlug` 反查 pipeline，而是必须带结构化外键。

Task 最小关联字段：

```json
{
  "taskId": "board_task_id",
  "label": "sevo:sevo:run_ab12:implement:1",
  "pipelineRunId": "run_ab12",
  "stageTaskId": "st_01",
  "dispatchId": "disp_01",
  "agentId": "codex",
  "status": "running"
}
```

关系：

- `PipelineRun 1 -> N StageTask`
- `StageTask 1 -> 0..N Dispatch`
- `Dispatch 1 -> 0..1 Task`
- `Task completion -> Dispatch/StageTask -> PipelineRun`

无 `pipelineRunId` 且同 `projectSlug` 有多条 active run 时，completion 必须进入 quarantine notice，不得推进任何 run。

### 2.4 极简生命周期状态机

V2 生命周期只保留四个 run 状态：

```text
created -> running -> completed
                  \-> cancelled
created -> cancelled
```

状态含义：

- `created`：run 已创建，尚未向主会话建议第一条 stage task。
- `running`：存在 pending/suggested/running/blocked 的 stage task，监督注入开启。
- `completed`：所有 mandatory stage task 已完成，run 不再生成 advance。
- `cancelled`：显式取消或迁移关闭，run 不再生成 advance，迟到 completion 记录为 ignored。

终态规则：

- `completed|cancelled` 是 terminal。
- terminal transition 必须原子执行：更新 run、从 active index 移除、丢弃本轮内存中的 transient advance、停止 timer、记录 completion summary。
- terminal run 可查询，但永不进入 `computeAdvances()`。

## 三、模块拆分

旧 `index.js` 拆为 5 个职责模块。每个模块都可以先从旧文件迁移函数，再逐步删除旧实现。

### 3.1 `projects/sevo/src/plugin-v2/index.js`

职责：只注册 hook，并把事件转发给 V2 runtime。

保留旧代码价值：

- `before_prompt_build` 阶段纪律注入入口。
- `subagent_ended` completion 入口。
- `before_tool_call` label 注入入口。

接口：

```ts
registerSevoPipelineV2(api, runtime): void

runtime.handleBeforePromptBuild(event, context): PromptInjection | null
runtime.handleSubagentEnded(event): Promise<void>
runtime.handleBeforeToolCall(event, context): ToolCallPatch | null
```

边界：

- 不直接读写 run 文件。
- 不拼接 stage prompt。
- 不做 projectSlug 反查。

### 3.2 `projects/sevo/src/plugin-v2/run-store.js`

职责：管理 `PipelineRun` 的读写、active index、terminal transition。

接口：

```ts
createRun(input: CreateRunInput): PipelineRun
getRun(pipelineRunId: string): PipelineRun | null
listActiveRuns(filter?: { projectSlug?: string }): PipelineRun[]
updateRun(pipelineRunId: string, patch: RunPatch): PipelineRun
closeRun(input: { pipelineRunId: string, status: "completed" | "cancelled", reason: string }): PipelineRun
appendCompletion(record: CompletionRecord): PipelineRun
```

输入输出：

- 输入必须包含 `pipelineRunId` 或创建输入。
- 输出总是完整 `PipelineRun` 新对象。
- `closeRun()` 是唯一 terminal 入口。

边界：

- 不生成 prompt。
- 不调用 Agent。
- 不读取 board 全局任务，除非通过调用方传入 Task snapshot。

### 3.3 `projects/sevo/src/plugin-v2/label-router.js`

职责：解析 label、生成 label、把 completion 精确归属到 run/task。

保留旧代码价值：

- `label-protocol.js` 的 encode/decode 思路。
- `resolveCompletionSevoLabel()` 的 completion 事件字段收集。

接口：

```ts
encodeLabel(input: {
  projectSlug: string
  pipelineRunId: string
  stageId: string
  attempt: number
}): string

decodeLabel(label: string): DecodedLabel | null

resolveCompletion(event: CompletionEvent, store: RunStore): CompletionResolution
```

`CompletionResolution`：

```ts
type CompletionResolution =
  | { kind: "resolved"; pipelineRunId: string; stageTaskId: string; stageId: string; attempt: number }
  | { kind: "quarantine"; reason: "missing-label" | "legacy-ambiguous" | "run-not-found" | "stage-task-not-found"; candidates: PipelineRun[] }
```

边界：

- 多候选时返回 `quarantine`。
- 禁止 `resolvePipelineId(projectSlug)` 返回第一条 active run。

### 3.4 `projects/sevo/src/plugin-v2/advance-engine.js`

职责：事件驱动实时计算下一步建议，并输出一次性 prompt fragments。

保留旧代码价值：

- `before_prompt_build` 动态注入方式。
- `buildInjectionTriplet()` 的结构化提示形式。
- `buildTaskPrompt()`、阶段 prompt 模板、角色映射、`injectSpecBeforeCodeGuard()`。

接口：

```ts
computeAdvances(input: {
  event: "prompt-build" | "completion-ended" | "timer-expired" | "clarification-resolved"
  runs: PipelineRun[]
  taskSnapshot: TaskSnapshot
  now: string
}): AdvanceSuggestion[]

renderAdvance(suggestion: AdvanceSuggestion): PromptFragment
renderDiscipline(input: { trackedProjects: string[]; activeRuns: PipelineRun[] }): PromptFragment
```

`AdvanceSuggestion`：

```ts
type AdvanceSuggestion = {
  pipelineRunId: string
  stageTaskId: string
  stageId: string
  reason: "next-stage-ready" | "retry-needed" | "blocked" | "selection-required" | "timeout"
  severity: "info" | "blocking"
  label: string
  recommendedAgentId: string | null
  timeoutSeconds: number | null
  taskPrompt: string
  dedupeKey: string
}
```

边界：

- 不写磁盘 queue。
- 不维护 replay ledger。
- 只从当前 run/task snapshot 计算。
- 计算结果注入后即丢弃。

### 3.5 `projects/sevo/src/plugin-v2/transition-engine.js`

职责：处理 completion 后的阶段结果、门禁判定、下一 stage task 生成。

接口：

```ts
applyCompletion(input: {
  resolution: ResolvedCompletion
  event: CompletionEvent
  run: PipelineRun
}): TransitionResult

planNextStageTasks(input: {
  run: PipelineRun
  completedStageTask: StageTask
  outcome: "passed" | "failed" | "blocked"
}): StageTask[]
```

`TransitionResult`：

```ts
type TransitionResult = {
  run: PipelineRun
  completion: CompletionRecord
  nextStageTasks: StageTask[]
  terminal: boolean
  quarantineNotice?: QuarantineNotice
}
```

边界：

- 可以读取阶段门禁规则和 completion 文本。
- 不注入 prompt。
- 不直接派发 Agent。

## 四、模块间事件流

### 4.1 创建 run

```text
before_prompt_build detects SEVO route
  -> label-router validates request
  -> run-store.createRun()
  -> transition-engine creates first StageTask
  -> next prompt build computeAdvances()
  -> before_prompt_build injects one-time suggestion
```

### 4.2 子任务完成

```text
subagent_ended
  -> label-router.resolveCompletion()
  -> if quarantine: advance-engine renders selection/blocking notice for next prompt only
  -> if resolved: run-store.getRun()
  -> transition-engine.applyCompletion()
  -> run-store.updateRun()
  -> runtime records transient "completion-ended" event in memory
  -> next before_prompt_build computeAdvances(event="completion-ended")
  -> inject next action once
```

### 4.3 工具调用 label 注入

```text
before_tool_call sessions_spawn
  -> find StageTask by exact label or stageTaskId
  -> patch params.label
  -> optionally patch task metadata pipelineRunId/stageTaskId/dispatchId
```

旧逻辑可保留“给 spawn 自动补 label”的能力，但只允许补 V2 label。

## 五、advance 生成机制

### 5.1 触发时机

V2 只在这些事件触发 advance 计算：

- `before_prompt_build`：主会话每轮构建 prompt 时，基于 active runs 计算当前应提醒的下一步。
- `subagent_ended`：completion 到达后更新 run，并在内存中登记一次 `completion-ended` transient event，供下一轮 prompt build 使用。
- `message_received` clarification resolved：澄清已解决后更新 blocked stage task，下一轮 prompt build 计算恢复建议。
- `before_prompt_build` timer check：仅检查 run-scoped stage task timeout，不扫描全局 spec checkbox。

不触发：

- Gateway startup 不生成 advance。
- 磁盘 hydrate 不生成 advance。
- reconcile 不生成 advance；V2 不实现 reconcile。

### 5.2 生成逻辑

输入数据：

- active `PipelineRun[]`
- 每条 run 的 `StageTask[]`
- 当前 board/task snapshot
- 最近一次 transient event
- 当前时间

决策优先级：

1. quarantine：有无法归属 completion 或 legacy ambiguous label，先要求选择/修复归属。
2. blocked：有 clarification、gate fail-closed、缺工件等阻断项，先提醒解除阻断。
3. timeout：某 run 的 running stage task 超时，建议重派或升级角色。
4. next-stage-ready：有 pending/suggested stage task 且没有对应 running task，建议派发。
5. progress：没有可派发任务时，只注入简短状态，不制造行动噪音。

### 5.3 伪代码

```ts
function handleBeforePromptBuild(event, context) {
  if (!isMainSession(context)) return null

  const activeRuns = runStore.listActiveRuns()
  const taskSnapshot = taskReader.readCurrentTasks()
  const transientEvents = memory.drainTransientEvents()

  const fragments = []
  fragments.push(advanceEngine.renderDiscipline({
    trackedProjects: unique(activeRuns.map(run => run.projectSlug)),
    activeRuns
  }))

  const suggestions = advanceEngine.computeAdvances({
    event: classifyPromptEvent(transientEvents),
    runs: activeRuns,
    taskSnapshot,
    now: clock.nowIso()
  })

  for (const suggestion of dedupeBy(suggestions, "dedupeKey")) {
    fragments.push(advanceEngine.renderAdvance(suggestion))
  }

  if (fragments.length === 0) return null
  return { prependContext: fragments.join("\n\n---\n\n") }
}

function computeAdvances({ runs, taskSnapshot, now }) {
  const suggestions = []

  for (const run of runs) {
    if (isTerminal(run.status)) continue

    const tasks = run.stageTasks.filter(task => task.status !== "completed" && task.status !== "cancelled")

    for (const task of tasks) {
      if (task.status === "blocked") {
        suggestions.push(blockingSuggestion(run, task))
        continue
      }

      const externalTask = taskSnapshot.findByStageTaskId(task.stageTaskId)
      if (externalTask?.status === "running" || externalTask?.status === "queued") continue

      if (task.status === "pending" || task.status === "suggested") {
        suggestions.push(nextStageSuggestion(run, task))
      }
    }
  }

  return suggestions
}
```

### 5.4 注入方式

`advance-engine.renderAdvance()` 输出与旧 `buildInjectionTriplet()` 等价的三段式内容：

- title：`[SEVO Auto-Advance] <projectSlug>/<pipelineRunId> -> <stageId>`
- goal：说明当前阶段目标和验收边界。
- action：给主会话的下一步派发指令，包含 `agentId`、`timeout`、`label`、stage task prompt。
- why：说明不执行会造成的阶段/审计风险。

V2 仍通过 `before_prompt_build` 返回：

```json
{
  "prependContext": "<rendered prompt fragments>"
}
```

### 5.5 不持久化规则

以下对象不写磁盘：

- 本轮 `AdvanceSuggestion[]`
- prompt fragments
- injected-but-unacked ledger
- replay counter
- pending notice queue

写磁盘的只有：

- `PipelineRun`
- `StageTask`
- `CompletionRecord`
- 可选的外部 `Dispatch`，仅当系统实际创建外部 task 时写入，不用于 advance replay。

## 六、递归防护

### 6.1 SEVO 自身任务识别

SEVO internal task 满足任一条件即视为内部维护任务：

- `projectSlug === "sevo"` 且目标路径命中 `projects/sevo/**`
- label 或 task metadata 含 `sevoInternal: true`
- run.relationships.causedByPipelineRunId 非空，且父 run 也是 `projectSlug === "sevo"`
- 任务 prompt 包含显式 INTERNAL 标记：

```text
[SEVO_INTERNAL_MAINTENANCE]
pipelineRunId: run_xxx
recursionDepth: 1
[/SEVO_INTERNAL_MAINTENANCE]
```

V2 推荐同时使用结构化 metadata 和 prompt marker。metadata 用于程序判断，marker 用于主会话监督。

### 6.2 递归深度限制

实现位置：`label-router` 和 `run-store.createRun()` 双重限制。

规则：

- 普通 run：`recursionDepth = 0`
- SEVO internal run 创建子 run：`recursionDepth = parent.recursionDepth + 1`
- `recursionDepth > 1` 时禁止 auto-create，只注入 blocking notice，要求用户显式确认或手动选择已有 run。

伪代码：

```ts
function createRun(input) {
  const parent = input.causedByPipelineRunId ? getRun(input.causedByPipelineRunId) : null
  const isInternal = detectSevoInternal(input)
  const recursionDepth = parent ? parent.selfHosting.recursionDepth + 1 : 0

  if (isInternal && recursionDepth > 1 && input.source === "before_prompt_build") {
    return {
      kind: "blocked",
      reason: "sevo-internal-recursion-depth-exceeded",
      notice: buildManualConfirmationNotice(input, parent)
    }
  }

  return persistNewRun({
    ...input,
    selfHosting: {
      isSevoInternal: isInternal,
      recursionDepth,
      guardMode: isInternal ? "internal-only" : "none"
    }
  })
}
```

Hook chain 规则：

- `subagent_ended` 处理 completion 时不得创建 sibling PipelineRun。
- review/fix loop 只能在当前 run 内新增 `StageTask`。
- 只有用户显式 `sevo:create` 或 `sevo:from` 才能创建新的 SEVO internal maintenance run。

## 七、过渡期策略

### 7.1 共存方式

旧插件和 V2 以“run schema version”共存：

- 旧 pipeline：没有 `schemaVersion: 2` 或没有 `pipelineRunId` 外键，继续走旧逻辑。
- 新 pipeline：`schemaVersion: 2` 且 label 格式包含 `pipelineRunId`，走 V2 runtime。

入口选择：

```ts
function routeHookEvent(event) {
  const label = extractLabel(event)
  const decoded = decodeV2Label(label)
  if (decoded?.pipelineRunId) return "v2"

  const runId = extractPipelineRunIdFromMetadata(event)
  if (runId && runStore.getRun(runId)?.schemaVersion === 2) return "v2"

  return "legacy"
}
```

### 7.2 新旧切换机制

创建入口：

- 新的 `sevo:create`、auto route、`sevo:from` 默认创建 V2 run。
- 只有用户显式指定 legacy 或旧 state 恢复时才进入旧逻辑。

completion 入口：

- V2 label：`sevo:<projectSlug>:<pipelineRunId>:<stageId>:<attempt>`，必须走 V2。
- 旧 label：`sevo:<projectSlug>:<stageId>:<attempt>`，走旧逻辑。
- 旧 label 但同项目存在多条 V2 active run：不允许旧逻辑默认推进，注入 ambiguous notice。

prompt 注入入口：

- V2 `before_prompt_build` 先运行，注入 V2 discipline 和 active run suggestions。
- 旧 `before_prompt_build` 只处理 legacy active pipeline。
- 旧 `pendingNotices` 不得注入到 V2 run。

### 7.3 旧 pipeline 收尾

旧 active pipeline 不做批量迁移，避免把旧错误状态带入 V2。处理方式：

1. 能自然完成的旧 run 继续由旧逻辑收尾。
2. 噪音严重或状态不可信的旧 run，用旧 cancel/close 止血关闭。
3. 需要继续推进的旧 run，通过 `sevo:from <project> <stage>` 创建新的 V2 run，旧 run 标记 legacy-closed。

### 7.4 安全删除旧代码条件

满足全部条件后删除旧逻辑：

- active index 中没有 legacy active pipeline。
- 最近 7 天没有旧 label completion 到达。
- `pending-runtime.json` 中没有旧 `pendingAdvances`、`pendingNotices`、`injectedAdvances`。
- V2 覆盖以下回归用例：同项目双 run 并行、completion 精确归属、SEVO internal recursion guard、terminal 后不注入、clarification resume、timeout suggestion。
- 用户确认不再需要恢复旧 pipeline。

删除顺序：

1. 删除旧 advance replay 和 pending runtime hydrate。
2. 删除旧 projectSlug resolver。
3. 删除旧 startup reconcile 和 prompt reconcile。
4. 删除旧 22-stage 固定状态机入口。
5. 将旧 `index.js` 收缩为只注册 V2 runtime。

## 八、止血层设计

止血目标是 1-2 天内降低噪音，不追求完成 V2。止血代码是过渡代码，除“精确归属失败时 fail closed”规则外，其余都应在 V2 切换后删除。

### 8.1 立即改动项

1. 关闭 injected advance replay
   - 修改 `collectReplayableInjectedAdvances()`：默认返回空数组。
   - 保留事件日志，记录 `replay-disabled-by-v2-transition`。
   - 目的：阻止 terminal 或旧 injected advance 被重复注入。

2. terminal 过滤前置
   - 在 `consumePendingAdvances()` 读取 notices/advances 后，先加载 active registry。
   - 对能解析出 pipelineId 的 advance/notice，如果 run terminal 或不在 active index，直接丢弃。
   - 无法归属的旧字符串 notice 设置短 TTL，本轮最多注入一次。

3. startup reconcile 降级
   - `reconcileStartupActiveStageAdvances()` 不再调用 `queueStageAdvancePrompt()`。
   - 只记录 active pipeline 状态和异常摘要。
   - 目的：Gateway 启动不制造新 advance。

4. prompt reconcile 限流
   - `reconcileCliCreatedPipelines()` 每轮 prompt 不再扫描并排队。
   - 只在显式 `sevo:status|sevo:diagnose` 时读取磁盘状态。

5. 多候选 fail closed
   - 修改 `resolvePipelineId(projectSlug)`：如果候选数大于 1，返回 null，并注入候选列表。
   - 禁止“第一条 active pipeline”默认推进。
   - 这条规则会保留到 V2。

6. terminal gap 限域
   - 禁止扫描所有 `projects/*/docs/product-requirements.md` 的 unchecked checkbox。
   - 只允许基于 active pipeline 的结构化 remaining FR 生成提示。

7. SEVO internal 临时 guard
   - 对 `projects/sevo/**` 自动路由命中时，不直接 auto-create。
   - 注入一次 blocking notice：要求显式 `sevo:create sevo ...` 或选择已有 maintenance run。

### 8.2 止血与 V2 的关系

保留到 V2 的止血规则：

- 多候选 fail closed。
- terminal run 不生成 advance。
- SEVO internal auto-create 需要 recursion guard。

V2 切换后删除的止血代码：

- 旧 `pendingNotices` TTL。
- `pending-runtime.json` 兼容清理。
- 旧 reconcile 限流分支。
- 旧 injected advance replay 禁用分支。

## 九、保留与删除清单

### 9.1 保留并迁移

- `before_prompt_build` 纪律注入：迁移到 `advance-engine.renderDiscipline()`。
- `before_prompt_build` 动态阶段提醒：迁移为实时 `computeAdvances()`。
- label 解析：升级为 V2 label，迁移到 `label-router.js`。
- `subagent_ended` hook：保留入口，归属逻辑改为 `dispatchId/stageTaskId/pipelineRunId`。
- 角色映射：保留 `getStageMapping()`、`STAGE_FALLBACK_CHAIN`、role navigation。
- 阶段 prompt 模板：保留 `buildTaskPrompt()`、`advance-prompt-templates.js` 和阶段补充文本。
- `injectSpecBeforeCodeGuard()`：保留，继续保证编码阶段必须引用 spec/AC。

### 9.2 删除或废弃

- `pendingAdvances` 持久队列。
- `pendingNotices` 字符串队列。
- `injectedAdvances` replay ledger。
- `hydratePendingRuntimeState()` 对 pending advance 的恢复。
- `collectReplayableInjectedAdvances()` replay 机制。
- `reconcileStartupActiveStageAdvances()` 生成 advance 的行为。
- `reconcileCliCreatedPipelines()` 每轮 prompt 扫描并排队。
- `findActivePipelineAtOrAfterStage(projectSlug, requestedStage)` 的创建去重。
- `resolvePipelineId(projectSlug)` 的第一候选回退。
- terminal gap 全局 spec checkbox 扫描。
- AC-4.57 单项目单 active pipeline 约束。

## 十、实现顺序

1. 止血补丁
   - 禁 replay、terminal 过滤、startup/prompt reconcile 降级、多候选 fail closed、SEVO internal 临时 guard。

2. V2 数据模型和 store
   - 新增 schema、run store、active index、`closeRun()`。
   - 不接 hook，先用单元测试覆盖生命周期。

3. V2 label router
   - 新 label encode/decode。
   - completion resolution 不再按 projectSlug 反查。
   - ambiguous legacy completion quarantine。

4. V2 advance engine
   - 实现实时 `computeAdvances()`。
   - 接入旧 stage prompt 和角色映射。
   - 不写 pending runtime。

5. V2 hook adapter
   - `before_prompt_build`、`subagent_ended`、`before_tool_call` 分流 V2/legacy。
   - 新创建入口默认 V2。

6. 过渡期收尾
   - 旧 run 自然完成或关闭。
   - 满足删除条件后移除旧 pending runtime/replay/reconcile。

## 十一、验收用例

实现者必须至少覆盖以下行为：

1. 同一个 `projectSlug=sevo` 可创建两条 active V2 run，二者 `pipelineRunId` 不同。
2. 两条 run 同时处于 `implement`，completion 用 label 中的 `pipelineRunId` 推进正确 run。
3. legacy label 在多候选场景下不推进任何 run，只生成 quarantine suggestion。
4. `completed` run 不再出现在 `computeAdvances()` 输出里。
5. Gateway startup 不生成 advance suggestion。
6. `subagent_ended` 到达后，下一轮 `before_prompt_build` 动态生成一次 next-stage suggestion，不写 replay 队列。
7. `projects/sevo/**` 自动路由命中时，递归深度超过 1 不创建新 run。
8. terminal gap 不扫描全局 spec checkbox。

## 十二、文件落点建议

```text
projects/sevo/src/plugin-v2/index.js
projects/sevo/src/plugin-v2/run-store.js
projects/sevo/src/plugin-v2/label-router.js
projects/sevo/src/plugin-v2/advance-engine.js
projects/sevo/src/plugin-v2/transition-engine.js
projects/sevo/src/plugin-v2/types.js
projects/sevo/src/plugin-v2/__tests__/run-store.test.js
projects/sevo/src/plugin-v2/__tests__/label-router.test.js
projects/sevo/src/plugin-v2/__tests__/advance-engine.test.js
projects/sevo/src/plugin-v2/__tests__/transition-engine.test.js
projects/sevo/src/plugin-v2/__tests__/legacy-bridge.test.js
```

不要求实现者必须使用这些扩展名或测试框架；这里定义的是职责边界和文件分布。若现有构建系统要求 TypeScript，可保持同名 `.ts` 文件，接口和模型不变。
