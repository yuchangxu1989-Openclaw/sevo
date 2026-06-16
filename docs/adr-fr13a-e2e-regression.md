# ADR：FR-13a E2E 全链路回归测试架构设计

OpenClaw（sa-02 子Agent）  
2026-06-14

## 1. 结论

FR-13a 采用“Regression 阶段内创建一次隔离自测流水线”的方案。

当 SEVO 自身的编排相关代码发生变化时，正常业务流水线执行到 `regression` 阶段，由 Regression 阶段判定是否需要 E2E 自测。命中触发范围后，Regression 阶段创建一个带自测元数据的子流水线，子流水线按 10 阶段顺序完整跑完：

`spec → spec-review-gate → plan → plan-review-gate → implement → implement-review-gate → regression → deploy → verify → ledger`

自测流水线必须复用真实 PipelineEngine、阶段推进、completion 回填、gate 评价、advance prompt 生成和 Ledger 写入语义；隔离点只放在测试项目、测试 adapter、测试产物目录和测试 Ledger。自测失败时，父流水线的 `regression` 阶段进入现有 fix loop，不允许继续进入 `deploy`、`verify`、`ledger`。

## 2. 背景

FR-13 定义 PipelineEngine 是 SEVO 的统一编排核心：创建流水线生命周期记录、推进阶段、处理 completion、评估 gate、触发修复循环、持久化状态、写 Ledger，并生成下一阶段 advance prompt。

FR-13a 要验证的是这条编排链路本身是否端到端可用。它不是普通单元测试，也不是只调用 CLI 的轻量 smoke test。它要证明 SEVO 在真实自动推进语义下，可以从 `spec` 一直走到 `ledger`，中间不靠人工改状态、不靠人工补 Ledger、不靠手动跳阶段。

现有代码里同时存在两类相关机制：

- `src/stage-policy.js` 已定义抽象 10 阶段链：`spec`、`spec-review-gate`、`plan`、`plan-review-gate`、`implement`、`implement-review-gate`、`regression`、`deploy`、`verify`、`ledger`。
- `src/pipeline/pipeline-engine.ts` 提供运行态 PipelineEngine，处理阶段 completion、失败进入 `fix_pending`、fix loop 成功后继续推进、重试耗尽后 rollback。
- `src/engine/advance-on-complete.ts` 把子任务 completion 转成 StageResult，再调用 PipelineEngine.advance，并在通过后触发下一阶段。
- `src/plugin-adapter/plugin-adapter.ts` 解析 SEVO label 和 metadata，连接 OpenClaw hook、host adapter、stage gate 和 advance-on-complete。
- `src/run-store.js` 维护 V2 pipeline run 状态、active index 和 Ledger 路径。

## 3. 目标

FR-13a 的架构目标有四个：

1. 自动触发：SEVO 编排相关变更在回归阶段自动创建 E2E 自测流水线。
2. 防递归：自测流水线运行到 `regression` 时不会再次创建新的自测流水线。
3. 失败闭环：自测失败进入修复循环，由 SEVO 自己推进修复和复验，不靠人工跳过。
4. 隔离可验：自测不污染业务项目和真实发布，但必须验证真实编排语义。

## 4. 触发边界

### 4.1 触发时机

E2E 自测只在父流水线执行到 `regression` 阶段时创建。

原因：

- `regression` 是进入发布链路前的质量门禁位置。
- 此时 `implement` 和 `implement-review-gate` 已经完成，变更内容已有审计结果。
- 自测结果可以直接决定父流水线是否能继续进入 `deploy`。

### 4.2 触发主体

触发主体是 Regression 阶段处理器，或由 Regression 阶段调用的 `E2ERegressionOrchestrator`。

职责边界：

- Regression 阶段负责读取父流水线上下文、判断触发范围、创建自测流水线、等待自测结果、生成 regression artifact。
- PipelineEngine 仍只负责通用阶段推进，不写死 FR-13a 规则。
- HostAdapter 仍只负责派发任务和接收 completion，不判断业务触发策略。

### 4.3 触发范围

命中以下变更时必须触发 FR-13a：

- PipelineEngine 与阶段推进：`src/pipeline/`、`src/engine/` 中影响 create、advance、completion、rollback、fix loop 的代码。
- Host Adapter 与插件桥接：`src/plugin-adapter/`、`src/adapter/`、completion handler、task spawn、label/metadata 解析相关代码。
- Stage 与 gate：`src/stages/`、`src/gate/`、`src/gates/`、stage policy、stage config、stage standards。
- Ledger 与运行态状态：`src/run-store.js`、ledger 写入、active pipeline index、pipeline state/event 持久化。
- SEVO pipeline 命令与路由：`src/pipeline-commands.js`、`sevo:create`、`sevo:fix`、stage dispatch contract。
- FR-13 / FR-13a 相关 spec、架构文档或测试契约变更。

不触发 FR-13a 的范围：

- 业务项目代码变更，例如 ACO、KIVO、AEO、Claw Design 的产品代码。
- 纯文案、README、非编排相关说明文档。
- 与 SEVO 编排无关的静态资源、样式、演示材料。
- 已带 `metadata.sevo.selfTest.isSelfTest=true` 的自测流水线。

触发判断采用文件路径和 pipeline metadata 的组合。路径只能作为入口过滤，最终仍要以父流水线的变更摘要和 stage artifact 为证据写入 regression report。

## 5. 自测流水线创建

### 5.1 创建方式

父流水线进入 `regression` 后，Regression 阶段执行以下动作：

1. 读取父流水线 state、变更摘要、artifact 列表和触发原因。
2. 判断是否命中 FR-13a 触发范围。
3. 未命中时写入“FR-13a skipped” artifact，父 `regression` 通过。
4. 命中时创建一条自测流水线，写入自测 metadata。
5. 自测流水线按 10 阶段 strict stage plan 运行。
6. 自测完成后生成 `docs/e2e-pipeline-regression-report.json`。
7. 自测通过则父 `regression` 通过；自测失败则父 `regression` 失败并进入 fix loop。

### 5.2 自测 metadata

自测流水线创建时必须写入 metadata。建议结构：

```json
{
  "sevo": {
    "selfTest": {
      "isSelfTest": true,
      "kind": "fr13a-e2e-regression",
      "depth": 1,
      "parentPipelineRunId": "<parent-run-id>",
      "parentStageId": "regression",
      "triggerReason": "pipeline-engine-change",
      "triggeredByPaths": ["src/pipeline/pipeline-engine.ts"],
      "reportPath": "docs/e2e-pipeline-regression-report.json"
    }
  }
}
```

字段语义：

- `isSelfTest`：防递归主标记。
- `kind`：区分未来其他自测类型。
- `depth`：递归深度，FR-13a 固定为 1。
- `parentPipelineRunId`：回填父 regression artifact 和修复循环用。
- `triggerReason`：写入报告，便于审计追踪。
- `triggeredByPaths`：触发证据。
- `reportPath`：固定指向 spec 要求的报告路径。

### 5.3 10 阶段 stage plan

自测流水线必须使用固定 stage plan：

```json
{
  "ordered": [
    "spec",
    "spec-review-gate",
    "plan",
    "plan-review-gate",
    "implement",
    "implement-review-gate",
    "regression",
    "deploy",
    "verify",
    "ledger"
  ],
  "skipped": []
}
```

任何阶段缺失都算 FR-13a 失败。任何阶段跳过也算失败，除非 spec 未来明确允许某个阶段在自测模式下以等价检查替代。

## 6. 防递归方案

### 6.1 递归风险

自测流水线本身也会跑到 `regression`。如果 Regression 阶段只按“SEVO 编排代码发生变化”判断，它会在自测内再次创建自测流水线，形成无限递归。

### 6.2 防递归规则

Regression 阶段开始时先检查当前 pipeline metadata：

- `metadata.sevo.selfTest.isSelfTest === true`：当前 pipeline 是自测流水线。
- `metadata.sevo.selfTest.kind === "fr13a-e2e-regression"`：当前自测类型是 FR-13a。
- `metadata.sevo.selfTest.depth >= 1`：已经进入自测深度。

命中以上条件时，Regression 阶段不得创建新的自测流水线。它只执行“自测内 regression 检查”：

- 验证当前 self-test run 的前序阶段状态完整。
- 验证每个非终态阶段都产生过 advance prompt 或等价 dispatch 记录。
- 验证 completion 回填进入 PipelineEngine.advance。
- 验证 gate stage 的 verdict 被记录。
- 写入自测内 regression artifact。
- 返回当前自测 `regression` 阶段结果。

### 6.3 双保险

防递归不只靠一个布尔值。编码时应同时设置三层保护：

1. 创建自测流水线时写入 `isSelfTest=true` 和 `depth=1`。
2. Regression 阶段入口遇到 `isSelfTest=true` 直接禁止创建子自测。
3. 创建自测流水线前检查父链路，发现已有 `kind=fr13a-e2e-regression` 的 ancestor 时拒绝创建，并记录 advisory artifact。

如果 metadata 丢失但 pipelineId 或 task label 带有 self-test 前缀，也只能作为兜底信号。权威判断必须来自 metadata。

## 7. 失败处理与修复循环

### 7.1 失败分类

FR-13a 自测失败分为四类：

- 创建失败：无法创建自测 pipeline、stage plan 非 10 阶段、metadata 缺失。
- 推进失败：某个阶段没有自动激活、completion 没有推进下一阶段、advance prompt 缺失。
- gate 失败：`spec-review-gate`、`plan-review-gate`、`implement-review-gate` 任一未通过。
- 收尾失败：`deploy`、`verify`、`ledger` 未完成，或 Ledger/report 缺失。

### 7.2 父流水线处理

只要自测未达到 `completed`，父流水线的 `regression` 阶段必须返回 failed。

父 PipelineEngine 现有失败语义已经是进入 `fix_pending`，不是写死终态 failed。FR-13a 应复用这个机制：

1. Regression 阶段返回 failed，并附带 `docs/e2e-pipeline-regression-report.json`。
2. PipelineEngine 将父 `regression` 标记为 `fix_pending`。
3. fix loop 根据报告内容派发修复任务。
4. 修复完成后重新执行父 `regression`。
5. 重新创建新的 self-test run，或在能证明修复只影响自测环境时复用同一 run 的 retry 记录。
6. 自测通过后父 `regression` 才能通过，并继续 `deploy`。

父流水线不得因为“SEVO 永远向前走”而跳过 FR-13a 的失败。这里的“向前走”体现为自动进入修复循环，不是放行失败。

### 7.3 自测流水线处理

自测流水线内部也复用标准失败语义：

- gate 失败进入自测 run 的 gate fix loop。
- 非 gate 阶段失败进入对应阶段 fix loop。
- fix loop 成功后继续推进。
- retry 耗尽后按现有 rollback/repair-required 语义记录。

父 regression 等待自测 run 的最终状态。如果自测 run 停在 `fix_pending`、`repairing`、`repair-required`、`stale`、`cancelled`，父 regression 都视为失败。

### 7.4 报告要求

`docs/e2e-pipeline-regression-report.json` 是父 regression 的核心 artifact。报告至少包含：

```json
{
  "schemaVersion": 1,
  "kind": "fr13a-e2e-regression",
  "parentPipelineRunId": "<id>",
  "selfTestPipelineRunId": "<id>",
  "triggered": true,
  "triggerReason": "pipeline-engine-change",
  "triggeredByPaths": [],
  "selfTestMetadata": {
    "isSelfTest": true,
    "depth": 1
  },
  "stagePlan": [
    "spec",
    "spec-review-gate",
    "plan",
    "plan-review-gate",
    "implement",
    "implement-review-gate",
    "regression",
    "deploy",
    "verify",
    "ledger"
  ],
  "stageResults": [],
  "advancePrompts": [],
  "ledgerEvents": [],
  "recursionPrevented": true,
  "status": "passed",
  "failureReason": null,
  "createdAt": "<iso>",
  "completedAt": "<iso>"
}
```

失败报告必须写清第一个失败点、所属阶段、缺失证据和下一步修复建议。修复建议是给 fix loop 的输入，不写成对用户的口头解释。

## 8. 隔离策略

### 8.1 必须真实复用的部分

FR-13a 要验证 SEVO 编排本体，以下部分必须走真实路径：

- PipelineEngine create / advance / rollback / fix loop。
- advance-on-complete 对 completion event 的解析和状态推进。
- stage label 与 metadata 解析。
- gate verdict 记录。
- advance prompt 生成。
- host adapter 的 triggerStage / spawnTask 语义。
- run-store state、active index、ledger 写入。
- 最终 `completed` 判定。

这些部分不能 mock 掉，否则 E2E 自测失去意义。

### 8.2 必须隔离的部分

以下部分必须隔离，避免污染业务环境：

- 项目：使用固定测试项目，例如 `sevo-selftest`，不绑定真实用户项目。
- 工作目录：使用临时测试 workspace 或 `projects/sevo/.sevo-selftest/` 之类的隔离目录。
- 产物：所有自测 artifact 写入自测 run 目录，再由父 regression 汇总到报告。
- Ledger：写测试 run 的 Ledger；父流水线只记录 regression artifact 和最终判定。
- Deploy：自测 `deploy` 只能执行 no-op deploy adapter，验证 deploy 阶段被调度和完成，不做真实发布。
- 外部动作：自测不得发 npm publish、GitHub push、Gateway restart、openclaw.json 修改、真实飞书文档授权等外部写动作。

### 8.3 Adapter 分层

建议新增或扩展一个 self-test adapter：

- 对 stage dispatch 使用真实 HostAdapter 接口。
- 对危险外部动作使用 test double。
- 对 completion 仍生成真实 completion event，走 advance-on-complete。
- 对 deploy/verify/ledger 输出可验证 artifact。

这样可以保留编排链路真实性，同时避免自测造成线上副作用。

## 9. 数据流

1. 父业务流水线进入 `regression`。
2. Regression 阶段判断变更范围命中 FR-13a。
3. Regression 阶段创建 self-test run，写入 metadata。
4. self-test run 激活 `spec`，产生 advance prompt 和 dispatch 记录。
5. stage 完成后触发 completion event。
6. advance-on-complete 调用 PipelineEngine.advance。
7. PipelineEngine 激活下一阶段。
8. HostAdapter 派发下一阶段。
9. 重复直到 `ledger` 完成。
10. self-test run 写 Ledger 和 completed 状态。
11. Regression 阶段汇总 self-test state、events、ledger、artifacts。
12. 生成 `docs/e2e-pipeline-regression-report.json`。
13. 父 regression 根据报告返回 passed 或 failed。
14. 父 PipelineEngine 决定继续 deploy 或进入 fix loop。

## 10. 状态机

父 regression 状态：

- `active`：开始判断触发范围。
- `passed`：未触发，或自测完成且报告通过。
- `fix_pending`：自测失败，等待修复循环。

自测流水线状态：

- `running`：10 阶段推进中。
- `completed`：10 阶段全部 terminal 且 Ledger/report 完整。
- `fix_pending`：某阶段失败，正在修复。
- `repair-required`：修复耗尽，需要上层记录失败。
- `cancelled/stale`：视为自测失败。

## 11. 验收标准

编码完成后，FR-13a 通过条件如下：

1. 对 SEVO 编排相关变更，父流水线到 `regression` 时自动创建 self-test run。
2. self-test run metadata 包含 `isSelfTest=true`、`kind=fr13a-e2e-regression`、`depth=1`、父 run 引用。
3. self-test run 使用固定 10 阶段 stage plan，且 `skipped=[]`。
4. self-test run 每个非终态阶段都有 advance prompt 或等价 dispatch 记录。
5. self-test run 的 completion 通过 advance-on-complete 回填 PipelineEngine。
6. self-test run 到 `regression` 时不创建新的 self-test run，并在报告中记录 `recursionPrevented=true`。
7. self-test run 最终到达 `completed`。
8. Ledger 或 test Ledger 包含每个阶段的状态转移记录。
9. 生成 `docs/e2e-pipeline-regression-report.json`。
10. 自测失败时父 `regression` 进入 fix loop，不进入 `deploy`。
11. 非触发范围的业务项目回归不会创建 self-test run。
12. 自测 deploy 不做真实发布，自测不会修改 `openclaw.json`。

## 12. 实现落点建议

后续编码可以按以下模块分工：

- `RegressionStage`：接入 FR-13a 触发判断、self-test 创建、结果汇总。
- `E2ERegressionOrchestrator`：封装自测 run 创建、等待、报告生成。
- `run-store` 或 pipeline run schema：增加 metadata 持久化。
- `stage-policy`：暴露 10 阶段 self-test stage plan 常量。
- `PluginAdapter` / completion handler：确保 metadata 贯穿 label、spawn、completion。
- `HostAdapter`：提供 self-test adapter 或 test-mode spawn 行为。
- `Ledger`：区分父流水线 Ledger 和 self-test run Ledger。
- `tests`：覆盖触发范围、防递归、失败 fix loop、隔离 deploy。

## 13. 风险与约束

- metadata 丢失会导致递归风险，所以创建、dispatch、completion 三处都要传递 self-test metadata。
- 如果 self-test adapter mock 掉 PipelineEngine 或 advance-on-complete，测试会变成伪 E2E。
- 如果 deploy 阶段不隔离，测试可能触发真实发布，必须用 no-op deploy adapter。
- 如果父 regression 对失败直接放行，FR-13a 会失去门禁价值。
- 如果只检查最终 completed，不检查中间 advance prompt 和 Ledger，无法证明 10 阶段自动推进真实发生。

## 14. 架构决策

采用“父 regression 创建隔离 self-test 子流水线”的决策。

理由：

- 触发点自然落在发布前质量门禁。
- 能复用现有 PipelineEngine 和 fix loop。
- 防递归可以用 metadata 明确表达。
- 隔离边界清晰，自测不污染业务项目和真实发布。
- 报告能同时服务父 regression 判定、审计追踪和后续修复 prompt。

不采用独立 cron 自测作为 FR-13a 主路径。cron 可以补充巡检，但不能替代 regression 阶段内的门禁，因为它无法证明“本次变更在进入发布前已经通过端到端编排验证”。
