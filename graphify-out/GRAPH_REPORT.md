# Graph Report - sevo  (2026-06-08)

## Corpus Check
- 497 files · ~463,166 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2844 nodes · 6433 edges · 48 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 362 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `appendEvent()` - 72 edges
2. `loadActivePipelines()` - 50 edges
3. `nowIso()` - 44 edges
4. `normalizePlainObject()` - 37 edges
5. `PipelineEngineFacade` - 37 edges
6. `PipelineEngine` - 36 edges
7. `encode()` - 34 edges
8. `PluginAdapter` - 34 edges
9. `getStageMapping()` - 33 edges
10. `writeFileEnsure()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `getPendingAdvanceByLabel()` --calls--> `decode()`  [INFERRED]
  pipeline-utils.js → label-protocol.js
- `buildPromptInjectionPayload()` --calls--> `checkExpiredTimers()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `updateActivePipelines()`  [INFERRED]
  prompt-injector.js → state-manager.js
- `buildPromptInjectionPayload()` --calls--> `consumePendingClarifications()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `getWowHarnessFindings()`  [INFERRED]
  prompt-injector.js → bridge.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (361): renderAdvancePromptTemplate(), handleRetryCommand(), handleSkipCommand(), activateGeneralizeBackfill(), addSupplement(), analyzeSpecStructure(), appendEvent(), appendPipelineCompletionLog() (+353 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (77): AmbiguityDetector, createDefaultRules(), formatAdr(), formatResolution(), nextAdrSequence(), slugify(), writeResolutionArtifacts(), ContractStageScanRule (+69 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (118): checkDistExists(), getAdapter(), getCacheTtlMs(), getClarificationCoordinator(), getConfig(), getDataPath(), getFileMtime(), getLedgerEngine() (+110 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (85): activePipelinesPath(), drainPendingAdvances(), enqueuePendingAdvanceFile(), ensureDir(), pendingAdvancesPath(), pipelinesLockPath(), readJson(), reconcileCliCreatedPipelines() (+77 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (44): ComplianceRouter, parseTaskScopeFromLLM(), finding(), ImplementationReviewGate, CodeMapGenerator, buildCliRuntimeChecks(), buildCoreCommandsCheck(), buildDemoProjectCommand() (+36 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (23): FixLoopManager, arePrerequisitesMet(), getActivatableStages(), getPrerequisites(), shouldBlockImplement(), appendEvent(), atomicWriteJson(), eventsPath() (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (27): finding(), SpecReviewGate, asBoolean(), asReason(), classifyArchitectureNeed(), classifyDesignNeeds(), classifyDesignNeedsFallback(), conservativeFallback() (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (49): buildContract(), contractHandler(), contractReviewGateHandler(), computeNextBump(), deployHandler(), parseVersion(), endgameScanHandler(), implementHandler() (+41 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (45): buildConstraintsSection(), buildInstanceContext(), buildSpecReadInstruction(), buildStageStandardPrompt(), buildTriggerStagePrompt(), inferProjectSlugFromPipelineId(), loadInstanceForPrompt(), resolveManagedProjectSlug() (+37 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (17): OpenClawAdapter, inferVersionBump(), parseSemver(), StandaloneAdapter, formatMarkdown(), isLarkCliAvailable(), OpenClawNotificationAdapter, sendViaLarkCli() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (66): GET(), activeRegistry(), allCockpitPipelines(), allEvents(), cockpitBlocker(), cockpitLifecycleStatus(), cockpitPipelineSummary(), cockpitTimeline() (+58 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (35): PipelineInterceptor, ensureDir(), logAudit(), logPath(), resolveLogPath(), decide(), deterministicCheck(), labelBypass() (+27 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (51): collectPublicApiNames(), collectTsFiles(), configExternalizationChecker(), consoleLogScanner(), documentationQualityChecker(), errorHandlingCoverageChecker(), isPublicEntrypoint(), runCommercializationScan() (+43 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (36): getEvaluatorsDir(), loadEvaluatorRegistry(), runEvaluators(), runSingleEvaluator(), determineConclusion(), evaluateHybridGate(), evaluatorResultsToItems(), generateEvaluatorSummary() (+28 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (21): FileExistsRule, MinCoverageRule, TestPassRule, TypeCheckRule, FrTraceabilityRule, FrValidationCriteriaRule, createSemanticRuleLlmClient(), extractFrSections() (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (16): createPipeline(), loadArtifacts(), loadFilter(), loadReviewBundles(), parseArgs(), parseScope(), printHelp(), runGate() (+8 more)

### Community 16 - "Community 16"
Cohesion: 0.1
Nodes (41): briefFinding(), buildDimensionSystemPrompt(), buildEvidencePayload(), collectProjectEvidence(), computeDelta(), countSeverities(), evaluateDimension(), fileMtime() (+33 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (21): detectAvailableAgents(), detectHostAdapter(), detectProjectProfile(), findOpenClawConfig(), generateDefaultRoleAssignment(), generatePromptInjection(), generateSevoConfigTemplate(), hasWorkspaceConfig() (+13 more)

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (4): buildBootstrapInjection(), parseArgs(), printHelp(), runBootstrapInjection()

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (8): useCockpitPipelineDetail(), useCockpitPipelines(), useCockpitProjectDetail(), useCockpitProjects(), formatDateTime(), formatRelative(), lifecycleStatusClass(), cn()

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (14): buildCallCommand(), buildImportCommand(), defaultCleanInstallL2Checks(), defaultCleanInstallL3Checks(), hasPackageJson(), inferProjectType(), loadCleanInstallConfig(), mergeCleanInstallChecks() (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (10): ClarificationCoordinator, resolveStageAttempt(), summarizeContext(), ContextInjector, extractAcceptanceCriteria(), extractSection(), extractSectionsMatching(), listFiles() (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.13
Nodes (15): allRequiredStagesPassed(), collectArtifacts(), collectClarificationRefs(), collectStageRecords(), generateVersion(), LedgerEngine, loadPipelineState(), scopeHash() (+7 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (5): RoleRegistry, RoleStageValidator, RoleDispatchBlockedError, RoleTaskMatcher, validateDispatchMatrix()

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (9): buildStageHandlers(), appendEvent(), atomicWriteJson(), bindingFor(), eventsPathOf(), listStageBindings(), pipelineDirOf(), PipelineEngine (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (4): buildDependencyGraph(), computeDagMetrics(), sanitizeDagNodes(), TaskDagScheduler

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (4): DeployStage, resolvePublishScript(), makeCandidates(), makeInput()

### Community 27 - "Community 27"
Cohesion: 0.21
Nodes (1): TaskOrchestrator

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (1): ReviewFixLoop

### Community 29 - "Community 29"
Cohesion: 0.15
Nodes (1): SevoSDK

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (5): checkDeploymentView(), deriveConclusion(), normalizeRoots(), ReviewStage, toFixRequirement()

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (1): PipelineRun

### Community 32 - "Community 32"
Cohesion: 0.19
Nodes (4): ContractReviewGate, deriveConclusion(), makeArtifact(), makeInput()

### Community 33 - "Community 33"
Cohesion: 0.21
Nodes (1): ProactiveDriveEngine

### Community 34 - "Community 34"
Cohesion: 0.27
Nodes (3): VerifyStage, makeInput(), makeTargets()

### Community 35 - "Community 35"
Cohesion: 0.23
Nodes (7): addSession(), hasSession(), removeSession(), POST(), safeCompare(), POST(), GET()

### Community 36 - "Community 36"
Cohesion: 0.29
Nodes (4): deriveConclusion(), SmokeTestStage, makeInput(), makeTargets()

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (1): ClarificationManager

### Community 38 - "Community 38"
Cohesion: 0.24
Nodes (1): StageTransitionTrigger

### Community 39 - "Community 39"
Cohesion: 0.31
Nodes (1): PdcaAutoDriver

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (1): SpecGapDetector

### Community 41 - "Community 41"
Cohesion: 0.39
Nodes (1): OkrPeriodicChecker

### Community 42 - "Community 42"
Cohesion: 0.48
Nodes (5): appendJsonLineWithRotation(), normalizeEventLogRotation(), rotatedPath(), rotateEventLogIfNeeded(), toPositiveInteger()

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (1): FakeClarificationAdapter

### Community 45 - "Community 45"
Cohesion: 0.7
Nodes (3): checkSevoExemption(), matchesAny(), startsWithAny()

### Community 47 - "Community 47"
Cohesion: 0.5
Nodes (1): LLMProvider

### Community 49 - "Community 49"
Cohesion: 0.83
Nodes (3): clearPending(), g(), pendingFor()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (1): setupProject()

## Knowledge Gaps
- **Thin community `Community 27`** (18 nodes): `TaskOrchestrator`, `.applyRuleVerdict()`, `.buildStageRecord()`, `.cleanupCompleted()`, `.cleanupRun()`, `.evaluateAndAdvance()`, `.evaluateAndAdvanceAsync()`, `.evictIfNeeded()`, `.failPipeline()`, `.getClarificationSummary()`, `.getGateEngine()`, `.getPipelineStatus()`, `.getRun()`, `.hasBlockingClarifications()`, `.onClarificationSettled()`, `.scanClarifications()`, `.startPipeline()`, `.submitArtifacts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (17 nodes): `ReviewFixLoop`, `.canRetry()`, `.constructor()`, `.evaluateGate()`, `.execute()`, `.extractIssues()`, `.generateFixTasks()`, `.getInitialStatus()`, `.getReviewFixStatus()`, `.handleRevalidationResult()`, `.incrementAttempt()`, `.mapToSeverity()`, `.shouldEscalate()`, `.sortByPriority()`, `.triggerRevalidation()`, `.updateFixTaskStatus()`, `.updateIssueStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (17 nodes): `SevoSDK`, `.advanceStage()`, `.cancel()`, `.classifyAction()`, `.completeStage()`, `.constructor()`, `.createPipeline()`, `.getCustomStageRegistry()`, `.getEngine()`, `.getStatus()`, `.listCustomStages()`, `.listPipelines()`, `.pause()`, `.registerCustomStage()`, `.resume()`, `.toStatusInfo()`, `.unregisterCustomStage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (14 nodes): `PipelineRun`, `.addArtifacts()`, `.advanceTo()`, `.constructor()`, `.getArtifacts()`, `.getCurrentStage()`, `.getStatus()`, `.getVerdict()`, `.isCompleted()`, `.isFailed()`, `.markCompleted()`, `.markFailed()`, `.recordVerdict()`, `.touch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (13 nodes): `ProactiveDriveEngine`, `.constructor()`, `.emit()`, `.getBackEdgeStageQueue()`, `.getCurrentCycle()`, `.getPdcaCycleRecords()`, `.getSpecGapDetector()`, `.getTransitionTrigger()`, `.onEvent()`, `.onStageCompleted()`, `.processGateAutoTrigger()`, `.processPostReleaseScan()`, `.processSpecGapDetection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (11 nodes): `ClarificationManager`, `.constructor()`, `.generateQuestions()`, `.getAllRecords()`, `.getRecordsByKnowledgeType()`, `.getRecordsByStage()`, `.processResponse()`, `inferBlockingLevel()`, `inferImpactScope()`, `mapSignalToClarificationType()`, `clarification-manager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (10 nodes): `StageTransitionTrigger`, `.constructor()`, `.evaluate()`, `.evaluateAsync()`, `.generateFixTasks()`, `.getGateType()`, `.hasGateBinding()`, `.inferAcId()`, `.inferFrId()`, `.inferSeverity()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (9 nodes): `PdcaAutoDriver`, `.constructor()`, `.generateSummaryReport()`, `.getMaxCycles()`, `.handleGapFound()`, `.handleOkrCheckWithGaps()`, `.notifyFixComplete()`, `.outputCycleToCli()`, `.startCycle()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (9 nodes): `SpecGapDetector`, `.constructor()`, `.extractModulesFromArtifacts()`, `.frListToReferences()`, `.generateSuggestedFr()`, `.isModuleCovered()`, `.judgeCoverage()`, `.preCheck()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (8 nodes): `OkrPeriodicChecker`, `.check()`, `.computeDefaultDeadline()`, `.constructor()`, `.generateSmartSuggestions()`, `.getInterval()`, `.outputToCli()`, `.shouldCheck()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (6 nodes): `FakeClarificationAdapter`, `.emitResponse()`, `.emitTimeout()`, `.onClarificationResponse()`, `.onClarificationTimeout()`, `.requestClarification()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (4 nodes): `LLMProvider`, `.chat()`, `.constructor()`, `llm-provider.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (3 nodes): `spec-sync-reminder.test.js`, `setupProject()`, `spec-sync-reminder.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `execFileSync()` connect `Community 0` to `Community 26`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **Are the 31 inferred relationships involving `normalizePlainObject()` (e.g. with `resolveAgent()` and `getConfig()`) actually correct?**
  _`normalizePlainObject()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._