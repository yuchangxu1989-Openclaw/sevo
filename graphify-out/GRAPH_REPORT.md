# Graph Report - sevo  (2026-06-10)

## Corpus Check
- 526 files · ~496,714 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3073 nodes · 6995 edges · 45 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 393 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]

## God Nodes (most connected - your core abstractions)
1. `appendEvent()` - 78 edges
2. `loadActivePipelines()` - 56 edges
3. `nowIso()` - 50 edges
4. `getStageMapping()` - 37 edges
5. `normalizePlainObject()` - 37 edges
6. `PipelineEngineFacade` - 37 edges
7. `PipelineEngine` - 36 edges
8. `encode()` - 34 edges
9. `PluginAdapter` - 34 edges
10. `writeFileEnsure()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `buildPromptInjectionPayload()` --calls--> `checkExpiredTimers()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `getStageMapping()`  [INFERRED]
  prompt-injector.js → task-mapper.js
- `buildPromptInjectionPayload()` --calls--> `consumePendingAdvances()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `consumePendingClarifications()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `encode()`  [INFERRED]
  prompt-injector.js → label-protocol.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (384): handleRetryCommand(), handleSkipCommand(), activateGeneralizeBackfill(), addSupplement(), analyzeSpecStructure(), appendEvent(), appendPipelineCompletionLog(), appendRouteEvent() (+376 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (67): buildConstraintsSection(), buildInstanceContext(), buildSpecReadInstruction(), buildStageStandardPrompt(), buildTriggerStagePrompt(), inferProjectSlugFromPipelineId(), loadInstanceForPrompt(), resolveManagedProjectSlug() (+59 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): activePipelinesPath(), drainPendingAdvances(), enqueuePendingAdvanceFile(), ensureDir(), pendingAdvancesPath(), pipelinesLockPath(), readJson(), reconcileCliCreatedPipelines() (+93 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (119): checkDistExists(), getAdapter(), getCacheTtlMs(), getClarificationCoordinator(), getConfig(), getDataPath(), getFileMtime(), getLedgerEngine() (+111 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (43): appendAdvanceDecision(), pipelineEventsPath(), advanceOnComplete(), appendPipelineEvent(), findActiveStagesToTrigger(), getPersistedTieredScan(), inferProjectRoot(), inferTieredScanPaths() (+35 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (100): renderAdvancePromptTemplate(), extractLabelCandidate(), findSevoLabelFromSpawnParams(), getCompletionSevoLabel(), lookupLabelFromTaskBoard(), decode(), isSevoLabel(), extractLabelCandidate() (+92 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (50): ComplianceRouter, parseTaskScopeFromLLM(), initProjectDirectory(), formatDate(), generateInstanceId(), isValidInstanceId(), createPipelineInstance(), isValidProjectSlug() (+42 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (36): CodeMapGenerator, buildCliRuntimeChecks(), buildCoreCommandsCheck(), buildDemoProjectCommand(), buildHelpOutputCommand(), buildInitExecutableCommand(), buildPackInstallImportCommand(), defaultRuntimeChecksForType() (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (34): createSpecReviewGateRules(), FileExistsRule, MinCoverageRule, TestPassRule, TypeCheckRule, createSpecReviewGateEngine(), registerSpecReviewGateRules(), evaluate() (+26 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (12): OrchestratorEmitter, TaskOrchestrator, StageContext, StageGraph, StageRouter, PostReleaseValidationStage, makePipelineState(), makeStageRecord() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (30): AmbiguityDetector, createDefaultRules(), ClarificationCoordinator, resolveStageAttempt(), summarizeContext(), ClarificationManager, buildSystemPrompt(), buildUserPrompt() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (15): OkrPeriodicChecker, readDriveConfig(), PdcaAutoDriver, PostReleaseAutoScanner, ProactiveDriveEngine, SpecGapDetector, StageTransitionTrigger, formatMarkdown() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.04
Nodes (66): GET(), activeRegistry(), allCockpitPipelines(), allEvents(), cockpitBlocker(), cockpitLifecycleStatus(), cockpitPipelineSummary(), cockpitTimeline() (+58 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (48): buildContract(), contractHandler(), contractReviewGateHandler(), computeNextBump(), deployHandler(), parseVersion(), endgameScanHandler(), implementHandler() (+40 more)

### Community 14 - "Community 14"
Cohesion: 0.05
Nodes (35): PipelineInterceptor, ensureDir(), logAudit(), logPath(), resolveLogPath(), decide(), deterministicCheck(), labelBypass() (+27 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (51): collectPublicApiNames(), collectTsFiles(), configExternalizationChecker(), consoleLogScanner(), documentationQualityChecker(), errorHandlingCoverageChecker(), isPublicEntrypoint(), runCommercializationScan() (+43 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (35): getEvaluatorsDir(), loadEvaluatorRegistry(), runEvaluators(), runSingleEvaluator(), determineConclusion(), evaluateHybridGate(), evaluatorResultsToItems(), generateEvaluatorSummary() (+27 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (37): cmdCreate(), cmdEntryPoint(), cmdFrom(), cmdSkip(), cmdStatus(), formatRouteSuffix(), formatRunSummary(), markPriorStagesForEntry() (+29 more)

### Community 18 - "Community 18"
Cohesion: 0.1
Nodes (41): briefFinding(), buildDimensionSystemPrompt(), buildEvidencePayload(), collectProjectEvidence(), computeDelta(), countSeverities(), evaluateDimension(), fileMtime() (+33 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (8): checkDeploymentView(), createReviewFixLoop(), ReviewFixLoop, severityToPriority(), deriveConclusion(), normalizeRoots(), ReviewStage, toFixRequirement()

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (4): buildBootstrapInjection(), parseArgs(), printHelp(), runBootstrapInjection()

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (8): useCockpitPipelineDetail(), useCockpitPipelines(), useCockpitProjectDetail(), useCockpitProjects(), formatDateTime(), formatRelative(), lifecycleStatusClass(), cn()

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (13): buildCallCommand(), buildImportCommand(), defaultCleanInstallL2Checks(), defaultCleanInstallL3Checks(), hasPackageJson(), inferProjectType(), mergeCleanInstallChecks(), packageNameForRequire() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (5): RoleRegistry, RoleStageValidator, RoleDispatchBlockedError, RoleTaskMatcher, validateDispatchMatrix()

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (9): buildStageHandlers(), appendEvent(), atomicWriteJson(), bindingFor(), eventsPathOf(), listStageBindings(), pipelineDirOf(), PipelineEngine (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (13): allRequiredStagesPassed(), collectArtifacts(), collectClarificationRefs(), collectStageRecords(), generateVersion(), LedgerEngine, loadPipelineState(), scopeHash() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (1): OpenClawAdapter

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (4): assessGoalAlignment(), SpecStage, makeRequest(), makeTask()

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (2): EndgameDeliveryStage, previewReadmeCoverage()

### Community 29 - "Community 29"
Cohesion: 0.21
Nodes (5): DispatchGuardAdapter, injectGovernance(), printGovernanceStatus(), selectAdapter(), StandaloneGuardAdapter

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (4): buildDependencyGraph(), computeDagMetrics(), sanitizeDagNodes(), TaskDagScheduler

### Community 31 - "Community 31"
Cohesion: 0.19
Nodes (4): DeployStage, resolvePublishScript(), makeCandidates(), makeInput()

### Community 32 - "Community 32"
Cohesion: 0.26
Nodes (1): VerifyWithRealDataGate

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (2): finding(), ImplementationReviewGate

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (1): StandaloneAdapter

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (1): PipelineRun

### Community 36 - "Community 36"
Cohesion: 0.19
Nodes (4): ContractReviewGate, deriveConclusion(), makeArtifact(), makeInput()

### Community 37 - "Community 37"
Cohesion: 0.23
Nodes (7): addSession(), hasSession(), removeSession(), POST(), safeCompare(), POST(), GET()

### Community 38 - "Community 38"
Cohesion: 0.47
Nodes (1): PdcaGapAnalysisStage

### Community 39 - "Community 39"
Cohesion: 0.48
Nodes (5): appendJsonLineWithRotation(), normalizeEventLogRotation(), rotatedPath(), rotateEventLogIfNeeded(), toPositiveInteger()

### Community 42 - "Community 42"
Cohesion: 0.7
Nodes (3): checkSevoExemption(), matchesAny(), startsWithAny()

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (1): LLMProvider

### Community 45 - "Community 45"
Cohesion: 0.83
Nodes (3): embedBatch(), main(), readEmbeddingConfig()

### Community 48 - "Community 48"
Cohesion: 0.83
Nodes (3): clearPending(), g(), pendingFor()

### Community 49 - "Community 49"
Cohesion: 0.67
Nodes (1): setupProject()

## Knowledge Gaps
- **Thin community `Community 26`** (22 nodes): `OpenClawAdapter`, `.analyzeRequirements()`, `.callLlm()`, `.collectArtifacts()`, `.dispatchTask()`, `.fallbackTaskId()`, `.formatGateMessage()`, `.getProjectConfig()`, `.inferArtifactType()`, `.loadProjectConfig()`, `.matchesTask()`, `.notifyGateResult()`, `.parsePublishResult()`, `.publish()`, `.requestReadmeUpdate()`, `.resolveAgent()`, `.spawnParallelTasks()`, `.spawnTask()`, `.stageTimeout()`, `.supportsSpawn()`, `.triggerStage()`, `.walkArtifacts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (21 nodes): `EndgameDeliveryStage`, `.applyVersionIfNeeded()`, `.bumpVersionString()`, `.checkReadmeSync()`, `.collectGapScanArtifacts()`, `.constructor()`, `.dedupeArtifacts()`, `.determineVersionBump()`, `.emitNotification()`, `.execute()`, `.executePublish()`, `.fallbackReadmeCoverage()`, `.inferArtifactType()`, `.mapSemanticReadmeCoverage()`, `.readExplicitType()`, `.readPackageJson()`, `.readSpecDocument()`, `.runLivenessVerification()`, `.triggerGapScan()`, `.walkArtifactRoot()`, `previewReadmeCoverage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (17 nodes): `VerifyWithRealDataGate`, `.checkDatabaseAuthenticity()`, `.confirmIssuesWithLlm()`, `.constructor()`, `.discoverDatabaseFiles()`, `.discoverMaterials()`, `.execute()`, `.findDeadDataIssues()`, `.findGarbageDataIssues()`, `.findStatsDriftIssues()`, `.findTestResidueIssues()`, `.getTableColumns()`, `.getUserTableNames()`, `.inspectTable()`, `.parseTimestamp()`, `.processMaterial()`, `.quoteIdentifier()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (17 nodes): `finding()`, `ImplementationReviewGate`, `.constructor()`, `.evaluate()`, `.evaluateCoverage()`, `.evaluateSync()`, `.evaluateSyncCore()`, `.extractAcceptanceCriteria()`, `.findFailedTests()`, `.formatEvidence()`, `.inferL2ScanInput()`, `.inferProjectRoot()`, `.isCriticalAcceptanceCriteria()`, `.runL2Scan()`, `.toCoverageFindings()`, `.toL1Findings()`, `.toL2Findings()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (16 nodes): `StandaloneAdapter`, `.analyzeRequirements()`, `.callLlm()`, `.collectArtifacts()`, `.constructor()`, `.dispatchTask()`, `.getDispatches()`, `.getGateNotifications()`, `.getProjectConfig()`, `.notifyGateResult()`, `.publish()`, `.registerArtifacts()`, `.spawnParallelTasks()`, `.spawnTask()`, `.supportsSpawn()`, `.triggerStage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (14 nodes): `PipelineRun`, `.addArtifacts()`, `.advanceTo()`, `.constructor()`, `.getArtifacts()`, `.getCurrentStage()`, `.getStatus()`, `.getVerdict()`, `.isCompleted()`, `.isFailed()`, `.markCompleted()`, `.markFailed()`, `.recordVerdict()`, `.touch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (9 nodes): `PdcaGapAnalysisStage`, `.analyzeLocally()`, `.analyzeViaAdapter()`, `.assessCheck()`, `.assessDo()`, `.assessPlan()`, `.constructor()`, `.execute()`, `.writeArtifact()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (4 nodes): `LLMProvider`, `.chat()`, `.constructor()`, `llm-provider.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (3 nodes): `spec-sync-reminder.test.js`, `setupProject()`, `spec-sync-reminder.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `execFileSync()` connect `Community 0` to `Community 31`?**
  _High betweenness centrality (0.315) - this node is a cross-community bridge._
- **Why does `getStageMapping()` connect `Community 0` to `Community 3`, `Community 5`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `getStageMapping()` (e.g. with `buildPromptInjectionPayload()` and `queueFirstActiveStage()`) actually correct?**
  _`getStageMapping()` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 31 inferred relationships involving `normalizePlainObject()` (e.g. with `resolveAgent()` and `getConfig()`) actually correct?**
  _`normalizePlainObject()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._