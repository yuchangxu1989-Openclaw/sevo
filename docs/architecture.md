# SEVO 架构设计方案

OpenClaw（sa-01 子Agent）｜2026-05-30

## 1. 目标与边界

这份文档回答一件事：SEVO 作为研发流水线引擎，嵌在 ACO（OpenClaw Gateway）的运行时里，到底怎么拆、怎么连、状态放哪、谁负责什么。

先把边界说死：
- **ACO** 负责运行时编排与宿主能力：Agent 池、任务派发、会话生命周期、Hook 触发、任务看板、通知、审计、资源池、异步纪律、spec-first dispatch guard。
- **SEVO** 负责研发语义与阶段门禁：一条 FR 从 Spec → Review → Contract → Implement → Audit → Release → Verify → Ledger 的阶段定义、流转规则、门禁判定、工件链、终局验证。
- 两者不是上下级关系，而是**宿主运行时（ACO） + 流水线领域引擎（SEVO）**的关系。ACO 不知道一条研发流水线该怎么走到终局；SEVO 也不自己维护 Agent 池和主会话消息循环。两者咬合后，才形成可运行的自动研发系统。

---

## 2. 为什么要这样拆

从 spec 看，SEVO 要解决的是“研发动作必须走完整闭环”，ACO 要解决的是“多 Agent 环境下任务怎么稳定派、稳态跑、失败自动接住”。

这决定了两者天然应该分层：
- **SEVO 管研发语义**：阶段、门禁、FR 覆盖、终局验证、发布证据、Ledger。
- **ACO 管执行底座**：任务对象、Agent 发现、派发决策、completion chain、看板、通知、心跳、失败重派、运行时守卫。

如果 SEVO 直接接管所有运行时调度，它会把 OpenClaw/ACO 的宿主能力重新实现一遍；如果 ACO 直接内嵌研发阶段知识，它会把通用调度系统绑死在 SEVO 这一条流水线上。现在的正确架构是：

**SEVO 输出“下一阶段应该做什么”，ACO 提供“把这件事可靠交给谁去做”的执行壳。**

---

## 3. SEVO 内部模块划分

### 3.1 Plugin Shell（`index.js` + `openclaw.plugin.json`）
一句话职责：**把 SEVO 作为 OpenClaw 插件挂进 ACO 的 Hook 生命周期。**

它负责：
- 注册 `subagent_ended`、`before_prompt_build`、`before_tool_call`、`after_tool_call` 等 Hook
- 解析 SEVO label（`sevo:<projectSlug>:<stageId>:<attempt>`）
- 把阶段推进、提示注入、路由拦截、通知提醒接到 Gateway 事件流上
- 在 dist 缺失时 fail-open，避免拖死宿主

### 3.2 Bridge（`bridge.js`）
一句话职责：**在插件壳和编译后的 TypeScript 核心之间做懒加载桥接。**

它负责：
- 定位 `dist/` 与 `data/` 目录
- lazy load `PipelineEngine`、`route`、`OpenClawAdapter`、clarification 等核心模块
- 做缓存、失败回退、npm 安装路径兼容

这是 **JS 插件壳 ↔ TS 核心引擎** 的连接层。

### 3.3 Router（`src/router/*`）
一句话职责：**把任务描述和 scope 变成流水线级别与阶段计划。**

它负责：
- `classifyLevel`：L0 / L1 / L2+ 分级
- `classifyDesignNeeds`：判断是否需要 UX 设计、架构设计
- `route`：生成 `requiredStages`、`skippedStages`、matched rules
- `StageGraph` / `StageRouter`：定义阶段 DAG 和推进关系

这是 SEVO 的“入口判定器”。

### 3.4 Pipeline Create / Instance（`src/pipeline/pipeline-create.ts` 等）
一句话职责：**创建一条 FR 流水线实例，并把它落盘成可追踪对象。**

它负责：
- project slug 校验
- active instance 冲突检查
- instanceId 生成（`fr-<slug>-<yyyyMMdd>-<seq>`）
- 项目目录初始化
- 生成 routingResult 与 instance record

这是“把用户一句研发目标变成一条正式流水线”的入口。

### 3.5 Pipeline Engine（`src/pipeline/pipeline-engine.ts`）
一句话职责：**维护每条流水线的状态机，决定阶段何时通过、阻断、回滚、重试、推进。**

它负责：
- 创建 `PipelineState`
- 激活阶段、完成阶段、失败处理
- 并行分支协调
- clarification 阻断与解除
- fix-loop / rollback
- 持久化 `state.json` 与 `events.jsonl`

这是 SEVO 的核心编排引擎。

### 3.6 Gate Engine（`src/gate/*`）
一句话职责：**给阶段结果做门禁判定，不让“做了”冒充“通过了”。**

它负责：
- Spec Review Gate、Contract Review Gate、Publish / Verify 等规则引擎
- 审查结论三态：`passed / conditional / rejected`
- blocker 聚合
- 规则可插拔执行

这是 SEVO 的质量门。

### 3.7 Stage Handlers / Stage Implementations（`src/stages/*`）
一句话职责：**定义每个阶段的输入输出结构和执行语义。**

它覆盖的不是“所有执行细节都在本地跑”，而是：
- 每个阶段应该产出什么工件
- 阶段结果怎么结构化回写
- Deploy / Verify / Post-Release Validation / Clean-Install Verification 这些内建阶段如何验证

### 3.8 OpenClaw Adapter（`src/adapter/openclaw-adapter.ts`）
一句话职责：**把 SEVO 的阶段语义翻译成 ACO / OpenClaw 能执行的派发动作。**

它负责：
- `dispatchTask(stage, payload)`
- `collectArtifacts(taskId)`
- `notifyGateResult(stage, verdict)`
- `spawnSession(...)` / README sync / publish adapter
- 从宿主读取 `ProjectConfig`

这层是 **SEVO ↔ ACO 的正式适配边界**。

### 3.9 Context Injection（`src/context-injection/*`）
一句话职责：**按阶段提取 spec / architecture / code 上下文，注入给执行 Agent。**

它负责：
- specify 阶段读 spec/vision/scope
- plan 阶段读 spec + ADR
- implement 阶段读 contract + constraints
- review 阶段读 AC + interface + code list

这层保证 Agent 做事时拿到的是阶段相关上下文，而不是一坨散 prompt。

### 3.10 Event Ledger / Status History（`src/pipeline/ledger.ts`、`status-history.ts`）
一句话职责：**把流水线过程变成可追溯证据链。**

它负责：
- pipeline / stage 事件流
- 通知事件映射
- instance 状态迁移记录
- 交付后 Ledger 归档前的中间事件链

### 3.11 CLI Surface（`src/cli/*`, `bin/sevo.js`）
一句话职责：**给用户和主会话一个显式命令入口。**

它负责：
- `sevo create`
- `sevo from`
- `sevo status`
- `sevo advance`
- `sevo doctor`
- list/show/config/export/verify/gate 等命令

CLI 是面向用户的显式入口；插件 Hook 是面向宿主的隐式入口。

---

## 4. SEVO ↔ ACO 的边界

### 4.1 SEVO 消费 ACO 的能力

SEVO 不自己创造这些能力，而是消费 ACO / OpenClaw 宿主提供的运行时：

#### 1）Hook 事件
SEVO 直接挂在 ACO/Gateway 事件上：
- `subagent_ended`：阶段任务结束后推进流水线
- `before_prompt_build`：向主会话注入“下一步该派什么阶段任务”
- `before_tool_call`：拦截 `sessions_spawn`，补 SEVO label / spec guard / 路由规则
- `after_tool_call`：做 spec sync reminder、飞书提醒等补充动作

这意味着 **ACO 提供事件总线，SEVO 提供事件解释器**。

#### 2）任务派发能力
通过 `OpenClawAdapter` / spawn client / `sessions_spawn`，SEVO 使用 ACO 的执行能力：
- 选择 agentId
- 带 label 派发任务
- 设置 timeout
- 并行 spawn
- 收 completion event

#### 3）Agent 池与角色路由
SEVO 自己知道某个阶段更适合什么角色，但真正的 Agent 池真相源来自 ACO/OpenClaw：
- `openclaw.json -> agents.list`
- stageAgentMap / roleAssignment
- agent health / busy-idle / concurrency

SEVO 只消费这些信息，不维护宿主级资源池。

#### 4）审计、通知、看板基础设施
SEVO 借用或对接 ACO 已有能力：
- 子任务看板与 completion 链
- Feishu/IM 通知链
- dispatch audit log
- health / doctor / runtime diagnostics

#### 5）宿主配置
SEVO 默认从宿主配置推断：
- workspaceRoot
- sevoRoot / data path
- publish script path
- notifications
- openclaw model / llm 配置

### 4.2 ACO 消费 SEVO 的能力

ACO 并不理解“研发闭环”本身，它从 SEVO 获取这些高阶语义：

#### 1）流水线阶段模型
ACO 通过 SEVO 获取：
- 这项研发任务该走哪些阶段
- 哪些阶段必须、哪些可跳过
- 哪些阶段并行、哪些串行
- 阶段间 prerequisites 是什么

#### 2）门禁结论
ACO 知道某任务 succeeded / failed；但 **是否能进入下一研发阶段** 要看 SEVO 的 gate verdict：
- `passed`
- `conditional`
- `rejected`
- blocker 列表

#### 3）阶段 prompt 标准
SEVO 把每个阶段该注入什么标准、什么补充约束、什么 spec-first / UX / browser walkthrough 守卫整理好，ACO 只负责把 prompt 送出去。

#### 4）流水线状态投影
主会话说“现在到哪了”，真正需要的是 SEVO 的 pipeline state：
- current stage
- required / skipped stages
- blocked reason
- artifacts
- fix loop / rollback 状态

#### 5）终局验证语义
ACO 能做派发与通知，但不知道“真正完成”是什么。SEVO 定义：
- FR 覆盖
- 真实数据门禁
- 发布后验证
- 干净环境安装验证
- Ledger 留痕

### 4.3 一句话总结边界

- **ACO 输出执行能力，不输出研发语义。**
- **SEVO 输出研发语义，不直接拥有宿主执行权。**
- **OpenClawAdapter + Hook 机制** 是两者唯一正式咬合面。

---

## 5. 一个 FR 从 spec 到代码到审计的完整数据流

下面用“新增一个受管功能”为例，描述真实数据怎么流。

### 5.1 入口层：主会话识别研发动作
1. 用户提出一个研发目标。
2. ACO 的 dispatch / route guard 判断这是受管研发动作。
3. SEVO 插件把任务路由到 `sevo:create / sevo:implement / sevo:fix / sevo:from` 入口。

**此时主导者是 ACO，SEVO 负责把任务吸入流水线。**

### 5.2 创建层：SEVO 建流水线实例
4. `Pipeline Create` 校验 project slug、是否已有 active instance。
5. Router 依据任务 scope 分出 L0 / L1 / L2+。
6. Router 生成 `requiredStages + skippedStages`。
7. 项目目录与 pipeline instance 落盘。

产物：
- `projects/<slug>/pipelines/<instance>.json`（实例视图）
- `data/pipelines/<pipelineId>/state.json`（运行态状态）
- `data/pipelines/<pipelineId>/events.jsonl`（事件流）

### 5.3 规格层：Spec / Spec Review
8. `before_prompt_build` 给主会话注入“下一步派 Spec 任务”。
9. ACO 用自己的任务派发能力，把 Spec 任务派给 PM 角色或降级角色。
10. 子 Agent 产出 spec 工件。
11. `subagent_ended` 触发，SEVO 读取结果、做 artifact / substantial failure / clarification 检查。
12. 通过后推进到 `spec-review-gate`。
13. Gate Engine 汇总多维评审结论，决定是 passed、conditional 还是 rejected。

产物流：
- spec 文档
- spec review bundle
- clarification / blockers
- 对应 artifacts 注册到 stage

### 5.4 设计层：Contract / Architecture / UX
14. Spec Review 通过后，SEVO 打开并行分支：
   - contract
   - test-case-authoring
   - ux-acceptance-authoring
   - commercial-acceptance-authoring
   - ux-interaction-design
   - architecture-design
15. ACO 并行派发这些阶段任务。
16. SEVO 在 `PipelineEngine` 中维护 prerequisites，只有关键分支完成，Implement 才能解锁。

这里的关键点是：
- **ACO 负责并发执行**
- **SEVO 负责并发图的合法性**

### 5.5 实现层：Implement
17. Contract Review Gate 通过后，SEVO 解锁 Implement。
18. `before_prompt_build` 或 `before_tool_call` 注入 implement prompt，强制携带 spec / contract / architecture 上下文。
19. ACO 派编码任务。
20. 子 Agent 完成代码改动、测试、AC 覆盖清单。
21. `subagent_ended` 回来后，SEVO：
   - 判定 succeeded 是否属于“实质成功”
   - 校验输出文件是否真的存在
   - 解析 AC coverage checklist
   - 若 uncovered/partial，自动排补充任务，不进入 Review

### 5.6 审计层：Review / Regression / Verify
22. Implement 通过后进入 Review。
23. Review 结论如果有 blocker，SEVO 不让进入后续阶段，而是进入 fix loop / rollback。
24. 审计通过后，推进到 Smoke / UX Acceptance / PM Commercial Review / Regression。
25. 通过 Publish/Deploy/Verify/Post-Release Validation/Clean-Install Verification，最终进入 Ledger。

### 5.7 终局层：Ledger
26. 所有关键阶段工件、结论、FR 覆盖、发布证据、验证结果归档为 Ledger entry。
27. ACO 再基于 SEVO 的终态，向用户发送人话总结、记录看板和通知。

### 5.8 数据流转图（文本版）

```text
用户任务
  ↓
ACO 调度守卫 / 路由识别
  ↓
SEVO 入口命令（create / implement / fix / from）
  ↓
Pipeline Create
  ↓
Router（L0/L1/L2+ + stages）
  ↓
Pipeline State / Instance / Events 落盘
  ↓
before_prompt_build 注入下一阶段指令
  ↓
ACO 派发子任务（sessions_spawn / board）
  ↓
子 Agent 产出工件
  ↓
subagent_ended
  ↓
SEVO 解析结果 + Gate Engine 判定 + Artifact 注册
  ↓
通过 → PipelineEngine 推进下一阶段
失败/阻断 → clarification / fix loop / rollback / 重派
  ↓
Deploy / Verify / Post-Release Validation / Clean Install
  ↓
Ledger
  ↓
ACO 通知用户 + 看板闭环
```

---

## 6. 状态管理

SEVO 不是单一状态源，而是**按职责拆成四层状态**。

### 6.1 流水线实例状态（Project 视角）
位置：`projects/<slug>/pipelines/*.json`

作用：
- 对应 FR 流程实例的业务视图
- 记录 instanceId、projectSlug、routingResult、directoryStructure、status、statusHistory

谁写：
- Pipeline Create
- CLI `from` / `advance` / status transition helper

谁读：
- CLI `status/show/list`
- 主会话 / 排查脚本

这是**项目级可读视图**。

### 6.2 运行态状态（Pipeline Engine 视角）
位置：`data/pipelines/<pipelineId>/state.json`

结构核心：
- `pipelineId`
- `taskId`
- `level`
- `requiredStages[]`
- `skippedStages[]`
- `stages[stageId] -> StageRecord`
- `currentStage`
- `createdAt / updatedAt`
- `pipelineStatus`
- `rollbackCount`
- `tieredScan`

`StageRecord` 核心字段：
- `stageId`
- `status`：`pending / active / blocked / clarification-blocked / fix_pending / rolled_back / passed / failed / skipped`
- `artifacts[]`
- `attempt`
- `blockReason / failureReason`
- `clarificationSummary`

谁写：
- `PipelineEngine`

谁读：
- 插件 Hook
- `advance`
- Gate / verify / artifact check
- 调试与审计工具

这是**SEVO 的真实运行时状态机**。

### 6.3 事件流状态（Append-only 证据链）
位置：`data/pipelines/<pipelineId>/events.jsonl`

事件类型包括：
- `pipeline_created`
- `stage_activated`
- `stage_completed`
- `stage_failed`
- `stage_blocked`
- `clarification_*`
- `dispatch_role_mismatch`
- `fix_attempt`
- `stage_rolled_back`
- `tiered_scan_*`

谁写：
- `PipelineEngine.appendEvent`
- 插件 completion / gate / coverage hook

谁读：
- 调试、审计、回放、故障归因

这是**不可逆过程证据**。

### 6.4 插件运行态状态（Hook 协同视角）
位置：
- `state/active-pipelines.json`
- `state/pending-advances.jsonl`
- 插件进程内 `sevoGlobal`

作用：
- 当前有哪些活跃 pipeline
- 哪些 stage advancement 已排队，等主会话注入
- pending notices / pending clarifications / runtime config / degraded flag

谁写：
- `index.js` 插件 Hook

谁读：
- `before_prompt_build`
- `subagent_ended`
- route guidance / completion notice / clarification resume

这是**插件编排缓存层**，不是长期真相源。

### 6.5 CLI 本地模式状态（脱离宿主的兼容层）
位置：`.sevo/<slug>/state.json`

作用：
- 没有完整 OpenClaw / ACO 宿主时，CLI 仍可运行 pipeline-only mode

这层说明一件事：
- **SEVO 核心语义可脱离 ACO 单跑**
- 但完整自动推进、Hook 注入、多 Agent 路由仍依赖 ACO 宿主

### 6.6 状态读写关系总结
- **SEVO 核心真相源**：`data/pipelines/<id>/state.json`
- **项目可读视图**：`projects/<slug>/pipelines/*.json`
- **证据链**：`events.jsonl`
- **插件协同缓存**：`active-pipelines.json`、`pending-advances.jsonl`、内存态
- **宿主任务真相源**：ACO 的任务看板 / 审计日志 / session 状态，不在 SEVO 内部维护

也就是说，**SEVO 管“研发阶段状态”，ACO 管“任务执行状态”**。这两个状态域不能混成一个文件。

---

## 7. SEVO 暴露给主会话的命令接口

### 7.1 流水线入口命令
主会话最关键的接口是四个：
- `sevo:create <project-slug>`：创建项目并初始化流水线
- `sevo:implement <描述>`：以完整研发链处理新功能实现
- `sevo:fix <描述>`：先核实 spec，再修问题并继续后续门禁
- `sevo:from <stage> <project>`：从指定阶段重入

这四个不是普通 CLI 子命令名，而是**主会话路由协议**。SEVO 插件会在 `before_prompt_build` 中给出对应指引。

### 7.2 CLI 命令面
从代码看，SEVO CLI 当前明确暴露：
- `sevo init`
- `sevo create`
- `sevo status`
- `sevo advance`
- `sevo doctor`
- `sevo list`
- `sevo show`
- `sevo config`
- `sevo export`
- `sevo fr`
- `sevo pause`
- `sevo resume`
- `sevo cancel`
- `sevo ledger`
- `sevo goal`
- `sevo from`
- `sevo verify`
- `sevo scan`
- `sevo gate`

### 7.3 主会话真正依赖的不是命令名，而是三类接口

#### 1）创建/重入接口
- create
- from
- implement
- fix

#### 2）状态查询接口
- status
- show
- list
- ledger
- doctor

#### 3）阶段推进接口
- advance
- gate
- verify
- scan

### 7.4 隐式接口：Prompt Injection 协议
主会话和 SEVO 的真实高频接口，其实不是 CLI，而是这些隐式协议：
- `before_prompt_build` 注入“下一步要派什么”
- `before_tool_call` 给 `sessions_spawn` 注入 SEVO label、spec guard、角色导航
- `subagent_ended` completion 反推下一阶段

换句话说，**CLI 是显式 API，Hook + Label 协议是运行时 API。**

---

## 8. ACO 与 SEVO 的咬合面清单

把两者的接触面按类型列成清单：

### 8.1 事件咬合
- ACO 发：`before_prompt_build`
- ACO 发：`before_tool_call`
- ACO 发：`after_tool_call`
- ACO 发：`subagent_ended`
- SEVO 收到后：更新 pipeline、排下一阶段、给主会话提醒

### 8.2 派发咬合
- ACO 提供 `sessions_spawn` / board enqueue / session completion
- SEVO 提供 stage → task prompt → label → timeout → role preference

### 8.3 配置咬合
- ACO 维护 `openclaw.json`
- SEVO 读取 workspaceRoot、agents.list、模型、通知、stageAgentMap
- ACO 不维护 stage semantics
- SEVO 不维护 agent pool 真相源

### 8.4 证据咬合
- ACO 维护任务看板、dispatch audit、notify channel
- SEVO 维护 pipeline state、events、gate verdict、artifacts、ledger
- 用户问“现在到哪了”，需要两个层一起看：
  - 任务有没有跑完：看 ACO
  - 研发阶段能不能过：看 SEVO

---

## 9. 当前架构的技术约束

### 9.1 Hook 驱动，天然偏事件最终一致
SEVO 不是把所有推进都放在一个同步事务里完成，而是靠：
- completion event
- prompt injection
- pending advance queue
- state 文件

好处是宿主侵入小；坏处是天然存在：
- Hook 丢事件风险
- pending advance 与真实 session 状态短暂不一致
- 需要主会话保持空闲，不能长阻塞

### 9.2 状态分散在多个文件域
现在状态至少分四层：
- project instance
- runtime state
- event log
- plugin cache

优点是职责清楚；缺点是排障时需要跨文件对齐。文档和工具如果不补齐，用户会觉得“状态全靠猜”。

### 9.3 插件壳是 JS，核心是 TS dist
这带来一个现实约束：
- 插件能 fail-open，不拖死宿主
- 但 dist 缺失、版本不一致、bridge 路径漂移时，SEVO 会降级成 no-op

所以 bridge 这一层虽然看起来不起眼，实际上是运行成败关键点。

### 9.4 主会话仍然是调度者
从 FR-13 的定义看，PipelineEngine 当前更多是**编排决策器**，不是彻底托管的执行器。它通过 prompt/hook 告诉主会话“现在该派什么”，但不会完全替代主会话。

这意味着：
- 当前形态仍然受主会话异步纪律约束
- 如果主会话阻塞，SEVO 自动推进能力也会打折

### 9.5 CLI 模式与插件模式并存
这提高了通用性，但也让接口面更宽：
- CLI 独立跑得通
- 插件宿主模式自动推进更强
- 两套入口要持续保持语义一致，否则会出现“CLI 能做，插件态不一致”或反过来

---

## 10. 演进方向

### 10.1 从“提示主会话推进”升级到“宿主内核原生推进”
现在 SEVO 仍偏“半自动编排”：通过 Hook 注入推进建议，再由主会话执行派发。长期应该往前走一步：
- 让 ACO 暴露稳定的 programmatic dispatch API
- SEVO 直接提交 stage task，而不是主要依赖 prompt 注入
- 主会话只看摘要，不再承担推进责任

目标是把“人肉看提示再派发”继续压缩掉。

### 10.2 收敛状态真相源
建议长期保留两层真相源即可：
- **执行真相源**：ACO task board / audit / session store
- **研发真相源**：SEVO pipeline state / events / ledger

插件缓存层应尽量继续薄化，降低 `sevoGlobal + state/*.json` 的运行复杂度。

### 10.3 明确 Host Adapter 契约，支持更多宿主
现在 OpenClawAdapter 已经是正确方向，但契约还应该更显式：
- dispatch
- spawn parallel
- collect artifacts
- notify
- stage trigger
- project config
- publish
- readme sync

只要这份 Host Adapter 契约收紧，SEVO 就能从“OpenClaw 内部插件”演进成“可嵌入任意 Agent runtime 的研发流水线内核”。

### 10.4 把 ACO 的治理规则与 SEVO 的阶段规则对齐成统一协议
当前 spec-first guard、角色守卫、异步纪律、doctor 等规则，部分在 ACO，部分在 SEVO prompt supplement。长期应该把两类规则分层明文化：
- **ACO guard**：任务是否允许派发
- **SEVO gate**：阶段是否允许通过

两边都叫“规则”，但职责完全不同。把协议分层写清楚后，排障会简单很多。

### 10.5 从“阶段通过”继续升级到“终局价值通过”
SEVO spec 已经把真实数据、clean install、post-release validation、tiered gap scan 写进来了。下一步重点不是再加阶段，而是把这些终局门禁变成更稳定的自动化证据链。

方向很明确：
- 少增加新阶段
- 多增强 Verify / Validation / Ledger 的自动采证质量

---

## 11. 最终结论

SEVO 和 ACO 的正确关系不是“谁包含谁”，而是：

- **ACO 是宿主运行时**：负责 Agent、任务、事件、看板、通知、调度守卫。
- **SEVO 是研发流水线内核**：负责阶段、门禁、状态机、工件链、终局验证。
- **OpenClawAdapter + Hook 事件 + Label 协议** 是两者的标准咬合面。

把这层关系讲清楚之后，后面所有问题都会简单很多：
- 任务没派出去，先查 ACO。
- 阶段没推进，先查 SEVO。
- completion 到了但主会话没动，查 Hook / pending advances。
- 任务完成了但研发不能过，查 gate verdict / artifacts / runtime state。

一句话收口：

**ACO 负责把事派对、跑稳、接住；SEVO 负责保证这件事沿着受控研发链一直走到真交付。**
