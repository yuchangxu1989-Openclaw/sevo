# Graph Report - sevo  (2026-06-08)

## Corpus Check
- 479 files · ~433,528 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2758 nodes · 6236 edges · 37 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 356 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 37|Community 37]]

## God Nodes (most connected - your core abstractions)
1. `appendEvent()` - 61 edges
2. `loadActivePipelines()` - 48 edges
3. `nowIso()` - 40 edges
4. `PipelineEngineFacade` - 37 edges
5. `PipelineEngine` - 36 edges
6. `normalizePlainObject()` - 35 edges
7. `PluginAdapter` - 34 edges
8. `encode()` - 32 edges
9. `writeFileEnsure()` - 32 edges
10. `getStageMapping()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `getPendingAdvanceByLabel()` --calls--> `decode()`  [INFERRED]
  pipeline-utils.js → label-protocol.js
- `buildPromptInjectionPayload()` --calls--> `checkExpiredTimers()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `getStageMapping()`  [INFERRED]
  prompt-injector.js → task-mapper.js
- `buildPromptInjectionPayload()` --calls--> `consumePendingAdvances()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `consumePendingClarifications()`  [INFERRED]
  prompt-injector.js → index.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (323): handleRetryCommand(), handleSkipCommand(), activateGeneralizeBackfill(), addSupplement(), analyzeSpecStructure(), appendEvent(), appendPipelineCompletionLog(), appendRouteEvent() (+315 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (47): createSpecReviewGateRules(), FileExistsRule, MinCoverageRule, TestPassRule, TypeCheckRule, createSpecReviewGateEngine(), registerSpecReviewGateRules(), evaluate() (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (78): ComplianceRouter, parseTaskScopeFromLLM(), ContractReviewGate, deriveConclusion(), initProjectDirectory(), formatDate(), generateInstanceId(), isValidInstanceId() (+70 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (98): activePipelinesPath(), drainPendingAdvances(), enqueuePendingAdvanceFile(), ensureDir(), pendingAdvancesPath(), pipelinesLockPath(), readJson(), reconcileCliCreatedPipelines() (+90 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (118): checkDistExists(), getAdapter(), getCacheTtlMs(), getClarificationCoordinator(), getConfig(), getDataPath(), getFileMtime(), getLedgerEngine() (+110 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (45): buildConstraintsSection(), buildInstanceContext(), buildSpecReadInstruction(), buildStageStandardPrompt(), buildTriggerStagePrompt(), inferProjectSlugFromPipelineId(), loadInstanceForPrompt(), resolveManagedProjectSlug() (+37 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (23): finding(), ImplementationReviewGate, finding(), SpecReviewGate, ArchitectureDesignStage, ContractStage, SystematicDebuggingStage, analyzeDependencies() (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (18): OkrPeriodicChecker, readDriveConfig(), PdcaAutoDriver, PostReleaseAutoScanner, ProactiveDriveEngine, SpecGapDetector, StageTransitionTrigger, formatMarkdown() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (36): CodeMapGenerator, buildCliRuntimeChecks(), buildCoreCommandsCheck(), buildDemoProjectCommand(), buildHelpOutputCommand(), buildInitExecutableCommand(), buildPackInstallImportCommand(), defaultRuntimeChecksForType() (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.04
Nodes (18): FixLoopManager, arePrerequisitesMet(), getActivatableStages(), getPrerequisites(), shouldBlockImplement(), appendEvent(), atomicWriteJson(), eventsPath() (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (30): AmbiguityDetector, createDefaultRules(), ClarificationCoordinator, resolveStageAttempt(), summarizeContext(), ClarificationManager, buildSystemPrompt(), buildUserPrompt() (+22 more)

### Community 11 - "Community 11"
Cohesion: 0.04
Nodes (66): GET(), activeRegistry(), allCockpitPipelines(), allEvents(), cockpitBlocker(), cockpitLifecycleStatus(), cockpitPipelineSummary(), cockpitTimeline() (+58 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (48): buildContract(), contractHandler(), contractReviewGateHandler(), computeNextBump(), deployHandler(), parseVersion(), endgameScanHandler(), implementHandler() (+40 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (35): PipelineInterceptor, ensureDir(), logAudit(), logPath(), resolveLogPath(), decide(), deterministicCheck(), labelBypass() (+27 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (51): collectPublicApiNames(), collectTsFiles(), configExternalizationChecker(), consoleLogScanner(), documentationQualityChecker(), errorHandlingCoverageChecker(), isPublicEntrypoint(), runCommercializationScan() (+43 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (35): getEvaluatorsDir(), loadEvaluatorRegistry(), runEvaluators(), runSingleEvaluator(), determineConclusion(), evaluateHybridGate(), evaluatorResultsToItems(), generateEvaluatorSummary() (+27 more)

### Community 16 - "Community 16"
Cohesion: 0.1
Nodes (41): briefFinding(), buildDimensionSystemPrompt(), buildEvidencePayload(), collectProjectEvidence(), computeDelta(), countSeverities(), evaluateDimension(), fileMtime() (+33 more)

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (4): buildBootstrapInjection(), parseArgs(), printHelp(), runBootstrapInjection()

### Community 18 - "Community 18"
Cohesion: 0.07
Nodes (8): useCockpitPipelineDetail(), useCockpitPipelines(), useCockpitProjectDetail(), useCockpitProjects(), formatDateTime(), formatRelative(), lifecycleStatusClass(), cn()

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (13): buildCallCommand(), buildImportCommand(), defaultCleanInstallL2Checks(), defaultCleanInstallL3Checks(), hasPackageJson(), inferProjectType(), mergeCleanInstallChecks(), packageNameForRequire() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (5): assessGoalAlignment(), SpecStage, makeRequest(), makeTask(), MemoryClarificationAdapter

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (5): RoleRegistry, RoleStageValidator, RoleDispatchBlockedError, RoleTaskMatcher, validateDispatchMatrix()

### Community 22 - "Community 22"
Cohesion: 0.19
Nodes (9): buildStageHandlers(), appendEvent(), atomicWriteJson(), bindingFor(), eventsPathOf(), listStageBindings(), pipelineDirOf(), PipelineEngine (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (1): OpenClawAdapter

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (13): allRequiredStagesPassed(), collectArtifacts(), collectClarificationRefs(), collectStageRecords(), generateVersion(), LedgerEngine, loadPipelineState(), scopeHash() (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.21
Nodes (5): DispatchGuardAdapter, injectGovernance(), printGovernanceStatus(), selectAdapter(), StandaloneGuardAdapter

### Community 26 - "Community 26"
Cohesion: 0.17
Nodes (4): buildDependencyGraph(), computeDagMetrics(), sanitizeDagNodes(), TaskDagScheduler

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (4): DeployStage, resolvePublishScript(), makeCandidates(), makeInput()

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (1): ReviewFixLoop

### Community 29 - "Community 29"
Cohesion: 0.26
Nodes (1): VerifyWithRealDataGate

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (1): SevoSDK

### Community 31 - "Community 31"
Cohesion: 0.27
Nodes (3): VerifyStage, makeInput(), makeTargets()

### Community 32 - "Community 32"
Cohesion: 0.23
Nodes (7): addSession(), hasSession(), removeSession(), POST(), safeCompare(), POST(), GET()

### Community 33 - "Community 33"
Cohesion: 0.22
Nodes (1): FakeClarificationAdapter

### Community 34 - "Community 34"
Cohesion: 0.7
Nodes (3): checkSevoExemption(), matchesAny(), startsWithAny()

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (1): LLMProvider

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (1): setupProject()

## Knowledge Gaps
- **Thin community `Community 23`** (23 nodes): `OpenClawAdapter`, `.analyzeRequirements()`, `.callLlm()`, `.collectArtifacts()`, `.constructor()`, `.dispatchTask()`, `.fallbackTaskId()`, `.formatGateMessage()`, `.getProjectConfig()`, `.inferArtifactType()`, `.loadProjectConfig()`, `.matchesTask()`, `.notifyGateResult()`, `.parsePublishResult()`, `.publish()`, `.requestReadmeUpdate()`, `.resolveAgent()`, `.spawnParallelTasks()`, `.spawnTask()`, `.stageTimeout()`, `.supportsSpawn()`, `.triggerStage()`, `.walkArtifacts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (17 nodes): `ReviewFixLoop`, `.canRetry()`, `.constructor()`, `.evaluateGate()`, `.execute()`, `.extractIssues()`, `.generateFixTasks()`, `.getInitialStatus()`, `.getReviewFixStatus()`, `.handleRevalidationResult()`, `.incrementAttempt()`, `.mapToSeverity()`, `.shouldEscalate()`, `.sortByPriority()`, `.triggerRevalidation()`, `.updateFixTaskStatus()`, `.updateIssueStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (17 nodes): `VerifyWithRealDataGate`, `.checkDatabaseAuthenticity()`, `.confirmIssuesWithLlm()`, `.constructor()`, `.discoverDatabaseFiles()`, `.discoverMaterials()`, `.execute()`, `.findDeadDataIssues()`, `.findGarbageDataIssues()`, `.findStatsDriftIssues()`, `.findTestResidueIssues()`, `.getTableColumns()`, `.getUserTableNames()`, `.inspectTable()`, `.parseTimestamp()`, `.processMaterial()`, `.quoteIdentifier()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (17 nodes): `SevoSDK`, `.advanceStage()`, `.cancel()`, `.classifyAction()`, `.completeStage()`, `.constructor()`, `.createPipeline()`, `.getCustomStageRegistry()`, `.getEngine()`, `.getStatus()`, `.listCustomStages()`, `.listPipelines()`, `.pause()`, `.registerCustomStage()`, `.resume()`, `.toStatusInfo()`, `.unregisterCustomStage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (9 nodes): `clarification-coordinator.test.ts`, `FakeClarificationAdapter`, `.emitResponse()`, `.emitTimeout()`, `.onClarificationResponse()`, `.onClarificationTimeout()`, `.requestClarification()`, `makeArtifact()`, `makeStageRecord()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (4 nodes): `LLMProvider`, `.chat()`, `.constructor()`, `llm-provider.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (3 nodes): `spec-sync-reminder.test.js`, `setupProject()`, `spec-sync-reminder.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `execFileSync()` connect `Community 0` to `Community 27`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._