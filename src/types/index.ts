/**
 * SEVO shared type definitions.
 * Consumed by Router, Pipeline Engine, Gate Engine, Ledger Engine.
 */

// ── Stage & Status ──────────────────────────────────────────────

/** All pipeline stages including gates and parallel activities. */
export type StageId =
  | 'spec'
  | 'spec-review-gate'
  | 'test-case-authoring'
  | 'ux-acceptance-authoring'
  | 'commercial-acceptance-authoring'
  | 'ux-interaction-design'
  | 'architecture-design'
  | 'contract'
  | 'contract-review-gate'
  | 'implement'
  | 'review'
  | 'smoke-test'
  | 'ux-acceptance'
  | 'pm-commercial-review'
  | 'regression'
  | 'publish-generalization-gate'
  | 'deploy'
  | 'verify'
  | 'readme'
  | 'post-release-validation'
  | 'clean-install-verification'
  | 'ledger';

/** Stage lifecycle. Legacy blocked states are read-compatible; new flows use fix_pending/advisory states. */
export type StageStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'clarification-blocked'
  | 'fix_pending'
  | 'rolled_back'
  | 'passed'
  | 'failed'
  | 'skipped';

/** Gate conclusion (spec §FR-02, FR-04). */
export type GateConclusion = 'passed' | 'conditional' | 'rejected';

// ── Task & Routing ──────────────────────────────────────────────

/** Routing level (spec §3.2). */
export type TaskLevel = 'L0' | 'L1' | 'L2+';

/** Trigger rules that determine SEVO entry and level (spec §3.1). */
export type TriggerRule =
  | 'new-module'
  | 'cross-domain'
  | 'large-change'
  | 'data-model-change'
  | 'governance-change'
  | 'release-target-change'
  | 'user-explicit';

/** Scope metadata used by the Router for level classification. */
export interface TaskScope {
  estimatedFiles?: number;
  estimatedLines?: number;
  affectedDomains?: string[];
  isNewModule?: boolean;
  hasDataModelChange?: boolean;
  hasGovernanceChange?: boolean;
  hasReleaseTargetChange?: boolean;
  userExplicitFullPipeline?: boolean;
  /** AC-2.3: explicit user opt-in to L0 fast-path. Default false → empty scope falls to L1. */
  userExplicitL0?: boolean;
  /** AC-3.x: explicit user level override. When set, classifier returns it directly. */
  userExplicitLevel?: TaskLevel;
}

/** A task entering the SEVO pipeline (spec §6.1). */
export interface PipelineTask {
  taskId: string;
  title: string;
  description?: string;
  scope: TaskScope;
}

/** Router output (spec §3.3, arc42 §5.1). */
export interface RoutingResult {
  taskId: string;
  level: TaskLevel;
  requiredStages: StageId[];
  matchedRules: TriggerRule[];
  needsUxDesign: boolean;
  uxDesignReason: string;
  needsArchDesign: boolean;
  archDesignReason: string;
}

// ── Artifacts (shared across modules) ───────────────────────────

export interface ArtifactRef {
  id: string;
  type: string;
  path: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/** Host/runtime project configuration consumed by adapters. */
export interface ProjectConfig {
  workspaceRoot: string;
  projectRoot: string;
  artifactRoots?: string[];
  defaultAgentId?: string;
  stageAgents?: Partial<Record<StageId, string>>;
  /** Whether the project has a UI. When false, experience/UX review is omitted. Default: true. */
  hasUI?: boolean;
  /** FR-22: role assignment used by adapters before programmatic task dispatch. */
  roleAssignment?: import('../config.js').RoleAssignmentConfig;
  /** AC-22.10: strict role mismatch policy for adapters. */
  strictRoleMatching?: boolean;
  /** FR-22: dispatch audit path for role mismatch events. */
  dispatchAuditPath?: string;
  notifications?: {
    feishuEnabled?: boolean;
    recipientId?: string;
  };
  /** FR-4: when true, architecture-design must not be skipped at any level. Default false. */
  forceArchDesignAllLevels?: boolean;
}

// ── Clarification Summary (FR-11, arc42 §6.8) ──────────────────

export interface ClarificationSummary {
  open: number;
  resolved: number;
  settled: number;
  blockingOpen: number;
}

// ── Stage Records (for Pipeline Engine) ─────────────────────────

export interface StageRecord {
  stageId: StageId;
  status: StageStatus;
  attempt?: number;
  startedAt?: string;
  completedAt?: string;
  artifacts: ArtifactRef[];
  blockReason?: string;
  failureReason?: string;
  /** AC-13.3: Current fix attempt count when in fix_pending state. */
  fixAttempts?: number;
  /** AC-13.4: Optional rollback target stage (overrides default predecessor logic). */
  rollbackTarget?: StageId;
  clarificationSummary?: ClarificationSummary;
  clarificationRefs?: ArtifactRef[];
}

// ── Pipeline Engine types ────────────────────────────────────────

/** Input to Pipeline Engine advance() — result of completing a stage. */
export interface StageResult {
  stageId: StageId;
  outcome: 'passed' | 'failed';
  artifacts: ArtifactRef[];
  failureReason?: string;
}

/** Output of Pipeline Engine advance() — describes the transition. */
export interface StageTransition {
  pipelineId: string;
  fromStage: StageId;
  toStage: StageId;
  status: StageStatus;
  artifacts: ArtifactRef[];
  nextTriggered?: boolean;
}

/** Full pipeline state persisted to state.json (§8.5 single-writer). */
export interface PipelineState {
  pipelineId: string;
  taskId: string;
  level: TaskLevel;
  requiredStages: StageId[];
  stages: Record<StageId, StageRecord>;
  currentStage: StageId | null;
  createdAt: string;
  updatedAt: string;
  /** AC-13.4: Pipeline-level rollback count (incremented on each rollback). */
  rollbackCount?: number;
  /** AC-13.4: Pipeline-level status. Legacy 'blocked' is read-only compatibility. */
  pipelineStatus?: 'active' | 'repair-required' | 'blocked';
  /** P0-3: Latest automatic review→verify tiered scan summary. */
  tieredScan?: {
    status: 'passed' | 'failed' | 'error';
    reportPath?: string;
    summary?: import('../scan/types.js').TieredScanSummary;
    error?: string;
    completedAt: string;
  };
}

/** Event appended to events.jsonl (§8.2, append-only). */
export interface PipelineEvent {
  timestamp: string;
  pipelineId: string;
  stage: StageId;
  eventType:
    | 'pipeline_created'
    | 'pipeline_completed'
    | 'stage_activated'
    | 'stage_completed'
    | 'stage_failed'
    | 'stage_advisory'
    | 'stage_blocked'
    | 'stage_skipped'
    | 'artifact_registered'
    | 'clarification_opened'
    | 'clarification_resolved'
    | 'clarification_settled'
    | 'advance_decision'
    | 'dispatch_role_mismatch'
    | 'fix_attempt'
    | 'fix_loop_exhausted'
    | 'stage_rolled_back'
    | 'tiered_scan_completed'
    | 'tiered_scan_failed';
  payload: Record<string, unknown>;
}

// ── Gate types ──────────────────────────────────────────────────

export interface ReviewBundle {
  reviewer: string;
  role: string;
  conclusion: GateConclusion;
  issues: string[];
}

export interface GateVerdict {
  gateId: string;
  conclusion: GateConclusion;
  blockers: { item: string; owner: string }[];
  reviewBundles: ReviewBundle[];
}

// ── Rule-based Gate types (SPI) ──────────────────────────────────

/** Result of a single GateRule evaluation. */
export interface RuleResult {
  pass: boolean;
  message: string;
  severity: 'blocker' | 'warning';
}

/** Aggregated verdict from rule-based gate evaluation. */
export interface RuleVerdict {
  pass: boolean;
  blockers: string[];
  warnings: string[];
  score: number;
}

// ── Ledger types ────────────────────────────────────────────────

export interface LedgerEntry {
  pipelineId: string;
  version: string;
  createdAt: string;
  scope: string;
  stages: StageRecord[];
  conclusion: 'delivered' | 'aborted';
  evidence: ArtifactRef[];
  clarificationRefs?: ArtifactRef[];
  /** OKR tree snapshot at ledger time (FR-18, AC-18.14). */
  okrTree?: ObjectiveKeyResult[];
  /** KR achievement summary (FR-18, AC-18.14). */
  krAchievement?: Array<{ krId: string; status: string; achievementPct: number }>;
  /** PDCA cycle records (FR-18, AC-18.14). */
  pdcaCycles?: PdcaCycleRecord[];
}

export interface LedgerFilter {
  pipelineId?: string;
  scope?: string;
  conclusion?: 'delivered' | 'aborted';
  since?: string;
  until?: string;
}

// ── Error Handling ──────────────────────────────────────────────

export interface RouterError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export type Result<T, E = RouterError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ── Pipeline Instance (§3.5, FR-12) ─────────────────────────────

/** Pipeline Instance status (spec §3.5, FR-35 AC-35.5). */
export type PipelineInstanceStatus =
  | 'created'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'publish-blocked';

/** Record of a single status transition (AC-3.7). */
export interface StatusTransition {
  from: string;
  to: string;
  timestamp: string;
  trigger?: string;
}

/** Result of project directory initialization (spec §3.6, FR-12 step 5). */
export interface DirectoryInitResult {
  projectRoot: string;
  createdDirs: string[];
  existingDirs: string[];
  createdFiles: string[];
  existingFiles: string[];
  complete: boolean;
}

/** Pipeline Instance — one complete pipeline execution bound to a Project (spec §3.5). */
export interface PipelineInstance {
  instanceId: string;
  projectSlug: string;
  status: PipelineInstanceStatus;
  statusHistory?: StatusTransition[];
  routingResult: RoutingResult;
  directoryStructure: DirectoryInitResult;
  createdAt: string;
  updatedAt: string;
  /** FR-18: Optional end-state goal for OKR-driven pipelines. */
  endStateGoal?: EndStateGoal;
  /** FR-18: OKR tree decomposed from endStateGoal during Spec stage. */
  okrTree?: ObjectiveKeyResult[];
  /** FR-18: PDCA cycle records for goal-driven convergence. */
  pdcaCycles?: PdcaCycleRecord[];
  /** FR-18 AC-18.2: Change log for endStateGoal modifications. */
  goalChangeLog?: GoalChangeEntry[];
}

/** Input for Pipeline Create (FR-12). */
export interface PipelineCreateRequest {
  projectSlug: string;
  task: PipelineTask;
  /** FR-18: Optional end-state goal (AC-18.1). */
  endStateGoal?: EndStateGoal;
}

// ── FR-18: Goal-Driven PDCA types ───────────────────────────────

/** Locked end-state goal for a pipeline (FR-18, AC-18.1). */
export interface EndStateGoal {
  description: string;
  lockedAt: string;
}

/** Change log entry for endStateGoal modifications (FR-18, AC-18.2). */
export interface GoalChangeEntry {
  changedAt: string;
  previousDescription: string;
  newDescription: string;
  reason: string;
}

/** Single key result within an OKR tree (FR-18, AC-18.3). */
export interface KeyResult {
  krId: string;
  description: string;
  measure: string;
  threshold?: string;
  status: 'not-started' | 'in-progress' | 'achieved' | 'blocked';
}

/** Objective + Key Results node (FR-18, AC-18.3). */
export interface ObjectiveKeyResult {
  objectiveId: string;
  description: string;
  keyResults: KeyResult[];
}

/** Single PDCA cycle record (FR-18, AC-18.11). */
export interface PdcaCycleRecord {
  cycle: number;
  triggeredBy: string[];
  newTasks: string[];
  result: 'converged' | 'gap-remaining' | 'escalated';
}

/** Goal alignment assessment used in gate evaluations (FR-18, AC-18.7). */
export type GoalAlignment = 'aligned' | 'drifting' | 'misaligned';

/** Error from Pipeline Create (FR-12). */
export interface PipelineCreateError {
  code: 'INVALID_PROJECT_SLUG' | 'ACTIVE_INSTANCE_EXISTS' | 'ROUTING_FAILED';
  message: string;
  activeInstanceId?: string;
}
