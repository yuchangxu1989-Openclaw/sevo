# Graph Report - sevo  (2026-06-14)

## Corpus Check
- 402 files · ~251,036 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3228 nodes · 7419 edges · 41 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 470 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]

## God Nodes (most connected - your core abstractions)
1. `appendEvent()` - 78 edges
2. `loadActivePipelines()` - 56 edges
3. `nowIso()` - 50 edges
4. `getStageMapping()` - 38 edges
5. `normalizePlainObject()` - 37 edges
6. `PipelineEngineFacade` - 37 edges
7. `PipelineEngine` - 36 edges
8. `encode()` - 34 edges
9. `PluginAdapter` - 34 edges
10. `makeArtifact()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `buildPromptInjectionPayload()` --calls--> `getWowHarnessFindings()`  [INFERRED]
  prompt-injector.js → bridge.js
- `buildPromptInjectionPayload()` --calls--> `getWowHarnessInjectedFragments()`  [INFERRED]
  prompt-injector.js → bridge.js
- `buildPromptInjectionPayload()` --calls--> `checkExpiredTimers()`  [INFERRED]
  prompt-injector.js → index.js
- `buildPromptInjectionPayload()` --calls--> `consumePendingClarifications()`  [INFERRED]
  prompt-injector.js → index.js
- `recordFailure()` --calls--> `updateActivePipelines()`  [INFERRED]
  stage-advance.js → state-manager.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (448): handleDiagnoseCommand(), handleListCommand(), handlePauseCommand(), handleQuickstartCommand(), handleResumeCommand(), handleRetryCommand(), handleSkipCommand(), handleStatusCommand() (+440 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (62): ClarificationManager, formatAdr(), formatResolution(), nextAdrSequence(), slugify(), writeResolutionArtifacts(), ContractReviewGate, deriveConclusion() (+54 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (48): createSpecReviewGateRules(), FileExistsRule, MinCoverageRule, TestPassRule, TypeCheckRule, createSpecReviewGateEngine(), registerSpecReviewGateRules(), evaluate() (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (133): renderAdvancePromptTemplate(), buildAdvancePrompt(), fieldList(), getStageContract(), lineItems(), list(), normalizeAdvisories(), scalar() (+125 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (59): buildConstraintsSection(), buildInstanceContext(), buildSpecReadInstruction(), buildStageStandardPrompt(), buildTriggerStagePrompt(), inferProjectSlugFromPipelineId(), loadInstanceForPrompt(), resolveManagedProjectSlug() (+51 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (95): activePipelinesPath(), drainPendingAdvances(), enqueuePendingAdvanceFile(), ensureDir(), pendingAdvancesPath(), pipelinesLockPath(), readJson(), reconcileCliCreatedPipelines() (+87 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (37): CodeMapGenerator, buildCliRuntimeChecks(), buildCoreCommandsCheck(), buildDemoProjectCommand(), buildHelpOutputCommand(), buildInitExecutableCommand(), buildPackInstallImportCommand(), defaultRuntimeChecksForType() (+29 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (12): OkrPeriodicChecker, readDriveConfig(), PdcaAutoDriver, PostReleaseAutoScanner, ProactiveDriveEngine, SpecGapDetector, StageTransitionTrigger, EventLedger (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (60): buildStageHandlers(), ComplianceRouter, labelToTaskScope(), parseTaskScopeFromLLM(), classifyByEmbedding(), classifyMultiLabel(), cosineSimilarity(), embedText() (+52 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (49): buildContract(), contractHandler(), contractReviewGateHandler(), computeNextBump(), deployHandler(), parseVersion(), endgameScanHandler(), implementHandler() (+41 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (36): OpenClawAdapter, PipelineInterceptor, ensureDir(), logAudit(), logPath(), resolveLogPath(), decide(), deterministicCheck() (+28 more)

### Community 11 - "Community 11"
Cohesion: 0.04
Nodes (66): GET(), activeRegistry(), allCockpitPipelines(), allEvents(), cockpitBlocker(), cockpitLifecycleStatus(), cockpitPipelineSummary(), cockpitTimeline() (+58 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (62): createProgram(), defaultProjectSlug(), ensureWorkspaceStore(), getVersion(), goalFor(), loadRuntime(), print(), projectRoot() (+54 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (51): collectPublicApiNames(), collectTsFiles(), configExternalizationChecker(), consoleLogScanner(), documentationQualityChecker(), errorHandlingCoverageChecker(), isPublicEntrypoint(), runCommercializationScan() (+43 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (47): extractLabelCandidate(), findSevoLabelFromSpawnParams(), getCompletionSevoLabel(), lookupLabelFromTaskBoard(), decode(), isSevoLabel(), extractLabelCandidate(), findSevoLabelFromSpawnParams() (+39 more)

### Community 15 - "Community 15"
Cohesion: 0.05
Nodes (15): inferVersionBump(), parseSemver(), StandaloneAdapter, formatMarkdown(), isLarkCliAvailable(), OpenClawNotificationAdapter, sendViaLarkCli(), formatStdout() (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (3): PipelineEngineFacade, CustomStageRegistry, SevoSDK

### Community 17 - "Community 17"
Cohesion: 0.06
Nodes (42): ensureACInjection(), contractMethodology(), contractReviewGateMethodology(), getUserJourneyTemplate(), implementMethodology(), reviewMethodology(), smokeTestMethodology(), specMethodology() (+34 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (35): getEvaluatorsDir(), loadEvaluatorRegistry(), runEvaluators(), runSingleEvaluator(), determineConclusion(), evaluateHybridGate(), evaluatorResultsToItems(), generateEvaluatorSummary() (+27 more)

### Community 19 - "Community 19"
Cohesion: 0.1
Nodes (41): briefFinding(), buildDimensionSystemPrompt(), buildEvidencePayload(), collectProjectEvidence(), computeDelta(), countSeverities(), evaluateDimension(), fileMtime() (+33 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (14): AmbiguityDetector, createDefaultRules(), buildSystemPrompt(), buildUserPrompt(), LlmSemanticAmbiguityDetector, parseResponse(), ContractStageScanRule, createStageScanRules() (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (8): checkDeploymentView(), createReviewFixLoop(), ReviewFixLoop, severityToPriority(), deriveConclusion(), normalizeRoots(), ReviewStage, toFixRequirement()

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (14): buildCallCommand(), buildImportCommand(), defaultCleanInstallL2Checks(), defaultCleanInstallL3Checks(), hasPackageJson(), inferProjectType(), loadCleanInstallConfig(), mergeCleanInstallChecks() (+6 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (8): useCockpitPipelineDetail(), useCockpitPipelines(), useCockpitProjectDetail(), useCockpitProjects(), formatDateTime(), formatRelative(), lifecycleStatusClass(), cn()

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (4): buildBootstrapInjection(), parseArgs(), printHelp(), runBootstrapInjection()

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (11): ClarificationCoordinator, resolveStageAttempt(), summarizeContext(), ContextInjector, extractAcceptanceCriteria(), extractSection(), extractSectionsMatching(), listFiles() (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (5): assessGoalAlignment(), SpecStage, makeRequest(), makeTask(), MemoryClarificationAdapter

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (5): RoleRegistry, RoleStageValidator, RoleDispatchBlockedError, RoleTaskMatcher, validateDispatchMatrix()

### Community 28 - "Community 28"
Cohesion: 0.23
Nodes (25): checkDistExists(), getAdapter(), getCacheTtlMs(), getClarificationCoordinator(), getConfig(), getDataPath(), getFileMtime(), getLedgerEngine() (+17 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (13): allRequiredStagesPassed(), collectArtifacts(), collectClarificationRefs(), collectStageRecords(), generateVersion(), LedgerEngine, loadPipelineState(), scopeHash() (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.21
Nodes (5): DispatchGuardAdapter, injectGovernance(), printGovernanceStatus(), selectAdapter(), StandaloneGuardAdapter

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (4): buildDependencyGraph(), computeDagMetrics(), sanitizeDagNodes(), TaskDagScheduler

### Community 32 - "Community 32"
Cohesion: 0.19
Nodes (4): DeployStage, resolvePublishScript(), makeCandidates(), makeInput()

### Community 33 - "Community 33"
Cohesion: 0.23
Nodes (7): addSession(), hasSession(), removeSession(), POST(), safeCompare(), POST(), GET()

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (1): FakeClarificationAdapter

### Community 36 - "Community 36"
Cohesion: 0.6
Nodes (5): embedBatch(), embedOne(), getEmbeddingEndpoint(), main(), seedFile()

### Community 38 - "Community 38"
Cohesion: 0.7
Nodes (3): checkSevoExemption(), matchesAny(), startsWithAny()

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (1): LLMProvider

### Community 41 - "Community 41"
Cohesion: 0.83
Nodes (3): embedBatch(), main(), readEmbeddingConfig()

### Community 45 - "Community 45"
Cohesion: 0.83
Nodes (3): clearPending(), g(), pendingFor()

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (1): setupProject()

## Knowledge Gaps
- **Thin community `Community 34`** (9 nodes): `clarification-coordinator.test.ts`, `FakeClarificationAdapter`, `.emitResponse()`, `.emitTimeout()`, `.onClarificationResponse()`, `.onClarificationTimeout()`, `.requestClarification()`, `makeArtifact()`, `makeStageRecord()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (4 nodes): `LLMProvider`, `.chat()`, `.constructor()`, `llm-provider.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (3 nodes): `spec-sync-reminder.test.js`, `setupProject()`, `spec-sync-reminder.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `execFileSync()` connect `Community 0` to `Community 32`?**
  _High betweenness centrality (0.319) - this node is a cross-community bridge._
- **Why does `getStageMapping()` connect `Community 0` to `Community 17`, `Community 3`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `getStageMapping()` (e.g. with `buildPromptInjectionPayload()` and `queueFirstActiveStage()`) actually correct?**
  _`getStageMapping()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 31 inferred relationships involving `normalizePlainObject()` (e.g. with `resolveAgent()` and `getConfig()`) actually correct?**
  _`normalizePlainObject()` has 31 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._