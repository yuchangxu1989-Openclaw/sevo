# SEVO 流水线操作说明文档

OpenClaw（主会话）2026-06-08

本文档是 SEVO 流水线的操作手册，主 Agent 在派发阶段任务前、收到 completion 后、处理失败或推进终局前按需读取；本文档优先级高于主 Agent 对代码行为的临场理解。

## 阶段总览

SEVO 只有一条完整阶段链，所有入口统一使用同一阶段队列。入口层不得按任务规模、成本、路径、设计需求或交付类型减少主链阶段；阶段是否需要深度产出，由该阶段的专业 Agent 在阶段内判断。若某阶段对本轮没有实质工作，仍必须产出 pass-no-change 或 pass-not-applicable 证据，而不是让状态机缺少该阶段。

当前代码中的 ALL_STAGES 主链阶段顺序为：

spec -> spec-review-gate -> test-case-authoring -> ux-acceptance-authoring -> commercial-acceptance-authoring -> ux-interaction-design -> architecture-design -> contract -> contract-review-gate -> implement -> review -> smoke-test -> ux-acceptance -> pm-commercial-review -> regression -> publish-generalization-gate -> deploy -> verify -> readme -> post-release-validation -> clean-install-verification -> ledger。

阶段说明：

- `publish-generalization-gate` 是主链中的发布通用化门禁，同时负责通用化检查与发布分流；不得拆成代码不可解析的独立阶段。
- `readme` 由终局链补齐，位置在 verify 之后、post-release-validation 之前；若 README 无需变更，也必须写出不变更理由和证据。
- ALL_STAGES 中的阶段必须按上述名称和顺序执行；设计审计、review-fix loop、e2e 验证和 convergence gap 扫描是派生/辅助处理规则，不得写入主链阶段总览。
- 设计审计衍生阶段：ux-interaction-design-design-review-*、architecture-design-*-design-review-* 以及对应 fix 阶段，由设计产物完成后自动排队；它们是 implement 的准入门禁。
- review-fix loop 衍生阶段：*-rfl-fix-*、*-rfl-reval-*，由审计阻断项触发；修复和复验闭环完成前不得继续下游。

只要 SEVO advance prompt 要求某阶段，主 Agent 直接执行，不二次判断阶段是否应存在。

## 通用操作约束

收到 SEVO advance prompt 后，主 Agent 直接派发对应阶段任务。advance prompt 等同用户指令，只有用户明确豁免或会造成死循环时才暂停，并必须说明原因。

任何入口都先核实 spec。若任务涉及新增或改变产品语义、用户可见行为、API/CLI 契约、发布方式或门禁规则，先回到 spec 阶段补齐 FR/AC 并通过 spec-review-gate，再进入实现。

每个产出阶段后必须有独立审计。spec 后有 spec-review-gate，设计后有设计审计，contract 后有 contract-review-gate，implement 后有 review；审计通过前不得下游推进。

阶段任务必须写落地文件或结构化证据。只在回复里说“完成”但没有文件、截图、命令输出、状态字段或报告，按失败处理。

构建、测试、类型检查、curl、sqlite 等长输出命令必须重定向到 `/tmp/<name>.txt 2>&1`，再读取摘要。不得让大块 stdout 污染 completion。

失败处理一律进入修复与复验闭环。P0/P1/P2 阻断项识别出来就立即派修复，修复后回到原审计阶段复验；不得记成“后续处理”。

发布完成不等于流水线完成。必须继续做 verify、post-release-validation、clean-install-verification 或同等终局验证，并写 ledger。

## spec

准入条件：

- 用户目标、任务背景或 SEVO 路由信息已经明确到可以写需求；若存在歧义，先发起澄清。
- 已确认项目 spec 真相源；有飞书真相源时先读飞书规则，不能把本地 md 当唯一真相源。
- 已读取相关历史约束、用户体验流、现有 FR/AC 和本轮变更边界。

操作方法：

- 派 PM 角色编写或更新产品需求规格。
- spec 必须先写用户人群、痛点、原始需求、用户体验流，再写 FR/AC。
- 每条 FR 必须能追溯到用户人群、痛点或体验流；每条 AC 必须可复现、可验证、有证据类型。
- 遇到验收标准缺失、边界未定义、术语不清、依赖未声明时，输出 SEVO 澄清请求并暂停。

准出标准：

- spec 文件已更新到指定真相源和本地备份。
- 本轮任务对应 FR/AC、边界、不做事项、用户视角验收都已覆盖。
- 没有孤立 FR、不可验证 AC、TODO、占位符或只写概念不写验收的内容。

异常处理：

- 需求不清：暂停并向用户澄清，不允许猜。
- spec 内部冲突：回到 spec 修正，不能把矛盾带到 contract 或 implement。
- 飞书与本地不一致：先以飞书为真相源合并，再同步本地。

## spec-review-gate

准入条件：

- spec 阶段已产出完整需求规格。
- spec 作者不得自审；必须由独立评审角色执行。

操作方法：

- 先做 Mandatory Spec Sections Pre-Gate：检查四个用户层章节的存在、顺序和语义质量。
- Pre-Gate 通过后再做产品、技术、质量、体验维度评审；涉及 Web/UI 时体验维度不可省。
- 用 LLM 语义判断章节质量、FR 来源追溯和用户视角验证准则，禁止用关键词或字数阈值冒充理解。

准出标准：

- Pre-Gate 通过。
- 产品、技术、质量、体验适用维度全部通过。
- 评审报告写明通过依据、阻断项、修复要求和是否允许进入后续阶段。

异常处理：

- Pre-Gate 不通过：直接返工 spec，不启动其他维度评审。
- 任一维度 conditional 或 rejected：阻断，修复后重跑完整评审。

## test-case-authoring

准入条件：

- spec-review-gate 已通过。
- spec 中的高优先级 FR 和 AC 已冻结到本轮可执行范围。

操作方法：

- 派审计或测试视角角色编写测试用例。
- 每个高优先级 AC 至少一条测试用例；Web/UI 测试写清导航、动作、预期结果。
- 测试用例作为独立文档交付，不写回 spec 正文。

准出标准：

- 测试用例文档已落盘。
- 每条测试用例能追溯到 AC，并说明测试方法、预期结果和优先级。

异常处理：

- AC 不可测试：回到 spec 修 AC。
- test-case-authoring 未通过时 implement 保持 blocked，不能绕过。

## ux-acceptance-authoring

准入条件：

- spec-review-gate 已通过。
- 本轮任务涉及 UI、CLI 交互、用户可见操作流或陌生用户验收。

操作方法：

- 编写 UX 验收清单，覆盖首次打开、核心操作、反馈状态、错误恢复和完成结果。
- 清单必须严格依据 spec，不新增产品逻辑。

准出标准：

- UX 验收清单已落盘，可直接供 ux-acceptance 或浏览器走查使用。
- 每项验收都有可观察证据要求，如页面截图、操作结果或错误提示。

异常处理：

- spec 没定义用户操作流：返工 spec，不让 UX 自行发明流程。

## commercial-acceptance-authoring

准入条件：

- spec-review-gate 已通过。
- 本轮改动影响发布、安装、README、配置、对外交付或商用可用性。

操作方法：

- 编写商用验收清单，覆盖安装、初始化、配置、第一条可用结果、故障排查、发布目标。
- 明确哪些证据证明“陌生用户能用”，而不是只证明内部流程跑过。

准出标准：

- 商用验收清单已落盘。
- 后续 pm-commercial-review、publish-generalization-gate、verify 可直接引用。

异常处理：

- 缺少对外用户路径：返工 spec 或 README 相关要求。

## ux-interaction-design

准入条件：

- spec-review-gate 已通过。
- 所有入口都执行本阶段；由 UX Agent 在阶段内判断需要完整交互设计、pass-no-change 还是 pass-not-applicable。

操作方法：

- 派 UX 角色输出交互设计。
- 设计必须覆盖页面布局、导航、操作流、状态反馈、按钮文案、错误提示、空状态和边界状态。
- 严格按 spec FR/AC，不改变业务逻辑、实体关系、操作顺序或数据流。

准出标准：

- 交互设计文档已落盘。
- 元数据或报告明确 authorRole=ux，等待设计审计。
- 能作为 implement 的输入，且没有越过 spec 的新增能力。

异常处理：

- 发现 spec 不足：报告 spec gap，回到 spec，不用 UX 设计补逻辑。
- 设计产物完成后必须进入设计审计衍生阶段，审计未过不得进入 implement。

## architecture-design

准入条件：

- spec-review-gate 已通过。
- 所有入口都执行本阶段；由架构 Agent 在阶段内判断需要完整架构设计、pass-no-change 还是 pass-not-applicable。
- 若已有 UX 设计，架构必须读取并承接用户操作数据流。

操作方法：

- 派 SA/架构角色输出详细架构设计。
- 说明 API、数据模型、模块职责、状态归属、持久化、失败恢复和可观测性。
- 从用户体验数据流倒推模块边界；不新增 spec 未定义的产品能力。

准出标准：

- 架构设计文档已落盘，authorRole=sa。
- 设计能支持后续 contract 和 implement。
- 已进入 PM + Audit 双重设计审计，且全部通过后才允许喂给 implement。

异常处理：

- 技术不可行或 spec 矛盾：阻断并回到 spec/设计修正。
- 审计 conditional/rejected：派设计修复阶段，修完复审。

## design-review 衍生阶段

准入条件：

- ux-interaction-design 或 architecture-design 已产出文档。
- SEVO 排出 `*-design-review-*` advance prompt。

操作方法：

- 按 prompt 指定的 reviewRole 派 PM、架构或审计角色。
- 完整阅读设计产物后判断，不读完不得批准。
- 审查重点是 spec 对齐、用户流程承接、技术可行性、是否静默新增逻辑。

准出标准：

- 所有设计审计结论均为 passed。
- 设计阶段元数据记录对应审计状态和报告路径。

异常处理：

- conditional/rejected：派 `*-design-review-fix-*` 修设计原文档，再回到同一设计审计复验。
- 阻断项要求改 spec：暂停设计修复，回到 spec。

## contract

准入条件：

- spec-review-gate 已通过。
- 所有入口都执行本阶段；由架构 Agent 根据 spec、UX 设计、架构设计和评审结论决定产出深度。
- 已读取可用的 UX 设计、架构设计和 spec-review-gate 结论。

操作方法：

- 派架构角色输出 arc42 架构契约和必要 ADR。
- 明确接口、数据流、模块边界、关键决策、替代方案和取舍理由。
- 消解 spec 与 contract 的矛盾；需求层模糊不能由架构单方面假设。

准出标准：

- arc42 文档和 ADR 已落盘。
- 契约能直接支撑 implement，并引用本轮 spec/设计输入。

异常处理：

- 技术层模糊：在架构阶段用 ADR 消解。
- 需求层模糊：回到 spec 澄清。

## contract-review-gate

准入条件：

- contract 已完成。
- 若 UX/architecture design 在本轮存在，也必须完成并通过设计审计。

操作方法：

- 派独立审计/架构角色做三方或四方会审。
- 检查需求承接、实现可行性、测试性、安全性、部署可行性、UX/架构一致性。
- 明确哪些设计产物存在、哪些一致性检查适用。

准出标准：

- 评审报告已落盘。
- 结论为 passed，且允许进入 implement。
- 若有 conditional/rejected，所有阻断项已修复并复审通过。

异常处理：

- 发现 spec 自洽性问题：回到 spec，而不是让 implement 自行选择。
- 发现 contract 与设计不一致：返工对应设计或 contract，再重审。

## implement

准入条件：

- 前置阶段已通过：full pipeline 至少包括 spec-review-gate、设计审计、contract-review-gate；若 test-case-authoring 在流水线中也必须 passed。
- prompt 中必须引用 spec、contract、UX 设计、架构设计、测试用例等可用工件路径。
- 编码前已确认 spec 状态：无需改 spec / 已完成 spec 修改 / 阻断等待 spec 修改。

操作方法：

- 派编码角色实现。
- 按 TDD 执行：先写覆盖目标行为的失败测试，再实现到通过，再清理。
- 只能实现 spec 明确定义的 FR/AC。觉得有价值但 spec 没写，先提需求变更，不能顺手做。
- 输出 AC 覆盖清单，格式使用 `[AC-COVERAGE-START]` 到 `[AC-COVERAGE-END]`。

准出标准：

- 代码、测试和必要文档变更已落盘。
- 关键验证命令已运行并有重定向日志摘要。
- AC 覆盖清单逐条说明 covered / partial / uncovered 和证据位置。

异常处理：

- 发现 spec/contract 矛盾：暂停实现，上报并回到对应阶段。
- 构建或测试失败：先修到通过再交付；不能把失败留给 review。
- completion 缺 AC 覆盖清单或无文件变更证据：按 implement 未完成处理。

## review

准入条件：

- implement 已完成并提供变更证据、测试证据和 AC 覆盖清单。
- 审计者必须独立于实现者；单 Agent 模式也要标注未独立验证维度。

操作方法：

- 派审计角色检查 spec compliance、代码质量、安全、测试覆盖、架构/UX 一致性。
- 从 spec 提取全量 AC，逐条比对实现覆盖，产出覆盖矩阵。
- Web/UI 项目必须执行浏览器走查预检并产出截图；纯代码/API 审查不能替代 UX 验收。
- 涉及 L2 注入文本改动时，检查每条规则是否有目标、做什么、Why 三要素。

准出标准：

- 审计报告已落盘。
- P0/P1/P2 阻断项为 0。
- AC 覆盖矩阵完整，无法追溯到 spec 的代码已删除或回到 spec 补定义。

异常处理：

- 有阻断项：进入 review-fix loop，派修复，再由原审计阶段复验。
- 浏览器预检失败：阶段 blocked，不可用“无截图”放行。

## review-fix loop 衍生阶段

准入条件：

- review、contract-review-gate、设计审计、publish-generalization-gate 或其他门禁报告 P0/P1/P2 阻断项。

操作方法：

- 派修复任务时引用原审计报告、阻断项清单和允许修改范围。
- 修复只解决审计发现的问题，不扩张功能。
- 修复后派 revalidation 阶段复验同一阻断项。

准出标准：

- 原阻断项全部关闭。
- 复验报告明确 passed。

异常处理：

- 连续复验失败：缩小问题、拆分修复或升级执行角色；不得跳过门禁。
- 修复暴露 spec 缺口：回到 spec，而不是用代码绕过。

## smoke-test

准入条件：

- review 已通过。
- 可运行入口、环境变量、启动方式和测试目标已明确。

操作方法：

- 派独立验证角色按真实用户视角执行端到端 smoke。
- Web 项目必须用浏览器打开真实页面，完成核心操作，保存截图。
- CLI/API 项目必须执行真实命令或 API 调用，并保存输出证据。

准出标准：

- smoke-test 报告已落盘。
- 核心路径通过，失败路径有可复现步骤。
- 失败数为 0；若某检查不适用于本轮，报告必须写明不适用证据并以 pass-not-applicable 结论放行。

异常处理：

- 任一核心路径失败：阻断后续 ux-acceptance、regression、deploy、verify，先修再重跑。

## ux-acceptance

准入条件：

- smoke-test 已通过。
- 项目存在 UI、Web 页面、可见交互或用户可操作界面；纯后端/纯 CLI 也执行阶段内不适用判定并输出 pass-not-applicable 证据。

操作方法：

- 派 UX 角色用 Playwright 或 agent-browser 操作真实页面。
- 覆盖完整用户旅程、关键页面、可访问性、视觉质量、错误和空状态。
- 必须附截图；没有公网 URL 时只能在报告里显式写 pass-not-applicable (no public URL) 并说明原因。

准出标准：

- UX 报告已落盘。
- P0=0，P1 不超过允许阈值。
- 截图路径、操作步骤、实际结果齐全。

异常处理：

- P0/P1 超限：派修复并复验。
- 页面无法打开或浏览器预检失败：blocked，不得用静态代码审查替代。

## pm-commercial-review

准入条件：

- smoke-test 已通过。
- 阶段在 pipeline 中被激活，通常与 ux-acceptance 并行。

操作方法：

- 派 PM 视角检查对外交付状态。
- 核对 README、快速上手、配置参考、故障排查、发布目标、陌生用户路径。
- 判断产物是否能给第三方用户使用，而不是只服务内部流程。

准出标准：

- PM 商用评审报告已落盘。
- 不存在“安装后不知道怎么用”“示例不可运行”“缺少故障恢复”的 P0/P1。

异常处理：

- 商用化缺口存在：派修复，通常落到 README、配置、发布脚本或用户路径文档。

## regression

准入条件：

- smoke-test 已通过。
- 若 ux-acceptance 或 pm-commercial-review 在 pipeline 中，二者必须都通过。

操作方法：

- 派测试/编码角色执行测试用例、回归套件和本轮风险相关检查。
- 测试命令重定向到 `/tmp/<name>.txt 2>&1`，报告只引用摘要和日志路径。

准出标准：

- regression 报告已落盘。
- 所有必须通过的测试通过。
- 失败项有复现步骤和责任阶段。

异常处理：

- 回归失败：回到 implement 修复，再 review、smoke、regression 复验。

## e2e-verification

准入条件：

- 该阶段被配置或 advance prompt 激活。
- 核心函数、CLI、API 或页面入口可被真实调用。

操作方法：

- 用真实输入调用核心能力。
- 验证输出是否满足 spec AC，不只验证进程退出码。
- 将验证脚本放入项目 scripts 目录或报告中引用已有脚本。

准出标准：

- e2e-verification 报告已落盘。
- 实际输入、调用方式、输出结果、判定结论齐全。

异常处理：

- 输出无意义或只返回空模板：按失败处理，回到 implement。

## publish-generalization-gate

准入条件：

- regression 已通过。
- README、配置、发布目标、项目边界、敏感信息边界和变更证据可读取。

操作方法：

- 派架构或审计角色执行发布通用化门禁。
- 检查硬编码路径/端口/agent/provider、宿主绑定、单 Agent 可运行路径、README 初始化与错误指引。
- 同时检查 README 命令示例是否与源码实际解析一致。
- 分类 publicArtifacts、localMainConfig、blockedSensitiveItems、noPublishItems，说明哪些进入 npm/GitHub/ClawHub/独立仓库，哪些只留本地配置，哪些因敏感信息禁止发布。
- 输出 `[SEVO_PUBLISH_GENERALIZATION_GATE_RESULT]` 机器可读结果块，结论覆盖 passed、pass-not-applicable-with-evidence 或 blocked，并记录发布分流证据。

准出标准：

- publish-generalization-gate 评审报告已落盘。
- 不存在阻断级硬编码、README 示例不可执行、第三方无法初始化或发布分流不完整的问题。
- 通用化结论与发布分流均有证据支撑，可供 deploy 阶段读取。

异常处理：

- 门禁失败：回到 implement 或 readme 修复；发布分流不完整时阻断 deploy。

## deploy

准入条件：

- publish-generalization-gate 已通过。
- 发布脚本、目标平台、版本 bump、凭据边界和回滚方式已明确。

操作方法：

- 派编码/发布执行角色按项目发布脚本执行。
- 对 SEVO/KIVO/ACO/AEO/Claw Design 等项目，优先使用统一发布脚本，不手拼发布命令。
- 发布命令必须重定向日志，保留 npm、GitHub、ClawHub、独立仓库等目标状态。

准出标准：

- deploy 结果报告或状态记录已落盘。
- 所有声明发布目标有明确 passed / pass-not-applicable-with-evidence / blocked 结果。
- 成功发布后产物可供 verify 阶段访问。

异常处理：

- 任一声明目标失败：deploy 不通过；按失败目标修复后重跑。
- 涉及外部写入、凭据或不可逆动作时，必须确保已有用户授权和安全边界。

## verify

准入条件：

- deploy 已通过；未部署项目则必须有可验证的本地或包级产物。
- 有 spec、发布结果、README 和运行入口。

操作方法：

- 派审计角色做发布后验证。
- 按真实用户路径安装、初始化、运行核心流程，确认产出有意义结果。
- 逐条对照 spec 全量 FR，输出 FR 覆盖状态块。

准出标准：

- verify 报告已落盘。
- FR-COVERAGE 中没有 uncovered；partial 必须有明确修复计划并视阻断级别决定是否回流。
- 用户视角核心路径可运行，不依赖内部知识。

异常处理：

- FR 未覆盖或运行态不可用：回到 implement/review/deploy 对应阶段修复。
- 只证明代码存在、没有证明功能在跑：verify 失败。

## readme

准入条件：

- verify 已完成或 SEVO 终局链触发 README 同步。
- 本轮变更可能影响功能、行为、命令、入口、API、配置、阶段、安装使用流或故障排查。

操作方法：

- 派 PM 角色判断 README 是否需要更新。
- 需要更新时直接编辑 README，并同步独立仓库规则；不需要更新时不改文件，但写明 pass-no-change 理由。
- README 不得出现面向用户无意义的 FR/AC/NFR/内部术语。

准出标准：

- readme 报告已落盘。
- README 与实际代码、命令、发布状态一致。
- 独立仓库同步状态已记录。

异常处理：

- README 示例与实际命令不一致：阻断 publish-generalization-gate 或 verify。

## post-release-validation

准入条件：

- verify 已通过，或 post-release 自动扫描被触发。
- 发布产物、真实运行入口、KR/FR 目标和终局验收路径可读取。

操作方法：

- 执行发布后差距扫描，确认真实用户能安装、初始化、跑核心流程、看到真实结果。
- 检查发布包、README、配置、运行时数据、错误恢复和终局价值。
- 发现 gap 时生成修复任务，不进入 ledger。

准出标准：

- post-release-validation 报告已落盘。
- gap 数为 0，或所有 gap 已完成修复并复验。

异常处理：

- 发现 gap：回到 implement 或对应文档/发布阶段修复，再从 review/verify 链路复验。

## clean-install-verification

准入条件：

- 该阶段被路由、`sevo verify --clean-install` 被调用，或 post-release 链路要求干净环境验证。
- 发布包或项目源码可在干净目录安装。

操作方法：

- 在干净目录完成安装、初始化、核心命令和示例流程。
- 不使用本机隐藏状态、旧缓存、已有配置或开发者私有路径。
- 检查 CLI、库入口、报告产出和核心 API 是否返回有意义数据。

准出标准：

- clean-install 报告已落盘。
- 安装、入口、运行验证检查均通过，且报告非空、有结构化结果。

异常处理：

- 任一步依赖隐藏状态或无法从零运行：失败，回到 deploy/readme/implement 修复。

## convergence-gap-analysis

准入条件：

- verify、publish-generalization-gate 或终局扫描判断项目离目标仍有差距。
- 有项目目标、当前工件和历史验证结果。

操作方法：

- 从代码健壮性、文档一致性、发布包装、陌生用户走查、配置完整性五个维度扫描。
- gap 按 P0/P1/P2 标注，并说明对应修复阶段。

准出标准：

- gap 报告已落盘。
- P0/P1 已立即回流修复；P2 可进入待办但不能掩盖当前验收结论。

异常处理：

- gap 指向 spec 缺失：回到 spec。
- gap 指向运行不可用：回到 implement/review/verify。

## ledger

准入条件：

- 所有主链阶段已 passed；不适用场景必须由对应阶段产出 pass-not-applicable 证据，不得缺阶段记录。
- review-fix loop、design-review loop、post-release gap、clean-install 阻断项全部关闭。

操作方法：

- 收集所有关键工件、阶段结论、Finding 处理记录、发布证据和复用经验。
- 写入 ledger entry，标明 executionMode；单 Agent 模式必须列出未独立验证维度。

准出标准：

- ledger 记录已落盘或写入 SEVO ledger。
- pipeline 可回答：本轮做了什么、按哪个 spec、哪些阶段通过、证据在哪、还有无遗留阻断。

异常处理：

- 有 required stage 未终态：不得写完成 ledger。
- 证据链缺失：回到缺证据的阶段补验收。

## 任务命名规范（label 格式，强制）

label = `sevo:<stage> <简短描述>`，和 task prompt 正文第一行的触发词保持一致。

| 前缀 | 阶段 | 典型角色 | 示例 |
|------|------|----------|------|
| `sevo:create` | 新建项目/流水线 | 主会话 | `sevo:create exam-sprint` |
| `sevo:specify` | spec 撰写/修改 | PM | `sevo:specify 知识提取FR补充` |
| `sevo:design` | 架构设计 | SA | `sevo:design 向量检索架构` |
| `sevo:implement` | 编码实现 | Dev | `sevo:implement autoDispatch无条件化` |
| `sevo:review` | 审计/评审 | Audit | `sevo:review autoDispatch实现审计` |
| `sevo:fix` | 审计问题修复 | Dev | `sevo:fix P1-evaluator逻辑收紧` |
| `sevo:ux` | UX/陌生人走查 | UX | `sevo:ux KIVO开箱即用验证` |
| `sevo:from` | 从某阶段继续 | 视情况 | `sevo:from sevo implement` |

Why：看板上一眼能识别任务属于流水线的哪个阶段，避免混淆研发任务和非研发任务。
