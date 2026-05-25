# FR-13 PipelineEngine P0 实现范围定义

OpenClaw（pm-01 子Agent）｜2026-05-23

---

## 1. FR-13 全部 AC 列表

| 编号 | 摘要 |
|------|------|
| AC-13.1 | pipeline 创建后，PipelineEngine 无人工干预自动通过 Adapter 触发第一个阶段执行 |
| AC-13.2 | 每个阶段完成后，30 秒内评估门禁并决定推进或阻断 |
| AC-13.3 | 门禁失败时自动触发修复流程（FR-06a），修复通过后自动恢复推进 |
| AC-13.4 | 并行阶段同时触发，两者均通过后才推进到下一阶段 |
| AC-13.5 | 每一步推进决策（推进/阻断/重试）有结构化记录，可在驾驶舱查看 |
| AC-13.6 | 编排语义与任务派发实现分离，具体触发通过 Adapter 抽象层 |
| AC-13.7 | 用户可任意时刻查询 pipeline 当前状态 |
| AC-13.8 | Gateway 重启后，中断的 pipeline 60 秒内自动恢复推进 |
| AC-13.9 | 多 pipeline 竞争同一 Agent 时按优先级排队，不阻塞不竞争的阶段 |

---

## 2. P0 范围划定：阶段推进守卫最小集

P0 聚焦一个核心能力：**流水线阶段顺序不可被绕过**。

### P0 包含的 AC

| AC | 理由 |
|----|------|
| AC-13.1 | 自动触发第一阶段是守卫的起点——pipeline 创建即启动，不依赖人工 |
| AC-13.2 | 阶段完成后自动评估门禁并推进是守卫的核心循环——只有当前阶段通过，才能进入下一阶段 |
| AC-13.5 | 推进决策的结构化记录是守卫可审计的基础——阻断时必须有证据 |
| AC-13.6 | 编排与派发分离是产品化的前提——守卫逻辑在 PipelineEngine 内，不绑死 OpenClaw |

### P0 不包含的 AC（归入 P1）

| AC | 理由 |
|----|------|
| AC-13.3 | 自动修复流程依赖 FR-06a Review Fix Loop 完整实现，P0 先做阻断，修复由人工触发 |
| AC-13.4 | 并行阶段的 fork/join 逻辑已在 `parallel-branch.ts` 实现，P0 验证其与守卫的集成即可，不新增并行编排能力 |
| AC-13.7 | 状态查询已通过 `sevo status` CLI 实现，P0 不新增 |
| AC-13.8 | 中断恢复需要持久化扫描 + 定时器，复杂度高，P0 先保证正常流程不跳阶段 |
| AC-13.9 | 多 pipeline 排队是规模化场景，P0 先保证单 pipeline 守卫正确 |

---

## 3. P0 用户故事

### 场景：陌生用户装完 SEVO 后，流水线如何自动阻止跳阶段

```
作为一个刚装完 sevo-pipeline 的陌生用户，
当我通过 `sevo fr add myproject "实现用户登录"` 创建了一条 pipeline，
系统自动路由为 L1 级别，必经阶段为 [spec, spec-review-gate, contract, implement, review, smoke-test, verify, ledger]。

此时：
1. PipelineEngine 自动将 spec 阶段标记为 active，通过 Adapter 触发 spec 阶段执行。
2. 如果主会话（或任何调用方）试图直接派发 implement 阶段的任务：
   → PipelineEngine 的 task:spawn hook 拦截该请求
   → 检测到 implement 阶段状态为 pending（前置阶段 spec 尚未 passed）
   → 返回阻断结果：拒绝执行，附带原因"当前阶段为 spec，implement 的前置条件未满足"
   → 推进决策记录写入 events.jsonl
3. 只有当 spec 阶段完成 → spec-review-gate 通过 → contract 完成 → 
   PipelineEngine 才会自动激活 implement 阶段并通过 Adapter 触发执行。

整个过程中，用户不需要知道阶段顺序规则——PipelineEngine 自动执行守卫。
```

### 守卫的三个执行点

1. **入口守卫**（pipeline 创建时）：自动激活第一个阶段，其余阶段锁定为 pending。
2. **推进守卫**（阶段完成时）：`subagent_ended` hook 触发 `advance()`，评估门禁，只有通过才激活下一阶段。
3. **拦截守卫**（任务派发时）：`task:spawn` hook 校验目标阶段是否为 active，非 active 则拒绝。

---

## 4. P0 与 P1 的边界说明

| 维度 | P0（阶段推进守卫） | P1（完整编排引擎） |
|------|-------------------|-------------------|
| 核心能力 | 阻止跳阶段 + 自动推进 | 自动修复 + 中断恢复 + 多 pipeline 排队 |
| 门禁评估 | 调用已有 GateEngine，通过/不通过二元判定 | 门禁失败自动触发 Fix Loop |
| 并行阶段 | 复用已有 parallel-branch 逻辑 | 新增并行编排策略配置 |
| 状态查询 | 复用已有 `sevo status` | 驾驶舱实时推送 |
| 中断恢复 | 不处理（Gateway 重启后需手动 `sevo resume`） | 自动扫描 + 60s 内恢复 |
| 多 pipeline | 不处理（单 pipeline 场景） | 优先级排队 + 资源竞争管理 |
| 修复流程 | 门禁失败 → 阻断 + 记录，人工介入修复后 `sevo resume` | 自动触发 FR-06a |

---

## 5. 与现有已实现代码的关系

### 已有（可直接复用）

| 模块 | 文件 | 能力 |
|------|------|------|
| Stage State Machine | `src/pipeline/stage-machine.ts` | 状态转换规则（pending→active→passed/failed/blocked），`assertTransition` 强制合法转换 |
| Parallel Branch | `src/pipeline/parallel-branch.ts` | 阶段前置依赖关系定义，`getActivatableStages()` 计算可激活阶段 |
| PipelineEngine.create() | `src/pipeline/pipeline-engine.ts` | 创建 pipeline + 自动激活第一阶段（AC-13.1 部分实现） |
| PipelineEngine.advance() | `src/pipeline/pipeline-engine.ts` | 标记阶段通过/失败 + 激活下一阶段（AC-13.2 内部逻辑已有） |
| Event Ledger | `src/pipeline/ledger.ts` | 事件追加写入 events.jsonl（AC-13.5 持久化基础已有） |
| PluginAdapter | `src/plugin-adapter/plugin-adapter.ts` | Hook 注册框架（before_prompt_build, subagent_ended, task:spawn） |
| GateEngine | `src/gate/gate-engine.ts` | 门禁规则评估 |
| SevoTag Protocol | `src/plugin-adapter/plugin-adapter.ts` | 标签解析 `sevo:<pipelineId>:<stageId>:<attempt>` |

### 需新增

| 模块 | 说明 |
|------|------|
| **Stage Gate Guard**（拦截守卫） | 在 `task:spawn` hook 中新增逻辑：解析目标任务的 SevoTag → 查询 pipeline 状态 → 校验目标 stageId 是否为 active → 非 active 则返回 blocked + 原因。这是 P0 的核心新增代码。 |
| **Advance-on-Complete 闭环** | 在 `subagent_ended` hook 中补全：解析完成任务的 SevoTag → 调用 `PipelineEngine.advance()` → 根据返回的 `StageTransition` 通过 Adapter 触发下一阶段。当前 plugin-adapter 有框架但未完整串联 advance → trigger-next 的闭环。 |
| **推进决策日志** | 在 advance() 和 Stage Gate Guard 中，每次推进/阻断决策写入结构化事件（type: `advance_decision`），包含 fromStage、toStage、verdict、reason、timestamp。 |
| **Adapter.triggerStage()** | HostAdapter 接口中补充 `triggerStage(pipelineId, stageId)` 方法，由 PipelineEngine 调用，具体实现由宿主环境提供。OpenClaw Adapter 实现为通过 host API 派发子 Agent 任务。 |

### 需修改

| 模块 | 修改内容 |
|------|----------|
| `plugin-adapter.ts` | `task:spawn` handler 中加入 Stage Gate Guard 调用；`subagent_ended` handler 中加入 advance-on-complete 调用 |
| `pipeline-engine.ts` | `advance()` 返回值增加 `nextTriggered: boolean` 字段，表示是否已通过 Adapter 触发了下一阶段 |

---

## 总结

P0 的本质是三行代码逻辑的产品化：

1. **创建时锁定**：只有第一个阶段是 active，其余全部 pending
2. **完成时推进**：当前阶段 passed → 评估门禁 → 激活下一个
3. **派发时拦截**：目标阶段不是 active → 拒绝

这三个点串起来，流水线的阶段顺序就不可能被绕过。现有代码已经实现了 1 和 2 的内部逻辑，P0 的核心工作是把 3（拦截守卫）补上，并把 1→2→3 串成一个在 npm 包中开箱即用的闭环。
