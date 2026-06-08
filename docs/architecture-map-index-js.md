# SEVO index.js 架构地图

> 目标：让后续开发 Agent 改动 `projects/sevo/index.js`（~12518 行单文件）时，能在 2 分钟内定位目标函数、调用链与状态写入点，而非花 40 分钟自行探索。
>
> 行号基准：本文档生成时的 `index.js`（共 12518 行）。改动后行号会漂移，定位时以**函数名**为准，行号仅作起点。
> 校验方式：`grep -nE "^(async )?function <name>" index.js`。

---

## 0. 文件全貌（物理分层）

物理上是单文件，逻辑上分 4 段：

| 段 | 行号 | 内容 | 函数数 |
|----|------|------|--------|
| A. 常量与 Supplement 文本 | 1–760 | import、阶段提示补充文本、`STAGE_IDS`、错误码、result marker、tier 映射 | — |
| B. 纯函数 / 解析器 / 评估器 | 761–1840 | gate 结果解析、generalize/publish 评估、FR 追踪、收敛环 | ~70 |
| C. 全局状态 + 业务 helper | 1841–9355 | `sevoGlobal`、流水线 CRUD、阶段推进、spec-gap、consistency、RFL、命令处理 | ~280 |
| D. 插件定义与 Hook 注册 | 9356–12513 | `const plugin = { register(api) { ... } }`，所有 `api.on(...)` 在此 | 1 大对象 |

- import 仅 10 行（15–24），全部桥接到同目录 `.js` 模块和 `./bridge.js`。**没有直接 `require('./src/...')`**——TS 编译产物经 `bridge.js` 懒加载。
- 模块导出：`export default plugin`（12513）。
- 全局单例：`sevoGlobal = globalThis[SEVO_PIPELINE_GLOBAL_KEY]`（1841），跨 hook 共享的内存状态。

---

## 1. 模块清单（按逻辑域分组）

### 1.1 常量与提示补充（1–760）

| 名称 | 行 | 职责 |
|------|----|----|
| `BROWSER_WALKTHROUGH_SUPPLEMENT` 等 supplement 常量 | 28–32 | L2 强制门禁注入文本（浏览器走查 / spec-before-code / GitHub push / Why 门禁） |
| `CLARIFICATION_BUGFIX_SKIP_RULES` / `CLARIFICATION_STAGE_SIGNALS` | 49–101 | FR-11 澄清跳过条件 + 各阶段模糊信号文本 |
| `SEVO_ERRORS` | 469→ | 错误码表（SEVO-E007 等）+ desc/cause/fix |
| `SEVO_PREFIX_GUIDE` | 480→ | 8 前缀命令体系说明文本 |
| `STAGE_IDS` (Object.freeze) | 704–728 | **全流水线阶段枚举**（spec→...→ledger，共 23 阶段） |
| `GENERALIZE_RESULT_*` / `PUBLISH_RESULT_*` marker | 731–741 | FR-48/49 阶段机读结果块标记（独立可解析，无合并阶段） |
| `*_ELIGIBLE_STATUSES` / `*_BLOCKING_STATUSES` Set | 753–757 | generalize/publish 状态机白/黑名单 |
| `TIER_UPGRADE_MAP` / `TIER_AGENT_CANDIDATES` | 684→ | 失败升级 tier 链（T3→T2→T1） |

### 1.2 Prompt 注入与 Supplement 构建（103–670）

| 名称 | 行 | 职责 |
|------|----|----|
| `buildClarificationSupplement` | 103 | 拼装阶段澄清补充文本 |
| `buildSpecSourceOfTruthSupplement` | 153 | spec 真相源提示 |
| `buildTaskPrompt` | 158 | 阶段任务 prompt 入口（generalize/publish 分支，其余委托 task-mapper） |
| `injectSpecBeforeCodeGuard` | 171 | 编码前注入 spec 同步守卫 |
| `buildInjectionTriplet` / `hasInjectionTriplet` / `withInjectionTriplet` | 493–517 | 注入三元组（goal/action/why）构建与去重 |
| `buildSevoRouteGuidance` / `buildSevoContextQuickReference` / `buildSevoPipelineDiscipline` | 518–641 | FR-14a 流水线纪律注入文本 |
| `getSevoPromptInjectionState` / `recordSevoPromptInjection` | 568–670 | 注入去重状态（`globalThis` symbol 存储） |
| `formatError` | 671 | 错误码 → 用户可读文本 |

### 1.3 Gate 结果解析与评估（759–1356）

| 名称 | 行 | 职责 |
|------|----|----|
| `parseJsonObjectLoose` / `extractMarkerBlock` | 980–991 | 从 LLM 输出抽取 marker 包裹的 JSON |
| `parseGeneralizeGateResult` / `parsePublishRoutingResult` / `parsePublishGeneralizationGateResult` | 1002–1071 | 解析三类 gate 机读块 |
| `evaluateGeneralizeGateResult` | 1086 | generalize 门禁判定（publishEligible / 必查项） |
| `evaluatePublishRoutingResult` | 1217 | publish 分流判定（依赖 generalize 结果 + 分类计数 + 敏感项拦截） |
| `evaluatePublishGeneralizationGateResult` | 1352 | 兼容旧合并 marker 的判定 |
| `validateClassificationObjects` / `validateLocalMainConfigResult` | 1171–1195 | 分类对象/本地 main 配置校验 |

### 1.4 Generalize 签名与回填（1365–1626）

| 名称 | 行 | 职责 |
|------|----|----|
| `readGeneralizeGateResult` | 1365 | 从 pipeline state 读取 generalize 门禁结果 |
| `collectGeneralizeSignatureInputs` / `buildGeneralizeChangeSignature` | 1397–1434 | 收集前序阶段产物文件 → 算变更签名（判断 generalize 是否需重跑） |
| `hasValidGeneralizeRecord` | 1439 | 当前变更签名是否已有有效 generalize 记录 |
| `resolveGeneralizeBackfill` / `activateGeneralizeBackfill` | 1480–1497 | 缺 generalize 记录时回填/激活 generalize 阶段 |
| `attachGeneralizeGateMetadata` / `attachPublishRoutingMetadata` / `attachPublishGeneralizationGateMetadata` | 1529–1612 | 把 gate 结果写回 pipeline state（**状态写入点**） |

### 1.5 FR 追踪与收敛环（1627–1873）

| 名称 | 行 | 职责 |
|------|----|----|
| `parseACCoverageChecklist` / `buildACSupplementPrompt` | 1627–1652 | 解析 implement 输出的 AC 覆盖清单 / 构建补充任务 prompt |
| `loadFRTracking` / `saveFRTracking` / `initFRTracking` / `refreshFRTracking` / `isFRTrackingComplete` | 1689–1728 | FR 追踪状态读写（**状态写入点**，文件级） |
| `initConvergenceLoop` / `getConvergenceLoop` / `updateConvergenceLoop` / `shouldTriggerConvergence` | 1734–1769 | 收敛环状态机 |
| `parseConvergenceGapReport` / `runTerminalGapScan` / `buildTerminalGapFixPrompt` | 1769–1822 | 终局差距扫描（idle + 未覆盖 FR → 强制补跑） |

### 1.6 通用 helper / 工具事件解析（1874–2160）

| 名称 | 行 | 职责 |
|------|----|----|
| `nowIso` / `extractMessageText` | 1874–1876 | 时间戳 / 从消息 content 抽取纯文本 |
| `cacheRecentMainPromptContext` | 1890 | 缓存 main session 最近 user/assistant 文本（供意图判断） |
| `isExecLikeTool` / `extractToolCommand` / `getToolExitCode` / `extractToolFilePaths` | 1913–2121 | 工具事件字段提取 |
| `isProductRequirementsPath` / `isSpecLikeMarkdownPath` / `isSpecWriteToolName` | 1930–1942 | 路径/工具名识别（确定性结构匹配，非语义判断） |
| `resolveProjectRootForSpecPath` | 2142 | 由 spec 文件路径反推项目根 |

### 1.7 Spec 结构/同步提醒（2185–2606）

| 名称 | 行 | 职责 |
|------|----|----|
| `parseSpecStructureRulesFromMarkdown` / `loadSpecStructureRules` / `refreshSpecWritingStandard` | 2211–2267 | 加载 spec 写作规范（飞书拉取 + 冷却） |
| `analyzeSpecStructure` / `buildSpecStructureReminder` | 2349–2399 | 分析 spec 章节顺序/缺失 → 构建提醒 |
| `queueSpecStructureReminder*` / `consumeSpecStructureReminder` | 2416–2461 | spec 结构提醒入队/消费 |
| `readSourceOfTruthToken` / `buildSpecSyncReminder` / `queueSpecSyncReminder*` / `consumeSpecSyncReminder` | 2482–2558 | spec 飞书同步提醒 |
| `extractFeishuDocToken` / `sendFeishuDocNotification` | 2566–2588 | 飞书文档更新通知 |

### 1.8 FR-37 审计提醒（1976–2120）

| 名称 | 行 | 职责 |
|------|----|----|
| `isFr37DevelopmentCompletion` / `buildFr37AuditReminder` / `buildFr37AuditPrompt` | 1980–2030 | 识别开发完成事件 → 构建审计提醒 |
| `dispatchFr37AuditForCompletion` / `queueFr37AuditReminder` | 2051–2100 | 派发/入队 FR-37 审计任务 |

### 1.9 配置 / 状态文件 I/O（2607–4556）

| 名称 | 行 | 职责 |
|------|----|----|
| `readPluginStateConfig` / `resolvePluginConfig` | 2611–2619 | 解析插件运行时配置 |
| `getEventsPath` / `getTaskBoardPath` / `getPipelineStateFile` / `getProgressPath` | 2649– | 各状态文件路径解析 |
| `readJson` / `writeJson` / `withFileLock` | 4504–4529 | **JSON 文件原子读写 + 文件锁**（所有持久化的底座） |
| `appendEvent` | 4496 | **事件日志追加**（sevo-pipeline-events.jsonl） |
| `loadActivePipelines` / `saveActivePipelines` | 4557–4561 | active-pipelines.json 读写 |
| `hasBoardTaskWithLabel` / `hasBoardTaskWithExactTitle` | 2018–2733 | 任务板去重查询 |

### 1.10 派发 / 路由 / 阶段编排（187–355, 2745–3540）

| 名称 | 行 | 职责 |
|------|----|----|
| `queuePendingAdvance` / `queueStageAdvancePrompt` | 187–200 | 阶段推进入队（写 pending-advances.jsonl） |
| `dispatchBoardTaskForStage` / `dispatchPendingAdvanceEntry` | 255–329 | 实际派发任务到任务板 / 执行 pending advance |
| `getExpectedRole` / `classifyAgentById` / `findAgentsByRole` / `sortAgentsByStageRelevance` | 357–421 | 阶段 ↔ agent 角色映射与排序 |
| `autoDispatchStage` | 2790 | 自动派发某阶段（无条件，FR 通用化） |
| `buildPipelineStagePlan` / `applyStagePlanToState` / `ensurePipelineStateStage` / `ensureFr19EndgameStages` | 2864→ | 构建唯一全阶段链 `FULL_PIPELINE_STAGES` → 落到 state（无规模分档） |
| `detectCodeWriteIntent` / `deterministicPathRoute` / `inferProjectSlug` | 3494→ | 任务路由（路径确定性 + LLM 语义） |

### 1.11 LLM 触发判断（3686–4002）

| 名称 | 行 | 职责 |
|------|----|----|
| `readLLMConfig` | 3686 | 读取 LLM provider 配置 |
| `callLlmClassification` | 3750 | **统一 LLM 分类调用**（带缓存 + 超时 + fallback） |
| `llmTriggerCheck` | 3813 | 任务是否触发 SEVO 流水线的语义判断 |
| `checkSevoExemption` / `checkSevoLabelExemption` | 3958–4002 | 豁免规则（已是 SEVO 派生任务则不重复触发） |

> ⚠️ `keywordFallbackCheck`（3931）是 LLM 不可用时的兜底，但按项目铁律 LLM 始终可用；语义判断主路径必须走 `llmTriggerCheck`，禁止退化为关键词匹配。

### 1.12 Pipeline 注册与查询（4557–5000）

| 名称 | 行 | 职责 |
|------|----|----|
| `registerActivePipeline` | 4874 | **注册活跃流水线**（写 active-pipelines.json，engine state 不可用则拒绝注册） |
| `migrateState` / `loadActivePipelinesWithMigration` | 4905–4948 | 启动时状态迁移 |
| `getProjectSlug` / `resolvePipelineId` / `getProjectRoot` / `getProjectDir` | 4959–4982 | pipelineId ↔ projectSlug ↔ 路径互查 |
| `findActivePipelineAtOrAfterStage` / `findActivePipelineManagingTrigger` | 4663–4691 | 触发匹配到既有流水线 |
| `inferCurrentStageFromState` / `buildStageOrderForPipeline` / `stageIndexInOrder` | 4624–4654 | 当前阶段推断与阶段顺序 |

### 1.13 完成判定与去重（4731–4856, 5320–5494）

| 名称 | 行 | 职责 |
|------|----|----|
| `claimCompletionForAdvance` | 4833 | **完成事件去重认领**（completion-dedupe.json + 文件锁，防止同一完成被多次推进） |
| `buildCompletionDedupeKey` | 4827 | 去重 key（pipelineId+stageId+attempt+completionId） |
| `appendPipelineCompletionLog` / `tryAppendPipelineCompletionLog` | 4737–4798 | 流水线完成日志（账本） |
| `evaluateCommercializationGate` / `formatCommercializationGateResult` | 5342–5435 | publish 阶段商用化门禁 |
| `buildCompletionMessage` / `buildCompletionNotice` | 183–5453 | 完成通知文本 |
| `parseGateVerdict` | 5495 | 解析 gate 三态裁决（passed/conditional/rejected） |

### 1.14 Review-Fix Loop (RFL) 与失败升级（5000–6190, 6424–6519）

| 名称 | 行 | 职责 |
|------|----|----|
| `getReviewAutoFixConfig` / `updateReviewAutoFixState` / `markPipelinePausedAtReviewFix` | 5000–5066 | review 自动修复状态 |
| `queueReviewAutoFix` | 5190 | 入队 review 自动修复任务 |
| `buildReviewAutoFixPrompt` / `collectReviewAutoFixContext` | 5074–5128 | 构建修复 prompt + 上下文 |
| `parseRflStage` / `classifyBlockerSeverity` / `extractP0P1FromVerdict` | 5995–6061 | RFL 阶段解析 + blocker 分级 |
| `queueRflFix` / `queueRflReval` | 6084–6101 | RFL 修复/复审入队 |
| `recordFailure` / `hasTierFailed` / `getUpgradeTier` / `getAgentForTier` | 6437–6487 | 失败历史 + tier 升级选 agent |
| `detectSubstantialFailure` | 6496 | 实质失败检测（输出过短 + 无文件 = 真失败） |

### 1.15 Design Review 编排（6191–6423）

| 名称 | 行 | 职责 |
|------|----|----|
| `parseDesignReviewStage` / `getDesignReviewDefinition(s)` | 6196–6224 | 设计评审阶段定义解析 |
| `buildDesignReviewStageId` / `selectDesignReviewAgent` | 6231–6240 | 设计评审阶段 ID 与 agent |
| `buildDesignReviewPrompt` / `buildDesignReviewFixPrompt` | 6251–6278 | 评审/修复 prompt |
| `patchDesignReviewStatus` / `queueDesignReview` / `queueDesignReviewFix` | 6311–6392 | 设计评审状态写回 + 入队 |

### 1.16 Spec-Gap 检测与恢复（FR-38a, 6520–7345）

| 名称 | 行 | 职责 |
|------|----|----|
| `runSpecIntegrityCheck` | 6685 | spec 完整性检查入口 |
| `buildSpecGapSupplement` / `buildSpecGapAdvisory` / `noticeSpecGapAdvisory` | 6772–6817 | spec-gap **建议模式**文本（advisory 化，不阻断） |
| `callSpecGapClassifier` / `runSpecGapAdvisoryCheck` | 6920–7019 | LLM 语义对比任务描述 vs spec FR 列表，检测新概念缺口 |
| `applySpecGapAdvisory38a` / `scheduleSpecGapAdvisoryAsyncRetry` | 7138–7169 | FR-38a 应用建议 + 异步重试 |
| `recoverFromSpecGapOnCompletion` | 7225 | 单条 spec-gap pipeline 在 spec 完成时恢复 |
| `recoverAllSpecGapPipelinesOnSpecCompletion` | 7252 | **扫全部 paused(spec-gap) pipeline 恢复**（避免只恢复首个匹配而漏掉其余） |

### 1.17 Consistency Gate（FR-41 六层一致性, 7346–7692）

| 名称 | 行 | 职责 |
|------|----|----|
| `gatherConsistencyArtifacts` / `buildConsistencyEvidenceArtifacts` | 7367–7388 | 收集一致性检查证据工件 |
| `runConsistencyGate` | 7476 | 六层一致性门禁主入口（阶段间 gate） |
| `markPipelinePausedAtConsistency` / `attachConsistencyCheck` | 7538–7580 | 一致性失败暂停 + 结果写回 |
| `detectProcessImprovement` | 7624 | 审计报告中检测流程改进建议（FR-O08） |

### 1.18 进度 / Supplement / FR 追踪（7693–7969）

| 名称 | 行 | 职责 |
|------|----|----|
| `loadProgress` / `saveProgress` / `updateStageProgress` / `computeCompletionPercent` | 7699–7763 | **阶段进度状态读写** |
| `buildRetryAdvanceEntry` | 7801 | 构建重试推进条目（含 tier 升级） |
| `addSupplement` / `consumeSupplements` / `injectSupplementsIntoPrompt` | 7861–7888 | 阶段补充文本入队/消费/注入 prompt |

### 1.19 用户意图检测与命令处理（7970–9355）

意图检测（语义优先，纯结构命令用确定性解析）：

| 名称 | 行 | 职责 |
|------|----|----|
| `extractUserMessage` / `detectPipelineCreationIntent` | 7970–7988 | 抽取用户消息 / 检测建流水线意图 |
| `buildPipelineCreationIntent` / `inferProjectSlugFromCommandDescription` | 8020–8037 | 构建创建意图对象 / 推断项目 slug |
| `detectDescriptivePipelineIntent` | 8133 | 描述式建流水线意图（commandRe 仅提取结构化参数） |
| `detect{Fix,Implement,Diagnose,Retry,Pause,Skip,Resume,From}Intent` | 8180–8302 | 8 类前缀命令意图检测 |
| `parseStagePrefixCommand` / `detectStagePrefixIntent` | 8302–8329 | `sevo:<stage>` 前缀命令解析 |

命令处理器（与上面意图一一对应）：

| 名称 | 行 | 职责 |
|------|----|----|
| `handleFromCommand` | 8349 | `create --from <stage>`：从指定阶段建流水线 |
| `handleQuickstartCommand` | 8526 | 快速启动 |
| `handleDiagnoseCommand` / `handleRetryCommand` | 8637–8685 | 诊断 / 重试某阶段 |
| `handlePauseCommand` / `handleSkipCommand` / `handleResumeCommand` | 8735–8818 | 暂停 / 跳过 / 恢复 |
| `clearPauseAndContinue` | 8855 | 清除暂停标记并继续 |
| `resumeFrom{SpecGap,QualityGate,ReviewFix,Consistency}` | 8887–8979 | 按暂停原因分类恢复（**各暂停点对应独立恢复路径**） |
| `queueStageForResume` | 8979 | 恢复时把目标阶段重新入队 |
| `handleStatusCommand` / `handleListCommand` | 9018–9107 | 状态查询 / 列流水线 |
| `runInfraPreflight` | 9170 | 基础设施预检（插件注册、hook、dist） |
| `handleDoctorCommand` | 9303 | doctor 四层诊断（委托 `./doctor.js` 的 `runDoctor`） |

> 注意：`handleDoctorCommand` 仅 9303–9355（约 50 行），**不是** god 函数；它把诊断逻辑委托给 `doctor.js`。真正的巨型块是后面的 `register(api)`（9361–12512）。

---

## 2. 插件定义与 Hook 注册（D 段：9356–12513）

`const plugin = { id, name, version, register(api) {...} }`，`register` 内先做 agent 发现、bridge 可用性检查（degraded 则 no-op return），然后注册 9 个 hook：

| # | Hook | priority | 行范围 | 职责 |
|---|------|----------|--------|------|
| 1 | `subagent_ended` | 200 | 9405–10814 | **核心**：子 Agent 完成 → 判定 outcome → 推进/暂停/恢复流水线（见 §3） |
| 1.5 | `before_prompt_build` (discipline) | 950 | 10822–10851 | FR-14a 流水线纪律注入（在 ACO dispatch-guard 900 之前） |
| 2 | `before_prompt_build` (main inject) | 850 | 10856–11117 | 注入下一阶段指令 + pending 通知 + 澄清问题到 main session |
| 4 | `before_prompt_build` (create/commands) | 100 | 11122–11636 | 解析用户消息 → 建流水线 / 执行前缀命令 |
| 3 | `before_tool_call` | 800 | 11641–12210 | 向 sessions_spawn 注入 sevo label + spec 守卫 |
| 4b | `after_tool_call` (spec sync) | 130 | 12216–12220 | spec 写入后排队同步提醒 |
| 4c | `after_tool_call` (spec structure) | 131 | 12224–12228 | spec 写入后排队结构提醒 |
| 4 | `after_tool_call` (feishu notify) | 120 | 12231–12285 | 飞书文档更新自动通知 |
| 5 | `message_received` (clarification) | 200 | 12290–12369 | 澄清响应处理 → 解除阻塞恢复流水线 |
| — | `before_prompt_build` (terminal gap) | 50 | 12374–12464 | 终局差距检查：idle agent + 未覆盖 FR → 强制推进 |

- `maybeRunStartupDoctor(api)`（12483）：启动时可选诊断。
- 所有 hook 经 `safeSevoHook(name, handler)`（5543）包裹 → try-catch fail-open，错误记日志不阻断派发。

---

## 3. 核心调用链

### 3.1 流水线创建（用户消息 → 注册）

```
message_received / before_prompt_build(create, prio 100)
  └─ extractUserMessage(11122区)
     └─ detectPipelineCreationIntent / detect*Intent(8133区)        ← 语义判断
        └─ buildPipelineCreationIntent(8020)
           └─ buildPipelineStagePlan() → applyStagePlanToState()       ← 唯一全阶段链（无规模评估）
              └─ bridge: getPipelineEngine().create()  ← 写 engine state
                 └─ registerActivePipeline(4874)                  ← 写 active-pipelines.json
                    └─ queueStageAdvancePrompt(200) → pending-advances.jsonl
```

### 3.2 阶段推进（子 Agent 完成 → 下一阶段）

```
subagent_ended hook (9405)
  ├─ claimCompletionForAdvance(4833)              ← 去重(completion-dedupe.json) 已认领则 return
  ├─ clearStageTimer(5842)
  ├─ detectClarificationRequest → 有澄清则阻塞入队, return
  ├─ parseGateVerdict(5495) → outcome (passed/conditional/rejected)
  ├─ [覆盖规则] detectSubstantialFailure / verifyStageArtifacts / UX P0 / wow-harness findings
  │     → 可能把 outcome 改成 failed/rejected
  ├─ [implement] ensureACInjection 覆盖检查 → 不足则 queue 补充任务并 return
  ├─ [spec passed] recoverFromSpecGapOnCompletion(7225)
  │                + recoverAllSpecGapPipelinesOnSpecCompletion(7252)  ← 全量扫描恢复
  ├─ [失败分支] queueRflFix / queueReviewAutoFix / queueDesignReviewFix → return（不推进）
  ├─ [收敛] shouldTriggerConvergence → runTerminalGapScan → 未覆盖则补跑 return
  ├─ [publish] evaluateCommercializationGate(5342) → rejected 则 pausePipelineAtQualityGate return
  ├─ evaluateFr19QualityGate(3263)                ← 质量门禁三态
  ├─ runConsistencyGate(7476)                     ← FR-41 六层一致性, blocked 则暂停 return
  ├─ [generalize 重入] 变更签名变了 → 强制 generalize 先跑
  └─ engine.advance(stageId)(9744/9753/9820)      ← bridge 推进 + persistPipelineState
        └─ queueStageAdvancePrompt(下一阶段) + updateStageProgress(7712)
           └─ [终局] recoverSkippedEndgameStagesBeforeCompletion(3189)
              → tryAppendPipelineCompletionLog(4798) + buildCompletionNotice → pendingNotices
```

### 3.3 通知回灌（推进结果 → main session）

```
before_prompt_build(main inject, prio 850)(10856)
  ├─ consumePendingAdvances(5633) ← drain pending-advances.jsonl
  ├─ sevoGlobal.pendingNotices (完成通知/门禁阻断通知)
  ├─ consumePendingClarifications(5974) ← 澄清问题（最高优先, 阻塞）
  ├─ consumeSupplements(7877) → injectSupplementsIntoPrompt(7888)
  └─ consumeSpecStructureReminder / consumeSpecSyncReminder
     → 拼成注入文本返回给 main session
```

### 3.4 暂停 → 恢复

```
[暂停] pausePipelineAtQualityGate(3235) / markPipelinePausedAtConsistency(7538)
       / markPipelinePausedAtReviewFix(5047)  → 写 state.pausedReason
[恢复] handleResumeCommand(8818) / message_received 澄清响应
       └─ 按 pausedReason 分派:
          resumeFromSpecGap(8887) / resumeFromQualityGate(8924)
          / resumeFromReviewFix(8941) / resumeFromConsistency(8960)
             └─ queueStageForResume(8979) → pending-advances.jsonl
```

---

## 4. 状态写入点汇总

所有持久化最终都过 `writeJson`(4519) / `appendEvent`(4496)，底层用 `withFileLock`(4529) 加锁。改动状态时优先用以下封装函数，**不要直接 `fs.writeFileSync`**：

| 写入函数 | 行 | 目标文件 | 内容 |
|---------|----|---------|------|
| `persistPipelineState` | 3124 | `state/<pipelineId>.json`（engine state） | 流水线主状态（阶段、status） |
| `saveActivePipelines` | 4561 | `state/active-pipelines.json` | 活跃流水线注册表 |
| `registerActivePipeline` | 4874 | 同上 | 注册新流水线（engine state 不可用则拒绝） |
| `patchPipelineStateMetadata` | 5694 | engine state | 局部 patch metadata |
| `queuePendingAdvance` / `queueStageAdvancePrompt` | 187/200 | `state/pending-advances.jsonl` | 阶段推进队列（jsonl 追加） |
| `claimCompletionForAdvance` | 4833 | `state/completion-dedupe.json` | 完成去重认领（带锁） |
| `saveProgress` / `updateStageProgress` | 7703/7712 | `state/progress.json` | 阶段进度百分比 |
| `saveFRTracking` | 1694 | FR 追踪文件 | FR 覆盖状态 |
| `recordSkippedStages` | 3166 | engine state | 跳过阶段记录 + 责任阶段 |
| `attach{Generalize,PublishRouting,Consistency}*` | 1529–1612/7580 | engine state | gate 结果写回 |
| `appendPipelineCompletionLog` | 4737 | 完成日志（账本） | 流水线完成记录 |
| `appendEvent` | 4496 | `logs/sevo-pipeline-events.jsonl` | 全量事件日志（可观测性） |

内存态（`sevoGlobal`，1841）——进程内、跨 hook 共享、**不持久化**：

| 字段 | 用途 |
|------|------|
| `pendingAdvances` / `pendingNotices` / `pendingSupplements` / `pendingClarifications` | 各类待消费队列（before_prompt_build 时 drain） |
| `activeStageTimers` | 阶段超时定时器（`startStageTimer`/`checkExpiredTimers`） |
| `failureHistory` / `reviewFixLoops` | 失败历史 + RFL 循环态 |
| `recentMainPromptContext` | main session 最近上下文缓存 |
| `clarificationCoordinator` | 澄清协调器实例（来自 bridge） |
| `agentPool` / `runtimeConfig` / `degraded` | 启动时初始化 |

> ⚠️ 内存态在进程重启后丢失；持久化态是真相源。两者不一致时以 `state/*.json` 为准。

---

## 5. 与 src/ TypeScript 模块的桥接关系

index.js（plugin 入口，JS）**不直接 import `src/`**。所有 TS 能力经两层桥接：

```
index.js
  ├─ import { ... } from './bridge.js'          ← 懒加载 src/ 编译产物(dist/)
  ├─ import { ... } from './task-mapper.js'     ← 阶段→prompt 映射, agent 发现
  ├─ import { ... } from './label-protocol.js'  ← sevo label 编解码
  ├─ import { handleSevoInit } from './sevo-init.js'
  ├─ import { runDoctor } from './doctor.js'    ← doctor 四层诊断
  ├─ import { injectAllRoleTemplates } from './role-templates.js'
  └─ import { normalizePlainObject, resolveConfiguredPath } from './utils.js'
```

### bridge.js 暴露的 src/ 桥接点

`bridge.js` 用 `pathToFileURL` + 动态 import 懒加载 `dist/`（TS 编译产物），**dist/ 缺失则各 getter 返回 null → 插件 degraded 为 no-op**。每个模块独立判可用性（一个挂不影响其他）。

| bridge 导出 | 对应 src/ 模块 | index.js 调用点 | 用途 |
|------------|---------------|----------------|------|
| `getPipelineEngine()` | `src/pipeline` / `src/engine` | 多处（`.create/.load/.advance/.save`） | **流水线状态机核心**：创建、加载、推进、保存 |
| `getLedgerEngine()` | `src/ledger` | 完成日志路径 | 账本/完成记录 |
| `getRoute()` | `src/router` | 路由判断 | 任务路由 |
| `getOrchestrator()` | `src/orchestrator` | 编排路径 | 任务编排（可选路径） |
| `getAdapter()` | `src/adapter` / `src/plugin-adapter` | `adapter.dispatchTask`(12167) `adapter.onClarificationResponse`(5870) | OpenClaw 适配：派发任务、澄清回调 |
| `getClarificationCoordinator()` | `src/clarification` | `coordinator.open/getRecord/resolve`(12325–12334) | 澄清协调（开启/查询/解决） |
| `getWowHarnessFindings()` / `getWowHarnessInjectedFragments()` | wow-harness 集成 | subagent_ended A-6 区 | guard findings → gate blockers |
| `isAvailable()` | — | `register` 启动检查(9389) | dist/ 可用性 → 是否 degraded |
| `setBridgeConfig()` | — | `register`(9362) | 注入运行时配置 |

### 桥接调用约定

- bridge getter 多为 **async**（`await getPipelineEngine()`），因为首次会动态 import。
- 每个 engine 调用点都在 try-catch 内（fail-open）；engine 为 null 时跳过该逻辑，不抛错。
- engine 实例**不缓存到 sevoGlobal**——每次现取（bridge 内部有 TTL 缓存，见 `getCacheTtlMs`，默认 30s）。

---

## 6. 改动指引（给后续开发 Agent）

1. **加新阶段**：改 `STAGE_IDS`(704) + `buildPipelineStagePlan`(2953) + 阶段顺序，再看 `subagent_ended` 是否需要专门分支。
2. **改阶段推进逻辑**：定位 `subagent_ended` hook（9405），按 §3.2 调用链找到对应覆盖/门禁块。
3. **加门禁**：参考 `evaluateFr19QualityGate`(3263) / `runConsistencyGate`(7476) 模式，结果用 `attach*` 写回 state。
4. **加用户命令**：成对加 `detect*Intent`(8180区) + `handle*Command`(8637区)，并在 `before_prompt_build(create, 100)` hook（11122）里接线。
5. **改注入文本**：阶段提示在 §1.1 supplement 常量；纪律注入在 `buildSevoPipelineDiscipline`(591)。
6. **碰 src/ 能力**：先看 `bridge.js` 有没有现成 getter；没有就先在 `src/` + `bridge.js` 加，**不要在 index.js 直接 import `dist/`**。
7. **语义判断铁律**：任务类型/意图/分类必须走 `callLlmClassification`(3750) / `llmTriggerCheck`(3813)，**禁止关键词/正则**（正则仅限提取确定性结构如路径、命令、task ID）。
8. **状态写入**：用 §4 的封装函数，不直接 `fs.writeFileSync`；jsonl 用 `appendEvent`。

---

> 维护：本图随 index.js 改动会过时。大改后用 `grep -nE "^(async )?function" index.js` 与 `grep -nE "api\.on\(" index.js` 复核函数清单与 hook 注册，更新对应行号。


