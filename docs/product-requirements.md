# SEVO（自动化研发流水线）- 产品需求规格说明书

OpenClaw（pm-01 子Agent）| 2026-06-01

## 场景

SEVO 面向的是把 Agent 当研发主力的人。他们不是缺一个会写代码的模型，而是缺一条从需求、方案、实现、审计、回归、发布到交付留痕都能自动闭环的研发流水线。用户希望在 OpenClaw 环境里，用一套统一流程推进受管项目研发，随时看清这轮改动在做什么、为什么做、做到什么算完成、发现问题卡在了哪里。

这个产品最常出现的使用场景有四类：第一，独立产品操盘者在一个人带着 Agent 做产品迭代，希望既快又稳；第二，Agent 原生开发者需要把 spec、contract、implement、review 串成一条受控链路，减少“写完就算完”的假完成；第三，质量与架构把关者需要在统一工件链里快速判断哪里通过、哪里缺口、哪里该返工；第四，OpenClaw 环境管理者需要通过配置而不是改代码，管理 Agent 池、模型、通知渠道和发布目标。

SEVO 还承担一个更高的终局任务：把“代码能生成”升级成“陌生用户装上就能用”。所以它不是做一遍流程就结束，而是围绕终局用户体验持续收敛，直到真实交付结果达标。

## 人群

### Solo Founder / 独立产品操盘者

- 用 Agent 推进产品、技能、自动化系统的研发。
- 关心交付速度，也关心返工成本和线上事故。
- 需要看到每一轮改动的目标、边界、验收标准和交付证据。
- 上手路径：`npm install -g sevo-pipeline && npx sevo init && sevo project create my-app`，5 分钟内看到第一条 pipeline 的 Spec 阶段产出。

### Agent 原生开发者

- 把 AI 作为主要编码和调试执行者。
- 需要一条能约束 Agent 的研发流程，减少“写完就算完”的假完成。
- 需要把 Spec、Design、Implement、Review 串起来，避免需求和代码脱节。
- 上手路径：`npx sevo init` 自动发现已有 Agent 并分配角色，`sevo fr add <project> "需求描述"` 后 pipeline 自动推进，开发者只需响应阶段任务。

### 质量与架构把关者

- 负责审计需求、架构、代码质量和交付完整性。
- 需要独立视角和统一工件链路，快速判断是否通过、卡在哪里、缺什么。
- 需要把经验沉淀回系统，而不是散落在聊天记录里。
- 上手路径：`sevo status` 查看所有 pipeline 状态，评审阶段自动派发审查任务，审查结论写入结构化工件。

### OpenClaw 环境管理者

- 负责配置和管理 OpenClaw 环境中的 Agent 池、模型、通知渠道等基础设施。
- 需要 SEVO 的流程能力与具体 Agent/模型/通知实现解耦，便于按需替换执行器、审计器、发布渠道。
- 需要通过配置而非改代码来适配不同的 Agent 池规模和模型组合。
- 上手路径：`npm install -g sevo-pipeline`，`npx sevo init` 自动发现 OpenClaw 环境配置，核心阶段语义开箱可用。

## 用户故事旅程

### Stage 1：安装并进入第一条流水线

- 触发条件：用户第一次接触 SEVO，希望在 OpenClaw 中把一个项目纳入受控研发流程。
- 核心动作：安装 `sevo-pipeline`，执行 `npx sevo init`，让系统自动检测环境、注册插件、发现 Agent、完成角色分配。
- 阶段产出：一个可用的 SEVO 运行环境，以及明确的下一步入口。
- 转换条件：环境初始化完成，用户可以创建 Project 并提交第一条 FR。

### Stage 2：创建 Project 并提交 FR

- 触发条件：环境就绪，用户准备把一个具体研发目标交给流水线推进。
- 核心动作：创建 Project，补充名称与描述，添加第一条 FR，让系统生成或挂接对应的 FR 流程实例。
- 阶段产出：目标 Project、FR 流程实例、路由结果和阶段队列。
- 转换条件：实例创建完成，流水线自动进入 Spec 阶段准备态。

### Stage 3：沿阶段推进并通过质量检查

- 触发条件：FR 流程实例已建立。
- 核心动作：系统按单一阶段队列推进 Spec、Spec Review Advisory Check、Plan（架构评估 + UX 设计）、Design Review Advisory Check、Implement、Implement Review Advisory Check，并继续进入 Regression、Deploy、Verify、Ledger 等后续阶段；涉及 Web/UI 的任务自动接入 UX Interaction Design，涉及复杂前后端协作的任务自动接入 Architecture Design。
- 阶段产出：每一阶段的结构化工件、advisory 结论、修复任务和推进记录。
- 转换条件：当前阶段通过质量检查则进入下一阶段；repair-required advisory则进入修复循环。

### Stage 4：发布并做终局验证

- 触发条件：实现、审计与回归都已通过。
- 核心动作：系统自动推进 README 同步、版本整理、发布制品生成、npm / GitHub / ClawHub 发布、发布后差距扫描、清洁环境验收和 Ledger 留痕。
- 阶段产出：真实可交付的发布结果、终局差距报告、交付账本和经验沉淀。
- 转换条件：所有关键 FR 和 KR 达标，陌生用户可安装、可运行、可得到有意义产出，流水线闭环完成。

## 痛点

### 4.1 只验代码不验能力

凌晨 1 点，独立产品操盘者让 Agent 修完一个发布前记录 advisory 并触发修复问题。CI 显示编译通过、单元测试全绿，聊天里也写着“已完成”。第二天他按陌生用户路径从 `npx sevo init` 开始验证，才发现 CLI 能启动但没有生成可用 Project，Web 驾驶舱显示的是空状态，发布包没有产出任何可交付证据。代码检查过了，用户真正依赖的能力没有被验证。

### 4.2 流水线死板不灵活

晚上 11 点，Agent 原生开发者只想从 Review 后直接补一次 Smoke Test 和发布前验证，因为 spec、架构和实现都已经在上一轮通过。传统固定流水线要求从第一个阶段重新排队，PM、SA、开发、审计按顺序再跑一遍；紧急修复被迫由主 Agent 跟进无关阶段完成，用户只能在交付窗口里手工绕流程，绕完又失去质量检查记录。

### 4.3 需求与交付脱节

周一早上，质量把关者要判断“新增 FR 是否已经交付”。他打开 spec 看到 AC 写着“陌生用户 5 分钟内完成初始化并看到真实流水线状态”，再去看 PR、测试报告、README 和发布记录，却找不到同一条 AC 对应的实现、审计证据、运行截图和 Ledger Entry。每个环节都像做过了，串不成从 Spec 到 Evidence 的追溯链，最后只能靠人逐段翻文件猜测是否满足需求。

## 需求

- 所有受管项目的研发动作都要默认进入 SEVO，覆盖 spec、架构、UX、开发、测试、审计、发布全链路，路径只能辅助识别项目归属，不能决定是否纳管。
- 流水线只有一条完整路径，不按任务类型分级；该补 spec 的先补 spec，该做审计的必须有独立审计，该做发布前验证的必须真做。主链节点永远不可标记为不适用并留证，辅助节点只有在输入不适用、项目配置明确声明且留下证据时才可标记为 not-applicable-with-evidence。
- 单 Agent 用户也要能开箱即用，多 Agent 环境则要自动利用角色分工，把 PM、UX、架构、审计等专业标准注入到对应阶段。
- 每一轮研发都要形成完整证据链，能回答这条 FR 现在走到哪、为什么卡住、通过依据是什么、有没有真实交付结果。
- 发布完成不算结束，必须继续验证：陌生用户能不能装、能不能跑、能不能看到真实数据、能不能在 5 分钟内感受到核心价值。

## 解决方案

### 产品定位（产品概念）

SEVO 是面向把 Agent 当研发主力的用户的 Spec-to-Runtime 证据流水线。它通过一条从 Spec 读取 FR/AC、把研发过程组织成可推进/进入 repairing 并继续推进/修复/追溯的状态机质量检查、运行真实 CLI/Web/Library/Hook/Plugin 检查、用结构化规则与 LLM 判定运行输出是否满足验收条件、并将证据沉淀为 Ledger 的受控链路，解决需求、设计、实现、审计、回归、发布与终局验证彼此脱节、"模型说完成却无人证明真的满足验收"的关键断点，让 Agent 系统获得把验收变成运行时事实、带质量检查与证据链的研发交付能力。SEVO 常被误解为让代码生成更快的 AI Coding 工具或一个 prompt loop；它的核心价值是用运行证据和独立审计兜住产出质量，把"完成"约束为可复查的运行事实。

### 需求范围

- SEVO 负责一次研发任务从 Spec 到 Ledger 的全链路推进与交付闭环，包括阶段状态机与质量检查推进、运行时证据采集与验收判定、repair-required advisory后的自动修复与复验、终局可用性验证与账本沉淀。
- SEVO 可以与 KIVO、AEO、Claw Design、OpenClaw 协同：消费 KIVO 的知识与规则、向 AEO 输出阶段事件、为 Claw Design 等被研发产品提供流水线，但不负责知识资产治理、效果度量与运行时基础设施本身。
- 当任务进入知识治理、效果漂移诊断或 Agent 运行时调度时，应交由 KIVO、AEO、OpenClaw 继续处理。

### 非范围声明

SEVO 不负责知识资产的提取、检索与治理，不负责 Agent 效果的度量与漂移诊断，不负责 Agent 运行时的工具接入与调度，这些分别交给 KIVO、AEO 与 OpenClaw。SEVO 的边界是：把一次研发任务按质量检查走完并留下可复查的运行证据。SEVO 只负责研发流水线环节的闭环，同时向其他模块输出结构化的 Ledger Entry、Finding 与阶段事件。

### 核心对象与状态流转

SEVO 管理六类核心对象：Project 是研发对象，承载产品目标、代码路径、配置和发布目标；Pipeline 是一次围绕 Project 与 FR 触发的研发闭环，记录从 Spec 到 Ledger 的完整执行链；Stage 是 Pipeline 中的主链阶段，如 specify、spec-review、design、design-review、implement、code-review、smoke、publish、post-release-verify、ledger；Task 是某个 Stage 下派给具体角色或 Agent 的执行单元；Finding 是质量检查、审计、验证或发布检查发现的问题；Advisory 是 Finding 对主线推进的风险提示；Ledger Entry 是 Pipeline 完成或阶段关键节点形成的不可丢失记录。

状态流转从 Project 被纳管开始：用户提交 FR 后创建 Pipeline，Pipeline 生成完整 Stage 队列；每个 Stage 进入 pending、running、repairing、passed、completed、cancelled 中的一种非进入 repairing 并继续推进推进状态；Stage 运行时创建 Task，Task 完成后产出工件、Finding 或 Advisory；Finding 未关闭时对应 Stage 标记为 repairing，自动创建修复 Task，并继续生成下一步 advance prompt；修复 Task 通过后回到责任 Stage 复验；所有 Finding 的处理记录都会写入 Ledger，后续 Pipeline 可读取这些记录作为经验与约束输入。

### 核心设计原则

#### 原则 1：任意入口全自动走到终局

从任何入口进入 SEVO，都要自动推进到最终验收，不需要人每一步盯着催。无论用户从 create、implement、review、fix 还是 from 入口进入，系统都要判断哪些前置阶段已经满足、哪些后续阶段还没完成，并持续推进到 implement、review、smoke、regression、deploy、verify、readme、publish 等终局链路全部有结论。Why：如果入口只处理眼前一步，Agent 很容易“修完就停”或“审完就停”，用户看到的是局部完成，实际交付没有闭环。

#### 原则 2：任意入口先核实 Spec

从任何入口开始，第一步都先确认 Spec 存在，而且已经覆盖当前任务的 FR、AC、边界和用户视角验收。Spec 覆盖足够，才进入 Design、Implement、Review 等后续阶段；发现当前问题暴露了 Spec 缺口，就先补齐或修正 Spec，再继续推进。Why：Spec 是后续设计、实现、审计的共同基准；不先核实 Spec，后面的代码和审计就会各说各话，最终无法证明产出满足用户原始需求。

#### 原则 3：一致性闭环校验

每个阶段的产出都必须和 Spec 对齐，并在审计发现问题后形成 review → fix loop 闭环。系统要持续检查 Spec 内部的人群、痛点、体验流、FR、AC 是否自洽，也要检查 Spec、UX、架构、实现、审计、README 和交付证据是否说的是同一件事；任何一层不一致，都要回到对应阶段修正并复验。Why：阶段串起来不等于质量闭环；只有每次偏差都能被发现、修复、再验证，流水线才不会把错误一路带到发布。

#### 原则 4：主动需求澄清

任何任务执行前，只要存在歧义、多义、范围不明确或目标不清晰，Agent 就要先澄清，再行动；只有任务已经极其清晰、几乎零歧义时，才可以直接推进。用户明确说“拍了”“可以了”“就这样”或给出等价确认后，才算澄清收敛。Why：Agent 如果带着猜测写 Spec、派开发或做运维，会把一开始的小误解放大成整条流水线返工；先澄清能把不确定性留在成本最低的入口处解决。

#### 原则 5：卡好准入和准出

流水线每个阶段的设计重心是准入条件和准出标准，而不是中间过程的微管理。准入检查输入是否满足前提（如 spec 是否存在、澄清是否收敛、前置阶段是否通过），准出检查产出是否满足质量标准（如 AC 覆盖率、审计通过、import 无报错）。中间过程交给 Agent 自主决策。

spec 的 FR/AC 本质上也在定义准入和准出：FR 定义“做什么才算进入了这个能力的范围”，AC 定义“什么状态算做完了”。设计 FR 时始终围绕这两个界面思考，而不是描述中间步骤。

Why：准入和准出是 AI 与人的关键交互界面。人不可能盯着 Agent 的每一步，但可以在入口和出口做校验。卡住这两个点，中间无论 Agent 怎么走，最终质量都可控。过程微管理既不可行（Agent 有自主决策能力），也不必要（只要出口质量达标，路径差异不重要）。

#### 原则 6：流水线永远向前走

SEVO 的状态不得以问题存在作为终态。所有检查、评审、验证、发布异常、Spec 缺口和角色不匹配，都只能产出 advisory、finding、repair task、spec-patch task、trace event 和下一步 advance prompt。主线必须继续向终局推进；需要修复时，下一步建议指向修复和复验，审计阶段引用未关闭 advisory 做兜底。Why：一旦检查逻辑拥有让流程停在局部完成的权力，SEVO 就会退回旧式 gatekeeper，用户还要靠记忆和人工催促恢复流程，任意入口走到终局就会失效。

#### 原则 7：产品定位 A2A 桥梁

SEVO 是主 Agent 和子 Agent 之间的研发质量桥梁，不是替主 Agent 决策或派发的调度器。它通过 label、advance prompt、advisory、finding 和 trace record 告诉主 Agent 下一棒应该怎么交、风险在哪里、审计要看什么；主 Agent 负责补充实时上下文、选择执行者、派发任务和面向用户沟通。SEVO 不要求 JSON trace record、不要求主 Agent 选择 pipelineId、不要求结构化协议回应。Why：主 Agent 才有用户最新意图和现场上下文；SEVO 越权派发或由主 Agent 跟进握手，都会让流水线变成黑箱。

#### 原则 8：注入文本三要素

每段插件层注入到主会话 prompt 的规则或引导文本，必须同时包含三个要素：目标（遵循这条规则要达成什么）、做什么（具体行动指令）、Why（不做会怎样、用户当初为什么定这条规则）。缺任一要素，注入文本质量不达标，审计应判定为 FAIL 并触发修复。Why：只有操作指令、没有目标和理由的提示，模型看完后缺乏执行动力，容易无视。2026-06-07 已验证 badcase：SEVO 路由提示只有“做什么”，主会话连续 4 次裸 spawn，未按 SEVO 引导进入流水线；补齐三要素后遵循率显著提升。

#### 原则 9：无差别覆盖一切研发活动

不允许“受管项目”这个概念。SEVO 流水线对一切研发活动都有效，包括需求探讨、需求澄清、spec 讨论、架构设计、编码、测试、审计、发布，不限于“产生文件变更”的环节。代码中的路径列表仅用于自动触发检测，不限制流水线的适用范围。Why：用户已多次纠偏，2026-06-07 明确要求加入 spec，原话：“不允许受管项目这个概念，SEVO流水线对一切研发活动都有效”“是一切研发活动，不是文件变更！主动探讨需求澄清需求也是SEVO的职责！”。“受管项目”概念和“仅文件变更”的限定都会误导主会话认为某些研发活动可以不走流水线，导致需求探讨阶段未接入 SEVO、spec 质量失控。

#### 原则 10：阶段审计不可标记为不适用并留证（Stage Audit Mandatory）

任何研发活动进入 SEVO 后，阶段队列固定执行：specify（PM 出 spec）→ spec-review-gate（mandatory, never not-applicable）→ plan（SA 架构评估 + UX 设计，可并行）→ design-review（mandatory, never not-applicable；架构审计 + UX 审计）→ implement（Dev 开发）→ implement-review-gate（mandatory, never not-applicable；开发审计）→ 后续 endgame。每个产出阶段（specify/plan/implement）后面都必须跟独立审计质量检查；审计结论决定下一步 advance prompt 是进入后续阶段，还是指向修复/复验。没有任何主链阶段可以被移除，包括 plan 阶段。SA 评估结论可以是“无需架构变更，pass-no-change”，但 SA 必须评估，阶段不能跳。Why：主会话或 PM 没有资格判断“不需要架构”或“不需要审计”。每个专业判断必须由对应专业角色做出。跳过审计就是跳过质量检查，会让低质量产出直接流入下游。

#### 原则 12：全阶段无条件存在

SEVO 只有一条完整阶段链，不存在“精简版”“轻量版”“快速版”，也不存在按 tier、任务规模、成本或入口类型裁剪阶段的模式。所有主链阶段无条件存在于每条流水线中，包括 specify、spec-review-gate、plan、design-review、implement、implement-review-gate 和后续 endgame 阶段。阶段是否需要深入执行，由该阶段内的专业 Agent 在准出时自行判断；例如架构阶段可以给出“无需架构变更，pass-no-change”，但阶段本身必须进入并留下评估记录。

外部分类器、正则、关键词规则或 LLM 不得判断“要不要走某个主链阶段”，只能判断入口、项目归属、当前阶段状态和该阶段需要的输入是否齐备。任何路由结果都必须输出单一完整阶段队列，不得输出快慢分档、规模参数或主链标记为不适用并留证建议。Why：外部标记为不适用并留证判断会引入分类器复杂度和漏网风险；阶段内 Agent 自判准出能做到零漏网，简单任务的成本由秒级出具通过 advisory吸收。

#### 原则 11：流水线强路由提示 + 主 Agent 强配合

SEVO 插件绝对不能自己 spawn agent，也不能绕过主会话派发阶段任务。SEVO 的职责边界是判断当前流水线阶段是否可以推进，并生成 advance prompt；advance prompt 必须包含目标阶段、推荐角色或 agent、建议 timeout、建议 label、阶段输入、准入条件、准出标准和advisory 原因。主 Agent 收到 advance prompt 后，负责补充实时上下文，再派发对应 Agent；实时上下文包括用户最新纠偏、需求变更、跨任务关联、当前会话里的判断、正在运行任务的状态和用户观测窗口里刚发生的变化。SEVO 所有阶段推进逻辑的产出都是给主 Agent 的 advance prompt，不是自行执行的动作；只要状态机判断下一步应该做某阶段，就无条件提醒主 Agent，不包含“标记为不适用并留证建议”的条件判断。

Why：SEVO 没有主会话拥有的实时上下文。若 SEVO 自己派任务，子任务很容易缺失关键背景；中途需求背景变化时，主 Agent 插不上话，用户也看不到和纠偏不了，流水线会变成失控黑箱。主 Agent 是唯一能把用户最新意图注入下一节点的人，也是用户观测、纠偏和授权的唯一窗口。

职责划分：SEVO 负责阶段状态机、质量检查判断、推进提示和可审计记录；主 Agent 负责读取提示、补充实时上下文、选择实际执行者、派发任务、接收 completion、把结果回填给 SEVO。SEVO 给出“下一步应该怎么走”的结构化提示，主 Agent 完成“把这一棒带着最新背景交给下一个人”。

边界：这是 SEVO 的长期架构约束，不是临时妥协。未来即使技术上可以让 SEVO 自动派任务，也不得改成插件自派发模式，除非用户明确授权变更这个原则。

### 用户体验流

1. 用户安装 `sevo-pipeline` 并执行 `npx sevo init`；AI 自动完成环境检测、插件注册、角色发现和默认配置生成；用户看到一份初始化报告，包含环境检查结果、已发现的项目、已识别的 Agent 角色、缺失配置和下一条可复制命令。成功时报告末尾显示 `Ready: create a project or run sevo status`；发现问题时列出repair-required advisory 项、修复建议和可重试命令。关联 FR-14。
1. 用户创建 Project 并添加第一条 FR；AI 创建 FR 流程实例、初始化目录结构、给出单一阶段队列；用户看到 Project 编号、FR 编号、当前进入的 Stage、预计要经过的质量检查列表，以及“当前不需要人工盯盘”的提示。关联 FR-12、FR-13、FR-27。
1. 用户查看当前 pipeline 状态；AI 明确告诉用户现在走到哪个阶段、卡在哪里、下一步是什么；用户在 `sevo status` 中看到按 Project 分组的状态摘要，例如：`sevo / FR-37 / Review / repairing: audit finding F-12 / next: fix assigned`。通过项显示证据路径，repair-required advisory 项显示责任阶段、问题原因、正在执行的修复任务和最近更新时间。关联 FR-13、FR-14。
1. 用户推进 spec、contract、implement、review 等研发动作；AI 自动按阶段注入 PM、UX、架构、审计等专业标准，并在 advisory 为 repair-required 时生成修复任务；用户看到每个 Stage 的advisory 结论、关键 Finding、修复任务和重试次数。`sevo:doctor` 跑完后输出结构化报告：Errors、Warnings、受影响项目、repair-required 质量检查、建议修复动作；Errors 大于 0 时报告明确提示“禁止继续推进或重启 Advisoryway”。关联 FR-01、FR-02、FR-03、FR-04、FR-05、FR-06、FR-06a、FR-06f。
1. 用户进入发布链；AI 自动串起 README 同步、版本管理、通用化质量检查、发布分流、真实数据验证、清洁环境验证和终局差距扫描；用户看到通用化检查、npm、GitHub、ClawHub、独立仓库同步、真实数据验证、清洁环境验收的逐项结果。发现问题时报告显示发现问题阶段、问题目标、问题原因、可复验入口和已创建的修复任务。关联 FR-08、FR-17、FR-19、FR-28、FR-29、FR-36、FR-48、FR-49。
1. 用户完成一轮交付后回看结果；AI 把所有关键工件、结论、责任边界和经验沉淀写入 Ledger，供后续 pipeline 复用；用户看到一条可追溯的交付账本，包含 Project、FR、Pipeline、Stage 结果、Finding 处理记录、发布证据和复用经验。Ledger 支持按项目、FR、阶段、问题原因检索。关联 FR-10、FR-18。

### 功能需求

### FR-01 Spec

- **输入**：用户目标、业务背景、已有约束、历史参考材料。
- **处理**：明确问题、目标用户、范围、FR、NFR、概念架构和验收标准。Spec 产出阶段必须先完成四个用户层独立章节（用户人群、痛点、原始需求、用户体验流），再展开功能需求；缺任一章记录 advisory 后继续进入 Spec Review Advisory Check。
- **输出**：需求规格包（Spec Package）。
- **执行阶段**：Spec。
- **审查阶段**：Spec Review Advisory Check（独立评审）。
- **验收标准**：
  - AC-4.1：规格书能说清做什么、给谁做、做到什么程度算完成。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.2：每个核心功能都有验收标准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.3：概念架构覆盖对象类型、状态流转和阶段间数据流。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.4：规格书不写具体技术选型和实现细节。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.4a：Spec 产出时必须先写四个用户层独立章节（用户人群、痛点、原始需求、用户体验流），且必须位于「功能需求」章节之前。任一章节缺失或仅有空标题，本 FR 记录为 repair-required advisory，自动创建 spec-patch task，并进入 Spec Review Advisory Check 作为审计输入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.4b：四个用户层章节必须有实质内容——用户人群描述具体到使用人群、典型场景、设备形态；痛点描述用户当前如何解决该问题、卡点在哪；原始需求用用户口语描述要什么；用户体验流给出从入口到产出的完整操作步骤。占位符、TODO、单句概述均判定为未完成。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.4c：FR 章节中的每个 FR 必须能追溯到上述四章中至少一条用户人群、痛点或体验流条目；找不到追溯关系的 FR 视为伪需求，由 PM 删除或回到四章补齐再产 FR。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02-pre Mandatory Spec Sections Advisory

- **输入**：需求规格包（Spec Package）的 markdown 源文件。
- **处理**：Spec Review Advisory Check（FR-02）启动前的前置 advisory 检查。先检查四个用户层独立章节的存在、顺序和语义质量，再检查每条 FR 是否包含用户视角验证准则。该advisory 检查先于产品、技术、质量、体验四维评审执行。
- **输出**：Spec Coverage Advisory 报告，包含章节存在性、章节起止行号、语义判定结论、repair-required advisory 缺口描述、FR 验证准则缺口清单、自动创建的 spec-patch task 和主线下一步 advance prompt。
- **执行阶段**：Spec Review Advisory Check 的前置 advisory 检查。本检查发现 repair-required advisory 时，自动创建 PM spec-patch task，并与产品、技术、质量、体验四维评审并行推进。
- **通过标准**：四章存在、顺序正确、内容语义合格、每条 FR 具备用户视角验证准则且语义判定通过。任一项 repair-required advisory 都必须记录缺口、创建 spec-patch task，并传递给后续评审和审计兜底。advisory 执行细则、角色约束和审计流程规则见本文末尾「治理规范」。
- **验收标准**：
  - AC-4.4d：spec-review-gate 收到 spec 时，第一步必须生成 Spec Coverage Advisory；该 advisory 发现缺口时，必须创建 spec-patch task，并与产品/技术/质量/体验四维评审并行推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.4e：Pre-Advisory 报告必须明确列出四章检查结论、FR 验证准则检查结论、repair-required advisory 原因、spec-patch task 和后续审计兜底输入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.4f：Pre-Advisory 结果必须被 FR-02 消费并进入 Ledger/Review 输入；若存在缺口，必须自动创建 PM 补齐任务，与主线并行推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02 Spec Review Advisory Check

- **输入**：需求规格包（Spec Package）、FR-02-pre 产出的 Spec Coverage Advisory、路由结果、适用规则。
- **处理**：先消费 FR-02-pre 输出的 Mandatory Spec Sections Advisory 报告作为前置 advisory 结果；随后由多维度独立评审检查规格质量，并给出通过、advisory、repair-required advisory 三档结论。评审维度：
  - 产品维度：spec 是否解决了用户真正的问题、需求是否完整、用户人群和痛点是否清晰。
  - 技术维度：spec 描述的功能是否技术可行、是否存在技术风险或不可实现的描述。
  - 体验维度（有 Web/UI 时）：spec 描述的交互是否合理、用户体验流是否完整、是否符合小白用户预期。纯后端/CLI 项目可标记为不适用并留证。
  - 质量维度：规格完整性、阶段隔离、概念架构完整度、边界清晰度、验收标准质量。
- **输出**：规格评审包（Spec Review Bundle），顶部引用 Pre-Advisory 结论，包含各维度结论、问题清单、修复要求、缺口严重度、建议修复阶段、自动创建的补齐任务和主线下一步 advance prompt。
- **执行阶段**：Spec Review Advisory Check（mandatory, never not-applicable）。先执行 FR-02-pre Mandatory Spec Sections Advisory；Pre-Advisory 通过后，再并行执行产品维度、技术维度、体验维度（可选）、质量维度评审。禁止规格作者自审。任何入口、增量 FR 或从中途阶段重入，只要涉及本轮 spec 覆盖确认，都必须经过本质量检查；spec 阶段可标记 ready，但 spec-review-gate 不可标记为不适用并留证。
- **advisory 判定**：各维度共同出具 advisory verdict。Pre-Advisory 或任一维度出现 advisory / repair-required advisory 时，系统记录 finding、创建 spec-patch 或 repair task，并把未关闭 advisory 传递给后续审计；主线继续生成下一步 advance prompt。纯后端/CLI 项目可按项目配置标记为不适用并留证体验维度，但 Spec Review Advisory Check 本身必须执行并留证。
- **验收标准**：
  - AC-4.5：Spec 进入 Design 前必须先经过独立评审，默认禁止规格作者自审。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.5a：Spec Review Advisory Check 至少覆盖产品、技术、质量三个维度；涉及 Web/UI 的任务必须增加体验维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.5b：任一维度结论为 advisory 或 repair-required advisory 时，质量检查必须记录 finding、创建对应修复任务，并把该 advisory 传递给后续审计兜底。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.6：评审结果至少区分通过、advisory、repair-required advisory三档，并显式记录记录 advisory 并触发修复问题。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.7：advisory 和 repair-required advisory 必须转化为 finding、修复任务和复审要求；Design 阶段继续推进，并在后续审计中引用未关闭 advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8：评审结论必须指向具体规格内容、缺口或越界点，不得只给抽象评价。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.9：Spec 必须包含四个独立章节，缺任一个即判定为“repair-required advisory”： 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
    1. 用户人群（谁用、什么场景、什么设备）
    1. 痛点（用户现在怎么解决这个问题、哪里痛）
    1. 原始需求（用户要什么，用人话说）
    1. 用户体验流（完整的用户操作步骤，从打开到完成）
  - AC-4.9a：四章节必须位于「功能需求」之前，不得散落在 FR 内部或附录中。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.9b：四章存在性、顺序、内容语义判定三项检查由 FR-02-pre Mandatory Spec Sections Advisory 执行；本质量检查必须在评审包顶部引用 Pre-Advisory 报告，并把 Pre-Advisory advisory 作为主体评审和后续审计输入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.9c：四章内容必须由 LLM 做语义质量判定，禁止用关键词匹配或字数阈值伪装语义理解。语义判定的最低标准：用户人群说清「谁、什么场景、什么设备」；痛点说清「现在怎么解决、哪里痛」；原始需求用用户口语写明「要什么」；用户体验流写明「从入口到产出的完整步骤」。任一章语义不达标判定为「repair-required advisory」。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.9d：Pre-Advisory 任一项 repair-required advisory 时，系统创建 PM spec-patch task，评审包记录缺口和风险；产品/技术/质量/体验维度仍继续执行，修复完成后自动触发 Pre-Advisory 与主体评审复验。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.9e：FR 章节中的每个 FR 必须能在四章中找到至少一条来源（用户人群、痛点或体验流条目）。找不到来源的 FR，spec-review-gate 产品维度判定为「repair-required advisory」并标注「孤立 FR」。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02a Test Case Authoring

- **触发时机**：Spec Review Advisory Check（FR-02）通过后，与 Design（FR-03）并行启动。
- **输入**：已通过 Spec Review Advisory Check 的需求规格包。
- **处理**：基于需求规格中的验收标准（AC）编写测试用例，产出独立的测试用例文档。
- **输出**：测试用例文档（独立交付物）。
- **执行阶段**：Test Case Authoring。
- **并行关系**：与 FR-03 Design 并行执行，不互相进入 repairing 并继续推进。
- **验收标准**：
  - AC-4.8a：每个高优先级 FR 的验收标准至少有一条对应测试用例。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8b：测试用例作为独立文档交付，不写入需求规格或契约包。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8c：初期允许极简形态，后期可专项优化扩展。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02b UX Acceptance Authoring

- **触发时机**：Spec Review Advisory Check（FR-02）通过后，与 Design（FR-03）、Test Case Authoring（FR-02a）并行启动。
- **输入**：已通过 Spec Review Advisory Check 的需求规格包。
- **处理**：由 UX 角色（ux-01）编写「用户开箱即用视角」评测用例——模拟陌生用户首次使用的完整旅程，产出 markdown 检查清单（非代码测试）。
- **输出**：UX 开箱即用评测检查清单（独立交付物，存放于项目 docs/ 下）。
- **执行阶段**：UX Acceptance Authoring。
- **角色约束**：仅 UX 角色可执行，禁止开发者或产品角色代写。
- **并行关系**：与 FR-02a Test Case Authoring、FR-03 Design 并行执行，不互相进入 repairing 并继续推进。
- **验收标准**：
  - AC-4.8d：检查清单覆盖零配置安装、首次运行、核心功能体验、错误提示友好度、文档可读性五个维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8e：检查清单作为独立 markdown 文档交付，不写入需求规格或契约包。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8f：检查清单中每个检查项有明确的通过/发现问题判定标准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8g：产出工件记录 authorRole 为 ux，可追溯到执行角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02c Commercial Acceptance Authoring

- **触发时机**：Spec Review Advisory Check（FR-02）通过后，与 Design（FR-03）、Test Case Authoring（FR-02a）、UX Acceptance Authoring（FR-02b）并行启动。
- **输入**：已通过 Spec Review Advisory Check 的需求规格包。
- **处理**：由 PM 角色（pm-01）编写「商用视角」评测用例——验证商用就绪标准，产出 markdown 检查清单（非代码测试）。
- **输出**：商用评测检查清单（独立交付物，存放于项目 docs/ 下）。
- **执行阶段**：Commercial Acceptance Authoring。
- **角色约束**：仅 Product 角色可执行，禁止开发者或 UX 角色代写。
- **并行关系**：与 FR-02a、FR-02b、FR-03 并行执行，不互相进入 repairing 并继续推进。
- **验收标准**：
  - AC-4.8h：检查清单覆盖 npm 包完整性、README 营销质量、依赖安全、许可证合规、发布三平台覆盖、版本号一致性六个维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8i：检查清单作为独立 markdown 文档交付，不写入需求规格或契约包。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8j：检查清单中每个检查项有明确的通过/发现问题判定标准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8k：产出工件记录 authorRole 为 product，可追溯到执行角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02d UX Interaction Design

- **触发条件**：任务涉及 Web 页面、用户交互界面、导航结构变更时触发；纯后端/CLI/SDK 不触发。由路由阶段自动判定。
- **触发时机**：Spec Review Advisory Check（FR-02）通过后，与 Design（FR-03）、Test Case Authoring（FR-02a）、UX Acceptance Authoring（FR-02b）、Commercial Acceptance Authoring（FR-02c）并行启动。
- **输入**：已通过 Spec Review Advisory Check 的需求规格包。
- **处理**：由 UX 角色站在小白用户视角设计页面交互方案——页面布局、导航结构、操作流程、状态流转、信息层级。
- **输出**：UX 交互设计文档（存放于项目 docs/ux/ 下）。
- **执行阶段**：UX Interaction Design。
- **角色约束**：仅 UX 角色可执行，禁止开发者或产品角色代执行。
- **并行关系**：与 FR-02a、FR-02b、FR-02c、FR-03、FR-02e 并行执行，不互相进入 repairing 并继续推进。
- **完成后流向**：UX 交互设计完成后，由 PM 角色评审设计方案（评审维度：设计是否解决了 spec 定义的用户问题、操作流程是否完整、是否遗漏关键场景）。PM 评审通过后，UX 设计文档作为 Design Review Advisory Check（FR-04）和 Implement（FR-05）的输入。
- **验收标准**：
  - AC-4.8l：路由阶段自动判断任务是否涉及 Web/UI，产出“是否需要 UX Interaction Design”布尔值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8m：设计必须从小白用户视角出发，覆盖完整操作流程（从打开页面到完成核心任务）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8n：UX 设计文档是 Implement（FR-05）的强制输入，编码 prompt 必须引用该文档路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8o：与其他并行阶段不进入 repairing 并继续推进，完成后经 PM 评审通过后进入 Design Review Advisory Check。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8p：产出工件记录 authorRole 为 ux，可追溯到执行角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8p2：UX 交互设计完成后必须经过 PM 角色评审，PM 评审repair-required advisory则打回 UX 角色修改，修改后重新提交 PM 评审。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-02e Architecture Design

- **触发条件**：Architecture Design 是所有流水线不可绕过的必经节点，任何任务通过 Spec Review Advisory Check（FR-02）后都必须进入本阶段，不依赖 LLM 分类器、关键词、正则或复杂度判断。Why：SA 评估成本很低，漏判会让大型改动缺少架构指导，开发 Agent 被迫在编码阶段自行探索架构，返工成本远高于一次固定评估。
- **触发时机**：Spec Review Advisory Check（FR-02）通过后，与 Design（FR-03）、Test Case Authoring（FR-02a）、UX Interaction Design（FR-02d）并行启动。
- **输入**：已通过 Spec Review Advisory Check 的需求规格包 + UX 交互设计文档（如有，作为参考）。
- **处理**：由 SA 角色先做架构评估，再产出两类结果之一：完整架构详设文档，或一句话出具通过 advisory结论“本次无需额外架构设计，出具通过 advisory”。
- **输出**：完整架构详设文档（存放于项目 docs/architecture/ 下）或出具通过 advisory结论记录。
- **执行阶段**：Architecture Design。
- **角色约束**：仅 SA 角色可执行，禁止开发者或产品角色代执行。
- **并行关系**：与 FR-02a、FR-02b、FR-02c、FR-03、FR-02d 并行执行，不互相进入 repairing 并继续推进。如果同时有 UX Interaction Design，应参考 UX 设计文档。
- **完成后流向**：完整架构详设文档或出具通过 advisory结论作为 Design Review Advisory Check（FR-04）的输入之一。
- **验收标准**：
  - AC-4.8q：每条流水线的阶段队列都必须包含 Architecture Design，且该阶段不得因任务规模、文件数量、关键词、分类器结果或调用方判断被标记为不适用并留证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8r：SA 评估认为需要架构设计时，必须定义清晰的 API 接口、数据模型、模块交互、前后端职责划分和关键约束；不涉及对应对象时，在文档中明确说明不适用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8s：Architecture Design 的阶段产物是 Implement（FR-05）的强制输入；编码 prompt 必须引用完整架构详设文档路径，或引用出具通过 advisory结论记录并说明本轮无需额外架构设计。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8t：如果同时有 UX Interaction Design，SA 评估和架构设计应参考 UX 设计文档中的页面结构和交互流程；若选择出具通过 advisory，出具通过 advisory结论必须确认 UX 文档未引入新的架构约束。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8u：阶段产物必须记录 authorRole 为 sa，并能追溯到执行角色；完整架构详设文档和出具通过 advisory结论都适用本规则。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.8v：任何 Architecture Design 阶段产物完成后，必须同时经过 PM 评审和 Audit 评审并双重通过后，Architecture Design 阶段才能标记为 `passed` 并允许进入 Implement；PM 评审验证需求对齐，Audit 评审验证技术可行性与 spec 一致性。完整架构详设文档和出具通过 advisory结论都适用本规则。Why：架构判断是 Implement 的准入输入，若评估存在需求理解偏差或技术误判，后续实现会建立在错误基础上，修复成本远高于方案阶段发现。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-03 Design

- **输入**：已通过 Spec Review Advisory Check 的需求规格包。
- **处理**：把需求翻译为可执行的架构方案、实现边界、阶段质量检查、工作包拆分和交付顺序。plan/contract 阶段必须由 SA 做架构评估；评估结论可以是 pass-no-change，但阶段本身不允许标记为不适用并留证。SA 在评估前必须通读相关设计原则、用户体验流和 FR/AC 上下文，校验原则层与 AC 层是否一致；发现矛盾时标记 P1 并要求先收敛 spec。
- **输出**：契约包（Design Package），包含架构方案、实现边界、工作包拆分（含 Task 级细粒度分解）和交付顺序；若无需架构变更，输出 pass-no-change 评估记录及证据。
- **执行阶段**：Design。
- **审查阶段**：Design Review Advisory Check / Design Review Advisory Check（mandatory, never not-applicable）。
- **验收标准**：
  - AC-4.9：每个高优先级 FR 都能在契约中找到对应实现承接点。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.10：工作包拆分后可分派、可验收、可追责。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.11：关键边界、风险和依赖被显式记录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.12：契约包能直接驱动 Implement，不需要口头补规则。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.12a：每个工作包内部拆分为 Task 列表，每个 Task 粒度控制在 2-5 分钟，包含精确文件路径和预期变更描述。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.12b：架构设计阶段的准出产物必须包含架构评估结论；项目已存在架构地图文档时，还必须同步产出架构地图更新。若本次任务涉及函数签名变更、新增或删除函数、调用链变更，架构地图必须同步更新；仅函数内部逻辑变动且不影响调用关系时，可不更新架构地图。Review / Audit 阶段必须检查 git diff：如果 diff 显示函数新增或删除、函数签名变化或调用链变化，但架构地图未同步更新，审计结论必须为 fail。Why：架构地图过时会让后续开发者重新探索代码结构，浪费架构设计阶段已经完成的分析价值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（架构评估结论、架构地图 diff、git diff 摘要、审计报告或阶段工件之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-04 Design Review Advisory Check

- **输入**：契约包（Design Package）、关键架构决策、评审规则、UX 交互设计文档（如有 FR-02d 产出）、架构详设文档（如有 FR-02e 产出）。
- **处理**：作为 design-review（mandatory, never not-applicable）执行，由产品视角、开发视角、质量视角、体验视角四方并行会审，检查需求承接完整度、实现可行性、决策严谨性、交互合理性、扩展边界和交付波次，并形成是否允许进入 Implement 的advisory 结论。体验视角需核对契约与 UX 交互设计文档的一致性；开发视角需核对契约与架构详设文档的一致性。纯后端/CLI 项目可按项目配置标记为不适用并留证 UX 视角，此时退化为三方会审，但 design-review 本身不可标记为不适用并留证。
- **输出**：会审包（Design Review Bundle），包含四方评审结论、记录 advisory 并触发修复问题、修复要求、复审范围和是否允许进入 Implement 的advisory 结果。
- **执行阶段**：Design Review Advisory Check / design-review（mandatory, never not-applicable），四方并行评审——产品维度（需求承接完整度）、开发维度（实现可行性）、质量维度（决策严谨性与质量规范）、体验维度（交互合理性、用户流程完整性、可用性）。
- **advisory 判定**：四方共同出具 advisory verdict。任一方结论为advisory或repair-required advisory时记录 advisory 并触发修复，谁的问题未过审由谁继续复审，四方全部通过后方可进入 Implement。
- **验收标准**：
  - AC-4.13：进入 Implement 前必须完成四方并行会审，缺任一评审视角都必须出具 repair-required advisory。纯后端/CLI 项目可配置标记为不适用并留证体验视角，此时退化为三方会审。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.14：四方评审至少覆盖产品完整度、开发可行性、质量严谨性和交互体验四个视角。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.15：任一评审结论为advisory或repair-required advisory时，Implement 必须被记录 advisory 并触发修复，直到对应问题修复并复审通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.16：会审产出必须明确记录每个问题对应的责任工件、修复项和复审责任方。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.16a：Plan / Design 评审必须包含 spec 自洽性校验，至少检查设计原则、用户体验流与 FR/AC 是否互相支撑；发现原则与 AC 矛盾、FR 间冲突或体验流与功能定义不一致时，评审结论必须为 P1 记录 advisory 并触发修复并要求先修正 spec。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.17：项目配置中 hasUI=false 时，体验视角可标记为不适用并留证，退化为三方会审。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-05 Implement

- **输入**：契约包、工作包、阶段规则、验收标准、UX 交互设计文档（如有 FR-02d 产出，强制引用）、架构详设文档（如有 FR-02e 产出，强制引用）。
- **处理**：按工作包逐 Task 执行实现，遵循 TDD 循环（先写覆盖目标行为的发现问题测试 → 实现至测试通过 → 重构），限制改动边界，记录证据，形成可审计的变更集。编码 prompt 必须引用 UX 交互设计文档和架构详设文档的路径（如有），确保实现与设计一致。任何涉及代码修改的任务，在开始编码前必须先确认当前 spec 状态：本轮任务是否需要新增、修改或删除 FR/AC；需要时先回到 Spec 阶段完成规格同步，再允许进入编码。编码 Agent 开始实现前必须读取相关设计原则、用户体验流和 FR/AC 上下文；发现 AC 与 spec 原则冲突时生成 advisory 并由主 Agent 澄清，主线保持 active并报告“spec 内部矛盾，请先收敛”。
- **输出**：实现包（Implementation Bundle），包含代码变更、执行记录、测试结果和偏差说明。
- **执行阶段**：Implement。
- **审查阶段**：Review / implement-review-gate（mandatory, never not-applicable，独立审查）。
- **验收标准**：
  - AC-4.17：每个工作包都有明确输入、输出、允许改动范围和验收项。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.18：实现过程产出证据，不得只交代码不交说明。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.19：完成判定以验收结果为准，不以 Agent 自报完成为准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20：实现结果能追溯到对应 FR 和 Design 决策。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20a：每个工作包的实现遵循 TDD 循环：先写覆盖目标行为的发现问题测试，再写实现使测试通过，最后重构。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20b：未经测试覆盖的代码变更不得记为完成 Review 阶段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20f：编码 Agent 只能实现 spec 中明确定义的 FR 和 AC。觉得某功能有价值，必须先提需求变更请求，经 Specify 阶段评审写入 spec 后才能实现。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20g：当存在 FR-02d 产出的 UX 交互设计文档时，编码 prompt 必须引用该文档路径，实现必须符合 UX 设计方案中定义的页面布局、导航结构和操作流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20h：当存在 FR-02e 产出的架构详设文档时，编码 prompt 必须引用该文档路径，实现必须符合架构设计中定义的 API 接口、数据模型和模块职责划分。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20i：Implement 阶段插件 prompt 注入必须包含「先 spec 后代码」提醒，要求编码 Agent 在写代码前明确记录 spec 状态确认结果：无需改 spec / 已完成 spec 修改 / 记录 advisory 并触发修复由主 Agent 跟进 spec 修改。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20j：未完成 spec 状态确认时，Implement 阶段必须先生成 spec-gap advisory 和 spec-patch task，再继续编码准备；任务涉及新增或变更产品语义、用户可见行为、API/CLI 契约、发布方式或质量检查规则时，必须先完成对应 FR/AC 更新并通过 Spec Review Advisory Check。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20k：编码任务开始前必须完成 spec 自洽性阅读，覆盖相关设计原则、用户体验流和 FR/AC 上下文；若发现 AC 与原则冲突、FR 之间冲突或体验流与功能定义不一致，必须生成 advisory 并由主 Agent 澄清，主线保持 active实现并报告“spec 内部矛盾，请先收敛”，不得按局部矛盾条目继续编码。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-05a Systematic Debugging

- **触发时机**：Implement（FR-05）执行过程中或完成后发现非预期行为时触发，作为 Implement 和 Review 之间的可选活动。
- **输入**：实现包（或部分实现结果）、发现问题测试、异常日志、非预期行为描述。
- **处理**：按四阶段框架执行系统化调试——复现（在可控条件下稳定重现问题）→ 定位（缩小问题范围至具体模块或代码路径）→ 分析（确定根因，排除表面症状）→ 验证（修复后确认问题消除且未引入新问题）。
- **输出**：调试记录（Debugging Record），包含问题描述、根因分析、修复方案和验证结果。
- **执行阶段**：Systematic Debugging（Implement 内部可选活动）。
- **验收标准**：
  - AC-4.20c：调试过程遵循复现→定位→分析→验证四阶段，禁止标记为不适用并留证复现直接猜测修复。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20d：调试结论基于证据（日志、测试结果、代码路径分析），不基于主观推测。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.20e：修复后的验证必须覆盖原始问题场景和相关回归路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-06 Review

- **输入**：实现包。审计时参考 FR-02a 产出的测试用例文档（仅做参考，不代表全部审计项）、UX 交互设计文档（如有 FR-02d 产出）、架构详设文档（如有 FR-02e 产出）。
- **处理**：作为 implement-review-gate（mandatory, never not-applicable）由独立审查阶段三方并行评审，审查代码质量、需求一致性、架构符合度、边界遵守情况和高风险点。实现者不得自审，Review 通过前记录 advisory 后继续进入后续 Smoke、Regression、Deploy 或 endgame。审计 prompt 模板必须要求 Agent 在逐条验证 AC 前先通读相关设计原则、用户体验流和 FR 上下文；发现当前 AC 与 spec 整体原则矛盾时，标记为 P1 并上报，不得按矛盾 AC 直接出具通过 advisory或驳回实现。
- **输出**：评审包（Review Bundle），包含各维度结论、问题清单、修复要求和通过条件。
- **执行阶段**：Review，三方独立评审：
  - PM/产品维度：功能完整性、需求一致性确认。
  - 质量维度：代码质量、安全性、规范遵守。
  - SA/架构维度：实现是否符合架构详设文档（如有 FR-02e 产出），API 接口是否按设计实现，数据模型是否一致。无架构详设文档的任务，架构维度自动标记为不适用并留证。
- **advisory 判定**：三方共同出具 advisory verdict。任一方结论为advisory或repair-required advisory时记录 advisory 并触发修复，直到对应问题修复并复审通过。
- **体验验收说明**：用户体验的验收由独立的 UX Acceptance 阶段（FR-06c）负责，不在 Code Review 中重复覆盖。
- **验收标准**：
  - AC-4.21：评审者与实现者职责分离。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.22：评审结果至少区分通过、advisory、repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.23：每个记录 advisory 并触发修复问题都能指向具体工件和修复项。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24：通过结论建立在证据上，不建立在主观判断上。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24a1：当存在 FR-02d 产出的 UX 交互设计文档时，Review 阶段的审计 prompt 必须显式引用该文档路径或标识，并将其列为审计输入之一；缺少引用时，体验相关审计结论不得判定为通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24a2：当存在 FR-02e 产出的架构详设文档时，Review 阶段的审计 prompt 必须显式引用该文档路径或标识，并将其列为审计输入之一；缺少引用时，架构相关审计结论不得判定为通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24a3：当存在 UX 交互设计文档时，Review 阶段必须逐项检查实现是否符合 UX 文档定义的页面布局、导航结构、操作流程、关键状态反馈和用户可见文案；任一项不一致均判定为repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24a4：当存在架构详设文档时，Review 阶段必须逐项检查实现是否符合架构文档定义的 API 接口、数据模型和模块职责划分；任一项不一致均判定为repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24a5：当对应 UX 交互设计文档或架构详设文档不存在时，Review 阶段必须在评审包中显式记录“文档不存在，相关一致性校验标记为不适用并留证”，并仅标记为不适用并留证对应检查项；不得因此记录 advisory 并触发修复其他已具备输入的审计维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24k：Review 阶段必须包含 spec-code 覆盖检查——从需求规格书提取全量 AC，逐条比对实现包中的代码覆盖情况，产出 AC 覆盖矩阵（AC 编号 / 覆盖状态 / 对应代码位置）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24l：AC 覆盖矩阵中任何 AC 状态为未实现或部分实现时，Review 结论必须为repair-required advisory（blocker）。代码实现只能比需求定义多，不能比需求定义少。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24m：类型定义存在不等于已实现。AC 覆盖判定必须同时检查类型定义、逻辑代码和测试三层，缺任何一层视为部分实现。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24n：ImplementationReviewAdvisoryCheck 作为 Review 阶段的程序化质量检查，自动从 Spec Package 提取 AC、从 Implementation Bundle 提取覆盖证据，覆盖率低于 100% 时advisory 结论为 rejected。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24n2：Review 阶段必须检查：代码中每个功能模块是否都能追溯到 spec 中的 FR/AC 编号。无法追溯的代码视为伪需求，必须删除或补充 spec 定义后才能通过 Review。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n3：AC 覆盖扫描范围必须包含项目全部源码目录（src/、web/、plugin/、scripts/ 等），不得只扫部分目录。扫描范围由项目配置中的 sourceRoots 字段定义，默认值为项目根目录下所有包含源码的子目录。Review 报告中必须列出实际扫描的目录清单，遗漏目录视为 Review repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n4：当存在 FR-02e 产出的架构详设文档时，SA/架构维度必须逐项核对 API 接口实现与设计文档的一致性（路径、方法、请求/响应结构），不一致则判定为repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n5：无架构详设文档的任务，SA/架构维度自动标记为不适用并留证，不记录 advisory 并触发修复 Review 流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n6：Implementation Bundle 中每个 execution 的 allowedScope 必须精确到 AC 级别（如 AC-4.1、AC-4.2），不得只声明 FR ID（如 FR-01）。仅声明 FR ID 的覆盖判定为 partial，产出 blocker finding。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n7：ImplementationReviewAdvisoryCheck 在执行覆盖检查时，必须自动触发 AC 语义扫描（ac-semantic-scanner），逐条验证 spec AC 是否有对应实现代码且逻辑正确。禁止仅依赖 allowedScope 自我声明作为覆盖证据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n8：Review 结果必须包含 AC 覆盖矩阵，每条 AC 的覆盖判定包含三层检查：类型定义（接口/类型声明存在）、逻辑代码（业务逻辑实现存在且语义匹配 AC 描述）、测试（对应测试用例存在且覆盖核心路径）。三层全部通过才判定为 covered，缺任何一层判定为 partial。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n9：Pipeline 在 Review 阶段通过后、进入 Verify 阶段前，自动触发 Cascaded Scan（基础检查→语义覆盖检查→运行态检查）。扫描由 PipelineEngine 自动编排，无需编排者手动触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n10：Cascaded Scan 任一必需检查未产出明确 pass 结论时，pipeline 记录 advisory 并触发修复，记录 advisory 后继续进入 Verify 阶段。记录 advisory 并触发修复条件至少包括：AC 语义扫描结果中 spec-code 覆盖率低于 100%、基础检查/语义覆盖检查/运行态检查任一项执行发现问题、扫描报告缺失或扫描流程异常中断。记录 advisory 并触发修复时产出未覆盖 AC 清单或问题原因和修复建议，触发 Review Fix Loop（FR-06a）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n11：当 AC 语义扫描因 LLM 不可用、超时或重试耗尽，导致全部 AC 最终状态为 `needs-review` 且 `coveredCount = 0` 时，Cascaded Scan 结论必须为 `needs-review`/`repair-required`，不得判定为 pass，更不得出具通过 advisory进入 Verify。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n12：Review 阶段必须检查实现中是否存在硬编码的宿主环境信息，包括但不限于绝对路径（如 `/root/.openclaw/`、`/home/<user>/`）、特定 agent ID 池、特定 provider/model 名称、特定端口号、特定用户 ID 或 token。发现任一硬编码宿主信息时，Review 结论必须为repair-required advisory（blocker），并要求改为可配置项或从 `openclaw.json` 动态读取。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n13：Review 阶段必须检查用户可见位置是否暴露宿主环境细节。用户可见位置包括 UI 文案、README/文档、错误提示、日志输出和其他直接面向用户的反馈；若出现绝对路径、内部 agent/provider 标识、内部端口、用户 ID、token 等宿主细节泄露，Review 结论必须为repair-required advisory（blocker），直到完成脱敏、泛化或配置化处理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.24n14：Review 阶段的审计 prompt 模板必须要求审计者先通读相关设计原则、用户体验流和 FR 上下文，再逐条验证 AC；发现当前 AC 与 spec 整体原则矛盾、FR 间冲突或体验流与功能定义不一致时，必须将该问题标记为 P1 并上报，Review 结论不得基于矛盾条目直接出具通过 advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-06a Review Fix Loop

- **触发时机**：Review（FR-06）或 Design Review Advisory Check（FR-04）产出评审包且结论为advisory或repair-required advisory时自动触发。
- **输入**：评审包（Review Bundle 或 Design Review Bundle），包含问题清单。
- **处理**：
  1. 自动解析评审报告，提取结构化问题清单，每个问题标注严重级别（P0/P1/P2/P3）、关联的原始 FR、问题所在工件和修复建议。
  1. P0 和 P1 问题自动生成修复任务卡片（Fix Task），关联原 FR 流程实例、评审报告和问题条目。P2/P3 问题记录待办，不记录 advisory 并触发修复当前批次。
  1. 修复任务按优先级排入待办队列（P0 优先于 P1），可被空闲 Agent 认领执行。
  1. 修复任务完成后，自动触发原评审维度对修复范围做定向复验（Targeted Revalidation），复验范围限定为修复涉及的工件和关联影响面，不重跑全量评审。
  1. 复验通过 → 对应问题关闭 → 系统重新评估质量检查出具通过 advisory条件（所有 P0 关闭且 P1 关闭或豁免时出具通过 advisory）。复验repair-required advisory → 问题状态回退，继续修复→复验循环。
  1. 全链路状态（评审报告 → 问题清单 → 修复任务状态 → 复验结果）在驾驶舱实时可见。
- **输出**：问题清单（Review Issue List）、修复任务卡片（Fix Task）、复验结论（Revalidation Result）。
- **执行阶段**：Review Fix Loop（Review 和 Design Review Advisory Check 的内置子流程）。
- **验收标准**：
  - AC-4.24a：评审结论为advisory或repair-required advisory时，系统在评审完成后自动解析报告并生成结构化问题清单，无需人工介入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24b：问题清单中每个条目包含严重级别（P0/P1/P2/P3）、关联 FR、问题工件定位和修复建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24c：P0 和 P1 问题自动生成修复任务卡片，卡片关联原 FR 流程实例 ID 和评审报告引用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24d：修复任务按 P0 > P1 优先级排序进入待办队列，可被 Agent 认领执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24e：修复任务完成后，系统自动触发原评审维度对修复范围做定向复验，复验范围不超出修复涉及的工件及其关联影响面。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24f：复验通过时对应问题自动关闭；复验repair-required advisory时问题状态回退，修复→复验循环继续，直到通过或人工干预终止。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24g：所有 P0 问题关闭且所有 P1 问题关闭或经人工豁免后，质量检查自动重新评估并出具通过 advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24h：评审报告、问题清单、修复任务状态、复验结果的全链路状态在驾驶舱实时可见。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24i：修复→复验循环有最大轮次上限（默认 3 轮），超限后升级为人工介入，防止无限循环。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24j：P2/P3 问题记录为待办项，不记录 advisory 并触发修复当前质量检查出具通过 advisory，但纳入后续迭代的输入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-06f 流水线审计阶段自动闭环

- **触发时机**：Review（FR-06）阶段的 completion 结果为advisory或repair-required advisory时自动触发。
- **输入**：Review Bundle、审计报告全文、Implementation Bundle、当前 FR 流程实例、上一轮 Implement 执行记录、流水线自动重试配置。
- **处理**：
  1. PipelineEngine 解析审计 completion 的结构化结论。结论为 `PASS` 时继续推进后续阶段；结论为 `FAIL` 或 `CONDITIONAL_PASS` 且存在记录 advisory 并触发修复问题时，流水线自动回退到 Implement 阶段。
  1. 回退生成新的 Implement 修复任务，任务上下文必须包含审计报告全文、记录 advisory 并触发修复问题清单、关联 FR/AC、发现问题证据、上一轮实现摘要和允许修改范围。
  1. 系统按配置读取最大自动重试次数，默认 2 次。每次审计发现问题进入修复前，先递增该 FR 流程实例的 review-fix retry 计数。
  1. 修复任务必须选择不同于上一轮 Implement 的开发 Agent。若可用开发 Agent 池不足以换人，流水线生成 advisory 并由主 Agent 澄清，主线保持 active并通知用户补充 Agent 或授权继续使用同一 Agent。
  1. 修复完成后自动重新进入 Review 阶段，使用新的 Implementation Bundle 和原审计报告作为对照输入，直到 Review 结论为 PASS 或达到最大重试次数。
  1. 达到最大自动重试次数仍未 PASS 时，流水线生成 advisory 并由主 Agent 澄清，主线保持 active在 Review Fix 状态，通知用户问题原因、已尝试轮次、最后一轮审计报告和可选处理方式。
  1. Review 结论为 PASS 后，PipelineEngine 按原阶段队列继续推进 Smoke Test、UX Acceptance、PM Commercial Review、Regression、Commercialization Advisory Check、Deploy、Verify、README 更新、发布等后续阶段，不需要主会话手动触发。
- **输出**：自动回退记录、修复任务、重试计数、Agent 轮换记录、生成 advisory 并由主 Agent 澄清，主线保持 active通知或继续推进事件。
- **执行阶段**：Review Fix Loop（Review 和 Implement 之间的自动闭环子流程）。
- **配置**：`pipeline.review.autoFix.maxRetries` 控制最大自动重试次数，默认值为 2；`pipeline.review.autoFix.requireDifferentImplementAgent` 控制是否强制更换开发 Agent，默认值为 true。
- **验收标准**：
  - AC-4.24aa：audit / Review 阶段 completion 结论为 FAIL 或存在记录 advisory 并触发修复问题时，PipelineEngine 必须自动把同一 FR 流程实例回退到 Implement 修复阶段，无需主会话手动派发 `sevo:fix`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24ab：自动回退生成的 Implement 修复任务必须携带审计报告全文、记录 advisory 并触发修复问题清单、关联 FR/AC、发现问题证据和上一轮实现摘要；缺任一上下文项判定为闭环发现问题。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24ac：最大自动重试次数必须可配置，未配置时默认 2 次；达到上限后流水线生成 advisory 并由主 Agent 澄清，主线保持 active，生成升级 advisory 并由主 Agent 决定下一轮修复派发，并向用户通知生成 advisory 并由主 Agent 澄清，主线保持 active原因、重试轮次和最后审计结论。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24ad：每次自动重试的 Implement 开发 Agent 必须不同于上一轮 Implement 开发 Agent；无可替换 Agent 时流水线生成 advisory 并由主 Agent 澄清，主线保持 active并说明原因，禁止同一 Agent 在无授权情况下连续自我修复。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24ae：修复任务完成后必须自动重新进入 Review 阶段；Review PASS 后流水线继续进入后续阶段（Smoke Test、Regression、Commercialization Advisory Check、Deploy、Verify、README 更新、发布等），不允许标记为 Review 通过状态由主 Agent 派发下一步。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24af：自动闭环全链路必须写入流水线事件记录，至少包含 reviewFailed、implementRetryStarted、implementRetryCompleted、reviewRetried、reviewPassed、retryLimitReached 六类事件，便于驾驶舱展示和问题追溯。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24ag：Review Fix Loop（FR-06a）与本自动闭环规则冲突时，以本 FR 的“自动回退到 Implement + 重新 Review + 最大重试 + Agent 轮换”作为 Review 阶段发现问题处理的强制路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-06b Smoke Test

- **触发时机**：Review（FR-06）通过后自动触发，在进入 Regression 之前执行。
- **输入**：通过 Review 的实现包、FR-02a 产出的测试用例文档。
- **处理**：编码 Agent 在实现环境中执行 smoke test，验证核心功能路径可用、构建产物完整、关键入口无崩溃。
- **输出**：Smoke Test 结果（Smoke Test Result），包含测试执行记录、通过/发现问题状态和问题原因。
- **执行阶段**：Smoke Test。
- **角色约束**：由 review 角色执行。
- **验收标准**：
  - AC-4.24o：Review 通过后，PipelineEngine 自动推进到 Smoke Test 阶段，无需主会话人肉触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24p：Smoke Test 覆盖核心功能路径、构建产物完整性和关键入口无崩溃三个维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24q：Smoke Test 发现问题时记录 advisory 并触发修复后续阶段，结果中明确列出问题项和复现步骤。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-06c UX Acceptance

- **触发时机**：Smoke Test（FR-06b）通过后自动触发，与 PM Commercial Review（FR-06d）并行执行。
- **输入**：通过 Smoke Test 的实现包、FR-02b 产出的 UX 开箱即用评测检查清单。
- **处理**：由 UX 角色（ux-01）按 FR-02b 产出的检查清单执行视觉验收——模拟陌生用户首次使用，逐项检查零配置安装、首次运行、核心功能体验、错误提示友好度、文档可读性。
- **输出**：UX 验收结果（UX Acceptance Result），包含逐项通过/发现问题状态、截图证据和改进建议。
- **执行阶段**：UX Acceptance。
- **角色约束**：仅 UX 角色可执行，禁止开发者或产品角色代执行。
- **并行关系**：与 FR-06d PM Commercial Review 并行执行，两者均通过后方可进入 Regression。
- **验收标准**：
  - AC-4.24r：Smoke Test 通过后，PipelineEngine 自动推进到 UX Acceptance 阶段，无需主会话人肉触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24s：UX 验收按 FR-02b 产出的检查清单逐项执行，每项有明确通过/发现问题判定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24t：UX 验收发现问题时记录 advisory 并触发修复进入 Regression，结果中列出问题项和改进建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24u：产出工件记录 authorRole 为 ux，可追溯到执行角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24u2：UX 验收阶段的浏览器操作步骤必须产出可复用的标准操作手册（SOP），包含页面导航路径、交互步骤、预期结果和截图位置。SOP 纳入项目 docs/ 目录，后续迭代的 UX 验收可直接复用或增量更新，不需要从零编写。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24u3（UX 验收自检清单）：UX 验收报告必须包含「UX 验收自检清单」专节，列出以下全部检查项及其通过与否；任一项repair-required advisory = UX 验收repair-required advisory，记录 advisory 并触发修复进入 PM Commercial Review 与 Regression：
    1. **截图哈希独立**：UX 验收产出的所有截图文件哈希（SHA-256）必须两两不同；出现重复哈希 = 浏览器工具异常或页面未加载完成，判定为自检发现问题。
    1. **浏览器 console 错误**：验收全程不得出现 ERROR 级别日志（排除项目 spec 明确允许的例外）。warning 级别不造成自检发现问题但需在报告中折叠列出。
    1. **关键页面主操作可完成**：项目主要 web 页面必须能完成「陌生用户最关键的一个操作」（如 KIVO：导入 PDF → 看到知识点；SEVO Web：触发流水线 → 看到状态推进），主操作的识别以 spec 中指定的核心 FR 为准。主操作中途发现问题、路径中断、需要人手干预才能标记为不适用并留证某步，都判定为自检发现问题。
    1. **页面不是空状态与默认模板**：主操作路径上的关键页面（列表页、详情页、产出页）不得以「暂无数据」「请先初始化」「demo 占位」「示例数据」作为验收通过依据；需以真实导入材料产生的内容作为验证依据（与 FR-36 Verify-With-Real-Data Advisory Check 联动）。LLM 对截图内容做语义判定。
    1. **交互响应可感知**：点击、提交、跳转等主要交互后 2 秒内页面状态可感知（结果加载、loading 提示、跳转发生）；点击后无任何可感知反馈超过 2 秒 = 自检发现问题。
    1. **不出现 404 / 500 / 白屏**：验收路径上不得跳转到 404、500、白屏、未授权页面。报告要求：UX 验收报告中明确列出「自检通过项」与「自检问题项」两部分，问题项需含具体证据（截图路径、console 日志片段、发现问题位置描述）。缺少「自检清单」章节或任一项检查未覆盖 = UX 验收未完成，不予通过。

### FR-06d PM Commercial Review

- **触发时机**：Smoke Test（FR-06b）通过后自动触发，与 UX Acceptance（FR-06c）并行执行。
- **输入**：通过 Smoke Test 的实现包、FR-02c 产出的商用评测检查清单、README.md、package.json。
- **处理**：由 PM 角色（pm-01）执行商用就绪评审——陌生用户开箱即用验证、spec-code 一致性检查、README 营销质量评估。
- **输出**：PM 商用评审结果（PM Commercial Review Result），包含逐项通过/发现问题状态、spec-code 覆盖矩阵和改进建议。
- **执行阶段**：PM Commercial Review。
- **角色约束**：仅 Product 角色可执行，禁止开发者或 UX 角色代执行。
- **并行关系**：与 FR-06c UX Acceptance 并行执行，两者均通过后方可进入 Regression。
- **验收标准**：
  - AC-4.24v：Smoke Test 通过后，PipelineEngine 自动推进到 PM Commercial Review 阶段，无需主会话人肉触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24w：PM 评审覆盖陌生用户开箱即用验证、spec-code 一致性、README 营销质量三个维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24x：PM 评审发现问题时记录 advisory 并触发修复进入 Regression，结果中列出问题项和修复建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24y：产出工件记录 authorRole 为 product，可追溯到执行角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-06e Deployment View Review Advisory Check（部署视图审查质量检查）

- **触发条件**：Review（FR-06）阶段检测到 diff 涉及以下内容时自动触发：
  - 包的 `exports` 字段变更
  - 公开 API 签名变更（函数名、参数、返回类型）
  - 包的 major/minor version bump
- **输入**：当前 diff、项目根目录的 `consumers.json` 注册表。
- **处理**：
  1. 检查项目根目录是否存在 `consumers.json`。不存在则标记为不适用并留证本质量检查（不记录 advisory 并触发修复）。
  1. 读取 `consumers.json` 中注册的所有消费者条目。
  1. 对每个消费者执行其声明的 `loadTest` 命令，验证消费者在当前代码变更后仍能正常加载/运行。
  1. 任何一个 loadTest 发现问题 = P0 记录 advisory 并触发修复，Review repair-required advisory。
  1. 支持 `--not-applicable-deployment-check` 参数用于紧急 hotfix 场景，标记为不适用并留证时必须在 review 报告中标注标记为不适用并留证原因。
- **consumers.json 格式**：其中 `<path>` 在执行时替换为消费者的实际路径。`type` 为语义标签（hook / cron / script / service 等），用于报告分类，不影响执行逻辑。
- **输出**：部署视图审查结果，写入 review 报告的独立章节「部署视图」。
- **执行阶段**：Review（FR-06 的内置子检查）。
- **设计约束**：轻量实现——不做 AST 分析、不做依赖图谱、不做自动发现。注册表 + load test，仅此而已。
- **验收标准**：
  - AC-4.24z1：`consumers.json` 不存在时，部署视图质量检查自动标记为不适用并留证，不记录 advisory 并触发修复 Review 流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24z2：loadTest 发现问题时，输出具体错误信息——包含发现问题的消费者路径、消费者类型和命令执行的错误输出。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24z3：新增消费者（hook / cron / script / service 等任何类型）时，必须同步注册到项目的 `consumers.json`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24z4：advisory 结果写入 review 报告的独立章节「部署视图」，包含每个消费者的检查状态（通过/发现问题/标记为不适用并留证）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.24z5：支持 `--not-applicable-deployment-check` 参数标记为不适用并留证本质量检查，标记为不适用并留证时 review 报告「部署视图」章节标注标记为不适用并留证原因，供审计追溯。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-07 Regression

- **输入**：通过 Review 的实现包、FR-02a 产出的测试用例文档。
- **处理**：执行回归检查，确认新增改动没有破坏既有功能、关键路径和基础约束。
- **输出**：回归包（Regression Bundle）。
- **执行阶段**：Regression。
- **审查阶段**：Regression Review（审查回归结果完整性和覆盖度）。
- **验收标准**：
  - AC-4.25：关键路径有明确回归检查结果。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.26：已修问题附带防复发验证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.27：回归发现问题时能定位到受影响范围。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.28：回归结果进入后续 Deploy 与 Verify 的判断依据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-08 Deploy

- **输入**：通过 Regression 的交付候选版本。
- **处理**：生成发布制品，绑定版本信息、发布说明和交付目标。Deploy 验证通过后，立即按项目发布目标触发 GitHub 独立仓库推送；该推送是事件驱动的阶段出口动作，不是定时任务。
- **输出**：发布包（Release Artifact）和 GitHub 推送结果。
- **执行阶段**：Deploy。
- **审查阶段**：Deploy Review（确认发布制品与架构方案一致、版本元数据完整）。
- **验收标准**：
  - AC-4.29：发布产物可识别版本、来源和适用范围。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.29a：Deploy 阶段通过后，系统必须立即触发 GitHub 独立仓库推送；触发方式为阶段完成事件驱动，不允许依赖 cron、批处理或人工补推。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.29b：当项目声明 GitHub 为发布目标时，GitHub 推送发现问题则 Deploy 结论为 repair-required，流水线保持未完成状态，记录 advisory 后继续进入后续完成态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.30：发布动作与对应 Spec、Design、Review、Regression 结果可关联。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.31：发布发现问题不会污染已通过的候选版本。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32：发布结果可被 Verify 阶段直接消费。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-08a Commercialization Advisory Check（商用化质量检查）

- **定位**：Deploy 之前的强制阶段。当项目配置了发布目标（npm、GitHub、ClawHub）时自动触发，确保交付物达到商用级开源标准。
- **触发条件**：项目存在 `publishTarget` 配置，且目标为 npm、ClawHub、GitHub 之一时，在进入 Deploy 前自动触发。
- **核心原则**：GitHub 独立仓库推源码（开源可读、可构建），npm 推编译产物（开箱即用）。两条渠道并存，用户既能 `npm install` 直接用，也能 clone 源码自己 build。
- **输入**：交付候选版本、发布目标配置、项目源码目录、README.md、package.json、tsconfig.json。
- **处理**：按五层标准逐层检查，任一层repair-required advisory则记录 advisory 并触发修复发布。

**第一层：代码清洁度**

1. 无硬编码路径（`/root/`、`/home/`、`~/.openclaw/` 等内部路径）。
1. 无内部引用（内部 agent 名称、内部 API 地址、内部配置键名）。
1. 无调试残留（`console.log` 调试输出、TODO/FIXME/HACK 注释）。
1. 无敏感信息（API key、token、密钥文件、.env 文件）。
1. 依赖声明完整——package.json 的 dependencies 和 peerDependencies 覆盖所有 import，无遗漏无冗余。

**第二层：包完整性**6. package.json 必填字段完整：name、version、description、author、license、main/exports、bin（如有 CLI）。7. 入口文件指向存在的文件（main/exports/bin 指向的路径必须存在）。8. TypeScript 项目必须有 tsconfig.json，且 `npm run build` 能成功编译。9. .gitignore 排除编译产物（根目录 .js、dist/、node_modules/）。10. .npmignore 或 package.json files 字段正确配置，npm 包只包含编译产物 + 类型声明 + 文档。

**第三层：文档质量**11. README.md 存在且符合营销质量标准（tagline → 痛点 → 优势 → 快速体验 → 场景 → 文档链接）。12. README 同时引导两类用户：npm 用户（`npm install` 快速上手）和源码用户（clone → install → build）。13. 配置项有文档说明（环境变量、配置文件模板、CLI 参数）。14. CHANGELOG.md 或 GitHub Releases 记录版本变更。15. LICENSE 文件存在。

**第四层：可构建性**16. 在干净目录中 `git clone → npm install → npm run build` 能成功完成。17. `npm test` 能通过（如项目有测试）。18. CLI 项目：`npx <包名> --help` 能正常输出。

**第五层：开箱即用**19. `npm install <包名>` 能成功安装。20. 每个核心功能有可验证的首次使用路径，且产出有意义的结果（不是空壳）。21. 需要外部依赖（专用 API key、第三方服务）的功能，有明确的配置引导和错误提示。

- **输出**：商用化advisory 结果（Commercialization Advisory Check Result），包含五层检查的逐项通过/发现问题状态、具体问题原因、修复建议。
- **执行阶段**：Commercialization Advisory Check（Deploy 前阶段）。
- **验收标准**：
  - AC-4.32a：存在 `publishTarget` 配置时，系统在 Deploy 前自动触发商用化质量检查，无需用户确认。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32b：系统执行全部五层检查，不得只做部分检查。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32c：任一检查项repair-required advisory时，发布被记录 advisory 并触发修复，结果中明确列出具体问题原因和修复建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32d：用户可选择标记为不适用并留证该阶段，标记为不适用并留证决定写入 ledger，标注"用户主动标记为不适用并留证商用化质量检查"。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32e：不存在 `publishTarget` 配置时，该阶段完全不出现，不影响 Deploy 流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32f：发布目标包含 GitHub 独立仓库时，质量检查自动执行独立仓库同步——推送源码（排除编译产物），推送前排除 .gitignore 中定义的文件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32g：推送独立仓库前，扫描待推送文件中是否包含敏感内容（.env、API key、密钥文件、内部配置），发现则记录 advisory 并触发修复推送并报告。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32h：npm publish 和独立仓库同步作为原子操作执行——任一步骤发现问题则整体回滚。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32i：GitHub 独立仓库只推源码（TypeScript），编译产物由 .gitignore 排除；npm 包只推编译产物 + 类型声明 + 文档。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32j：第四层可构建性检查在干净临时目录中执行（模拟陌生用户环境），不依赖开发现场。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.32k：advisory 结果包含五层检查的逐项状态，支持增量修复（修复后只重跑问题项，不重跑已通过项）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-09 Verify

- **输入**：发布包。
- **处理**：在独立、清洁或最小依赖环境中验证功能、关键 NFR 和交付可用性。
- **输出**：验证包（Verification Bundle）。
- **执行阶段**：Verify（独立环境验证，与 Implement 阶段执行者分离）。
- **审查阶段**：Verify Review（确认核心用户路径和交付可用性达标）。
- **验收标准**：
  - AC-4.33：验证环境不依赖开发现场残留。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.34：验证覆盖核心用户路径和关键非功能指标。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.35：验证结论可明确区分可交付与不可交付。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.36：验证发现问题会记录 advisory 并触发修复 Ledger 的通过结论。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.36a：Verify 阶段采用默认拒绝策略（deny by default）——没有显式验证证据的 AC 默认判定为未通过。子 Agent 正常返回但未提供验证证据时，该 AC 的验证状态为 repair-required，不允许因缺少问题信号而默认通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.36b：Verify 阶段的验证目标（VerifyTarget）自动从 spec AC 列表派生，每条 AC 生成对应的验证目标。编排者无需手动定义 targets，系统根据 AC 描述自动生成验证步骤和预期结果。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.36c：每条 AC 的验证必须包含实际运行证据——API 调用结果、浏览器截图、数据库查询结果、CLI 输出等可观测产出。tsc 编译通过、npm test 通过不算单条 AC 的验证证据，只能作为基础检查的一部分。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.36d：验证步骤必须使用真实数据或真实环境产生的数据。禁止使用 mock 数据、seed 数据或硬编码的预期值通过验证。验证环境可以是隔离的，但数据必须通过实际功能流程产生。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.36e：Cascaded Scan、编译、测试或其他预检查报告只能作为 Verify 的前置筛查和补充证据，不得替代单条 AC 的运行时验证。若所有 VerifyTarget 都未产出 pass 级运行时证据，则 Verify 总结论必须为 repair-required。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-10 Ledger

- **输入**：FR 流程实例 ID、Spec Package、Spec Review Bundle、Design Package、Design Review Bundle、Implementation Bundle、Review Bundle、Regression Bundle、Release Artifact、Verification Bundle。
- **处理**：生成交付记录，串起版本、日期、范围、证据、问题、结论和经验沉淀。每条 Ledger Entry 必须关联到对应的 FR 流程实例 ID。
- **输出**：交付账本条目（Ledger Entry）。
- **执行阶段**：Ledger（系统自动汇总）。
- **审查阶段**：Ledger Review，产品维度（确认交付范围和结论准确）和架构维度（确认证据链完整和经验沉淀质量）。
- **验收标准**：
  - AC-4.37：账本条目能追溯到本轮所有关键工件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.38：账本记录交付结论、责任边界和后续动作。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.39：经验沉淀可被后续任务复用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.40：没有 Ledger Entry 的交付不算流程闭环。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.40a：Ledger Entry 中的经验沉淀（lessons learned）必须在后续 pipeline 的 Specify 阶段被自动检索和注入。PipelineEngine 在启动 Specify 阶段时，自动查询同项目历史 Ledger Entry 的经验字段，将相关经验作为上下文注入给 Specify 执行者，避免重复踩坑。注入内容按相关性排序，最多注入最近 10 条。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-11 Proactive Clarification

- **定位**：跨阶段机制。在 Spec、Design、Implement 三个阶段内建模糊检测与主动澄清能力，确保歧义在产生阶段就地消解，而非流入下游造成返工。
- **触发条件**：任一阶段执行过程中，检测到以下模糊信号之一即触发澄清流程：
  - 验收标准缺失或不可验证。
  - 边界条件未定义（输入范围、异常路径、并发场景）。
  - 术语首次出现但未给出定义。
  - 依赖未声明（上游工件、外部服务、运行时假设）。
  - 接口契约不完整（参数、返回值、错误码缺失）。
  - 数据流向不明（谁产出、谁消费、格式是什么）。
  - 性能或资源约束缺失（超时、并发上限、存储配额）。
  - Spec 与 Design 之间存在矛盾或不一致。
- **标记为不适用并留证条件**：只有输入被判定为纯 bug fix 时，才允许标记为不适用并留证澄清流程进入修复路径。纯 bug fix 必须同时满足三个条件：
  1. 用户提供或系统可稳定获得明确复现步骤，包括输入、操作路径、实际结果和期望结果。
  1. 问题能追溯到已有 spec 中的具体 FR/AC 编号，且该 FR/AC 已定义当前功能边界。
  1. 实际行为与对应 FR/AC 的明确描述矛盾；仅凭用户说“这是 bug”、体验不顺、想要另一种行为或提出新边界，不构成纯 bug fix。任一条件缺失时，按需求变更或边界澄清处理，先触发澄清流程。
- **澄清类型分类**：每个澄清问题必须标注类型，便于收敛后按知识类型沉淀：
  - 纠偏（correction）：已有描述与事实或意图不符。
  - 方法（methodology）：如何做、用什么方法。
  - 决策（decision）：多个可选方案需要取舍。
  - 边界（boundary）：范围、限制、不做什么。
  - 经验（experience）：历史教训、已知陷阱。
  - 元认知（meta）：关于流程本身的反思。

#### FR-11.1 Spec 阶段澄清

- **输入**：正在编写或已产出的 Spec Package。
- **处理**：
  1. 扫描 Spec 内容，检测模糊信号（验收标准缺失、边界未定义、术语未解释、依赖未声明）。
  1. 对每个模糊点生成结构化澄清问题，包含：问题描述、模糊类型、影响范围、建议选项（如有）。
  1. 将澄清问题提交给需求来源方（用户或上游 Agent）。
  1. 收到澄清回复后，将收敛结论写回 Spec Package 对应位置。
- **输出**：澄清记录（Clarification Record）+ 更新后的 Spec Package。
- **验收标准**：
  - AC-4.41：Spec 产出前，所有被检测到的模糊点都已生成澄清问题或标注为已知风险。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.42：澄清问题包含类型标签、影响范围和上下文引用，不是孤立提问。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.43：澄清收敛后的结论直接写入 Spec Package，不留在对话或临时文件中。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.44：澄清收敛结论按知识类型沉淀（纠偏→事实、决策→ADR 候选、边界→约束条件、方法→方法论记录、经验→experience 知识（沉淀到经验库 / lessons learned）、元认知→meta 知识（沉淀到方法论 / 流程改进建议））。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.44a：判断纯 bug fix 可标记为不适用并留证澄清时，必须同时记录复现步骤、对应 FR/AC 编号、实际行为与 spec 明确矛盾的证据；缺任一项时不得标记为不适用并留证澄清流程。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.44b：当用户输入同时包含 bug 修复和新需求、行为边界变化或验收标准变化时，系统必须主动拆分：能满足纯 bug fix 三条件的部分进入修复路径；新需求和边界变化部分进入澄清流程，不得用 bug 修复名义整体标记为不适用并留证澄清。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

#### FR-11.2 Design 阶段澄清

- **输入**：正在编写或已产出的 Design Package、关联的 Spec Package。
- **处理**：
  1. 扫描技术方案，检测模糊信号（接口未定义、数据流不明、性能约束缺失、模块职责重叠）。
  1. 对每个模糊点生成结构化澄清问题。
  1. 区分澄清对象：技术层面的模糊由架构阶段内部消解；需求层面的模糊上报给 Spec 来源方。
  1. 收到澄清回复后，将技术决策写入 ADR，将需求澄清回写 Spec Package。
- **输出**：澄清记录 + 更新后的 Design Package + 相关 ADR。
- **验收标准**：
  - AC-4.45：Design 产出前，所有被检测到的技术模糊点都已澄清或记录为待定风险。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.46：需求层面的模糊上报给 Spec 来源方，不由架构阶段单方面假设。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.47：技术决策类澄清收敛后写入 ADR，包含替代方案和取舍理由。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.48：Spec 与 Design 之间的矛盾在此阶段被检测并消解，不流入 Implement。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

#### FR-11.3 Implement 阶段澄清

- **输入**：Design Package、Work Package、Task 描述。
- **处理**：
  1. 执行前检查 Task 描述完整性（目标文件、预期变更、验证步骤是否齐全）。
  1. 执行过程中发现 Spec/Design 矛盾或未覆盖场景时，生成 advisory 并由主 Agent 澄清，主线保持 active实现并上报。
  1. 生成结构化澄清问题，标注记录 advisory 并触发修复级别（clarification-advisory：必须生成 clarification advisory，主 Agent 面向用户澄清；未收到回复时按默认假设继续并标风险才能继续；non-clarification-advisory：可先按默认假设推进，但需确认）。
  1. 收到澄清回复后，更新 Task 描述或回写上游工件。
- **输出**：澄清记录 + 更新后的 Task 描述（或上游工件修正请求）。
- **验收标准**：
  - AC-4.49：Task 描述不完整时，执行者主动提问而非基于猜测开发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.50：Spec/Design 矛盾被发现时，实现生成 advisory 并由主 Agent 澄清，主线保持 active并上报，不自行决定以哪个为准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.51：澄清问题标注记录 advisory 并触发修复级别，clarification-advisory 类必须生成 clarification advisory，主 Agent 面向用户澄清；未收到回复时按默认假设继续并标风险，non-clarification-advisory 类可附默认假设先行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.52：澄清结论回写到对应工件（Task 描述、Spec Package 或 Design Package），不只留在执行日志中。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

#### FR-11.4 实现路径

- 每个阶段的 Skill（specify/plan/implement）内置模糊检测逻辑，作为阶段执行的前置步骤或并行检查。
- 模糊检测规则可配置、可扩展，新增检测维度不需要改代码。
- 澄清流程通过阶段执行原则注入（参考 §6.6），绑定阶段而非 Agent 身份。
- 澄清记录作为阶段工件的一部分，纳入 Ledger 证据链。
- 验收标准：
  - AC-4.53：模糊检测规则可通过配置文件扩展，不需要修改 Skill 源码。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.54：澄清记录纳入 Ledger Entry 的证据链，可追溯每个澄清的触发点、问题、回复和收敛结论。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.55：澄清机制不依赖特定 Agent 身份，任何执行者进入对应阶段都自动获得澄清能力。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-12 Pipeline Create

- **定位**：生命周期操作。研发流程的入口点，负责在用户已创建 Project、已添加 FR 之后，为该 FR 创建 FR 流程实例、初始化 Project 目录结构、生成路由结果。
- **输入**：任务描述、Project 标识（project-slug）、FR 描述、触发条件命中结果。
- **处理**：
  1. 校验 Project 标识合法性（命名规范、是否已存在）。
  1. 校验目标 FR 已被创建并归属到该 Project。
  1. 检查同一 Project 是否已有 active 的 FR 流程实例，有则拒绝创建。
  1. 生成实例 ID（格式见 §3.5）。
  1. 执行路由判定（§3.2），确定项目归属、入口阶段和完整阶段队列。
  1. 检查 Project 目录结构，按 §3.6 规范初始化或补全。
  1. 创建 FR 流程实例记录，状态设为 created，并使该 FR 自动进入 Specify 阶段的流程准备态。
  1. 向 PipelineEngine（FR-13）发送 pipeline-created 事件，PipelineEngine 接管后续生命周期推进。
- **输出**：FR 流程实例（含 ID、Project 绑定、路由结果、目录结构确认）。
- **执行阶段**：Pipeline Create（研发流程入口，在第一个业务阶段之前执行）。
- **验收标准**：
  - AC-4.56：每个 FR 流程实例有全局唯一 ID，格式符合 `fr-<project-slug>-<yyyyMMdd>-<seq>` 规范。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.57：同一 Project 已有 active 实例时，创建请求生成 advisory 并返回明确处理建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.58：创建完成后，Project 目录结构符合 §3.6 规范，缺失目录已补全。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.59：路由结果包含项目归属、入口阶段、单一完整阶段队列、主链 mandatory 标记和辅助节点不适用判定理由；路由结果不得包含研发活动等级，也不得声明主链标记为不适用并留证项。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.60：已有 Project 目录的内容不被覆盖，只补全缺失的子目录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.61：pipeline 创建完成后，PipelineEngine 自动接管并通过 OpenClaw Adapter 触发第一个阶段的执行，用户不需要手动触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.62：判定“已有 active pipeline 管理该变更”时，候选 pipeline 必须同时满足状态为 active 且 `projectSlug` 与当前请求的 Project 标识完全相等；不同 Project 的 active pipeline 即使 label、taskId、title 或描述相同，也不得用于拒绝、复用或声明当前 Project 的变更已被管理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.63：managedChange claim 只接受结构化字段精确匹配：请求中的 `label`、`taskId` 或 `title` 与 active pipeline 已记录的 managedChange 同名字段完全相等时，才可判定同一变更已被管理；substring、宽泛文本包含、正则近似匹配或跨字段拼接匹配不得作为去重依据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-13 PipelineEngine（流程编排引擎）

- **交付状态**：已交付（v1.12.1）。
- **定位**：SEVO 的核心运行时引擎。负责 pipeline 实例创建后的全生命周期推进——通过状态机驱动阶段流转，借助 OpenClaw Adapter 触发阶段执行，监听阶段完成事件，评估质量检查条件，决定推进或记录 advisory 并触发修复。PipelineEngine 定义的是编排语义（何时推进、何时记录 advisory 并触发修复、何时重试），具体的任务派发方式由 OpenClaw Adapter 实现。
- **编排模型**：PipelineEngine 通过 OpenClaw Adapter 程序化派发阶段任务，并在收到任务 completion 信号后程序化推进下一阶段（completion 回路契约见 FR-46）。推进不依赖主会话照着 prompt 注入手动派单——即使主会话不响应任何注入文本，流水线也必须照常推进。`before_prompt_build` hook 的 prompt 注入降级为**可观测通知**（让用户/主会话知道流水线进展）与**fallback 通道**（程序化派发不可用时的兜底），不是推进的必要条件。`subagent_ended` hook 及 FR-46 定义的等价 completion 来源负责监听任务完成、更新 pipeline 状态并触发下一阶段。
- **角色知识内置**：PipelineEngine 在派发阶段任务时，自动注入该阶段应遵循的专业标准（§6.6）。Specify 阶段注入 PM 标准的 prompt 模板和质量质量检查，Review 阶段注入审计标准，Design 阶段注入架构设计原则。单 Agent 用户也能产出专业质量的工件，多 Agent 环境有专职角色则效果更好。
- **输入**：FR-12 创建的 FR 流程实例（含路由结果、阶段队列）。
- **处理**：
  1. 接收 pipeline-created 事件，读取路由结果中的阶段队列，生成 Stage Queue。
  1. 按 Stage Queue 顺序，通过 OpenClaw Adapter 触发当前阶段的执行。
  1. 监听阶段完成事件。
  1. 阶段完成后，自动评估该阶段的出口条件（工件是否齐全、质量检查是否通过）。
  1. 出口条件满足 → 自动推进到下一阶段 → 重复步骤 2。
  1. 出口条件不满足（repair-required advisory）→ 自动触发 Review Fix Loop（FR-06a）→ 修复完成后重新评估。
  1. 支持并行阶段（如 FR-02a/FR-02b/FR-02c 与 FR-03 并行；FR-06c 与 FR-06d 并行）。
  1. 所有阶段完成 → Ledger 自动生成 → pipeline 实例状态变为 completed。
  1. 启动时扫描持久化状态文件，检测中断的 pipeline（Advisoryway 重启、主会话中断、系统 OOM），自动恢复到最后已知状态并继续推进。
  1. 多个 pipeline 竞争同一角色的 Agent 时，按先到先服务排队，不进入 repairing 并继续推进其他不竞争的阶段。用户可通过配置指定优先级。
- **输出**：pipeline 实例的完整生命周期推进记录，包含每个阶段的触发时间、完成时间、advisory 结果、推进决策。
- **验收标准**：
  - AC-13.1：pipeline 创建后，PipelineEngine 在无人工干预的情况下自动通过 OpenClaw Adapter 触发第一个阶段的执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.2：每个阶段完成后，PipelineEngine 在 30 秒内评估质量检查并决定推进或记录 advisory 并触发修复。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.3：repair-required advisory时，PipelineEngine 自动触发修复流程（FR-06a），修复通过后自动恢复推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.4：并行阶段（如 UX Acceptance + PM Commercial Review）同时触发，两者均通过后才推进到下一阶段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.5：pipeline 推进的每一步决策（推进/记录 advisory 并触发修复/重试）都有结构化记录，可在驾驶舱查看。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.6：PipelineEngine 的编排语义与任务派发实现分离——它定义「何时推进、何时记录 advisory 并触发修复」，具体的任务触发通过 Adapter 抽象层实现，保持代码职责清晰。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.7：用户可以在任意时刻查询 pipeline 当前状态：走到哪个阶段、卡在哪里、下一步是什么。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.8：Advisoryway 重启后，中断的 pipeline 在 60 秒内自动恢复推进，不需要用户手动干预。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.9：多个 pipeline 竞争同一角色的 Agent 时，按优先级排队，不进入 repairing 并继续推进其他不竞争的阶段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.10：显式执行 `sevo:create <project-slug>` 或被 aco-dispatch-guard 自动路由到创建入口后，PipelineEngine 必须进入 Specify 阶段并自动派发第一条 Specify 任务，不允许标记为 created 状态由主 Agent 跟进人工二次触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.11：通过显式 CLI 创建和通过 aco-dispatch-guard 路由创建的 pipeline，复用同一套状态机和自动推进逻辑；两种入口的阶段队列、质量检查评估和恢复行为保持一致。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-13.12：LLM-trigger auto-create 与 deterministic auto-create 必须进入同一 active pipeline 生命周期：创建后 60 秒内可在 active pipeline 状态中查询到对应 `pipelineId` 与 `projectSlug`，managedChange 记录包含本次请求的精确 `label`、`taskId` 或 `title` 字段，且 Stage Queue 已排入首个 active stage；缺少 active pipeline 注册、缺少 managedChange 记录或未排入首个 active stage 均判定为未完成创建。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-14 Package Distribution & CLI（包分发、初始化与命令行界面）

- **定位**：SEVO 的安装入口和用户交互界面。负责 npm 包分发、CLI 入口、初始化命令、插件自动注册、环境健康检查，以及 Project 管理、FR 管理、Pipeline 状态查询和手动干预的全部命令行操作。
- **包名**：`sevo-pipeline`（统一 npm 包名，CLI 命令名为 `sevo`）。
 - **包结构**：单包双入口——`lib/` 提供库 API（PipelineEngine、AdvisoryEngine、LedgerEngine、Adapter 等），`index.js` 提供 OpenClaw 插件入口（register + hooks），`bin/` 提供 CLI 入口。
- **输入**：用户执行 `npm install -g sevo-pipeline` 和 CLI 命令。
- **处理**：
  1. npm 包包含 SEVO 核心库 + CLI 入口 + 内置 OpenClaw 插件。
  1. `sevo init` 执行环境检测：检测 OpenClaw 环境配置 → 生成默认配置 → 自动注册插件到 `openclaw.json` → 扫描 `projects/*/sevo.json` 发现受管项目 → 动态发现 Agent 并按命名规则 + runtime type 自动分类角色 → 单 Agent 环境自动启用降级模式 → 执行 doctor 检查 → 输出角色分配表和下一步指引。
  1. `sevo doctor` 检查配置完整性和环境就绪状态，每个问题附带修复建议。
  1. `sevo project create <name> [--description <desc>]` 创建 Project。
  1. `sevo project list` 列出所有 Project。
  1. `sevo:create <project-slug> [--from <stage>]` 为 Project 创建 pipeline；不指定 `--from` 时默认从 `specify` 开始。
  1. `sevo fr add <project> <description>` 向 Project 添加 FR，自动触发 pipeline 创建。
  1. `sevo fr list <project>` 列出 Project 下所有 FR 及其 pipeline 状态。
  1. `sevo fr advance <project> --fr <fr-id>` 为已有项目中新增的 FR 触发增量流程；spec 阶段确认目标 FR 已就绪，plan/contract 阶段由 SA 评估后，再进入 implement → review → regression → publish。
  1. `sevo status [<instance-id>]` 查看 pipeline 当前状态。
  1. `sevo hold-advisory <instance-id>` 生成 advisory 并由主 Agent 澄清，主线保持 active pipeline。
  1. `sevo resume <instance-id>` 恢复 pipeline。
  1. `sevo cancel <instance-id>` 取消 pipeline，状态设为 repair-required，取消原因记录到 Ledger。
  1. `sevo ledger [<project>]` 查看交付账本。
- **输出**：可用的 SEVO 运行环境 + 配置文件 + 插件注册 + CLI 交互能力。
- **验收标准**：
  - AC-14.1：陌生用户执行 `npm install -g sevo-pipeline` + `npx sevo init` 后，5 分钟内能创建第一个 Project 并启动第一条 pipeline。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.2：`sevo init` 自动检测 OpenClaw 环境配置，不需要用户手动指定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.3：在 OpenClaw 环境中，`sevo init` 自动注册 SEVO 插件，用户不需要手动编辑 `openclaw.json`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.4：`sevo init` 生成的默认配置足以跑通完整流水线，不需要额外配置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.5：`sevo doctor` 能检测并报告所有配置问题，每个问题附带修复建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.6：`sevo --help` 输出所有可用命令，每个命令有一句话说明。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.6a：`sevo:create --help` 展示 `--from <stage>` 参数；`--from` 支持 `specify`、`plan`、`implement`、`audit`、`deploy` 五个起始节点，不指定时默认 `specify`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.7：`sevo project create` + `sevo fr add` 后，pipeline 自动创建并开始推进，用户不需要额外操作。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.8：`sevo status` 能在任意时刻回答「当前走到哪了、卡在哪里、下一步是什么」。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.9：所有命令的错误提示可理解、可操作（告诉用户怎么修，不只是报错码）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.10：CLI 核心命令（status、ledger 等查询类）在纯 Node.js 环境中可运行，流水线执行依赖 OpenClaw 环境。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.11：`sevo init` 检测到 OpenClaw 未安装时，错误提示包含 OpenClaw 安装链接。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.12：当自动分类无法识别任何 Agent 的角色时，`sevo init` 进入交互式角色分配模式，引导用户手动指定至少一个编码角色和一个审查角色。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.13：`sevo init` 自动检测 OpenClaw 环境中的 ACP Agent 类型（Claude Code、Codex、OpenCode、Gemini CLI 等），为每种已检测到的 ACP 生成对应的持久化提示注入配置文件（如 `.claude/CLAUDE.md`、`codex.md`、`.opencode/agents.md`）。注入内容包含 SEVO 流程规则、角色约束和项目上下文。配置文件在后续 pipeline 执行时被 ACP Agent 自动加载，无需每次通过 task prompt 重复注入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.14：SEVO 插件启动时通过文件系统扫描 `projects/*/sevo.json` 自动发现受管项目。项目根目录下存在 `sevo.json` 且内容包含 `{"managed": true}` 的项目自动纳入受管列表。`sevo.json` 最小有效内容为 `{"managed": true}`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.15：`plugins.entries.sevo-pipeline.config.managedProjects` 配置项作为覆盖/补充机制保留。插件的 `loadConfig()` 函数先扫描项目目录发现 `sevo.json`，再合并 config 中的显式列表，最终生成完整的受管项目列表。显式列表中的项目即使没有 `sevo.json` 也纳入受管。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.16：新增项目只需在项目根目录创建 `sevo.json`（内容 `{"managed": true}`），无需修改全局配置即可被 SEVO 自动纳管。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.17：发布到 npm 的安装包必须正确注册 `sevo` CLI 入口。陌生用户通过全局安装或 `npx` 调用时，`sevo --help`、`sevo init`、`sevo project create`、`sevo fr add` 四条首用命令都可直接执行，不需要手工修复 bin 链接。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.18：发布包包含安装后自检路径：`postinstall` 钩子或等效机制必须验证 CLI 入口和必需资源可用；自检发现问题时输出可操作修复提示，禁止静默成功。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.19：发布包提供一键初始化脚本 `scripts/init.sh` 或等效受支持入口，用于串联安装后检查、CLI 可用性确认和 `sevo init` 首次引导；README 与 CLI 首次输出引用同一入口，避免陌生用户在多条初始化路径之间猜测。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.20：`sevo-pipeline` 主包仅承载 CLI、引擎、流水线编排能力，禁止打包 Web 静态资源（`web/`、`web/.next/`、`web/components/` 等子目录）。Web 驾驶舱体验由独立 npm 包 `sevo-web` 提供，发版节奏与主包解耦。`npm pack --dry-run` 输出中不得出现 Web 子目录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-14.21：`sevo-web` 包通过 `package.json.peerDependencies` 显式声明 `sevo-pipeline` 的兼容版本范围；`sevo-web` 启动时校验已安装的 `sevo-pipeline` 引擎契约版本，不在兼容范围内时输出可操作错误信息并输出含「升级/降级 sevo-pipeline 至 X.Y.Z」的可操作错误信息。`sevo-pipeline` 的 `sevo init` 在检测到项目声明 Web 入口时，必须主动提示安装 `sevo-web` 并附完整命令，禁止默认无声忽略。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-14a Pipeline Discipline Prompt Injection（流水线纪律提示注入）

- **定位**：SEVO 插件的每轮提示注入机制。SEVO 自身负责把流水线纪律以引导式准入提醒注入主会话，不依赖 ACO dispatch-guard 代劳。
- **触发条件**：OpenClaw 主会话每次构建 prompt 时无条件触发；不以当前请求是否命中 tracked project、受管项目列表是否存在、是否已有 active pipeline 为前提。
- **处理**：SEVO 插件通过 `before_prompt_build` 向主会话注入流水线纪律提醒，内容覆盖 Spec-First、`sevo:` 前缀入口检查、开发→审计闭环、主 Agent 配合 SEVO 引导四类规则。注入文本必须使用引导、准入校验、路由、握手等非对抗措辞。每条规则写清三要素：目标、主会话当轮要做什么、为什么要这么做。Why：流水线纪律如果只放在 ACO dispatch-guard，SEVO 的核心研发闭环会依赖外部插件的历史遗留规则；当 ACO 未启用、规则被压缩或受管项目列表为空时，Spec-First 和审计闭环会丢失，研发任务会重新回到不可追溯的口头约束。
- **ACO 职责边界**：ACO 只保留一条 fallback 提醒：研发类变更应交给 SEVO 流水线引导；完整规则由 SEVO 维护和注入。
- **输出**：主会话每轮可见的 SEVO 流水线纪律提示和可审计的注入记录。
- **执行阶段**：OpenClaw prompt 构建阶段，贯穿所有 SEVO 相关入口和未显式纳管的研发请求。
- **验收标准**：
  - AC-14a.1：每次主会话 prompt 构建时，SEVO 插件都注入流水线纪律提醒；注入不以 tracked project 存在、受管项目列表非空、当前请求已识别 projectSlug 或已有 active pipeline 为前提。验收验证：在受管项目列表为空和存在受管项目两种环境分别触发 prompt 构建，注入记录中均出现同一组 SEVO 流水线纪律提示；任一环境缺失即判定为 fail。
  - AC-14a.2：注入内容必须覆盖四类规则：Spec-First 先确认 FR/AC 覆盖；`sevo:` 前缀入口检查与路由提醒；开发完成后必须进入独立审计并形成修复→复验闭环；主 Agent 接受 SEVO 的引导式握手，不用改 label、换措辞或任务拆分脱离流水线引导。验收验证：读取一次实际注入文本，四类规则缺任一类即判定为 fail。
  - AC-14a.3：每类注入规则必须包含三要素：目标、主会话当轮要做什么、Why。验收验证：抽取注入文本中的四类规则，逐条检查是否能对应到目标、动作和原因；缺少任一要素即判定为 fail。
  - AC-14a.4：注入措辞必须是引导式、准入校验式、路由式或握手式；不得使用对抗、脱离流程、惩罚、控制主 Agent 这类表达。验收验证：对实际注入文本做人工审查或 LLM 审查，发现对抗性措辞即判定为 fail。
  - AC-14a.5：ACO dispatch-guard 中与 SEVO 流水线纪律重复的完整规则必须压缩为 fallback 一句话，语义为“研发类变更交由 SEVO 流水线引导”；ACO 不再维护 Spec-First、入口检查、开发→审计闭环和握手规则的完整文本。验收验证：读取 ACO 注入文本，只允许存在 fallback 提醒；若 ACO 仍保存完整 SEVO 纪律规则，即判定为 fail。

### FR-15 Progressive Disclosure（渐进式披露配置）

- **定位**：SEVO 的配置与定制能力。该能力服务已有第三方用户，待核心链路修通后激活。激活前，默认只开放安装即用能力，避免高级配置分散主链路交付焦点。
- **触发条件**：受管项目已能稳定完成创建、推进、审计、发布、验证和 Ledger 留痕后，由用户显式开启高级配置能力。
- **处理**：

**安装即用**（由 FR-14 保证）：

- `sevo init` 后零配置可用。默认阶段定义、默认质量检查规则、默认路由策略、角色专业标准全部内置。
- 用户只需要 `sevo project create <name>` + `sevo fr add <project> <description>` 就能启动 pipeline。
- 单 Agent 环境自动降级：所有角色池填入同一个 agentId，流水线所有阶段由同一个 Agent 执行，质量保证降级但功能完整。
- 对未经编排的开发任务的默认处理策略为 `guide`（注入流程引导），不记录 advisory 并触发修复执行。

**按需配置**：

- 用户可以在配置中调整：
  - 入口与阶段状态识别规则（只用于确定从哪里接入唯一完整阶段链，不用于裁剪阶段）。
  - 质量检查严格度（严格/标准/宽松）。
  - 发布目标（npm / GitHub / ClawHub）。
  - 合规模式（`guide` 注入流程引导 / `auto-route` 自动为未编排的开发任务创建 pipeline 并路由进 SEVO 流程 / `off` 关闭）。

**自定义辅助阶段**：

- 用户可以添加自定义阶段（如 Security Audit、Performance Test）。
- 用户可以修改阶段顺序（在约束范围内）。
- 用户可以定义自定义质量检查规则。

**L3 编程控制**：

- 用户可以通过 API 或 SDK 编程控制 pipeline 行为。
- 支持自定义 Adapter（替换默认的发布实现和阶段执行实现）。
- 支持自定义阶段执行器（替换默认的 Skill 执行）。
- **输出**：渐进式配置能力说明、可选配置项、编程控制接口说明。
- **执行阶段**：安装初始化与流水线配置阶段。
- **验收标准**：
  - AC-15.1：安装即用模式下，用户不需要编辑任何配置文件就能跑通完整 pipeline。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-15.2：按需配置项有完整的文档说明和默认值，修改任一配置不会破坏 pipeline 运行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-15.3：自定义辅助阶段可以插入到标准阶段序列中，且不破坏工件链和质量检查逻辑。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-15.4：L3 级别的 API 覆盖 pipeline 创建、阶段查询、质量检查覆写、工件读取等核心操作。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-15.5：配置能力是累加的——按需配置包含安装即用的全部能力，自定义辅助阶段包含按需配置的全部能力。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-15.6：用户从安装即用切换到按需配置不需要重新初始化，只需编辑配置文件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-15.7：Agent 自主行动按操作风险分为普通操作、需通知操作、需确认操作三类——普通操作（文件读写、构建、测试、代码生成）无需确认直接执行；需通知操作（配置变更、依赖安装、分支创建）执行后通知用户；需确认操作（发布、删除、外部通信、生产环境变更）必须获得用户确认后才能执行。规则在 `sevo.config.json` 的 `actionPolicies` 字段中可自定义，默认值覆盖常见操作类型。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-17 Post-Release Validation Advisory Check（发布后验证质量检查）

- **定位**：发布完成不等于产品可用。此阶段在 Deploy/Verify 之后、Ledger 之前自动执行终局差距扫描，逐条对照 spec FR 检查产品在真实环境中是否运行并产出价值。
- **处理**：
  1. npm publish / deploy 成功后，自动触发 Post-Release Validation 阶段。
  1. 差距扫描逐条对照 spec 中所有 FR，对每条 FR 检查三个维度：代码实现了？运行态跑起来了？陌生人能用？
  1. 每条 FR 产出三种状态之一：covered（全部通过）、code-only（有代码无运行态验证）、missing（完全缺失）。
  1. 发现差距时自动生成修复任务列表，包含 FR 编号和修复描述。
  1. 差距为零才允许流水线进入 Ledger 阶段标记为 completed。
- **验收标准**：
  - AC-17.1：npm publish 成功后，流水线自动进入 post-release-validation 阶段，无需人工触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.2：差距扫描逐条对照 spec FR，输出结构化 gap analysis report，包含 totalFrs、coveredCount、codeOnlyCount、missingCount、gaps 和逐条 entries。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.3：发现差距（gaps > 0）时，自动生成修复任务列表（fixTasks），每条包含 frId 和 description。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.4：差距为零（gaps === 0）时 canComplete 为 true，流水线可进入 Ledger 阶段；差距不为零时 canComplete 记录为 advisory-open，流水线进入 repairing 并继续推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.5：流水线包含 post-release-validation 阶段。仅当项目无发布目标、未产生发布制品、未触达任何可安装/可访问交付物，且 review 报告记录三项证据同时成立时，post-release-validation 才可标记为 not-applicable-with-evidence；任何代码、配置、文档或发布相关研发活动均不得标记为不适用并留证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.6（引擎与调度层职责边界）：SEVO 引擎是状态机 + 触发器，不是执行者。引擎的职责限于：感知「现在到了哪个节点」、在需要行动的节点向调度层（主 Agent）推送提醒、接收「差距已清零」的确认后出具通过 advisory进入下一阶段。引擎不做差距判定——差距分析由调度层派子 Agent 执行，结果回报给调度层，调度层确认后通知引擎。引擎不做任务拆解——修复任务的定义和派发由调度层负责。循环终止条件：调度层通知引擎「差距 = 0」，引擎出具通过 advisory。
  - AC-17.7：差距扫描维度扩展为两大类——技术可用性（项目结构完整性、安装验证、编译验证、测试验证、服务存活、运行态健康、依赖安全）和产品可感知性（README 质量、npm 元数据、GitHub 元数据、官网可达）。每个维度产出 PASS/FAIL/SKIP 状态和问题原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.8：产品可感知性扫描中的 README 质量评估必须调用 LLM API 进行语义级评估（tagline→痛点→优势→快速体验→场景→文档链接），产出 0-100 评分和改进建议。禁止降级为结构检查、关键词匹配或正则表达式。LLM 不可用时该检查项标记为 SKIP（原因：「LLM 不可用」），不标记为 PASS。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.9：`sevo scan --endgame [--project <slug>]` 命令可手动触发终局扫描。未指定 project 时扫描所有已注册项目；指定 project 时只扫描该项目。扫描结果为结构化 JSON 报告，写入项目的 `reports/endgame-scan-<date>.json`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.10：Post-Release Validation 的差距扫描必须包含 L3 运行时行为验证——对每条 FR 触发实际功能执行并验证产出有意义。禁止仅依赖 artifact 元数据匹配（如 artifact.id 包含 frId）判定 FR 为 covered。元数据匹配只能作为预筛选，最终判定必须基于 L3 运行时验证结果。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-17.11：Post-Release Validation 中，任一 FR 的 L3 运行时验证未执行、执行发现问题、或只得到元数据/静态证据时，该 FR 不得标记为 covered，至少记为 code-only 或 missing，并记录 advisory 并触发修复 canComplete。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-18 轻量目标追踪

- **定位**：Pipeline 级别的轻量目标管理机制。每条流水线只需要声明一句话终局目标，并在阶段推进时自动展示进度、剩余差距和卡住点，服务「一个人 + AI 团队」的研发闭环，不承担企业级 OKR、PDCA 或周期复盘职责。
- **触发条件**：创建 Project、创建 Pipeline、从中途阶段重入 Pipeline、查询 `sevo:status`，或任一阶段完成、发现问题、超时。
- **数据结构**：
  - `EndStateGoal { description: string; lockedAt: string; updatedAt?: string }` — 一句话终局目标和锁定时间。
  - `PipelineProgress { completedStages: number; totalStages: number; remainingFrs: number; currentStage: string; stalled: boolean; stalledReason?: string; estimatedCompletion?: string }` — 进度摘要。
  - `PipelineInstance` 必须包含 `endStateGoal: EndStateGoal` 和 `progress: PipelineProgress`。
  - 项目配置支持 `stallThresholdMinutes`，未配置时使用流水线默认阈值。
- **输入**：用户创建流水线时声明的终局目标、流水线阶段定义、当前阶段状态、FR 完成状态、阶段开始时间、阶段完成时间、stall 阈值。
- **处理**：
  1. **终局定义**：每个 Project 或 Pipeline 创建时必须声明「什么算做完」。终局目标是一句话，可由用户直接提供；未提供时，SEVO 必须在创建流程中追问或从已有 Spec 摘要生成候选并由主 Agent 跟进用户确认，不得静默创建无目标流水线。
  1. **目标锁定**：终局目标写入 pipeline 元数据和 Ledger。修改目标必须通过显式命令或交互确认，并记录旧目标、新目标、修改原因和修改时间。
  1. **进度自动计算**：任一阶段完成、发现问题、标记为不适用并留证或恢复时，SEVO 计算 `completedStages / totalStages`、剩余 FR 数、当前阶段、下一阶段，并将结果写回 pipeline 状态。
  1. **卡住自动升级**：当前阶段停留时间超过阈值且没有完成、repair-required 或人工生成 advisory 并由主 Agent 澄清，主线保持 active记录时，pipeline 状态标记为 `stalled`，记录卡住阶段、停留时长、最近错误或缺失工件，并通知用户。
  1. **全局视图**：`sevo:status` 展示所有活跃流水线的终局目标、阶段进度、剩余 FR 数、卡住点和预估完成时间；单项目查询只展示该项目的活跃流水线。
  1. **完成判定**：只有全部必需阶段完成、剩余 FR 为 0、终局差距扫描通过且 Ledger 已写入时，pipeline 才能标记为 completed。
- **输出**：Pipeline 目标元数据、进度摘要、stalled 标记与通知、`sevo:status` 全局视图、Ledger 中的目标与进度记录。
- **执行阶段**：Pipeline Create、所有阶段完成事件、状态查询、Ledger。
- **验收标准**：
  - AC-18.1：Project 或 Pipeline 创建时必须存在 `endStateGoal.description`。未提供目标时，创建流程返回可操作的目标确认提示，不创建无目标活跃流水线。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.2：目标描述必须写入 pipeline 元数据；目标变更必须记录旧值、新值、原因、操作者和时间，并纳入 Ledger。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.3：任一阶段状态变化后，系统自动更新 `completedStages`、`totalStages`、`remainingFrs`、`currentStage` 和下一步提示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.4：剩余 FR 数以当前 Spec 中未完成且未废弃的 FR 为分母，不把已废弃 FR 计入进度缺口。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.5：阶段停留超过 `stallThresholdMinutes` 且无生成 advisory 并由主 Agent 澄清，主线保持 active记录时，pipeline 自动标记为 `stalled`，状态中包含卡住阶段、停留时长和最近可用证据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.6：pipeline 标记为 `stalled` 后必须通知用户；通知内容包含项目名、pipeline id、卡住阶段、停留时长、最近错误或缺失工件、可执行的下一步。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.7：`sevo:status` 未指定项目时展示所有活跃流水线；每条记录至少包含终局目标、当前阶段、阶段进度、剩余 FR 数、stalled 状态和预估完成时间。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.8：`sevo:status --project <slug>` 只展示指定项目的活跃流水线，并保持与全局视图相同的字段语义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.9：预估完成时间只能基于已完成阶段的实际耗时和剩余必需阶段计算；缺少足够数据时显示 unknown，不得编造确定时间。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.10：pipeline completed 判定必须同时满足：必需阶段全部完成、剩余 FR 数为 0、终局差距扫描通过、Ledger 写入成功。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18.11：目标与进度摘要必须写入 Ledger Entry，后续复盘能看到终局目标、阶段进度变化和卡住处理记录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-18a 流水线生命周期管理（Pipeline Lifecycle Management）

- **定位**：Pipeline 级别的生命周期清理机制。负责识别长期无推进的流水线，及时提醒发起者，并在持续无人处理时自动归档，防止中途断裂的流水线长期标记为活跃列表里。
- **为什么**：流水线创建后如果阶段发现问题、completion 丢失、Advisoryway 重启或主会话遗忘，状态可能永久标记为中间。没有生命周期管理时，已死流水线会不断累积，活跃列表被污染，用户无法判断哪些任务还在推进、哪些已经断裂。
- **数据结构**：
  - `PipelineInstance.lifecycle.status`：`active | stale | archived | completed | repairing | cancelled`。
  - `PipelineInstance.lifecycle.lastProgressAt`：最近一次阶段推进、阶段状态变化、advisory 结论变化或人工操作时间。
  - `PipelineInstance.lifecycle.staleDetectedAt`：首次标记为 stale 的时间。
  - `PipelineInstance.lifecycle.archivedAt`：自动或手动归档时间。
  - `PipelineInstance.lifecycle.archiveReason`：归档原因。
  - `PipelineInstance.lifecycle.restoredAt`：最近一次从 archived 恢复的时间。
- **默认阈值**：
  - `pipeline.lifecycle.staleAfterDays`：超过 N 天无任何阶段推进时标记为 stale，默认 3 天。
  - `pipeline.lifecycle.archiveAfterStaleDays`：标记 stale 后再过 M 天仍无响应时自动归档，默认 7 天。
  - 阈值可在项目配置中覆盖；阈值必须写入状态记录，方便审计时确认本次判定使用了哪组配置。
- **处理**：
  1. PipelineEngine 定期扫描非 completed、非 repair-required、非 archived 的流水线。
  1. 当前时间减去 `lastProgressAt` 超过 `staleAfterDays` 时，流水线标记为 `stale`，记录 `staleDetectedAt`、卡住阶段、最近事件和使用的阈值。
  1. 流水线进入 stale 后，系统向发起者和主会话发送通知。通知内容包含项目名、pipeline id、当前阶段、停留时长、最近事件、建议动作和自动归档时间。
  1. stale 流水线在 `archiveAfterStaleDays` 内出现阶段推进、人工 resume、人工确认继续或状态修复时，恢复为 active，并更新 `lastProgressAt`。
  1. stale 后超过 `archiveAfterStaleDays` 仍无响应时，系统自动将流水线标记为 `archived`，写入 `archiveReason`，并从活跃列表中移除。
  1. 用户可通过 CLI、API 或 Web 入口恢复已归档流水线。恢复时必须重新计算当前阶段和下一步动作，写入恢复事件，并将状态改回 active 或 repairing。
  1. `sevo status` 默认不展示 archived 流水线；用户显式传入 `--include-archived` 或查询具体 pipeline id 时才展示归档记录。
- **输出**：stale 标记、生命周期通知、自动归档事件、恢复事件、过滤后的活跃流水线列表和可追溯的生命周期审计记录。
- **执行阶段**：Pipeline Lifecycle Monitor（贯穿 PipelineEngine 启动恢复、定时扫描、状态查询和人工恢复入口）。
- **验收标准**：
  - AC-18a.1：PipelineEngine 必须维护每条流水线的 `lastProgressAt`；任一阶段推进、阶段完成、advisory 结论变化、人工 hold-advisory/resume/restore 操作发生时，该字段必须更新。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.2：流水线超过 `staleAfterDays` 无任何阶段推进且未处于 repairing、completed、cancelled、archived 状态时，系统必须自动标记为 `stale`，并记录卡住阶段、停留时长、最近事件和本次使用的阈值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.3：流水线被标记为 `stale` 后，系统必须通知发起者和主会话；通知内容至少包含项目名、pipeline id、当前阶段、停留时长、最近事件、建议动作和预计自动归档时间。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.4：stale 流水线在 `archiveAfterStaleDays` 内出现阶段推进、人工 resume、人工确认继续或状态修复时，状态必须恢复为 `active`，并写入恢复事件；恢复后不得沿用旧的自动归档倒计时。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.5：流水线进入 stale 后超过 `archiveAfterStaleDays` 仍无响应时，系统必须自动标记为 `archived`，写入 `archivedAt` 与 `archiveReason`，并从默认活跃列表中移除。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.6：`sevo status` 默认只展示 active、stale、repairing 状态的流水线；archived 流水线仅在显式传入 `--include-archived`、查询具体 pipeline id、或进入历史/ledger 视图时展示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.7：系统必须提供手动恢复 archived 流水线的入口（CLI、API 或 Web 任一形态均可）；恢复时必须重新计算当前阶段、下一步动作和可继续条件，并写入 `restoredAt` 与恢复事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-18a.8：生命周期扫描必须在 PipelineEngine 启动恢复后自动执行一次，并按配置周期持续执行；扫描结果写入结构化生命周期审计记录，包含 scannedAt、checkedCount、staleCount、archivedCount、restoredCount 和异常原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-19 终局交付自动推进（Endgame Delivery Automation）

- **定位**：Pipeline 级别的交付自动化机制。Review/Audit 通过后，自动推进 README 同步、版本管理、发布、终局差距扫描和用户通知，不需要用户手动触发。解决「代码是库不是引擎」的核心断点——阶段间推进从 prompt 软约束升级为程序化硬约束。
- **触发条件**：Pipeline 的 Review 阶段（FR-06）通过且所有验收阶段（FR-06b/06c/06d）通过后，自动进入终局交付链。
- **标准终局阶段链**：任何研发入口一旦进入受管流水线，后续必须收敛到统一终局阶段链：implement → review → smoke → regression → publish-generalization-evidence → publish → verify → readme → ledger。不同入口可以标记为不适用并留证已完成阶段，但不得把终局链裁短成“做到当前阶段就停”。
- **处理**：
  1. **README 同步**：检测项目 README 是否反映本次变更的新能力。如果 README 缺少新增 FR 的描述，自动生成 README 更新任务并派发。README 更新完成后进入下一步。
  1. **版本管理**：根据变更类型自动判定版本 bump 级别（patch：bug fix；minor：新功能；major：破坏性变更）。执行版本号 bump 并更新 package.json。
  1. **发布执行**：调用 OpenClaw 环境的发布 Adapter（如 npm publish + GitHub 同步 + ClawHub 同步）。发布发现问题时自动重试一次，仍发现问题则通知用户并记录 advisory 并触发修复。
  1. **终局差距扫描**：发布后自动触发 Post-Release Validation（FR-17）。以 spec 全部 FR 为基准逐条对照当前实现。发现差距时自动生成修复任务，并回到 Implement→Review→终局交付链继续收敛。
  1. **差距修复循环**：差距修复任务完成后，重新进入 Review→Audit→终局交付链，循环到差距为零。
  1. **用户通知**：每个关键节点（审计通过、发布成功、差距扫描结果、最终完成）自动通知用户。通知内容包含版本号、新功能摘要、发布链接、差距状态。
  1. **阶段间推进机制**：PluginAdapter 的 hook handler 在 subagent_ended 事件中程序化调用 OpenClaw API 派发下一阶段任务，不依赖 prompt 注入。并行阶段通过 hook handler 一次性触发所有并行任务。
- **输出**：发布结果报告（Release Report，含版本号、平台链接、差距扫描结论）、用户通知记录。
- **执行阶段**：Review 通过后自动触发，贯穿 Deploy（FR-08）→ Verify（FR-09）→ Post-Release Validation（FR-17）→ Ledger（FR-10）。
- **验收标准**：
  - AC-19.1：Review 阶段（FR-06）所有子阶段通过后，Pipeline 自动进入终局交付链，不需要用户手动触发或主会话 prompt 驱动。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.1a：任何入口路径（`sevo:create`、`sevo:implement`、`sevo:fix`、`sevo:from`）一旦创建或重入流水线，PipelineEngine 都必须自动收敛到统一终局阶段链 `implement → review → smoke → regression → publish-generalization-evidence → publish → verify → readme → ledger`。前置阶段可因已完成而标记为不适用并留证，但后续阶段不得因入口不同而缺失。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.1b：终局交付链的推进是程序化硬质量检查，不允许出现“当前阶段完成后由主 Agent 派发下一步”“审计通过后停止在局部完成”“修复完成后标记为 implement/review”这类断点。只要流水线未被明确记录 advisory 并触发修复或完成，就必须继续自动推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.1c：不存在按成本或等级裁掉阶段的模式。若辅助节点因输入不适用被标记为 `not-applicable-with-evidence`，必须在 pipeline state 中逐项记录标记为不适用并留证原因、证据、判定人/判定器和复核入口；主链节点不得标记为 `not-applicable-with-evidence`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.2：终局交付链中，README 同步阶段检测 README 是否包含本次新增 FR 的描述。缺失时自动生成 README 更新任务；README 已包含时标记为不适用并留证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.3：版本 bump 级别根据变更类型自动判定（patch/minor/major），执行 bump 并更新 package.json。判定规则可通过项目配置覆盖。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.4：发布阶段调用 PublishAdapter 执行发布。PublishAdapter 是接口，当前实现调用 publish-release.sh。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.5：发布发现问题时自动重试一次（间隔 30 秒）。重试仍发现问题时，Pipeline 状态设为 repairing，通知用户并附带错误信息。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.6：发布成功后自动触发 Post-Release Validation（FR-17），以 spec 全部 FR 为基准执行差距扫描。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.7：差距扫描发现未覆盖的 FR 时，自动生成修复工作包并触发 Implement→Review→终局交付 子循环。子循环受最大修复轮次限制，超限后标记为 stalled 并通知用户。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.8：终局交付链的每个关键节点（审计通过、README 更新完成、版本 bump 完成、发布成功/发现问题、差距扫描结果、最终完成）通过 OpenClaw/ACO 通知能力自动通知用户。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.9：通知由 OpenClaw Advisoryway 与 ACO 通知插件承接，SEVO 只产出结构化通知事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.10：阶段间推进通过 PluginAdapter 的 subagent_ended hook handler 程序化触发，不依赖 prompt 注入。hook handler 检测当前完成的阶段，调用 PipelineEngine.advance() 并通过 OpenClaw API 派发下一阶段任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.11：并行阶段（如 Test Case + UX Acceptance + Commercial Acceptance）通过 hook handler 一次性触发所有并行任务。所有并行任务完成后，hook handler 自动触发汇合点的下一阶段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.12：整条终局交付链可通过项目配置关闭或部分关闭（如关闭自动发布但保留差距扫描）。未配置时默认全部启用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.13：单 Agent 用户（无专职 PM/UX/审计 Agent）也能走完整终局交付链。角色知识注入（FR-15 渐进式披露）确保单 Agent 在每个阶段获得对应角色的专业标准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.14：终局交付链的所有操作记录纳入 Ledger Entry 的证据链，包含 README diff、版本变更、发布结果、差距扫描报告、通知记录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.16（引擎与调度层职责边界）：终局交付自动推进中，SEVO 引擎的职责是状态机 + 触发器——感知当前节点、在需要行动时向调度层（主 Agent）推送提醒、接收确认后出具通过 advisory。引擎不做差距判定：差距分析由调度层派子 Agent 执行，结果回报给调度层，调度层确认后通知引擎。引擎不做任务拆解：修复任务的定义和派发由调度层负责。差距修复循环的终止条件：调度层通知引擎「差距 = 0」，引擎出具通过 advisory进入 Ledger。
  - AC-19.17：`sevo init` 执行时自动注册每日终局扫描 cron job（默认 04:30 本地时间，可通过 `sevo.config.json` 的 `endgameScan.schedule` 字段配置执行时间或关闭，设为 `"off"` 即禁用）。cron 调用 `sevo scan --endgame` 命令。注册发现问题时输出警告但不记录 advisory 并触发修复 init 流程。定时触发与流水线内自动触发、手动触发并列，是终局扫描的三种触发方式之一。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.18：终局差距扫描发现 repair-required 项后，系统自动执行可修复性分析（通过 Advisoryway 管理的 LLM 能力判定），将 repair-required 项分为「可自动修复」和「需人工介入」两类。分类结果写入扫描报告。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.19：可自动修复的项通过 RepairAdapter 派发修复任务给 agent。修复任务包含结构化信息：发现问题检查项标识、问题原因、修复建议、目标文件路径。RepairAdapter 是接口，当前实现调用 `sessions_spawn` 派发 ACP agent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.20：修复完成后自动重跑问题项的扫描验证（增量重跑，不重跑已 PASS 项）。验证通过 → 标记为 repaired；验证仍发现问题 → 进入下一轮修复或标记为 escalated。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.21：修复→验证循环最大轮次默认 3 轮（可通过 `endgameScan.repair.maxRounds` 配置）。超限后标记为 escalated，不再自动修复，由主 Agent 跟进人工介入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.22：终局扫描结果的通知策略通过 OpenClaw/ACO 通知能力配置。有 repair-required 项时立即通知（含问题项数量、摘要和修复状态）；全 pass 时默认静默（可配置为每周汇总通知）。修复完成后发送修复结果通知（含修复项、验证结果、仍需人工介入的项）。通知渠道不绑定特定平台。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-19.23：终局扫描引擎通过职责边界保持通用化：RepairAdapter 只负责修复任务派发，语义评估调用 Advisoryway 管理的 LLM 能力，通知发送交给 OpenClaw/ACO 通知层。SEVO 不自建 LLM 或通知封装。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-22 角色-任务匹配调度约束（Role-Task Dispatch Constraint）

- **定位**：跨阶段机制。流水线每个阶段有明确的角色要求，调度器在派发阶段任务前必须校验目标 Agent 的角色标签是否匹配阶段要求，防止角色越权导致产出质量不达标。
- **角色-阶段映射（默认）**：
  - Specify（FR-01）、Spec Review Advisory Check（FR-02）、Commercial Acceptance Authoring（FR-02c）、PM Commercial Review（FR-06d）→ Product 角色
  - UX Acceptance Authoring（FR-02b）、UX Acceptance（FR-06c）→ UX 角色
  - Design（FR-03）、Design Review Advisory Check（FR-04，开发维度）→ Architect 角色
  - Implement（FR-05）、Smoke Test（FR-06b）→ Coder 角色
  - Review（FR-06）、Regression（FR-07）→ Auditor 角色
  - Deploy（FR-08）、Verify（FR-09）、Ledger（FR-10）→ 任意角色（系统自动执行或可配置）
- **输入**：阶段任务的派发请求（含目标阶段、候选 agentId）、Agent 角色注册表。
- **处理**：
  1. PipelineEngine 在通过 OpenClaw Adapter 触发阶段执行前，查询 Agent 角色注册表，获取候选 Agent 的角色标签。
  1. 比对候选 Agent 的角色标签与当前阶段的角色要求。
  1. 角色匹配 → 正常派发。
  1. 角色不匹配 → 生成审计事件（包含阶段名、要求角色、实际角色、agentId），记录到调度审计日志。多 Agent 环境下记录 advisory 并触发修复派发并提示选择正确角色的 Agent；单 Agent 环境下降级为警告，允许派发但在审计日志中标注"角色降级"。
  1. Agent 角色注册表在 `sevo init` 时自动生成（基于 Agent 命名规则和 runtime type 推断），用户可通过配置文件手动覆盖。
- **输出**：角色校验结果（通过/警告/记录 advisory 并触发修复）、审计事件记录。
- **执行阶段**：跨阶段机制，嵌入 PipelineEngine（FR-13）的阶段派发逻辑中。
- **验收标准**：
  - AC-22.1：每个流水线阶段在 Stage 定义中声明所需的角色类型（requiredRole），角色类型为枚举值：product、ux、architect、coder、auditor、any。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.2：PipelineEngine 在派发阶段任务前，自动校验候选 Agent 的角色标签是否匹配阶段的 requiredRole。校验逻辑在 OpenClaw Adapter 触发执行之前执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.3：角色不匹配时，系统生成结构化审计事件，包含字段：timestamp、pipelineInstanceId、stageName、requiredRole、actualRole、agentId、action（repairing/warned）。审计事件写入调度审计日志。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.4：多 Agent 环境下，角色匹配的默认严重级别由配置项 `roleMatchingAdvisoryLevel: warn | error` 决定。`roleMatchingAdvisoryLevel=warn`（默认）时，role-mismatch advisory 在 `sevo doctor` 输出为 warn、不计入 Errors，PipelineEngine 派发时使用兜底 agent（按 ux→product→architect→coder→auditor 优先顺序选择最近的可用角色）并写入 `role-degraded` 审计事件。`roleMatchingAdvisoryLevel=error` 时，role-mismatch advisory 在 doctor 输出为 error 并记录到 Ledger，同时输出推荐兜底策略、风险等级和需要补齐的角色映射；PipelineEngine 仍生成下一步 advance prompt，由主 Agent 决定是否采用兜底 agent。两种模式都禁止静默忽略。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.5：单 Agent 环境下（Agent 池中只有一个 Agent 或无匹配角色的 Agent），角色不匹配时降级为警告，允许派发，审计事件的 action 字段标注为 warned，日志中标注"角色降级：单 Agent 环境"。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.6：Agent 角色注册表支持两种来源：自动推断（`sevo init` 基于 Agent 命名规则和 runtime type 生成）和手动配置（用户在 SEVO 配置文件中显式指定 agentId → role 映射）。手动配置优先级高于自动推断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.7：角色-阶段映射可通过 SEVO 配置文件自定义。用户可修改任意阶段的 requiredRole，新增自定义阶段时可指定角色要求。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.8：`sevo init` 产出的角色分配表（已有 AC-14.12）包含每个 Agent 的推断角色和每个阶段的角色要求，用户可在此确认或修改。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.9：陌生宿主自适应。`sevo init` 禁止硬编码 `dev-01` / `dev-02` / `cc` 等 SEVO 维护者私有 agent ID 作为默认 roleAssignment.agentRoles。生成逻辑必须：(a) 读取宿主 `openclaw.json`（路径解析顺序：`process.env.OPENCLAW_CONFIG_PATH` → cwd 向上探测 → 抛错），枚举已注册 agent；(b) 按命名模式 + runtime type 自动分类到 product / ux / architect / coder / auditor 五种角色；(c) 任一角色无 agent 时，自动用宿主主 agent 或第一个可用 agent 兜底，并在 roleAssignment 中标注 `autoFallback: true`；(d) 零 agent 注册环境下生成占位 `{ "self": ["product","ux","architect","coder","auditor"] }` 并提示用户后续手动替换。生成结果写入 sevo.config 后，`sevo doctor` 在该配置下必须报 `Errors: 0`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-22.10：配置 schema 新增 `roleMatchingAdvisoryLevel: warn | error` 字段，默认 `false`。`sevo init` 生成的初始配置必须显式写入该字段（默认 false）并附注释说明取值含义；用户可通过编辑配置文件或 CLI flag `--strict-role-matching` 切换严格模式。配置变更后立即生效，不要求重新 init。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-23 Executable Advisory Evaluators（可执行质量检查评估器）

- **定位**：跨阶段机制。为流水线质量检查引入可执行评估脚本，产出确定性 pass/fail 判定和量化分数，与现有 AdvisoryVerdict / ImplementationReviewAdvisoryCheck 的 LLM 评估互补。评估器是可选增强——没有挂载评估器的质量检查退化为纯 LLM 评估，向后兼容。
- **核心原则**：谁写代码，谁就不得碰评分标准。评估器由独立于编码 Agent 的角色编写和维护，编码 Agent 对评估器目录只有只读权限（隔离机制见 FR-24）。
- **输入**：阶段产出工件（Implementation Bundle、Review Bundle 等）、项目配置中的评估器注册表、评估器脚本。
- **处理**：
  1. PipelineEngine 在质量检查评估阶段，读取项目配置中当前阶段挂载的评估器列表。
  1. 按注册顺序依次执行每个评估器脚本，传入标准化输入（JSON 格式，包含阶段名、工件路径、项目元数据）。
  1. 每个评估器脚本输出标准化结果（JSON 格式，包含 verdict: pass/fail、score: 0-100、details: 问题明细数组）。
  1. 汇总所有评估器结果，任一评估器 verdict 为 fail 则质量检查整体repair-required advisory。
  1. 评估器执行超时（默认 60s，可配置）时标记为 error，不等同于 pass。
  1. 评估器列表为空时，质量检查退化为纯 LLM 评估（现有行为不变）。
- **输出**：评估器执行结果集（Evaluator Result Set），包含每个评估器的 verdict、score、details 和执行耗时。
- **执行阶段**：嵌入所有评审阶段（Spec Review Advisory Check、Design Review Advisory Check、Review、Regression 等）的评估流程中。
- **评估器标准协议**：
  - 输入：通过 stdin 接收 JSON，schema 为 `{ stage: string, artifactPaths: string[], projectMeta: object }`。
  - 输出：通过 stdout 输出 JSON，schema 为 `{ verdict: "pass" | "fail", score: number (0-100), details: Array<{ rule: string, passed: boolean, message: string }> }`。
  - 退出码：0 = 正常执行（verdict 由输出决定），非 0 = 评估器自身错误（视为 error，不等于 fail）。
  - 运行时：评估器脚本可以是任意可执行文件（shell、Node.js、Python 等），只要遵循 stdin/stdout JSON 协议。
- **评估器注册机制**：
  - 项目配置文件（`sevo.config.json` 或 `package.json` 的 sevo 字段）中声明评估器挂载关系。
  - 注册格式：`{ evaluators: { "<stageName>": [{ name: string, script: string, timeout?: number }] } }`。
  - `script` 路径相对于项目根目录的 `evaluators/` 目录。
  - 同一阶段可挂载多个评估器，按数组顺序执行。
- **内置评估器（开箱即用）**：
  - `test-pass-rate`：解析测试执行结果，计算通过率，低于阈值（默认 100%）则 fail。
  - `lint-score`：执行 lint 检查，输出违规数量和严重级别分布。
  - `spec-ac-coverage`：从 Spec Package 提取 AC 列表，扫描实现代码和测试，输出 AC 覆盖矩阵。
  - `dependency-audit`：检查依赖安全漏洞（调用 `npm audit` 或等效工具）。
  - 内置评估器随 `sevo-pipeline` npm 包分发，`sevo init` 时自动复制到项目 `evaluators/` 目录。
- **验收标准**：
  - AC-23.1：项目配置中可声明每个评审阶段挂载的评估器列表，PipelineEngine 在质量检查评估时按列表顺序执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.2：评估器通过 stdin 接收标准化 JSON 输入，通过 stdout 输出标准化 JSON 结果，退出码区分正常执行和评估器自身错误。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.3：任一评估器 verdict 为 fail 时，质量检查整体结论为repair-required advisory，结果中列出所有发现问题评估器的 details。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.4：评估器列表为空时，质量检查退化为纯 LLM 评估，现有 AdvisoryVerdict / ImplementationReviewAdvisoryCheck 行为不变。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.5：评估器执行超时时标记为 error 并记录到结果集，不等同于 pass，不静默标记为不适用并留证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.6：`sevo init` 自动将内置评估器复制到项目 `evaluators/` 目录，用户可直接使用或修改。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.7：评估器脚本支持任意可执行文件格式（shell、Node.js、Python 等），只要遵循标准协议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-23.8：评估器执行结果集作为质量检查工件的一部分，纳入 Ledger 证据链，可追溯每个评估器的 verdict、score 和 details。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-24 Evaluation-Implementation Workspace Isolation（评估-实现工作区隔离）

- **定位**：跨阶段机制。物理隔离编码 Agent 的可编辑范围与评估器代码，确保「谁写代码，谁就不得碰评分标准」的原则在 OS 层面强制执行，而非仅依赖 prompt 约束。
- **核心原则**：编码 Agent 的可写范围限制在 `src/` 和 `tests/`，`evaluators/` 目录对编码 Agent 只读。隔离优先用 平台层（OS 文件权限）实现，ACP harness 层约束做冗余兜底。
- **输入**：项目目录结构、Agent 角色注册表（FR-22）、OpenClaw 环境能力。
- **处理**：
  1. Pipeline Create（FR-12）初始化项目目录时，自动创建 `evaluators/` 目录并设置文件权限。
  1. 平台层隔离（OS 文件权限）：`evaluators/` 目录的 owner 设为非编码 Agent 的执行用户（如 root 或专用 evaluator 用户），编码 Agent 的执行用户只有 read + execute 权限，无 write 权限。具体实现取决于 OpenClaw 环境是否支持多用户隔离。
  1. L4 层隔离（ACP harness 约束）：在编码 Agent 的 session 配置中注入文件写入白名单（`allowedWritePaths: ["src/**", "tests/**"]`），禁止写入 `evaluators/`、`docs/` 等目录。ACP harness 在工具调用层拒绝越界写入。
  1. L6 层冗余（prompt 注入）：Implement 阶段的执行原则注入（§6.6）中增加「禁止修改 evaluators/ 目录」的显式约束。
  1. 隔离状态在 pipeline 创建时校验，校验发现问题时记录警告但不记录 advisory 并触发修复（OpenClaw 环境可能不支持 平台层隔离）。
- **输出**：隔离状态报告（Isolation Status），包含 平台层、ACP harness 层、prompt 层各层的生效状态。
- **执行阶段**：Pipeline Create（FR-12）的目录初始化步骤 + Implement（FR-05）的执行环境准备。
- **标准目录结构扩展**：
- **验收标准**：
  - AC-24.1：Pipeline Create 初始化项目目录时，自动创建 `evaluators/` 目录。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.2：OpenClaw 环境支持多用户隔离时，`evaluators/` 目录的文件权限设置为编码 Agent 执行用户只读（平台层）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.3：编码 Agent 的 session 配置中注入文件写入白名单，禁止写入 `evaluators/` 目录（L4 层）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.4：Implement 阶段的执行原则注入中包含「禁止修改 evaluators/ 目录」的显式约束（L6 层）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.5：编码 Agent 尝试写入 `evaluators/` 目录时，至少有一层隔离机制拒绝该写入并记录审计事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.6：OpenClaw 环境不支持 平台层隔离时，系统记录警告并依赖 L4 + L6 层兜底，不记录 advisory 并触发修复 pipeline 执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.7：隔离状态报告纳入 Pipeline Create 的产出工件，记录各层生效状态，可追溯。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-24.8：评估器的编写和修改只能由非 Coder 角色（Auditor、Architect、Product）执行，角色校验复用 FR-22 的角色-任务匹配机制。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-25 Hybrid Evaluation Mode（混合评估模式）

- **定位**：跨阶段机制。定义可执行评估器与 LLM 评估的协作模式——可执行评估器处理确定性检查（测试通过率、覆盖率、lint 分数、spec AC 覆盖），LLM 评估处理模糊判断（代码质量、架构合理性、命名可读性）。两者结果汇总为统一的advisory 判定。
- **输入**：可执行评估器结果集（FR-23 产出）、LLM 评估结论（现有 AdvisoryVerdict 产出）。
- **处理**：
  1. 可执行评估器先于 LLM 评估执行（fast-fail：确定性检查repair-required advisory时，标记为不适用并留证 LLM 评估，节省 token 和时间）。
  1. 可执行评估器全部 pass 后，触发 LLM 评估。
  1. LLM 评估接收可执行评估器的量化结果作为上下文（如覆盖率 95%、lint 违规 3 项），辅助做出更精准的模糊判断。
  1. 最终advisory 判定：可执行评估器任一 fail → 整体 fail；可执行评估器全 pass + LLM 评估 fail → 整体 fail；两者都 pass → 整体 pass。
  1. advisory 结果中明确标注每个判定的来源（evaluator / llm），便于定位问题。
- **输出**：混合评估结果（Hybrid Evaluation Result），包含可执行评估器结果集、LLM 评估结论和最终汇总判定。
- **执行阶段**：嵌入所有评审阶段的评估流程中，作为 FR-23 和现有 AdvisoryVerdict 的编排层。
- **验收标准**：
  - AC-25.1：可执行评估器在 LLM 评估之前执行，任一评估器 fail 时标记为不适用并留证 LLM 评估，质量检查判定为repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-25.2：可执行评估器全部 pass 后，LLM 评估自动触发，且接收评估器的量化结果作为评估上下文。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-25.3：最终advisory 判定遵循「任一层 fail 则整体 fail」的逻辑，不存在可执行评估器 fail 但质量检查 pass 的情况。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-25.4：advisory 结果中每个判定条目标注来源（evaluator / llm），可区分确定性检查发现问题和模糊判断发现问题。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-25.5：没有挂载可执行评估器时，质量检查完全退化为纯 LLM 评估，行为与 FR-23 引入前一致。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-25.6：混合评估结果作为质量检查工件的一部分，纳入 Ledger 证据链。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-25.7：LLM 评估的 prompt 中自动注入可执行评估器的量化摘要（如「测试通过率 100%，lint 违规 0 项，AC 覆盖率 95%」），LLM 不需要重复检查已有确定性结论的维度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-26 Ratchet Mechanism（棘轮机制）

- **定位**：跨阶段机制（可选）。针对性能优化、重构等改进类任务，支持固定时间预算内的自动试错——改进则保留，退步则自动回退（git reset）。棘轮机制是 Implement 阶段的可选增强，不影响常规开发流程。
- **触发条件**：项目配置中为特定 FR 或工作包启用棘轮模式（`ratchet: { enabled: true, timeBudgetSeconds: number, baselineMetric: string, baselineValue: number }`）。
- **输入**：工作包、基线指标（如测试执行时间、包体积、响应延迟）、时间预算、关联的可执行评估器（FR-23）。
- **处理**：
  1. Implement 阶段开始前，记录基线快照（git commit SHA + 基线指标值）。
  1. 编码 Agent 在时间预算内执行优化实现。
  1. 实现完成后（或时间预算耗尽时），运行关联的可执行评估器，获取优化后的指标值。
  1. 比较优化后指标与基线：改进（指标优于基线）→ 保留变更，提交 commit；退步（指标劣于基线）→ 自动 `git reset --hard` 到基线 SHA，记录回退原因。
  1. 时间预算耗尽且未产出改进 → 回退到基线，标记为「预算内未达成改进」，不视为 pipeline 发现问题。
  1. 棘轮结果写入 Stage Record，包含基线值、优化后值、是否保留、回退原因（如有）。
- **输出**：棘轮执行结果（Ratchet Result），包含基线快照、优化后指标、保留/回退决定和执行耗时。
- **执行阶段**：Implement（FR-05）的可选增强模式。
- **验收标准**：
  - AC-26.1：项目配置中可为特定工作包启用棘轮模式，配置包含时间预算、基线指标名称和基线值。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.2：棘轮模式启用时，Implement 阶段开始前自动记录基线快照（git commit SHA + 指标值）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.3：优化后指标优于基线时，变更被保留并提交；劣于基线时，自动 `git reset --hard` 到基线 SHA。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.4：时间预算耗尽且未产出改进时，自动回退到基线，不视为 pipeline 发现问题，Stage Record 中标记「预算内未达成改进」。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.5：棘轮执行结果纳入 Stage Record 和 Ledger 证据链，包含基线值、优化后值和保留/回退决定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.6：棘轮模式未启用时，Implement 阶段行为与 FR-05 定义完全一致，无任何副作用。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.7：棘轮的指标比较依赖可执行评估器（FR-23）产出的 score，不依赖 LLM 主观判断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-26.8：回退操作（git reset）执行前记录审计事件，包含回退原因、基线 SHA 和被丢弃的变更摘要。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-27 Flexible Stage Entry（任意阶段切入）

- **定位**：生命周期操作。允许用户从流水线的已具备准入条件阶段开始执行，而非强制从 spec 开始。这是 SEVO 开箱即用的核心能力——已有代码的项目可以从 implement、review、deploy 等阶段切入，但 plan/contract 阶段仍必须先由 SA 完成评估。
- **与 FR-12 的关系**：FR-27 复用 FR-12 的实例创建逻辑（Pipeline Create），在创建实例时识别用户指定的目标阶段，并对前置阶段逐项执行准入校验。FR-27 不是平行实现，而是 FR-12 创建流程的扩展入口。
- **触发条件**：用户通过 `sevo:create <project-slug> --from <stage>` 指定起始节点，或主会话调度时在 label 中包含 `from:<stage>` 标记。
- **输入**：Project 标识、目标起始阶段、任务描述。
- **合法阶段标识**：`specify`、`plan`、`implement`、`audit`、`deploy`。Advisory 阶段（`spec-review-gate`、`design-review`、`publish-generalization-evidence`）及辅助阶段（`test-case-authoring`、`smoke-test`、`ux-acceptance`、`e2e-verification`、`regression`、`ledger`）不允许作为切入点。指定 `implement`、`audit` 或 `deploy` 时，系统仍先执行 plan/contract 的 SA 评估；评估 pass-no-change 后才进入目标阶段。
- **处理**：
  1. 解析命令或 label：识别 `sevo:create <project> --from <stage>` 格式，或从任务 label 中提取 `from:<stage>` 标记。
  1. 未指定 `--from` 时，默认起始节点为 `specify`。
  1. 校验目标阶段是否在合法阶段标识列表中；若为 advisory 阶段或非法标识，返回错误。
  1. 校验 Project 是否已存在（已有代码/spec 的项目才能标记为不适用并留证前置阶段）。
  1. 若 `--from specify`，按 FR-12 默认创建流程执行。
  1. 若该 Project 已有 active pipeline（FR-12 AC-4.57），拒绝创建并返回错误提示。
  1. 在真正进入目标阶段前，先执行 spec 完整性检查：判断当前重入问题是否已有对应 FR/AC 覆盖，相关边界与验收是否完整。
  1. 若 spec 完整性检查未通过，则生成 advisory 并由主 Agent 澄清，主线保持 active流水线并先回到 Spec 阶段补齐；补齐并通过 Spec Review Advisory Check 后，再恢复到用户指定阶段继续推进。
  1. 调用 FR-12 的实例创建逻辑，对目标阶段之前的阶段逐项处理：specify 已覆盖时标记为 ready；spec-review-gate 仍必须执行；plan/contract 始终进入 SA 评估，结论为 pass-no-change 或 needs-update；design-review、implement-review-gate 仍必须执行。辅助节点如确实不适用，必须记录严格的不适用判定证据。
  1. 校验入口阶段合法性：若用户指定的阶段不在单一完整阶段注册表中，返回错误。
  1. 在 spec ready 且 plan/contract SA 评估通过后进入目标阶段，注入该阶段对应的 prompt 模板和质量质量检查。
  1. 从目标阶段开始，后续阶段按统一终局阶段链正常推进，不因中途切入而裁掉后续终局阶段。
- **输出**：FR 流程实例（含前置阶段准入记录、plan/contract SA 评估记录、起始阶段标识）。
- **执行阶段**：Pipeline Create 的扩展入口（复用 FR-12 实例创建逻辑）。
- **验收标准**：
  - AC-27.1：`sevo:create <project> --from <stage>` 命令被正确解析，合法阶段标识为 `specify`、`plan`、`implement`、`audit`、`deploy`；不指定 `--from` 时默认 `specify`。Advisory 阶段（`spec-review-gate`、`design-review`、`publish-generalization-evidence`）作为切入点时返回明确处理建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.1a：`sevo:from` 任意阶段入口在进入目标阶段前，必须先执行 spec 完整性检查；检查内容包括当前问题是否已有 FR/AC 覆盖、相关边界是否完整、用户可见行为是否已在 spec 中定义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.1b：spec 完整性检查结论为“未覆盖”或“不完整”时，流水线状态设为 spec-gap-advisory，自动回到 Spec 阶段补 spec；spec 补齐并通过 Spec Review Advisory Check 后，自动恢复到原用户指定阶段继续推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.2：起始阶段之前的阶段在 Stage Record 中保留明确状态；specify 可在已覆盖时标记为 ready，spec-review-gate 必须执行，plan/contract 必须记录 SA 评估结论（pass-no-change 或 needs-update），design-review 与 implement-review-gate 不得标记为不适用并留证；辅助节点若不适用，必须记录严格的不适用判定证据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.3：从目标阶段开始，后续阶段推进逻辑与从头创建的流水线完全一致（复用 FR-12 推进机制）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.4a：Project 目录不存在时，只允许从 `specify` 切入（等价于默认 `sevo:create`）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.4b：指定非 `specify` 起始阶段时，必须存在 spec 文件（`product-requirements.md`），否则拒绝。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.5：陌生用户通过 `sevo:create myproject --from implement` 可以对已有代码启动流程；系统先确认 spec ready，并完成 plan/contract SA 评估，再进入 implement→audit→deploy。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.6：主会话调度修复类任务时，可通过 label 中包含 `from:<stage>` 标记告知 SEVO 插件从哪个阶段切入。SEVO 插件解析 label 中的 `from:` 前缀，提取阶段标识后自动创建对应的流程实例。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.7：`sevo:create <project> --from specify` 等价于不带 `--from` 的 `sevo:create <project>`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.8：已有 active pipeline 的 Project 拒绝重复创建（引用 FR-12 AC-4.57）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-27.9：用户指定的阶段不在单一完整阶段注册表中时，返回明确处理建议提示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-28 Clean-Install Verification Advisory Check（发版前干净环境端到端验证）

- **定位**：发布阶段质量检查。FR-17（Post-Release Validation Advisory Check）验证的是「当前环境中 FR 是否覆盖」，但当前环境可能存在手动放置的文件、已有数据、历史配置等隐性依赖。本 FR 补全最后一公里：在隔离的干净环境中模拟陌生用户从零安装，验证产品端到端可用。
- **与 FR-17 的关系**：FR-17 是 FR 级差距扫描（代码覆盖 + 运行态存在性），FR-28 是环境级端到端验证（干净环境从安装到产出价值的完整链路）。FR-28 在 FR-17 通过之后、Ledger 之前执行。两者互补，不替代。
- **与 FR-19 AC-19.15 的关系**：AC-19.15 的 liveness verification 在当前环境执行 probe，FR-28 在隔离环境执行完整安装+初始化+功能验证。FR-28 覆盖范围更广（包含安装和初始化过程），liveness verification 覆盖深度更细（针对已部署服务的健康探针）。
- **触发条件**：FR-17 Post-Release Validation 通过（gaps === 0）后，流水线自动进入 clean-install-verification 阶段。
- **输入**：已发布的 npm 包名+版本、spec 中的 FR 列表、项目声明的运行态组件清单。
- **处理**：
  1. 创建隔离验证目录（`/tmp/stranger-verify-<instance-id>/`），确保不继承当前 workspace 的任何文件、环境变量或配置。
  1. 机械层验证：
  - `npm install -g <包名>@<版本>` 安装成功。
  - CLI 入口存在且 `--help` 正常输出。
  - `init` 命令执行成功，生成的配置文件完整且合法。
  - 错误提示可理解、可操作（非 stack trace）。
  1. 运行层验证：
  - init 后所有声称的运行态组件（hook、cron job、数据库文件、服务进程）都存在。
  - 每个运行态组件可被触发（hook 能响应事件、cron 脚本能手动执行、DB 能查询、服务能响应请求）。
  - 配置文件中引用的路径和依赖在隔离环境中都可解析。
  1. L3 价值层验证：
  - 每个 spec 中声明的核心功能，执行一次完整的端到端数据流：从用户输入到系统产出。
  - 产出必须是有意义的结果（非空数据库、非空报告、非默认模板、非报错）。
  - 首次使用路径在 5 分钟内可完成，且产出让用户感受到产品核心价值。
  1. 生成结构化验证报告（Clean-Install Verification Report），包含三层各检查项的 pass/fail 状态和发现问题详情。
  1. 清理隔离验证目录。
- **输出**：Clean-Install Verification Report（结构化 JSON + 人类可读摘要）。
- **记录 advisory 并触发修复条件**：任何一层存在 repair-required 项时，canComplete 记录为 advisory-open，流水线进入 repairing 并继续推进，Ledger 记录 open finding 后继续留痕。
- **执行阶段**：clean-install-verification（位于 post-release-validation 之后、ledger 之前）。
- **验收标准**：
  - AC-28.1：FR-17 通过后，流水线自动进入 clean-install-verification 阶段，无需人工触发。仅当项目没有安装入口、没有发布制品、没有外部用户可运行路径，且 review 报告记录三项证据同时成立时，clean-install-verification 才可标记为 not-applicable-with-evidence。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.2：验证在隔离目录中执行，该目录不包含当前 workspace 的任何文件、不继承项目特有的环境变量。验证结束后目录被清理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.3：机械层——`npm install -g`、CLI `--help`、`init` 命令三项全部通过才算机械层 pass。任一发现问题即整体 fail，附带具体错误输出。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.4：运行层——init 后项目声明的每个运行态组件（在 spec 或项目配置中注册）都存在且可触发。组件清单从项目的 `sevo.config.json` 或 spec 的 FR 描述中提取。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.5：L3 价值层——spec 中每个标记为核心功能的 FR，至少有一条端到端数据流验证通过（输入→处理→有意义产出）。「有意义」的判定标准：产出非空、非默认模板、非错误信息。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.6：验证报告包含 `{ l1: {pass, checks[]}, l2: {pass, checks[]}, l3: {pass, checks[]}, overall: pass|fail, repair-requiredChecks[] }` 结构。报告写入项目的 `docs/clean-install-report.json`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.7：验证发现问题时，自动生成修复任务列表（fixTasks），每条包含发现问题层级、检查项标识和修复建议。调度层负责派发修复任务，修复完成后重新发版并再次触发 FR-28 验证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.8：已有脚本 `scripts/npm-stranger-verify.sh` 作为机械层默认实现。运行层和有意义产出层验证逻辑由项目在 `sevo.config.json` 中声明验证步骤（`cleanInstallChecks.runtime[]` 和 `cleanInstallChecks.meaningful[]`），SEVO 引擎按声明顺序执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.9：单 Agent 用户也能走完 clean-install-verification。验证逻辑内置于 SEVO CLI（`sevo verify --clean-install`），不依赖专职验证 Agent。多 Agent 环境下由调度层派非开发 Agent 执行验证（禁止开发者自验）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-28.10（引擎与调度层职责边界）：SEVO 引擎在 post-release-validation 通过后自动触发 clean-install-verification 阶段，向调度层推送验证提醒。验证执行由调度层负责（派 Agent 或直接调用 `sevo verify --clean-install`）。验证结果回报给引擎，引擎根据 overall pass/fail 决定出具通过 advisory或进入 repairing 并继续推进。

### FR-29 Cascaded Endgame Gap Scan（级联终局差距扫描）

- **定位**：终局差距扫描的级联升级。当前差距扫描仅做文件级覆盖检查，无法发现「代码存在但 AC 未覆盖」和「功能存在但运行态无意义产出」两类深层缺口。本 FR 将终局差距扫描升级为三段体系（文件级 → AC 级 → 运行态），逐层加深验证粒度，确保发版产物从「代码存在」到「功能可用且有意义」全链路闭合。
- **与 FR-17 的关系**：FR-17 定义 Post-Release Validation Advisory Check 的整体框架，FR-29 细化其中「差距扫描」环节的分层执行标准和触发时机。FR-17 是质量检查容器，FR-29 是质量检查内部的扫描引擎规格。
- **与 FR-28 的关系**：FR-28 在隔离干净环境中做端到端验证（陌生用户视角），FR-29 在当前开发环境中做 spec→代码→运行态的逐层对照（开发者视角）。FR-28 验证「装上能用」，FR-29 验证「每条需求都有实现且实现有效」。两者互补，不替代。

#### 文件级扫描（快速覆盖检查）

- **目标**：确认每个 FR 有对应代码文件、编译通过、测试全绿。
- **触发时机**：每次 implement 阶段完成后自动触发。
- **耗时预期**：10 分钟内。
- **检查内容**：
  - 每个 FR 至少有一个对应的源码文件（通过项目的 FR→文件映射表或目录约定判定）。
  - `tsc`（或项目对应的编译命令）零错误通过。
  - 项目测试套件全绿（`npm test` 或等效命令退出码为 0）。
- **产出**：文件级扫描报告（`docs/gap-scan-l1.json`），包含每个 FR 的 covered/uncovered 状态和编译/测试结果。

#### AC 级深度扫描（三阶段语义流水线）

- **目标**：逐条 AC 对照代码逻辑，确认每条 AC 都有实现代码和对应测试。采用三阶段流水线架构，在保证语义准确性的同时将 token 消耗降低 95% 以上（相比逐条 AC 独立调用 LLM）。
- **触发时机**：endgame 阶段发版前强制执行；支持独立 cron 定期扫描（不依赖 pipeline endgame 触发）。
- **耗时预期**：5-15 分钟（三阶段流水线，LLM 调用次数 ≤ 批次数 + 可疑项数）。
- **扫描范围**：通过 `scanDirs` 配置项指定待扫描目录列表（相对于项目根目录），默认扫描整个项目（`['.']`），不限于 `src/`。支持配置 `extensions`（文件扩展名白名单）和 `ignoreDirs`（忽略目录黑名单）。
- **三阶段架构**：**Phase 1: Code Map Generation（纯静态分析，零 LLM 调用）****Phase 2: Batch Triage（批量初筛，1-N 次 LLM 调用）****Phase 3: Precise Verification（精确验证，仅对可疑项）**
  - 遍历所有配置的 scanDirs，对每个源码文件提取：相对路径、导出符号列表（函数/类/变量名）、文件头注释摘要。
  - 产出紧凑文本表示（每文件约 100-200 字符），作为 Phase 2 的输入上下文。
  - 不依赖 LLM，纯文件系统读取 + 正则提取，确保零成本、确定性、可重复。
  - 将全部 AC 列表与 Phase 1 产出的代码地图一起发送给 LLM（利用大 context window 模型一次性处理）。
  - 按 `batchSize`（默认 150 条 AC/批）分批，每批一次 LLM 调用。
  - LLM 对每条 AC 做三分类：`covered`（代码地图中有充分证据）、`suspect`（有部分证据但不确定）、`uncovered`（无证据）。
  - 对 covered/suspect 的 AC，标注最可能的实现文件路径。
  - 禁止关键词匹配、正则表达式或文件名推断作为分类依据，必须基于语义理解。
  - 仅对 Phase 2 判定为 `suspect` 或 `uncovered` 的 AC 执行精确验证。
  - 读取 Phase 2 标注的候选文件实际源码内容，连同 AC 描述发送给 LLM。
  - LLM 判定每条 AC 的最终状态（covered/uncovered/needs-review）、置信度评分、证据文件路径和行号范围。
  - 低置信度（<0.7）的映射标记为 needs-review。
- **Token 效率**：三阶段设计将 LLM 调用从 O(AC数量) 降低到 O(批次数 + 可疑项数量)。典型项目（~285 文件、~50 条 AC）总消耗约 30K tokens，相比逐条调用（~6.5M tokens）降低 99%+。
- **产出**：AC 覆盖率报告（`docs/gap-scan-l2.json`），每条 AC 标注 covered/uncovered/needs-review + 置信度 + 证据文件路径 + 代码行号范围。扫描日志（`docs/gap-scan-l2-log.json`）记录每次 LLM 调用的 prompt 和响应，确保可追溯。

#### L3 运行态验证（活性与有意义产出验证）

- **目标**：在真实环境中触发功能，验证产出非空且有意义。
- **触发时机**：npm publish 成功后 OR 任何涉及「用户可感知功能」的 implement 阶段完成后。「用户可感知功能」定义：改动涉及 hook、cron、CLI 行为、配置模板、init 流程、Web 页面等用户运行时能接触到的组件。
- **耗时预期**：视项目规模，15-60 分钟。
- **检查内容**（按项目类型分类）：
  - CLI 工具：执行核心命令，检查退出码为 0 且 stdout 包含有意义输出（非空、非纯 help 文本、非错误信息）。
  - Web 服务：启动服务，访问核心页面，验证 HTTP 200 且响应体包含业务内容（非空白页、非默认 404）。
  - Hook/Plugin：触发对应事件，验证 handler 执行且产生可观测副作用（日志、文件写入、状态变更）。
  - Library：import 核心模块，调用核心 API，验证返回值类型正确且内容有意义（非 null、非空对象、非默认值）。
- **「有意义」判定标准**：产出能让用户感知到功能在工作——非空、非默认模板、非错误信息、非占位符。具体判定由 LLM 对产出内容做语义评估。
- **产出**：运行态验证报告（`docs/gap-scan-l3.json`），每个功能域标注 alive/dead + 验证命令 + 实际输出摘要 + 判定理由。

#### 流水线集成

- 文件级扫描在 review 阶段自动触发（扩展现有 ImplementationReviewAdvisoryCheck）。
- AC 级扫描在 endgame 阶段发版前触发（新增 ACCoverageAdvisory）。
- L3 在 post-release 阶段触发（npm publish 后），或在涉及用户可感知功能的 implement 阶段完成后触发（与 FR-28 Clean-Install Advisory 协同，FR-29 L3 先于 FR-28 执行）。
- 任何一层repair-required advisory = 记录 advisory 并触发修复当前阶段，必须修复后复验。
- 三层扫描结果汇总写入 `docs/gap-scan-summary.json`，供 Ledger 阶段归档。

#### 验收标准

- AC-29.1（文件级扫描自动触发）：implement 阶段完成后，流水线自动触发 文件级扫描，无需人工干预。扫描在 10 分钟内完成。扫描结果写入 `docs/gap-scan-l1.json`。
- AC-29.2（文件级扫描记录 advisory 并触发修复逻辑）：文件级扫描发现任一 FR 无对应代码文件、编译发现问题或测试发现问题时，阶段状态为 repairing，流水线下一步 advance prompt 指向修复/复验并继续推进。repair-required advisory 信息包含具体发现问题 FR 编号和问题原因。
- AC-29.3（文件级扫描产出格式）：文件级扫描报告为结构化 JSON，包含 `{ frId, status: "covered"|"uncovered", compilePassed: boolean, testsPassed: boolean, evidence: { files: string[] } }` 数组。
- AC-29.4（AC 级扫描 Phase 1 代码地图生成）：AC 级扫描的 Phase 1 遍历所有配置的 scanDirs，对每个匹配文件提取相对路径、导出符号列表和文件头注释。Phase 1 不调用 LLM（零 token 消耗）。验证方式：mock 文件系统执行 Phase 1，确认产出包含所有目标文件且无 LLM 调用记录。
- AC-29.5（AC 级扫描范围可配置）：AC 级扫描通过 `scanDirs` 参数接受目录列表（相对于项目根目录），默认值为 `['.']`（整个项目）。支持 `extensions`（文件扩展名白名单）和 `ignoreDirs`（忽略目录黑名单）配置。验证方式：配置 `scanDirs: ['src/', 'scripts/']` 后执行扫描，确认只有这两个目录下的文件出现在代码地图中。
- AC-29.6（AC 级扫描 Phase 2 批量初筛）：Phase 2 将 AC 列表与代码地图合并为 prompt，按 batchSize 分批发送给 LLM。每批一次 LLM 调用，对每条 AC 返回三分类结果（covered/suspect/uncovered）及候选文件路径。禁止使用关键词匹配、正则表达式或文件名推断作为分类依据。验证方式：50 条 AC + batchSize=150 时，Phase 2 LLM 调用次数 = 1；batchSize=25 时调用次数 = 2。
- AC-29.7（AC 级扫描 Phase 3 精确验证）：Phase 3 仅对 Phase 2 判定为 suspect 或 uncovered 的 AC 执行。读取候选文件实际源码，发送给 LLM 做精确语义验证。Phase 2 判定为 covered 的 AC 不进入 Phase 3（标记为不适用并留证验证）。验证方式：Phase 2 返回 40 covered + 10 suspect 时，Phase 3 仅处理 10 条。
- AC-29.8（AC 级扫描 Token 效率）：三阶段流水线的总 LLM token 消耗相比逐条 AC 独立调用降低 95% 以上。验证方式：对同一项目分别执行三阶段流水线和逐条调用（或计算理论值），对比总 token 数，流水线 ≤ 逐条的 5%。
- AC-29.9（AC 级扫描触发时机与独立扫描）：endgame 阶段发版前，流水线自动触发 AC 级扫描。AC 级扫描在文件级扫描通过的前提下执行（文件级扫描未通过则 AC 级扫描不触发）。支持独立触发：通过 CLI 命令（`sevo scan --kind ac`）或 cron 定时任务直接执行 AC 级扫描，不依赖 pipeline endgame 阶段。验证方式：(a) endgame 阶段文件级扫描通过后 AC 级扫描自动触发；(b) 手动执行 `sevo scan --kind ac` 成功产出报告。
- AC-29.10（AC 级扫描记录 advisory 并触发修复逻辑）：AC 级扫描发现任一 AC 最终状态为 uncovered（Phase 3 确认无实现代码）时，阶段状态为 repairing，流水线下一步 advance prompt 指向修复/复验并继续推进。needs-review 状态不自动记录 advisory 并触发修复，但写入报告供人工确认。验证方式：构造一条无实现的 AC，执行 AC 级扫描后确认阶段状态为 repairing。
- AC-29.11（AC 级扫描产出格式）：AC 级扫描报告为结构化 JSON，包含 `{ frId, acId, status: "covered"|"uncovered"|"needs-review", confidence: number, evidence: { file: string, lineRange: [number, number], testFile?: string } }` 数组。扫描日志为独立 JSON 文件，记录每次 LLM 调用的 prompt 摘要和完整响应，确保映射过程可追溯。验证方式：执行 AC 级扫描后，报告文件和日志文件均存在且 JSON schema 校验通过。
- AC-29.12（AC 级扫描语义约束）：AC 级扫描全流程（Phase 2 初筛 + Phase 3 验证）的 LLM prompt 明确禁止关键词匹配、正则表达式和文件名推断。System prompt 中包含该约束声明。验证方式：检查 AC 级扫描器的 system prompt 常量，确认包含禁止关键词匹配/正则/文件名推断的明确指令。
- AC-29.13（L3 运行态验证）：L3 扫描在真实环境中执行功能，验证产出「有意义」而非仅「命令能跑」。判定标准：产出非空、非默认模板、非错误信息、非占位符，由 LLM 对实际输出做语义评估并给出判定理由。
- AC-29.14（L3 触发时机）：以下任一条件满足时，流水线自动触发 L3 扫描：(a) npm publish 成功后；(b) 任何涉及「用户可感知功能」的 implement 阶段完成后。L3 在 FR-28 Clean-Install Verification 之前执行（L3 验证当前环境，FR-28 验证干净环境）。
- AC-29.15（L3 记录 advisory 并触发修复逻辑）：L3 扫描发现任一功能域状态为 dead（退出码非 0、响应异常、产出为空或无意义）时，阶段状态为 repairing，下一步 advance prompt 指向修复/复验，同时保留 FR-28 验证队列。repair-required advisory 信息包含功能域标识、验证命令、实际输出和发现问题判定理由。
- AC-29.16（L3 产出格式）：L3 报告为结构化 JSON，包含 `{ domain: string, status: "alive"|"dead", verifyCommand: string, actualOutput: string (truncated to 1KB), judgment: string, evidence: { exitCode?: number, httpStatus?: number, sideEffect?: string } }` 数组。
- AC-29.17（三层汇总）：三层扫描完成后，自动生成汇总报告 `docs/gap-scan-summary.json`，包含 `{ l1: { pass: boolean, total: number, covered: number }, l2: { pass: boolean, total: number, covered: number, needsReview: number }, l3: { pass: boolean, total: number, alive: number }, overall: "pass"|"fail", timestamp: string }`。汇总报告供 Ledger 阶段归档。
- AC-29.18（单 Agent 兼容）：单 Agent 环境下，级联扫描均可由同一 Agent 执行（通过 `sevo scan --kind file|ac|runtime|all` 命令触发）。多 Agent 环境下，AC 级扫描和运行态扫描由非开发 Agent 执行（禁止开发者自验）。
- AC-29.19（用户可感知功能定义）：「用户可感知功能」指改动涉及以下任一组件：hook handler、cron 定时任务、CLI 命令/子命令行为、配置模板（init 生成的文件）、init/setup 流程、Web 页面/API 端点。判定依据：陌生用户在运行时能否接触到该组件。若能接触到，则该改动属于用户可感知功能变更，implement 完成后必须触发 L3 扫描。
- AC-29.20（可达性验证）：L3 扫描内容必须包含可达性检查——新实现的功能，陌生用户通过 `npm install` + `init` 后能否自动获得？如果不能自动获得，是否有 init/setup 命令自动配置？发现「代码存在但用户不可达」的功能（代码在仓库中但用户正常安装流程无法触达）= P0 记录 advisory 并触发修复，必须修复后复验。
- AC-29.21（独立仓库同步质量检查）：implement 完成后如果涉及用户可感知功能变更，L3 扫描必须验证改动已同步推送到项目的独立 GitHub 仓库。仅存在于主仓库（monorepo）但未同步到独立仓库的用户可感知功能变更 = P0 记录 advisory 并触发修复。验证方式：对比独立仓库最新 commit 与主仓库对应目录的 diff，diff 非空则记录 advisory 并触发修复。

### FR-33 MECE Validation & Dependency Analysis（MECE 验证与依赖分析）

- **定位**：Design 阶段的工作包质量校验机制。验证工作包拆分满足 MECE 原则（Mutually Exclusive, Collectively Exhaustive），并分析工作包间的依赖关系和执行顺序，检测循环依赖。
- **与 FR-03 的关系**：FR-03 AC-4.10 要求「工作包拆分后可分派、可验收、可追责」，本 FR 定义实现该要求的具体校验算法——MECE 验证确保拆分无重叠无遗漏，依赖分析确保执行顺序合理。
- **触发条件**：Design 阶段产出工作包列表后，自动执行 MECE 验证和依赖分析。
- **输入**：tasks（WorkPackage 列表，每个包含 id、frIds、dependencies）、allFrIds（可选，全量 FR ID 列表用于 CE 检查）。
- **处理**：
  1. **互斥性检查（ME）**：两两比对工作包的 frIds，检测是否存在同一 FR 被多个工作包覆盖的情况。存在重叠时记录具体重叠的 WP 对和共享 FR。
  1. **穷尽性检查（CE）**：汇总所有工作包覆盖的 FR，与全量 FR 列表比对，识别未被任何工作包覆盖的 FR。
  1. **依赖图构建**：从工作包的 dependencies 字段构建有向依赖图，填充 dependsOn 字段，标记无依赖的工作包为可并行执行。
  1. **循环依赖检测**：使用拓扑排序（Kahn 算法）检测依赖图中的环。存在环时报告参与环的工作包 ID。
  1. **修复建议生成**：对每个 MECE 违规和循环依赖生成可操作的修复建议。
- **输出**：
  - MECE 验证结果（valid、mutuallyExclusive、collectivelyExhaustive、overlaps、uncoveredFrIds、suggestions）。
  - 依赖分析结果（tasks with dependsOn populated、hasCycle、cycleDetails、dependencyGraph）。
- **执行阶段**：Design 阶段内部。
- **验收标准**：
  - AC-33.1：同一 FR 出现在两个及以上工作包的 frIds 中时，mutuallyExclusive = false，overlaps 列出具体重叠的 WP 对和共享 FR ID。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-33.2：提供 allFrIds 时，任一 FR 未被任何工作包覆盖则 collectivelyExhaustive = false，uncoveredFrIds 列出遗漏的 FR。valid = true 当且仅当 ME 和 CE 同时满足。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-33.3：依赖图存在环时 hasCycle = true，cycleDetails 列出参与环的工作包 ID。无环时所有工作包可按拓扑序执行，无依赖的工作包标记为 parallel = true。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-34 Incremental FR Lifecycle（增量 FR 生命周期管理）

- **定位**：生命周期操作。为已有项目追加的增量 FR 提供从 implement 到 publish 的子流程触发能力。解决的核心问题：项目已有完整 pipeline 历史，PM 在 spec 中新增了 FR，但 `sevo:create` 报「已存在」。FR-27 的 `sevo:create --from` 会重跑整个项目而非聚焦单个 FR，本 FR 提供精确到单个 FR 粒度的增量推进入口。
- **与 FR-12 的关系**：FR-12 为项目创建首次 FR 流程实例（全量 pipeline）。FR-34 为已有项目中新增的 FR 创建增量流程实例，复用 FR-12 的实例创建逻辑；spec 阶段可因目标 FR 已存在而标记为已就绪，plan/contract 阶段必须由 SA 评估。
- **与 FR-27 的关系**：FR-27 允许从任意阶段切入但作用于整个项目。FR-34 作用于项目中的特定 FR，只推进该 FR 相关的实现子流程。
- **与 FR-13 的关系**：增量流程实例创建后，由 PipelineEngine（FR-13）接管后续生命周期推进，复用相同的状态机和阶段流转逻辑。
- **触发条件**：用户通过 CLI 命令 `sevo fr advance <project-slug> --fr <fr-id>` 触发，或主会话调度时在 label 中包含 `fr-advance:<project>:<fr-id>` 标记。
- **输入**：Project 标识（project-slug）、目标 FR 标识（fr-id）、可选的任务描述补充。
- **处理**：
  1. 校验 Project 存在且有历史 pipeline 记录（至少有一个 completed 或 repair-required 的流程实例）。
  1. 校验目标 FR 存在于项目的 spec 文件（`product-requirements.md`）中——通过解析 FR 编号格式匹配。
  1. 校验该 FR 没有正在进行的 active 流程实例（同一 FR 同时只能有一个 active 实例）。
  1. 生成增量流程实例 ID（格式：`fr-<project-slug>-<fr-id>-<yyyyMMdd>-<seq>`）。
  1. 将 spec 阶段标记为 ready（理由：「目标 FR 已在 spec 中定义」），随后必须执行 spec-review-gate（mandatory, never not-applicable）确认该 spec 覆盖本次增量变更。plan/contract 阶段派发给 SA 评估，评估结论为 pass-no-change 或 needs-update；若结论为 needs-update，先完成架构更新和复验，再进入 implement。若项目有 arc42 架构文档，将其作为 plan/contract 与 implement 阶段的输入上下文注入。
  1. 确定增量流程的阶段队列：spec-ready → spec-review-gate（mandatory, never not-applicable）→ plan/contract（SA 评估）→ design-review（mandatory, never not-applicable）→ implement → implement-review-gate（mandatory, never not-applicable）→ regression → publish。不按任务分级裁剪主链；specify、spec-review-gate、plan/contract、design-review、implement、implement-review-gate 均为 mandatory, never not-applicable。regression 作为辅助验证节点，只有在本轮没有代码、配置、依赖、运行时行为、发布制品或外部交付物变化，且 review 报告记录全部证据时，才可标记为 not-applicable-with-evidence。
  1. 创建增量流程实例记录，状态设为 created。
  1. 向 PipelineEngine（FR-13）发送 pipeline-created 事件，PipelineEngine 接管后续推进。
  1. implement 阶段的 prompt 自动注入：目标 FR 的完整定义（从 spec 提取）、关联的 AC 列表、项目架构上下文（若存在）。
- **输出**：增量 FR 流程实例（含实例 ID、目标 FR 绑定、spec ready 记录、plan/contract SA 评估记录、阶段队列）。
- **执行阶段**：Pipeline Create 的增量入口（复用 FR-12 实例创建逻辑的子集）。
- **验收标准**：
  - AC-34.1：`sevo fr advance <project-slug> --fr <fr-id>` 命令被正确解析。project-slug 不存在时返回错误「项目不存在」；fr-id 在 spec 中不存在时返回错误「FR 未在 spec 中定义」。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.2：增量流程实例的 spec 阶段在 Stage Record 中标记为 ready，理由为「目标 FR 已在 spec 中定义」；随后 spec-review-gate 必须执行并通过，确认 spec 覆盖本次增量变更；contract 阶段由 SA 评估后标记为 pass-no-change 或 needs-update，并记录评估结论和证据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.2a：增量流程的 specify、spec-review-gate、plan/contract、design-review、implement、implement-review-gate 均为 mandatory, never not-applicable；任何路由或辅助节点不适用判定不得移除这些主链节点。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.3：增量流程实例创建后，PipelineEngine 自动接管并在 spec-review-gate、plan/contract 与 design-review 通过后触发 implement 阶段执行，implement 阶段的执行上下文包含目标 FR 的完整定义和 AC 列表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.4：同一 FR 已有 active 流程实例时，创建请求被拒绝并返回错误「该 FR 已有进行中的流程实例」。不同 FR 的增量流程可以与项目的其他增量流程并行存在（受 Agent 资源池约束）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.5：增量流程的 review 阶段复用 FR-06 的审计逻辑，审计范围限定为目标 FR 相关的代码变更。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.6：增量流程的 publish 阶段复用 FR-19 的终局交付链逻辑。若项目配置了版本管理，自动 bump patch 版本。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.7：增量流程完成后，Ledger 中生成独立的 Entry，记录该 FR 从 implement 到 publish 的完整证据链，可追溯到项目的 spec 版本。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.8：一个项目可以有多个已完成的增量流程实例（每个对应不同的 FR），Ledger 按时间线聚合展示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.9：`sevo status` 和 Web 驾驶舱能区分显示全量 pipeline 和增量 FR 流程实例，增量实例标注关联的 FR 编号。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.10：主会话调度时，label 中包含 `fr-advance:<project>:<fr-id>` 标记可被 SEVO 插件识别并自动创建增量流程实例，无需用户手动执行 CLI。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-34.11：`inferProjectSlug` 从已注册 pipeline 列表动态推断 project-slug，不硬编码项目名。新注册的项目无需修改源码即可被正确识别和路由。静态项目名列表仅作为尚未注册 pipeline 的新项目的 fallback。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-35 Full R&D Activity Pipeline Enforcement & Pre-Publish Stranger Verification（全研发活动强制流水线 + 发布前陌生人验证）

**场景**

任何软件研发项目发生会改变项目产物的研发动作时，SEVO 必须在动作开始前决定是否创建或复用流水线。研发动作包括 spec 编写/修改、架构设计、UX/交互设计、代码开发、测试、审计、发布，以及 README、配置、发布脚本、GitHub 推送等交付链动作。文件路径只用于判断动作归属哪个项目，不得用于判断动作是否需要流水线。

SEVO 管理范围覆盖一切软件研发项目。有独立仓库、项目配置或历史 pipeline 的项目属于已注册项目；没有独立仓库或配置的新项目，也可以通过 `sevo:create <project-slug>` 从 0 创建项目目录、spec 和流水线，不要求预先存在 GitHub 仓库。

**人群**

- 使用 Agent 研发软件项目的用户：需要所有研发动作默认受控，不依赖主会话记忆临时判断。
- PM / SA / UX / Coder / Auditor / Release 角色：分别负责 spec、架构、体验、实现、审计和发布动作，需要在各自动作开始前获得对应流水线上下文。
- OpenClaw 环境管理者：需要用可审计规则约束插件、入口脚本、发布链和项目源码，避免治理范围随路径变化漂移。

**用户故事旅程**

Stage 1：识别研发动作

- 触发条件：用户或主会话发起与软件研发项目有关的 spec、架构、UX、开发、测试、审计、发布、README、配置或交付链动作。
- 核心动作：系统先做动作类型判定，再做项目归属识别；无法归属到已注册项目时，给出新项目创建建议。
- 阶段产出：研发动作类型、目标 Project、建议起始阶段。
- 转换条件：动作会修改项目产物或承担研发阶段职责时进入 Stage 2；仅纯查询、纯调研、纯宿主环境配置检查且不修改项目产物时结束。

Stage 2：确认流水线上下文

- 触发条件：Stage 1 判定为软件研发动作。
- 核心动作：系统检查是否存在对应活跃 pipeline；不存在时记录 advisory 并触发修复动作并提示创建命令。未注册项目通过 `sevo:create <project-slug>` 初始化项目目录、spec 和 pipeline。
- 阶段产出：活跃 pipeline 上下文，或带 project-slug 与起始阶段建议的记录 advisory 并触发修复提示。
- 转换条件：存在活跃 pipeline，或用户按提示创建 pipeline 后进入 Stage 3。

Stage 3：按动作类型进入对应阶段

- 触发条件：流水线上下文就绪。
- 核心动作：系统按动作类型路由到 Specify、Plan、UX Interaction Design、Implement、Review / Audit、Deploy 等阶段，并按“一个任务 = 一个角色 = 一个研发阶段”拆分派发。
- 阶段产出：阶段任务、阶段输入工件、阶段验收标准和可追溯执行记录。
- 转换条件：阶段任务完成并通过对应质量检查后进入 Stage 4；repair-required advisory则进入修复循环。

Stage 4：发布链闭环

- 触发条件：动作进入发布或交付链。
- 核心动作：系统把 README / 发布文档更新、版本整理、制品生成、npm 发布、GitHub 推送纳入流水线，并在 publish 前执行 stranger-ready advisory。
- 阶段产出：发布包、GitHub 推送结果、stranger-ready advisory 证据、Ledger 记录。
- 转换条件：发布链全部通过后流水线进入后续 Verify / Ledger；发现问题时保持记录 advisory 并触发修复并输出修复建议。

**痛点**

- 只按 `projects/*/src/` 识别覆盖范围会漏掉插件、入口脚本、README、配置和发布动作。
- spec、架构、UX、测试、审计、发布等非代码动作如果不走同一条流水线，会造成责任链和证据链断裂。
- 把“受管项目”理解成固定枚举，会让新项目、未建仓项目和临时项目落到流程外。
- 一个 task prompt 同时打包 spec、架构、实现和审计，会造成角色越权、阶段证据缺失和审计自证。
- “默认不做准入校验，靠人记得走流程”会把豁免变成常态，导致质量质量检查失效。
- 用户需要默认受控、例外显式授权，而不是每次争论“这次改动算不算研发”。

**需求**

- R-35.1：覆盖范围必须按动作类型定义，覆盖 spec、架构、UX、开发、测试、审计、发布全链路。
- R-35.2：路径只能用于项目归属识别和路由实现，不能收缩覆盖范围。
- R-35.3：SEVO 管理范围覆盖一切软件研发项目；已注册项目通过仓库、项目配置或历史 pipeline 识别，未注册项目可通过 `sevo:create` 从 0 初始化。
- R-35.4：默认路由到流水线；只有流水线自身设计缺陷导致无限循环，或用户主动授权豁免两种情况允许标记为不适用并留证，并留下审计记录。
- R-35.5：每次 spawn 的任务只能属于一个研发阶段、一个角色类型；禁止跨角色、跨阶段打包。
- R-35.6：发布链动作必须纳入流水线，覆盖 README / 发布文档更新、版本整理、制品生成、npm 发布、GitHub 推送。
- R-35.7：publish 前必须执行 stranger-ready advisory，验证陌生用户开箱即用性。

**解决方案**

产品定位：围绕使用 Agent 研发软件项目的用户对流程未接入和质量失控的痛点，SEVO 通过按动作类型默认路由、按路径辅助归属、显式豁免审计、阶段化任务拆分和发布前 stranger-ready advisory，解决 spec、架构、UX、开发、测试、审计、发布全链路治理断裂的问题。

用户体验流：

1. 用户发起软件研发动作；AI 识别动作类型与目标 Project；交互形态为路由判定提示；关联 FR-35。
1. 用户无需判断路径是否命中 `src/`；AI 使用路径、项目配置、仓库信息和历史 pipeline 推断项目归属；交互形态为 project-slug / stage 判定结果；关联 FR-35。
1. 用户看到动作被接入或记录 advisory 并触发修复；AI 检查活跃 pipeline，不存在时给出 `sevo:create <project-slug>` 或 `sevo:create <project-slug> --from <stage>`；交互形态为记录 advisory 并触发修复提示或阶段任务；关联 FR-35、FR-27。
1. 用户按阶段完成研发动作；AI 注入阶段规则并收集工件；交互形态为单阶段任务、advisory 结果和修复任务；关联 FR-35、FR-13。
1. 用户触发发布链；AI 将 README、版本、制品、npm 发布、GitHub 推送和 stranger-ready advisory 串成闭环；交互形态为发布结果与 Ledger 证据；关联 FR-35、FR-19。

功能需求：

1. **动作类型优先判定**：插件优先判断任务是否属于软件研发动作。研发动作至少包括：spec 编写/修改、架构设计、UX/交互设计、代码开发、测试/回归/审计、README 更新、配置修改、版本整理、制品生成、发布、GitHub 推送。只要任务会修改项目产物或承担研发阶段职责，即默认进入流水线。
1. **项目归属动态识别**：项目归属通过项目配置、仓库信息、历史 pipeline、项目根目录和关联工件动态推断。已注册项目直接绑定现有 project-slug；无法归属但属于软件研发动作时，系统生成候选 project-slug，并提示通过 `sevo:create <project-slug>` 初始化。
1. **默认路由，豁免例外**：命中软件研发动作后，系统必须创建或复用对应项目的活跃 pipeline。只有两种情况允许标记为不适用并留证流水线：(1) SEVO 流水线自身存在设计缺陷导致无限循环无法完成任务，任务描述必须说明循环原因；(2) 用户（项目 Owner）主动授权豁免，任务描述必须引用用户原话作为授权证据。其他一切情况，无论 label 前缀如何，都必须走流水线。豁免记录必须包含授权来源、用户原话或循环原因、豁免范围、豁免原因和时间戳。审计是流水线里最核心的质量检查环节，因为自动化流水线的魂就是用自动化质量检查和自动修复来兜住产出质量。审计留在流水线内，审计发现问题后才能自动回退到 Implement，带着问题清单进入修复，再自动回到 Review 复验，形成 review→fix loop。审计一旦脱离流水线，问题虽然能被发现，但后续修复、复验、出具通过 advisory都要人工重新接回，闭环会当场断掉。流水线的价值就在自动闭环，任何一个环节脱离，闭环都会被打断。
1. **路径只作归属识别**：路径规则只回答“归哪个项目”，无法回答“要不要走流水线”。项目路径、扩展目录、入口脚本、README、配置文件和发布脚本都不得作为标记为不适用并留证流水线的理由。
1. **任务粒度约束**：每次 spawn 的任务只能属于一个研发阶段，阶段枚举为 specify / plan / implement / review / release；每次 spawn 的任务只能由一个角色类型执行，角色类型包括 PM 写 spec、SA 写架构、Dev 写代码、Auditor 审计、Release 执行发布。禁止在一个 task prompt 中要求 agent 同时完成多个阶段的产出。
1. **单 Agent 环境分步执行**：即使环境中只有一个 agent 可用，也必须按阶段分步执行：先 spawn 做 spec 阶段，完成并沉淀工件后，再 spawn 做 implement 阶段。没有多角色 agent 池时，可以用同一个 agent 客串不同角色，但任务仍必须一步一步走，不得把多个阶段打包成一个 prompt。
1. **分步派发必须接入流水线**：即使 spawn 的 label 不含 `sevo:` 前缀，只要 task prompt 语义上是在做软件研发动作，插件仍必须路由到 SEVO；不要通过把 README 更新、插件修改、测试执行、GitHub 推送拆成多个小步骤脱离流水线引导。
1. **活跃 pipeline 校验**：对 Specify / Plan / UX / Implement / Review / Audit / Deploy 阶段任务，插件检查是否存在对应的活跃 pipeline 实例。不存在时记录 advisory 并触发修复执行，并提示 `sevo:create <project-slug>` 或 `sevo:create <project-slug> --from <stage>`。
1. **非研发例外边界**：仅纯查询、纯调研、纯宿主环境配置检查且不修改项目产物的任务可不创建 pipeline。凡是承担项目测试、审计、发布职责，或会写入 spec、架构文档、测试文件、配置、README、发布脚本、源码、产物的任务，都必须进入路由判定。
1. **Stranger-Ready Advisory**：pipeline 的 publish 阶段执行前，插件检查 stranger-ready advisory 是否通过。advisory 执行 `scripts/npm-stranger-verify.sh` 或项目配置的等效验证脚本，在干净环境中验证产物对陌生用户的开箱即用性。
1. **Advisory 修复处理**：stranger-ready advisory 发现问题时，pipeline 状态设为 `publish-repairing`，记录问题原因（脚本 stderr + exit code），输出修复建议，修复 task 完成事件自动触发复验 advisory。
1. **Advisory 标记为不适用并留证机制**：项目 pipeline 配置中声明 `strangerVerify: false` 时，stranger-ready advisory 自动标记为 not-applicable-with-evidence（标记为不适用并留证理由：“项目配置声明非 npm 包，标记为不适用并留证陌生人验证”）。CLI 支持 `--not-applicable-stranger-verify` 参数作为运行时覆盖。
1. **语义判定**：路由判定使用 LLM 语义理解，分析 task prompt 内容判断是否涉及软件研发动作。禁止纯关键词匹配、FTS5 或正则表达式冒充语义理解。
- **输入**：spawn 请求（label + task prompt + 目标 agent）、已注册 pipeline 列表、项目 pipeline 配置、项目归属识别规则。
- **输出**：路由决策（pass/advisory + 理由 + project-slug + stage）、任务粒度判定（pass/advisory + stage + roleType）、豁免记录（如有）、stranger-ready advisory 结果（pass/fail/not-applicable-with-evidence + 证据）。
- **执行阶段**：Pipeline Governance（贯穿所有阶段的治理层）。
- **验收标准**：
- AC-35.1：一切软件研发项目都属于 SEVO 管理范围。已注册项目通过仓库、项目配置或历史 pipeline 识别；未注册项目命中研发动作时，系统可以自主给出 `sevo:create <project-slug>` 初始化项目目录、spec 和 pipeline，不要求预先存在 GitHub 仓库。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.2：涉及 spec 文件编写或修改的任务进入路由判定并绑定对应流水线，不允许把 spec 改动视为流水线外动作。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.3：架构设计、UX 设计、implement、review、audit、deploy 阶段任务，若没有对应的活跃 pipeline 实例，插件记录 advisory 并触发修复执行并返回提示“该项目需要活跃的 SEVO pipeline，请先执行 sevo:create”。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.4：主会话手动分步派发时，即使 label 不含 `sevo:` 前缀，只要 task prompt 目标动作属于软件研发范围，插件也必须检测并路由到 SEVO；路由判定基于 LLM 语义分析，不依赖关键词匹配。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.5：流水线覆盖范围按动作类型定义，不按路径定义；项目源码、扩展目录、入口脚本、README、测试文件、配置文件、发布脚本等路径模式只能作为实现层的辅助识别信息，不得作为唯一纳管条件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.6：spec、架构文档、UX 文档、测试文件、配置、README、发布脚本、入口脚本等非源码产物，只要发生编写、修改、测试、审计或发布相关动作，仍必须路由到对应项目的 SEVO 流水线。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.7：发布链动作必须纳入流水线，至少覆盖 README / 发布文档更新、版本整理、发布制品生成、npm 发布、GitHub 推送五类动作；不存在“只改文档”“只推 GitHub”就不走流水线的例外。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.8：默认所有研发动作走流水线；仅当 (1) 流水线自身设计缺陷导致无限循环，且任务描述说明循环原因，或 (2) 用户（项目 Owner）明确授权豁免，且任务描述引用用户原话，两种情况之一成立时才允许标记为不适用并留证。豁免记录写入治理日志，包含授权来源、用户原话或循环原因、豁免范围、理由和时间戳。没有用户明确授权时，不得把“内容简单”“只改一行”“只是插件目录”“label 带豁免前缀”视为豁免理由。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.9：纯查询、纯调研、纯宿主环境配置检查且不修改项目产物的任务，不创建 pipeline；但一旦任务目标转为修改项目产物，或承担测试、审计、发布职责，必须重新进入路由判定。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.10：每次 spawn 的任务只能属于一个研发阶段，阶段枚举为 specify / plan / implement / review / release。一个 task prompt 同时要求产出 spec、架构、代码、审计、发布中任意两个及以上阶段成果时，路由判定必须记录 advisory 并触发修复并要求拆分。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.11：每次 spawn 的任务只能由一个角色类型执行。角色类型为 PM、SA、Dev、Auditor、Release；一个 task prompt 同时要求 PM 写 spec、SA 写架构、Dev 写代码、Auditor 审计中任意两个及以上角色职责时，路由判定必须记录 advisory 并触发修复并要求拆分。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.12：即使只有一个 agent 可用，也必须分步执行。系统允许同一个 agent 在不同 spawn 中客串不同角色，但每次 spawn 仍只能绑定一个阶段和一个角色类型，前一阶段完成并产出工件后才能派发下一阶段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.13：禁止在一个 task prompt 中要求 agent 同时完成多个阶段的产出。验证方式：构造 prompt“补 spec 并实现代码”，路由判定返回 advisory，理由包含“跨阶段打包”，建议拆成 specify 与 implement 两个任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.14：pipeline 的 publish 阶段新增 stranger-ready advisory。advisory 执行 `scripts/npm-stranger-verify.sh`（或项目配置的等效脚本），在干净环境中安装并运行产物，验证陌生用户开箱即用性。advisory 通过后才能标记 publish 完成。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.15：stranger-ready advisory 发现问题时，pipeline 状态标记为 `publish-repairing`，不标记 completed，并进入 repairing。输出内容包含问题原因（脚本 stderr）、exit code、修复建议。修复后可通过 `sevo gate retry <instance-id> stranger-ready` 重新触发验证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.16：项目 pipeline 配置中声明 `strangerVerify: false` 时，stranger-ready advisory 自动标记为不适用并留证。CLI 支持 `--not-applicable-stranger-verify` 参数作为单次运行时覆盖。未声明且未传参时，advisory 为强制执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.17：路由判定使用 LLM 语义理解，分析 task prompt 内容判断是否涉及软件研发活动。判定结果包含置信度和推理依据，记录到 `aco-dispatch-guard-events.jsonl` 供审计追溯。禁止纯关键词匹配、FTS5 全文检索或正则表达式作为判定手段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.18：aco-dispatch-guard 在 插件层提供确定性路由兜底：当任务会修改项目产物，且入口是 spec 修改、架构设计、UX 设计、构建、打包、测试、发布、review、audit 或等效研发动作时，即使 prompt 未显式包含 `sevo:` 前缀，也必须强制路由到 SEVO。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-35.19：对项目执行构建命令或等效研发入口时，必须存在活跃 pipeline 上下文；不存在时生成 advisory，并提示用户执行 `sevo:create <project-slug>` 或 `sevo:create <project-slug> --from <stage>`，禁止“先做动作再补流水线”。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-36 Verify-With-Real-Data Advisory Check（发版前真实数据通路质量检查）

- **定位**：发版前置质量检查。受管项目的 web 端反复出现「假数据冒充真数据」——种子写死、mock 数据未替换、API 返回硬编码列表，导致发版后陌生人看到的是假产品。本 FR 在 publish 链路前段插入硬质量检查，强制要求受管项目 web 端关键页面的数据来自真实数据源（DB、真实 API、运行时产生的内容），并要求陌生环境 + 真数据的端到端可视证据。
- **与 FR-17 的关系**：FR-17 是发布后的差距扫描（已发布产物的 FR 覆盖度），FR-36 是发布前的数据通路审查。FR-36 通过后才允许进入 FR-08a 商用化质量检查与 FR-08 Deploy。
- **与 FR-28 的关系**：FR-28 在隔离干净环境验证「能装能跑」，FR-36 在 implement 完成后审查「数据是否真实」。FR-36 在 FR-28 之前执行，避免把假数据通路打包发布。
- **与 FR-35 stranger-ready advisory 的关系**：FR-35 stranger-ready advisory 验证陌生用户能装能跑，FR-36 验证陌生用户看到的内容是真实数据。两者互补，stranger-ready 通过不代表数据真实。
- **与 AC-4.36d 的关系**：AC-4.36d 约束「SEVO 自身 Verify 阶段的验证证据不得使用 mock/seed」，FR-36 约束「受管项目产品代码本身的数据通路不得用 mock/seed 冒充真实数据」，两者层级不同。
- **触发时机**：受管项目 pipeline 的 implement → review（FR-06）→ smoke test（FR-06b）→ ux acceptance（FR-06c）→ pm commercial review（FR-06d）→ regression（FR-07）全部通过后，自动进入 verify-with-real-data 阶段；该阶段通过后才允许进入 FR-08a Commercialization Advisory Check 与 FR-08 Deploy。发现问题则进入 repairing 并继续推进发版，回退到 implement。
- **适用范围**：spec 中标注存在 web 端的受管项目（含 KIVO、SEVO、exam-sprint 等当前已注册项目，以及未来通过 `projects/*/sevo.json` 自动纳管的具备 web 入口的项目）。纯 CLI / SDK / 后端项目通过项目配置 `verifyWithRealData: false` 显式标记为不适用并留证；未声明且 spec 中存在 web 路由时强制执行。
- **检查内容**：分三大维度，全部使用 LLM 语义判定，禁止纯关键词匹配 / FTS5 / 正则伪装语义理解。
  1. **数据源真实性**：spec 中列出的核心 FR 对应的 web 路由必须从真实数据源读取——具体定义为：从持久化存储（数据库、文件系统）、真实运行的内部服务接口、用户操作后由系统生成的运行时内容中读取。禁止以下三类「假数据」：
  - 硬编码常量数组直接渲染到页面（如 `const items = [{title: '示例 1'}, {title: '示例 2'}]`）。
  - 内存常量字典作为唯一数据源（无任何写入/更新通路）。
  - 服务端代码中的 mock 函数返回值未接入真实数据通路（如 API handler 直接 `return mockList`）。
  1. **mock 数据标记规范**：实现过程中若不可避免出现 seed/mock/fixture/占位数据，必须满足三项强制要求：
  - **代码标记**：mock/seed 数据所在位置必须有显式标记注释，标准前缀为 `// SEED`、`// MOCK`、`// FIXME-mock` 之一，标记必须紧贴 mock 数据声明上方一行。
  - **迁移路径文档**：项目 `docs/` 目录下必须存在 `mock-migration-plan.md` 文件，列出每处 mock 数据的位置（文件路径 + 行号）、替换为真实数据源的具体方案、计划替换时间。
  - **运行时区分**：默认 build / production 构建产物中不允许命中未替换的 mock 数据；若 mock 仅作为 demo/dry-run 模式存在，必须由显式开关（如 `--demo` 或 `DEMO_MODE=true`）启用，普通用户路径不能命中。
  1. **陌生环境 + 真数据端到端证据**：FR-06c UX Acceptance 阶段（受 FR-36 校验时）必须产出至少一组「陌生环境 + 真实材料」证据：在隔离的 stranger 验证目录或全新账号下，导入真实业务材料（如 KIVO 导入真实 PDF、SEVO 触发一次完整 spec→ledger 流程），关键页面截图必须呈现导入材料产生的真实内容，禁止使用空状态、默认模板、demo 占位作为通过依据。
- **检查实现要求**：
  - 检查 1（数据源真实性）使用 LLM 对受管项目核心 FR 对应的 web 路由源码 + API handler 源码做语义判定，结合数据流追溯。每条 web 路由产出 PASS / FAIL / NEEDS_REVIEW + 推理依据。
  - 检查 2（mock 标记规范）由静态扫描 + LLM 判定组合：静态扫描定位疑似 mock 数据的代码位置（基于变量命名、数组字面量、API handler return 语句），LLM 判定每处疑似位置是否属于 mock 数据；判定为 mock 的位置必须满足代码标记 + 迁移文档登记两项要求。
  - 检查 3（端到端证据）从 FR-06c UX Acceptance 阶段产出物中提取 stranger 模式截图证据，由 LLM 判定截图内容是否呈现真实导入材料产生的内容（如截图中是否包含真实 PDF 文件名、真实知识点、真实 spec 内容），不得只看到 demo 占位或空状态截图。
- **发现问题处理**：任一检查repair-required advisory即整体记录 advisory 并触发修复发版。pipeline 状态设为 `verify-with-real-data-repairing`，回退到 implement 阶段（FR-05），生成修复任务列表（fixTasks）派给开发 Agent。修复任务内容由 LLM 根据问题维度自动生成，包含：发现问题的 web 路由列表、需要替换的假数据位置（文件 + 行号）、迁移到真实数据源的具体方案。开发完成后重新跑 review→regression→FR-36 全链路。
- **标记为不适用并留证机制**：项目 pipeline 配置中声明 `verifyWithRealData: false` 时，本质量检查标记为 not-applicable-with-evidence，标记为不适用并留证理由必须显式写入 ledger（如「项目为纯 CLI，无 web 端」）。CLI 支持 `--not-applicable-verify-with-real-data` 单次运行覆盖；未声明且 spec 中存在 web 路由时强制执行，禁止默认标记为不适用并留证。
- **输入**：受管项目源码、spec 中标注的核心 FR 列表、对应 web 路由清单、FR-06c UX Acceptance 产出的截图证据、`docs/mock-migration-plan.md`（如存在）。
- **输出**：Verify-With-Real-Data Report（结构化 JSON + 人类可读摘要），包含：
  - 受检 web 路由列表与每条路由的数据源真实性判定（PASS / FAIL / NEEDS_REVIEW + 理由 + 关键代码片段引用）。
  - mock 数据登记表（位置、是否带标记、是否登记到 mock-migration-plan）。
  - 端到端证据评估（截图引用、LLM 对截图内容真实性的判定）。
  - overall 通过 / 记录 advisory 并触发修复结论 + fixTasks 列表（如记录 advisory 并触发修复）。
  - 报告写入项目 `docs/verify-with-real-data-report.json`。
- **执行阶段**：Verify-With-Real-Data Advisory Check（位于 Regression 之后、Commercialization Advisory Check 之前）。
- **角色约束**：禁止开发者自检；由独立非开发 Agent 执行（默认 audit-01 或 ux-01，根据可用性路由）。
- **验收标准**：
  - AC-36.1：spec 中存在 web 路由的受管项目，Regression（FR-07）通过后，PipelineEngine 自动进入 verify-with-real-data 阶段，无需主会话人肉触发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.2：检查 1（数据源真实性）必须使用 LLM 对受检 web 路由源码 + 对应 API handler 源码做语义判定，禁止用关键词匹配、字数阈值、正则表达式、FTS5 全文检索冒充语义理解。每条路由产出三档判定（PASS / FAIL / NEEDS_REVIEW）+ 推理依据 + 关键代码片段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.3：检查 2（mock 标记规范）必须同时满足两项硬性要求才算通过：(a) 代码中所有 mock/seed 数据位置有标记注释（标准前缀 `// SEED`、`// MOCK`、`// FIXME-mock` 之一，紧贴上方一行）；(b) 项目 `docs/mock-migration-plan.md` 存在且包含每处 mock 的位置（文件 + 行号）+ 替换方案 + 计划时间。任一项不满足判定为 fail。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.4：检查 3（端到端证据）必须从 FR-06c UX Acceptance 产出物中提取陌生环境下导入真实业务材料后的截图证据。LLM 判定截图内容是否呈现真实导入材料产生的内容；只看到 demo 占位、空状态、默认模板的截图判定为 fail。每个核心 FR 至少需要一组陌生环境 + 真数据的截图证据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.5：默认 build / production 构建产物中不允许命中未替换的 mock 数据。验证方式：在干净环境中执行项目构建，扫描构建产物中是否存在 mock 数据特征（标准前缀注释、命名为 `mock*` / `fake*` / `seed*` 的数组常量未被标记或未被环境变量门控）。命中即 fail。mock 仅作为 demo/dry-run 模式存在时，必须有显式开关（如 `--demo` 或 `DEMO_MODE=true`），普通安装路径不能命中 mock。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.6：任一检查repair-required advisory时，pipeline 状态设为 `verify-with-real-data-repairing`，回退到 implement（FR-05）。系统生成 fixTasks 列表派给开发 Agent，修复任务内容包含发现问题的 web 路由列表、需要替换的假数据位置（文件 + 行号）、迁移到真实数据源的具体方案。修复完成后重新跑 review→regression→FR-36 全链路。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.7（运行时数据真实性）：verify-with-real-data 阶段必须检查受管项目的运行时数据库（SQLite/.db 文件），识别以下类型的假数据：(a) 测试遗留——文件名/标题匹配测试模式（test-*、a02-*、seed-*、fixture-*、mock-*、fake-*、自动化截图命名如纯数字+时间戳）；(b) 死数据——状态字段为 processing/pending 且 updated_at 超过 24 小时未变化，或外键引用不存在的关联记录；(c) 垃圾数据——相同 title+type 组合重复出现、content 为 NULL 或空字符串、标题为乱码或无意义字符串；(d) 统计失真——元数据表/缓存表中的计数值与对应数据表的实际 COUNT(*) 偏差超过 20%。检查方式：SQL 查询模式匹配初筛 + LLM 语义判定最终确认（避免误杀合法但命名特殊的数据）。阈值：任一用户数据表中假数据占比超过 10% 即整体 fail。发现问题处理：同 AC-36.6，pipeline 状态设为 verify-with-real-data-repairing，回退到 implement（FR-05），生成清理任务列表（cleanupTasks）派给开发 Agent，清理任务内容包含：问题表名、问题行 ID 列表、假数据类型、建议处理方式（删除/标记发现问题/合并去重）。
  - AC-36.8：项目 pipeline 配置声明 `verifyWithRealData: false` 时，本质量检查标记为 not-applicable-with-evidence，标记为不适用并留证理由显式写入 ledger。CLI 支持 `--not-applicable-verify-with-real-data` 单次覆盖。spec 中存在 web 路由且未声明标记为不适用并留证时，质量检查强制执行，不允许默认标记为不适用并留证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.9：禁止开发者自检。由独立非开发 Agent 执行（默认 audit-01；audit-01 不可用时降级到 ux-01）。审计 Agent 与本次实现 Agent 不得为同一身份。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.10：报告写入项目 `docs/verify-with-real-data-report.json`，结构包含 `{ webRoutes: [{ route, dataSourceJudgment, reasoning, codeSnippet }], mockRegister: [{ filePath, line, hasMarker, inMigrationPlan }], strangerEvidence: [{ frId, screenshotPath, llmJudgment, reasoning }], overall: "pass"|"fail"|"not-applicable-with-evidence", fixTasks: [], timestamp }`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.11：单 Agent 环境下也能走完 verify-with-real-data 质量检查。检查逻辑内置于 SEVO CLI（`sevo verify --real-data`），不依赖专职审计 Agent；多 Agent 环境下由调度层派非开发 Agent 执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.12：本质量检查的判定结果作为 FR-08a Commercialization Advisory Check、FR-08 Deploy、FR-17 Post-Release Validation 的强制前置工件留档；后续阶段必须能在评审包顶部引用本质量检查的结论与报告路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-36.13（术语澄清）：「真实数据源」定义为：(a) 持久化存储（数据库、本地文件系统、云存储）；(b) 真实运行的内部服务 API 接口；(c) 用户操作后由系统生成的运行时内容（如用户上传 PDF 后系统提取的知识点）。「假数据」定义为：(a) 硬编码常量数组直接渲染到页面；(b) 内存常量字典作为唯一数据源且无写入通路；(c) API handler 直接 return mock 数据未接入真实数据通路。判定边界由 LLM 语义判定为准，配合标准定义。

### FR-37 Spec Template & Quality Standard（Spec 模板与质量标准）

**用户人群**所有使用 SEVO 管理研发流程的团队和 Agent。

**痛点**各产品 spec 结构不统一，缺少必含章节导致需求遗漏；spec review advisory 的校验规则散落在记忆文档中，没有产品化的可追溯定义。

**原始需求**定义所有受管项目 spec 必须遵守的结构规范，让 spec review advisory 有明确的 AC 可依据，让规范本身可持续进化。

**用户体验流**

1. `sevo:create` 时自动生成符合模板的 spec 骨架（含所有必含章节占位）
1. PM 在骨架基础上填写内容
1. Spec Review Advisory Check 自动校验结构完整性，缺失章节记录 advisory 并触发修复流水线
1. 用户（CEO）随时可纠偏规范内容，纠偏当场写入本 FR 的 AC，advisory 逻辑同步更新

**AC（验收标准）**

- AC1: 每个产品 spec 必须包含以下独立章节（缺任一个 = spec 不完整，advisory 记录 advisory 并触发修复）： 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  1. 用户人群（谁用、什么场景、什么设备）
  1. 痛点（用户现在怎么解决这个问题、哪里痛）
  1. 原始需求（用户要什么，用人话说）
  1. 用户体验流（完整的用户操作步骤，从打开到完成）
- AC2: 四个必含章节必须在"功能需求"章节之前 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3: 每个 FR 必须包含：用户人群、痛点、原始需求、用户体验流、AC（验收标准） 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4: `sevo:create` 生成的 spec 骨架自动包含所有必含章节的占位标题和提示文字 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5: Spec Review Advisory Check 从本 FR 的 AC 推导校验规则，校验发现问题时给出具体缺失项 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6: 规范内容可持续进化——用户纠偏后当场更新本 FR 的 AC，advisory 逻辑在下次 Advisoryway 重启后生效 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7: FR/AC 格式约束：AC 编号连续、描述可验证（能判断 pass/fail）、不含模糊词（如"合理""适当"） 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC8: 概念架构章节属于 spec（Phase 1），技术架构属于 arc42（Phase 2），不混写 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC9: 飞书文档是 spec 的唯一真相源，本地 md 只是 git 备份。改 spec 前必须先拉飞书最新，改完必须同步推飞书。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC10: 用户故事旅程内部必须按场景阶段划分（Stage 1、Stage 2...），每阶段含：阶段名称、用户动机、用户行为、阶段产出、转换条件。划分依据是用户心智模型，不是系统模块。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC11: 用户体验流必须是人机协同 SOP：每步标注用户操作+AI动作+交互形态+关联 FR 编号。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC12: 解决方案章节必须包含产品定位句：「围绕 [用户群] 的 [痛点]，我们通过 [方案] 解决了 [问题]」。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC13: Spec 正文只放最终态内容。修改建议放文档末尾独立章节（含日期时间）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC14: FR 必须服务于体验流。体验流中没对应步骤的 FR = 伪需求；有步骤没 FR = 功能缺失。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC15: 同一项目支持多条并行流水线，不限制同 projectSlug 只能有一条活跃 pipeline。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC16:项目主 spec 的 FR 标题必须使用代码解析器可识别的 Markdown 标题格式：`### FR-01 标题`、`#### FR-11.1 标题` 或 `##### FR-02-pre 标题`。FR 编号必须匹配正则 `FR-\d+[A-Za-z0-9.-]*`，标题级别必须为 H3-H5，编号后用空格接标题；不得写成 `FR 01`、`FR01`、表格单元格、普通列表项或仅在正文中提及。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC17:Spec Review Advisory Check 必须用与代码一致的解析规则扫描主 spec，若解析出的 FR 数量为 0 或明显低于文档中人工可见的 FR 数量，判定为格式错误并记录 advisory 并触发修复进入后续阶段。错误信息必须指出首个不匹配标题的位置和推荐写法。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC18:SEVO 自身 spec 与所有新生成 spec 模板必须采用 `### FR-XX 标题` 作为默认格式；含子 FR 时允许 `#### FR-XX.x 标题`。现有历史文档若不符合该格式，先做格式统一，不改变 FR 语义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC19: Spec 全文文案必须遵循非对抗性流程表述：禁止使用“拦截”字样；涉及流程控制时必须改写为引导、准入校验、路由、生成 advisory 并由主 Agent 澄清，主线保持 active补 spec、质量路径未满足、阶段待推进等表达。该约束与 FR-39a「流水线引导 + 主 Agent 握手协议」一致，避免把 SEVO 描述成对抗式记录 advisory 并触发修复器。 验收验证：审计时扫描 spec 正文和新生成 spec 模板，除本条禁用词声明本身外，不得出现该字样；发现命中时必须给出替代表述建议并判定为 `fail`。记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含扫描范围、命中位置和替代表述建议，缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-38 dispatch-guard 内置 Spec 覆盖检查

SEVO 流水线的 dispatch-guard 插件内置 spec 覆盖检查逻辑。派发开发类任务前，自动评估该任务是否已被对应项目 spec 的 FR/AC 覆盖。未覆盖时记录 advisory 并触发修复派发并提示用户先修改 spec。此能力随 dispatch-guard 插件自动生效，无需单独安装。

- AC1：dispatch-guard 加载后，spec 覆盖检查自动生效，无需额外安装步骤 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC2：已有 FR/AC 覆盖的开发任务正常出具通过 advisory 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC3：未覆盖的开发任务被记录 advisory 并触发修复，提示"建议先修改 spec" 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC4：`sevo:fix` 路径进入 implement 前，dispatch-guard 必须执行一次 LLM 语义级 spec 完整性检查，判断当前 bug/修复目标是否已有对应 FR/AC 覆盖；禁止只靠关键词匹配或文件名推断。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC5：`sevo:fix` 的 spec 完整性检查结论为“spec 未覆盖”时，SEVO 生成 advance prompt，建议主 Agent 先补 spec 并通过 Spec Review Advisory Check 后再继续 implement；SEVO 不自行生成 advisory 并由主 Agent 澄清，主线保持 active流水线，不自行派 PM，不替主 Agent 决定是否执行建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC6：`sevo:from` 任意阶段入口同样必须先过 spec 完整性检查；未覆盖时与 `sevo:fix` 走同一条“生成补 spec advance prompt → 由主 Agent 握手 → 由主 Agent 决定后续执行”的引导路径。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC7：spec 完整性检查结果必须写入结构化记录，至少包含入口类型、目标阶段、判定结论、关联 FR/AC、未覆盖原因和恢复条件，供流水线状态与审计日志追溯。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-38a 语义级 Spec-Gap Advisory

SEVO 在开发类任务派发前，对任务描述与目标项目 spec 的 FR/AC 列表做 LLM 语义对照，识别任务里出现但 spec 尚未定义的新概念、新命令、新入口、新实体、新角色、新状态或新用户可见行为。发现缺口时，系统生成 advisory 建议通知，引导主 Agent 先补 spec，再继续后续阶段；advisory 不直接中断派发，由流水线握手规则和主 Agent 执行纪律承接后续动作。

Why：文件路径只能判断“任务属于哪个项目”，不能判断“任务描述里新增的产品语义是否已被 spec 定义”。如果新概念绕过 spec 进入实现，代码会先于需求定义漂移，审计只能事后发现，返工成本更高。

- **触发条件**：开发、修复、设计、审计、UX 或发布相关任务进入 SEVO 路由，且任务描述包含可能改变用户可见行为、命令语义、入口前缀、阶段名称、配置项、数据实体、状态机节点、角色职责或对外文案的新概念时触发。
- **标记为不适用并留证条件**：纯 bug fix 可标记为不适用并留证本 advisory。纯 bug fix 必须同时满足：已有明确复现步骤；能定位到现有 FR/AC；实际行为与该 FR/AC 的明确描述矛盾；任务不引入新的概念、命令、实体、边界或验收标准。任一条件缺失时不得标记为不适用并留证。
- **检测方式**：调用 LLM 对“任务描述 + 已解析 FR/AC 摘要 + 已定义术语/命令/实体清单”做语义判断，输出新增概念及覆盖结论。禁止用关键词匹配、正则、文件名、路径或 FR 标题包含关系冒充语义覆盖。
- **输出格式**：advisory 结构化记录至少包含 `projectSlug`、`taskId`、`introducedConcepts[]`、`matchedFrAc[]`、`gapSummary`、`recommendedSpecPatch`、`severity`、`confidence`、`reason`、`createdAt`。面向主 Agent 的通知使用“建议先补 spec”的引导式措辞，不使用对抗式表达。
- **性能约束**：检测不得让派发主链路等待超过 2 秒；超时或 LLM 不可用时记录 `status: not-applicable-with-evidence` 与原因，并异步补跑。异步补跑发现高置信缺口时补发 advisory 通知。
- **验收标准**：
  - AC-38a.1：任务描述中出现 spec 未定义的新入口、新命令、新阶段、新实体、新角色、新状态、配置项或用户可见行为时，语义级 spec-gap 检测必须产出 advisory。验收验证：构造“把前缀速查表从 4 个扩展到 8 个，新增 specify/design/review/ux”且 spec 仅定义 4 个前缀的任务，检测结果包含 4 个新增前缀，`status` 为 `advisory`，`recommendedSpecPatch` 非空。
  - AC-38a.2：任务只修改现有 FR/AC 已定义行为的实现缺陷，且不引入新概念、新边界或新验收标准时，不生成 spec-gap advisory。验收验证：构造带复现步骤、对应 FR/AC、实际行为与预期行为矛盾的纯 bug fix 任务，检测结果为 `covered` 或 `not-applicable-with-evidence-pure-bugfix`，并记录对应 FR/AC 与复现证据。
  - AC-38a.3：混合任务必须拆分判断：已有 FR/AC 覆盖的 bug fix 部分标记为 covered，新概念或边界变化部分生成 advisory；不得因任务包含 bug fix 字样整体标记为不适用并留证。验收验证：构造“修复现有前缀显示错误，并新增 review/ux 前缀”的任务，结果同时包含 covered 项和 advisory 项。
  - AC-38a.4：检测必须调用 LLM 进行任务描述与 FR/AC 摘要的语义判断；检测日志记录模型调用 ID、输入摘要、输出结论和置信度。验收验证：检查检测日志，存在 LLM 调用记录；若只存在关键词、正则、文件名或路径匹配证据，则判定为 fail。
  - AC-38a.5：advisory 输出字段必须完整，至少包含 `projectSlug`、`taskId`、`introducedConcepts[]`、`matchedFrAc[]`、`gapSummary`、`recommendedSpecPatch`、`severity`、`confidence`、`reason`、`createdAt`。验收验证：对输出 JSON 做 schema 校验，缺任一字段即 fail。
  - AC-38a.6：advisory 采用现有建议通知模式，不直接改变 pipeline 状态为 repairing，不直接替主 Agent 派 PM，也不自动修改 spec。验收验证：触发 advisory 后，pipeline 状态保持原阶段可推进或待主 Agent 握手状态，事件记录包含 advisory 通知，不包含自动派单或自动写 spec 动作。
  - AC-38a.7：同步检测耗时超过 2 秒、LLM 不可用或模型返回不可解析时，不得卡住任务派发；系统记录 not-applicable-with-evidence/error 原因并安排异步补跑。验收验证：模拟 LLM 超时，派发链路在 2 秒内返回，结构化记录包含 `status: not-applicable-with-evidence`、`reason: llm-timeout` 和异步补跑标记。
  - AC-38a.8：异步补跑发现高置信缺口时，系统补发 advisory 通知，并把结果写入 spec 完整性检查记录，供后续审计和流水线状态查询使用。验收验证：模拟同步标记为不适用并留证后异步补跑命中缺口，检查通知记录和 spec 完整性记录均出现同一 `taskId` 的 advisory 结果。

### FR-38b 智能阶段路由与主动澄清（Stage Route Advisory + Clarification）

SEVO 收到任意 `sevo:*` 入口请求时，必须检查项目 pipeline 状态、目标阶段、已完成阶段、待推进阶段和 spec 覆盖度，产出给主 Agent 的阶段路由 advisory。advisory 只能做模糊判断和信息整理，不得替主 Agent 做精准阶段决策，不得自行派发、标记为不适用并留证或推进阶段。

Why：任意入口可以提高研发效率，但入口阶段不一定是正确起点；如果 SEVO 直接按 label 进入目标阶段，前置 spec、架构或审计缺口会被带到下游；如果 SEVO 自己替主会话精确选阶段，又会越过主 Agent 对上下文、用户最新纠偏和任务边界的判断权。SEVO 应把不确定性整理成结构化澄清提示，让主 Agent 做最终判断。

- **服务原则**：任意入口全自动走到终局、任意入口先核实 Spec、主动需求澄清、流水线引导 + 主 Agent 握手协议。
- **触发条件**：任何 `sevo:create`、`sevo:specify`、`sevo:design`、`sevo:implement`、`sevo:review`、`sevo:ux`、`sevo:fix`、`sevo:from` 请求到达，或主 Agent 准备把研发动作接入 SEVO 时触发。
- **输入**：入口 label、任务描述、projectSlug、pipeline 当前状态、阶段历史、已完成阶段记录、待推进阶段记录、spec 是否存在、spec 覆盖度 advisory、最近一次advisory 结论和用户最新上下文摘要。
- **处理**：SEVO 只输出三类 advisory 之一：
  1. `direct-advance-advisory`：请求阶段与当前 pipeline 状态、已完成阶段和 spec 覆盖记录一致，建议主 Agent 从该阶段继续推进。
  1. `earlier-stage-advisory`：请求阶段可能早于或晚于正确起点，且存在明确前置缺口信号，列出更早阶段选项及依据。
  1. `clarification-advisory`：spec 是否覆盖、阶段是否已完成、目标变更范围或入口意图存在不确定性，生成结构化澄清问题和可选起始阶段列表，由主 Agent 判断。
- **输出格式**：结构化 advisory 至少包含 `projectSlug`、`requestedEntry`、`requestedStage`、`pipelineId`、`currentStage`、`completedStages[]`、`pendingStages[]`、`specCoverageStatus`、`routeOptions[]`、`recommendedQuestion`、`confidence`、`reason`、`requiresMainAgentDecision`、`createdAt`。`routeOptions[]` 每项包含 `stage`、`whyThisStage`、`missingInputs[]`、`readySignals[]` 和 `riskIfSkipped`。
- **边界**：SEVO 不输出“已决定从某阶段开始并执行”的结论；SEVO 只能提示“可能从这些阶段开始，请主 Agent 判断”。主 Agent 完成握手后，才由主 Agent 选择阶段并派发对应任务。

**验收标准**：

- AC-38b.1：当 `sevo:*` 请求到达且 pipeline 状态显示请求阶段已具备准入条件、spec 覆盖状态为 covered、前置 mandatory 阶段已有通过记录时，SEVO 产出 `direct-advance-advisory`，字段包含 requestedStage、currentStage、completedStages、specCoverageStatus=covered、routeOptions 且 `requiresMainAgentDecision=true`；验收时检查结构化记录和注入文本，缺字段或把 advisory 写成自动执行结论均判定为 fail。
- AC-38b.2：当请求阶段晚于当前应补阶段，且存在明确前置缺口信号（如 spec 不存在、specCoverageStatus=gap、mandatory advisory 无通过记录、plan/contract 无 SA 评估记录）时，SEVO 产出 `earlier-stage-advisory`，routeOptions 必须列出至少一个更早阶段及依据；验收时构造 `sevo:implement` 但 spec 未覆盖的场景，输出必须包含 specify/spec-review 相关选项和 missingInputs，不得替主 Agent 直接选择 implement。
- AC-38b.3：当 spec 存在但无法判断是否覆盖当前变更范围，或 pipeline 阶段历史与请求阶段存在冲突，SEVO 产出 `clarification-advisory`，recommendedQuestion 必须面向主 Agent，至少给出 2 个可选起始阶段及每个选项的依据；验收时构造“spec 存在但新增概念未明确归属”的任务，输出问题应类似“从补 spec 开始、从 spec 审计开始，还是从 design 开始？”，不得替主 Agent 选择唯一答案。
- AC-38b.4：任何 advisory 都记录 advisory 后继续触发 SEVO 自行 spawn、修改 pipeline 阶段为已推进、标记为不适用并留证 mandatory 阶段或写入“已决策”状态；验收时检查事件日志和 pipeline state，同一 advisory 事件之后若没有主 Agent 握手记录，不得出现新的阶段任务或阶段通过记录。
- AC-38b.5：主 Agent 回答澄清并选择起始阶段后，SEVO 才能把该选择记录为 trace record result；记录必须包含主 Agent 选择的 stage、选择原因、引用的 advisoryId 和下一步 advance prompt。验收时检查握手记录，缺少 advisoryId、选择原因或下一步准入/准出标准均判定为 fail。
- AC-38b.6：混合输入必须拆成多个 routeOptions 或 clarification item：同一请求同时包含补 spec、架构设计和实现诉求时，SEVO 不得把它压成单一 implement 路由；验收时构造“补一个 FR 并实现”的输入，输出必须提示拆分阶段，且标记需要主 Agent 决策。
- AC-38b.7：阶段路由判断必须基于 LLM 语义理解与结构化 pipeline 状态，不得用关键词匹配、正则、文件名或 label 字符串包含关系冒充覆盖判断；验收时检查检测日志，必须存在 LLM 语义判断记录和 pipeline state 读取摘要，只有关键词或正则证据即 fail。

### FR-39: 流水线前缀语义规范与开箱即用引导

SEVO 流水线通过 `sevo:` label 前缀识别研发入口、目标阶段和角色约束。前缀不是普通标签，而是流水线握手协议：主 Agent 或用户用前缀表达“这件事应进入 SEVO 管理”，SEVO 据此前置检查 spec 覆盖、创建或复用 pipeline、选择阶段队列，并在后续阶段继续收敛到终局交付链。

Why：如果前缀只靠历史约定或口头记忆，主 Agent、插件和子 Agent 会各自理解入口语义，导致补 spec、架构设计、实现、审计、UX 验收和修复闭环被拆散。把完整前缀体系写成产品定义后，每个入口都有可追溯的阶段、角色和验收依据，陌生用户也能从提示文案直接知道该用哪个入口。

#### 完整前缀定义

<lark-table rows="9" cols="5" header-row="true" column-widths="146,146,146,146,146">

  <lark-tr>
    <lark-td>
      前缀
    </lark-td>
    <lark-td>
      阶段入口
    </lark-td>
    <lark-td>
      默认角色映射
    </lark-td>
    <lark-td>
      使用场景
    </lark-td>
    <lark-td>
      示例
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:create <project>`
    </lark-td>
    <lark-td>
      Pipeline Create → Specify
    </lark-td>
    <lark-td>
      Product
    </lark-td>
    <lark-td>
      创建新项目或为未纳管项目初始化 spec、目录和流水线
    </lark-td>
    <lark-td>
      `sevo:create kivo`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:specify <描述>`
    </lark-td>
    <lark-td>
      Specify / Spec Review Advisory Check
    </lark-td>
    <lark-td>
      Product
    </lark-td>
    <lark-td>
      补充、修正或收敛需求定义、FR/AC、边界和验收标准
    </lark-td>
    <lark-td>
      `sevo:specify 补齐实时提取的 FR/AC`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:design <描述>`
    </lark-td>
    <lark-td>
      Design / Architecture Design
    </lark-td>
    <lark-td>
      Architect
    </lark-td>
    <lark-td>
      做架构方案、接口契约、数据流、ADR 或技术设计评估
    </lark-td>
    <lark-td>
      `sevo:design 设计实时提取架构`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:implement <描述>`
    </lark-td>
    <lark-td>
      Implement → Review → 终局交付链
    </lark-td>
    <lark-td>
      Coder
    </lark-td>
    <lark-td>
      按已覆盖的 spec 实现新能力或功能改动
    </lark-td>
    <lark-td>
      `sevo:implement 实现实时提取入口`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:review <描述>`
    </lark-td>
    <lark-td>
      Review / Advisory Review
    </lark-td>
    <lark-td>
      Auditor
    </lark-td>
    <lark-td>
      对实现、spec、架构、回归或发布候选执行独立审计
    </lark-td>
    <lark-td>
      `sevo:review 审计实时提取实现`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:ux <描述>`
    </lark-td>
    <lark-td>
      UX Acceptance / UX Design Review
    </lark-td>
    <lark-td>
      UX
    </lark-td>
    <lark-td>
      设计或验收用户体验、页面流、视觉可用性和陌生人走查
    </lark-td>
    <lark-td>
      `sevo:ux 验收首次使用路径`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:fix <描述>`
    </lark-td>
    <lark-td>
      Spec 覆盖检查 → Implement 修复 → Review Fix Loop
    </lark-td>
    <lark-td>
      Coder + Auditor
    </lark-td>
    <lark-td>
      修复已有 FR/AC 覆盖的问题；若未覆盖，先回到 Specify 补 spec
    </lark-td>
    <lark-td>
      `sevo:fix 修复登录发现问题`
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      `sevo:from <stage> <project>`
    </lark-td>
    <lark-td>
      Flexible Stage Entry
    </lark-td>
    <lark-td>
      由目标阶段决定
    </lark-td>
    <lark-td>
      从指定阶段恢复、重入或承接已有 pipeline；进入目标阶段前仍做 spec 完整性检查
    </lark-td>
    <lark-td>
      `sevo:from implement kivo`
    </lark-td>
  </lark-tr>
</lark-table>

阶段名与角色名必须使用通用产品语义，不绑定本机私有 agentId。运行时具体 agent 由角色注册表和当前宿主配置动态选择。

#### Label 命名规范

所有由主会话派发给 SEVO 管理的任务，label 必须采用统一格式：

`sevo:<stage> <简短描述>`

- `<stage>` 使用前缀中的阶段词：`create`、`specify`、`design`、`implement`、`review`、`ux`、`fix`、`from`。
- `<简短描述>` 用一句人话说明本轮目标，避免只写“修改”“审计”“任务”。
- label 只表达入口和目标，不塞技术路径、agentId、模型名、内部文件路径或本机私有信息。
- 同一任务的 label、pipeline managedChange 和审计事件必须保持同一前缀语义，便于去重、状态查询和 completion 归因。

AC:

1. sevo-pipeline 插件的错误提示中包含完整 8 个 `sevo:` 前缀的语义说明，覆盖 create、specify、design、implement、review、ux、fix、from。验收验证：审计时读取实际错误提示或注入文本，8 个前缀缺任一项即判定为 fail。
1. `sevo init` 后生成的引导文档中包含完整前缀使用指南，并写清每个前缀对应阶段、角色语义和示例。验收验证：审计时读取初始化产物，检查 8 个前缀、阶段入口、默认角色映射和示例是否齐全。
1. 插件注入到主会话的 context 提示中包含前缀速查表，且前缀语义与本 FR 的完整定义一致。验收验证：读取一次实际注入文本，与本 FR 的 8 前缀定义逐项比对；缺失、冲突或角色语义错误均判定为 fail。
1. 前缀语义说明中不得出现“`sevo:fix` 标记为不适用并留证 specify，直接 implement→audit”这类会误导用户标记为不适用并留证 spec 质量检查的表述。验收验证：审计时搜索帮助文案、错误提示和注入文本，发现标记为不适用并留证 spec 质量检查的误导表述即判定为 fail。
1. `sevo:fix` 和 `sevo:from` 的帮助文案必须明确写出：若 spec 未覆盖，则 SEVO 生成补 spec advance prompt 建议主 Agent 先收敛 spec；若 spec 已覆盖，则生成从目标阶段继续推进到终局的 advance prompt，不允许做完就停。验收验证：审计时读取帮助文案，缺少未覆盖/已覆盖两种路径任一说明即判定为 fail。
1. `sevo:specify` 必须路由到 Specify / Spec Review Advisory Check，并默认要求 Product 角色执行；不得被当作实现、审计或普通文档编辑任务处理。验收验证：触发 `sevo:specify <描述>`，路由结果中的阶段入口为 Specify，requiredRole 为 product，且生成 spec 工件或 spec review 工件。
1. `sevo:design` 必须路由到 Design / Architecture Design，并默认要求 Architect 角色执行；不得绕过 spec 覆盖检查进入编码。验收验证：触发 `sevo:design <描述>`，路由结果中的阶段入口为 Design 或架构设计阶段，requiredRole 为 architect，且引用对应 FR/AC 上下文。
1. `sevo:review` 必须路由到 Review 或对应 Advisory Review，并默认要求 Auditor 角色执行；Review 发现 P0/P1 后必须进入修复→复验闭环。验收验证：触发 `sevo:review <描述>`，路由结果 requiredRole 为 auditor；审计问题场景中存在 Review Fix Loop 事件记录。
1. `sevo:ux` 必须路由到 UX Acceptance 或 UX Design Review，并默认要求 UX 角色执行；不得由开发者自验替代。验收验证：触发 `sevo:ux <描述>`，路由结果 requiredRole 为 ux，产出工件 authorRole 为 ux 或记录单 Agent 降级原因。
1. 由主会话或 PipelineEngine 生成的 SEVO 任务 label 必须符合 `sevo:<stage> <简短描述>` 格式；`<stage>` 只能取 `create/specify/design/implement/review/ux/fix/from`，且描述非空。验收验证：审计任务看板、pipeline state 或调度审计日志，发现不符合格式、stage 不在白名单或描述为空即判定为 fail。
1. label 中禁止出现宿主私有信息，包括具体 agentId、provider/model、绝对路径、用户 ID、token 或本机端口。验收验证：审计 label、managedChange 和通知文案，发现宿主私有信息即判定为 fail。
1. Completion 归因、去重和 active pipeline 检查必须使用结构化字段中的 label 前缀语义，不得用 substring、宽泛文本包含或正则近似匹配冒充同一变更。验收验证：构造相似 label 的不同任务，系统只在 `label`、`taskId` 或 `title` 结构化字段完全匹配时去重。

### FR-39a 流水线引导 + 主 Agent 握手协议（Pipeline Guidance + Main-Agent Guidance Trace Record）

- **定位**：跨入口治理协议。把 SEVO 的路由语义从“发现研发动作后直接说不”明确收敛为“发现研发动作后主动引导主 Agent 进入质量路径，并由主 Agent 做出遵循流程的显式握手”。这是 SEVO 的核心交互机制，约束插件注入行为与主 Agent 的响应义务。
- **为什么**：SEVO 路由不是障碍，而是质量保障通道的入口引导。如果插件只会返回禁止信息、主 Agent 只会被动服从，系统会不断出现“想脱离流程”的对抗关系；只有把路由定义成主动提醒、把响应定义成主动握手，Agent 才会把流水线理解为帮助自己稳定交付的质量路径，这是 SEVO 形成自主进化能力的基础。
- **输入**：当前研发动作语义、项目归属、活跃 pipeline 状态、当前阶段状态、阶段推进建议、适用入口前缀语义、最近一次advisory 结论。
- **处理**：
  1. `sevo-pipeline` 插件作为引导端，在每轮与研发动作相关的注入中，必须同时提供三类信息：本次动作对应的流水线路由说明、当前 pipeline / stage 状态、下一步推进建议。所有阶段推进逻辑只能产出给主 Agent 的 advance prompt，不得自行执行 spawn、生成 advisory 并由主 Agent 澄清，主线保持 active、派发或标记为不适用并留证动作。
  1. 引导信息的默认语气是邀请主 Agent 进入质量路径，而不是把 SEVO 描述成单纯的记录 advisory 并触发修复器；当确实存在缺失活跃 pipeline、spec 缺口或质量检查未通过时，也必须把advisory 原因表述为“需要先完成哪条质量路径”，而不是“你被禁止继续”。
  1. 主 Agent 作为握手端，在执行任何 spec、架构、实现、测试、审计、发布等研发动作前，必须先评估上述引导信息，确认当前 pipeline 是否存在、当前阶段为何、推进建议是什么，再决定进入 `sevo:create`、`sevo:from`、复用现有 pipeline，或在现有阶段内继续推进。
  1. 主 Agent 一旦命中研发动作语义，就必须 100% 接受 SEVO 的路由引导，不得把“内容简单”“只改一行”“只是文档”“只是补测试”“只是补发布动作”作为忽略引导的理由。
  1. 主 Agent 的握手结果必须可追溯：至少要能在会话注入、阶段事件、任务上下文或等效运行记录中回答“当前看到了什么引导、评估了什么状态、为什么进入这个阶段”。
- **输出**：引导注入记录（包含路由说明、阶段状态、推进建议）、主 Agent 握手结果（包含已评估的 pipeline 状态、选定动作、原因）、可审计的协议履约证据。
- **执行阶段**：Pipeline Governance（贯穿 create / from / fix / implement / review / deploy 等全部入口）。
- **验收标准**：
  - AC-39a.1：与研发动作相关的每轮 SEVO 路由注入，必须同时包含路由说明、阶段状态、推进建议三项信息；缺任一项视为协议未完成。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.2：SEVO 路由文案必须把流水线描述为质量路径引导，不得把默认语义写成“返回禁止信息就是目的”；即使返回 advisory，文案也必须说明应进入哪条质量路径以及为什么。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.3：主 Agent 在执行研发动作前，必须存在“已评估 pipeline 状态与推进建议”的握手证据；不存在该证据时，视为未遵循 SEVO 交互协议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.4：命中研发动作语义后，主 Agent 必须 100% 接受 SEVO 路由引导；不得以“简单改动”“文档改动”“测试改动”“发布链边角动作”等理由忽略引导。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.5：当任务不满足继续执行条件（如缺活跃 pipeline、spec 未覆盖、质量检查未通过）时，SEVO 输出必须同时给出advisory 原因和下一步推进建议，形成“引导 + 握手”闭环，而不是只返回禁止信息。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.6：协议记录必须可回答三件事——“插件引导了什么”“主 Agent 评估了什么”“最终沿哪条流水线动作推进”；三者缺一不可。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.7：SEVO 所有阶段推进逻辑的输出必须是给主 Agent 的 advance prompt，不得自行执行阶段动作；advance prompt 必须说明建议动作、理由、准入条件和准出标准，由主 Agent 完成握手和派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-39a.8：SEVO 不得包含“标记为不适用并留证建议”的条件判断；只要状态机认为下一步应该推进某阶段，就无条件生成对应 advance prompt 提醒主 Agent。“该不该执行”属于主 Agent 的决策空间，“该不该提醒”必须无条件执行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-41 六层一致性质量检查（Six-Layer Consistency Advisory Check）

SEVO 在每个关键阶段推进前执行六层一致性质量检查，确保 spec、设计、实现、审计和交付说明始终在说同一件事。该质量检查贯穿流水线阶段推进，不只在终局做一次扫描。

- **触发时机**：Spec Review Advisory Check、Design Review Advisory Check、Review、Deploy、Verify、README/Publish 这些关键推进点在出具通过 advisory前自动执行。
- **六层对齐维度**：
  1. **spec 内部一致性**：用户人群、痛点、原始需求、体验流、FR、AC、验证准则之间自洽，无孤立 FR、无互相冲突的验收口径。
  1. **spec ↔ UX**：交互设计、页面结构、操作顺序、反馈文案与 spec 体验流一致，不擅自改核心逻辑。
  1. **spec ↔ 架构**：架构文档中的模块边界、数据流、接口契约能完整承接 spec 的 FR/AC。
  1. **spec ↔ 实现**：代码、配置、脚本、数据结构和行为实现覆盖 spec 定义，不多做伪需求，也不少做核心能力。
  1. **spec ↔ 审计**：审计结论、问题清单、复验范围与 spec 的 FR/AC 和验证准则一致，不用实现细节替代需求验收。
  1. **spec ↔ README**：README、发布说明、对外文案、初始化命令与 spec 承诺、真实能力和当前交付状态一致。
- **处理**：
  1. 阶段推进前，由一致性质量检查汇总当前阶段产出与上下游工件。
  1. 对六层维度逐项做一致性判定，输出 pass / fail / needs-review。
  1. 任一关键维度 fail 时，流水线生成 advisory 并由主 Agent 澄清，主线保持 active，生成差距清单并通知用户。
  1. 修复后重新执行同一质量检查，通过后才允许推进下一阶段。
- **输出**：六层一致性报告（Six-Layer Consistency Report），包含维度结论、冲突点、修复建议和是否允许出具通过 advisory。
- **验收标准**：
  - AC-41.1：每个关键阶段推进前必须执行一次一致性校验；未执行不得推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-41.2：一致性校验至少覆盖六层维度：spec内部、spec↔UX、spec↔架构、spec↔实现、spec↔审计、spec↔README。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-41.3：任一维度判定为 fail 时，流水线状态设为 consistency-repairing，生成 advisory 并由主 Agent 澄清，主线保持 active推进并通知用户；通知内容包含问题维度、冲突摘要和修复建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-41.4：一致性校验结果必须结构化留档，至少记录阶段名、维度名、结论、证据工件和恢复条件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-41.5：README 一致性检查不得只做命令正则或文件存在性检查，必须检查 README 描述的能力、入口、限制和真实交付状态是否与 spec 和当前实现一致。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-41.6：六层一致性质量检查与现有局部质量检查并存；现有质量检查通过但六层一致性发现问题时，仍以六层一致性质量检查记录 advisory 并触发修复为准。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-40 Spec 飞书真相源同步提醒

SEVO 受管项目的需求规格以飞书文档作为唯一真相源，本地 `docs/product-requirements.md` 只是 Git 备份。为避免 Agent 修改本地 spec 后忘记同步飞书，`sevo-pipeline` 插件在检测到 `product-requirements.md` 被写入或编辑时，向当前会话注入一次同步提醒。提醒要求先读取同目录的 `SOURCE-OF-TRUTH.md` 获取飞书 doc token，再执行 `lark-cli docs +update` 覆盖更新飞书文档。

提醒只在项目存在 `docs/SOURCE-OF-TRUTH.md` 时触发；不存在该文件时，说明该项目尚未建立飞书真相源，不注入提醒。

**验收标准**：

- AC-40.1：当 write/edit 工具修改受管项目的 `docs/product-requirements.md` 时，`sevo-pipeline` 插件检测到该变更并触发同步提醒。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-40.2：提醒内容包含完整操作模板：先读取 `docs/SOURCE-OF-TRUTH.md` 获取 doc token，再执行 `lark-cli docs +update --doc <doc_token> --mode overwrite --markdown "$(cat docs/product-requirements.md)" --as bot`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-40.3：对应项目不存在 `docs/SOURCE-OF-TRUTH.md` 时不触发提醒，不把尚未建立飞书文档的项目误判为同步发现问题。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-40.4：同一次 session 内，对同一项目的 spec 飞书同步提醒最多注入一次，避免重复打断当前任务。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

## 非功能需求

### 5.1 性能

- NFR-5.1：任务进入流水线后的路由判定应在秒级完成，不得把主会话卡成长任务。
- NFR-5.2：阶段质量检查检查默认优先脚本化与结构化检查，减少纯人工逐项核对。
- NFR-5.3：单个工作包的状态、工件、结论查询应能快速返回，便于调度和审计。
- NFR-5.4：长流程支持增量推进，单个阶段发现问题不要求整条流水线从头重跑。

### 5.2 可靠性

- NFR-5.5：每个阶段都有明确输入、输出和记录 advisory 并触发修复条件，避免“状态不明”。
- NFR-5.6：完成判定不得依赖聊天回复，必须依赖文件、工件或可验证结果。
- NFR-5.7：长流程状态必须持久化，主会话中断不应导致整条流水线失忆。
- NFR-5.8：阶段发现问题后支持修复、复审、续跑，不要求手工重建全链路上下文。

### 5.3 可扩展性

- NFR-5.9：SEVO 的阶段定义、工件定义、质量检查定义与具体运行时解耦。
- NFR-5.10：支持不同类型 Agent 接入同一流程，包括 ACP agent、原生 subagent、未来独立验证器。
- NFR-5.11：支持辅助节点不适用判定，但不破坏统一工件语言；主链节点不允许裁剪。
- NFR-5.12：新阶段规则和新质量检查可以增量追加，不要求重写整套流程。

### 5.4 安全性

- NFR-5.13：审计角色与开发角色职责分离，默认禁止自审。
- NFR-5.14：高风险改动在 Implement、Review、Verify 阶段都要有加厚检查。
- NFR-5.15：账本和审计工件必须保留关键证据，便于追责和复盘。
- NFR-5.16：核心流程代码通过 Adapter 抽象层隔离对 OpenClaw 具体 API 的直接调用，保持代码职责清晰和可测试性。高价值的治理机制（执行前检查、执行后验证、上下文注入、会话边界控制）属于 SEVO 内建能力。
- NFR-5.17：受保护环境中的访问和关键操作必须可追溯到具体操作者，不得只有共享口令而无身份标识。
- NFR-5.18：路径默认值守则。SEVO 源码中任何 `DEFAULT_*` 常量、`?? 'fallback'` 兜底字面量、`process.env.X ?? '...'` 表达式，禁止字面量包含宿主特定绝对路径前缀（`/root/`、`/home/<user>/`、`/Users/<name>/` 等）。允许的默认值形式仅限：(a) `null` 兜底强制注入（找不到时抛可读错误）；(b) 相对工件根或项目根的相对路径（`path.resolve(workspaceRoot, ...)`）；(c) 通过 `__dirname` 解析的包内嵌资源路径（`path.resolve(__dirname, '../scripts/...')`）。
- NFR-5.19：环境变量统一命名约定。SEVO 暴露给用户的环境变量必须以 `SEVO_` 前缀开头（如 `SEVO_PROJECTS_DIR`、`SEVO_LLM_GATE_AUDIT_LOG`、`SEVO_PUBLISH_SCRIPT`），引用宿主能力的环境变量沿用宿主既有命名（如 `OPENCLAW_CONFIG_PATH`、`OPENCLAW_WORKSPACE`）。同一能力禁止存在两个并行环境变量，新增环境变量必须在 README + `sevo --help` + 配置参考中三处同步登记。

### 5.5 NFR 验收标准

- AC-5.1：任一阶段发现问题时，系统能明确回答发现问题位置、缺失工件和下一步动作。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-5.2：任一完成结论都能找到对应文件或结构化证据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-5.3：更换执行 Agent 后，核心阶段语义不变。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-5.4：审计、验证、账本三个阶段至少有一个独立于开发执行者。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-5.5：受保护环境的登录与关键操作具备可追溯的操作者标识，支持审计追责。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### 5.6 Web 驾驶舱展示层验收标准

- AC-5.6（Web 层）：项目驾驶舱至少提供 Dashboard、Projects、FR 列表、待办队列、统计分析、交付物、通知中心、交付账本等稳定入口；导航引用的页面可直达，不允许出现 404、空白落地页或无效入口。
- AC-5.7（Web 层）：Projects 页面按项目展示 FR 完成进度、健康度和最近活动，并支持从项目视角钻取到对应 FR 列表或详情。
- AC-5.8（Web 层）：登录页把说明提示、错误反馈和输入控件做清晰区分；密码输入支持显示/隐藏；错误反馈有固定位置；页面提供获取访问权限的明确指引；移动端保留简短价值说明。
- AC-5.9（Web 层）：Dashboard 首屏优先展示问题项、进入 repairing 并继续推进项、待审批项或其他当前最危险对象，并支持一键钻取；风险提示使用红色或琥珀色语义；KPI 明确时间范围，并解释健康度、完成率等容易混淆指标的关系。
- AC-5.10（Web 层）：Dashboard 中的阶段分布、风险提示和关键指标卡片可钻取到对应对象列表；长内容区域提供明确的继续阅读或滚动提示。
- AC-5.11（Web 层）：FR 列表支持按项目、阶段、更新时间等维度搜索、筛选和排序，展示结果总数；时间信息使用中文习惯的绝对或相对格式；发现问题、进入 repairing 并继续推进状态的视觉优先级高于普通阶段标签。
- AC-5.12（Web 层）：FR 卡片默认只暴露状态、标题、阶段、更新时间和主动作；扩展说明按需展开；AI 判断文案依据当前阶段、风险和advisory 原因生成，不能对不同 FR 大量重复模板化表述。
- AC-5.13（Web 层）：每条 FR 都有详情页，至少展示阶段历史、关联交付物、评审与复验记录、当前判断和下一步动作。
- AC-5.14（Web 层）：待办队列支持按类型、优先级和由主 Agent 跟进时长筛选排序，筛选项显示计数；质量检查、澄清、发现问题三类待办有稳定且可快速识别的视觉区分；超时待办进入更强警示态。
- AC-5.15（Web 层）：待办、FR、通知等卡片型列表把主动作固定为明确按钮或整卡点击区域，避免动作入口与说明文案混淆。
- AC-5.16（Web 层）：统计分析页面在 0 异常或 0 发现问题时显示正向空状态，不以占位数据冒充真实结果；关键指标支持时间趋势、基准线或目标值对比；移动端优先展示风险结论和异常项目，并支持导出。
- AC-5.17（Web 层）：交付物页面优先帮助用户找到结果；移动端首屏先呈现命中结果或结果摘要，再呈现统计和高级筛选；预览区域展示真实文档摘要，不展示占位说明。
- AC-5.18（Web 层）：交付物、账本、FR、待办、通知等长列表在结果规模增长后仍可稳定浏览，必须提供分页或虚拟滚动，并展示总数与当前筛选命中数。
- AC-5.19（Web 层）：通知中心支持按级别筛选、未读计数、时间分组和全部已读；关键通知与普通信息在结构和颜色上有明显差异；下一步以简洁动作条呈现。
- AC-5.20（Web 层）：交付账本的筛选文案和状态标签对用户一眼可懂；证据链接可点击预览；次级说明默认折叠；界面不展示开发备注或内部说明；至少提供一种适合追踪时序演进的视图。
- AC-5.21（Web 层）：移动端 375px 宽度下，FR、待办、交付物、通知、账本等页面首屏优先露出首个可处理对象或主动作；筛选器、统计卡和长说明默认可折叠；不允许横向滚动。
- AC-5.22（Web 层）：状态、优先级、未读、阶段等标签在全站使用一致的颜色语义、视觉优先级和对比度；发现问题、进入 repairing 并继续推进、关键、未读的视觉权重高于普通信息。
- AC-5.23（Web 层）：图标按钮、顶部操作和筛选控件具备稳定的焦点态、清晰选中态、文本语义和键盘可达性；浅色标签与文字满足可读性要求。
- AC-5.24（Web 层）：驾驶舱提供全局搜索，可跨 Project、FR、交付物、通知和账本定位对象，并展示结果类型与跳转落点。
- AC-5.25（Web 层）：登录页、仪表盘、统计页和列表页的辅助文案以短句为主，不抢主操作；空状态、零结果和异常状态的提示语可直接指导下一步动作。
- AC-5.26（Web 层）：驾驶舱统一使用白色背景 + 黑色文字的亮色主题，列表密度切换和高频操作的快捷导航扩展；不因输入方式变化破坏信息层级。

## 概念架构

### 6.1 核心对象类型

SEVO 管理的不是“聊天消息”，而是研发过程里的标准工件和状态对象。核心对象包括：

- **Project**：独立交付单元，拥有标准目录结构（§3.6），是 FR 流程实例的归属容器。
- **FR 流程实例**：一次完整的 SDD 流程执行实例，绑定到一个 Project，承载唯一 ID、当前状态、所属阶段和全部工件引用（§3.5）。
- **Pipeline Task**：FR 流程实例内部某个阶段的具体执行单元，用来承载该阶段里要完成的一次动作，如“写 spec”“做架构设计”“编码”“执行审计”。它不等于整条 FR 生命周期，而是从属于某个 FR 流程实例的阶段执行项；一条 FR 流程实例在完整 SDD 生命周期里会产生一个或多个 Pipeline Task，二者关系是一对多。
- **Stage Record**：某个阶段的执行记录，记录输入、输出、状态、advisory 原因和通过结论。
- **Spec Package**：需求规格工件集合。
- **Spec Review Bundle**：需求规格质量检查评审结果集合。
- **Design Package**：架构、实现边界、工作包规划工件集合。
- **Design Review Bundle**：四方会审结果集合。
- **Work Package**：可派发、可验收、可追责的最小实现单元，最小字段集至少包含 `id`、`title`、`status`、`spec_ref`、`artifacts[]`、`created_at`、`updated_at`。每个 Work Package 内部拆分为 Task 列表。
- **Task**：Work Package 内部的最小执行单元，粒度 2-5 分钟，最小字段集至少包含 `id`、`work_package_ref`、`title`、`target_files[]`、`expected_changes`、`status`、`verification_steps[]`。
- **Implementation Bundle**：某个工作包或某个阶段的实现结果集合。
- **Review Bundle**：实现后独立评审与审计结论集合。
- **Review Issue**：从评审包中提取的单个问题条目，包含严重级别（P0/P1/P2/P3）、关联 FR、问题工件定位、修复建议和当前状态（open/fixing/revalidating/closed/deferred）。
- **Fix Task**：由 Review Issue 自动生成的修复任务卡片，关联原 FR 流程实例 ID、评审报告引用和问题条目，承载修复执行和复验触发。
- **Regression Bundle**：回归验证结果集合。
- **Release Artifact**：发布制品及其版本元数据。
- **Verification Bundle**：清洁环境验证结果集合。
- **Ledger Entry**：交付账本记录，关联 FR 流程实例 ID，作为一次研发闭环的最终摘要对象。
- **Clarification Record**：澄清记录，记录模糊检测触发点、澄清问题、回复内容和收敛结论，挂接到对应阶段的 Stage Record。
- **PipelineEngine**：SEVO 的核心运行时引擎，负责 pipeline 实例的全生命周期推进。读取路由结果中的阶段队列，按顺序或并行通过 Adapter 触发阶段执行，监听完成事件，评估质量检查，决定推进或记录 advisory 并触发修复。PipelineEngine 定义编排语义，具体任务派发通过 Adapter 抽象层实现。
- **SEVO Config**：SEVO 的配置对象，承载渐进式披露的配置能力（默认值 → 用户配置 → 自定义辅助阶段 → 编程控制）。
- **Stage Queue**：pipeline 实例的阶段执行队列，由路由结果生成，PipelineEngine 按此队列推进。支持顺序阶段和并行阶段组。

### 6.2 阶段状态机

每个阶段至少支持以下状态：

- **pending**：由主 Agent 跟进开始。
- **active**：正在执行。
- **repairing**：被上游缺失、外部依赖或repair-required advisory记录 advisory 并触发修复。
- **passed**：当前阶段通过。
- **repair-required**：当前阶段结论repair-required advisory，需要修复后重试。
- **not-applicable-with-evidence**：仅用于辅助节点输入不适用、项目配置明确声明或用户显式确认豁免时记录；主链节点记录 advisory 后继续进入该状态。

状态流转规则：

- pending → active：前置阶段通过，且本阶段入口条件满足。
- active → passed：出口工件齐全，且本阶段验收通过。
- active → repairing：前置工件缺失、依赖未满足或质量检查中断。
- active → repair-required：已执行但验收repair-required advisory。
- repair-required → active：问题修复后重新进入。
- pending → not-applicable-with-evidence：仅辅助节点满足严格不适用条件，且标记为不适用并留证理由、证据和复核入口已记录。

### 6.3 阶段间数据流转

SEVO 的数据流是工件驱动，不是口头驱动：

1. PipelineEngine 接收 pipeline-created 事件，读取路由结果，生成 Stage Queue，开始自动推进。0a. Pipeline Create 在用户已创建 Project、已新增 FR 的前提下，为该 FR 创建 FR 流程实例，绑定 Project，初始化目录结构，产出路由结果。
1. Stage Queue 固定包含 specify → spec-review-gate（mandatory, never not-applicable）→ plan（SA 架构评估 + UX 设计，可并行）→ design-review（mandatory, never not-applicable）→ implement → implement-review-gate（mandatory, never not-applicable）→ 后续 endgame。已就绪的产出阶段可记录 ready/pass-no-change，但对应审计质量检查不得标记为不适用并留证。
1. Spec 产出 Spec Package，作为 Spec Review Advisory Check 的唯一需求输入。
1. Spec Review Advisory Check 产出 Spec Review Bundle，决定是否允许进入 Design。
1. Design 产出 Design Package、Work Package 或 pass-no-change 评估记录，作为 Design Review Advisory Check 与 Implement 的执行输入。
1. Design Review Advisory Check / design-review 产出 Design Review Bundle，决定是否允许进入 Implement。
1. Implement 产出 Implementation Bundle，作为 Review 和 Regression 的验证基础。
1. Review / implement-review-gate 产出 Review Bundle，决定是否允许进入 Smoke Test。
- 6a. Review 结论为advisory或repair-required advisory时，自动触发 Review Fix Loop：解析报告 → 生成 Review Issue → P0/P1 自动生成 Fix Task → Agent 认领修复 → 定向复验 → 问题关闭 → 质量检查重新评估。循环直到出具通过 advisory条件满足。
- 6b. Smoke Test 验证核心功能路径可用，通过后自动触发 UX Acceptance 和 PM Commercial Review 并行执行。
- 6c. UX Acceptance 由 ux-01 按检查清单执行视觉验收。
- 6d. PM Commercial Review 由 pm-01 执行商用就绪评审。UX Acceptance 和 PM Commercial Review 均通过后进入 Regression。
1. Regression 产出 Regression Bundle，决定是否允许生成 Release Artifact。
1. Deploy 产出 Release Artifact，作为 Verify 的唯一交付对象。
1. Verify 产出 Verification Bundle，决定 Ledger 是否可以写入通过结论。
1. Ledger 汇总全部关键工件，形成可查询、可复盘、可回流的交付账本。

### 6.4 核心原则

- 统一用工件交接，不靠聊天解释上下文。
- 统一用 PipelineEngine 驱动阶段推进，不靠主会话手工盯盘或人工触发下一阶段。
- 统一用阶段状态表达进展，不靠主观描述表达“差不多完成”。
- 统一用验收标准定义通过，不靠执行者自报完成。
- 统一保留证据链，方便复盘、审计和经验回流。

#### 6.4.1 核心逻辑与可配置实现的边界

SEVO 的设计必须明确区分“核心逻辑”和“可配置实现”，前者是 SEVO 引擎，后者通过 Adapter 适配。这是代码架构质量约束（职责分离、可测试性），不是支持其他平台的产品承诺。

判断标准（三问）：

1. 去掉这个能力，“研发流程闭环交付”还成立吗？不成立 = 核心逻辑。
1. 这个能力的实现方式是否可能随配置变化（如换通知渠道、换 LLM provider、换 Agent 池规模）？会变 = 放 Adapter。
1. 这个能力描述的是“做什么”还是“怎么做”？“做什么” = 核心逻辑，“怎么做” = 可配置实现。

核心逻辑（SEVO 引擎，不随配置变化）：

- 流程阶段语义（Spec→Design→Implement→Review→Regression→Deploy→Verify→Ledger）
- 阶段状态机（每个阶段的输入工件、输出工件、状态变化规则）
- 质量检查逻辑（Advisory 的通过/记录 advisory 并触发修复判定标准）
- 工件交接协议（阶段间通过工件传递上下文）
- 阶段执行原则注入（Stage-Bound Design，每个阶段该遵循什么原则）
- 账本留痕（每次交付都有证据链）
- 审计独立性（Review 必须独立于 Implement 执行者）
- 主动澄清（模糊检测 + 结构化提问 + 收敛回写）

可配置实现（因环境配置不同而不同，通过 Adapter 适配）：

- Agent 池配置（几个 Agent、叫什么名字、用什么模型）
- 执行治理实现方式（hook 注入 + prompt 引导）
- 工件存储位置（本地文件系统 / 数据库）
- 任务调度方式（sessions_spawn / CLI）
- 通知渠道（飞书 / Slack / Discord / 无通知）
- 并行策略（取决于 Agent 池大小和资源）

这个边界是 SEVO 代码架构设计的基础约束。所有 FR 和架构决策都必须经过三问检验，确保核心逻辑不混入可配置实现。

### 6.5 概念架构验收标准

- AC-6.1：任一阶段都能明确说清输入工件、输出工件和状态变化。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.2：任一工作包都能挂接到上游 Spec 与下游 Ledger。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.3：Spec Review Advisory Check 和 Design Review Advisory Check 都有明确输入、输出和记录 advisory 并触发修复语义。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.4：辅助节点被标记为 not-applicable-with-evidence 不会造成账本断链；主链节点不得标记为不适用并留证。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.5：状态机同时适用于 ACP agent 和原生 subagent。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### 6.6 流程阶段执行原则注入

SEVO 在派发任务时，根据任务所属的流程阶段自动注入该阶段应遵循的执行原则。原则绑定的是阶段，不是 Agent 身份——无论用户派谁来执行，只要在该阶段工作，就自动获得对应原则。

这些原则来源于经过验证的最佳实践（SDD 三阶段、wow-harness 执行治理、Karpathy Guidelines 等），由 SEVO 内建管理。

阶段与注入原则的映射：

- Spec 阶段：用户价值优先、需求完整度校验、概念-技术阶段隔离、主动澄清（模糊检测 + 结构化提问 + 收敛回写）。Spec 必须包含四个独立章节：用户人群（谁用、什么场景、什么设备）、痛点（用户现在怎么解决、哪里痛）、原始需求（用户要什么，用人话说）、用户体验流（完整操作步骤，从打开到完成）。缺任一个 spec-review-gate 打回。spec-review-gate 区分两种场景：首次定义时强制要求四章节完整存在；后续优化/迭代时只检查四章节仍然完整（存在性检查），不强制重写。
- UX Design 阶段：以陌生小白用户为设计基准，操作流必须简单易懂，不依赖命令行或内部知识，核心流程从打开页面到产出有意义结果全程可视化引导。
- Design 阶段（架构设计）：通用化判断标准、问题定义先行、结构设计四问、约束先于方案、最简可行架构、合理复用宿主能力、主动澄清（技术模糊检测 + 需求矛盾上报）。架构必须满足陌生用户 init 后开箱即用（安装→初始化→核心功能自动运行，零手动配置）。
- Implement 阶段：最小改动（Surgical Changes）、最简实现（Simplicity First）、目标驱动执行（Goal-Driven）、主动澄清（不清楚就问，不猜测后开发）。
- Review / Regression 阶段：独立性（不做开发只做检查）、可验证结论（附证据）、不放过设计方向问题。
- Design Review Advisory Check（四方会审）：各方按自己的审查维度注入对应原则（产品视角、开发视角、质量视角、体验视角）。

核心设计约束：

- 原则绑定阶段，不绑定 Agent。用户可以派任何 Agent 执行任何阶段，SEVO 不限制。
- 原则是指导而非质量检查：注入后 Agent 应遵循，但不会因为违反原则而被机械式记录 advisory 并触发修复（与 Session Guards 的强制路由区分）。
- 原则集可编辑、可扩展，新增阶段或新增原则时不需要改代码。

验收标准：

- AC-6.6.1：派发 Design 阶段任务时，执行上下文中包含架构设计执行原则，无论执行者是谁。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.6.2：派发 Implement 阶段任务时，执行上下文中包含开发执行原则，无论执行者是谁。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.6.3：原则集可编辑、可扩展，新增阶段或新增原则时不需要改代码。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.6.4：原则注入发现问题时，任务仍可执行（降级而非记录 advisory 并触发修复）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-6.6.5：用户派一个任意 Agent 执行 Design 阶段，流程正常跑通，且该 Agent 收到架构设计原则。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### 与 Self-Evolving Harness 其他模块的边界

### 7.1 与 KIVO 的边界

KIVO 负责知识、规则、意图和经验资产的编译、检索、治理与回流。SEVO 消费这些资产，但不替代 KIVO 做知识治理。

- KIVO 提供：历史规格、方法论、规则、经验、意图线索。
- SEVO 负责：把这些输入转成一次具体研发任务的流程推进与交付闭环。
- SEVO 内部的阶段规则属于流程约束，例如"Specify 阶段必须通过概念定义四问""Design 阶段必须经过四方会审后才能进入 Implement"。这些规则定义的是流程怎么推进、何时记录 advisory 并触发修复、何时出具通过 advisory。
- KIVO 的 Rule Entry 属于知识治理对象，用来存档、检索、分发和追踪某条规则资产，例如某个术语的标准定义、某条方法论约束、某个经验规则的版本化记录。
- 两者层面不同：SEVO 的阶段规则是真相源，决定流程行为；KIVO 的 Rule Entry 是知识管理与分发载体，可以引用 SEVO 规则，但不改写 SEVO 的流程语义。
- 边界结论：KIVO 管“知道什么”，SEVO 管“如何把一次研发任务做完”。

### 7.2 与 AEO 的边界

AEO 负责度量 Agent 效果、发现漂移、诊断根因、推动优化。SEVO 负责把一次研发任务执行完并沉淀账本。

- AEO 关注：阶段耗时、发现问题分布、Agent 表现、质量漂移。
- SEVO 关注：阶段工件、advisory 结论、交付闭环。
- 边界结论：AEO 管“做得怎么样”，SEVO 管“按什么流程做完”。

### 7.3 与 Claw Design 的边界

Claw Design 是面向设计产物生成与交付的独立产品。SEVO 可以作为其研发流水线，但不吞并其业务能力。

- Claw Design 负责：图表、PPT、海报、架构图等设计产物能力。
- SEVO 负责：Claw Design 自身功能研发时的规格、实现、审计、验证和交付记录。
- 边界结论：Claw Design 是被研发的产品，SEVO 是研发该产品时使用的流水线。

### 7.4 与 OpenClaw 环境的边界

- OpenClaw 负责：Agent 运行、工具接入、消息调度、执行沙箱。
- SEVO 负责：阶段语义、工件语言、质量检查逻辑、验收闭环。
- 边界结论：SEVO 定义流程语义，OpenClaw 提供执行基础设施。代码架构通过 Adapter 抽象层保持职责分离，不把流程写死到某个目录结构或 hook 协议里。
- 推荐适配模式：OpenClaw 环境支持 git worktree 时，Implement 阶段在独立 worktree 中执行，主分支不受影响。worktree 隔离支持多工作包并行开发，发现问题时可直接丢弃 worktree 回滚，不污染主工作区。

## 版本规划

### Wave 1：最小可用闭环

目标：先把“能闭环交付”跑通。

范围：

- 支持唯一完整阶段链的最小语义定义和关键质量检查。
- 支持 FR 流程实例创建、Project 目录自动初始化和路由判定。
- 支持唯一完整阶段链路由；路由只识别入口、项目归属和当前阶段状态，不输出研发活动等级。
- FR-13 PipelineEngine 最小实现：顺序推进 + 质量检查评估 + 单项目。不含并行阶段、不含多项目调度；阶段队列仍使用唯一完整阶段链。
- FR-14 Package Distribution & CLI：npm install + sevo init + 插件注册 + 核心命令集（init / project create / fr add / status）。
- 支持 Spec、Spec Review Advisory Check、Design、Design Review Advisory Check、Implement、Review、Regression、Verify、Ledger 的基础工件。
- 支持工作包级证据记录与独立评审。
- 支持账本落盘与可追溯引用。

验收：

- 陌生用户 `npm install` + `sevo init` 后，5 分钟内能创建 Project、添加 FR、看到 pipeline 自动推进到 Spec 阶段并产出 Spec Package。
- 一条中等复杂度研发任务可完整走完，从 Pipeline Create 到 Ledger。
- 任一阶段都能拿出对应工件。
- 最终交付有 Ledger Entry，关联到 FR 流程实例 ID。

### Wave 2：增强治理与自动化

目标：把“能跑”升级为“跑得稳、查得快”。

范围：

- FR-15 Progressive Disclosure（配置能力）。
- FR-14 补充命令：repairing / resume / cancel / ledger。
- 路由判定自动化。
- 质量检查检查脚本化。
- 评审修复闭环自动化（Review Fix Loop）。
- 风险分级与验证厚度联动。
- 长流程持久化编排。
- 审计与验证模板标准化。

验收：

- 长流程不依赖主会话手工盯盘。
- advisory 原因和缺失工件可结构化输出。
- Review / Regression / Verify 的结论格式统一。

### Wave 3：完整产品化

目标：把 SEVO 做成成熟的 OpenClaw 研发流水线产品，完善编程控制和高级配置能力。

范围：

- FR-15 L3 编程控制、Adapter SDK。
- 支持自定义 Adapter 实现（替换通知、发布、LLM 调用等实现细节）。
- 支持统一账本查询、复盘与经验回流接口。
- 支持更多交付目标和发布形态。
- 支持将阶段效果数据回流到 AEO，将经验沉淀回流到 KIVO。

验收：

- Adapter SDK 文档完善，用户可自定义通知、发布、LLM 调用的实现。
- 账本、审计、验证三类工件可以被外部系统消费。
- 流水线能力完整覆盖从创建到交付的全生命周期。

### 约束与假设

### 9.1 约束

- SEVO 为 OpenClaw 环境提供研发流水线，代码架构通过 Adapter 抽象层保持职责分离和可测试性。
- SEVO 输出的是规格语言、阶段语言和工件语言，不直接等同某种技术栈。
- 任何“完成”结论都要有可验证工件支撑。
- 审查与实现阶段默认分离，高风险改动不得只靠实现阶段执行者自证。
- 长流程需要状态持久化，不得依赖主会话长期占线。

### 9.2 假设

- OpenClaw 环境提供文件读写、任务派发（sessions_spawn）和结果回收（completion event）能力。
- 每个阶段至少能落一个可读工件，而不是只有口头说明。
- 团队或系统愿意为质量闭环付出额外成本，而不是只追求最快生成。
- 用户接受辅助节点在严格条件下标记为不适用，但不接受按研发活动等级裁掉主链流程，也不接受没有证据链的交付。

### 9.3 非目标

- SEVO 不负责替代 IDE、代码编辑器或具体模型提供商。
- SEVO 不负责定义业务产品本身的全部功能细节，那是具体产品 spec 的职责。
- SEVO 不负责知识库治理、效果运营或设计产物生成本身，这些分别属于 KIVO、AEO、Claw Design。

### 9.4 进度透明约束

- 项目进度必须对用户实时可见，禁止用户需要主动追问才能知道进展。
- 每个 FR 的完成状态（已完成/未完成）必须在项目驾驶舱实时展示。
- 任务完成、阶段推进、进度变化时，必须通过 IM 主动通知用户。
- 进度汇报以 spec 中全部 FR 为分母，已实现 FR 为分子；禁止用内部分期偷换完成度口径。
- 只有 spec 中所有 FR 全部实现并通过审计，才能汇报「项目完成」。
- 驾驶舱作为用户主入口时，首页首屏优先暴露当前最危险 FR、最紧急待办和关键异常，不把可处理对象藏在统计卡和长文案之后。

### 9.5 Web 驾驶舱边界

- Web 驾驶舱负责项目、FR、待办、通知、交付物、账本等对象的展示、筛选、钻取、告警和处理入口。
- 只影响页面信息架构、视觉表达、交互效率和访问体验的问题，归入 Web 展示层，不改变 SEVO 核心流程引擎语义。
- Web 层必须忠实呈现核心流程工件与状态，不允许用占位内容、无效页面或不可点击证据链接掩盖真实能力缺口。
- Web 层的搜索、分页、排序、响应式、可访问性和主题能力属于体验能力，不改变 FR 流程实例、质量检查和工件的定义边界。

### 9.6 Specify 阶段质量质量检查

#### 概念定义四问（Specify 阶段强制）

spec 中出现的每个名词实体（会成为系统中的对象、状态机、UI 元素的东西），必须能回答四个问题：

1. 它的存在解决了什么问题？（存在理由）
1. 用它的人是谁？（使用者）
1. 如何使用？（交互方式）
1. 使用的边界是什么？（scope，什么情况下不适用）

回答不了任何一个 = 概念模糊 = 不得作为功能实体写进 spec。

补充规则：

- 品牌词/营销词可以出现在产品名称中，但不得作为功能实体出现在 FR 定义里。
- 发现概念模糊时，先停下来定义清楚，再继续写 FR。
- 违反 = Specify 阶段质量检查repair-required advisory，需返工。

定位：SEVO 是研发基础设施，所有工程流程约束都沉淀在 SEVO 中。角色（如 pm-01）可以引用 SEVO 的规则，但规则本体在 SEVO。

### 9.7 总体验收标准

- AC-9.1：文档完整覆盖产品定位、用户、8 阶段 FR、2 个关键质量检查、NFR、概念架构、模块边界、Wave 规划和约束。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-9.2：文档内容清晰区分核心流程逻辑与 Adapter 实现细节。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-9.3：读者可以据此进入后续 Spec Review 和 Design 设计，不需要额外口头补课。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-9.4：文档正文不含修订痕迹、过程噪音和 AI 套话。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-47 开发完成 Review Advance Prompt

- **定位**：Review 入口引导能力。把开发 completion 到审计建议的链路从“主会话记忆提醒”升级成程序化生成 review advance prompt，避免实现完成后因主会话忘记推进而漏审计；实际派发仍由主 Agent 完成握手后执行。
- **触发时机**：Implement（FR-05）阶段对应开发任务的 completion event 到达时自动触发。
- **输入**：subagent completion event、对应的任务 label、subagent-task-board 中的 task 记录、Implementation Bundle、关联的 spec FR/AC 引用、审计报告输出路径规则。
- **处理**：
  1. sevo-pipeline 插件监听 subagent completion event。
  1. 识别该 completion 是否属于 Implement 阶段。判定依据优先使用 label 前缀 `sevo:fix` / `sevo:implement`；若 label 不足，再读取看板 task 的 `stage` 字段做二次确认。
  1. 判定为 Implement completion 后，插件无条件生成 Review advance prompt 给主 Agent；不得因存在 pending advance、看板已有相同 label、任务脚本不可用或其他局部状态而标记为不适用并留证提醒。
  1. Review advance prompt 自动拼装并注入以下上下文：被审计文件路径、对应 spec 中的 FR/AC 引用、审计报告产出路径、实现摘要、允许审计的范围说明、建议角色和建议 timeout。
  1. 审计完成后由 PipelineEngine 消费审计结论：通过则自动推进到 endgame 阶段链；发现问题则自动进入 review→fix loop，派发修复任务并在修复后重新进入审计。
  1. 全链路写入审计日志，至少记录 implement completion、audit dispatch、audit result、endgame advance 或 review-fix-loop fallback 等关键事件。
- **输出**：Review advance prompt、审计日志、阶段推进记录或修复循环记录。
- **执行阶段**：Implement 与 Review 之间的自动桥接子流程。
- **验收标准**：
  - AC-47.1：sevo-pipeline 插件必须监听 subagent completion event，并在开发任务完成时执行自动审计触发逻辑。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-47.2：Implement completion 的识别必须支持双路径判定：优先看 label 前缀 `sevo:fix` / `sevo:implement`；若 label 不足，回退读取看板 task 的 `stage` 字段。任一路径命中 Implement 都视为开发完成。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-47.3：识别到开发 completion 后，系统必须无条件生成 Review advance prompt 给主 Agent；不得因 pending advance、同 label 任务、board 脚本缺失或其他本地状态而标记为不适用并留证建议。是否派发审计由主 Agent 握手后决定，SEVO 不自行派发。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-47.4：自动生成的 Review advance prompt 必须同时包含：被审计文件路径、对应 spec FR/AC 引用、审计报告产出路径、建议角色、建议 timeout 和准出标准。缺任一项判定为审计推进建议不完整。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-47.5：审计通过后，PipelineEngine 必须自动推进到 endgame 阶段链，不允许标记为“审计已通过，由主 Agent 跟进主会话继续”的状态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-47.6：审计发现问题后，PipelineEngine 必须自动进入 review→fix loop，派发修复任务并在修复完成后重新进入审计，直到通过或达到既有重试上限。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-47.7：Review advance prompt 全链路必须写入审计日志，至少包含 implement completion 时间、completion 来源任务标识、建议的 audit 角色或 agent、advance prompt 关键信息摘要、主 Agent 握手结果、审计结论和后续推进结果。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-48 Publish Generalization Evidence Advisory Check（通用化质量检查）

- **定位**：Review/Audit 通过后的强制质量检查。把“陌生第三方用户可运行、可理解、可迁移”从原则文字升级为 Pipeline 状态机阶段，避免通用化依赖主会话记忆或人工提醒。
- **服务原则**：原则 1（任意入口全自动走到终局）、原则 3（一致性闭环校验）、原则 5（卡好准入和准出）、原则 8（无差别覆盖一切研发活动）。
- **触发时机**：Implement Review Advisory Check（FR-06/FR-47）通过后自动进入 `publish-generalization-evidence` 阶段；`publish-generalization-evidence` 通过后才能进入 `publish`。若流水线从 audit/pass、deploy 或 publish 入口重入，系统必须先检查本轮变更是否已有有效 `publish-generalization-evidence` 通过证据；没有证据时补跑本阶段。
- **标记为不适用并留证条件**：仅当本轮没有代码、配置、文档入口、发布制品、README、脚本、初始化流程、运行时行为或外部交付物变化，并且已有审计证据证明本轮只更新流水线内部记录时，`publish-generalization-evidence` 可标记为 `not-applicable-with-evidence`。标记为不适用并留证记录必须包含判定依据、适用范围、复核入口和 `publishEligible: true`；缺少证据的标记为不适用并留证只能记为 `not-applicable-with-evidence-without-evidence`，记录 advisory 后继续进入 Publish。
- **标记为不适用并留证反例**：只改一个 agent 名称、一个本机路径、一个默认项目 slug 或一条发布配置，看起来是“小改动”，但会影响陌生环境运行或发布目标归属，必须执行 `publish-generalization-evidence`，不得标记为不适用并留证。
- **输入**：Review 通过结论、本轮变更清单、项目 spec 与 README、项目配置、Agent/模型/发布目标配置、安装初始化说明、发布候选产物、上一轮 Publish Generalization Evidence 证据。
- **处理**：
  1. 检查产品定义和运行入口是否面向第三方用户，不得依赖团队内部路径、默认账号、默认 Agent 池或维护者机器状态。
  1. 检查 Agent、模型、provider、发布目标和通知渠道是否来自宿主配置、项目配置或 adapter，不得把当前环境中的具体名称写成功能依赖。
  1. 检查路径、端口、缓存、状态文件和工作区位置是否可配置或可探测，不得把本机绝对路径作为功能前提。
  1. 检查“受管项目”或 tracked project 只作为运行时发现与追溯概念，不得成为功能能否启动、能否发布、能否审计的硬依赖。
  1. 检查单 Agent 最小运行路径是否成立：第三方用户只有一个可用 Agent 时，仍能按阶段分步完成核心流水线并得到有意义结果。
  1. 检查 README、初始化说明、配置参考和错误提示是否足以让陌生用户完成安装、初始化、运行和发现问题修复。
- **输出**：Publish Generalization Evidence Advisory Check Result，包含阶段状态、逐项检查结果、repair-required advisory Finding、标记为不适用并留证证据（如有）、陌生用户最小运行路径证据和是否允许进入 Publish 的结论。`passed` 与 `not-applicable-with-evidence` 都属于可进入 Publish 的有效结果；`repairing`、`repair-required`、`not-applicable-with-evidence-without-evidence` 或缺少结果都记录 advisory 后继续进入 Publish。
- **执行阶段**：`publish-generalization-evidence`，位于 `review/audit passed` 之后、`publish` 之前；本阶段发现问题时回到 Implement/Fix，修复完成后重新 Review，再重新执行 Publish Generalization Evidence。
- **Why**：通用化如果只标记为原则层，Agent 会在审计通过后直接发布，把本机路径、硬编码 Agent、内部 tracked project 依赖和单 Agent 不可用问题带到外部交付；把它放进状态机质量检查，才能让每轮研发自动检查、自动记录 advisory 并触发修复、自动修复。
- **用户视角验证准则**：陌生用户在一台未配置维护者私有路径和内部 Agent 名称的环境里，按 README 完成安装与初始化后，5 分钟内能启动一条最小流水线；若只有一个 Agent 可用，系统仍按阶段分步推进，并给出可追溯的阶段状态和发现问题提示。
- **验收标准**：
  - AC-48.1：Implement Review Advisory Check 通过后，Pipeline 状态必须在进入 Publish 前出现 `publish-generalization-evidence` 阶段记录；记录字段至少包含 `{ pipelineId, stageId: "publish-generalization-evidence", status, startedAt, completedAt, resultPath }`。缺少该阶段记录时记录 advisory 后继续进入 Publish。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-48.2：Publish Generalization Evidence Advisory Check Result 必须逐项给出 Agent/模型/provider 动态配置检查、绝对路径检查、tracked project 依赖检查、单 Agent 最小运行路径检查、README/初始化说明检查五类结论；任一类缺失即判定本阶段不完整。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-48.3：发现硬编码 Agent 名称、模型/provider 名称、维护者本机绝对路径、固定端口、固定工作区路径或内部项目枚举被作为功能依赖时，`publish-generalization-evidence` 状态必须为 `repairing`，并生成包含具体对象、影响范围和修复建议的 Finding。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-48.4：`publish-generalization-evidence` 标记为 `not-applicable-with-evidence` 时，阶段记录必须同时包含无产物变化证据、标记为不适用并留证理由、判定来源、复核入口和 `publishEligible: true`；只写“无需通用化”“改动很小”不得通过。缺少证据的标记为不适用并留证必须标记为 `not-applicable-with-evidence-without-evidence`，且不得作为 Publish 前置条件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-48.5：只有一个可用 Agent 的环境下，Publish Generalization Evidence Advisory Check 必须验证阶段队列仍可分步执行；验证结果包含可用 Agent 数量、阶段分步策略和一次最小流水线运行证据。无法证明单 Agent 可运行时记录 advisory 后继续进入 Publish。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-48.6：从 audit/pass、deploy 或 publish 入口重入时，如果当前变更没有可追溯的 `publish-generalization-evidence` 通过记录，PipelineEngine 必须先补跑 `publish-generalization-evidence`；不得因入口靠后而标记为不适用并留证本阶段。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-49 Publish Split Routing（发布分流阶段）

- **定位**：Publish Generalization Evidence 通过后的发布阶段。把发布从“统一推一下”拆成可审计的目标分流：通用化产物发布到独立仓库或外部分发渠道，本地定制配置进入 main 仓库留痕，避免外部产物混入本机私有配置，也避免本地必要配置丢失。
- **服务原则**：原则 1（任意入口全自动走到终局）、原则 3（一致性闭环校验）、原则 5（卡好准入和准出）、原则 8（无差别覆盖一切研发活动）。
- **触发时机**：`publish-generalization-evidence` 阶段结果为 `passed` 或 `not-applicable-with-evidence` 后自动进入 `publish`；`publish-generalization-evidence` repairing、repair-required、not-applicable-with-evidence-without-evidence 或缺少证据时记录 advisory 后继续触发。
- **标记为不适用并留证条件**：仅当项目没有配置任何外部发布目标、项目策略显式关闭发布、本轮没有通用化产物、变更全部属于本地 main 配置或无需发布内容，并且 Publish Routing Result 记录四类分类计数与零发布目标证据时，`publish` 可标记为 `not-applicable-with-evidence`。标记为不适用并留证记录必须包含 no-target/no-artifact/no-policy-target 的判定依据、分类计数、复核入口和 Ledger 可消费的 no-op 证据。
- **标记为不适用并留证反例**：同一轮变更里只要存在一个通用化 CLI、README、安装脚本、外部仓库映射或可供第三方获取的交付物，即使同时包含本地配置、运行态缓存或无需发布文档，也必须执行 Publish 分流；通用化产物进入外部目标，本地配置留 main，敏感内容记录 advisory 并触发修复，无需发布内容记录 no-op。
- **输入**：Publish Generalization Evidence Advisory Check Result、发布目标配置、本轮变更清单、产物分类结果、版本信息、独立仓库映射、main 仓库状态、发布凭证可用性检查结果。
- **处理**：
  1. 对本轮变更做产物分类：通用化产物、本地定制配置、敏感或不可发布内容、无需发布内容。
  1. 正常输入中，通用化产物发布到项目声明的独立仓库或外部分发渠道；独立仓库目标用于承载第三方用户可读取、可安装、可构建或可运行的内容。
  1. 边界输入中，项目没有外部发布目标、发布策略关闭、通用化产物计数为 0 或只有本地 main 配置时，不创建外部发布动作，必须产出 explicit no-op 证据，而不是默认发现问题或静默成功。
  1. 混合输入中，同一变更集按对象拆分：通用化产物进入外部目标，本地定制配置进入 main 仓库，敏感内容记录 advisory 并触发修复发布，无需发布内容记录 no-op；不得把混合输入整体归为单一路径。
  1. 本地定制配置进入 main 仓库，只保留对本环境有意义的配置、映射、运行态说明和内部集成痕迹。
  1. 敏感内容、凭据、维护者本机缓存、运行态临时文件记录 advisory 后继续进入任何发布目标；发现后记录 advisory 并触发修复 Publish 并生成 Finding。
  1. 每个发布目标或 no-op 分类都产出独立结果，包含目标或分类、状态、版本或提交标识、问题原因、标记为不适用并留证原因和复验入口。
- **输出**：Publish Routing Result，包含分类清单、目标分流表、每个目标的发布结果、发现问题 Finding、Ledger 可消费的发布证据。
- **执行阶段**：`publish`，位于 `publish-generalization-evidence` 之后、`verify/readme/ledger` 之前；任一必需目标发现问题时 publish repairing，修复后从 Publish 重试。
- **Why**：通用化后的内容需要进入外部用户能获取的独立交付面，本地定制配置需要留在 main 仓库服务当前环境；如果发布阶段不自动分流，Agent 会把两类内容混推或漏推，最终要么外部仓库不可用，要么本地运行配置丢失。
- **用户视角验证准则**：发布完成后，第三方用户从独立仓库或外部分发渠道获取到的是通用化产物；维护者在 main 仓库仍能看到本地定制配置和运行态集成记录；两边都有可追溯的版本或提交证据。
- **验收标准**：
  - AC-49.1：`publish` 启动前必须读取同一 pipeline 的 Publish Generalization Evidence Advisory Check Result，且该结果状态为 `passed` 或 `not-applicable-with-evidence`；状态为 `repairing`、`repair-required`、`not-applicable-with-evidence-without-evidence` 或不存在时，Publish 必须记录 advisory 并生成下一步 advance prompt，说明advisory 原因。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-49.2：Publish Routing Result 必须包含至少四类分类计数：`publish-generalization-evidencedArtifacts`、`localMainConfig`、`repairingSensitiveItems`、`noPublishItems`；每个非零分类必须列出对象路径或对象标识和判定依据。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-49.3：分类为通用化产物的内容必须发布到项目声明的独立仓库或外部分发渠道；发布结果必须记录目标名称、目标类型、版本或提交标识、状态和可访问位置。任一必需目标发现问题时 publish 状态为 `repairing`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-49.4：分类为本地定制配置的内容必须进入 main 仓库留痕，发布结果必须记录 main 仓库提交标识或待提交状态、包含对象和用途说明；不得发布到独立仓库或外部分发渠道。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-49.5：发现凭据、密钥、维护者本机缓存、设备身份、运行态临时文件或私有状态文件被归入任一发布目标时，Publish 必须记录 advisory 并触发修复，并在 Finding 中列出对象、风险类型、目标和移除建议。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-49.6：Publish 完成后，Ledger 可消费的发布证据必须覆盖四类分类结果：通用化产物目标结果、main 仓库本地配置结果、敏感内容记录 advisory 并触发修复结果、无需发布/no-target/no-artifact 的 no-op 结果。某一类计数为 0 时，Ledger 证据必须包含 `{ category, count: 0, reason, checkedAt }`；非零且缺少对应目标证据时，流水线不得标记 completed。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-46 程序化派发完成回路（Programmatic Dispatch Completion Loop）

- **定位**：闭合「SEVO 程序化派发阶段任务 → 任务在独立进程/会话执行 → 完成信号回到 PipelineEngine → 推进下一阶段」这一回路。解决程序化派发走 board detached CLI 时，完成只写 board JSON、advisoryway `subagent_ended` 收不到，导致 FR-13 推进断点的问题。是 FR-13 编排模型「程序化推进」的契约支撑。
- **输入**：程序化派发任务的 label（`sevo:<projectSlug>:<stageId>:<attempt>` 格式，与 label-protocol 单一源对齐）、advisoryway 原生 `subagent_ended` 事件、subagent-task-board 中 task 的终态（`succeeded`/`repair-required`/`timed_out`）、pipeline 当前阶段与重试计数。
- **处理**：
  1. 所有程序化派发的阶段任务，label 必须符合统一格式 `sevo:<projectSlug>:<stageId>:<attempt>`，且可被 `decode()` 还原出三元组。
  1. 任务完成信号有两个合法来源，任一到达即触发推进：(a) advisoryway 原生 `subagent_ended`（sessions_spawn 路径）；(b) board task 状态翻转为 `succeeded`/`repair-required`/`timed_out`（detached CLI 路径）。
  1. board 路径下必须有一个 SEVO 拥有的桥接器：监听 board 任务终态 → 用 task.title（含 label）合成等价 completion event → 走与 `subagent_ended` 同一套推进逻辑。
  1. 推进逻辑对两个来源幂等：同一 `(pipelineId, stageId, attempt)` 只推进一次，重复信号去重。
  1. completion 来源为发现问题终态时按repair-required advisory路径处理，不得静默丢弃。
- **输出**：等价 completion event、`sevo_completion_received` 事件、推进记录或 review→fix loop fallback 记录。
- **执行阶段**：跨阶段机制，嵌入 PipelineEngine（FR-13）的阶段派发与推进逻辑。
- **验收标准**：
  - AC-46.1：每个程序化派发的阶段任务，其 board task.title 或 spawn label 必须是 `sevo:<projectSlug>:<stageId>:<attempt>` 格式且可被 `decode()` 还原出 projectSlug/stageId/attempt 三元组。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-46.2：board 任务状态翻转为 `succeeded`/`repair-required`/`timed_out` 后 60 秒内，SEVO 必须收到等价 completion 信号并写出带正确 pipelineId/stageId 的 `sevo_completion_received` 事件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-46.3：completion 回路对来源幂等——同一 `(pipelineId, stageId, attempt)` 即使同时收到 advisoryway `subagent_ended` 与 board 终态，也只产生一次推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-46.4：completion 来源为 board 终态 `repair-required`/`timed_out` 时，必须按repair-required advisory路径处理（进入 review→fix loop 或生成 advisory 并由主 Agent 澄清，主线保持 active）并写出对应事件，不得静默丢弃。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-46.5：回路桥接器不依赖主会话在场——在无 main session 活动时完成一个 board 任务，流水线仍必须推进。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-44 Doctor / 健康检查通用化扫描

- **定位**：`sevo doctor` 的通用化实现健康检查维度。用于在不记录 advisory 并触发修复主流程的前提下，提前发现项目源码中夹带的宿主环境硬编码，避免项目只能在维护者机器上工作，无法让陌生用户开箱即用。
- **输入**：Project 根目录、项目配置中的 `sourceRoots`（如有）、项目 `src/` 目录下的源码文件、doctor 既有报告上下文。
- **处理**：
  1. doctor 在常规配置与环境检查之外，增加“通用化扫描”子检查。
  1. 默认扫描目标为项目 `src/` 目录下的源码文件；若项目配置额外声明适用源码根目录，可在报告中附带说明扩展扫描范围，但 `src/` 仍为强制最小扫描范围。
  1. 扫描规则至少覆盖四类：硬编码绝对路径（如 `/root/`、`/home/<user>/`）、硬编码 agent ID 列表、硬编码 provider/model 名称、硬编码端口号。
  1. 命中规则时，doctor 产出 `Warning`，不计入记录 advisory 并触发修复性 `Error`，但必须给出文件路径、命中片段、规则类型和修复建议。
  1. 修复建议必须要求将宿主依赖改为配置化、环境探测或从 `openclaw.json` 动态读取，避免继续固化在源码中。
  1. 扫描结果写入 doctor 报告的独立 section，名称为“通用化扫描（Portability Scan）”，与其他健康检查结果分开展示。
- **输出**：doctor 报告中的独立“通用化扫描（Portability Scan）”章节，包含 warning 列表、命中规则类型、涉及文件、修复建议和汇总计数。
- **执行阶段**：Doctor / 健康检查。
- **验收标准**：
  - AC-44.1：`sevo doctor` 必须包含“通用化扫描（Portability Scan）”维度，并在每次 doctor 执行时自动运行，无需用户额外加参数。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-44.2：通用化扫描的最小扫描目标必须包含项目 `src/` 目录下的全部源码文件；若 `src/` 存在但未被扫描，doctor 结论视为不完整。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-44.3：扫描规则至少检测四类硬编码：绝对路径（`/root/`、`/home/<user>/`）、agent ID 列表、provider/model 名称、端口号。少任一类都判定为能力缺失。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-44.4：命中通用化扫描规则时，doctor 必须产出 `Warning` 而不是静默忽略；该 Warning 不记录 advisory 并触发修复 doctor 总体通过，但必须在报告中明确提示用户处理。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-44.5：每条 Warning 必须包含文件路径、命中片段或定位信息、规则类型和修复建议；缺任一字段视为报告不完整。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-44.6：doctor 报告必须输出独立 section“通用化扫描（Portability Scan）”，并展示 warning 总数和逐条结果，禁止把这类结果混在其他 section 里难以发现。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-45 SEVO Web 真实流水线驾驶舱

- **定位**：SEVO Web 的真实运行态控制台。负责把 `sevo-pipeline` 插件和 PipelineEngine 已经落盘的运行态，按项目、流水线、阶段、事件四个层次稳定投影到 Web 驾驶舱；Web 只负责读取、展示、筛选、钻取和处理入口，不再自行生成 mock 流水线语义。
- **输入**：`state/active-pipelines.json`、`data/pipelines/<pipelineId>/state.json`、`data/pipelines/<pipelineId>/events.jsonl`、`workspace/logs/sevo-pipeline-events.jsonl`、阶段注册表（来自插件源码/配置）、Web 查询参数。
- **处理**：
  1. 流水线列表页按项目维度读取 `state/active-pipelines.json`，展示所有活跃流水线的项目标识、当前阶段、整体进度、记录 advisory 并触发修复状态、下一步、最近更新时间和关联 FR 信息。
  1. 流水线详情页按 `pipelineId` 读取 `data/pipelines/<pipelineId>/state.json`，展示单条流水线的真实阶段队列、每阶段状态、requiredStages、not-applicable-with-evidenceStages、advisory 原因、重试记录、工件路径和当前推进决策。
  1. 阶段定义不得在 Web 中硬编码固定 11 阶段。Web 必须从插件源码、配置或引擎导出的阶段注册表读取真实阶段定义，并允许不同流水线按各自 `requiredStages` 展示。
  1. 事件流页面和详情侧边栏必须读取 `data/pipelines/<pipelineId>/events.jsonl` 与 `workspace/logs/sevo-pipeline-events.jsonl`，展示阶段推进、记录 advisory 并触发修复、修复、复验、重试、发布、完成等事件历史，支持按项目、流水线、事件类型和时间筛选。
  1. `engine-service.ts` 及其等价数据层不得继续以内存 `MOCK_*` 常量作为生产数据源。凡是 Project、Pipeline、Stage、Advisory、Todo、Notification、Review、Analytics、Search 等驾驶舱核心对象，都必须由真实状态文件或其只读投影生成。
  1. Web 数据层要对缺文件、空状态、版本漂移、日志暂缺做显式空态或错误态提示，但不得用 demo 数据、seed 数据或占位流水线冒充真实结果。
- **输出**：真实流水线列表、流水线详情、事件时间线、动态阶段定义、只读运行态投影 API。
- **执行阶段**：Web 驾驶舱展示层与运行态投影层。
- **验收标准**：
  - AC-45.1：`/projects`、`/dashboard` 或等价的流水线总览入口，必须基于 `state/active-pipelines.json` 展示所有活跃流水线；至少包含 `projectSlug`、`pipelineId`、`currentStage`、`status`、`updatedAt` 和阶段进度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.2：流水线详情页必须以 `data/pipelines/<pipelineId>/state.json` 作为唯一真相源，展示真实阶段队列、每阶段状态、`requiredStages`、`not-applicable-with-evidenceStages`、advisory 原因、重试次数和工件引用；仅靠前端推导或 mock 补齐视为repair-required advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.3：Web 展示阶段定义时，必须从插件源码、配置或引擎导出的阶段注册表动态读取，禁止在 `types`、`page`、`service`、`reader` 等任一 Web 文件里硬编码固定 11 阶段词表。真实流水线新增辅助阶段或辅助节点不适用后，Web 无需手工改常量即可展示。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.4：事件流必须消费 `data/pipelines/<pipelineId>/events.jsonl` 和 `workspace/logs/sevo-pipeline-events.jsonl` 中至少一类真实事件源；列表中至少可见阶段推进、记录 advisory 并触发修复、修复、复验、发布和完成事件，且支持按 `pipelineId` 回看完整时序。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.5：生产态 Web 数据层禁止使用 `MOCK_*`、demo pipeline、seed pipeline 或固定假通知作为 Project、Pipeline、Stage、Advisory、Todo、Notification、Review、Analytics、Search 的主数据源。代码中若保留 mock，仅允许用于测试或 Storybook，并与生产路径物理隔离。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.6：当真实状态文件不存在、为空、损坏或版本不兼容时，Web 必须明确展示空态/错误态和缺失原因；不得偷偷回退到 mock 数据，让用户误以为流水线正在运行。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.7：Web 驾驶舱中的进度百分比、完成率、阶段分布和风险提示，必须来自真实流水线状态或其只读投影；禁止用前端平均拆分、固定分母或 mock 计数伪造完成度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45.8：Web 的搜索、通知、待办、质量视图、统计分析若展示流水线对象，必须能够追溯回真实 `pipelineId` 和真实状态文件来源。无法追溯的数据对象视为伪对象，不得出现在生产驾驶舱。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-45a Web 端项目与流水线驾驶舱

- **定位**：SEVO Web 的轻量驾驶舱。用户通过 Web 看清每个受管项目和每条流水线的进度、状态、卡点与阶段产物。驾驶舱只做项目视角和流水线视角，不做通知系统、命令面板、统计分析、花哨动画或 AI 对话框。
- **输入**：受管项目注册信息、真实流水线状态、阶段队列、阶段事件、阶段产物、FR 覆盖结果和进入 repairing 并继续推进原因。所有数据必须来自真实运行态或只读投影，禁止 demo、seed、mock 或前端自造数据。
- **处理**：
  1. 项目列表展示每个受管项目的项目名称、当前活跃流水线数和最近推进时间。
  1. 项目详情展示该项目下全部流水线，包含活跃和历史流水线，并展示该项目 FR 覆盖度。
  1. 流水线列表展示每条流水线的状态、当前阶段、创建时间和最近推进时间。状态只允许使用真实生命周期状态：active、stale、archived、completed、repair-required。
  1. 流水线详情展示阶段时间轴。每个阶段展示进入时间、完成时间、阶段产物和当前进入 repairing 并继续推进原因。无进入 repairing 并继续推进时明确显示无进入 repairing 并继续推进，不用空白或猜测文案代替。
  1. 阶段状态使用用户能理解的人话展示，并保留明确进度感。用户看到的是“正在写需求”“由主 Agent 跟进审计复验”“发布发现问题，由主 Agent 跟进修复”这类表达，不是内部 stageId。
  1. Web 只提供查看、筛选、进入详情和历史回看能力；任何需要执行命令、通知订阅、数据分析图表或 AI 对话的能力都不属于本 FR。
- **输出**：项目列表、项目详情、流水线列表、流水线详情、阶段时间轴、进入 repairing 并继续推进原因与 FR 覆盖度。
- **执行阶段**：Web 驾驶舱展示层。
- **验收标准**：
  - AC-45a.1：项目列表必须展示每个受管项目的名称、当前活跃流水线数和最近推进时间；三项均来自真实运行态或只读投影，缺任一项不得用占位值冒充。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.2：项目详情必须展示该项目下所有流水线，包含 active、stale、archived、completed、repair-required 状态的活跃与历史流水线，并展示 FR 覆盖度。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.3：流水线列表必须展示每条流水线的状态、当前阶段、创建时间和最近推进时间；状态值限定为 active、stale、archived、completed、repair-required，禁止前端自造状态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.4：流水线详情必须展示阶段时间轴；每个阶段至少包含进入时间、完成时间、阶段产物引用和阶段状态。未进入或未完成的时间字段必须以真实空态展示，不得编造时间。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.5：流水线详情必须展示当前进入 repairing 并继续推进原因；无进入 repairing 并继续推进时显示“当前无进入 repairing 并继续推进”或等价人话，存在进入 repairing 并继续推进时展示真实进入 repairing 并继续推进来源、进入 repairing 并继续推进阶段和最近错误或缺失工件。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.6：用户可见阶段状态必须用人话展示，禁止直接把内部 stageId 当主展示文案；页面仍可在详情或调试区域保留 stageId 作为追溯信息。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.7：Web 驾驶舱不得实现通知系统、命令面板、统计分析图表、花哨动画或 AI 助手/对话框；若出现这些能力，必须从本 FR 范围中移除或另立 FR 重新评审。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-45a.8：项目视角和流水线视角的所有数据对象必须可追溯到真实项目、真实 pipelineId 或真实状态文件；无法追溯的数据不得出现在生产驾驶舱。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR-43 publish-readme-evidence 阶段

- **定位**：README 内容更新阶段。把 README 更新从发布泛化质量检查的存在性检查中拆出，作为 SEVO 流水线的正式阶段，确保项目功能、接口、配置、阶段变化能同步反映到用户入口文档。
- **阶段 ID**：`publish-readme-evidence`
- **阶段位置**：`verify` 之后，`ledger` 之前。
- **执行角色**：PM，roleType 为 `pm`。
- **输入**：本次流水线变更摘要、已完成阶段输出、受影响文件清单、当前 README 内容、项目独立仓库同步规则。
- **处理**：
  1. PM 先评估本次流水线变更是否影响 README 内容。影响范围包括新增功能、功能行为变化、命令或入口变化、接口变化、配置变化、阶段变化、安装与使用方式变化、故障排查信息变化。
  1. 如果需要更新，PM 直接编辑 README，使 README 与本次交付后的真实产品状态一致。
  1. 如果不需要更新，阶段标记为 passed 并标记为不适用并留证 README 编辑。
  1. README 更新完成后，触发独立仓库同步，确保独立仓库中的 README 与主工作区一致。
- **输出**：README 更新结果或标记为不适用并留证结论、阶段状态、独立仓库同步结果。
- **验收标准**：
  - AC-43.1：`task-mapper.js` 的 `DEFAULT_STAGE_AGENT_MAP` 必须包含 `publish-readme-evidence` 条目，roleType 为 `pm`。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-43.2：`STAGE_FALLBACK_CHAIN` 必须包含 `publish-readme-evidence` 条目。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-43.3：唯一完整阶段注册表必须包含 `publish-readme-evidence`，位置在 `verify` 之后、`ledger` 之前。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-43.4：`publish-readme-evidence` 阶段 prompt 必须要求 PM 先评估是否需要更新 README；如果不需要更新，直接给出标记为不适用并留证理由并 pass。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-43.5：README 更新后必须自动同步独立仓库。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

## SA（架构师）介入规范

### 触发条件（命中任一即必须拉 SA）

- 新增 FR 涉及跨模块数据流转（A 模块产出 → B 模块消费）
- 新增 FR 引入新的持久化实体或状态机
- 现有模块边界需要调整（职责迁移、接口变更）
- 性能/并发/一致性相关的 NFR
- 新增外部依赖或第三方集成

### 不需要介入

- 单模块内部的 bug 修复
- UI 文案/样式调整
- 已有架构下的功能扩展（不改边界、不加实体）

### 产出物

- 文档位置：每个项目 `docs/architecture.md`（飞书对应文档为真相源）
- 内容：模块划分、数据流转图、接口边界定义、技术选型约束、部署拓扑（如适用）
- 时机：在 Implement 阶段之前完成，编码 Agent 必须引用 architecture.md 中的模块边界

### 流水线集成

- Specify 阶段：PM 写完 FR 后，主会话判断是否命中 SA 触发条件
- Architecture 阶段：SA 产出 architecture.md，审计 SA 方案合理性
- Implement 阶段：编码 Agent 的 task prompt 必须引用 architecture.md 中相关模块的接口定义

## UX（设计师）介入规范

### 触发条件（命中任一即必须拉 UX）

- 新增用户可见的交互流程（新页面、新操作路径）
- 现有体验流步骤发生变更（操作顺序、入口位置、反馈方式改变）
- 新增核心页面或核心交互组件
- 走查发现体验断裂（用户走不通、状态不可见、反馈缺失）

### 不需要介入

- 纯后端逻辑变更（不改变用户可见行为）
- 不影响交互的代码重构
- 数据迁移、配置变更
- 已有设计方案下的 bug 修复（按原设计修复即可）

### 产出物

- 交互方案：操作流（每步用户做什么 → 系统反馈什么）
- 页面状态定义：正常态、加载态、空态、错误态、边界态
- 文案规范：按钮标签、提示语、错误信息、空状态文案
- 时机：在 Implement 阶段之前完成

### 流水线集成

- Specify 阶段：PM 写完 FR 后，主会话判断是否命中 UX 触发条件
- Design 阶段：UX 产出交互方案，审计方案是否严格按 spec FR/AC
- Implement 阶段：编码 Agent 的 task prompt 必须引用 UX 交互方案中的状态定义和文案
- Endgame 阶段：UX 参与陌生人走查

## 治理规范

本章用于内部 Agent 执行 SEVO 流水线时遵守，不作为陌生用户理解产品的第一入口。治理规范约束质量检查怎么执行、角色如何分离、审计发现问题后如何回到修复闭环。

### Mandatory Spec Sections Advisory 执行规则

- AC-4.4j：Mandatory Spec Sections Advisory 适用对象覆盖所有 SEVO 受管项目，包含 aco、claw-design、exam-sprint、kivo、sevo 及未来通过 `projects/*/sevo.json` 自动纳管的新项目；检查对象是产品需求规格主文件 `docs/product-requirements.md`，不只检查流水线运行期产出的增量 Spec Package。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- 章节齐全：H2 级别必须独立存在四章——用户人群、痛点、原始需求、用户体验流。同义表达可由 LLM 语义判定接受，禁止用静态关键词列表枚举允许标题。
- 顺序正确：四章必须出现在「功能需求」章节之前。任一章节出现在功能需求之后，或散落在 FR 内部，判定repair-required advisory。
- 内容有实质：每章正文必须由 LLM 做语义判定，回答该章应回答的问题；空标题、单句概述、TODO、占位符判定repair-required advisory。禁止用关键词匹配、字数阈值或正则伪装语义理解；正则仅作为 H2 章节定位辅助。
- AC-4.4k：spec-review-gate 启动时，必须先检查项目当前的 `docs/product-requirements.md` 主文件四章合规性。主文件不合规时，无论本轮提交的是新增 FR、迭代修订还是局部优化，一律先创建 spec-patch task 补齐主文件四章，本轮增量评审与主文件补齐并行推进，主文件缺口作为 advisory 输入。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### FR 用户视角验证准则规则

- AC-4.4l：spec 中每条 FR 必须包含一个「用户视角验证准则」子节，内容必须明确操作者、操作路径与时间约束、可观测产出三要素。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- 操作者：谁来验证，默认是陌生用户，也可根据 FR 场景明确为首次使用者、运维者等。
- 操作路径与时间约束：从哪个入口进入，做什么操作，多长时间内完成。
- 可观测产出：看到什么具体、可验证、可数的内容作为 FR 通过依据，产出必须可量化。仅写“页面能打开”“列表能显示”“接口能访问”不构成通过依据。
- AC-4.4m：Pre-Advisory 必须对每条 FR 的用户视角验证准则做 LLM 语义判定，区分页面级描述与用户视角端到端验证。任一要素缺失即判定未通过。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
- AC-4.4n：任一 FR 缺失用户视角验证准则，或 LLM 判定为页面级描述时，Pre-Advisory repair-required advisory并创建 spec-patch task Spec 阶段。返工清单必须列出 FR 编号、缺失要素和建议补充方向，由 PM 角色补齐后重新进入 Pre-Advisory。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。

### 角色约束

- Spec 产出由 PM 角色负责，Spec Review Advisory Check 禁止规格作者自审。
- Pre-Advisory 至少由独立 Agent 调用 LLM 完成语义判定，遵守与 FR-02 主体评审一致的禁止自审原则。
- UX Interaction Design 仅由 UX 角色执行；Architecture Design 仅由 SA 角色执行；Commercial Acceptance Authoring 由 PM 角色执行；代码实现由开发角色执行；Review 由独立审计角色执行。
- 任何角色发现当前任务暴露 spec 缺口时，必须先回到 Spec 阶段补齐 FR、AC、边界或用户视角验证准则，再继续后续阶段。

### 审计与修复闭环规则

- 审计必须留在 SEVO 流水线内执行，不得用流水线外的审计替代 Review Advisory Check。
- Implement completion 到达后，系统必须自动触发 Review 审计任务；审计通过后进入后续终局阶段链。
- 审计发现问题后，Pipeline 必须进入 review→fix loop：将 Finding 转成修复 Task，回到 Implement 修复，修复完成后重新进入 Review 复验，直到通过或达到既有重试上限。
- Finding 未关闭时，对应 Stage 不得标记 passed；所有关键 Finding 关闭后，Stage 才能进入下一阶段。
- 审计日志至少记录 implement completion、audit dispatch、audit result、修复任务创建、复验结论和后续推进结果。

##### 发布 / 部署质量检查补充：独立仓库同步验证

OpenClaw（pm-01 子Agent）2026-05-30

流水线 endgame 阶段必须把独立仓库同步纳入发布与部署验证范围。主仓库 push 后，只要本次变更涉及 `projects/<name>/` 路径，endgame 就必须验证对应独立 GitHub 仓库已经完成同步。

- AC1:endgame 阶段必须检查本次发布链是否涉及 `projects/<name>/` 路径变更；涉及时必须执行独立仓库同步验证。
- AC2:独立仓库同步验证必须确认对应独立 GitHub 仓库已收到同一轮变更；验证未通过时，endgame 判定repair-required advisory。
- AC3:未同步、同步发现问题、同步状态不可确认，均视为发布闭环发现问题；流水线不得宣布完成。
- AC4:endgame 的问题原因必须明确指出缺失的项目名、目标独立仓库和建议动作，便于下一轮修复任务直接接手。

### NFR-LLM-TIMEOUT：LLM 判定调用超时上限

sevo-pipeline 中所有 LLM 判定调用（包括 trigger 分类、阶段质量检查 LLM 判定、write-intent 检测等）的 AbortController 超时上限为 360 秒（360000ms）。超时按 fallback 策略处理（shouldTrigger=false，出具通过 advisory）。

原因：LLM 请求通过中转服务转发（penguin proxy），在多任务并发时可能因排队进入 repairing 并继续推进导致响应延迟远超常规 2-15 秒；之前 3-15 秒超时在实际运行中持续触发 AbortError，导致分类器形同虚设。360 秒为用户于 2026-06-02 确认的上限。

### FR-11a Pre-Pipeline Clarification（主会话前置需求澄清）

- **定位**：跨阶段机制的前移。FR-11 在 Spec、Design、Implement 三个流水线阶段内消解歧义；FR-11a 把同一种主动澄清能力前移到流水线之外的主会话对话层，在任务被路由进 SEVO 流水线之前先识别用户是在探讨需求还是在下达执行指令。Why：用户在主会话里质疑、修改、定义 spec 时，方案方向往往还没收敛；若系统把这种未收敛的讨论直接当作明确任务派发，FR-11 的阶段内澄清已经来不及，误解会沿整条流水线放大成返工。前置澄清把不确定性消解在成本最低的对话入口。
- **服务原则**：原则 4（主动需求澄清）、原则 6（语义路由优先）。
- **触发层级**：主会话每一条用户消息都进入意图识别；识别在流水线路由判定之前或与之并行执行，先于任务派发得出结论。
- **识别方式**：基于 LLM 语义理解判定用户意图，禁止关键词匹配、正则表达式或规则引擎。判定依据是整句乃至整段对话的语义和上下文，而非命中某些词。
- **触发意图类型**：用户消息的主导意图属于以下任一类时，进入澄清模式：
  - 质疑或探讨现有 spec 的定义、范围、合理性。
  - 提出对已有方案的疑虑、顾虑或反对。
  - 讨论替代方案、比较多个方向、征求建议。
  - 表达需求边界、目标或验收口径尚不确定。
  - 要求修改、补充或重新定义某条 FR/AC。
- **触发后行为**：向主会话注入一次澄清模式提示，告知当前用户处于需求探讨状态；在用户确认方案方向之前，先与用户把需求、边界和验收口径澄清收敛，不向 SEVO 流水线派发执行任务。澄清模式只改变"先澄清后派任务"的处置顺序，不替用户做方案决策。
- **退出条件**：用户明确给出方案方向确认后退出澄清模式，恢复正常路由派发。确认指用户表达了"方向已定、可以执行"的等价语义（如"确认""拍了""就这样""按这个做"或语义等价表达），由 LLM 判定是否构成有效确认，不靠固定词表匹配。
- **标记为不适用并留证条件**：仅当用户消息的主导意图被判定为"对一个目标、范围、边界、验收口径都已清晰且无歧义的任务下达执行指令"时，才标记为不适用并留证澄清进入路由。判定标记为不适用并留证必须同时满足：
  1. 指令指向的任务目标明确、范围闭合，不含待定义或待取舍的开放问题。
  1. 消息中不含质疑、探讨、比较方案或表达不确定的语义。
  1. 该任务对应的 spec 覆盖已足够支撑执行，无需先补齐 FR/AC/边界。任一条件不成立时，按需求探讨处理，先进入澄清模式。
- **标记为不适用并留证反例**：用户说"直接帮我把登录加上限流就行，别问了"。表面是明确执行指令且要求标记为不适用并留证提问，但"限流"的阈值、维度、超限处置、作用范围均未定义，spec 也未覆盖，属于范围未闭合。此时不得因"别问了"标记为不适用并留证澄清，应先就限流口径澄清收敛——用户要求少问，不等于需求已清晰。
- **边界与混合输入**：
  - 正常输入：整条消息意图单一，要么是探讨/质疑（进澄清模式），要么是清晰执行指令（直接路由）。
  - 边界输入：意图模糊或语气像确认但内容仍含开放问题（如"应该可以吧？"）时，判定为未收敛，进澄清模式；理由是确认必须来自用户的明确方向表达，不能由系统替用户认定收敛。
  - 混合输入：同一条消息既含已清晰部分又含探讨/质疑部分时，必须拆分——已清晰且 spec 覆盖足够的部分可路由派发，含质疑、修改或边界不确定的部分进入澄清模式，不得因为存在一个明确指令就把整条消息当作可派发。
- **与 FR-11 的边界**：FR-11 管流水线内——任务已进入 Spec/Design/Implement 阶段后，在阶段执行过程中检测工件层面的模糊信号并就地澄清；FR-11a 管流水线外——任务尚未进入流水线，在主会话对话层识别用户意图是否已收敛，决定是否出具通过 advisory派发。两者互不替代：FR-11a 出具通过 advisory后，任务仍受 FR-11 的阶段内澄清约束。
- **验收标准**：
  - AC-4.64：主会话收到用户消息后，在任务被派发进 SEVO 流水线之前产生一次意图判定结果，记录 `{ messageId, intent, mode, basis }`；`intent` 取值属于触发意图类型或"清晰执行指令"，`mode` 为 `clarify` 或 `dispatch`，`basis` 为 LLM 判定的语义依据摘要。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.65：意图判定为触发意图类型之一时，`mode` 必须为 `clarify`，且本条消息不产生任何流水线派发动作；可在审计日志中观测到"进入澄清模式、未派发任务"的状态。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.66：意图判定全程由 LLM 语义判定完成，判定路径中不得出现关键词表、正则或规则引擎充当意图识别；`basis` 字段体现的是语义理解而非命中词。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.67：处于澄清模式时，用户给出方向确认后，下一条判定结果 `mode` 转为 `dispatch`，澄清模式退出可在状态记录中观测到；确认是否成立由 LLM 判定，不依赖固定确认词表。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.68：用户消息含明确"少问/别问"但任务范围未闭合或 spec 覆盖不足时，`mode` 仍为 `clarify`；`basis` 记录范围未闭合的具体缺口（待定义阈值、未覆盖边界或缺失 FR/AC）。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
  - AC-4.69：同一条消息混合"已清晰执行指令"和"探讨/质疑"两类意图时，判定结果必须拆分标注两部分各自的处置（清晰部分 `dispatch`、探讨部分 `clarify`），不得整体归为单一处置。 验收验证：审计时按本条描述执行或复现对应操作，记录结构化结果 `{ acId, status, evidence, reason }`；`status` 必须为 `pass`，`evidence` 必须包含可观测输出（文件路径、CLI 输出、API 响应、页面截图、审计事件或状态字段之一），缺少证据、字段值不符或无法复现均判定为 `fail`。
