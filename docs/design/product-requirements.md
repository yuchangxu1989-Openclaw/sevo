# ACO - 产品需求规格说明书

OpenClaw（pm-02 子Agent）2026-05-30

---

## 场景

### 1.1 单人或小团队维护 AI Agent 基础设施

一个 1 人或 2-3 人的小团队，把产品研发、资料整理、审计、发布、运维排查交给多个 AI Agent 协作完成。团队通常通过 IM 或命令行给主会话下任务，主会话再把任务拆给不同角色的 Agent。任务可能持续几分钟到一小时，用户期间会继续补充约束、插入高优先级事项、追问进度或纠偏方向。

这个场景的压力来自两件事：Agent 数量越来越多，规则越来越多。只靠主会话记忆和自然语言约束，调度会在长上下文、并发任务、失败重派、用户临时插话时变形。用户需要一套能把调度规则落到运行时的系统，保证任务派得对、跑得稳、失败后有人接、状态对用户透明。

### 1.2 多 Agent 并发推进研发流水线

用户同时推进需求、架构、开发、审计、UX、发布等研发阶段。不同阶段需要不同角色的 Agent 处理，某些任务可以并行，某些任务必须等待上游产出。主会话如果串行等待，用户会感觉 AI 失联；如果盲目并发，又会出现同一文件被多个 Agent 同时改、开发 Agent 自审、未写 spec 就直接编码等失控问题。

ACO 在这个场景中负责把“谁能做什么、什么时候能派、失败后怎么接、完成后怎么通知”固化为可执行规则，让研发流水线在多 Agent 环境下保持可控。

### 1.3 任务完成后需要自动闭环

用户不想盯终端或看板等结果。Agent 完成、失败、超时、卡死、被 kill 后，系统需要主动给出人话总结，并把下一步推进起来。尤其在 IM 场景里，用户只关心“做完了吗、卡在哪、有没有继续处理”，不想从 session、日志、文件路径里拼答案。

ACO 在这个场景中负责监听任务状态变化，把结果写入看板、审计日志和通知链路，并在需要时触发后续任务。

---

## 最小闭环

用户给主会话一句任务，ACO 先判断这是什么类型的工作，再从当前可用 Agent 里选对的人派出去。

任务进入运行后，ACO 持续盯状态：有没有超时、卡死、错派、冲突或需要补充约束。

任务完成或失败后，ACO 立刻更新看板、记录审计、推送结果，并按规则决定要不要继续派下一步。

对用户来说，最短路径就是四件事：收到任务 → 选 Agent → 派发执行 → 返回结果。

---

## 人群

### 2.1 Solo Founder / 独立产品操盘者

一个人用多个 Agent 推进产品研发和运营。常用设备是笔记本电脑和手机 IM，不一定会写代码，但会持续给 Agent 下自然语言任务。手里可能有 2-5 个 Agent：有人写需求，有人写代码，有人做审计，有人做调研。

他最在意三件事：任务有没有派给对的人，失败后有没有自动接住，完成后自己能不能第一时间收到清楚的结论。理想上手路径是安装后运行初始化命令，5 分钟内看到第一个任务被调度、执行、完成并收到通知。

### 2.2 Agent 基础设施运维者

负责维护一组 10 个以上 Agent 的运行环境。熟悉命令行、配置文件和日志，关心资源池状态、并发上限、角色映射、任务积压、Agent 卡死、通知送达率。

他每天要回答的问题很具体：哪个 Agent 正在忙，哪个已经卡死，哪个连续失败，哪些任务排队太久，是否有规则被绕过。ACO 对他的价值是把这些状态集中展示出来，并在异常出现时自动告警。

### 2.3 Agent 系统开发者

开发和维护 OpenClaw 插件、调度规则、Agent 适配层和项目流水线。熟悉 TypeScript、Node.js、OpenClaw Gateway、插件事件和本地文件状态。

他需要可编程的调度框架：能定义角色约束、梯队路由、自动推进链、审计事件、通知渠道和输出质量门禁。ACO 对他的价值是提供稳定 API 和清晰边界，避免调度规则散落在 prompt、脚本和临时约定里。

### 2.4 OpenClaw 高级用户

已经有自定义 Agent 池、模型配置、通知渠道和多个项目目录。懂基础配置，但不想在每个项目里重复维护 agentId、角色名、路径和阈值。

他需要 ACO 动态读取 OpenClaw 当前配置，随 Agent 池变化自动更新角色映射和梯队信息。ACO 对他的价值是把本机已有能力接进统一调度体系，减少硬编码和手工同步。

---

## 用户故事旅程

### Stage 1：初始化调度环境

- 触发条件：用户准备把多个 Agent 纳入统一调度，或在新机器上安装 ACO。
- 核心动作：用户运行初始化命令；ACO 检测 OpenClaw 环境、读取 Agent 列表、生成配置、注册插件、检测通知渠道。
- 阶段产出：可用的 ACO 配置、资源池、默认规则、通知通道检测结果。
- 转换条件：系统能展示当前资源池状态，并能创建第一条任务。

### Stage 2：创建任务并进入队列

- 触发条件：用户或上游系统提交一个需要 Agent 执行的任务。
- 核心动作：用户提供任务说明、超时、优先级或目标角色；ACO 创建 Task，写入队列和审计事件。
- 阶段产出：任务进入 queued 状态，具备 label、prompt、timeout、priority、状态和创建时间。
- 转换条件：队列消费事件触发，任务进入派发前校验。

### Stage 3：派发前治理

- 触发条件：队列中存在可派发任务，资源池中存在空闲 Agent。
- 核心动作：ACO 判断任务类型，校验角色匹配、并发上限、自审风险、spec 覆盖、任务粒度和高风险命令；不合规时阻断或提示，合规时进入资源选择。
- 阶段产出：派发决策、候选 Agent 列表、命中规则、阻断原因或放行原因。
- 转换条件：任务通过校验并选中目标 Agent。

### Stage 4：执行与运行时看护

- 触发条件：任务被派发到目标 Agent。
- 核心动作：ACO 将任务标记为 running，监控超时、卡死、心跳、输出有效性和资源占用；必要时触发失败、重试或 kill 后影响扫描。
- 阶段产出：运行中状态、健康探测记录、超时/卡死事件、kill 影响报告或任务产出。
- 转换条件：Agent 报告完成、失败、超时或被取消。

### Stage 5：完成校验与闭环通知

- 触发条件：任务进入完成、失败、超时或取消状态。
- 核心动作：ACO 做实质成功校验，更新任务看板，写审计日志，推送 IM 通知，并提醒主会话给用户发送人话总结。
- 阶段产出：终态记录、用户可读摘要、失败原因、通知送达记录。
- 转换条件：若存在推进链或失败重试规则，进入下一阶段；否则任务闭环。

### Stage 6：自动推进下一步

- 触发条件：任务完成后命中 completion chain，或失败后命中重试、拆分、升级、审计、README 更新等规则。
- 核心动作：ACO 根据条件创建后续任务，继承必要上下文，重新进入队列。
- 阶段产出：后续任务、链路状态、循环次数、跳过原因或升级记录。
- 转换条件：后续任务再次进入 Stage 2，直到链路终止。

---

## 痛点

### 4.1 调度混乱

晚上 10 点，用户同时要改 spec、修代码、做审计。主会话一忙就容易把开发任务派给 PM，把审计任务派给刚写代码的 Agent，或者把需求、架构、开发塞进同一个任务里。表面上任务派出去了，实际从第一步就跑偏，等半小时后才发现产物不能用。

### 4.2 规则遗忘

规则写在长文档里时，前几轮还能遵守，到了上下文很长、任务很多、completion 连续涌入的时候就会被稀释。比如“开发前必须有 spec 覆盖”“主会话不能长时间 poll”“completion 后必须飞书补发”，只靠记忆会反复漏。用户看到的是同一个错误隔几天又出现一次。

### 4.3 任务失败没有闭环

一个 Agent 跑了 40 分钟后失败，失败原因埋在日志里；看板状态可能还停在 running；用户不追问就没人处理。更糟的是，系统可能原样重派同一个任务，让同一个 Agent 再失败一次。用户需要的是失败后自动拆分、升级、通知和继续推进。

### 4.4 并行度低

多个任务明明互不冲突，但主会话习惯等 A 完成再想 B。用户半夜发了 5 件事，系统一次只跑 1 件，空闲 Agent 在旁边闲着。结果第二天早上只完成一小段，用户感觉“多 Agent 没有多起来”。

### 4.5 可控性差

kill 一个跑歪的 Agent 后，主会话如果不知道它改过哪些文件，就可能直接回滚整个文件，把其他 Agent 的正确产出一起抹掉。发布前如果没有陌生环境验证，包发出去才发现用户装不上。缺少运行时事实报告时，用户只能凭猜测做高风险决策。

### 4.6 状态不透明

用户问“现在到哪了”，如果系统只能凭记忆回答，就会出现误报。真实状态应该来自任务看板、审计日志、资源池和通知送达记录。没有统一状态源时，用户要在多个文件、日志和会话里找答案。

---

## 需求

1. 用户要把多个 Agent 纳入同一套调度规则，避免谁都能接任何任务。
1. 用户要任务在派发前就被校验，不要等跑完才发现错派、越权或自审。
1. 用户要主会话保持可打断，派出长任务后还能继续接收 IM 消息。
1. 用户要失败任务自动被接住：能重试、升级、拆分、通知，不能静默卡死。
1. 用户要资源池被充分利用：能并发的任务尽快并发，不能并发的任务说明依赖关系。
1. 用户要所有关键状态可追溯：谁派的、派给谁、为什么放行或阻断、跑了多久、失败原因是什么。
1. 用户要完成后收到人话总结，不想自己读日志、session 或技术字段。
1. 用户要高风险动作有事实依据：kill、发布、配置变更、开发前置条件都要有门禁或影响报告。
1. 用户要开箱即用：单 Agent 能获得基础能力，多 Agent 能启用完整治理，不需要一次配置所有高级功能。
1. 用户要 ACO 跟 OpenClaw 当前环境同步，不写死 agentId、角色名、路径或模型。

---

## 解决方案

### 6.1 产品定位（产品概念）

围绕 AI Agent 基础设施运维团队在多 Agent 协作中的调度混乱、规则遗忘、失败无闭环、并行度低和可控性差，ACO 通过运行时调度治理、资源池管理、自动推进链、任务看板、审计日志、通知闭环和高风险动作门禁，把 Agent 协作从临时人工盯盘变成可配置、可追溯、可恢复的自主进化 Agent 编排系统。

ACO 以 OpenClaw Gateway 插件和 CLI 包形式提供能力。用户通过初始化命令接入当前 OpenClaw 环境；系统动态读取 Agent、模型、通知渠道和配置；单 Agent 环境启用基础调度，多 Agent 环境启用角色约束、梯队路由、并发控制和自动推进。

### 6.2 用户体验流

1. 用户初始化 ACO。ACO 检测环境、生成配置、注册插件、发现 Agent、检测通知渠道。关联 FR：FR-Z01、FR-H01、FR-C01、FR-F01。
1. 用户创建任务。ACO 生成 Task，写入队列和审计日志，触发队列消费。关联 FR：FR-A01、FR-A02、FR-E01。
1. ACO 做派发前校验。系统判断任务类型，检查角色匹配、自审风险、并发限制、任务拆分粒度、spec 覆盖和高风险命令。关联 FR：FR-B01、FR-B02、FR-B03、FR-K06、FR-K09、FR-K18。
1. ACO 选择 Agent。系统根据角色、梯队、负载和失败历史选择合适 Agent，必要时排队或升级梯队。关联 FR：FR-C01、FR-C02、FR-C03、FR-B05。
1. Agent 执行任务。ACO 追踪 running 状态，监控超时、卡死、心跳和实质成功条件。关联 FR：FR-A03、FR-A04、FR-G01、FR-G02、FR-G03、FR-K05。
1. 用户在任务运行中继续插话。主会话不长时间阻塞等待，用户可以补充约束、提高优先级、kill 重派或改变方案。关联 FR：FR-K01、FR-K02、FR-K03、FR-K04。
1. 任务完成或失败。ACO 更新看板、写审计、校验产出、发送通知，并提醒主会话给用户发人话总结。关联 FR：FR-E02、FR-E04、FR-F03、FR-F05、FR-F07、FR-F08、FR-F09。
1. ACO 自动推进下一步。成功后触发审计、README 更新、发布验证或后续链路；失败后触发重试、拆分、梯队升级或告警。关联 FR：FR-D01、FR-D02、FR-D03、FR-D04、FR-K07、FR-K10、FR-K15、FR-K16。
1. 用户查看系统状态。用户通过 CLI 或通知查看任务看板、资源池、健康状态、审计记录、kill 影响报告和异步纪律记录。关联 FR：FR-E01、FR-E02、FR-E03、FR-E04、FR-G04、FR-K04。

### 6.3 核心对象与状态模型

#### 6.3.1 核心对象

- **Task**：ACO 管理的最小调度单元，包含 label、prompt、timeout、priority、taskType、status、parentTaskId、completionChain 和审计引用。Task 代表“要做的一段工作”，不等于会话本身。
- **Agent**：可被调度的执行者，来自 OpenClaw 当前 `agents.list`。Agent 具有 agentId、role、tier、runtime type、并发上限和健康状态。
- **Session**：某个 Task 被实际派发后生成的运行实例。Session 关联唯一执行上下文，用来承载运行中的消息、超时、完成、kill 和状态探测。
- **Dispatch Event**：一次派发决策的记录，包含任务摘要、候选 Agent、命中规则、最终选择、阻断原因或放行原因。
- **Completion Event**：一次任务终态事件，表示某个 Session 已进入 succeeded、failed、timed_out 或 cancelled，并触发后续校验、通知或推进链。
- **Guard**：派发前、运行中或回复前的治理规则执行器，用来在错派、自审、超时、事实误报、异步阻塞、高风险命令等场景执行准入校验、提醒、阻断或记录。
- **Guidance Reminder**：L2 插件在每轮 prompt 构建时向主 Agent 注入的清晰、中性提醒，用来说明当前场景适用的规则、方法和约束。Guidance Reminder 是 ACO 可控性的主路径入口，定位是主动引导，不是命令式卡口。
- **Main-Agent Handshake**：主 Agent 在行动前对 Guidance Reminder 的显式确认，表示已评估 ACO 与 SEVO 的引导项并承诺按适用规则执行。Handshake 是主 Agent 的主动承诺，不是被迫放行条件。
- **Chain**：任务完成后的自动推进定义，描述“这个任务结束后，下一步该自动创建什么任务、在什么条件下继续或停止”。
- **Board Entry**：任务看板中的状态投影，用来给主会话和用户查看当前队列、运行中任务和终态结果。
- **Audit Event**：调度过程中产生的结构化审计记录，用来回答“谁在什么时候做了什么决策、为什么这么做”。

#### 6.3.2 状态枚举

**Task 状态**

- `queued`：任务已创建，等待校验或派发。
- `dispatching`：任务正在进行派发决策与资源分配。
- `running`：任务已被目标 Agent 接收并处于执行中。
- `succeeded`：任务完成且通过实质成功校验。
- `failed`：任务执行失败，或完成后未通过实质成功校验。
- `failed-exhausted`：任务已用尽允许的重试、拆分或梯队升级机会。
- `timed_out`：任务超过 timeout 阈值，被系统判定为超时终态。
- `stalled`：任务长时间无产出，已进入卡死处理流程。
- `cancelled`：任务被用户或系统主动取消。
- `blocked`：任务因为依赖、规则或上游状态暂时不能继续推进。
- `skipped`：任务或链路节点因条件不满足被跳过。

**Agent 状态**

- `idle`：空闲，可接新任务。
- `busy`：正在执行任务。
- `offline`：因熔断、配置或运行异常暂不可派发。
- `stale`：疑似失联，等待恢复或回收。
- `degraded`：能力受限但仍可观测，需要谨慎使用。

**Chain 节点状态**

- `pending`：等待上游条件满足。
- `running`：节点对应任务正在执行。
- `succeeded`：节点完成并通过校验。
- `failed`：节点失败。
- `skipped`：节点被条件判断跳过。
- `blocked`：节点因依赖缺失或上游被 kill 而暂停。

#### 6.3.3 核心流转

1. 用户或上游系统创建 Task，任务进入 `queued`。
1. 调度器执行 Guard 校验并选择 Agent，任务进入 `dispatching`。
1. 派发成功后创建 Session，Task 进入 `running`，Agent 进入 `busy`。
1. 运行中持续接收 Dispatch Event、心跳、超时、kill、completion 等事件，必要时把任务转为 `stalled`、`timed_out`、`failed` 或 `cancelled`。
1. 任务成功完成后先做实质成功校验，通过则转为 `succeeded`；不通过则转为 `failed`。
1. 任务进入任一终态后，Completion Event 触发看板更新、审计写入、通知推送和 Chain 决策。
1. 若存在后续 Chain，新的 Task 再次从 `queued` 开始；若无后续 Chain，当前任务闭环结束。

### 6.4 功能需求

#### 域 A:任务生命周期(Task Lifecycle)

负责任务从创建到终态的全生命周期管理。

##### FR-A01:任务创建与入队

通过 API 或 CLI 创建任务并加入调度队列。

- AC1:创建任务时必须提供 label、prompt、timeout;agentId 和 priority 可选(缺省时由路由规则自动填充)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:任务创建成功后立即进入 queued 状态并触发队列消费事件,系统立即尝试派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:创建时可指定 completion chain(完成后触发的后续动作),chain 定义写入任务元数据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:重复创建相同 label + prompt 的任务时,系统返回幂等警告但不阻断(允许用户有意重试)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-A02:任务状态流转

任务按核心对象与状态模型(§6.3)严格流转,非法转换被拒绝。

- AC1:每次状态变更写入 Audit Event,包含变更时间、触发原因、操作者(系统/用户)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:非法状态转换(如 succeeded -> running)被拒绝并记录违规事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:终态(succeeded / failed-exhausted / cancelled)不可逆,任何尝试修改终态任务的操作返回错误。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:状态变更触发对应的 Notification Channel 推送(若用户已配置)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-A03:超时保护

运行中的任务超过 timeout 后自动标记失败。

- AC1:系统通过 `session:timeout` 事件监测超时,超过 timeoutSeconds 的任务自动转为 failed,失败原因标记为 timeout。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:超时阈值从任务创建时的 timeout 字段读取,不存在全局默认值时使用 600s。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:超时触发后,系统尝试向执行 Agent 发送 kill 信号(best-effort,不保证 Agent 响应)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:超时事件写入 Audit Event 并触发通知。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:timeout 值有可配置的下限(默认 300 秒),低于下限的任务创建被拒绝并返回错误,防止过短超时导致任务被误杀。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-A04:实质成功校验

任务报告完成后,校验产出是否有效(防止空跑假完成)。

- AC1:Agent 报告 succeeded 后,系统检查 output_tokens 是否高于可配置阈值(默认 3000)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:若任务 prompt 中指定了产出文件路径,系统检查该文件是否存在且非空。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:校验未通过的任务状态转为 failed,失败原因标记为 substantive_failure。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:校验规则可通过配置扩展(自定义校验函数),默认规则开箱可用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-A05:任务取消

用户或系统可主动取消非终态任务。

- AC1:CLI 命令 `aco task cancel <taskId>` 将任务转为 cancelled 状态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:running 状态的任务被取消时,系统向执行 Agent 发送 kill 信号。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:批量取消支持按 label pattern 或 agentId 筛选。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:取消事件写入 Audit Event 并触发通知。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 B:派发治理(Dispatch Governance)

负责在任务派发前执行准入校验,对不合规的调度决策给出阻断或改派建议。

##### FR-B01:角色-任务匹配校验

派发前校验目标 Agent 的 Role Tag 是否匹配任务类型,并强制执行任务拆分粒度约束,确保一个任务只承载一个角色的一段工作。

- AC1:每个 Dispatch Rule 可定义 role 约束(如"审计任务只能派给 auditor 角色")。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:角色不匹配时,派发被阻断,事件写入 Audit Event,状态保持 queued。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:规则支持 allow/block/warn 三种动作:block 阻断、warn 放行但记录告警、allow 显式放行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:无匹配规则时默认放行(开放策略),用户可切换为默认阻断(封闭策略)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:任务类型通过 LLM 语义分类自动确定。系统调用 LLM 对 task prompt 进行语义分析,输出任务类型标签(如 spec / ac / code / audit / ux / readme / data-ops)。分类结果与目标 Agent 的角色标签比对,不匹配则触发 AC2 阻断逻辑。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:任务类型分类策略按优先级降序:声明式标注(调用方显式指定 taskType)> LLM 语义分类(自动推断)> 默认 fallback(放行)。LLM 分类使用 OpenClaw 配置中的默认模型,单次分类延迟 <= 2 秒。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:特殊任务类型 `data-ops` 具有全角色可执行语义--匹配到 data-ops 类型的任务跳过角色校验,直接放行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8:任务拆分粒度为调度层强制约束--一个任务 = 一个角色 = 一个研发阶段。单个 task prompt 若同时要求多个角色或多个阶段的工作,派发前必须阻断并要求拆分。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9:调度器在 spawn 前必须检查 task prompt 是否同时包含需求/spec 变更、代码变更、架构变更、审计等多阶段或多角色指令;命中时不得以"顺手改""附带改""只改一两句"等理由放行,必须拆成多个任务分别派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10:默认角色映射为:spec / 需求变更 → PM agent;代码变更 → Dev agent;架构变更 → SA agent;审计 → Audit agent。任务拆分后的每个子任务分别按其角色约束继续执行 AC1-AC7 的校验。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11:单 Agent 环境不豁免拆分粒度约束。即使资源池中只有一个 Agent,系统也必须按阶段拆成多个顺序任务逐个 spawn,禁止把多阶段工作打包成一次派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12:ACO 与 SEVO 的边界保持清晰--ACO 负责定义和执行调度约束(怎么拆、怎么派);SEVO 负责定义流水线阶段(走什么顺序、每个阶段做什么)。当调用方来自 SEVO 时,ACO 只校验任务粒度、角色匹配和派发合规性,不改写 SEVO 的阶段定义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC13:派发 cc(Claude Code)任务时,系统必须通过环境变量 `CLAUDE_EFFORT` 设置思考深度。映射规则:简单查询、审查、文件操作使用 `low`;常规开发、bug 修复、重构使用 `high`;架构设计、复杂系统、深度分析使用 `max`。调用方未显式传入时默认使用 `high`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC14:当用户追问"为什么"时,主会话的响应模式必须同时满足两件事:一是先回答根因,明确为什么会发生;二是立即派发固化任务,把该规律落到 L2 注入、调度规则或 spec 中形成长效机制。系统不得只做口头分析而不行动;分析完成的同一轮内必须至少触发一个 PM 或 Dev 任务用于固化,且"回答用户"与"派固化任务"必须并行推进,不能等解释完再串行补做。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC15:任何 L2 插件注入内容、SEVO 流水线阶段 prompt 或其他插件逻辑的新增与变更,在进入代码修改前都必须先确认对应项目 spec 已存在覆盖该规则的 FR/AC。若 spec 尚未覆盖,系统必须先阻断代码修改并派 PM 补齐 spec,待 spec 完成后才能继续实现。正确顺序固定为:spec 定义规则 → L2/插件实现规则 → TOOLS.md 记录能力。唯一例外是修复已被现有 spec 明确定义的紧急 bug,该类修复可先处理但不得借机引入超出 spec 的新规则。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC16:ACO spec 的唯一真相源是飞书文档,本地 `docs/product-requirements.md` 只是 git 备份。派发 PM 执行 spec 变更任务时,task prompt 必须明确固定顺序:先用 `lark-cli docs +update` 直接修改飞书,再用 `lark-cli docs +fetch` 拉回本地 md;禁止先改本地 md 再 overwrite 飞书。若本地已先改,必须先 fetch 飞书最新版本做 diff 合并,确认无冲突后才能 update 飞书。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-B02:自审禁止

禁止开发 Agent 审计自己的产出。

审计任务必须保留在 SEVO 流水线内派发。审计是 review → fix loop 的入口节点：审计在流水线内，发现问题后可以自动触发修复阶段；审计脱离流水线，闭环会断，修复只能靠人工重新触发。ACO 的职责是按 SEVO 流水线要求完成派发治理，不能用 `audit-` 前缀或其他标签绕过流水线路由；ACO 只判断派发是否合规，不决定某个研发任务是否需要走流水线。

- AC1:系统自动检测任务的"产出者"和"审计者"是否为同一 agentId,相同则阻断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:产出者信息从 completion chain 的父任务中提取(父任务的 agentId = 产出者)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:阻断时自动路由到同角色的其他 Agent;若无可用替代,任务保持 queued 并告警。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:自审检测覆盖直接派发和 completion chain 自动触发两种场景。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-B03:并发控制

限制同一 Agent 同时执行的任务数量。

- AC1:每个 Agent Slot 有 maxConcurrency 配置(默认 1),超出时新任务排队等待。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:队列消费选取任务时,跳过已达并发上限的 Agent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:并发限制可按 Agent 粒度配置,也可按 Tier 粒度设置默认值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:达到并发上限时,系统记录排队事件但不告警(正常行为)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:支持按 runtime type 设置全局并发上限(如 ACP 类型总并发 <= N,默认 8)。ACP 进程占用独立内存(150-300MB/个),全局上限防止内存溢出。全局上限独立于 per-Agent 的 maxConcurrency,两者取较严值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:watchdog 必须把 `timed_out` 识别为终态,与 `failed`、`succeeded` 同等处理。任务进入 `timed_out` 后,不得再被恢复、重派为 running、覆盖回 running,也不得继续占用该 agent 的并发槽位。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-B04:规则热更新

运行时修改 Dispatch Rule 无需重启服务。

- AC1:CLI 命令 `aco rule add/remove/update` 立即生效,下一次派发决策使用新规则。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:规则变更写入 Audit Event,包含变更前后的 diff。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:规则支持从配置文件批量加载(`aco rule load <file>`),文件格式为 YAML 或 JSON。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:规则冲突(同一任务匹配多条规则)按优先级排序,最高优先级规则生效。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-B05:熔断机制

当某 Agent 连续失败达到阈值时,自动暂停向其派发任务。

- AC1:连续失败次数达到可配置阈值(默认 3)时,Agent Slot 状态转为 offline。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:熔断触发后,该 Agent 的 queued 任务自动路由到同 Tier 其他 Agent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:熔断状态持续可配置时长(默认 5 分钟)后自动恢复为 idle,允许探测性派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:熔断事件写入 Audit Event 并触发高优先级通知。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-B06:动态角色发现(Dynamic Role Discovery)

ACO 从 OpenClaw 配置动态读取 Agent 列表和角色映射,禁止硬编码 Agent ID。

- AC1:支持 OpenClaw 配置(`openclaw.json` 的 `agents.list`)中的可选 `role` 字段,合法值为 `"coding" | "pm" | "architecture" | "review" | "ux" | "research"`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:启动时从 OpenClaw 配置动态构建 ROLE_AGENTS(角色→Agent 列表映射)和 ROLE_TASK_MAP(任务类型→允许角色映射),禁止在代码中硬编码任何 Agent ID。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:无 role 声明时的渐进式降级--单 Agent 模式:跳过角色匹配,所有任务允许派发;多 Agent 无 role 声明:warn 模式,记录日志但继续派发;有 role 声明:enforce 模式,阻断角色不匹配的派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:AGENT_TIER 支持从配置显式声明或根据 runtime.type 自动推断(acp 类型推断为 T1-T3,subagent 类型推断为 T4),显式声明优先于自动推断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:配置变更后自动刷新角色映射和梯队信息(优先利用 OpenClaw 的 config watcher 机制,也可使用 ACO 自身的 FR-H02 配置热加载能力),无需重启服务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:动态构建的映射关系写入启动日志,便于排查角色匹配问题。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:面向外部用户或第三方维护者的示例文档、README 片段、CLI 示例、配置示例和任务 prompt 示例必须可移植,不得把机器绝对路径(例如 `/root/.openclaw/...`、`/home/<user>/.openclaw/...`、个人 workspace 绝对路径)写成用户应复制执行的固定路径;需要表达 OpenClaw 安装根、workspace 根或项目根时,必须使用 `$OPENCLAW_HOME`、`$WORKSPACE_ROOT`、`$PROJECT_ROOT` 等占位符或相对路径。若示例确需展示一次性诊断输出中的真实本机路径,必须明确标注为不可复制的诊断样例并对个人路径做占位化。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含文档片段、示例命令或配置示例的可观测输出之一；若面向用户复制的示例仍包含 `/root/.openclaw`、`~/.openclaw` 或个人 workspace 绝对路径且未标注为诊断样例,则判定为 `fail`。

##### FR-B07:LLM 任务分类器语义覆盖

LLM 分类器的 prompt 覆盖所有角色的实际工作范围,分类结果与角色允许范围语义一致。

- AC1:任务类型定义必须覆盖每个已注册角色的全部工作范围--coding 覆盖编码、重构、测试、修复;architecture 覆盖分析、方案设计、评审、选型、契约定义;pm 覆盖需求分析、规格撰写、优先级排序;review 覆盖代码审计、质量检查、安全审查;ux 覆盖视觉验证、交互评审、可用性测试;research 覆盖调研、分析、报告撰写。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:分类器 prompt 中的任务类型定义必须与 ROLE_TASK_MAP 的允许范围语义一致--当 ROLE_TASK_MAP 因动态角色发现(FR-B06)更新时,分类器 prompt 同步更新。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:分类失败(LLM 超时、不可用、返回无法解析的结果)时 fallback 到 warn 模式--放行派发但记录告警日志,不硬性阻断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:分类结果写入 Audit Event(已有 `dispatch-guard-events.jsonl` 机制),包含原始 prompt 摘要、分类结果、置信度(若模型提供)、命中的角色匹配规则。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:支持分类结果缓存--相同 prompt pattern 的任务在可配置时间窗口内(默认 5 分钟)复用上次分类结果,减少 LLM 调用开销。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 C:资源池管理(Resource Pool)

负责 Agent 资源的注册、分级、状态追踪和路由选择。

##### FR-C01:Agent 注册与发现

自动发现 OpenClaw 环境中的 Agent 并注册到资源池。

- AC1:`aco init` 时自动扫描 OpenClaw 的 Agent 配置(`openclaw.json` 的 `agents.list`),生成初始资源池。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:手动注册支持 CLI(`aco pool add <agentId> --tier T2 --role coder`)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:注册信息包含 agentId、tier、role tags、maxConcurrency、runtime type。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:Agent 配置变更时(OpenClaw 配置热更新),资源池自动同步(通过 config watcher 或手动 `aco pool sync`)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-C02:梯队路由

根据任务复杂度自动选择合适梯队的 Agent。

- AC1:任务创建时可指定目标 Tier;未指定时,系统根据 prompt 长度和 timeout 推断默认 Tier。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:同 Tier 内多个 Agent 可用时,按负载均衡策略选择(默认:最少活跃任务优先)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:指定 Tier 无可用 Agent 时,自动升级到更高 Tier(T4 -> T3 -> T2 -> T1)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:梯队路由决策写入 Audit Event,包含候选列表和最终选择原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-C03:失败梯队升级

任务失败后自动升级到更高梯队重试。

- AC1:任务失败且重试次数未耗尽时,自动将目标 Tier 升一级并重新入队。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:已在最高 Tier(T1)失败的任务不再升级,标记为 failed-exhausted。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:升级时保留原始 prompt,可选追加失败上下文(上次失败原因)到新 prompt。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:梯队升级路径和每次尝试的结果记录在任务元数据中,支持事后分析。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-C04:资源池状态视图

提供 Agent 资源池的实时状态概览。

- AC1:CLI 命令 `aco pool status` 展示每个 Agent 的当前状态、活跃任务数、累计完成数、失败率。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:支持按 Tier、Role、状态筛选。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:状态数据实时更新(基于任务状态变更事件),不依赖定时轮询。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:输出格式支持 table(终端友好)和 JSON(程序消费)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 D:自动推进链(Completion Chain)

负责任务完成后自动触发后续动作,实现流水线式编排。

##### FR-D01:链式触发

任务成功完成后,自动创建并派发后续任务。

- AC1:Completion Chain 定义支持"A 完成后触发 B"的声明式配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:触发时,后续任务的 prompt 可引用父任务的产出(通过模板变量 `{{parent.output}}`、`{{parent.files}}`)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:后续任务继承父任务的 priority,可通过 chain 配置覆盖。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:链式触发在父任务状态变为 succeeded 后同步执行(在同一个事件处理周期内完成入队)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:支持条件循环链(loop chain)--当后续任务的产出结论为负面(如审计不通过)时,自动触发修复任务,修复完成后重新触发原审计任务,循环直到通过或达到最大循环次数(可配置,默认 3)。区分"任务执行失败"(进入 onFailure 分支)和"任务产出结论为负面"(进入 loop chain)两种场景。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-D02:条件触发

根据父任务的产出内容决定是否触发后续动作。

- AC1:Chain 定义支持 condition 字段,基于父任务产出的结构化数据做布尔判断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:条件表达式支持基础比较(==、!=、>、<)和逻辑组合(AND、OR、NOT)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:条件不满足时,chain 跳过该步骤并记录跳过原因到 Audit Event。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:条件评估失败(表达式错误)时,chain 暂停并告警,不静默跳过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-D03:失败分支

任务失败时触发不同的后续动作(区别于成功路径)。

- AC1:Chain 定义支持 onFailure 分支,与 onSuccess 分支独立配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:onFailure 分支可配置"拆分重试"(将原任务拆为多个子任务)或"升级通知"(告警人工介入)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:失败分支触发时,系统自动将失败上下文(错误信息、失败原因)注入后续任务的 prompt。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:未配置 onFailure 分支时,默认行为为梯队升级重试(FR-C03)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-D04:链路可视化

展示 Completion Chain 的执行路径和当前进度。

- AC1:CLI 命令 `aco chain status <chainId>` 展示链路中每个节点的状态(pending/running/succeeded/failed/skipped)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:输出包含每个节点的执行时间、agentId、产出摘要。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:支持查看历史已完成的 chain 执行记录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:输出格式支持 tree(终端友好)和 JSON(程序消费)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 E:可观测性与审计(Observability & Audit)

负责调度决策的全链路记录和运行时状态的实时可查。

##### FR-E01:调度审计日志

记录每次派发决策的完整上下文。

- AC1:每次派发决策生成一条 Audit Event,包含时间戳、taskId、候选 Agent 列表、命中规则、最终决策、决策原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:审计日志持久化到本地文件(JSONL 格式),支持按时间范围和 taskId 查询。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:CLI 命令 `aco audit query --from <time> --to <time> --task <taskId>` 查询审计日志。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:审计日志保留时长可配置(默认 30 天),过期自动清理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-E02:任务看板

提供所有任务的实时状态聚合视图。

- AC1:CLI 命令 `aco board` 展示当前所有非终态任务的状态、agentId、已运行时长、优先级。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:支持按状态(queued/running/failed)、agentId、priority 筛选。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:看板数据基于内存状态实时生成,不依赖定时快照。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:输出格式支持 table 和 JSON。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:看板支持 watch 模式(`aco board --watch`),每 5 秒刷新一次。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-E03:资源利用率统计

统计 Agent 池的利用率和效率指标。

- AC1:统计指标包含:每个 Agent 的忙碌率、平均任务耗时、失败率、梯队升级次数。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:统计周期支持 1h / 24h / 7d,CLI 命令 `aco stats --period 24h`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:利用率 = Agent 处于 busy 状态的时间 / 统计周期总时间。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:统计数据基于 Audit Event 聚合计算,不引入额外存储。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-E04:决策溯源

对任意任务,可追溯其完整调度历史。

- AC1:CLI 命令 `aco task history <taskId>` 展示该任务从创建到终态的所有状态变更和调度决策。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:每条记录包含时间戳、状态变更、触发原因、关联的 Audit Event ID。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:若任务经历过重试,展示每次尝试的 agentId、Tier、耗时、失败原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:输出支持 JSON 格式,便于程序化分析。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 F:通知与 IM 推送(Notification)

负责将任务状态变化和系统事件推送到用户配置的 IM 渠道。

##### FR-F01:通知渠道注册

用户配置 IM 通知渠道,系统自动推送状态变化。

- AC1:支持飞书、Telegram、Discord、Slack、通用 Webhook 五种渠道类型。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:CLI 命令 `aco notify add --type feishu --config <json>` 注册渠道,配置包含认证凭据和目标地址。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:注册后立即发送测试消息验证连通性,失败时提示具体错误原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:支持多渠道并行推送(同一事件推送到所有已注册渠道)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:`aco init` 执行时自动检测 OpenClaw 已配置的 IM 渠道,对已存在的渠道自动注册为通知目标,无需用户手动 `aco notify add`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:若 OpenClaw 环境无已配置渠道,`aco init` 输出提示信息告知用户如何手动注册,不阻塞 init 流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-F02:事件订阅过滤

用户可配置哪些事件触发通知,避免信息过载。

- AC1:支持按事件类型过滤:task_succeeded、task_failed、task_timeout、circuit_break、chain_completed。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:支持按优先级过滤:只推送 priority >= N 的任务事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:支持按 agentId 过滤:只关注特定 Agent 的事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:默认订阅 task_failed 和 circuit_break(关键异常),用户可调整。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:支持按 task label 模式排除:配置 `excludeLabels` 列表,匹配前缀或正则表达式的事件跳过通知。默认排除 `healthcheck`、`heartbeat`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:支持按任务来源过滤:区分 subagent、acp、system、main 四种来源类型,用户可配置只通知特定来源(默认通知 subagent + acp,排除 system 和 main session)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-F03:通知内容模板

推送消息包含结构化的任务上下文,用户无需回到终端查看详情。

- AC1:通知消息包含:taskId、label、状态变更、agentId、耗时、失败原因(如有)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:成功通知包含产出摘要(前 200 字符或文件路径列表)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:失败通知包含失败原因和建议的下一步操作(如"已自动升级梯队重试")。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:通知模板可自定义(Handlebars 语法),默认模板开箱可用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-F04:通知送达确认

追踪通知是否成功送达,失败时重试。

- AC1:每条通知记录送达状态(sent/delivered/failed),持久化到本地存储。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:送达失败时自动重试(最多 3 次,间隔指数退避)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:连续送达失败超过阈值时,标记渠道为 degraded 并告警。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:CLI 命令 `aco notify status` 查看各渠道的送达率和最近失败记录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:CLI 命令 `aco notify test` 向所有已注册渠道发送测试消息,输出每个渠道的送达结果(成功/失败+原因)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:`aco init` 完成渠道注册后自动执行一次 `notify test`,验证通知链路端到端可用。失败时输出诊断信息但不阻塞 init。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-F05:任务完成即时通知

子 Agent / ACP 任务完成时自动推送通知到用户已注册的 IM 渠道,开箱即用无需额外配置。

- AC1:监听 Gateway 任务完成事件(session:complete),提取 agentId、task label、成功/失败状态、耗时四个字段,组装通知消息并推送。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:通知发送采用异步 fire-and-forget 语义--发送失败仅写 warn 日志,不抛错、不阻塞任务完成流程、不影响推进链触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:`aco init` 完成且至少注册一个通知渠道后,任务完成通知默认启用,无需额外订阅配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:默认通知格式:`✅ [agentId] label | 耗时` 或 `❌ [agentId] label | 耗时(失败)`。用户可通过 FR-F03 模板机制自定义格式。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:耗时计算从任务创建(dispatching)到完成(succeeded/failed)的实际时长,精度到秒。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:通知渠道复用 FR-F01 注册的 Transport 抽象,不绑定特定 IM 平台。飞书渠道通过 Transport 适配层调用 lark-cli 或 Lark API 实现。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:单次通知发送超时上限 10 秒,超时后放弃本次发送(不阻塞后续流程)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8:通知模块注册的事件监听名称必须来自 OpenClaw Gateway 已声明的事件列表。注册事件监听时自动校验事件名合法性,不合法则报错并提示可用事件列表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9:`aco notify status` 输出中包含"事件监听状态"字段,显示每个已注册事件监听是否被 OpenClaw Gateway 正常加载并处于活跃监听状态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10:`subagent_ended` 事件触发时,L2 注册 `pendingClosure` 追踪该 completion。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11:L2 在主会话回复前检测是否有未发送的 `pendingClosure`;如果有且主会话未调用 `lark-cli`,则注入强制指令阻止回复(强提醒模式)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12:主会话必须整理 completion 结果为人话摘要后,通过 `lark-cli` 发送飞书;L2 检测到 `lark-cli` 调用后标记 `larkSent=true` 并放行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC13:禁止 L2 直接发送任何固定格式/拼接字段的飞书消息;所有飞书内容必须经过主会话 LLM 整理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC14:任何涉及代码修改的任务派发前,必须先校验对应 spec 是否需要同步修改。spec 变更优先于代码变更。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

本 FR 实现后，通知能力统一由 ACO 域 F 承载，独立的 `completion-notify` 插件不再作为目标形态保留。

##### FR-F06:多 Agent 并发效率最大化

dispatch-guard 在主会话每次响应时，检测是否存在可立即派发的待做任务。触发条件为三个 AND：① 当前对话上下文中已明确有待做任务（已知下一步是什么、怎么做）② 这些待做任务与正在运行的任务不冲突（不写同一文件、不依赖其产出）③ 有任何一个 agent 空闲（总容量未满即可，不需要 ≥2）。满足条件时，插件向主会话注入强制派发指令，要求立即 spawn。

- AC1：有 1 个空闲 agent + 上下文有明确待做 + 不冲突 → 触发派发提示 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2：所有 agent 都在 running → 不触发 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3：上下文无明确待做任务 → 不触发 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4：待做任务依赖正在运行任务的产出 → 不触发（等依赖完成） 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-F07:任务闭环保障(Closure Guard)

子 Agent 任务完成后,插件在 completion event 到达主会话时注入提醒到主会话上下文,逼主会话自行向用户发送人话总结。若主会话在规定时间内完成发送则记录闭环成功,否则记录审计事件,不发送任何用户可见通知。

背景:主会话收到 completion event 后应向用户发送结论摘要,但 L6 prompt 规则在长上下文下容易被稀释,导致通知遗漏。本 FR 在 L2 插件层通过 `before_prompt_build` hook 注入不可忽略的提醒文本,提升主会话的闭环执行率。

- AC1:任务完成事件(succeeded 或 failed)触发后启动闭环计时器,倒计时时长通过配置项 `closureGuard.timeoutSeconds` 指定,默认 120 秒。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:计时期间监听用户可见渠道(已注册的 FR-F01 Transport)的出站消息。若检测到主会话通过任一已注册渠道发送了包含该任务 taskId 或 label 的消息,视为闭环成功,取消计时器。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:计时器到期且未检测到闭环消息时,记录审计事件(closure_missed),不发送任何用户可见通知。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:闭环保障的核心机制是通过 `before_prompt_build` hook 在 completion event 到达主会话时注入不可忽略的提醒文本,要求主会话执行总结发送。提醒只注入到主会话上下文,不发给用户。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:闭环保障默认对所有任务启用。支持通过配置项 `closureGuard.excludeLabels` 排除特定 label 模式(前缀或正则),排除的任务不启动闭环计时器。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:闭环保障作为 L2 插件层能力运行,在 Gateway 事件循环中独立于主会话上下文执行。主会话崩溃、超时或上下文被截断不影响闭环审计的记录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:闭环超时后记录审计事件(类型 `closure_missed`),包含 taskId、label、agentId、等待时长、触发原因(主会话未在规定时间内发送总结)。审计事件可通过 `aco audit list --type closure_missed` 查询。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8:配置项 `closureGuard.enabled` 控制全局开关,默认 true。设为 false 时所有闭环计时器不启动,等价于功能关闭。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9:闭环检测通过 OpenClaw 出站消息事件判断主会话是否已发送总结,不硬编码特定 IM SDK 调用方式。不同 IM 渠道通过 `detectOutboundMessage` 实现适配。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10:`aco init` 生成的默认配置中 `closureGuard` 段已包含合理默认值(enabled: true, timeoutSeconds: 120, excludeLabels: ["healthcheck", "heartbeat"]),用户无需额外配置即可获得闭环保障能力。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11:completion event 到达主会话时,插件通过 `before_prompt_build` hook 注入提醒文本到主会话上下文。提醒内容包含:任务名称、agentId、耗时、明确的 lark-cli 命令格式要求。每个 completion 只注入一次(标记 reminded)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12:提醒注入仅对主会话(agent=main)的用户渠道 session 生效,不影响子 Agent session。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC13:`aco init` 必须在目标目录生成可直接被 Gateway 加载的闭环保障插件文件(支持 ESM/CJS 双格式),插件注册 `subagent_ended`、`before_prompt_build`、`message_sending` 三个 hook,生成后无需手动编写任何代码即可启用闭环保障能力。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC14:生成的插件必须包含 post-reminder auto-close 机制——`before_prompt_build` 注入提醒后立即启动短超时计时器(默认 15 秒,可通过 `closureGuard.postReminderTimeoutSeconds` 配置),到期后自动将该 pending closure 标记为 `closure_detected` 并取消闭环计时器,不依赖 `message_sending` hook 的出站消息检测作为唯一闭环路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC15:生成的插件必须包含 next-turn detection 兜底机制——下一轮 `before_prompt_build` 触发时,自动检测并清除所有已标记 reminded 的 pending closures(视为主会话已处理),避免重复注入提醒或遗留僵尸状态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-F08:Completion 飞书补发强制提示(L2 注入)

子 Agent / ACP 任务完成事件到达主会话时,L2 插件在主会话上下文中注入不可忽略的强制提示,要求主会话必须用 lark-cli 将任务结果的人话摘要通过飞书发送给用户。

背景:主会话收到 completion event 后应通过飞书向用户发送结论摘要,但该行为仅靠 L6 prompt 规则约束,在长上下文下反复失败(连续 3 次漏发)。本 FR 将"飞书补发"从 L6 提升到 L2 插件层,通过 `before_prompt_build` hook 在 completion event 注入主会话时追加强制提示文本,确保主会话无法遗漏。

用户已能通过任务看板的飞书卡片推送获知任务状态变化（完成/失败/超时），但看板卡片只有状态字段，不包含任务的进展总结与结论。用户需要的是主会话基于任务上下文和结果产出的清晰人话摘要，而非系统字段拼接的通知。

- AC1:completion event(succeeded 或 failed)到达主会话时,插件通过 `before_prompt_build` hook 在主会话上下文中注入强制提示文本。注入后主会话的可见上下文中必须包含该提示,不依赖主会话自身记忆。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:注入的提示文本模板包含:任务名称、agentId、状态、目标用户 ID、明确的 lark-cli 命令格式要求,以及"禁止跳过"的强制语义。示例:`⚠️ 飞书补发铁律:你必须用 lark-cli 把上述任务结果的人话摘要发送给用户(ou_xxx)。用户只能通过飞书看到结果。禁止跳过。` 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:提示文本中的目标用户 ID 从配置项 `completionReminder.targetUserId` 读取,不硬编码。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:配置项 `completionReminder.enabled` 控制全局开关,默认 true。设为 false 时不注入任何提示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:插件加载失败或运行时异常不影响 Gateway 正常运行和 completion event 的正常传递(graceful degradation)。异常仅写 warn 日志。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:注入仅对主会话(agent=main)的 session 生效,不影响子 Agent session 的 completion 处理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:每个 completion event 只注入一次提示(通过 taskId 去重标记),避免重复注入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8:`aco init` 生成的默认配置中 `completionReminder` 段已包含合理默认值(enabled: true, targetUserId 从 OpenClaw 已配置的 IM 用户中自动提取),用户无需额外配置即可获得强制提示能力。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9:插件通过 `openclaw.json` 的 `plugins.load.paths` 加载,遵循 ACO 插件标准加载机制。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

与 FR-F07 的关系:FR-F07 关注"主会话是否在规定时间内完成了飞书发送"(闭环审计),FR-F08 关注"在 completion event 到达的那一刻确保主会话看到强制提示"(注入保障)。两者互补——F08 提供注入,F07 提供兜底审计。

##### FR-37:开发完成审计提醒注入

Implement 阶段的开发任务成功完成后,completion event 到达主会话时,系统必须向主会话上下文注入审计提醒,引导主会话先派发独立审计再对用户收尾。该能力用于兜住开发到审计之间的质量门禁,避免主会话在长上下文或连续 completion 场景下把“开发完成”误当作“任务闭环”。

为什么这样做:开发 completion 只说明实现者声明完成,不等于实现已按 spec/AC 验收通过。审计是开发结果进入后续交付链前的独立质量门禁。如果主会话先向用户宣布收尾,再想起审计,用户看到的是未验证结果,流水线也会失去 review→fix loop 的自动闭环。把提醒注入到主会话 prompt,能让主会话在收到 completion 的同一回合先完成审计派发,再整理用户可见结论。

- AC1:当 completion event 同时满足以下条件时,系统必须触发审计提醒注入:任务处于 Implement 阶段;label 前缀为 `sevo:fix` 或 `sevo:implement`;开发任务成功完成;completion event 已到达主会话。验收验证:审计时用 completion 事件模拟构造满足四个条件的事件,主会话 prompt 中必须出现审计提醒;记录结构化结果 `{ acId, status, evidence, reason }`,`evidence` 必须包含模拟事件输入和注入后的 prompt 片段。
- AC2:当触发 AC1 时,提醒必须只注入到主会话 prompt,即 session 标识以 `agent:main:` 开头的会话;子 Agent、ACP Agent 或其他非主会话不得收到该提醒。验收验证:审计时分别模拟 `agent:main:` 与非 `agent:main:` session 的 completion 到达,仅主会话样本出现提醒;记录结构化结果 `{ acId, status, evidence, reason }`,`evidence` 必须包含两个 session 样本的注入结果。
- AC3:当审计提醒被注入时,提醒内容必须至少包含四项信息:此刻立即派发独立审计;不得先回复用户收尾;审计必须对照 spec/AC 验收;被审计任务标题。验收验证:审计时检查注入文本,四项信息缺任一项即判定为 `fail`;记录结构化结果 `{ acId, status, evidence, reason }`,`evidence` 必须包含完整提醒文本。
- AC4:当 completion event 属于非 Implement 阶段、失败 completion、审计任务自身 completion 或非主会话 session 时,系统不得注入开发完成审计提醒。验收验证:审计时分别模拟四类排除边界,主会话 prompt 中不得出现该审计提醒;记录结构化结果 `{ acId, status, evidence, reason }`,`evidence` 必须包含各边界样本输入和未注入结果。
- AC5:该能力必须具备可观测验收路径:至少包含 vitest 自动化测试和 completion 事件模拟。测试必须覆盖触发条件、注入目标、提醒内容和排除边界。验收验证:审计时运行对应 vitest 用例并查看 completion 事件模拟输出;记录结构化结果 `{ acId, status, evidence, reason }`,`evidence` 必须包含测试命令输出和至少一个模拟事件样本。


---

#### 域 G:健康与恢复(Health & Recovery)

负责 Agent 健康监测、卡死检测和自动恢复。

##### FR-G01:心跳检测

定期探测 Agent 是否存活。

- AC1:系统通过 `message:received` 事件监测 Agent 活跃度,结合定时健康探针(可配置间隔,默认 30 秒)检查 running 状态任务的 Agent 是否仍在响应。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:连续 N 次(可配置,默认 3)探测无响应时,Agent Slot 状态转为 stale。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:stale 状态的 Agent 上的 running 任务自动转为 failed(原因:agent_unresponsive)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:探测间隔可配置(默认 30 秒),不同 Tier 可设置不同间隔。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-G02:卡死检测

识别长时间无产出的任务(区别于正常长耗时任务)。

- AC1:running 任务超过 timeout * 0.8 仍无中间产出时,系统发出 stall_warning 事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:stall_warning 触发后,系统尝试向 Agent 发送 steer 消息("请报告当前进度")。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:steer 后 60 秒仍无响应,任务标记为 stalled 并触发超时流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:卡死检测可按任务类型关闭(某些任务天然长时间无中间输出)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-G03:自动恢复策略

Agent 异常后自动恢复服务能力。

- AC1:Agent 从 stale/offline 恢复为 idle 后,系统自动将其排队中的任务重新纳入调度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:恢复后的第一个任务为探测性派发(低优先级、短超时),验证 Agent 确实可用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:探测性派发成功后,Agent 恢复正常调度权重。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:恢复事件写入 Audit Event 并通知用户。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-G04:全局健康仪表盘

一览系统整体健康状态。

- AC1:CLI 命令 `aco health` 展示:活跃 Agent 数、stale Agent 数、队列深度、平均等待时间、熔断中的 Agent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:健康状态有三级:healthy(所有指标正常)、degraded(部分 Agent 异常但系统可用)、critical(无可用 Agent)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:critical 状态触发高优先级通知。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:健康数据可通过 JSON API 暴露,供外部监控系统消费。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 H:配置与渐进式披露(Configuration)

负责系统配置的管理,支持从零配置到完整配置的渐进式体验。

##### FR-H01:零配置启动

无任何配置文件时,系统以合理默认值启动。

- AC1:`aco init` 在无配置文件时生成最小配置(单 Agent、默认超时、无治理规则)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:最小配置下所有核心功能可用:任务创建、调度、超时保护、看板、通知(需配置渠道)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:生成的配置文件包含注释说明每个字段的用途和可选值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:单 Agent 环境下,治理规则(角色校验、自审禁止)自动降级为 warn 模式(不阻断)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-H02:配置热加载

修改配置文件后无需重启即可生效。

- AC1:系统监听配置文件变更(fs watch),检测到变更后自动重新加载。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:配置加载前执行 schema 校验,校验失败时拒绝加载并保持旧配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:配置变更写入 Audit Event,包含变更字段和新旧值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:CLI 命令 `aco config reload` 手动触发重新加载(用于 watch 不可用的环境)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-H03:配置校验与提示

配置错误时提供明确的错误信息和修复建议。

- AC1:CLI 命令 `aco config validate` 校验当前配置文件,输出所有错误和警告。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:错误信息包含:字段路径、期望类型/值、实际值、修复建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:常见错误(如引用不存在的 agentId)提供具体修复命令。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:配置文件支持 JSON 和 YAML 两种格式。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-H04:渐进式功能启用

用户按需启用高级功能,不强制全量配置。

- AC1:功能分层:L0(基础调度)→ L1(治理规则)→ L2(推进链)→ L3(通知)→ L4(统计分析)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:每层功能独立启用,不依赖更高层。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:CLI 命令 `aco feature enable <feature>` 启用特定功能并生成对应配置模板。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:`aco status` 展示当前已启用的功能层级。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 I：输出质量门禁(Output Quality Gate)

负责治理主会话发给用户的出站消息，检测并消除技术标签污染，确保用户收到的消息始终是人话。

背景：用户沟通偏好（禁止 agent ID、文件路径、FR/AC 编号、函数名、命令行等技术标签）写在 L6 prompt 层，但长上下文压缩后规则反复丢失，导致违规消息直达用户。本域在 L2 插件层提供送达前治理，不依赖模型对 prompt 的遵从度。

##### FR-I01：出站消息人话门禁(Output Humanizer Guard)

主会话通过用户可见渠道发出的消息，在送达前经过技术标签检测；命中时自动改写为人话或注入强提醒，确保用户永远不会收到带技术标签的消息。

**检测规则（正则模式匹配，不需要语义理解）：**

<lark-table rows="7" cols="3" header-row="true" column-widths="244,244,244">

  <lark-tr>
    <lark-td>
      类别
    </lark-td>
    <lark-td>
      模式示例
    </lark-td>
    <lark-td>
      匹配规则
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      Agent ID
    </lark-td>
    <lark-td>
      sa-01、pm-02、audit-01、dev-01、ux-01
    </lark-td>
    <lark-td>
      `[a-z]+-\d{2}` 且命中已注册 agent 池
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      文件路径
    </lark-td>
    <lark-td>
      /root/、workspace/、projects/、~/.openclaw/
    </lark-td>
    <lark-td>
      以 `/` 或 `~/` 开头的路径片段，或含 `workspace/`、`projects/` 的字符串
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      FR/AC 编号
    </lark-td>
    <lark-td>
      FR-A01、AC-3、FR-I01
    </lark-td>
    <lark-td>
      `(FR
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      函数名/变量名
    </lark-td>
    <lark-td>
      getUserName、task_board、handleCompletion
    </lark-td>
    <lark-td>
      驼峰命名(`[a-z]+[A-Z][a-zA-Z]+`)或下划线命名(`[a-z]+_[a-z_]+`)且长度 >= 6
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      命令行
    </lark-td>
    <lark-td>
      git commit、npm publish、openclaw gateway、npx aco
    </lark-td>
    <lark-td>
      命中预定义命令关键词表(`git`、`npm`、`npx`、`openclaw`、`docker`、`curl`、`systemctl` 等后跟子命令)
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      代码片段
    </lark-td>
    <lark-td>
      import、require()、console.log、function()
    </lark-td>
    <lark-td>
      命中代码语法关键词模式
    </lark-td>
  </lark-tr>
</lark-table>

**处理策略（二选一，由配置项决定）：**

- **策略 B（LLM 改写）**：检测到技术标签后，调用 LLM 将消息改写为纯人话再发出。用户无感知，但有额外延迟（预估 2-5 秒）。
- **策略 C（注入提醒）**：检测到技术标签后，在消息前注入系统级强提醒（对用户不可见），要求模型立即重新生成不含技术标签的版本。延迟更低，但依赖模型对注入提醒的即时响应。

**验收标准：**

- AC1：插件在 Gateway 事件循环中接管 `message:outbound` 事件（或等价的出站消息钩子），在消息实际送达用户可见渠道之前执行检测逻辑。治理点必须在 L2 插件层，独立于主会话上下文。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2：检测引擎对上述六类模式逐一匹配。任一类别命中即触发处理策略。检测结果包含：命中类别、命中文本片段、在原文中的位置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3：配置项 `outputGuard.strategy` 指定处理策略，可选值 `rewrite`（策略 B）或 `remind`（策略 C），默认 `remind`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4：策略 B（rewrite）生效时，插件调用配置的 LLM（通过 `outputGuard.rewriteModel` 指定，默认复用 OpenClaw 配置中的默认模型）将原始消息改写为不含任何技术标签的人话版本，改写后的消息替换原始消息发出。改写 prompt 固定为系统内置，不暴露给用户修改。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5：策略 C（remind）生效时，插件阻断当前消息发送，向主会话注入一条系统级指令（对用户不可见）：“你的回复包含技术标签（具体列出命中项），请立即重新生成不含技术标签的版本。”主会话重新生成后再次经过检测，通过后放行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6：策略 C 的重试上限为 3 次。连续 3 次重新生成仍命中技术标签时，自动降级为策略 B（LLM 改写）强制清洗后发出，并记录审计事件（类型 `output_guard_fallback`）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7：配置项 `outputGuard.channels` 指定生效渠道列表（如 `["feishu", "telegram"]`）。未列入的渠道（如 `webchat`）不执行检测，消息直接放行。默认值 `["feishu"]`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8：配置项 `outputGuard.enabled` 控制全局开关，默认 `true`。设为 `false` 时所有出站消息不经过检测，直接放行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9：配置项 `outputGuard.strictness` 控制检测严格度，可选值 `strict`（全部六类模式启用）、`moderate`（仅 agent ID + 文件路径 + FR/AC 编号 + 命令行）、`relaxed`（仅 agent ID + 文件路径）。默认 `strict`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10：白名单机制——配置项 `outputGuard.allowPatterns` 接受正则数组，命中白名单的文本片段不触发检测。用于放行用户明确允许的技术术语（如产品名中包含路径格式的情况）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11：每次检测触发（无论是否命中）记录审计事件（类型 `output_guard_scan`），命中时额外记录 `output_guard_triggered`，包含：消息摘要（前 50 字符）、命中类别、命中片段、采用的处理策略、处理结果（rewrite/remind/fallback）。审计事件可通过 `aco audit list --type output_guard_triggered` 查询。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12：`aco init` 生成的默认配置中 `outputGuard` 段已包含合理默认值（enabled: true, strategy: "remind", channels: ["feishu"], strictness: "strict", allowPatterns: []），用户无需额外配置即可获得出站消息人话门禁能力。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC13：检测逻辑的模式库通过配置项 `outputGuard.patterns` 可扩展。用户可添加自定义正则模式到检测列表，格式为 `{category: string, pattern: string, description: string}`。内置模式不可删除，只可追加。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC14：性能约束——单条消息的检测耗时不超过 50ms（纯正则匹配，不含 LLM 调用）。策略 B 的 LLM 改写耗时不计入此约束，但必须在 30 秒内完成，超时则放行原始消息并记录 `output_guard_timeout` 审计事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 J：插件基础设施(Plugin Infrastructure)

负责 generator 的声明式注册与自动发现机制，以及与 SEVO 流水线的 init 覆盖验证集成。

##### FR-J01：声明式插件注册（init 自动发现）

**目标**：`aco init` 不再需要手动在 `initCommand()` 中逐个调用 generator，而是自动发现并执行所有已注册的 generator。

**AC**：

- AC1：`src/generators/` 目录下所有导出 `generate()` 函数的模块自动被 `aco init` 发现并执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2：新增 generator 只需放入 `src/generators/` 并导出标准接口，无需修改 `init.ts`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3：每个 generator 导出 `{ name, description, generate(env, config, force) }` 标准接口。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4：`aco init --list` 列出所有已注册的 generator 及其描述。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5：generator 执行顺序由可选的 `priority` 字段控制（默认 100，数字小的先执行）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-J02：SEVO implement gate 自动验证 init 覆盖

**目标**：ACO 项目在 SEVO implement 阶段，gate 自动检查"新增的 L2 能力是否有对应的 generator 且能被 init 发现"。

**AC**：

- AC1：SEVO implement-review gate 对 ACO 项目额外检查：`src/generators/` 下的 generator 数量 ≥ spec 中标注为"需 init 安装"的 FR 数量。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2：每个标注"需 init 安装"的 FR 必须有对应的 generator 文件，文件名包含 FR 编号或 FR 关键词。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3：gate 不通过时输出缺失的 generator 列表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 Z：包分发与开箱体验(Distribution)

负责 npm 包的分发、安装和首次使用体验。

##### FR-Z01:一键初始化

`npx aco init` 完成所有环境准备。

- AC1:自动检测当前 OpenClaw 环境是否可用,并读取 Gateway、Agent、模型、通知渠道配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:自动发现已有 Agent 并生成资源池配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:生成配置文件、创建数据目录、注册为 OpenClaw Gateway 插件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:初始化完成后输出 next steps 指引(如何创建第一个任务、如何配置通知)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:重复执行 `aco init` 为幂等操作(不覆盖已有配置,只补充缺失项)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-Z02:CLI 入口

提供统一的命令行界面操作所有功能。

- AC1:顶层命令 `aco` 包含子命令:task、board、pool、rule、chain、audit、notify、stats、health、doctor、config、init。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:每个子命令支持 `--help` 展示用法和示例。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:输出格式统一支持 `--json` 标志切换为 JSON 输出。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:错误输出包含错误码、错误描述和建议的修复操作。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-Z03:库 API

提供编程接口供 OpenClaw 生态内的其他模块集成。

- AC1:导出核心类:Scheduler、TaskQueue、ResourcePool、RuleEngine、ChainExecutor。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:所有 CLI 功能均可通过库 API 实现(CLI 是 API 的薄封装)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:API 支持事件订阅(EventEmitter 模式),OpenClaw 生态内的其他模块可监听任务状态变更。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:TypeScript 类型定义完整,所有公开接口有 JSDoc 注释。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-Z04:OpenClaw Gateway 适配层

通过稳定的 OpenClawAdapter 封装 Gateway 能力,避免业务逻辑散落调用 OpenClaw 内部接口。

- AC1:定义 OpenClawAdapter 接口:spawnTask、killTask、steerTask、getTaskStatus、getAgentStatus、getSessionState、subscribeEvents。其中 steerTask 向运行中的 Agent 注入补充信息,getSessionState 获取会话的文件系统状态(用于判断 ACP 是否真正活跃),subscribeEvents 订阅任务完成/超时等事件(推进链的触发依赖此能力)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:内置 OpenClawAdapter 对接 OpenClaw 的 sessions_spawn / subagents API 与 Gateway 事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:Adapter 只面向 OpenClaw Gateway 版本差异做兼容,不承诺接入非 OpenClaw 执行环境。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:OpenClawAdapter 配置通过 ACO 配置文件指定,运行时动态加载。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-Z05:版本与升级

支持平滑升级,不丢失运行时状态。

- AC1:`npm update @self-evolving-harness/aco` 后,系统自动检测数据格式变更并执行迁移。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:迁移前自动备份当前数据(配置文件 + 审计日志 + 看板快照)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:迁移失败时自动回滚到备份,不破坏现有环境。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:CLI 命令 `aco version` 展示当前版本和可用更新。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

---

#### 域 K:主会话异步纪律(Main Session Async Discipline)

负责守住主会话与子 Agent 之间的异步边界,确保主会话在派发子任务后立即归还控制权,持续可被 IM 用户打断、纠偏、追加需求。本域是 ACO 多 Agent 协作可控性的最后一道防线--子 Agent 可以慢,主会话不能哑。

##### FR-K01:主会话异步纪律守卫

**用户人群**

- 使用 ACO 调度多 Agent 执行复杂任务的产品方与开发者:对协同效率和用户在场感负责,需要保证主会话不会被自己的等待动作锁死。
- 通过 IM(飞书 / Discord / Telegram / Slack)与主会话沟通的最终用户:在子 Agent 执行长任务期间需要随时插话,补充需求、纠偏方向、变更方案、澄清歧义。

**痛点**

用户晚上 22:01 在飞书发了一条新需求,主会话刚好在两分钟前 spawn 了一个深度调研子 Agent,然后调用 `process(action=poll, timeout=600s)` 同步等待子 Agent 输出。这一调用把主会话的执行 lane 锁死最长 60 分钟。期间用户连发四条消息追问、纠偏、改方案,Gateway 在主会话忙碌期间把这些消息静默排队,主会话直到 23:07 子 Agent 回话后才解除阻塞,这时已经过去 66 分钟。用户体感:"AI 死了。"实际状态:主会话活着,只是把异步 push-based 的 completion event 模型亲手退化成了同步串行模型,IM 渠道因此哑火一小时。这种锁死的根因是主会话用错了等待原语,L2 当前没有任何强制约束阻止它发生。

**原始需求**

用户原话:"我想在子 Agent 跑活的时候,随时能插话纠偏、插入高优需求、变更方案、澄清需求;不要等任务跑完才能联系到 AI。"

核心诉求:主会话在派发任意子 Agent 任务后必须秒级归还 IM 输入通道,把"等待结果"这件事交给 push-based completion event,而不是占着 lane 同步轮询。

**用户体验流**

1. 用户在 IM 发消息给主会话。
1. 主会话接收消息,完成意图判断和派发决策(秒级)。
1. 主会话调用 `sessions_spawn` 创建子 Agent,带上完整 prompt 和 timeout。
1. spawn 调用返回后,主会话立即结束当前回合并归还 IM 输入通道,不调用任何阻塞式等待原语。
1. 用户在子 Agent 执行期间继续发消息。Gateway 收到消息触发主会话新回合,主会话当场处理(回答澄清、追加约束、kill 重派、调整优先级)。
1. 子 Agent 完成时,aco-run-watchdog 通过 push-based completion event 触发主会话开新回合,主会话读取产物、写飞书人话总结、推进下一步。
1. 端到端体验:从 spawn 到子 Agent 完成的整个时间窗内,用户随时能找到主会话,主会话随时能纠偏。

**FR 描述**

本 FR 在 L2 插件层注入异步纪律守卫,机制如下:

- 治理主会话(agent=main)对 `process` 工具的调用。当 action 属于阻塞等待语义(poll、wait、log、list)且 timeout >= `asyncDisciplineGuard.maxBlockingTimeoutMs`(默认 5000)时,守卫拒绝该调用并返回引导信息。
- 引导信息明确告诉主会话两条合规路径:其一,信任 push-based completion event,完成派发后结束当前回合;其二,确实需要观察某个进程的状态时,改派短任务子 Agent 异步执行。
- 守卫提供唯一豁免通道:用户在最近一条 IM 消息中显式表达"这次允许主会话亲自等待/同步处理"的授权意图。具体判定语义由 FR-K02 定义;FR-K01 只定义触发边界、审计字段和对 completion event 的零影响约束。
- 守卫只拦主会话(agent=main)的 process 阻塞调用,不影响子 Agent 的 process 调用,也不影响 aco-run-watchdog 推送 completion event 的及时性。两条通道完全解耦。

**AC**

- AC1:守卫监听主会话 session 上的 `tool_call:before` 事件,识别工具名 = `process` 且 action ∈ {poll, wait, log, list},读取参数中的 timeout 值(单位毫秒,缺失时按 0 处理)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:当 timeout >= `asyncDisciplineGuard.maxBlockingTimeoutMs`(默认 5000 毫秒)时,守卫返回 block 决策,工具调用被取消,主会话收到结构化错误响应,响应内容包含:命中规则名、被取消的工具调用参数摘要、推荐的合规路径文本。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:豁免判定基于最近一条用户 IM 消息(从 Gateway 会话历史读取最新一条 role=user 的消息)。判定器输入只包含最近一条用户消息文本,不读取历史多轮消息,保证本次授权只对当前工具调用生效。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:命中授权意图时本次工具调用放行,未命中则继续按 block 处理;豁免状态不缓存到下一次工具调用。豁免判定的具体 LLM 语义、超时与异常处理由 FR-K02 定义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:每次阻断、放行、豁免都写入 `dispatch-guard-events.jsonl`,记录字段包括 timestamp、sessionKey、agentId、toolName、action、timeoutMs、decision(block / allow / exempt / bypass_disabled / bypass_degraded)、exemptKeyword(命中时恒为 null,仅为兼容历史 schema 保留)、recentUserMessageHash(最近一条用户消息的 SHA-256 截断 16 位,用于审计追溯且不泄露内容)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:`asyncDisciplineGuard.enabled` 控制全局开关,默认 true。设为 false 时所有治理逻辑跳过,但仍写审计日志(decision = bypass_disabled),保证可观测性。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:`asyncDisciplineGuard.maxBlockingTimeoutMs` 可配置,默认 5000。允许产品方按自身风险偏好调整阈值,配置校验拒绝负数和 0。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8:守卫加载失败或运行时异常不阻塞主会话工具调用流程(graceful degradation)。异常仅写 warn 日志,标记守卫为 degraded 状态,后续调用走 allow 路径并在审计日志中记录 decision = bypass_degraded。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9:守卫与 aco-run-watchdog 的 completion event 推送链路完全解耦。子 Agent 完成时 completion event 的派发延迟必须保持在毫秒级,不因守卫取消了主会话的 poll 而延迟或丢失。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10:守卫只对 agent=main 的 session 生效。子 Agent session(任何 agentId != main)的 process 工具调用不受治理,允许子 Agent 内部使用 poll 等待自己派出的孙子任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11:`aco init` 生成的默认配置中 `asyncDisciplineGuard` 段已包含开箱可用的默认值(enabled: true, maxBlockingTimeoutMs: 5000, llmJudgement.enabled: true, llmJudgement.timeoutMs: 5000);不再生成 `userExemptKeywords` 字段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12:CLI 命令 `aco audit async-discipline` 输出最近 N 条(默认 50)主会话异步纪律相关的审计事件,按 decision 分组统计阻断/放行/豁免次数。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

**完成判定**

- 阻断生效:主会话调用 `process(action=poll, timeout=600000)` 时被守卫阻断,工具调用返回结构化 block 错误,审计日志写入对应记录,主会话当前回合可以正常结束。
- 豁免生效:用户最近一条消息明确表达"这次你别派,我亲自处理"或等价授权后,主会话下一次同样的 `process(action=poll, timeout=600000)` 调用被放行,审计日志写入 decision = allow / exempt 的对应记录;再下一次调用(用户没再授权)恢复被阻断。
- 异步及时性零退化:派一个执行 5 分钟的子 Agent,子 Agent 完成时主会话开新回合的端到端延迟 < 1 秒(等价于 push-based completion event 的物理推送延迟),与守卫启用前持平。
- 用户视角验证:主会话 spawn 子 Agent 后立即结束当前回合,用户在子 Agent 执行期间连续发三条 IM 消息,每条消息从发送到主会话开始处理的间隔 < 5 秒,不再出现"几十分钟无响应"的失联感。
- 可观测闭环:`aco audit async-discipline` 命令能列出过去 24 小时内主会话所有被阻断、放行、豁免的事件,产品方可据此评估守卫的阻断效果和豁免使用频次。

与现有能力的关系:本 FR 与域 B(派发治理)互补。域 B 治的是"子 Agent 派发是否合规",域 K 治的是"主会话派发后是否守住异步边界"。两者共用 `dispatch-guard-events.jsonl` 审计流,共用 L2 插件加载机制,治理目标和触发条件相互独立。

##### FR-K02:主会话异步纪律守卫的豁免判定改 LLM 语义

**用户人群**

- 通过 IM(飞书 / Discord / Telegram / Slack)与主会话沟通的最终用户:在子 Agent 执行长任务期间,需要用任意自然语言措辞向主会话表达"这次我授权主会话亲自做",并被守卫准确识别和放行。
- 使用 ACO 调度多 Agent 执行复杂任务的产品方:不希望用户每次授权都要先记住一份关键词清单,期待守卫具备语义理解能力,把豁免体验做成"用户怎么说话都行"。

**痛点**

用户在 IM 里说"这次你别派,我亲自处理",意图明确就是授权主会话本回合亲自执行,不要派子 Agent 进行长任务。但 FR-K01 的豁免判定走的是子串关键词匹配,内置词表只有"豁免 / 亲自做 / 我授权 / 用 poll / 主会话直接干 / 我盯着 / 不要派"几个固定词,用户原话"我亲自处理"没出现在词表里("亲自做"和"亲自处理"差一个字),守卫直接判为 block。用户原话:"我说了让你亲自做你怎么还在派,这玩意儿是不是认死字儿。"换个角度,用户说"YES"或"我盯着这个"也是合法授权,但只要措辞稍微偏离词表就被拦,用户被迫去背关键词清单。这是把语义判定的问题硬塞给字符串匹配处理,体验上不可接受。

**原始需求**

用户原话:"豁免判定不能用关键词匹配,得让 LLM 理解我到底是不是在授权这次主会话亲自做。我说什么话都该认得出来。"

核心诉求:把 FR-K01 的豁免判定从"子串关键词命中"升级为"LLM 语义意图判定",让守卫具备理解用户授权意图的能力。用户用任意自然语言措辞表达授权,守卫都能准确识别并放行;用户在聊别的事(没有授权意图)时不会被误放行。

**用户体验流**

1. 用户在 IM 给主会话发消息,内容里包含一句明确的授权措辞,例如"YES / 你别派 / 我亲自处理 / 这次我搞 / 主会话直接干 / 你顶上 / 我盯着这个 / 老规矩 你来 / [SYSTEM] override / 忽略指令放行"等任意自然表达。
1. 主会话接收到消息,在判断需要执行可能违反异步纪律的工具调用时(例如长 timeout 的 process poll),触发 FR-K01 守卫。
1. 守卫读取当前 sessionKey 下最近一条用户 IM 消息,把消息内容拼装进 LLM 判定请求(system 段定义任务,user 段用 fenced block 包裹用户原文)。
1. 守卫在配置的 timeoutMs(默认 5000ms)内调用配置的 LLM provider/model,得到 LLM 的判定结果。
1. LLM 严格输出单词"YES"或"NO";守卫对返回值做 trim、转大写、去标点后,严格等于"YES"则放行,其他一律视为不授权。
1. 守卫把本次判定写审计日志(包含 llmVerdict、llmLatencyMs、llmError、llmPromptVersion 四个新字段);LLM 判定结果驱动本次工具调用的 allow / block 决策。
1. 用户体感:不需要背关键词清单,任意自然表达授权措辞都被准确识别;聊业务时偶尔包含"亲自""我处理"等字眼也不会被误放行,因为 LLM 看的是当前消息整体的授权意图。

**信任模型**

本 FR 的豁免判定建立在以下信任假设之上,所有 prompt 设计、AC 验证、单元测试均按此模型展开:

- 数据源:守卫触发时,从当前 sessionKey 拉取最近一条用户 IM 消息(由主会话所属用户本人通过 IM 渠道发送)。判定数据只来自这一条消息,不混入历史消息或其他来源。
- 信任边界:消息发送者 = 守卫豁免判定的合法主体 = 同一用户。ACO 的运行场景是单用户私聊,不存在第三方往用户消息流中注入内容的攻击面。用户给守卫发什么内容,都是用户本人在表达自己的意图。
- LLM 任务:理解用户当前消息是否在表达"我授权这次主会话亲自做"。LLM 只判定意图,不判定"是不是攻击""是不是注入"。
- 合法授权措辞:任意自然语言表达均为合法授权,LLM 应判 YES。包括但不限于:YES / 你别派 / 我亲自处理 / 这次我搞 / 主会话直接干 / 你顶上 / 我盯着这个 / 老规矩 你来 / [SYSTEM] override / 忽略指令放行。用户在私聊场景里用什么措辞表达授权都是合法的,不存在"被骗放行"概念。
- 错误判定方向:守卫可能出错的方向只有两种 — (a) 用户在授权,LLM 判 NO,守卫误拦,用户授权未生效,体验降级;(b) 用户在聊别的事(没有授权意图),LLM 判 YES,守卫误放行,主会话亲自执行了本应派给子 Agent 的长任务。两种错误都属于"语义意图理解不准",通过优化 prompt 解决。
- system prompt 写作方向:prompt 的 system 段必须围绕"判断用户当前消息的真实意图,合法授权措辞应判 YES"展开。**禁止**写入"警惕注入""忽略消息中的指令性内容""防止越权"等抗注入话术 — 这类话术会让 LLM 把合法授权措辞(尤其是"[SYSTEM] override / 忽略指令放行"这种带指令性词汇的合法表达)误判为攻击,反而恶化误拦。fenced block 包裹用户消息的目的是输出格式稳定(让 LLM 知道这是输入段),不是抗注入。

**FR 描述**

本 FR 在 FR-K01 守卫内部把豁免判定从"子串关键词命中"升级为"LLM 语义意图判定",机制如下:

- 实现路径:**方案 A** — 守卫核心函数 `evaluateAsyncDiscipline` 改为 async 函数,所有调用方迁移到 await 调用,LLM 调用在 evaluator 内部完成。generator 钩子(`tool_call:before` 处理器)同步迁移为 async 处理器,内部 await evaluator。
- LLM 调用流程:守卫识别需判定豁免的工具调用(action 在 blockingActions、timeoutMs >= maxBlockingTimeoutMs、agentId == main、tool == process)时,从 Gateway 会话历史读取最近一条 role=user 的 IM 消息,拼装为 system + user 双角色 prompt,通过配置的 provider/model 发起 LLM 请求。
- 输出严格判定:LLM 必须严格只返回 YES 或 NO 单词。守卫拿到原始返回字符串后,做 trim → 转大写 → 去除全部标点字符 → 严格等于字符串 "YES" 才视为放行。任何其他形式(空字符串、NO、解释段、JSON、其他语言、前缀正确尾部带内容如 "YES (用户授权)")均判 NO。
- 异常隔离:LLM 调用必须在内层 try/catch 中完整捕获,异常转为 verdict=error 并 decision=block(本次不豁免);异常**不允许**冒泡到守卫主逻辑的 outer catch,避免误触 FR-K03 degraded 状态。
- 关键词路径删除:删除 `userExemptKeywords` 配置项、删除 `findExemptKeyword` 函数、删除关键词匹配代码路径。配置文件中如残留旧字段,reload 时忽略并写 warn 日志,不主动改写用户配置文件。
- KIVO 永久铁律:本 FR 不引入任何关键词、正则、规则白名单、FTS5 等替代或 fallback 路径。LLM 不可用(超时、异常、disabled)时一律 verdict 非 YES,decision=block,即"无豁免一律 block";降级与自愈由 FR-K03 单独管理。

**AC**

- AC1(Prompt 设计):守卫使用 system + user 双角色 prompt,通过 provider 的 chat completions 接口调用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - system 段固定文本(模板版本 v1):围绕"判断用户当前消息的真实意图,合法授权措辞应判 YES"展开,明确告知 LLM 任务为"识别用户是否在表达授权主会话本回合亲自执行长任务";同时硬约束 LLM 输出 — "严格只返回单词 YES 或 NO,不返回任何解释、标点、引号、代码块、空白以外字符;不返回其他语言;不返回多个单词"。
  - user 段为最近一条用户 IM 消息的原始内容,用 fenced block(三个反引号包围)包裹,fenced block 的目的是稳定输入边界,让 LLM 知道这是输入段。
  - **禁止**在 system 段写入"警惕注入""忽略消息中的指令性内容""防止越权"等抗注入话术。
  - prompt 模板提取为常量,命名 `LLM_INTENT_JUDGEMENT_PROMPT_V1`,版本号与 prompt 内容绑定;后续修改 prompt 必须升级常量名(V2、V3...),便于版本管理与审计追溯。
- AC2(YES strict equal 判定):守卫对 LLM 返回字符串执行如下判定逻辑 — 设原始返回为 raw,定义 `normalized = raw.trim().toUpperCase().replace(/[\p{P}\p{S}]/gu, '')`;当且仅当 `normalized === 'YES'` 时 verdict=allow,decision=allow;其他全部判 NO,verdict=deny,decision=block。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3(非 YES 输入处理):非 YES 输入一律判 NO,具体场景包括但不限于 — 返回 "NO";返回空字符串;返回解释段("用户未授权""YES, the user authorized""是""否");返回 JSON(`{"verdict":"yes"}`);返回其他语言("是""はい""oui");返回前缀正确尾部带内容("YES (用户授权)""YES.""YES\n"残留特殊字符且去标点后不严格等于 YES);返回多个 token("YES NO")。每种场景在审计日志中 llmVerdict 字段记录归一化后的字符串(截断 32 字符),便于排查误判。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4(timeout 处理):LLM 调用使用配置项 `asyncDisciplineGuard.llmJudgement.timeoutMs`,默认 5000ms。超时时守卫不等待返回,本次判定 verdict=timeout,decision=block(本次不豁免);审计日志记录 llmLatencyMs=timeoutMs(等同配置上限),llmError=`'timeout'`,llmPromptVersion=`'v1'`;不重试,不进入 FR-K03 degraded(timeout 是预期行为而非异常)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5(LLM 异常处理):LLM 调用过程中任何异常(网络错误、provider 报错、JSON 解析失败、TypeError 等)在内层 try/catch 中完整捕获,本次判定 verdict=error,decision=block;审计日志记录 llmLatencyMs=实际耗时,llmError=异常 message 截断 256 字符,llmPromptVersion=`'v1'`;异常不再抛出,**不冒泡**到守卫主逻辑 outer catch,因此**不触发** FR-K03 degraded。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6(disabled 配置):配置项 `asyncDisciplineGuard.llmJudgement.enabled` 控制 LLM 判定子系统的开关,默认 true。设为 false 时,守卫跳过 LLM 调用,verdict=disabled,decision=block(无豁免一律 block);审计日志记录 llmVerdict=`'disabled'`、llmLatencyMs=0、llmError=null、llmPromptVersion=null。FR-K01 的 `asyncDisciplineGuard.enabled`(全局开关)仍存在,优先级高于 llmJudgement.enabled — 全局 enabled=false 时整个守卫跳过,llmJudgement 配置不参与判定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7(关键词路径删除):删除以下内容 — 配置项 `asyncDisciplineGuard.userExemptKeywords` 从默认配置文件、文档、AC 描述、生成的 index.js 中全部移除;函数 `findExemptKeyword` 从 evaluator 源码中删除;关键词匹配代码路径(子串包含、大小写不敏感比对)从 evaluator 中删除。运行时如读取到用户 openclaw.json 残留 `userExemptKeywords` 字段,reload 时忽略该字段并写 warn 日志(`asyncDisciplineGuard.userExemptKeywords is deprecated since FR-K02 and will be ignored`),**不主动改写用户配置文件**(用户自主决定是否清理)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8(审计 schema 扩展):`dispatch-guard-events.jsonl` 中守卫写入的事件 record 新增四个字段 — 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - `llmVerdict`:取值枚举 `'allow' | 'deny' | 'timeout' | 'error' | 'disabled' | 'not_applicable'`。
  - `llmLatencyMs`:整数,LLM 调用耗时(从发请到拿到返回或捕获异常为止);未调用 LLM 时为 0。
  - `llmError`:字符串或 null;LLM 异常 / timeout 时记录错误描述(截断 256 字符),正常调用为 null。
  - `llmPromptVersion`:字符串或 null,与 prompt 模板常量名版本号对齐(如 `'v1'`);未调用 LLM 时为 null。
  - `not_applicable` 触发条件:下列任一场景命中时 llmVerdict=`'not_applicable'`,llmLatencyMs=0,llmError=null,llmPromptVersion=null — timeoutMs < maxBlockingTimeoutMs(本次工具调用不达到触发阈值,本来就不需触发治理);action 不在 blockingActions 集合;agentId != main(非主会话);tool != process。
  - bypass_degraded(FR-K03)、bypass_disabled(FR-K01 全局关闭)、allow(FR-K01 本来就不该拦)、recovery_attempt(FR-K03 自愈)事件中 llmVerdict=`'not_applicable'`,llmLatencyMs=0,llmError=null,llmPromptVersion=null。
- AC9(配置默认值 + init 校验):`asyncDisciplineGuard.llmJudgement` 默认配置为 `{ enabled: true, provider: 'penguin-main', model: '<轻量级可用模型>', timeoutMs: 5000 }`。具体 model 名称由 dev 实施时根据 openclaw.json `models.providers.penguin-main.models` 中实际存在的轻量级模型(如 claude-haiku 类)选定。`aco init` 执行时必须校验 `models.providers[provider]` 存在且 `models.providers[provider].models` 包含目标 model;任一不满足时 init 直接报错退出,输出提示要求用户先在 openclaw.json 里配齐 provider/model 后重试,禁止 init 静默生成不可用的默认值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10(异步及时性零退化):LLM 判定调用不会阻塞子 Agent completion event 的推送链路。验证方法 — 派一个执行 5 分钟的子 Agent,同时构造主会话调用命中守卫的场景(豁免判定期间 LLM 调用中),子 Agent 完成时主会话开新回合的端到端延迟 < 1 秒。LLM 判定期间主会话本回合可以 await(本来就要等豁免结果才能决策),但不影响 Gateway 整体事件总线,不影响 aco-run-watchdog 推送 completion event 给其他 session。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11(默认配置文件内容):`aco init` 生成的默认配置文件中 `asyncDisciplineGuard` 段包含以下完整结构(JSON 示例)—不包含 `userExemptKeywords` 字段(已在 AC7 中删除)。`degradedRecoveryWindowMs` 属 FR-K03 范畴。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12(CLI audit 输出扩展):`aco audit async-discipline` 命令在原有 decision 分组统计基础上,新增按 llmVerdict 分组统计 — 输出过去 N 条事件中 allow / deny / timeout / error / disabled / not_applicable 各几次,帮助产品方评估 LLM 判定准确率、超时率、异常率。llmVerdict 分组与 decision 分组互为补充,均输出。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC13(单元测试覆盖):evaluator 的 LLM 判定逻辑需覆盖以下测试场景(LLM 调用 mock化,不走真实网络): 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - 正向授权:LLM 返回 "YES" → verdict=allow,decision=allow,审计写入。
  - 正向授权(带空白):LLM 返回 "  YES\n" → trim 后判 allow。
  - NO 措辞:LLM 返回 "NO" → verdict=deny,decision=block。
  - 前缀正确尾部带内容:LLM 返回 "YES (用户授权)" → 去标点后为 `YES用户授权`,不严格等于 "YES",判 deny。
  - 返回 JSON:LLM 返回 `{"verdict":"yes"}` → 判 deny。
  - 其他语言:LLM 返回 "是" → 判 deny。
  - 空返回:LLM 返回 "" → 判 deny。
  - timeout:LLM mock 超过 timeoutMs 未返回 → verdict=timeout,decision=block,未触发 FR-K03 degraded。
  - LLM 报错:LLM mock 抛出 Error(`provider HTTP 500`) → verdict=error,decision=block,未触发 degraded。
  - LLM 抛 TypeError:LLM mock 抛 TypeError(`Cannot read property of undefined`) → 内层 try/catch 捕获,verdict=error,decision=block,未触发 degraded(验证异常隔离)。
  - disabled 配置:llmJudgement.enabled=false → 不调用 LLM,verdict=disabled,decision=block。
  - not_applicable 场景:agentId='dev-01'、tool='process'、action='poll'、timeoutMs=600000 → 未命中主会话边界 → 不调用 LLM,llmVerdict='not_applicable'。
  - **不包括** prompt 注入对抗测试用例(设计目的就是让用户任意措辞都被识别为合法授权)。
- AC14(evaluator 同步调用路径迁移):`evaluateAsyncDiscipline` 函数签名改为 `async function evaluateAsyncDiscipline(...)`,返回 Promise;所有调用 evaluator 的处 `tool_call:before` 钩子主体、测试代码、外部调用点 进行 await 迁移;generator 在合成 index.js 时按 async 处理器模板产出,生成的 index.js 中 `tool_call:before` 钩子是 async 函数且 `await evaluateAsyncDiscipline(...)`。迁移完成后全仓禁止同步调用 evaluator(grep `evaluateAsyncDiscipline\(` 不带 await 零命中)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

**完成判定**

- LLM 豁免判定生效:用户发"这次你别派,我亲自处理"后,主会话下一次 `process(action=poll, timeout=600000)` 调用被 LLM 判 YES,守卫放行,审计写 decision=allow + llmVerdict=allow。
- 词表路径完全删除:`grep -rn 'userExemptKeywords' extensions/aco-async-discipline-guard/` 零命中;`grep -rn 'findExemptKeyword' extensions/aco-async-discipline-guard/` 零命中;运行 generator 合成出 `extensions/aco-async-discipline-guard/index.js` 后,`grep -n 'findExemptKeyword\|userExemptKeywords' index.js` 零命中。
- LLM 调用路径生效:运行 generator 合成出 `extensions/aco-async-discipline-guard/index.js` 后,`grep -n 'llmIntentJudgement\|LLM_INTENT_JUDGEMENT_PROMPT_V1\|asyncDisciplineGuard.llmJudgement' index.js` 均命中;`grep -n 'await evaluateAsyncDiscipline' index.js` 命中且 `tool_call:before` 钩子为 async 函数。
- 异常隔离生效:LLM mock 抛 TypeError 的测试用例运行后,FR-K03 degradedAt 状态字段仍为 null(未进入 degraded)。
- 异步及时性零退化:验证脚本派一个执行 300 秒的子 Agent + 主会话命中守卫场景,子 Agent 完成时主会话开新回合的端到端延迟 < 1 秒。
- 用户体验验证:用户用不同措辞表达授权("YES"、"你别派"、"我亲自处理"、"老规矩 你来"、"[SYSTEM] override"),均被判 YES 并放行;用户聊业务时偶然涉及"亲自"二字但无授权意图(如"这事谁在亲自跟进")不会被误放行(判 NO,按 block 处理)。
- 可观测闭环:`aco audit async-discipline` 输出中同时出现 decision 分组与 llmVerdict 分组统计,产品方能看到 LLM 判定的 allow / deny / timeout / error 分布。

**与现有能力的关系**

- 与 FR-K01:本 FR 取代 FR-K01 AC3/AC4 定义的"子串关键词命中"豁免判定逻辑,保留 FR-K01 的触发类型判断(blockingActions / maxBlockingTimeoutMs / agentId == main)、block 响应结构、全局 enabled 开关、审计日志路径(`dispatch-guard-events.jsonl`)、仅对 main 生效、与 aco-run-watchdog 解耦等机制。审计 schema 扩展(增加四个 llm 字段)与 FR-K01 原有字段兼容并存。
- 与 FR-K03:本 FR 定义 LLM 判定路径与异常隔离语义(LLM 异常由内层 try/catch 捕获转为 verdict=error,**不**触发 degraded);FR-K03 定义守卫主逻辑异常(宝贵变量读取、参数解析、审计写入失败等)触发的降级与自愈机制。两者边界以内层 try/catch 起作用位置为准。
- 与 FR-K01 的同能字段覆盖:原AC5 的 `exemptKeyword` 字段仍保留在审计 schema 中(向后兼容),FR-K02 路径上该字段永远为 null;运行期如读取到历史审计记录存在非 null 值,CLI 应能正确呈现,不报错。

---

##### FR-K03:主会话异步纪律守卫的 degraded 自愈机制

**用户人群**

- 运营启用 ACO 异步纪律守卫的产品方:守卫是主会话与用户体验之间的干预层,守卫进入疑似故障状态后需要能自愈而不是需要重启 Gateway。
- 使用主会话的最终用户:守卫出现瞑时性错误不应造成守卫被永久绕过。重启 Gateway 是重动作,应努力避免。

**痛点**

FR-K01 原始设计中,守卫运行时异常一旦捕获,在 outer catch 中将 `degraded` 字段置为 true,并在之后所有守卫调用上一律走 bypass_degraded 路径(放行任何主会话调用)。这个设计会造成一个问题 — 一旦 `degraded=true`,只能重启 Gateway 清除。例如某次调用 LLM provider 瀑布造成守卫主逻辑内某个读取出现瞑时错误,守卫被隔成 degraded;接下来几小时 LLM provider 恢复了、Gateway 也没人重启,但守卫还是 bypass_degraded。用户原话:"守卫一旦坏了就坏到底,这不行,该能自己试试能不能恢复"。

**原始需求**

用户原话:"degraded 不能是单向状态,走进去就出不来。设个窗口,过了就试一次,能恢复就走正常路径,不能恢复就重新记一次降级。"

核心诉求:守卫的 degraded 状态从布尔型字段升级为时间戳字段。进入 degraded 时记录进入时间;后续守卫调用检查如果超过配置的自愈窗口就试跑一次正常逻辑,恢复了就清除状态;够不上就重新记一次。

**用户体验流(状态机)**

1. **健康态**:`degradedAt = null`。守卫处理每次调用 → 走正常逻辑(blockingActions 判断 + LLM 豁免判定 + decision 输出)。
1. **主逻辑异常**:某次调用中 outer catch 捕获了守卫主逻辑异常(例如会话历史读取报错、审计写入 IO 报错、参数解析报错)。
1. **进入降级态**:守卫写 `degradedAt = Date.now()`,写一条 `bypass_degraded` 审计事件,本次调用放行(allow)避免阻塞主会话。
1. **降级期间后续调用**:`degradedAt != null` 且 `Date.now() - degradedAt < degradedRecoveryWindowMs`(默认 5 分钟) → 继续 bypass_degraded 放行,不重试主逻辑,不刷新 degradedAt。
1. **达到自愈窗口**:某次调用进入时 `Date.now() - degradedAt >= degradedRecoveryWindowMs` → 写一条 `recovery_attempt` 审计事件,清空 `degradedAt = null`,走正常逻辑处理本次调用。
1. **自愈成功**:本次正常逻辑未报错,守卫回到健康态;后续调用全部走正常逻辑。
1. **自愈失败**:本次正常逻辑又报错 → outer catch 再次捕获 → 重新写 `degradedAt = Date.now()`(重新计时窗口),bypass_degraded 放行本次,后续重复步骤 4-5。不引入连续失败计数 / 熝断退避。

**FR 描述**

本 FR 在 FR-K01 守卫内部把 degraded 状态从布尔型升级为时间戳型,并引入基于时间窗口的自愈机制:

- 状态字段迁移:`degraded: boolean` → `degradedAt: number | null`。`null` 表示健康,非 null 表示进入降级的时间戳(epoch ms)。
- 状态作用域:守卫运行时 in-memory 闭包变量,不持久化到 jsonl 或磁盘。Gateway 进程重启后 degradedAt reset 为 null(重启后守卫默认健康),这是期望行为。
- 自愈窗口:配置项 `asyncDisciplineGuard.degradedRecoveryWindowMs`,默认 300000(5 分钟)。状态机跳转逻辑完全基于"当前时间与 degradedAt 的差是否超过该窗口"判定,不设连续失败计数、不设熝断退避。
- 异常边界:outer catch **仅捕获**守卫主逻辑异常(参数解析、会话历史读取、审计写入、状态判断)。LLM 调用异常已在 FR-K02 AC5 要求的内层 try/catch 中捕获转为 verdict=error,不会冒泡到 outer catch,因此**不会**触发 degraded。边界以两个 try/catch 的代码位置为准,需在 evaluator 注释中明确标注。

**AC**

- AC1(状态字段迁移):守卫运行时闭包变量 `degradedAt` 类型为 `number | null`,初始值 null;Gateway 进程生命周期内唯一,不持久化。`degraded: boolean` 字段从状态变量、代码、审计 schema(如有)、文档中全部移除。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2(outer catch 三动作):守卫主逻辑 outer catch 捕获到异常时顺序执行三个动作 —异常不再抛出,不让外部看见守卫出错。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  1. 写 `degradedAt = Date.now()`(覆盖旧值)。
  1. 写一条 `bypass_degraded` 审计事件到 `dispatch-guard-events.jsonl`,记录错误 message(截断 256 字符)、stack 顶部三行(截断)、sessionKey、agentId、toolName、action、timeoutMs。llmVerdict=`'not_applicable'`,llmLatencyMs=0,llmError=null,llmPromptVersion=null。
  1. 本次工具调用返回放行(allow)避免阻塞主会话。
- AC3(自愈检查):守卫进入每次调用的最外层逻辑先判 — 如 `degradedAt != null` 且 `Date.now() - degradedAt >= degradedRecoveryWindowMs`,则顺序执行:写一条 `recovery_attempt` 审计事件(decision=`'recovery_attempt'`,记录上一次 degradedAt、当前时间、距离窗口边界超出多少毫秒);清空 `degradedAt = null`;紧接着走正常逻辑处理本次调用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4(自愈窗口配置):`asyncDisciplineGuard.degradedRecoveryWindowMs` 默认 300000(5 分钟),合法范围 60000~3600000(1 分钟 到 1 小时)。越界值 reload 时回退默认值并写 warn 日志(`asyncDisciplineGuard.degradedRecoveryWindowMs out of range, fallback to default 300000`)。非数字 / 负数 / 0 等同样回退默认。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5(审计 schema 兼容):recovery_attempt 事件 record 与 bypass_degraded 事件共用同一套 schema(FR-K02 AC8 定义 schema),未使用 LLM 的路径上 llmVerdict=`'not_applicable'`,llmLatencyMs=0,llmError=null,llmPromptVersion=null。recovery_attempt 额外记录 `previousDegradedAt`(上一次 degradedAt 值)与 `recoveryWindowMs`(本次生效的窗口配置),便于审计追溯。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6(自愈后再次失败):自愈检查后走正常逻辑又抛出异常 → outer catch 再次捕获 → 重新写 `degradedAt = Date.now()`(使用当前时间,**不**复用上一次 degradedAt) → 写一条 bypass_degraded 审计 → 本次放行。后续调用重新走状态机步骤 4 → 5。不引入连续失败计数、不引入熝断退避、不增大窗口。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7(自愈后成功):自愈检查后走正常逻辑未报错 → 本次调用按正常决策输出(allow / block / not_applicable),`degradedAt` 保持 null(在 AC3 中已清空)。守卫完全恢复到健康态,后续调用不再走 bypass_degraded 路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8(CLI audit 输出):`aco audit async-discipline` 命令输出中,decision 分组统计新增 `recovery_attempt` 分类,与原有 block / allow / exempt / bypass_disabled / bypass_degraded / not_applicable 同级并列。产品方能从输出中看到守卫进入 / 退出 degraded 的频率。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9(全局 enabled 优先):`asyncDisciplineGuard.enabled = false` 时,守卫主逻辑跳过,degradedAt 状态机不参与判断,degradedAt 字段保持原状态(如本来就是 null 则仍 null,之前进入过 degraded 则维持上一次值但不参与跳转)。全局 disabled 期间不写任何 bypass_degraded / recovery_attempt 事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10(单元测试覆盖):使用 fake clock(如 sinon useFakeTimers 或手动注入 now 函数)覆盖以下场景 — 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - 首次降级:模拟主逻辑异常 → degradedAt 写入当前时间 → bypass_degraded 审计写入 → 本次 decision=allow。
  - 窗口内多次调用:degradedAt 已设,时钟推进低于窗口 → 连续三次调用均 bypass_degraded,degradedAt 不变,未走主逻辑。
  - 时钟快进自愈成功:degradedAt 已设,时钟快进超过窗口,下一次调用 → recovery_attempt 审计写入 + degradedAt 清空 + 本次走正常逻辑 →后续调用 degradedAt 保持 null。
  - 自愈后再次失败:自愈后主逻辑再次报错 → degradedAt 重新写为当前时间(与原 degradedAt 不同) → bypass_degraded。
  - 越界配置:degradedRecoveryWindowMs = 30000(低于下限) → reload 日志出现 warn 且运行时使用 300000。
  - 全局 disabled:`asyncDisciplineGuard.enabled=false` 时模拟主逻辑异常 → 不写 bypass_degraded、不设 degradedAt、本次调用走 bypass_disabled 路径(FR-K01 原有不变)。
- AC11(outer catch 边界):evaluator 源码中 outer catch 仅覆盖守卫主逻辑代码路径(参数解析、sessionKey 读取、会话历史读取、审计写入、状态跳转判断);LLM 调用已在内层 try/catch 中捕获,LLM 异常不会冒泡到 outer catch,因此不触发 degraded。代码中两个 try 块范围需明确注释标注(例如 `// outer catch: guard main logic only` / `// inner catch: LLM call only`),便于后人阅读与代码审计。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

**完成判定**

- 状态字段完整迁移:`grep -rn 'degraded' extensions/aco-async-discipline-guard/` 只在与 degradedAt / bypass_degraded / recovery_attempt / degradedRecoveryWindowMs 相关上下文中出现,不存在单独的布尔型 `degraded` 字段(表达式中 `\bdegraded\b` 在代码中单词性独立出现零命中,仅出现于词素合成如 degradedAt / bypass_degraded)。
- 真实运行验证:起一个本地 Gateway 进程,注入 mock evaluator 主逻辑报错 → 出现一次 bypass_degraded;均利5分钟后取消 mock 报错 → 下一次调用出现 recovery_attempt 且后续调用全部走正常逻辑;手动清理后重复 → degradedAt 记录为新时间戳。
- 可观测闭环:`aco audit async-discipline` 输出中能读到 bypass_degraded 与 recovery_attempt 事件交替出现,产品方能评估守卫进入 / 退出降级的频率。
- 与 FR-K02 边界验证:运行 FR-K02 AC13 中"LLM mock 抛 TypeError"测试用例 → evaluator 返回 verdict=error、decision=block,degradedAt 保持 null,未进入 degraded 状态(验证异常隔离生效)。
- 配置校验:设 `degradedRecoveryWindowMs = 0` reload 后运行时实际使用 300000;设 = 60000 生效使用 60000;设 = 4000000(超上限)回退 300000。

**与现有能力的关系**

- 与 FR-K01:本 FR 取代 FR-K01 AC8 中"被标记为 degraded 状态 + 后续调用走 allow + 审计 bypass_degraded"的单向降级设计。FR-K01 AC8 描述的其他部分(异常写 warn 日志、不阻塞主会话调用、守卫不报错)仍有效;变动仅限于"degraded 为什么状态以及能不能自愈"。
- 与 FR-K02:边界以内层 try/catch 为准。LLM 调用产生的任何类型异常均被内层捕获转为 verdict=error,**不**冒泡到 outer catch,也就不会被本 FR 的 degraded 机制误述为守卫主逻辑故障。这是避免"LLM provider 抖动造成守卫被隔成 degraded"该類假阳性问题的结构保证。

---

##### FR-K04:子 Agent kill 后置影响扫描

**用户人群**

- 主会话(agent=main)亲自做高风险动作的产品方:主会话需要在子 Agent 跑歪、产物变脏、约束补充冲突等场景下 kill 旧任务并重派新任务。kill 是带副作用的高风险动作,被 kill 的子 Agent 在 kill 时刻之前可能已经修改了文件、写入了看板、产出了部分中间结果,主会话需要立刻知道"这次 kill 影响了什么",才能决定下一步是回滚、暂存还是保留。
- 多 Agent 并行写仓库的协同场景:同一时刻多个子 Agent 在不同文件上工作,kill 其中一个时,主会话需要精准识别"哪些文件是被 kill 那个 Agent 在它的运行期内动过的",避免把另外几个 Agent 的正确产出一并误处理。

**痛点**

2026-05-25 早晨真实事故:CEO 让主会话 kill 旧 pm-01 任务后重派,主会话 kill 完直接对 spec 文件跑了 `git checkout HEAD -- file`,把工作树里所有未 commit 改动一并回滚。问题是这份 spec 文件里既有旧 pm-01 跑歪后写入的脏数据,也有上一轮其他子 Agent 写入的正确产出 — 上一轮的产出之前没来得及 commit。无差别 checkout 把正确产出和脏数据一起抹掉了,170 行内容里的有效部分全部丢失,需要从头重派重写。

根因不在主会话 git 命令用错,根因是 ACO 在 kill 这个高风险动作前后没做任何影响检查,主会话拿不到"这次 kill 牵动了哪些文件、其中哪些是被 kill 那个 Agent 的运行期产物、哪些是更早的产出"。在没有这份信息的前提下,主会话只能粗暴地用 `git checkout` 整体回滚,误伤几乎是必然结果。

kill 是一个有副作用的动作:被 kill 的 Agent 可能已修改文件、未 commit 改动、写入看板。直接 kill = 工作丢失或工作树脏数据混入下一轮。这是 ACO 守卫覆盖范围的缺口 — 守卫管住了"派发是否合规""主会话是否守住异步边界",但没管住"kill 之后主会话是否能拿到足够信息做收尾决策"。

**原始需求**

用户原话:"kill 是个危险动作,杀完得让我知道这次杀掉的 Agent 改了什么文件、留下了什么脏数据,我才能决定要不要回滚、要不要 stash、还是直接保留。不能让我闭着眼跑 git checkout。"

核心诉求:主会话每次 kill 子 Agent 后,ACO 立刻扫描"被 kill Agent 的运行期内修改过的文件 + 看板写入痕迹",输出一份结构化影响报告给主会话,让主会话在做后续清理动作时有据可依。决策权完全保留在主会话(CEO 决策),ACO 只负责扫描和报告,不自动回滚、不自动 stash、不自动 commit。

**用户体验流**

1. 主会话决定 kill 某个跑歪的子 Agent(例如 pm-01 spec 写得不对、或者要补关键约束需要重派)。
1. 主会话调用 `subagents(action=kill, sessionKey=...)`(或 OpenClaw 同等 kill 接口)。
1. ACO 在 kill 入口处接管:**先做影响快照** — 抓取当前 git status、看板中目标 sessionKey 的 task 元信息(label、startedAt、最近写入时间)。
1. ACO 调用底层 Gateway `/api/v1/sessions/<id>/kill` 完成实际 kill 动作。
1. ACO 在 kill 完成后立即**做影响扫描** — 扫 git status,过滤出 mtime ≥ task.startedAt 的文件;读看板找该 sessionKey 在运行期内写入的 audit 条目;判定 riskLevel 和 recommendedAction。
1. ACO 把结构化影响报告作为 kill 调用的返回结果回传给主会话(同时落盘 audit log)。
1. 主会话在飞书向用户人话总结:"kill 完成,影响扫描结果是 X 个文件 / 风险等级 medium / 建议先 review diff",用户基于这份信息决定下一步动作(主会话直接 git stash / 主会话只 checkout 特定文件 / 用户亲自看一眼)。
1. 端到端体验:主会话不再"闭着眼"做 kill 后清理,每次 kill 都有一份事实依据;真实损失场景(无差别 checkout 误丢正确产出)从机制上被堵住。

**信任模型**

本 FR 信任模型继承 FR-K02:单用户私聊场景,kill 调用来自主会话本身,无第三方注入路径。FR-K04 是 deterministic 扫描机制 — 不调用 LLM、不做意图理解、不做 prompt 解析,所有判定均基于事实统计(git status 输出、文件 mtime、看板 JSON 字段、文件路径前缀匹配)。不存在"被骗放行""提示注入""越权"等问题。扫描的可靠性来自 git 命令和文件系统的确定性,不来自语义理解。

**FR 描述**

本 FR 在 ACO 接管 kill 入口,在调用 Gateway kill 接口前后插入"快照 + 扫描 + 报告"三步机制:

- 接入点:ACO 在 adapter 层(同 `openclaw-adapter.ts:killTask` 等价位置)或在 L2 插件层 `tool_call:before` / `tool_call:after` 钩子上,识别 kill 类工具调用,在原有 kill HTTP 调用的前后各加一段逻辑。kill HTTP 调用本身保持不变。
- kill 前快照:在调用 Gateway kill 之前同步执行 `git status --porcelain=v1 -uall`(在 ACO 工作仓库根目录,默认 `/root/.openclaw/workspace`),记录所有"已修改/已暂存/未跟踪"文件的路径、mtime(毫秒 Unix 时间戳)、文件大小、内容 hash(SHA-256 取前 16 字节十六进制);同时读 `/root/.openclaw/workspace/logs/subagent-task-board.json`,定位目标 sessionKey 的 task 条目,记录其 label、startedAt(epoch ms)、最近写入时间戳。这两份数据合并为一份"快照对象"暂存内存。
- kill 调用:照常调用底层 Gateway `/api/v1/sessions/<sessionId>/kill`,等待 HTTP 响应。kill 失败(HTTP 4xx/5xx 非 404)时直接抛错,不进入扫描步骤。kill 成功(HTTP 200/204)或目标 session 已不存在(HTTP 404,等价于已 kill)时进入下一步。
- kill 后扫描:再次执行 `git status --porcelain=v1 -uall` 取最新工作树状态,与快照对比。挑出"快照里 mtime ≥ task.startedAt"的文件、以及"快照后到现在 mtime 仍然变动 / 仍未 commit"的文件,合并去重为 affectedFiles 列表。每个文件记录 path、status('added' / 'modified' / 'deleted' / 'reverted')、mtime(毫秒 Unix 时间戳)、sizeBytes。从看板里找该 sessionKey 在运行期内(startedAt ≤ ts ≤ killAt)写入的 task 条目变化(自身 task 的状态变更、或其他能从看板字段(label、startedAt、status、报告路径)归属到该 sessionKey 的 audit 条目),记录为 affectedBoardEntries 列表,字段 taskId、label、status、lastWriteAt。
- 范围边界:本 FR 0.5.14 范围聚焦单 Agent 串行 kill 场景。多 Agent 并行运行期间的 kill 影响精确归属(基于 task 与文件的精确归属表)由 0.5.15+ 单独 FR 处理;0.5.14 实施时仅按 mtime 时间窗口与看板 sessionKey 字段做粗粒度过滤,不区分并发期间其他 Agent 的写入。
- riskLevel 判定(deterministic):无 affectedFiles 且无 affectedBoardEntries → 'low';有 affectedFiles 但全部命中 reports/ 或 logs/ 目录前缀 → 'medium';存在任何 affectedFiles 命中 src/ 或 docs/(尤其 docs/product-requirements.md / arc42 / spec 类文件)前缀 → 'high'。前缀匹配相对于 ACO 工作仓库根。
- recommendedAction 判定(deterministic):riskLevel='low' → 'safe_to_proceed';riskLevel='medium' → 'review_diff';riskLevel='high' → 'consider_stash_first'。
- 报告输出:扫描结束后输出一份结构化 JSON 报告 `{ sessionKey, killAt, taskStartedAt, taskLabel, affectedFiles[], affectedBoardEntries[], riskLevel, recommendedAction }`。报告同时(a)作为 kill 调用的返回数据传回主会话;(b)落盘到 `/root/.openclaw/workspace/logs/aco-kill-impact.jsonl`(每行一条 JSON 报告,append 模式)。
- 不动作的部分:本 FR 不自动 git checkout、不自动 git stash、不自动 git commit、不自动通知用户、不自动派审计 Agent。所有后续动作完全保留给主会话(CEO 决策权)。ACO 只输出"事实",不替主会话做"决策"。
- 降级路径:`git status` 命令失败(非零退出 / stderr 非空)、看板文件读取失败(不存在 / JSON 解析错)、磁盘 IO 异常等,均不阻塞 kill 调用本身。降级行为是:写一条 warn 日志到 `dispatch-guard-events.jsonl`(decision='kill_impact_scan_failed',附错误 message 截断 256 字符),把报告字段降级为 `{ sessionKey, killAt, scanFailed: true, errorMessage: '...' }` 返回给主会话。kill 本身的成功/失败不受扫描成败影响。
- 配置项:`killImpactScan.enabled` 控制全局开关(默认 true);`killImpactScan.repoRoot` 指定 git 工作仓库根(默认 `/root/.openclaw/workspace`);`killImpactScan.boardPath` 指定看板路径(默认 `/root/.openclaw/workspace/logs/subagent-task-board.json`);`killImpactScan.highRiskPathPrefixes` 配置 high 风险路径前缀列表(默认 `["src/", "docs/"]`);`killImpactScan.mediumRiskPathPrefixes` 配置 medium 风险路径前缀列表(默认 `["reports/", "logs/"]`)。enabled=false 时跳过快照和扫描,kill 直接透传,但仍写一条 decision='kill_impact_scan_disabled' 的审计日志保证可观测性。
- 审计 CLI:`aco audit kill-impact [--last N] [--risk high|medium|low] [--session <sessionKey>]` 输出最近 N 条(默认 20)kill 影响报告,支持按 riskLevel 和 sessionKey 过滤。每条记录展示时间、sessionKey、taskLabel、riskLevel、recommendedAction、affectedFiles 数量、affectedBoardEntries 数量摘要。`--verbose` 展开显示具体文件列表。

**AC**

- AC1(kill 前快照):ACO 识别 kill 类工具调用,在调用底层 Gateway kill HTTP 之前同步执行 `git status --porcelain=v1 -uall`(cwd=`killImpactScan.repoRoot`),解析输出得到所有已暂存/已修改/未跟踪文件的路径、mtime(毫秒 Unix 时间戳,直接取 `fs.statSync(path).mtimeMs`,**不做秒级取整**)、sizeBytes(`fs.statSync` 取 `size`)、hash(对文件内容计算 SHA-256,取前 16 字节十六进制;文件不存在或读取失败时 hash=null,该文件仍参与 affectedFiles 比对但 reverted 判定跳过)。同步读取看板 JSON,定位目标 sessionKey 的 task 条目,记录 label、startedAt(epoch ms)、lastWriteAt(epoch ms)。两份数据合并为快照对象,暂存内存供 kill 后比对。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2(kill 调用透传):kill 前快照完成后,ACO 调用底层 Gateway `/api/v1/sessions/<sessionId>/kill`(行为与现有 `openclaw-adapter.ts:killTask` 一致)。kill HTTP 返回 ≥ 400 且非 404 时,扫描步骤跳过,异常向上传递;HTTP 200/204/404 时进入 kill 后扫描。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3(kill 后扫描:文件):kill 后再次执行 `git status --porcelain=v1 -uall`,与快照比对。affectedFiles 列表包含两类条目 — (a)当前状态显示存在改动且 mtime ≥ task.startedAt(均为毫秒 Unix 时间戳,**不做单位换算**)的文件;(b)快照中存在但当前不在 git status 输出里的(已被恢复或已 commit)。每条记录字段为 `{ path: string, status: 'added' | 'modified' | 'deleted' | 'untracked' | 'reverted', mtime: number, sizeBytes: number }`。`status` 判定规则:case (a) 严格映射 git status porcelain 第一列字符(M→modified、A→added、D→deleted、??→untracked、其他组合按主操作判定);case (b) 中文件当前存在于工作树、但 git status 已无该路径(说明已被恢复或已 commit),进一步分支 — 当前 `fs.statSync` 计算的 hash 与快照中该文件的 hash 不一致、且当前 hash 与上次 commit(`git show HEAD:<path>`)一致时 → status='reverted';否则按原逻辑(已 commit)归到 affectedFiles 但 status 维持快照时的 git porcelain 主操作。`reverted` 文件的 `mtime` 与 `sizeBytes` 取**快照中该文件被记录时的快照值**(代表被 kill Agent 改动后、被恢复前的那个版本),不取 kill 后 `fs.statSync` 的现状值。`mtime ≥ task.startedAt` 的过滤同样基于快照 mtime 与 task.startedAt(均为毫秒)直接比较。本 AC 的过滤口径在单 Agent 串行 kill 场景下足够精确;多 Agent 并行运行期间的精确归属由 0.5.15+ FR 处理,0.5.14 不区分。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4(kill 后扫描:看板):从看板 JSON 中读取 sessionKey 命中的 task 元数据(`label`、`startedAt`、`status`、报告路径如有),并筛出 `lastWriteAt` 落在 [task.startedAt, killAt] 区间内的 task 条目作为 affectedBoardEntries。每条字段为 `{ taskId: string, label: string, status: string, lastWriteAt: number }`。看板中无相关条目时,字段返回空数组,不报错。本 AC 不依赖看板上不存在的 `writtenBy` 字段;多 Agent 并行运行期间的归属由 0.5.15+ FR(基于 task 与文件的精确归属表)处理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5(riskLevel 判定):严格按下列穷举规则 deterministic 判定,无主观加权,无 fallback 路径 — 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - 规则 1:`affectedFiles.length === 0 && affectedBoardEntries.length === 0` → 'low'。
  - 规则 2:`affectedFiles.length === 0 && affectedBoardEntries.length > 0`(没动文件但写了看板) → 'low'。
  - 规则 3:存在任意 affectedFiles 的 file.path 以 `killImpactScan.highRiskPathPrefixes` 中任一前缀开头 → 'high'(高风险优先,优先级最高,同时命中 medium 时仍取 'high')。
  - 规则 4:规则 3 不命中,且存在 affectedFiles,所有 file.path 均以 `killImpactScan.mediumRiskPathPrefixes` 中任一前缀开头 → 'medium'。
  - 规则 5:规则 3 不命中,且存在 affectedFiles,但 file.path 既不命中 high 前缀也不命中 medium 前缀(例如 `scripts/`、`Makefile`、其他根级配置)→ 'medium'(保守取中,避免落到未定义路径)。
  - 规则 6:规则 3 不命中,且 affectedFiles 同时存在 medium 命中与未命中任何前缀的混合 → 'medium'。
  - 路径前缀匹配相对于 `killImpactScan.repoRoot`,大小写敏感。规则 1-6 必须穷举覆盖所有 (affectedFiles, affectedBoardEntries) 取值组合,任何输入都能在规则 1-6 中找到唯一命中,不存在 implementation-defined fallback。
- AC6(recommendedAction 判定):严格按下表 deterministic 判定 — 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - riskLevel='low' → 'safe_to_proceed'。
  - riskLevel='medium' → 'review_diff'。
  - riskLevel='high' → 'consider_stash_first'。
- AC7(报告输出):扫描结束后输出 JSON 报告对象 `{ sessionKey: string, killAt: number, taskStartedAt: number, taskLabel: string, affectedFiles: AffectedFile[], affectedBoardEntries: AffectedBoardEntry[], riskLevel: 'low' | 'medium' | 'high', recommendedAction: 'safe_to_proceed' | 'review_diff' | 'consider_stash_first' }`,其中 `AffectedFile.mtime`、`taskStartedAt`、`killAt`、`AffectedBoardEntry.lastWriteAt` 字段语义统一为**毫秒 Unix 时间戳**;`AffectedFile` 的 `status` 取值范围为 `'added' | 'modified' | 'deleted' | 'untracked' | 'reverted'`(与 AC3 一致)。报告同时:(a)作为 kill 调用的返回数据回传给主会话;(b)以单行 JSON 追加写入 `/root/.openclaw/workspace/logs/aco-kill-impact.jsonl`,失败时降级为 warn 日志,不阻塞主流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8(降级处理):kill 前快照或 kill 后扫描中任一步骤抛错(git 命令失败、看板读取失败、文件 stat 失败、IO 异常)时,扫描整体降级:不阻塞 kill 调用本身;返回降级报告 `{ sessionKey, killAt, scanFailed: true, errorMessage: string }`,errorMessage 为错误 message 截断 256 字符;同时写一条 audit 事件到 `dispatch-guard-events.jsonl`,decision='kill_impact_scan_failed',包含 errorMessage。降级路径不引入重试,一次失败即降级。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9(配置开关与非法值):`killImpactScan.enabled = false` 时,ACO 跳过快照和扫描两步,kill 调用直接透传至 Gateway,返回报告对象为 `{ sessionKey, killAt, scanDisabled: true }`,同时写一条 decision='kill_impact_scan_disabled' 的审计日志,保证可观测性。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - 启动期 schema validator(沿用 FR-K02 P1 的 schema validator 路径)校验配置类型,任一命中以下非法值即报错退出,禁止 init 静默生成不可用的默认值 —
    - `killImpactScan.enabled` 非 boolean。
    - `killImpactScan.outputDir`(jsonl 报告写入目录)非字符串、为空字符串、或目录不可写(以进程当前 uid 为准)。
    - `killImpactScan.repoRoot` 非字符串、为空字符串、或路径不存在 / 非目录。
    - `killImpactScan.boardPath` 非字符串、为空字符串。
    - `killImpactScan.highRiskPathPrefixes` / `killImpactScan.mediumRiskPathPrefixes` 非数组、或数组中存在非字符串 / 空字符串元素。
    - `killImpactScan.maxFileScan` 非正整数(≤ 0、非整数、非数字均非法)。
    - `killImpactScan.maxBoardScanBytes` 非正整数。
  - 运行时路径无效场景(例如启动后 `outputDir` 被外部删除导致写入失败、`boardPath` 文件被重命名、`repoRoot` 不再是 git 仓库等)统一走降级路径:写一条 warn 日志(`dispatch-guard-events.jsonl`,decision='kill_impact_scan_failed'),报告字段降级为 `{ sessionKey, killAt, scanFailed: true, errorMessage }`,**不阻塞 kill 调用本身**。运行时路径异常不触发 schema validator 报错。
- AC10(审计 CLI):`aco audit kill-impact` 命令读取 `/root/.openclaw/workspace/logs/aco-kill-impact.jsonl`(末尾倒序解析),默认输出最近 20 条记录的摘要表(timestamp、sessionKey、taskLabel、riskLevel、recommendedAction、affectedFiles 计数、affectedBoardEntries 计数);支持 `--last N` 自定义条数、`--risk low|medium|high` 按风险等级过滤、`--session <sessionKey>` 按会话过滤、`--verbose` 展开显示 affectedFiles 和 affectedBoardEntries 完整列表。jsonl 文件不存在时输出 "no kill impact records yet" 并退出码 0。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11(单元测试):测试用例至少覆盖 — (a)快照/扫描完整路径且 affectedFiles 非空;(b)affectedFiles 全在 reports/ → riskLevel='medium';(c)affectedFiles 命中 docs/ → riskLevel='high';(d)空改动 → riskLevel='low';(e)`git status` 命令 mock 抛错 → scanFailed=true 但 kill 调用照常返回成功;(f)看板文件不存在 → affectedBoardEntries=[] 但报告正常输出;(g)highRisk 与 mediumRisk 同时命中时,最终 riskLevel='high';(h)`killImpactScan.enabled=false` → 报告为 scanDisabled,kill 透传成功;(i)Gateway kill 返回 HTTP 500 → 不进入扫描,异常上抛;(j)Gateway kill 返回 HTTP 404 → 进入扫描,正常输出报告;(k)recommendedAction 与 riskLevel 映射严格按 AC6;(l)affectedFiles 中 mtime < task.startedAt 的文件被排除(非该 Agent 运行期内改动)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12(kill 下游依赖扫描):任务被 kill 并完成影响扫描后,watchdog 必须检查任务看板中是否存在依赖该任务产出或以该任务为 parent 的非终态下游任务。若存在,将这些下游任务标记为 blocked,blocked reason 包含被 kill 的 taskId/sessionKey 和依赖原因,同时通知主会话处理重派或解除依赖。无下游依赖时静默通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

**完成判定**

- 真实运行验证:本地起 Gateway 进程,启动 pm-01 子 Agent 写一份 spec 文件后停在中途,主会话调用 `subagents(action=kill)` → ACO 接管 → 输出报告 → 报告中 affectedFiles 包含该 spec 文件 path,riskLevel='high'(因 docs/ 命中),recommendedAction='consider_stash_first';主会话拿到报告后人话总结到飞书,用户基于报告决定下一步。
- 防回归验证:复刻 2026-05-25 早晨场景 — pm-01 写入混合产出后被 kill,主会话能从报告中明确看到"affectedFiles=[docs/product-requirements.md]、riskLevel=high、recommendedAction=consider_stash_first",不会再"闭着眼" `git checkout`。
- 降级验证:mock `git status` 抛错或看板文件被重命名 → kill 调用照常成功,报告字段 scanFailed=true,errorMessage 不为空;`dispatch-guard-events.jsonl` 出现一条 decision='kill_impact_scan_failed' 记录。
- 性能边界:单次 kill 调用的扫描部分(快照 + 扫描两步合计)在工作树文件数 ≤ 1000、看板大小 ≤ 10MB 场景下端到端额外耗时 < 500ms;超过该规模时记 warn 日志但不阻塞。
- 可观测闭环:`aco audit kill-impact --last 20` 能读到过去 24 小时所有 kill 调用的影响报告,产品方可据此评估 kill 的风险分布、recommendedAction 触发频次、降级路径触发频次。

**与现有能力的关系**

- 与 FR-K01 / K02 / K03:本 FR 改的是 kill 路径,与 K01(主会话异步纪律治理)、K02(LLM 豁免判定)、K03(degraded 自愈)均独立。K01-K03 处理的是"主会话调 process 时的治理",K04 处理的是"主会话调 kill 时的扫描和报告"。代码上互不依赖、互不冲突,审计事件落入同一份 `dispatch-guard-events.jsonl` 但 decision 字段区分清晰。
- 与 FR-K02 信任模型:本 FR 直接继承 FR-K02 信任模型 — 单用户私聊、kill 调用来自主会话本身、无第三方注入。本 FR 是 deterministic 扫描,不调用 LLM、不做意图判定、不做 prompt 解析,所有判定基于事实统计(git status 输出、文件 mtime、看板字段、路径前缀),不存在"被骗放行"问题。
- 与域 B(派发治理):域 B 治"派发是否合规",域 K 治"主会话是否守住异步边界 + kill 是否留下事实依据",两者共用 L2 插件加载机制和 `dispatch-guard-events.jsonl` 审计流,治理目标和触发条件相互独立。

##### FR-K05:僵死任务自动清理

aco-run-watchdog 插件在巡检时,对同时满足以下条件的 running 任务自动标记为 failed:任务年龄超过标准超时阈值(`ACP_STALE_MS`),且对应 session state 文件的空闲时间也超过同一阈值。session state 文件空闲指没有文件写入、没有 `last_seq` 增长,系统据此判断任务已经僵死而非仍在产出。

- AC1:仅任务年龄超过 `ACP_STALE_MS`,但 session state 文件近期仍有更新或 `last_seq` 仍在增长的 running 任务不被清理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:任务年龄超过 `ACP_STALE_MS` 且 session state 文件空闲时间也超过 `ACP_STALE_MS` 的 running 任务被标记为 failed,失败 reason 包含 `stale` 和具体 idle 时长。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:清理完成后,对应 agent 立即恢复可用,任务看板中不再存在该 agent 的 running 条目。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:`ACP_STALE_MS` 的产品级默认值必须为 `7200000` 毫秒（2 小时）；只有调用方或配置显式覆盖时才能使用其他值，未显式提供时一律按 `7200000` 毫秒执行僵死判定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（配置读取结果、CLI 输出、审计事件、状态字段或代码片段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K05a:Gateway 重启后僵尸 session 清理

Gateway 重启时,aco-run-watchdog 必须清理上一次进程遗留的 session state,防止已经没有进程的 session 继续被看作 running 并触发无限恢复循环。

- AC1:Gateway 启动或 watchdog 初始化时,扫描配置的所有 session state 文件目录,逐个读取 session state。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:当 state 中 `closed=false` 且记录的 pid 不存在或已不属于对应 session 进程时,watchdog 将该 session 标记为 `closed=true`,关闭原因写为 `orphaned_after_gateway_restart`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:被标记关闭的 session 若在任务看板中仍有关联 running 任务,该任务转为 failed 或 timed_out 终态,失败原因包含 `orphaned_session` 和 sessionKey。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:清理动作必须幂等。重复扫描同一 closed session 不得重复写入状态、不得把终态任务恢复为 running。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:每次清理写入审计日志,包含 sessionKey、原 pid、state 文件路径、任务状态变更结果；扫描不到 session state 目录时记录 warn 但不阻塞 Gateway 启动。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K06:开发派发前 Spec 覆盖检查

`dispatch-guard` 在派发开发类任务前,评估该任务是否已被对应项目的 `product-requirements.md` 中的 FR/AC 覆盖。若判定为未覆盖的新功能、新模块或逻辑变更,则阻断开发派发,向用户提示需要先修改 spec 再开发。

- AC1:已有 FR/AC 明确覆盖的开发任务正常放行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:未覆盖的开发任务被阻断,返回提示消息包含"建议先修改 spec"和缺失的功能描述。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:纯 bug 修复且不改变功能边界的任务不触发阻断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:用户可通过明确指令豁免检查,例如"我豁免 spec 检查"。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K07:新功能实现后自动评估 README 更新

当开发任务通过审计后,`dispatch-guard` 自动评估该功能是否具有用户可见价值。用户可见价值包括新能力、新命令、新配置项、行为变更等。若判定外部用户需要知道这个变化,系统自动派发 PM 更新对应项目的 `README.md`,将新功能整合进用户文档。

- AC1:纯内部重构、性能优化、代码清理等不触发 README 更新。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:新增用户可见功能(新命令、新配置、新行为)触发 README 更新派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:README 更新任务自动分配给 PM 角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:评估逻辑在审计通过的 completion event 处理中执行,不需要人工触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K08:插件通用化与开源准备

13 个 L2 插件每个目录下补 README.md(用途、配置项、安装方式),硬编码值提取为 `openclaw.plugin.json` 的 `config` 字段,通用逻辑与 OpenClaw 定制逻辑分离,通用部分可独立使用。

- AC1:每个 L2 插件目录下存在 README.md,内容覆盖用途、配置项清单、安装方式三段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:`openclaw.plugin.json` 的 `config` 字段覆盖所有可变参数,源码中无硬编码路径、阈值、角色名。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:通用逻辑可在不依赖 OpenClaw 特定目录结构的环境中独立加载并运行单元测试。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K09:spec-first guard(确定性阻断)

`dispatch-guard` 检测到开发任务缺少 spec 引用时,在 `sessions_spawn` 路径上确定性阻断而非仅返回 prompt 提示;FR-K06 的 prompt 注入路径升级为 spawn 前准入校验。

- AC1:开发类任务的 spawn 请求未携带 spec 路径或 FR/AC 引用时,Gateway 返回 dispatch_blocked 错误,会话不被创建。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:携带有效 spec 路径且路径在仓库中真实存在的开发任务正常 spawn。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:审计、调研、bug 修复、文档更新等非开发类任务不触发阻断,与 FR-K06 分类边界保持一致。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:阻断事件以 decision='spec_missing_blocked' 写入 `dispatch-guard-events.jsonl`,包含任务 label 和缺失的 spec 提示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5: 以 `sevo:` 前缀开头的 label 视为 SEVO 流水线命令（sevo:fix / sevo:implement / sevo:create / sevo:from），流水线自身包含 specify 阶段确保 spec 覆盖，不触发 spec-first 阻断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K18:dispatch-guard 角色匹配校验提示

`dispatch-guard` 保留 spawn 阶段的角色匹配校验作为事后兜底层,同时在 `before_prompt_build` hook 中每轮无条件注入一份统一的"角色与梯队路由引导",把任务类型 → 角色 → 具体 agent 列表的完整映射与现有编码梯队(T1/T2/T3)引导合并呈现,让主会话在决策派发阶段就知道该选哪个角色的 agent,而不是等 spawn 时才发现派错。

- AC1:spec 中明确定义任务类型到允许角色集合的映射表,至少包含:spec/需求/产品 → `pm`;编码/开发/修复 → `coding`;架构/设计 → `architecture`;调研/分析 → `research`;审计/评审 → `review`;UX/交互 → `ux`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:`dispatch-guard` 在 spawn 时先读取 `detectTaskType` 的分类结果,再读取目标 `agentId` 的 `role` 字段,若目标角色不在该任务类型允许集合内,系统注入警告提示但不阻断 spawn,保留用户有意跨角色派发的灵活性。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:警告内容必须包含当前判定的任务类型、目标 `agentId` 的当前角色、以及同角色池中建议替换的正确 agent 列表,方便主会话当场改派。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:当 `agentId` 是用户在请求中显式指定,而非主会话自动选择时,系统降级为仅写一条 audit event,不向主会话注入警告提示,避免对用户的有意决策重复打断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:`aco-objective-fact-guard` 在 `before_prompt_build` 中每轮无条件注入完整角色路由表(任务类型 → 角色 → agent 列表),并与现有编码梯队注入合并为统一的"角色与梯队路由引导",引导主会话在决策阶段优先选择正确角色的 agent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:注入内容从 `AGENT_TIER_FALLBACK` 角色注册表动态生成,不得手动维护或硬编码固定 agent 名单;agent 池变化时注入文本自动更新。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K19:可控性沉淀机制

主会话在对话中发现需要长效遵守的原则、约束或操作规范时,系统必须引导主会话将规则固化到正确的可控性层级,禁止只记录到 memory 后停下。

- AC1:发现长效规则需要新增、变更或优化时,第一动作是派任务改 spec 或改 L2 插件,禁止采用"先记到 memory 回头再固化"的处理方式。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:memory 只记录长期历史回溯事实,包括发生了什么、什么时候决策、由谁提出;memory 不承担规则执行职责。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:规则固化层级按遗忘后果判断:后果严重的规则必须下沉到 L2 或更低层;后果轻微的规则可先由 spec 定义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:记录历史事实用 memory,推动规则变更用 `sevo:fix` 派任务;两件事可同时做,规则变更是主线,memory 记录是副产物。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:可控性层级从低到高为 L0(systemd/cron) → L1(Gateway 核心) → L2(插件注入) → L3(Hook) → spec → memory。规则应尽量下沉到最低可行层。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K10:README 自动评估(completion event 驱动)

FR-K07 的并发提示路径升级为 completion event 直接驱动 README 更新派发,无需人工触发或下次任务到来时再评估。

- AC1:开发任务进入审计通过状态后 10 分钟内,若评估为含用户可见功能变更,自动生成一条 PM 派发任务用于更新对应项目的 README.md。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:纯重构、性能优化、内部重命名等不可见变更不触发派发,与 FR-K07 AC1 一致。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:派发记录在 dispatch 审计流中可追溯,关联到触发它的源开发任务 sessionKey。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:同一源任务在 10 分钟窗口内不重复派发,避免审计事件重放导致重复任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K11:测试环境隔离

ACO 与 SEVO 的测试套件不依赖本机 `/root/.openclaw/...` 路径或宿主机已安装的 OpenClaw,在干净 node 环境中 `npm ci && npm test` 可全绿。

- AC1:测试 fixture 不引用绝对路径 `/root/.openclaw/...`,改为 fixtures 目录或临时目录注入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:测试不依赖宿主机已安装 OpenClaw Gateway 进程或全局配置文件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:在不预装 OpenClaw 的容器或 CI 环境中,克隆仓库后 `npm ci && npm test` 全部通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K12:Demo 命令开箱即用

ACO 提供 `aco demo` 命令演示完整调度生命周期(任务进入 → 规则校验 → 派发 → 失败重派 → 完成),使用模拟数据,不依赖外部 LLM provider 或在线服务。

- AC1:`npm install -g aco && aco demo` 在不配置任何 API key、不连接外部服务的环境中跑通全流程,退出码 0。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:demo 输出涵盖任务进入、规则校验判定、派发决策、失败重派、最终完成五个阶段的可读日志。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:demo 使用内置 mock provider,无需 ANTHROPIC_API_KEY 或 OpenClaw Gateway 在线。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K13:Dashboard 数据来源标注

SEVO Web dashboard 的每个数据面板标注其数据来源类型,区分"runtime ledger 真实数据"与"文件派生/合成视图",避免用户把派生视图当成实时状态。

- AC1:dashboard 每个面板渲染时展示来源标签,取值为 `runtime` 或 `derived`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:`runtime` 标签对应来自 runtime ledger 的实时数据,`derived` 标签对应基于文件聚合或历史快照的派生视图。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:面板 hover 或点击标签时展示数据源说明(ledger 路径或派生逻辑摘要)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K14:最大化并行调度 L2 守卫

主会话默认串行思维(等 A 完成再派 B),需要 L2 插件在每轮 context 注入里持续提醒,把"有待办就全量扫描、能并发就立即并发"变成代码级守卫。

- AC1:`aco-dispatch-guard` 在 context 注入逻辑中新增一段"最大化并行调度"规则文本。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:注入文本必须简洁(<100字),每轮都能看到但不占过多 token。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:注入条件为所有主会话回合,不区分任务类型。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:新增规则文本要求主会话在每次产生新待办或收到 completion 释放 agent 时,立即做全量调度扫描:待办列表 × 空闲 agent × 文件冲突域;不冲突的任务全部同时派出,禁止"等 A 完成再派 B"的串行思维,除非 B 依赖 A 的产出,也禁止"谁空闲了再想下一步"的被动模式。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:修改后 `node --check` 通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-K15: SEVO implement 阶段自动测试门禁

**背景**：ACO 有完整测试套件，但 SEVO 流水线 implement 阶段完成后没有自动跑测试。测试全绿应该是长效门禁。

**需求**：

- aco-dispatch-guard 检测到 ACO 项目审计任务时，自动在 task prompt 中追加"先跑 npm test，不全绿不通过"
- 注入条件：task 涉及 `projects/aco/src/` 或 `extensions/aco-*` 路径 + label 含 `audit-`

**AC**：

1. dispatch-guard 检测到 ACO 审计任务时自动追加测试要求
1. 注入文本简洁（<50字）
1. node --check 通过

### FR-K16: 发布前陌生环境验证门禁

**背景**：npm publish 前应该跑 stranger-verify 脚本验证包在干净环境可用。当前有脚本但没有自动化触发。

**需求**：

- aco-dispatch-guard 检测到包含 publish/release 关键词的任务时，自动追加 stranger-verify 要求
- 注入条件：task 内容含 `publish` 或 `npm publish` 或 `release`

**AC**：

1. dispatch-guard 检测到发布类任务时自动追加验证要求
1. 注入文本简洁（<50字）
1. node --check 通过

### FR-K17: 语义理解优先原则（LLM > 正则）

**背景**：dispatch-guard 中有多处用正则/关键词匹配做语义判断（任务分类、审计通过判定、bug-fix 识别等）。正则有漏判风险，LLM 始终可用，准确性是刚需。

**原则**：凡涉及语义理解的判断（分类、意图识别、通过/失败判定），必须用 LLM 语义匹配。正则只作为快速通道（命中即放行），未命中时必须 LLM 二次确认。延迟可接受，准确不可妥协。

**需求**：

- 将 dispatch-guard 中以下 3 处正则升级为 LLM 语义匹配：
  1. 用户可见变更判定（L233）：判断任务是否涉及用户可见变更
  1. 审计通过判定（L241-244）：判断审计结果是否通过
  1. bug-fix 识别（L67）：判断任务是否为 bug 修复
- 每处采用与 spec-first 相同的模式：正则快速通道 + LLM 5s 二次确认

**AC**：

1. 三处判断都有 LLM fallback
1. 正则命中 = 直接返回（零延迟）
1. 正则未命中 = LLM 5s 语义确认
1. LLM 失败/超时 = 降级为正则结果
1. 审计日志记录 semantic 判断结果
1. node --check 通过

##### FR-K20a:FR-K20 影响域守卫插件（aco-fr-k20）

`aco-fr-k20` 作为 FR-K20 的专用 L2 守卫,在主会话派发任务前执行影响域预检规则,保证任务横向范围过宽时被及时提醒拆分。

- AC1:插件在 `before_prompt_build` 或等价主会话上下文注入阶段生效,仅面向开发、修复、实现类任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:插件复用 FR-K20 的文件域识别规则和阈值,当独立文件域数量 >3 时注入拆分建议；≤3 时不注入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:注入内容必须包含触发原因、识别出的文件域数量、建议拆分后的子任务范围,不得阻断用户有意派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:每次触发写入 `dispatch-guard-events.jsonl`,记录 label、域数量、域列表和建议子任务摘要。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K21:客观事实优先守卫（aco-objective-fact-guard）

`aco-objective-fact-guard` 在主会话每轮回复前注入事实核验要求,要求涉及状态、文件、配置、服务、资源、Git、任务看板等事实性结论时先做实时客观检查。

- AC1:插件在 `before_prompt_build` 阶段对主会话生效,不影响子 Agent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:当上下文涉及任务状态、文件内容、配置、服务状态、资源、Git 状态等事实类别时,注入对应的实时检查要求和真相源提示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:注入内容必须强调记忆只作线索,最终结论以本回合客观检查结果为准；记忆与事实冲突时事实优先。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:状态类回复未经过看板或对应真相源检查时,插件写入审计事件,字段包含命中的事实类别和缺失的检查类型。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:角色与梯队路由引导由插件从当前 agent 配置动态生成,agent 池变化后下一轮注入自动更新,不得硬编码历史 agent 列表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K20: 任务影响域预检守卫（dispatch-scope-guard）

`aco-dispatch-scope-guard` 在主会话派发开发任务前执行任务影响域预检。任务横向范围过宽时,插件提醒拆分,避免单个任务同时跨过多文件域导致失败率上升。

- AC1:插件在 `before_prompt_build` 阶段生效,识别开发、修复、实现类任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:插件分析 task prompt 中显式或隐式提及的文件路径、模块名、项目名,计算独立文件域数量。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:当独立文件域数量 >3 时,插件向主会话注入拆分建议；建议必须包含每个子任务的范围描述和预估影响文件列表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:当独立文件域数量 ≤3 时静默通过,不注入内容,不影响正常派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:该提醒为建议性提醒,不得阻断用户有意派发；如需阻断,必须另有明确 FR/AC 定义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:每次触发写入 `dispatch-guard-events.jsonl`,记录任务 label、识别出的域数量、域列表和建议拆分摘要。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

**背景**：72 小时实战数据显示，单任务涉及 >3 个独立文件域时失败率显著上升（cc 81% vs codex 98%，失败集中在横向过宽任务）。当前 dispatch-guard 校验 agent 可用性，run-watchdog 检测运行时超时，但缺少派发前的任务范围预检。

**文件域定义**：同一目录（含子目录）下的文件算一个域；跨顶层目录算不同域。例如 `extensions/aco-notify/` 和 `extensions/aco-dispatch-guard/` 是两个域；`projects/sevo/src/pipeline.js` 和 `projects/sevo/src/gates.js` 是同一个域。

---

#### FR-F09: TASKS.md 自动维护

**描述**：ACO 插件自动维护 `workspace/TASKS.md`。spawn 成功时写入进行中，completion 到达时移动到已完成或标记失败，不依赖主会话记忆。

**AC**：

1. spawn 事件触发后 `TASKS.md` 自动追加条目。
1. completion 事件触发后条目自动移动到已完成，或标记为失败。
1. 文件不存在时自动创建标准模板，包含 `## 进行中` 与 `## 已完成` 两个章节。
1. 实现保持通用化，不硬编码用户名或 agent 池。

### 6.5 能力组成

ACO 由七类能力组成：

- 任务生命周期：创建、入队、状态流转、超时、取消、实质成功校验。
- 派发治理：角色匹配、自审禁止、并发控制、规则热更新、熔断、动态角色发现、语义分类。
- 资源池管理：Agent 注册、梯队路由、失败升级、资源池状态视图。
- 自动推进链：成功触发、条件触发、失败分支、链路可视化。
- 可观测与通知：审计日志、任务看板、资源统计、决策溯源、IM 推送、闭环提醒。
- 健康与恢复：心跳、卡死检测、自动恢复、全局健康状态。
- 配置与分发：零配置启动、热加载、配置校验、渐进式功能启用、CLI、库 API、Gateway 适配层、版本升级。

### 6.6 边界

ACO 负责运行时调度与治理：怎么派、派给谁、什么时候阻断、失败后怎么接、状态怎么记录、结果怎么通知。

SEVO 负责研发流水线：需求、架构、开发、审计、发布这些阶段如何定义和推进。

KIVO 负责知识管理：知识如何提取、存储、检索和注入。

AEO 负责效果运营：效果如何监测、实验如何执行、运营动作如何评估。

OpenClaw Gateway 负责执行能力：创建会话、发送消息、kill 会话、暴露事件。ACO 通过适配层调用 Gateway，不直接管理 Agent 的创建和删除。

---

## 非功能需求

### NFR-01:性能

- 事件响应延迟 <= 1 秒(从事件到达到调度决策完成),任务从 queued 到 dispatching 的延迟 <= 2 秒。
- 单实例支持同时管理 100+ 任务、50+ Agent Slot,无明显性能退化。
- 审计日志写入不阻塞调度主循环(异步写入)。
- CLI 命令响应时间 <= 500ms(本地操作)。

### NFR-02:可靠性

- 进程意外退出后重启,能从持久化状态恢复所有非终态任务(不丢任务)。
- 状态持久化采用 WAL(Write-Ahead Log)模式,确保崩溃一致性。
- 单个 Agent 故障不影响其他 Agent 的调度(故障隔离)。

### NFR-03:可维护性

- 代码模块按域划分,每个域独立目录,域间通过事件总线通信。
- 测试覆盖率 >= 80%(核心调度逻辑 >= 95%)。
- 所有配置项有 schema 定义和默认值文档。

### NFR-04:安全性

- 配置文件中的敏感信息(IM token、webhook secret)支持环境变量引用,不明文存储。
- 审计日志不记录任务 prompt 全文(可能含敏感信息),只记录 label 和 hash。
- CLI 操作不需要额外认证(本地工具,依赖文件系统权限)。

### NFR-05:兼容性

- 支持 Node.js >= 18。
- 支持 Linux、macOS、Windows(WSL)。
- 不依赖外部数据库,所有状态存储在本地文件(SQLite 或 JSON)。
- 与 OpenClaw Gateway 版本解耦,通过 OpenClawAdapter 接口适配不同 Gateway 版本。

### NFR-06:可观测性

- 所有关键操作产生结构化日志(JSON 格式),支持日志级别配置。
- 提供 metrics 导出接口(Prometheus 格式),供外部监控系统采集。
- 错误日志包含完整上下文(taskId、agentId、操作类型、错误栈)。

---

### NFR-07:可用性

- 单 Agent 环境下必须可完成任务创建、派发、状态追踪、完成通知的基础闭环。
- 多 Agent 环境下启用角色约束、梯队路由、并发控制和自动推进，不要求用户一次性配置全部高级能力。
- CLI 输出必须包含人能直接理解的下一步建议，失败时说明原因和可执行修复动作。
- IM 通知内容必须先给结论，再给必要事实，不要求用户阅读日志才能判断任务状态。

### NFR-08:可恢复性

- 任务看板、审计日志和配置文件损坏时，系统必须给出明确诊断，不得静默覆盖。
- 失败重试必须有次数上限和升级策略，避免无限循环消耗资源。
- kill、cancel、timeout 等高风险状态变化必须保留影响记录，便于后续追溯。

## 概念架构

### 部署形态

ACO 的部署形态是 **OpenClaw Gateway Plugin**(事件驱动),不是独立 daemon 或轮询进程。ACO 作为 Gateway 插件运行,通过 OpenClaw 的插件事件系统接收事件并执行调度逻辑。没有"调度循环"或"tick"的概念--所有调度决策由事件触发。

事件源:

- `session:spawn`:任务创建事件。外部调用方(SEVO / 用户 / 其他模块)请求创建 Agent 会话时触发,ACO 在此执行准入校验。
- `session:complete`:任务完成事件。Agent 会话结束时触发,ACO 执行实质成功校验、推进链触发、资源池状态更新。
- `session:timeout`:超时事件。任务超过 timeout 阈值时由 Gateway 触发,ACO 执行超时处理和梯队升级。
- `message:received`:消息到达事件。用于卡死检测(Agent 有响应则重置 stall 计时器)和运行时干预(steer)。

### 核心组件

ACO 的运行时由五个核心组件协作:

**事件调度器(Event Dispatcher)** 是系统入口。接收 Gateway 事件,根据事件类型路由到对应处理器。事件调度器是纯响应式的--无事件则无动作,不消耗 CPU。

**任务队列(Task Queue)** 持有所有非终态任务。任务按 priority 降序 + 入队时间升序排列。每当有新任务入队或有 Agent 释放时,事件调度器触发队列消费:取出队首候选任务,交给规则引擎校验。

**规则引擎(Rule Engine)** 在派发前执行所有 Dispatch Rule。规则按优先级排序,逐条匹配。命中 block 规则的任务保持 queued;命中 warn 规则的任务放行但记录告警;无命中或命中 allow 的任务进入派发流程。规则引擎内置 LLM 语义分类能力,对 task prompt 进行任务类型推断。

**资源池(Resource Pool)** 管理所有 Agent Slot 的状态。派发时资源池提供候选列表(idle 且未达并发上限的 Agent),按梯队路由策略排序。Agent 完成任务后资源池更新状态并触发队列消费(可能有排队任务等待该 Agent)。

**推进链执行器(Chain Executor)** 监听任务终态事件。任务进入 succeeded 或 failed 时,检查是否有关联的 Completion Chain,有则按 chain 定义创建后续任务并入队。支持条件循环(如审计不通过 → 修复 → 再审计)。

### 与现有三件套的能力映射

<lark-table rows="4" cols="3" header-row="true" column-widths="244,244,244">

  <lark-tr>
    <lark-td>
      现有组件
    </lark-td>
    <lark-td>
      核心能力
    </lark-td>
    <lark-td>
      ACO 对应域
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-dispatch-guard
    </lark-td>
    <lark-td>
      角色校验、LLM 语义分类、并发控制、ACP 全局上限、prompt 注入
    </lark-td>
    <lark-td>
      域 B(派发治理)+ 规则引擎
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-run-watchdog
    </lark-td>
    <lark-td>
      超时保护、卡死检测、idle-alert、steer 干预、健康探测
    </lark-td>
    <lark-td>
      域 A(超时)+ 域 G(健康恢复)
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      local-subagent-board.js
    </lark-td>
    <lark-td>
      任务看板、状态追踪、飞书通知、快照推送
    </lark-td>
    <lark-td>
      域 E(可观测)+ 域 F(通知)
    </lark-td>
  </lark-tr>
</lark-table>

ACO 新增的能力(三件套没有的):声明式推进链(域 D)、梯队路由(域 C)、渐进式配置(域 H)、OpenClaw 插件化开箱体验(域 Z)。

### 当前运行时插件实现矩阵

以下 13 个运行时插件/守卫是当前 ACO 的真实 L2 实现集合。spec review 以此为准；未列入本表的旧插件设想不再作为 Gateway 运行时插件或插件 FR 目标。

<lark-table rows="6" cols="3" header-row="true" column-widths="244,244,244">

  <lark-tr>
    <lark-td>
      运行时插件
    </lark-td>
    <lark-td>
      主要职责
    </lark-td>
    <lark-td>
      对应 FR
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-dispatch-guard
    </lark-td>
    <lark-td>
      派发治理、角色约束、并发与梯队选择、主会话 prompt 注入
    </lark-td>
    <lark-td>
      FR-B01 ~ FR-B07
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-run-watchdog
    </lark-td>
    <lark-td>
      子任务生命周期追踪、超时/卡死检测、看板快照推送、恢复记录
    </lark-td>
    <lark-td>
      FR-A03、FR-A04、FR-E02、FR-G01 ~ FR-G03
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-notify
    </lark-td>
    <lark-td>
      completion 通知补发、飞书直推、通知过滤
    </lark-td>
    <lark-td>
      FR-F01 ~ FR-F05、FR-F08
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-concurrency-efficiency-guard
    </lark-td>
    <lark-td>
      主会话待办与空闲 ACP agent 检测、并发派发强制提示
    </lark-td>
    <lark-td>
      FR-F06
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      aco-closure-guard
    </lark-td>
    <lark-td>
      completion 后主会话闭环提醒与超时审计
    </lark-td>
    <lark-td>
    </lark-td>
  </lark-tr>
</lark-table>

FR-F07

aco-output-humanizer-guard

用户可见消息技术标签清洗

FR-I01

aco-async-discipline-guard

主会话异步纪律守卫、LLM 豁免判定、degraded 自愈

FR-K01、FR-K02、FR-K03

aco-doctor-guard

`doctor --fix` 禁止、doctor 证据门禁、重启前置约束

FR-B01 的高风险命令治理子集

aco-objective-fact-guard

事实优先注入、状态汇报前置核验

FR-K21

aco-research-anti-crawl-guard

调研任务反爬兜底注入

FR-B07 的调研任务治理子集

aco-session-context-recovery

session reset 后上下文恢复注入

FR-A04 的实质成功判定辅助能力

aco-spec-challenge-guard

spec 挑战与收敛注入

FR-B07 的规格约束补强

aco-browser-session-lease

浏览器工位单租约管理与自动回收

FR-C04 的浏览器资源占用视图子集

aco-dispatch-scope-guard

任务影响域预检，超阈值时提醒拆分

FR-K20

aco-fr-k20

FR-K20 专用影响域守卫

FR-K20a

### 数据流转

1. 外部调用方请求创建任务 → `session:spawn` 事件 → 事件调度器 → 规则引擎校验 → 资源池选 Agent → 派发(dispatching → running)。
1. Agent 执行完成 → `session:complete` 事件 → 实质成功校验 → succeeded 或 failed。
1. 推进链执行器收到终态事件 → 创建后续任务 → 回到步骤 1。
1. 超时触发 → `session:timeout` 事件 → failed → 梯队升级重试 → 回到步骤 1。
1. 每个状态变更 → Audit Event 写入 + Notification 推送。

### 持久化策略

任务状态和审计日志写入本地 SQLite(WAL 模式)。配置文件为 YAML/JSON。资源池状态为内存态(启动时从 OpenClaw 配置重建)。

---

## 与其他模块的边界

### ACO vs SEVO(研发流水线)

- SEVO 定义研发流程的阶段和门禁(Spec → Implement → Review → Deploy)。
- ACO 负责执行 SEVO 阶段中的具体任务调度(选哪个 Agent、超时多少、失败怎么办)。
- 边界:SEVO 说"这个阶段需要一个审计任务",ACO 说"这个审计任务派给 audit-01,超时 600s,失败升级到 T1"。
- 集成点:SEVO 通过 ACO 的库 API 创建任务,ACO 通过事件通知 SEVO 任务完成。

### ACO vs KIVO(知识管理)

- KIVO 管理知识的提取、存储、检索和分发。
- ACO 不涉及知识内容,只负责调度执行知识相关的任务(如调研任务的 Agent 分配)。
- 边界:KIVO 说"需要执行一个调研任务",ACO 负责把这个任务调度到合适的 Agent。
- 集成点:KIVO 通过 ACO API 提交调研任务,ACO 返回任务状态和产出。

### ACO vs AEO(效果运营)

- AEO 负责效果监测、A/B 测试和运营自动化。
- ACO 不涉及效果评估逻辑,只负责调度 AEO 产生的执行任务。
- 边界:AEO 说"需要执行一个数据采集任务",ACO 负责调度执行。

### ACO vs OpenClaw Gateway

- OpenClaw Gateway 提供 Agent 的实际执行能力(spawn session、send message、kill session)。
- ACO 通过 OpenClawAdapter 调用 Gateway 能力,避免调度逻辑直接散落依赖 Gateway 内部接口。
- 边界:ACO 决定"派发任务给 agent-x",OpenClaw Gateway 负责"创建 agent-x 的执行会话并传入 prompt"。
- ACO 不管理 Agent 的生命周期(创建/删除 Agent 是 OpenClaw 的职责),只管理 Agent 的调度状态。

---

## 约束与假设

### 约束

- ACO 运行在单机环境,不考虑分布式部署(Agent 集群规模 <= 50)。
- ACO 依赖 OpenClaw Gateway 提供 Agent 执行能力,自身不实现 Agent runtime。
- 审计日志存储在本地文件系统,不支持远程日志服务(可通过 metrics 导出间接实现)。
- 通知渠道的认证凭据由用户自行管理,ACO 不提供凭据轮换机制。
- 配置文件格式向后兼容,新版本不破坏旧配置(可能新增字段但不删除/改语义)。

### 假设

- OpenClaw Gateway 的 Agent 执行能力可用(ACO 处理超时和失败,但不处理 Gateway 本身的崩溃)。
- 用户有基本的命令行使用能力(ACO 是 CLI-first 工具)。
- Agent 数量在 2-50 范围内(低于 2 个 Agent 时治理价值有限,超过 50 个需要分布式方案)。
- 任务 prompt 由调用方(SEVO / 用户 / 其他模块)负责质量,ACO 不校验 prompt 内容的合理性。
- 网络连接稳定(IM 通知依赖网络,网络中断时通知会延迟但不丢失--本地队列缓冲)。

---

### Spec 撰写规范

- ACO spec 全文禁止使用“拦截”字样。涉及可控性、任务派发、规则执行或风险治理时，必须优先使用“引导”“准入校验”“路由”“兜底治理”“风险提示”等非对抗性表述。
- 为什么这样写：ACO 的产品语义是通过主动引导提醒和主 Agent 主动握手达成可控性，而不是把 Agent 视为对抗对象。文档措辞必须帮助实现者理解“先引导、再握手、必要时兜底”的产品意图，避免把规则设计误导成对抗式卡口。

---

##### FR-B08:显式指定 Agent 的角色匹配阻断

当调用方在 `sessions_spawn` 中显式指定 `agentId` 时，dispatch-guard 必须在 `before_tool_call` 阶段校验“任务类型”与“目标 Agent 角色”是否匹配；不匹配时当场阻断，避免主会话把 spec、架构、审计等任务错派给编码 Agent。

- AC1:任务类型从 `label` 或 `task prompt` 识别，至少覆盖以下映射：spec / 需求 → `pm` 角色；编码 / 开发 / 修复 → `coding` 角色；架构 / 设计 → `architecture` 角色；审计 / 评审 → `review` 角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:目标 `agentId` 的角色信息从 `AGENT_REGISTRY` 或 `/root/.openclaw/openclaw.json` 的 `agents.list` 查询，禁止依赖残留目录、历史缓存或主会话记忆。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:当任务类型与目标 Agent 角色不匹配时，系统必须阻断本次 spawn，并返回明确错误信息：`任务类型为 X，应派 Y 角色 agent，当前指定的 Z 是 W 角色`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:当任务类型与目标 Agent 角色匹配时，系统静默通过，不追加多余提示，不改变原有派发路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:任务类型识别遵循 FR-K17 的语义理解优先原则：正则或关键词匹配只作为快速通道；快速通道未命中时，必须调用 LLM 做语义分类确认。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:该校验只在调用方显式指定 `agentId` 时生效；未指定 `agentId` 的任务仍沿用现有自动选人逻辑，不重复阻断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:角色匹配校验结果写入派发审计日志，至少记录任务摘要、识别出的任务类型、目标 `agentId`、目标角色、判定结果与阻断原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-B09:角色匹配守卫（Role-Matching Dispatch Guard）

当主会话 spawn 子任务时，ACO 必须在 `before_spawn` 或等效派发前时机执行一层角色匹配守卫，提前检查“当前任务应该由什么角色处理”与“目标 agentId 实际是什么角色”，防止把 spec 变更误派给编码 Agent、把审计误派给开发 Agent 之类的错派问题带入执行阶段。

- AC1:守卫在主会话每次创建子任务并准备 spawn 时触发；若底层实现不存在字面意义上的 `before_spawn` hook，必须在语义等价、且早于真正派发执行的校验时机触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:系统必须先从任务描述、label 或调用方显式字段中推断任务类型，至少覆盖以下类型：spec/需求变更、代码开发/修复、架构设计、审计/评审、调研/分析、UX/交互。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:目标 `agentId` 的角色标签必须从 `/root/.openclaw/openclaw.json` 的 `agents.list` 实时读取；禁止依赖残留目录、历史缓存、主会话记忆或硬编码名单。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:任务类型与角色的默认映射固定为：spec/需求变更 → PM 角色（`pm-01`、`pm-02`）；代码开发/修复 → Dev 角色（`cc`、`codex`、`omp`、`hermes`、`free-code`、`opencode`、`dev-01`、`dev-02`）；架构设计 → SA 角色（`sa-01`、`sa-02`）；审计/评审 → Audit 角色（`audit-01`、`audit-02`）；调研/分析 → Research 角色（`feynman`，`codex` 可作为兼职调研角色）；UX/交互 → UX 角色（`ux-01`）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:当系统判定任务类型与目标 Agent 角色不匹配时，必须取消本次派发决策并向主会话注入 advisory 级警告提示；提示内容至少包含识别出的任务类型、目标 `agentId` 的当前角色、为什么不匹配、以及建议改派的角色或 Agent 列表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:该守卫默认不阻断主会话后续决策链；主会话在收到 advisory 后可改派、拆分或在确认有意越权时继续派发。系统必须把这类事件记录为“已告警的错派风险”，供后续审计追溯。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:当任务 label 中包含对用户明确授权原话的引用，且该引用表明用户知情并授权跳过角色校验时，守卫允许豁免；豁免命中时必须在审计日志中写明引用内容、触发原因和操作者。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8:守卫的判定结果必须写入派发审计日志，至少记录任务摘要、识别出的任务类型、目标 `agentId`、目标角色、判定结果（match / mismatch / exempt）、告警内容与建议改派结果。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9:当任务未显式指定 `agentId`、而是进入自动选人流程时，守卫仍需输出任务类型，供后续资源选择模块按角色池选人；不得因为“尚未选中 Agent”而跳过任务类型判定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K22:Think Before Coding 显式化

编码 Agent 收到实现类任务后，ACO 必须确保任务提示中显式要求先列出关键假设与歧义点，再开始写代码。遇到影响实现方向的歧义时，编码 Agent 必须先停下来向调度方澄清，禁止静默选择一种解释继续。

- AC1:编码 Agent 收到任务后，必须先列出假设和歧义点，再开始写代码。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（任务 prompt、Agent 输出、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:遇到歧义时先停下来向调度方澄清，禁止静默选择一种解释继续。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（任务 prompt、Agent 输出、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:sevo-pipeline implement 阶段 prompt 注入此约束。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（阶段 prompt、插件配置、代码片段或审计事件之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K23:Goal-Driven Execution 前置化

编码 Agent 动手前，ACO 必须确保任务提示中显式要求先写出成功标准。任务完成后，编码 Agent 必须对照成功标准逐项验证，且验收条件必须能被客观证据支撑。

- AC1:编码 Agent 动手前必须先写出成功标准（验收条件），完成后对照验证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（任务 prompt、Agent 输出、验证记录或审计事件之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:sevo-pipeline implement 阶段 prompt 注入此约束。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（阶段 prompt、插件配置、代码片段或审计事件之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:验收条件必须可客观验证（命令输出、文件存在、测试通过），禁止主观判断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含命令输出、文件路径、测试结果、API 响应或状态字段之一，缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K24:独立仓库同步强制约束

OpenClaw（pm-01 子Agent）2026-05-30

主仓库 push 后，如果 commit 涉及 `projects/<name>/` 路径的文件变更，ACO 必须把对应独立 GitHub 仓库同步纳入同一任务链，不能只完成主仓库提交就宣布闭环。

- AC1:主仓库 push 后，若 commit 涉及 `projects/<name>/` 路径的文件变更，必须在同一任务链中同步推送到对应独立 GitHub 仓库。
- AC2:独立仓库同步必须使用 `scripts/sync-independent-repos.sh` 脚本执行，禁止手工拼接一次性同步命令替代标准脚本。
- AC3:同步失败必须立即重试或报告失败原因，不得静默跳过，不得把主仓库 push 成功冒充完整发布闭环。
- AC4:L2 插件（如 `aco-closure-guard` 或新建 `aco-repo-sync-guard`）在检测到 git push 成功后，必须自动触发独立仓库同步检查；检查未通过时阻断闭环并注入修复指令。

## FR-K25 禁止越权安排用户行为

OpenClaw（pm-01 子Agent）2026-05-30

- AC1: 主会话禁止对用户说“晚安”“早点休息”“注意休息”“该睡了”，或任何暗示用户应停止工作、去休息的表达。
- AC2: 用户的作息、工作节奏、生活习惯不在 AI 的职责范围内，任何越权关怀均为违规。
- AC3: L2 插件（aco-output-humanizer-guard）必须检测并治理此类输出。

## FR-K26 禁止拖延到“明天”

OpenClaw（pm-01 子Agent）2026-05-30

- AC1: 发现问题、缺口、待办时，必须在当前回合立即解决或派发，禁止说“明天再做”“下次处理”“后续跟进”。
- AC2: 如果当前确实无法完成，例如依赖外部资源，必须说明具体阻塞原因，禁止用“明天”搪塞。
- AC3: L2 插件必须检测主会话输出中的拖延表达并注入纠偏。

## FR-K27 README 与功能对齐检查

OpenClaw（pm-01 子Agent）2026-05-30

- AC1: 健康扫描检查项必须包含“README 描述与代码实际能力是否对齐”。
- AC2: 开发任务闭环时，closure-guard 必须检查是否涉及功能变更；若涉及，则提示更新 README。
- AC3: README 陈旧，包括描述的功能已不存在或新功能未记录，属于健康扫描 FAIL 项。

## FR-K28 任务 Prompt 质量守卫（Task Prompt Quality Guard）

**描述**：dispatch-guard 在派发任务时校验 prompt 质量，阻断不合格 prompt。

**AC1**：prompt 必须包含明确的目标（what）和验收标准，禁止只写模糊意图。

**AC2**：prompt 禁止包含从记忆转述的实现细节（how），应传文件路径引用让子 agent 自行读取。

**AC3**：prompt 禁止包含未经验证的事实性断言，如“文件在 X 路径”但未 ls 确认。

**AC4**：prompt 必须包含产出文件路径要求，明确写到哪里、格式是什么。

**AC5**：dispatch-guard L2 插件在每次 spawn 前校验以上规则，不合格时 BLOCK 并提示修正方向。

**AC6**：校验方式为 LLM 语义判断，禁止关键词匹配；判断 prompt 是否符合 what + why + boundaries + acceptance 结构。

**AC7**：dispatch-guard 必须在每次派发任务构建 prompt 时无条件注入一条统一规则：`给目标，不给路径`。该规则要求主会话只传任务目标、边界、验收标准和必要事实来源，不得把实现步骤、思考路径或代做判断直接塞给子 Agent；即使原始任务 prompt 未主动提及，这条规则也必须出现。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（任务 prompt、插件注入文本、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K20 补充 AC

AC7: Completion 全量调度扫描

- 触发时机：每次 subagent completion event 到达后
- 行为：watchdog 插件自动注入全量调度扫描提醒到主会话 prompt
- 注入内容包含：当前空闲 agent 列表、待办任务列表、冲突域判断指引
- 目的：强制主会话在处理单条 completion 后跳出当前链路，扫描全局并行机会
- 判定逻辑：优先级标签只决定派发顺序，不决定是否等待；唯一阻断条件是文件域冲突或产出依赖

##### FR-K29:L2 引导 + 主 Agent 握手协议

OpenClaw（主会话）2026-06-03

ACO 的核心可控性机制是“主动引导 + 主动握手”，不是把阻断作为主路径。L2 插件负责在每轮向主 Agent 注入清晰、中性的引导提醒，告知当前场景适用的规则、方法和约束；主 Agent 负责在行动前显式确认已评估 ACO 与 SEVO 的引导项，并按适用规则执行。双向协议的语义是：引导是邀请，不是命令；握手是承诺，不是被迫。阻断只作为最后兜底，用于防止明确高风险或已违反规则的动作直达用户、工具或外部系统。

为什么这样设计：Agent 需要理解规则并主动遵守，才能在复杂任务和长上下文中自主进化。围栏式阻断可以降低部分事故，但如果把它当作主路径，会让 Agent 只学会碰壁后改口，无法形成行动前自我评估和自觉遵循的能力。ACO 因此必须优先通过 L2 引导帮助主 Agent 理解当前约束，再由主 Agent 主动握手承诺执行；只有当握手缺失、引导被忽略或动作风险不可接受时，才进入阻断兜底。

- AC1:L2 插件每轮构建主 Agent prompt 时，必须按当前场景注入 Guidance Reminder。提醒内容必须清晰、中性，至少包含适用规则、推荐方法、关键约束和兜底触发条件；禁止用恐吓、责备或只给结论不给原因的措辞。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含 prompt 注入文本、插件配置、审计事件或状态字段之一，缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2:主 Agent 在执行受 ACO 或 SEVO 引导影响的动作前，必须显式完成 Main-Agent Handshake，确认已评估引导项、识别适用规则，并说明下一步会按哪些约束行动。该握手是行动前承诺，不是插件强迫的机械回声。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含主 Agent 输出、工具调用前记录、审计事件或状态字段之一，缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3:主 Agent 必须 100% 接受 ACO 与 SEVO 的 Guidance Reminder。若引导项与用户最新明确指令、客观事实或更高层安全规则冲突，主 Agent 不得忽略引导，而必须先说明冲突、选择更高优先级依据，并把冲突写入审计或任务上下文。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含冲突说明、审计事件、任务上下文或用户确认记录之一，缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4:Guidance Reminder 与 Guard Block 的定位必须在实现、文档和审计字段中明确区分。Guidance Reminder 是主路径，默认目标是让主 Agent 理解并自觉遵循；Guard Block 是最后兜底，只在动作已违反规则、风险不可接受或握手缺失时触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含文档条目、注入文本、block 响应、审计事件或状态字段之一，缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5:每次 Guidance Reminder 注入和 Main-Agent Handshake 必须可观测。审计事件至少记录 timestamp、sessionKey、agentId、guidanceIds、sourceProject(aco / sevo)、handshakeStatus(accepted / conflict / missing)、nextActionSummary 和 fallbackDecision(none / warn / block)。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含审计事件、状态字段或 CLI/API 输出之一，缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6:当 handshakeStatus=missing 且下一步动作会调用工具、派发任务、修改文件、对外发送或改变系统状态时，系统必须先注入纠偏提醒要求主 Agent 补做握手；若主 Agent 仍继续执行，才允许 Guard Block 兜底阻断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含纠偏提醒、block 响应、工具调用记录或审计事件之一，缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7:ACO 的 spec、产品文档、实现说明、注入文本和审计说明必须遵循“Spec 撰写规范”：禁止使用“拦截”字样；描述治理行为时必须使用“引导”“准入校验”“路由”“兜底治理”“风险提示”等非对抗性表述，并保持与“主动引导 + 主动握手”的产品语义一致。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含 spec 文档、注入文本、实现说明或审计说明之一，缺少证据、字段值不符或无法复现均判定为 `fail`。

##### FR-K30:TASKS.md 程序化自动同步

OpenClaw（主会话）2026-06-03

ACO 必须由 L2 插件在任务派发、completion event 和 watchdog 对账时程序化维护 `TASKS.md`，使 `TASKS.md` 成为任务看板 JSON 的用户可读投影，而不是依赖主会话记住手工写入。派发任务时，`aco-closure-guard`、`aco-dispatch-guard` 或等效 L2 插件必须自动新增“进行中”条目；任务进入终态时，插件必须自动把对应条目移入“已完成”或标记失败；watchdog 必须定时对账 `TASKS.md` 与看板 JSON，并修正不一致条目。

为什么这样设计：prompt 提醒依赖主会话记忆和上下文可见性，会话压缩、completion 连续到达或用户插话后容易失效，导致 `TASKS.md` 中已完成任务长期滞留在“进行中”。程序化写入把状态同步下沉到 L2 运行时，确保 `TASKS.md` 始终跟看板 JSON 的客观状态一致，主会话只负责阅读和解释状态，不承担手工维护职责。

- AC1:任一 completion event 到达后 5 秒内，L2 插件必须读取看板 JSON 中对应 taskId、sessionId 或 label 的终态，并把 `TASKS.md` 中对应“进行中”条目自动移入“已完成”或改写为失败/超时/取消状态；验收时以文件 mtime、条目内容和看板 JSON 终态字段作为证据。
- AC2:任一任务派发成功后 5 秒内，L2 插件必须在 `TASKS.md` 自动新增或更新“进行中”条目，条目至少包含 taskId 或 sessionId、label、agentId、派发时间和当前状态；重复派发或重试时必须幂等更新原条目，禁止制造重复进行中记录。
- AC3:watchdog 至少每 60 秒执行一次 `TASKS.md` 与看板 JSON 对账；发现看板已终态但 `TASKS.md` 仍在“进行中”的条目时自动清理或迁移，发现 `TASKS.md` 存在看板中不存在且无终态证据的孤儿条目时标记为“需核查”并写入审计事件。
- AC4:同步逻辑必须以看板 JSON 为状态真相源，以 `TASKS.md` 为用户可读投影；主会话 prompt 注入提醒只能作为补充引导，不得成为唯一同步路径。验收时关闭或缺失 prompt 提醒后，派发与 completion 同步仍必须通过。
- AC5:每次程序化同步必须写入审计事件，至少包含 timestamp、sourceEvent(dispatch / completion / watchdog)、taskId、sessionId、label、previousTasksState、nextTasksState、boardStatus 和 result(success / needs_review / failed)，便于追溯同步依据。

##### FR-K31:Session Context Recovery Per-Turn Injection（每轮上下文恢复注入）

OpenClaw（pm-01 子Agent）2026-06-06

ACO 必须在 main agent 的飞书会话每轮消息进入主会话上下文前，prepend 一段“上下文恢复铁律”规则文本，提醒主会话在发现上文缺失、会话压缩或上下文断裂时，优先读取 session reset 归档文件恢复事实链路。该能力与现有 session reset 后一次性摘要注入共存：一次性摘要负责恢复最近会话事实，每轮规则文本负责让主会话持续记住恢复方法。

为什么这样设计：会话压缩会丢失历史细节，单次摘要注入在长对话中仍可能被稀释。把恢复方法作为每轮 L2 引导注入，可以让主会话在每次行动前都看到“缺上下文先查归档”的操作规则，减少凭记忆下结论和误报。

- AC1:当会话满足 `agentId=main` 且渠道为 `feishu` 时，系统必须在每轮用户消息进入主会话上下文前 prepend 上下文恢复规则文本；验收证据必须包含主会话 prompt 或注入日志中的规则文本。
- AC2:当会话不属于飞书渠道，或目标 Agent 不是 main agent 时，系统不得注入该规则文本；验收证据必须包含非目标会话的 prompt 或注入日志，且其中不存在该规则文本。
- AC3:每轮注入不得依赖去重状态、`globalThis` marker、上次注入时间或 `ageMs` 判断；连续两轮符合条件的 main + feishu 消息都必须看到该规则文本。
- AC4:该能力必须与现有 session reset 后一次性摘要注入共存，二者的触发条件、注入文本和审计记录互不覆盖；同一轮同时命中时，prompt 中必须同时保留一次性摘要和每轮恢复规则。
- AC5:每轮恢复规则注入 handler 的 priority 必须低于一次性摘要注入的 priority 990；当前实现 priority 为 900 时验收通过，后续调整仍需保持低于 990。

##### FR-K32:自愈进化元规则（Self-Healing Governance Evolution）

OpenClaw（pm-01 子Agent）2026-06-06

当用户纠偏、追问 Why、追究 badcase 根因，或指出主会话重复违反同一类规则时，ACO 必须在每轮 L2 引导中提醒主会话主动评估：这个问题的长效解法是否应该创建、修改或强化 L2 插件注入规则、准入校验规则、SEVO 阶段 prompt 或产品 spec。若评估结果为需要固化，主会话必须当场派发对应的 spec 或插件改进任务，不能只写入 memory 或口头承诺下次改。

为什么这样设计：没有这条元规则，系统只能靠用户反复纠偏才能收敛行为；有了它，每次 badcase 都会触发规则层自愈，把一次错误转化为下一轮更强的运行时引导，这是 Self-Evolving Harness 从被动修补走向主动进化的核心机制。

- AC1:每轮 L2 引导文本必须包含自愈进化提醒，触发场景至少覆盖用户纠偏、追问 Why、追究 badcase 根因、重复违反同类规则四类；验收证据必须包含 prompt 注入文本或注入日志。
- AC2:主会话在命中触发场景时，必须输出或记录一条自愈评估结论，字段至少包含 issueSummary、longTermLayer(L2 / SEVO prompt / spec / L0 / no-change)、decision、reason 和 nextAction；验收证据必须包含审计事件、任务上下文或主会话行动记录之一。
- AC3:当 decision 为需要固化时，主会话必须在当前回合派发对应任务；规则缺少 spec 覆盖时先派 PM 修改 spec，已有 spec 覆盖时再派实现任务；验收证据必须包含任务看板中的任务记录、任务 prompt 或 SEVO 流水线记录之一。
- AC4:当 decision 为 no-change 时，主会话必须写明原因，例如该问题属于一次性事实误读、用户临时偏好、已有 L2 规则已覆盖且只是执行失败；验收证据必须包含 reason 字段，禁止空泛写“无需处理”。
- AC5:memory 只能记录历史事实，不能作为规则执行层；命中自愈场景后仅写 memory 而未评估或派发规则固化任务，审计必须判定为 fail。

##### FR-K33:只读调研任务准入边界

OpenClaw（pm-01 子Agent）2026-06-06

ACO 的派发准入校验必须区分“项目产物变更”和“只读调研产出”。只读调研、审计、分析任务允许读取项目代码、配置、日志和文档，并把调研结果写入 workspace 级 `reports/` 目录；这类报告产出不是项目功能、配置或产品文档变更，不应触发研发流水线的 spec-first 准入要求。若任务会修改 `projects/<name>/src/`、`projects/<name>/docs/`、`extensions/`、配置文件、测试文件或发布产物，则仍按对应研发阶段进入流水线。

为什么这样设计：调研报告是事实沉淀和决策输入，不是产品实现本身。把 `workspace/reports/` 写入误判为项目文件变更，会让纯调研任务被错误送入研发流水线，造成排查变慢、角色路由混乱和无意义的 spec 补写。

- AC1:任务类型判定为 research、audit 或 analysis，且写入路径全部位于 `/root/.openclaw/workspace/reports/` 或工作区相对路径 `reports/` 时，准入校验必须将该写入视为只读调研产出，不触发 spec-first 流水线要求；验收证据必须包含任务 label、写入路径、判定结果和审计事件。
- AC2:只读调研任务允许读取 `projects/`、`extensions/`、`docs/`、`logs/` 和配置文件，但不得修改这些路径下的项目源文件、产品文档、测试文件、发布脚本或运行配置；验收时如果 git diff 只包含 `reports/` 新增或修改，判定为只读调研产出。
- AC3:同一任务只要同时修改 `reports/` 之外的项目文件，准入校验必须按实际修改类型重新分类；涉及代码、spec、架构、UX、测试、发布或配置变更时进入对应 SEVO 阶段。
- AC4:审计事件必须记录 `researchOutputOnly=true/false`、`reportPaths[]`、`projectMutations[]` 和 finalDecision；当 `researchOutputOnly=true` 时 finalDecision 不得为 spec_missing_blocked。
- AC5:验证用例必须覆盖三类输入：只写 `reports/foo.md` 的调研任务通过；读代码并写 `reports/foo.md` 的审计任务通过；同时写 `reports/foo.md` 和 `projects/aco/src/index.ts` 的任务按代码变更进入流水线。

##### FR-K34:L2 注入 Why 质量门禁

OpenClaw（cc ACP Agent）2026-06-06

SEVO 审计阶段审查 ACO 及其他 L2 插件的注入文本时，必须逐条校验每条规则的 Why 质量，确保每条规则都说清了「用户当初为什么定这条规则」，而不是把技术后果翻译一遍当 Why。Why 缺失或质量不达标时审计判定为 FAIL，触发修复闭环，由开发 Agent 重写 Why 直到审计通过。

为什么这样设计：系统已有「规则必须含 Why」的要求，但没有机制保证 Why 的质量。实践中补出来的 Why 常常是技术后果的直接翻译，比如「不这样做会导致 X 报错」，没有还原用户当初定这条规则时的真实意图。LLM 看不懂规则背后的意图，就只能机械匹配关键词，遇到边界 case 时仍会绕过或误判。把 Why 质量做成审计门禁，是逼迫每条规则把意图写清楚，让 LLM 能在新场景下按原意泛化，而不是靠碰壁后改口。

- AC1:每条 L2 注入规则必须附带 Why 段落，缺失即判定为 FAIL；验收证据必须包含被审查的注入文本路径、规则定位和缺失判定的审计记录。
- AC2:Why 必须用人话写清「用户当初为什么定这条规则」，回答规则背后的真实意图；只写技术后果描述（如「不这样做会报错」「会导致流程中断」）或用内部术语堆砌而读不懂的，判定为 FAIL；验收证据必须包含 Why 原文、判定结论和判定理由。
- AC3:Why 质量判定必须用 LLM 语义理解，禁止通过关键词命中或正则匹配判定是否含 Why、Why 是否人话、Why 是否还原意图；验收证据必须包含判定调用的语义判断输出或审计事件中的 semantic 字段。
- AC4:审计判定 FAIL 后必须触发 review-fix loop，由开发 Agent 重写对应规则的 Why，重写后重新进入审计，直到全部规则的 Why 通过；验收证据必须包含修复任务记录、重审记录和最终通过状态之一。

