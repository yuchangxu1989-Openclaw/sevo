# FR-13 PipelineEngine P1 架构审查报告

OpenClaw（audit-01 子Agent）｜2026-05-23

---

## 审查对象

`docs/architecture/fr13-pipeline-engine-p1-architecture.md`

## 参考文档

- P1 scope：`docs/design/fr13-pipeline-engine-p1-scope.md`
- P0 架构：`docs/architecture/fr13-pipeline-engine-p0-architecture.md`
- SEVO spec：`docs/product-requirements.md`（FR-13 AC-13.1 ~ AC-13.9）
- 现有代码：`src/pipeline/`、`src/engine/`、`src/scan/`、`src/adapter/`

---

## 结论：CONDITIONAL PASS

P1 架构整体设计合理，四个工作项均有模块设计、接口定义、数据流和错误处理。但存在 1 个 P0 阻断问题（回退时 passed→active 转换未定义）和 3 个 P1 问题需在编码前修复。

---

## P0 问题（阻断编码，必须修复）

### P0-1：阶段回退时 `passed → active` 转换未定义

**位置**：§4 AC-13.4 阶段回退机制 / §4.2 状态转换

**问题**：回退机制要求将目标阶段（已完成的 N-1）重置为 `active`。但当前状态机中 `passed` 是终态（`passed: []`，无出口转换），P1 状态机扩展表也未添加 `passed → active` 转换。

当前 `stage-machine.ts` 定义：
```typescript
passed: [],   // 终态，不可转出
skipped: [],  // 终态，不可转出
```

P1 scope §5 状态机扩展摘要只新增了 `fix_pending` 和 `rolled_back`，未修改 `passed` 的出口。

**影响**：`StageRollback.execute()` 调用 `assertTransition(record.status, 'active')` 时，若目标阶段为 `passed`，会抛出 `Invalid stage transition: passed → active` 异常。回退机制完全不可用。

**建议修复方案**（三选一）：
1. 在状态机中添加 `passed → active` 转换（最简单，但破坏"终态"语义，需评估对 `isComplete()` 等逻辑的影响）
2. 新增专用转换 `passed → 'rollback-pending'`，再 `rollback-pending → active`（保持终态语义，但增加复杂度）
3. 回退时不走 `assertTransition`，而是用 `forceReactivate()` 方法直接重置状态（绕过状态机校验，需要明确标注为特殊路径并写事件记录）

无论选哪种，必须在架构文档中明确定义并更新状态转换表。

---

## P1 问题（编码前应修复）

### P1-1：修复任务完成后的识别与路由机制未定义

**位置**：§3.3 数据流 / §3.4 集成点

**问题**：`advance-on-complete.ts` 当前通过 SevoTag 识别 `subagent_ended` 事件属于哪个 pipeline/stage。修复任务（fix task）完成时，`advance-on-complete` 需要区分"这是修复任务的完成"还是"这是正常阶段任务的完成"，以便路由到 `fixLoop.onFixComplete()` 而非正常推进路径。

文档未指定：
- 修复任务携带什么标识（SevoTag 变体？特殊 label 前缀？独立的 taskId 注册表？）
- `advance-on-complete` 如何判断一个 completion 属于 fix loop
- `FixLoopState` 中的 `taskId` 如何与 `subagent_ended` 事件关联

**建议**：在 §3.4 集成点中明确定义修复任务的标识策略。推荐方案：`dispatchFixTask` 返回的 taskId 存入 `FixLoopState`，`advance-on-complete` 在处理 completion 前先查询当前 pipeline 是否有 `fix_pending` 阶段且 taskId 匹配，匹配则路由到 fix loop。

### P1-2：文件路径与实际代码结构不一致

**位置**：§1 总览 文件路径表

**问题**：P1 文档将新增文件放在 `src/pipeline/fix-loop.ts` 和 `src/pipeline/stage-rollback.ts`。但 P0 实现中，同类编排逻辑文件（`advance-on-complete.ts`、`stage-gate-guard.ts`、`advance-decision-log.ts`）实际位于 `src/engine/` 而非 `src/pipeline/`。

实际代码结构：
- `src/pipeline/`：核心状态管理（pipeline-engine.ts、stage-machine.ts、parallel-branch.ts、ledger.ts）
- `src/engine/`：编排逻辑（advance-on-complete.ts、stage-gate-guard.ts、stage-standards-loader.ts）

fix-loop 和 stage-rollback 属于编排逻辑，应与 advance-on-complete 同层。

**建议**：将 `fix-loop.ts` 和 `stage-rollback.ts` 的路径改为 `src/engine/fix-loop.ts` 和 `src/engine/stage-rollback.ts`，与现有编排模块保持一致。或者明确说明为何选择放在 `src/pipeline/`（如果有设计意图）。

### P1-3：`onFixComplete` 返回 `'advance'` 后的推进流程不完整

**位置**：§3.2 fix-loop.ts 核心接口 / §3.3 数据流

**问题**：`onFixComplete()` 返回 `'advance' | 'retry' | 'rollback'`。对于 `'advance'` 情况，数据流描述为：
```
passed: stage → active → advance()
```

但 `advance()` 方法签名为 `advance(pipelineId: string, stageResult: StageResult): StageTransition`，需要一个 `StageResult`（含 stageId、outcome、artifacts）。文档未说明：
- 谁构造这个 `StageResult`？是 `onFixComplete` 的调用者？
- `outcome` 是什么？是 gate 重新评估的结果（'passed'）？
- `artifacts` 从哪来？是修复任务产出的新 artifacts？

**建议**：在 §3.3 数据流中补充 `'advance'` 路径的完整调用链：
```
onFixComplete returns 'advance'
  → caller 构造 StageResult { stageId, outcome: 'passed', artifacts: fixResult.artifacts }
  → stage.status: fix_pending → active（需要先转换）
  → engine.advance(pipelineId, stageResult)
```

同时需要明确 `fix_pending → active` 转换是在 `onFixComplete` 内部完成还是由调用者完成。

---

## P2 问题（记待办）

### P2-1：`ScanMappingGenerator` 的 LLM 输出校验未定义

§2.4 生成流程只说"LLM prompt → 输出 FR→文件映射 JSON"，未定义：
- 如何校验 LLM 输出的文件路径是否真实存在
- 如何处理 LLM 幻觉（映射到不存在的文件）
- 输出 JSON schema 校验失败时的降级策略

建议在实现时加入：生成后逐条验证文件存在性，不存在的条目标记 `confidence: 0` 并 warn。

### P2-2：并行阶段场景下的回退目标解析

§4.1 `resolveTarget()` 说"requiredStages 前一阶段"，但 `requiredStages` 是有序数组，可能包含并行阶段（如 `ux-acceptance` 和 `pm-commercial-review` 同时存在）。如果失败阶段的前驱是一组并行阶段，回退到哪个？回退后是否需要重新执行所有并行前驱？

当前设计对线性流水线足够，并行场景可在 P2 补充。

### P2-3：fix task 执行失败（非 gate 失败）的处理

§3.3 数据流只覆盖了"修复任务完成后 gate 重新评估"的路径。未覆盖：
- 修复任务本身执行失败（agent crash、timeout）
- 修复任务完成但未产出预期 artifacts

建议：fix task 执行失败视为一次 attempt（outcome: 'task_failed'），计入重试计数。

### P2-4：`dispatchFixTask` 与现有 `dispatchTask`/`spawnTask` 的关系

host-adapter 已有 `dispatchTask(stage, payload)` 和 `spawnTask?(agentId, task, options)`。P1 新增 `dispatchFixTask?(pipelineId, stageId, prompt)`。三者职责边界不清晰。建议在文档中说明为何不复用现有接口，或考虑统一为 `dispatchTask` 加 `type: 'fix'` 参数。

---

## P3 问题（低优先级建议）

### P3-1：postinstall 中 `PARTIAL_ENV` 变量的测试覆盖

§5 postinstall 三层降级设计清晰，但建议在验收标准中增加：模拟 `openclaw.json` 存在但格式损坏的场景（JSON parse error），确认不会 die。

### P3-2：`FixLoopConfig.fixTimeoutMs` 的默认值和超时行为

接口定义了 `fixTimeoutMs` 但未说明默认值和超时后的行为。建议明确：默认 600s，超时视为 attempt 失败。

---

## 各维度总结

| 维度 | 评价 |
|------|------|
| 完整性 | 4 个工作项均有模块设计、接口、数据流、集成点、错误处理。Scan 和 Postinstall 最完整，Fix Loop 和 Rollback 有关键路径缺失 |
| 一致性 | 文件路径与实际代码结构有偏差（P1-2）；状态机扩展与现有终态语义冲突（P0-1） |
| 正确性 | 回退机制存在不可执行的状态转换（P0-1）；fix loop 推进路径不完整（P1-3） |
| 约束遵守 | Scan 语义验证正确走 LLM（✓）；Postinstall 降级合理（✓）；无关键词/正则冒充语义理解 |
| 可实现性 | Scan 和 Postinstall 可直接编码；Fix Loop 需补充任务识别机制（P1-1）；Rollback 需先解决 P0-1 |

---

## 修复优先级建议

1. **P0-1**（必须）：确定回退时 passed 阶段的重激活策略，更新状态机转换表
2. **P1-1**（强烈建议）：定义 fix task 的标识和路由机制
3. **P1-2**（建议）：统一文件路径到 `src/engine/`
4. **P1-3**（建议）：补充 advance 路径的完整调用链

P0-1 解决后即可开始编码（先 Postinstall → Scan → Fix Loop → Rollback）。
