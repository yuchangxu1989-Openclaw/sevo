/**
 * SEVO — public API surface.
 *
 * Re-exports all module APIs so consumers can:
 *   import { Sevo, PipelineEngine, GateEngine, LedgerEngine, ... } from '@self-evolving-harness/sevo';
 */

// ── Facade (top-level entry) ────────────────────────────────────
export { Sevo } from './sevo.js';
export { mergeConfig, validateConfig } from './config.js';
export type { SevoConfig, GateRuleConfig, NotificationConfig, ActionLevelConfig, ActionLevel, EvaluatorRegistryConfig } from './config.js';
export { DEFAULT_ACTION_LEVELS } from './config.js';

// ── Constants ───────────────────────────────────────────────────
export {
  STAGE_IDS,
  ALL_STAGES,
  L2_THRESHOLDS,
  L0_THRESHOLDS,
  CLARIFICATION_SCANNABLE_STAGES,
  BLOCK_REASONS,
  PARALLEL_FORK_AFTER_SPEC_REVIEW as PARALLEL_FORK_STAGES,
  REVIEW_FIX_LOOP,
  DEFAULT_STAGES,
} from './constants.js';

// ── Orchestrator (legacy entry) ─────────────────────────────────
export { SevoOrchestrator } from './orchestrator.js';

// ── Types ───────────────────────────────────────────────────────
export type {
  StageId,
  StageStatus,
  GateConclusion,
  TaskLevel,
  TriggerRule,
  TaskScope,
  PipelineTask,
  RoutingResult,
  ArtifactRef,
  ProjectConfig,
  StageRecord,
  StageResult,
  StageTransition,
  PipelineState,
  PipelineEvent,
  ReviewBundle,
  GateVerdict,
  RuleResult,
  RuleVerdict,
  LedgerEntry,
  LedgerFilter,
  RouterError,
  Result,
  PipelineInstanceStatus,
  DirectoryInitResult,
  PipelineInstance,
  PipelineCreateRequest,
  PipelineCreateError,
  StatusTransition,
} from './types/index.js';

// ── Router ──────────────────────────────────────────────────────
export { route, classifyLevel } from './router/index.js';
export type { ClassificationResult } from './router/index.js';

// ── Pipeline Engine ─────────────────────────────────────────────
export {
  PipelineEngine,
  isValidTransition,
  assertTransition,
  isTerminal,
  canActivate,
  getPrerequisites,
  arePrerequisitesMet,
  getActivatableStages,
  shouldBlockImplement,
  PARALLEL_FORK_AFTER_SPEC_REVIEW,
  createPipelineInstance,
  initProjectDirectory,
  generateInstanceId,
  isValidInstanceId,
  transitionInstanceStatus,
} from './pipeline/index.js';
export type { InstanceStore } from './pipeline/index.js';
export {
  createPipelineFromStage,
  isValidEntryStage,
  isGateStage,
  parseFromLabel,
  parseSevoFromCommand,
  VALID_ENTRY_STAGES,
  GATE_STAGES,
  AUXILIARY_STAGES,
} from './pipeline/index.js';
export type {
  PipelineFromRequest,
  PipelineFromOptions,
  PipelineFromError,
  PipelineFromErrorCode,
} from './pipeline/index.js';

// ── Gate Engine ─────────────────────────────────────────────────
export {
  evaluate,
  GateEngine,
  aggregate,
  aggregateRuleResults,
  getGateConfig,
  getRequiredRoles,
  findMissingRoles,
  FileExistsRule,
  TypeCheckRule,
  TestPassRule,
  MinCoverageRule,
  SpecSectionsRule,
  FrValidationCriteriaRule,
  FrTraceabilityRule,
  createSpecReviewGateRules,
} from './gate/index.js';
export type {
  AggregatedVerdict,
  ReviewRole,
  DimensionPriority,
  GateConfig,
  ReviewDimension,
  GateRule,
  GateRuleConfig as GateEngineRuleConfig,
} from './gate/index.js';

// ── Ledger Engine ───────────────────────────────────────────────
export {
  LedgerEngine,
  collectArtifacts,
  collectStageRecords,
  allRequiredStagesPassed,
  ENDGAME_ARTIFACT_TYPES,
  inferEndgameArtifactType,
} from './ledger/index.js';

// ── Adapter Layer ───────────────────────────────────────────────
export {
  OpenClawAdapter,
  OPENCLAW_GATE_RESULT_EVENT,
  StandaloneAdapter,
  buildStageStandardPrompt,
  buildTriggerStagePrompt,
} from './adapter/index.js';
export type {
  SevoHostAdapter,
  PublishAdapter,
  PublishResult,
  ReadmeUpdateRequest,
  OpenClawAdapterOptions,
  SpawnLike,
  GateResultEvent,
  DispatchRecord,
  SpawnTaskOptions,
  ParallelTaskDescriptor,
} from './adapter/index.js';

// ── Task Orchestrator ───────────────────────────────────────────
export { TaskOrchestrator } from './orchestrator/task-orchestrator.js';
export { PipelineRun } from './orchestrator/pipeline-run.js';
export { OrchestratorEmitter } from './orchestrator/orchestrator-events.js';
export type { PipelineStatus, TaskPayload } from './orchestrator/pipeline-run.js';
export type {
  PipelineStartedEvent,
  StageEnteredEvent,
  GateEvaluatedEvent,
  StageAdvancedEvent,
  PipelineCompletedEvent,
  PipelineFailedEvent,
  OrchestratorEventMap,
} from './orchestrator/orchestrator-events.js';

// ── Context Injection ───────────────────────────────────────────
export { ContextInjector, PIPELINE_STAGES } from './context-injection/index.js';
export type { PipelineStage } from './context-injection/index.js';

// ── Clarification ──────────────────────────────────────────────
export {
  ClarificationCoordinator,
  ClarificationType,
  BlockingLevel,
  Status as ClarificationStatus,
  ResolutionSink,
} from './clarification/index.js';
export type {
  HostClarificationAdapter,
  ClarificationCoordinatorOptions,
  ClarificationRecord,
  ClarificationTargetType,
  ClarificationFinding,
  ClarificationHandle,
  ClarificationResponse,
  ClarificationStageTransition,
  ClarificationTarget,
  ClarificationPayload,
  ClarificationScanRule,
} from './clarification/index.js';

// ── Knowledge Injection (arc42 §5.4) ────────────────────────────
export { RoleKnowledgeInjector } from './knowledge/index.js';
export {
  loadStageStandards,
  getStageStandard,
  formatStageStandardForPrompt,
} from './engine/index.js';
export type {
  LoadStageStandardsOptions,
  StageStandard,
  StageStandards,
} from './engine/index.js';
export type { RoleKnowledgeInjectorOptions, RoleCategory } from './knowledge/index.js';

// ── Role Registry (FR-22) ───────────────────────────────────────
export { RoleRegistry, RoleStageValidator } from './role-registry/index.js';
export type {
  PipelineRole,
  RoleRegistryConfig,
  RoleMismatchEvent,
  RoleValidationResult,
  RoleStageValidatorConfig,
} from './role-registry/index.js';
export type { RoleAssignmentConfig } from './config.js';

// ── Notification (FR-19) ────────────────────────────────────────
export {
  OpenClawNotificationAdapter,
  StandaloneNotificationAdapter,
} from './notification/index.js';
export type {
  PipelineNotification,
  PipelineNotificationEvent,
  NotificationAdapter,
  OpenClawNotificationOptions,
} from './notification/index.js';

// ── Stage Runner (arc42 §5.3) ───────────────────────────────────
export { StageRunner } from './stage-runner/index.js';
export type { StageContext, StageRunnerOptions, GateEvaluationResult } from './stage-runner/index.js';

// ── Plugin Adapter (arc42 §5.7) ─────────────────────────────────
export { PluginAdapter, parseSevoTag, createSevoTag } from './plugin-adapter/index.js';
export {
  appendAdvanceDecision,
  pipelineEventsPath,
  evaluateStageGate,
  evaluateStageGateByLoader,
  advanceOnComplete,
  resolveOutcome,
  withTimeout,
} from './engine/index.js';
export { registerPipelineHooks } from './init/index.js';
export type {
  PluginAdapterOptions,
  HostBridge,
  HookName,
  HookHandler,
  HookContext,
  HookResult,
  StageCompletePayload,
} from './plugin-adapter/index.js';
export type {
  AdvanceDecision,
  StageGateRequest,
  StageGateResult,
  AdvanceOnCompleteOptions,
  AdvanceOnCompleteResult,
  StageCompletionEvent,
} from './engine/index.js';
export type {
  RegisterHooksOptions,
  RegisterHooksResult,
} from './init/index.js';

// ── LLM Provider ────────────────────────────────────────────────
export { LLMProvider } from './llm/index.js';
export type { LLMProviderConfig, ChatMessage } from './llm/index.js';

// ── FR-29 Tiered Endgame Gap Scan ───────────────────────────────
export {
  L1FileScanner,
  ScanMappingGenerator,
  ScanMappingLoader,
  LlmSemanticVerifier,
  L2ACSemanticScanner,
  L3RuntimeVerifier,
  TieredScanOrchestrator,
  createTieredScanReport,
  summarizeTieredScan,
  writeTieredScanReport,
} from './scan/index.js';
export type {
  L1ScanInput,
  L1ScanReport,
  ScanMappingConfig,
  ScanMappingEntry,
  LlmSemanticVerificationInput,
  LlmSemanticVerificationResult,
  L2ScanInput,
  L2ScanReport,
  L3RuntimeVerifierInput,
  L3ScanReport,
  TieredScanInput,
  TieredScanReport,
  TieredScanSummary,
} from './scan/index.js';

// ── Compliance Router (arc42 §5.5) ──────────────────────────────
export { ComplianceRouter } from './compliance/index.js';
export type {
  ComplianceMode,
  ComplianceTaskContext,
  ComplianceAction,
  ComplianceResult,
  ComplianceRouterConfig,
} from './compliance/index.js';

// ── Governance (FR-28, FR-35) ───────────────────────────────────
export {
  DispatchGuardAdapter,
  StandaloneGuardAdapter,
  SEVO_GOVERNANCE_RULES,
  injectGovernance,
  printGovernanceStatus,
  selectAdapter,
  PipelineInterceptor,
  evaluateStrangerReadyGate,
  shouldBlockPublish,
  formatGateResult,
} from './governance/index.js';
export type {
  GovernanceAdapter,
  GovernanceDetection,
  GovernanceExemption,
  GovernanceInjectionResult,
  GovernanceRule,
  SevoGuardConfig,
  GovernanceInjectOptions,
  RegisteredProject,
  SpawnInterceptContext,
  InterceptAction,
  InterceptResult,
  PipelineInstanceStore,
  InterceptAuditEvent,
  PipelineInterceptorConfig,
  StrangerReadyGateConfig,
  StrangerReadyGateInput,
  StrangerReadyGateResult,
  ExemptionResult,
} from './governance/index.js';
export { checkSevoExemption } from './governance/index.js';

// ── Progressive Disclosure L2/L3 (FR-15) ────────────────────────
export { CustomStageRegistry, SevoSDK } from './progressive-disclosure/index.js';
export type {
  CustomStageDefinition,
  CustomStageRegistrationResult,
  CustomGateRule,
  InsertPosition,
  CreatePipelineOptions,
  CompleteStageOptions,
  PipelineStatusInfo,
  SevoSDKOptions,
} from './progressive-disclosure/index.js';

// ── Stage implementations ───────────────────────────────────────
export { SpecStage } from './stages/spec-stage.js';
export { EndgameDeliveryStage } from './stages/endgame-delivery-stage.js';
export { CleanInstallVerificationStage } from './stages/clean-install-verification-stage.js';
export type {
  EndgameDeliveryInput,
  EndgameDeliveryResult,
  ReadmeSyncCheckResult,
  VersionBumpDecision,
  GapScanSummary,
} from './stages/endgame-delivery-types.js';
export type {
  CleanInstallVerificationInput,
  CleanInstallVerificationOutput,
  CleanInstallVerificationReport,
  CleanInstallCheck,
  CleanInstallFixTask,
} from './stages/clean-install-verification-types.js';
export type {
  Stage,
  AcceptanceCriteria,
  FunctionalRequirement,
  RequirementAnalysisRequest,
  RequirementAnalysisResponse,
  SpecInput,
  SpecOutput,
  SpecClarification,
  SpecStageOptions,
  SpecClarificationDraft,
  LedgerLesson,
} from './stages/spec-types.js';

// ── OKR Goal Stage ──────────────────────────────────────────────
export { OkrGoalStage } from './stages/okr-goal-stage.js';
export type {
  OkrGoalInput,
  OkrGoalOutput,
  OkrGoalMetadata,
  OkrDecompositionRequest,
  OkrDecompositionResponse,
  OkrGoalStageOptions,
} from './stages/okr-goal-types.js';

// ── SMART Decomposition Stage ───────────────────────────────────
export { SmartDecompositionStage } from './stages/smart-decomposition-stage.js';
export type {
  SmartTask,
  SmartDecompositionInput,
  SmartDecompositionOutput,
  SmartDecompositionMetadata,
  SmartDecomposeRequest,
  SmartDecomposeResponse,
  SmartDecompositionStageOptions,
} from './stages/smart-decomposition-types.js';

// ── PDCA Gap Analysis Stage ─────────────────────────────────────
export { PdcaGapAnalysisStage } from './stages/pdca-gap-analysis-stage.js';
export { PdcaCheckRunner, checkLogRecent, checkSqlite, checkNpmVersion, checkFileExists, checkHookRegistered } from './stages/pdca-check-stage.js';
export type {
  KrCoverage,
  PdcaGap,
  PdcaGapReport,
  PdcaGapAnalysisInput,
  PdcaGapAnalysisOutput,
  PdcaGapAnalysisMetadata,
  PdcaAnalyzeRequest,
  PdcaAnalyzeResponse,
  PdcaGapAnalysisStageOptions,
} from './stages/pdca-gap-analysis-types.js';

// ── PDCA Check (FR-20) ─────────────────────────────────────────
export type {
  PdcaLivenessConfig,
  PdcaLivenessProject,
  PdcaLivenessGoal,
  PdcaProbeResult,
  PdcaCheckReport,
  PdcaCheckOutput,
  PdcaFailureTask,
  PdcaTaskAdapter,
  PdcaCheckRunnerOptions,
  PdcaSeverity,
  LlmProbeContext,
  LlmProbeResult,
} from './stages/pdca-check-types.js';

// ── Commercialization Gate (FR-08a) ────────────────────────────
export { CommercializationGate, PublishGeneralizationGate } from './stages/commercialization-gate.js';
export { ACCoverageGate } from './stages/ac-coverage-gate.js';
export { SpecReviewGate, ContractReviewGate, ImplementationReviewGate } from './gates/index.js';
export type {
  GateResult,
  GateSeverity,
  ReviewFinding,
  ReviewRule,
  ReviewPerspective,
  PerspectiveReview,
  ContractFinding,
  FixRequirement,
  ContractReviewBundle,
  ContractReviewGateInput,
  ContractReviewGateOutput,
  ContractReviewRule,
  ImplementationReviewInput,
  ACCoverageResult,
  ImplementationReviewGateOutput,
} from './gates/index.js';
export type {
  CommercializationCheckLayer,
  CommercializationCheckItem,
  CommercializationCheckStatus,
  CommercializationGateResult,
  CommercializationGateSummary,
  CommercializationGateInput,
  CommercializationGateOutput,
  CommercializationGateMetadata,
  CommercializationGateActivationConfig,
  PublishCheckId,
  PublishCheckResult,
  PublishGateConclusion,
  PublishGateResult,
  PublishGeneralizationGateInput,
  PublishGeneralizationGateOutput,
  PublishGateMetadata,
} from './stages/commercialization-gate-types.js';

// ── Evaluators (FR-23, FR-24, FR-25) ────────────────────────────
export {
  runSingleEvaluator,
  runEvaluators,
  loadEvaluatorRegistry,
  getEvaluatorsDir,
  initEvaluatorsDirectory,
  generateAllowedWritePaths,
  generateIsolationPromptInjection,
  setupWorkspaceIsolation,
  isWriteAllowed,
  evaluateHybridGate,
  generateEvaluatorSummary,
  gateVerdictToLlmResult,
} from './evaluators/index.js';
export type {
  EvaluatorConfig,
  EvaluatorRegistry,
  EvaluatorInput,
  EvaluatorDetailItem,
  EvaluatorResult,
  EvaluatorExecution,
  EvaluatorResultSet,
  IsolationLayerStatus,
  IsolationStatus,
  AllowedWritePathsConfig,
  LlmEvaluationResult,
  HybridGateVerdict,
  HybridVerdictItem,
  VerdictSource,
  HybridGateOptions,
} from './evaluators/index.js';

// ── LLM Intercept Gate ──────────────────────────────────────────
export { handleSpawnTask, initialize as initializeLlmIntercept, scanProject } from './gates/llm-intercept/index.js';
export { decide as llmInterceptDecide, labelBypass, deterministicCheck } from './gates/llm-intercept/decision-engine.js';
export type {
  InterceptAuditEntry,
  LlmJudgment,
  DecisionResult as LlmInterceptDecisionResult,
  SpawnTaskRequest,
  SevoConfig as LlmInterceptSevoConfig,
} from './gates/llm-intercept/types.js';
