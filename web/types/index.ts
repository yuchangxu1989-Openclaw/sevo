/**
 * SEVO Web Layer — shared type definitions.
 * Mirrors engine types for the HTTP boundary; keeps Web Layer decoupled from engine internals.
 */

// ── Stage identifiers (arc42 §5.3) ─────────────────────────────

import { resolveStageLabel } from '@/lib/stage-labels';

// StageId is an open string: the authoritative stage queue comes from real
// pipeline state, never a fixed Web-side enumeration (AC-45.3).
export type StageId = string;

export type UserMacroStage = 'specify' | 'plan' | 'implement' | 'review';

export const USER_MACRO_STAGE_LABELS: Record<UserMacroStage, string> = {
  specify: '需求澄清',
  plan: '方案规划',
  implement: '执行落地',
  review: '质量复核',
} as const;

export const PIPELINE_STATUS_LABELS: Record<PipelineInstanceStatus, string> = {
  created: '已创建',
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '已失败',
} as const;

export const GATE_CONCLUSION_LABELS: Record<GateConclusion, string> = {
  passed: '通过',
  conditional: '有条件通过',
  rejected: '拒绝',
} as const;

export const LEDGER_ACTION_LABELS: Record<LedgerActionType, string> = {
  'stage-passed': '阶段通过',
  'stage-failed': '阶段失败',
  'gate-approved': '门禁通过',
  'gate-rejected': '门禁拒绝',
  delivered: '已交付',
  aborted: '已中止',
} as const;

export const LEDGER_OUTCOME_LABELS: Record<LedgerEntryView['outcome'], string> = {
  delivered: '已交付',
  aborted: '已中止',
  'in-progress': '进行中',
} as const;

export function getStageLabel(stageId: StageId): string {
  return resolveStageLabel(stageId);
}

export function getMacroStageLabel(stage: UserMacroStage): string {
  return USER_MACRO_STAGE_LABELS[stage];
}

export function getPipelineStatusLabel(status: PipelineInstanceStatus): string {
  return PIPELINE_STATUS_LABELS[status];
}

export function getGateConclusionLabel(conclusion: GateConclusion): string {
  return GATE_CONCLUSION_LABELS[conclusion];
}

export function getLedgerActionLabel(action: LedgerActionType): string {
  return LEDGER_ACTION_LABELS[action];
}

export function getLedgerOutcomeLabel(outcome: LedgerEntryView['outcome']): string {
  return LEDGER_OUTCOME_LABELS[outcome];
}

// ── Status types ────────────────────────────────────────────────

export type StageStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'clarification-blocked'
  | 'passed'
  | 'failed'
  | 'skipped';

export type PipelineInstanceStatus =
  | 'created'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed';

export type GateConclusion = 'passed' | 'conditional' | 'rejected';

export type TaskLevel = 'L0' | 'L1' | 'L2+';

// ── Artifact ────────────────────────────────────────────────────

export interface ArtifactRef {
  artifactId: string;
  path: string;
  type: string;
  createdAt: string;
  checksum?: string;
}

// ── Stage Record ────────────────────────────────────────────────

export interface ClarificationSummary {
  open: number;
  resolved: number;
  settled: number;
  blockingOpen: number;
}

export interface StageRecord {
  stageId: StageId;
  status: StageStatus;
  attempt: number;
  executorId?: string;
  inputArtifacts: ArtifactRef[];
  outputArtifacts: ArtifactRef[];
  clarificationSummary?: ClarificationSummary;
  blockers: string[];
  startedAt?: string;
  completedAt?: string;
  skipReason?: string;
}

// ── Routing ─────────────────────────────────────────────────────

export interface RoutingResult {
  taskId: string;
  level: TaskLevel;
  requiredStages: StageId[];
  skippedStages: { stage: StageId; reason: string }[];
}

// ── Gate ─────────────────────────────────────────────────────────

export interface ReviewBundle {
  gateId: string;
  reviewer: { agentId: string; stageId: StageId };
  conclusion: GateConclusion;
  items: { issue: string; severity: 'blocker' | 'major' | 'minor'; owner?: string }[];
  evidence: ArtifactRef[];
  createdAt: string;
}

export interface GateVerdict {
  gateId: string;
  conclusion: GateConclusion;
  blockers: { item: string; owner: string }[];
  reviewBundles: ReviewBundle[];
}

// ── Pipeline Instance ───────────────────────────────────────────

export interface PipelineInstance {
  instanceId: string;
  projectSlug: string;
  status: PipelineInstanceStatus;
  routingResult: RoutingResult;
  currentStage: StageId;
  stages: StageRecord[];
  createdAt: string;
  updatedAt: string;
}

// ── Notification ────────────────────────────────────────────────

export type NotificationChannel = 'web' | 'im';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface NotificationRecord {
  notificationId: string;
  pipelineId: string;
  stageId: StageId;
  severity: NotificationSeverity;
  channel: NotificationChannel;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface QuietHours {
  start: string;   // HH:mm
  end: string;     // HH:mm
  timezone: string; // IANA timezone
}

export interface NotificationPreference {
  preferenceId: string;
  userId: string;
  channels: NotificationChannel[];
  severityFilter: NotificationSeverity[];
  quietHours?: QuietHours;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── API request/response types ──────────────────────────────────

/** Unified error envelope (arc42 §8.1.1). */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
  retryable?: boolean;
}

/** Command request base — all write endpoints require these fields. */
export interface CommandRequest {
  actorId: string;
  requestId: string;
  expectedVersion?: number;
}

/** Paginated list response wrapper. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Dashboard ───────────────────────────────────────────────────

export type DashboardDataSourceType = 'runtime' | 'derived';

export interface DashboardDataSourceMeta {
  type: DashboardDataSourceType;
  description: string;
}

export interface DashboardMetricTrend {
  percent: number;
  direction: 'up' | 'down' | 'flat';
  current: number;
  previous: number;
}

export interface MacroStageDistribution {
  specify: number;
  plan: number;
  implement: number;
  review: number;
}

export interface DashboardSummary {
  totalFrs: number;
  macroStageDistribution: MacroStageDistribution;
  healthScore: number;
  activeFrs: number;
  blockedFrs: number;
  completedFrs: number;
  failedFrs: number;
  stageCounts: DashboardStageCount[];
  dataSources: {
    systemCall: DashboardDataSourceMeta;
    pipelineStages: DashboardDataSourceMeta;
    riskQueue: DashboardDataSourceMeta;
    runtimeMetrics: DashboardDataSourceMeta;
  };
  trends: {
    totalFrs: DashboardMetricTrend;
    healthScore: DashboardMetricTrend;
    activeFrs: DashboardMetricTrend;
    blockedFrs: DashboardMetricTrend;
  };
}

// ── FR views ────────────────────────────────────────────────────

export interface FrSummaryView {
  frId: string;
  frCode: string;
  title: string;
  currentStage: StageId;
  currentMacroStage: UserMacroStage;
  status: PipelineInstanceStatus;
  gateStatus?: GateConclusion;
  healthStatus: 'healthy' | 'at-risk' | 'blocked' | 'failed';
  routingResult: RoutingResult;
  updatedAt: string;
}

export interface StageTimelineEntry {
  stageId: StageId;
  macroStage: UserMacroStage;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  attempt: number;
  artifacts: ArtifactRef[];
}

export interface FrDetailView {
  frId: string;
  frCode: string;
  title: string;
  description?: string;
  currentStage: StageId;
  currentMacroStage: UserMacroStage;
  status: PipelineInstanceStatus;
  routingResult: RoutingResult;
  stageTimeline: StageTimelineEntry[];
  blockers: string[];
  artifacts: ArtifactRef[];
  createdAt: string;
  updatedAt: string;
}

// ── Clarification ───────────────────────────────────────────────

export type ClarificationBlockingLevel = 'blocking' | 'non-blocking';
export type BlockingLevel = ClarificationBlockingLevel;
export type ClarificationStatus = 'open' | 'resolved' | 'settled';

export interface ClarificationResponseEntry {
  responseId: string;
  actorId: string;
  content: string;
  createdAt: string;
}

export interface ClarificationThreadView {
  clarificationId: string;
  frId: string;
  frCode: string;
  stageId: StageId;
  question: string;
  blockingLevel: ClarificationBlockingLevel;
  context: string;
  responses: ClarificationResponseEntry[];
  resolutionStatus: ClarificationStatus;
  createdAt: string;
}

// ── Todo ────────────────────────────────────────────────────────

export type TodoType = 'gate' | 'clarification' | 'failure';
export type TodoUrgency = 'low' | 'medium' | 'high' | 'critical';
export type TodoStatus = 'pending' | 'done';

export interface TodoItemView {
  todoId: string;
  type: TodoType;
  frId: string;
  frCode: string;
  stageId: StageId;
  title: string;
  projectSlug: string;
  urgency: TodoUrgency;
  waitDuration: string;
  summary: string;
  status: TodoStatus;
  createdAt: string;
}

// ── Gate Decision ───────────────────────────────────────────────

export type GateDecisionStatus = 'pending' | 'approved' | 'rejected';

export interface GateDecisionHistory {
  action: 'approved' | 'rejected' | 'request-review';
  actorId: string;
  reason?: string;
  timestamp: string;
}

export interface GateDecisionView {
  gateId: string;
  gateName: string;
  gateType: string;
  stageId: StageId;
  frId: string;
  frCode: string;
  status: GateDecisionStatus;
  reviewBundles: ReviewBundle[];
  blockers: { item: string; owner: string }[];
  decisionHistory: GateDecisionHistory[];
  createdAt: string;
}

// ── Quality ─────────────────────────────────────────────────────

export interface QualityIssue {
  issueId: string;
  severity: 'blocker' | 'major' | 'minor';
  description: string;
  stage: StageId;
  status: 'open' | 'resolved';
}

export interface FrQualityView {
  frId: string;
  frCode: string;
  title: string;
  qualityScore: number;
  testCoverage: number;
  auditStatus: 'pending' | 'passed' | 'failed' | 'in-progress';
  reviewStatus: StageStatus;
  regressionStatus: StageStatus;
  verifyStatus: StageStatus;
  issues: QualityIssue[];
}

// ── FR Matrix ───────────────────────────────────────────────────

export interface StageSnapshot {
  macroStage: UserMacroStage;
  status: StageStatus;
  stageIds: StageId[];
}

export interface FrMatrixRow {
  frId: string;
  frCode: string;
  title: string;
  status: PipelineInstanceStatus;
  stages: Record<UserMacroStage, StageSnapshot>;
}

export interface FrMatrixView {
  projectId: string;
  projectName: string;
  frs: FrMatrixRow[];
}

// ── Deliverables ───────────────────────────────────────────────

export type DeliverableKind = 'document' | 'code' | 'report' | 'artifact';

export interface DeliverableIndexItem {
  deliverableId: string;
  frId: string;
  frCode: string;
  frTitle: string;
  projectSlug: string;
  stageId: StageId;
  stageLabel: string;
  name: string;
  type: DeliverableKind;
  path: string;
  createdAt: string;
  previewable: boolean;
  previewContent?: string;
}

export interface DeliverableIndexView {
  items: DeliverableIndexItem[];
}

// ── Cross-project analytics ────────────────────────────────────

export type AnalyticsTimeRange = '7d' | '30d' | '90d' | 'all';

export interface StageFailureDatum {
  stageId: StageId;
  failures: number;
  blocked: number;
  retries: number;
}

export interface AgentEfficiencyDatum {
  agentId: string;
  averageHours: number;
  completedStages: number;
  activeStages: number;
}

export interface ProjectAnalyticsDatum {
  projectId: string;
  projectName: string;
  totalFrs: number;
  completedFrs: number;
  completionRate: number;
  averageCycleHours: number;
  qualityDistribution: {
    green: number;
    yellow: number;
    red: number;
  };
}

export interface CrossProjectAnalyticsView {
  timeRange: AnalyticsTimeRange;
  activeProjects: number;
  inProgressFrs: number;
  averageDeliveryHours: number;
  gateFirstPassRate: number;
  projectStats: ProjectAnalyticsDatum[];
  stageFailureHeatmap: StageFailureDatum[];
  agentEfficiency: AgentEfficiencyDatum[];
}

// ── Projects ──────────────────────────────────────────────────

export interface ProjectSummaryView {
  projectSlug: string;
  projectName: string;
  frCount: number;
  completedCount: number;
  activeCount: number;
  failedCount: number;
}

// ── Ledger ─────────────────────────────────────────────────────

export type LedgerActionType =
  | 'stage-passed'
  | 'stage-failed'
  | 'gate-approved'
  | 'gate-rejected'
  | 'delivered'
  | 'aborted';

export interface LedgerEvidenceLink {
  label: string;
  path: string;
  type: string;
}

export interface LedgerEntryView {
  entryId: string;
  frId: string;
  frCode: string;
  frTitle: string;
  projectSlug: string;
  projectName: string;
  stageId: StageId;
  actionType: LedgerActionType;
  outcome: 'delivered' | 'aborted' | 'in-progress';
  artifactCount: number;
  timestamp: string;
  summary: string;
  evidence: LedgerEvidenceLink[];
}

export interface LedgerView {
  entries: LedgerEntryView[];
}

// ── Review Fix Tracking (AC-5.16 ~ AC-5.20) ────────────────────

export type IssueSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type ReviewIssueStatus = 'open' | 'fixing' | 'revalidating' | 'closed' | 'deferred' | 'waived';

export type FixTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type RevalidationOutcome = 'passed' | 'failed' | 'waived';

export type ReviewDimension = 'quality' | 'product';

export interface ReviewIssueView {
  id: string;
  severity: IssueSeverity;
  status: ReviewIssueStatus;
  frId: string;
  frCode: string;
  projectSlug: string;
  artifact: string;
  fixDescription: string;
  dimension: ReviewDimension;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface FixTaskView {
  id: string;
  issueId: string;
  frId: string;
  frCode: string;
  projectSlug: string;
  status: FixTaskStatus;
  priority: number;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface RevalidationResultView {
  issueId: string;
  fixTaskId: string;
  frId: string;
  frCode: string;
  outcome: RevalidationOutcome;
  message: string;
  reviewer?: string;
  revalidatedAt: string;
}

export interface ReviewTrackingView {
  issues: ReviewIssueView[];
  fixTasks: FixTaskView[];
  revalidations: RevalidationResultView[];
  summary: {
    totalIssues: number;
    p0Open: number;
    p1Open: number;
    p2Open: number;
    p3Open: number;
    fixInProgress: number;
    fixCompleted: number;
    revalidationsPassed: number;
    revalidationsFailed: number;
  };
}

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  P0: 'P0 阻断',
  P1: 'P1 严重',
  P2: 'P2 一般',
  P3: 'P3 建议',
} as const;

export const ISSUE_STATUS_LABELS: Record<ReviewIssueStatus, string> = {
  open: '待处理',
  fixing: '修复中',
  revalidating: '复验中',
  closed: '已关闭',
  deferred: '已延期',
  waived: '已豁免',
} as const;

export const FIX_TASK_STATUS_LABELS: Record<FixTaskStatus, string> = {
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
} as const;

export const REVALIDATION_OUTCOME_LABELS: Record<RevalidationOutcome, string> = {
  passed: '通过',
  failed: '未通过',
  waived: '已豁免',
} as const;

export function getIssueSeverityLabel(severity: IssueSeverity): string {
  return ISSUE_SEVERITY_LABELS[severity];
}

export function getIssueStatusLabel(status: ReviewIssueStatus): string {
  return ISSUE_STATUS_LABELS[status];
}

export function getFixTaskStatusLabel(status: FixTaskStatus): string {
  return FIX_TASK_STATUS_LABELS[status];
}

export function getRevalidationOutcomeLabel(outcome: RevalidationOutcome): string {
  return REVALIDATION_OUTCOME_LABELS[outcome];
}

// ── Config & Settings (AC-5.21 ~ AC-5.26) ──────────────────────

export interface GateRuleConfigView {
  ruleId: string;
  appliesTo: StageId[];
  severity: 'blocker' | 'warning';
  description?: string;
}

export interface StageConfigView {
  stageId: StageId;
  label: string;
  enabled: boolean;
  agentId?: string;
  timeoutSeconds?: number;
}

export interface PrincipleView {
  id: string;
  name: string;
  description: string;
  category: 'quality' | 'process' | 'architecture' | 'security';
  enabled: boolean;
  appliesTo: StageId[];
}

export interface ProjectConfigView {
  projectSlug: string;
  projectName: string;
  adapter: 'openclaw' | 'standalone';
  specPath?: string;
  arcPath?: string;
  stages: StageConfigView[];
  rules: GateRuleConfigView[];
  principles: PrincipleView[];
}

export interface SettingsView {
  projects: ProjectConfigView[];
}

export const PRINCIPLE_CATEGORY_LABELS: Record<PrincipleView['category'], string> = {
  quality: '质量',
  process: '流程',
  architecture: '架构',
  security: '安全',
} as const;

export function getPrincipleCategoryLabel(category: PrincipleView['category']): string {
  return PRINCIPLE_CATEGORY_LABELS[category];
}

// ── SSE event types ─────────────────────────────────────────────

export type SseEventType =
  | 'project.updated'
  | 'fr.updated'
  | 'todo.updated'
  | 'notification.created'
  | 'health.changed';

export interface SseEvent {
  eventType: SseEventType;
  targetType: string;
  targetId: string;
  occurredAt: string;
  traceId: string;
  payload: Record<string, unknown>;
}

export interface DashboardStageCount {
  stageId: StageId;
  label: string;
  shortLabel: string;
  count: number;
  macroStage: UserMacroStage;
  hasRisk: boolean;
}
