# SEVO Stage-Gate Architecture

**署名**：SA-01（OpenClaw 子Agent）  
**日期**：2026-06-10

## 结论

SEVO 的阶段推进要以 stage-gate 为核心：每次入口创建、阶段派发、阶段完成、审计循环、终局交付，都先经过统一门禁计算。门禁只产出 advisory、evidence、next-action，不把流水线改成 paused 或 blocked。流水线继续向前走，质量问题进入审计与修复循环。

门禁逻辑集中在一个 Stage Gate Kernel，入口、命令、completion、prompt 注入只调用它，不各自散落判断。这样可以保留现有状态机、label、completion 自动推进、review-fix 循环，也能补上 spec 核实、一致性闭环、文档驱动、无差别覆盖、审计不可跳过、全阶段存在这些缺口。

## 设计原则

1. 门禁集中，执行分散。统一计算阶段准入、准出和 advisory，各模块只消费结果。
2. 永远向前走。缺口记录为 advisory，进入后续审计与修复，不制造等待外部 resume 的终态。
3. 代码只做可机械验证的检查。存在性、阶段链、label、artifact、status、配置、必经阶段、防跳审计由代码做。
4. 审计 Agent 做语义判断。FR/AC 是否被真正满足、实现和 spec 是否一致、文档是否误导、测试是否有效，由审计 Agent 做。
5. 每个阶段都有准入和准出。阶段存在不等于必须重做全部工作，入口可从任意阶段开始，但前置阶段必须留下 pass/no-change review 或 advisory。
6. 文档按需注入。操作手册不常驻塞满 prompt，按阶段和风险命中后注入最小必要片段。
7. 兼容现有实现。当前 7 个核心模块保留职责，新增能力通过依赖注入和 additive 模块接入，避免推翻现有 356 条测试覆盖的正确行为。

## 模块划分图

文字版调用图：

```text
Gateway Hooks
  command / before_prompt_build / subagent_ended / message_received
        |
        v
Pipeline Controller
  - index.js
  - pipeline-commands.js
  - completion-handler.js
        |
        v
Stage Gate Kernel
  - gate-registry
  - gate-runner
  - advisory-store
  - evidence-ledger
        |
        +--> Spec Gate
        +--> Consistency Gate
        +--> Manual Gate
        +--> Audit Integrity Gate
        +--> Stage Plan Gate
        +--> Universal Route Gate
        |
        v
Run Store
  - state.json
  - ledger.jsonl
  - active-index.json
        |
        v
Prompt Injector / Advance Prompt
        |
        v
Main Agent dispatches stage Agent
        |
        v
Review-Fix Loop
```

## 核心模块职责

### Pipeline Controller

职责：承接 Gateway 事件，创建 run，接收 completion，生成下一阶段派发建议。

现有对应模块：`index.js`、`pipeline-commands.js`、`completion-handler.js`、`prompt-injector.js`。

调整方向：不在 controller 内写复杂门禁规则，只在关键时机调用 Stage Gate Kernel，并把 gate advisory 写入 run ledger。

调用时机：

- `command`：显式 `sevo:*` 命令进入时，调用 entry gate。
- `message_received` 或同等普通消息 hook：普通研发消息进入时，调用 universal route gate。
- `before_prompt_build`：生成派发提示前，调用 dispatch gate 和 manual gate。
- `subagent_ended`：阶段完成后，调用 exit gate 和 audit integrity gate。

### Stage Gate Kernel

职责：统一计算阶段准入、准出、advisory 和下一步动作。

它只返回结构化结果：

```json
{
  "gateId": "spec-coverage",
  "stageId": "implement",
  "severity": "info|warn|must-review",
  "status": "pass|advisory|fail-recoverable",
  "message": "spec 缺少 AC 覆盖",
  "evidence": ["docs/product-requirements.md", "artifact path"],
  "recommendedActions": ["parallel-spec-fix", "audit-must-check"],
  "nonBlocking": true
}
```

`fail-recoverable` 不终止 pipeline。它表示后续 review 或 fix 必须引用该问题。

### Gate Registry

职责：登记每个阶段需要运行哪些 gate。

每条 gate 有四个字段：

- `appliesTo`：入口、派发、完成、审计、发布、任意消息。
- `mechanicalChecks`：代码可验证的检查。
- `agentChecks`：需要 Agent 判断的检查。
- `advisoryPolicy`：结果如何写入 ledger、如何进入 prompt、是否触发并行补齐任务。

### Gate Runner

职责：按事件上下文执行 gate，合并结果，做去重和降噪。

它要保证同一 run、同一 stage、同一 gate 的重复 advisory 不刷屏。重复问题更新 `lastSeenAt` 和 evidence，不重复要求派发。

### Advisory Store

职责：保存所有非阻断发现。

建议作为 run-state 的一部分持久化，或者单独写入 `advisories.jsonl`。字段必须包含：runId、stageId、gateId、severity、message、evidence、firstSeenAt、lastSeenAt、resolvedAt、linkedReviewStage。

审计阶段读取 open advisories，逐条给结论：已解决、仍存在、误报、需要修复。未关闭的高严重度 advisory 会触发 fix loop。

### Evidence Ledger

职责：记录阶段产物、测试证据、审计证据、文档证据之间的引用关系。

它不做语义判断，只回答：这个阶段声称完成了哪些 artifact？哪些 gate 看过它们？哪些审计报告引用了它们？

### Spec Gate

职责：检查任意入口是否有可用 spec，以及当前任务是否有 FR/AC/边界/用户视角验收依据。

代码门禁负责：

- spec 文件或飞书镜像是否存在。
- 是否能定位到项目 spec。
- 阶段 prompt 是否携带 spec 路径或 spec token。
- advisory 是否写入 ledger。

审计 Agent 负责：

- 当前任务是否真的被某个 FR/AC 覆盖。
- AC 是否足够验收。
- spec 缺口是否影响实现正确性。
- 是否需要 PM 补 spec。

Spec 缺口处理：并行触发 PM 补齐，主流水线继续推进；review 阶段必须引用 spec advisory。

### Consistency Gate

职责：维护 spec、UX、架构、实现、测试、README、交付证据之间的一致性。

代码门禁负责：

- 六层产物是否存在。
- 每层是否登记 artifact。
- 阶段完成时是否写入 evidence ledger。
- review prompt 是否包含当前 open advisories 和 artifact 列表。

审计 Agent 负责：

- 六层说的是不是同一件事。
- 实现是否满足 spec 的 FR/AC。
- 测试是否覆盖关键 AC。
- README 是否描述真实能力。
- UX/架构是否越界改了核心逻辑。

一致性问题全部进入 review→fix loop。代码不要尝试用关键词匹配判断“语义一致”。

### Manual Gate

职责：按阶段和风险注入操作手册片段。

代码门禁负责：

- 维护阶段到手册片段的索引。
- 在 prompt 注入时按 `stageId + advisory + actionType` 选择最小片段。
- 记录本轮注入了哪些手册引用。
- 手册缺失时产生 advisory。

审计 Agent 负责：

- 手册内容是否和当前 spec、架构、实现一致。
- Agent 是否违反了手册中的必守规则。

注入策略：常驻只保留纪律摘要；具体操作说明按阶段命中后注入，避免 prompt 被静态规则撑爆。

### Audit Integrity Gate

职责：保证审计阶段不可跳过。

代码门禁负责：

- `skip` 禁止跳过 review、audit、spec-review、contract-review、publish-generalization、pm-commercial-review 等保护阶段。
- `from` 和任意阶段入口不能把保护阶段无条件标记 passed。
- 进入后置阶段前，前置保护阶段必须是 passed，或存在 pass/no-change review active 记录。
- review/fix cycle 达到上限后不能沉默停住，必须产生 recovery advisory 并继续给出下一步修复建议。

审计 Agent 负责：

- pass/no-change review 是否成立。
- 被跳过的非保护阶段是否真的不影响当前任务。
- 审计发现的问题是否进入 fix prompt。

### Stage Plan Gate

职责：保证全阶段无条件存在。

代码门禁负责：

- 默认 stagePlan 使用完整阶段链。
- 自定义 stagePlan 必须规范化为完整链：缺失阶段补回 pending 或 no-change-review，不允许消失。
- `stagePlan.skipped` 只允许非保护阶段，并且必须留下 advisory。
- run state 始终能展示完整阶段链状态。

审计 Agent 负责：

- 当前任务哪些阶段可判定 no-change。
- no-change 的依据是否充分。

### Universal Route Gate

职责：覆盖普通研发消息，不只覆盖 `sevo:` 前缀。

代码门禁负责：

- 在普通消息入口调用路由分类器。
- 判断是否属于研发活动：需求、spec、架构、设计、编码、测试、审计、发布、配置、文档。
- 命中后生成或关联 PipelineRun。
- 对低置信结果生成澄清 advisory，而不是拦截用户消息。

审计 Agent 负责：

- 复杂混合意图如何拆成多个阶段任务。
- 用户表达是否需要澄清。

原则 7 的 embedding 接入另行处理。这里的架构只保留分类器接口，不规定具体 embedding 实现。

## 模块间调用关系

### 创建或入口进入

1. Pipeline Controller 接收 `sevo:create`、`sevo:from`、`sevo:implement`、普通研发消息。
2. Universal Route Gate 判断项目、阶段和流水线级别。
3. Stage Plan Gate 规范化完整阶段链。
4. Spec Gate 做 spec 存在性和覆盖初检，写 advisory。
5. Run Store 创建 run，写 state 和 ledger。
6. Prompt Injector 输出当前阶段派发建议，并附带 open advisories。

### 阶段派发前

1. Prompt Injector 读取 active run。
2. Gate Runner 执行 dispatch gates：spec、manual、stage-plan、audit-integrity。
3. Manual Gate 注入必要手册片段。
4. Advance Prompt 带上：当前阶段目标、准入条件、准出标准、open advisories、label、artifact 要求。
5. 主 Agent 派发对应角色 Agent。

### 阶段完成后

1. Completion Handler 解 label，确认 run/stage/attempt 匹配。
2. Run Store 写 artifacts、dispatchId、status。
3. Gate Runner 执行 exit gates：artifact、consistency、audit-integrity。
4. 若 review failed，进入 fix；若 fix passed，回 review。
5. 若阶段 passed，计算下一阶段。
6. Pending advance 写入注入队列，下一轮 prompt 交给主 Agent 派发。

### 审计阶段

1. Review prompt 必须读取 open advisories、evidence ledger、上一阶段 artifacts。
2. 审计 Agent 对每条 advisory 给结论。
3. 未解决问题进入 findings。
4. Completion Handler 根据审计结果触发 fix。
5. Fix prompt 必须引用 findings 和相关 advisory。
6. Fix 完成后回到 review 复验。

## 代码门禁与审计 Agent 边界

代码门禁做这些事：

- 文件、run、stage、label、artifact 是否存在。
- 当前 completion 是否匹配当前 stage 和 attempt。
- 默认阶段链是否完整。
- 保护阶段是否被跳过。
- 自定义 stagePlan 是否缺阶段。
- spec 或手册索引是否可定位。
- prompt 是否携带必要路径、label、准入、准出、advisory。
- advisory 是否持久化，是否进入审计 prompt。
- review/fix 循环是否继续推进。

审计 Agent 做这些事：

- spec 是否真正覆盖当前需求。
- FR/AC 是否被实现满足。
- UX、架构、代码、测试、README 是否一致。
- 测试是否能证明功能有效。
- 文档是否会误导陌生用户。
- no-change review 是否可信。
- advisory 是真问题、误报，还是已解决。

边界判断：能用结构化状态、文件存在、阶段列表、artifact 引用机械判断的，放代码门禁；需要理解用户意图、业务语义、实现效果、文档含义的，交给审计 Agent。

## 对不通过原则的解决方案映射

### 原则 2：Spec 核实

解决方案：新增 Spec Gate。

入口创建、阶段派发、阶段完成都会检查 spec 依据。缺 spec 或覆盖不足时写 advisory，并行触发 PM 补 spec。流水线继续推进，review 阶段必须处理该 advisory。

### 原则 3：一致性闭环

解决方案：新增 Consistency Gate + Evidence Ledger。

代码记录六层产物关系，审计 Agent 判断六层语义一致性。审计发现偏差后进入 fix loop，修复后回 review 复验。

### 原则 6：文档驱动

解决方案：新增 Manual Gate。

常驻注入只保留纪律摘要；阶段命中时按需注入操作手册片段。手册缺失、手册与实现冲突、Agent 未按手册执行，都进入 advisory 或 review finding。

### 原则 7：语义路由

解决方案：保留 Universal Route Gate 对分类器的标准接口。

embedding 接入单独推进。stage-gate 架构要求路由结果结构化进入 run metadata，并在低置信时产生澄清 advisory。

### 原则 9：无差别覆盖

解决方案：新增 Universal Route Gate，接入普通研发消息入口。

`sevo:` 命令仍可用。普通研发消息命中后自动创建或关联 PipelineRun。低置信不阻断对话，只提示澄清或生成 advisory。

### 原则 10：审计不可跳过

解决方案：新增 Audit Integrity Gate。

保护阶段不能 skip。`from` 入口不能把保护阶段直接 passed，只能创建 pass/no-change review 或 advisory。进入后置阶段前，保护阶段必须有审计结论或复验记录。

### 原则 12：全阶段无条件存在

解决方案：新增 Stage Plan Gate。

默认完整阶段链固定存在。自定义 stagePlan 会被补齐成完整链；不适用阶段标记为 pending、no-change-review 或 advisory，不从 run state 消失。

## 阶段链建议

完整链保持当前默认链的方向：

```text
spec
spec-review-gate
test-case-authoring
ux-acceptance-authoring
commercial-acceptance-authoring
ux-interaction-design
architecture-design
contract
contract-review-gate
implement
review
fix
smoke-test
ux-acceptance
pm-commercial-review
regression
publish-generalization-gate
deploy
verify
readme
post-release-validation
clean-install-verification
ledger
```

每个 run 都保留全链状态。任意入口只改变当前 active stage，不删除其他阶段。

## Advisory 生命周期

1. Gate 发现缺口，写 advisory。
2. Prompt Injector 把相关 advisory 注入当前阶段 prompt。
3. Review 阶段逐条处理 advisory。
4. 已解决 advisory 标记 resolved。
5. 未解决 advisory 转成 finding。
6. Fix 阶段处理 finding。
7. Fix 完成后 review 复验。
8. 终局 ledger 阶段输出 advisory 关闭情况。

严重度建议：

- `info`：不影响质量，只作记录。
- `warn`：需要审计确认。
- `must-review`：必须进入 review checklist。
- `recovery`：阶段失败或循环耗尽，需要继续修复动作。

不建议引入 `blocked` 作为 pipeline 状态。阻断含义通过 `must-review` 和 fix loop 表达。

## 与现有 7 个核心文件的关系

### index.js

保留 hook 注册和模块胶水职责。新增普通消息入口和 gate runner 调用点。

### pipeline-commands.js

保留命令解析和 run 创建职责。创建前调用 Universal Route Gate、Stage Plan Gate、Spec Gate。`skip/from` 改为消费 Audit Integrity Gate 结果。

### completion-handler.js

保留 completion 解码、状态推进、review-fix 循环职责。阶段完成后调用 exit gates，把 open advisories 带进下一阶段 prompt。

### prompt-injector.js

保留注入职责。新增 open advisory、manual snippet、stage gate summary 注入。注入文本继续做长度控制。

### run-store.js

保留状态持久化职责。扩展 run state 或 ledger，记录 advisory、evidence、manual references、gate results。

### route-classifier.js

保留分类接口。Universal Route Gate 只依赖结构化输出，不绑定具体 embedding 方案。

### label-protocol.js

保留 label 编解码职责。Gate 不改变 label 协议，只要求所有派发和 completion 都携带 label。

## 兼容策略

1. 新模块全部通过依赖注入接入，默认 gate 可空跑，保证现有测试能逐步迁移。
2. 现有 `advanceStage`、`handleCompletion`、`buildInjection` 行为保持基本语义。
3. 新增测试先覆盖 gate runner 的纯函数结果，再覆盖命令和 completion 集成。
4. 不把 advisory 失败映射成 pipeline failed。
5. 不要求一次性重写 prompt 模板，只增加必要字段。

## 最小落地顺序

1. Stage Gate Kernel + Advisory Store：先把 advisory 写起来。
2. Stage Plan Gate + Audit Integrity Gate：先堵跳阶段和审计跳过。
3. Spec Gate：入口和派发时记录 spec 覆盖缺口。
4. Consistency Gate：把六层 artifact 和审计 checklist 串起来。
5. Manual Gate：按阶段注入手册片段。
6. Universal Route Gate：普通研发消息自动进入流水线。

这个顺序优先补门禁骨架，再补语义质量。每一步都是 additive，可以单独测试、单独回滚。

## 验收标准

架构落地后，至少应满足这些可验证结果：

1. 创建任意 run 后，state 中存在完整阶段链。
2. `from implement` 不会把 review/spec-review 等保护阶段直接 passed。
3. 没有 spec 覆盖时，流水线继续推进，同时 ledger 中出现 spec advisory。
4. review prompt 能看到 open advisories 和 artifacts。
5. review failed 会进入 fix，fix passed 会回 review。
6. 普通研发消息不带 `sevo:` 前缀，也能触发 route decision 或澄清 advisory。
7. prompt 注入能显示当前阶段的准入、准出和必要手册引用。
8. 终局 ledger 能列出所有 advisory 的关闭状态。

## 风险与控制

### 风险：门禁过度代码化

控制：代码只做机械检查。语义判断交给审计 Agent。

### 风险：advisory 太多导致 prompt 噪音

控制：Gate Runner 去重，同类问题只注入最高严重度和最新 evidence。完整历史在 ledger。

### 风险：普通消息覆盖导致误触发

控制：低置信只产生澄清 advisory，不创建高成本任务。明确研发意图才自动创建 run。

### 风险：完整阶段链让小任务显得重

控制：阶段必须存在，但可以 no-change review。存在是为了可追溯，不代表每个阶段都要重做大产物。

### 风险：review/fix 循环耗尽后停住

控制：循环耗尽生成 recovery advisory，并推进到诊断/修复建议，不写 paused/blocked 终态。

## 最终状态

SEVO 的质量控制点集中在 Stage Gate Kernel。入口不会漏 spec，阶段不会丢审计，普通研发消息不会绕过流水线，文档按需进入 prompt，所有缺口都有 advisory 和 ledger 可追溯。流水线仍然保持自动向前走，真正的质量判断留在审计与修复闭环中完成。
