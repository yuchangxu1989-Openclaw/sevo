/**
 * Stub engine service — placeholder that returns mock data.
 * In production this imports from @self-evolving-harness/sevo engine layer.
 * Wave 1: file-system based, same-process import.
 */

import type {
  StageId,
  StageStatus,
  PipelineInstanceStatus,
  ArtifactRef,
  StageRecord,
  RoutingResult,
  GateVerdict,
  ReviewBundle,
  NotificationRecord,
  NotificationPreference,
  PipelineInstance,
  DashboardSummary,
  FrSummaryView,
  FrDetailView,
  StageTimelineEntry,
  CommandRequest,
  TodoItemView,
  TodoUrgency,
  GateDecisionView,
  GateDecisionStatus,
  GateDecisionHistory,
  ClarificationThreadView,
  ClarificationBlockingLevel,
  ClarificationStatus,
  ClarificationResponseEntry,
  FrQualityView,
  QualityIssue,
  FrMatrixView,
  FrMatrixRow,
  StageSnapshot,
  UserMacroStage,
  DeliverableIndexView,
  DeliverableIndexItem,
  DeliverableKind,
  CrossProjectAnalyticsView,
  AnalyticsTimeRange,
  ProjectAnalyticsDatum,
  StageFailureDatum,
  AgentEfficiencyDatum,
  LedgerView,
  LedgerEntryView,
  LedgerActionType,
  LedgerEvidenceLink,
  ReviewTrackingView,
  ReviewIssueView,
  FixTaskView,
  RevalidationResultView,
  IssueSeverity,
  ReviewIssueStatus,
  FixTaskStatus,
  RevalidationOutcome,
  ReviewDimension,
  SettingsView,
  ProjectConfigView,
  StageConfigView,
  GateRuleConfigView,
  PrincipleView,
} from '@/types';
import { getStageLabel, USER_MACRO_STAGE_MAP } from '@/types';

// ── Request dedup cache (MIN-03: idempotency) ──────────────────

const REQUEST_ID_CACHE = new Map<string, number>();
const REQUEST_ID_TTL_MS = 5 * 60 * 1000;

function checkAndRecordRequestId(requestId: string): boolean {
  pruneExpiredRequestIds();
  if (REQUEST_ID_CACHE.has(requestId)) return false;
  REQUEST_ID_CACHE.set(requestId, Date.now());
  return true;
}

function pruneExpiredRequestIds(): void {
  const now = Date.now();
  for (const [id, ts] of REQUEST_ID_CACHE) {
    if (now - ts > REQUEST_ID_TTL_MS) REQUEST_ID_CACHE.delete(id);
  }
}

// ── Version tracking (MAJ-07: optimistic locking) ───────────────

const VERSION_MAP = new Map<string, number>();

function getVersion(instanceId: string): number {
  if (!VERSION_MAP.has(instanceId)) VERSION_MAP.set(instanceId, 1);
  return VERSION_MAP.get(instanceId)!;
}

function incrementVersion(instanceId: string): number {
  const next = getVersion(instanceId) + 1;
  VERSION_MAP.set(instanceId, next);
  return next;
}

// ── Helper: build stage records ─────────────────────────────────

function stg(stageId: StageId, status: StageStatus, attempt: number, opts?: { startedAt?: string; completedAt?: string; executorId?: string }): StageRecord {
  return {
    stageId, status, attempt,
    inputArtifacts: [], outputArtifacts: [],
    blockers: [],
    startedAt: opts?.startedAt, completedAt: opts?.completedAt,
    executorId: opts?.executorId,
  };
}

// ── Seed: Pipeline Instances (3 projects × multiple FRs) ────────

const ALL_STAGES: StageId[] = ['spec','spec-review-gate','test-case-authoring','contract','contract-review-gate','implement','review','regression','deploy','verify','ledger'];

function pendingStages(from: number): StageRecord[] {
  return ALL_STAGES.slice(from).map(id => stg(id, 'pending', 0));
}

const MOCK_PIPELINES: PipelineInstance[] = [
  // ── Self-Evolving Harness (sevo) ──
  {
    instanceId: 'pi-sevo-001', projectSlug: 'sevo', status: 'completed',
    routingResult: { taskId: 'task-sevo-001', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'ledger',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-10T09:00:00Z',completedAt:'2026-04-10T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-10T10:00:00Z',completedAt:'2026-04-10T10:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-10T10:30:00Z',completedAt:'2026-04-10T11:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-10T11:00:00Z',completedAt:'2026-04-10T12:00:00Z',executorId:'sa-01'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-10T12:00:00Z',completedAt:'2026-04-10T12:30:00Z'}),
      stg('implement','passed',1,{startedAt:'2026-04-10T13:00:00Z',completedAt:'2026-04-11T08:00:00Z',executorId:'cc'}),
      stg('review','passed',1,{startedAt:'2026-04-11T08:00:00Z',completedAt:'2026-04-11T09:00:00Z',executorId:'audit-01'}),
      stg('regression','passed',1,{startedAt:'2026-04-11T09:00:00Z',completedAt:'2026-04-11T09:30:00Z'}),
      stg('deploy','passed',1,{startedAt:'2026-04-11T09:30:00Z',completedAt:'2026-04-11T10:00:00Z'}),
      stg('verify','passed',1,{startedAt:'2026-04-11T10:00:00Z',completedAt:'2026-04-11T10:30:00Z'}),
      stg('ledger','passed',1,{startedAt:'2026-04-11T10:30:00Z',completedAt:'2026-04-11T11:00:00Z'}),
    ],
    createdAt: '2026-04-10T09:00:00Z', updatedAt: '2026-04-11T11:00:00Z',
  },
  {
    instanceId: 'pi-sevo-002', projectSlug: 'sevo', status: 'active',
    routingResult: { taskId: 'task-sevo-002', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'implement',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-14T09:00:00Z',completedAt:'2026-04-14T11:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-14T11:00:00Z',completedAt:'2026-04-14T11:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-14T11:30:00Z',completedAt:'2026-04-14T12:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-14T12:00:00Z',completedAt:'2026-04-14T14:00:00Z',executorId:'sa-01'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-14T14:00:00Z',completedAt:'2026-04-14T14:30:00Z'}),
      stg('implement','active',1,{startedAt:'2026-04-14T15:00:00Z',executorId:'free-code'}),
      ...pendingStages(6),
    ],
    createdAt: '2026-04-14T09:00:00Z', updatedAt: '2026-04-20T16:00:00Z',
  },
  {
    instanceId: 'pi-sevo-003', projectSlug: 'sevo', status: 'active',
    routingResult: { taskId: 'task-sevo-003', level: 'L1', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'contract',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-18T09:00:00Z',completedAt:'2026-04-18T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-18T10:00:00Z',completedAt:'2026-04-18T10:30:00Z'}),
      stg('test-case-authoring','active',1,{startedAt:'2026-04-18T10:30:00Z',executorId:'audit-01'}),
      stg('contract','active',1,{startedAt:'2026-04-18T10:30:00Z',executorId:'sa-01'}),
      ...pendingStages(4),
    ],
    createdAt: '2026-04-18T09:00:00Z', updatedAt: '2026-04-20T14:00:00Z',
  },
  {
    instanceId: 'pi-sevo-004', projectSlug: 'sevo', status: 'active',
    routingResult: { taskId: 'task-sevo-004', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'spec',
    stages: [
      stg('spec','active',1,{startedAt:'2026-04-20T09:00:00Z',executorId:'pm-01'}),
      ...pendingStages(1),
    ],
    createdAt: '2026-04-20T09:00:00Z', updatedAt: '2026-04-20T18:00:00Z',
  },
  {
    instanceId: 'pi-sevo-005', projectSlug: 'sevo', status: 'failed',
    routingResult: { taskId: 'task-sevo-005', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'implement',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-12T09:00:00Z',completedAt:'2026-04-12T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-12T10:00:00Z',completedAt:'2026-04-12T10:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-12T10:30:00Z',completedAt:'2026-04-12T11:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-12T11:00:00Z',completedAt:'2026-04-12T13:00:00Z'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-12T13:00:00Z',completedAt:'2026-04-12T13:30:00Z'}),
      stg('implement','failed',2,{startedAt:'2026-04-12T14:00:00Z',completedAt:'2026-04-13T08:00:00Z',executorId:'dev-01'}),
      ...pendingStages(6),
    ],
    createdAt: '2026-04-12T09:00:00Z', updatedAt: '2026-04-13T08:00:00Z',
  },
  // ── Claw Design (claw-design) ──
  {
    instanceId: 'pi-cd-001', projectSlug: 'claw-design', status: 'completed',
    routingResult: { taskId: 'task-cd-001', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'ledger',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-08T09:00:00Z',completedAt:'2026-04-08T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-08T10:00:00Z',completedAt:'2026-04-08T10:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-08T10:30:00Z',completedAt:'2026-04-08T11:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-08T11:00:00Z',completedAt:'2026-04-08T13:00:00Z'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-08T13:00:00Z',completedAt:'2026-04-08T13:30:00Z'}),
      stg('implement','passed',1,{startedAt:'2026-04-08T14:00:00Z',completedAt:'2026-04-09T10:00:00Z',executorId:'cc'}),
      stg('review','passed',1,{startedAt:'2026-04-09T10:00:00Z',completedAt:'2026-04-09T11:00:00Z'}),
      stg('regression','passed',1,{startedAt:'2026-04-09T11:00:00Z',completedAt:'2026-04-09T11:30:00Z'}),
      stg('deploy','passed',1,{startedAt:'2026-04-09T11:30:00Z',completedAt:'2026-04-09T12:00:00Z'}),
      stg('verify','passed',1,{startedAt:'2026-04-09T12:00:00Z',completedAt:'2026-04-09T12:30:00Z'}),
      stg('ledger','passed',1,{startedAt:'2026-04-09T12:30:00Z',completedAt:'2026-04-09T13:00:00Z'}),
    ],
    createdAt: '2026-04-08T09:00:00Z', updatedAt: '2026-04-09T13:00:00Z',
  },
  {
    instanceId: 'pi-cd-002', projectSlug: 'claw-design', status: 'active',
    routingResult: { taskId: 'task-cd-002', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'review',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-15T09:00:00Z',completedAt:'2026-04-15T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-15T10:00:00Z',completedAt:'2026-04-15T10:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-15T10:30:00Z',completedAt:'2026-04-15T11:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-15T11:00:00Z',completedAt:'2026-04-15T13:00:00Z'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-15T13:00:00Z',completedAt:'2026-04-15T13:30:00Z'}),
      stg('implement','passed',1,{startedAt:'2026-04-15T14:00:00Z',completedAt:'2026-04-17T10:00:00Z',executorId:'free-code'}),
      stg('review','active',1,{startedAt:'2026-04-17T10:00:00Z',executorId:'audit-01'}),
      ...pendingStages(7),
    ],
    createdAt: '2026-04-15T09:00:00Z', updatedAt: '2026-04-20T12:00:00Z',
  },
  {
    instanceId: 'pi-cd-003', projectSlug: 'claw-design', status: 'active',
    routingResult: { taskId: 'task-cd-003', level: 'L1', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'spec-review-gate',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-19T09:00:00Z',completedAt:'2026-04-19T11:00:00Z'}),
      stg('spec-review-gate','active',1,{startedAt:'2026-04-19T11:00:00Z',executorId:'sa-01'}),
      ...pendingStages(2),
    ],
    createdAt: '2026-04-19T09:00:00Z', updatedAt: '2026-04-20T10:00:00Z',
  },
  // ── KIVO ──
  {
    instanceId: 'pi-kivo-001', projectSlug: 'kivo', status: 'completed',
    routingResult: { taskId: 'task-kivo-001', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'ledger',
    stages: ALL_STAGES.map(id => stg(id,'passed',1,{startedAt:'2026-04-06T09:00:00Z',completedAt:'2026-04-07T12:00:00Z'})),
    createdAt: '2026-04-06T09:00:00Z', updatedAt: '2026-04-07T12:00:00Z',
  },
  {
    instanceId: 'pi-kivo-002', projectSlug: 'kivo', status: 'active',
    routingResult: { taskId: 'task-kivo-002', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'implement',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-16T09:00:00Z',completedAt:'2026-04-16T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-16T10:00:00Z',completedAt:'2026-04-16T10:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-16T10:30:00Z',completedAt:'2026-04-16T11:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-16T11:00:00Z',completedAt:'2026-04-16T13:00:00Z'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-16T13:00:00Z',completedAt:'2026-04-16T13:30:00Z'}),
      stg('implement','active',1,{startedAt:'2026-04-16T14:00:00Z',executorId:'cc'}),
      ...pendingStages(6),
    ],
    createdAt: '2026-04-16T09:00:00Z', updatedAt: '2026-04-20T15:00:00Z',
  },
  {
    instanceId: 'pi-kivo-003', projectSlug: 'kivo', status: 'active',
    routingResult: { taskId: 'task-kivo-003', level: 'L1', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'spec',
    stages: [
      stg('spec','active',1,{startedAt:'2026-04-20T10:00:00Z',executorId:'pm-01'}),
      ...pendingStages(1),
    ],
    createdAt: '2026-04-20T10:00:00Z', updatedAt: '2026-04-20T17:00:00Z',
  },
  // ── Additional FRs for data density ──
  {
    instanceId: 'pi-sevo-006', projectSlug: 'sevo', status: 'active',
    routingResult: { taskId: 'task-sevo-006', level: 'L2+', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'review',
    stages: [
      stg('spec','passed',1,{startedAt:'2026-04-21T09:00:00Z',completedAt:'2026-04-21T10:00:00Z'}),
      stg('spec-review-gate','passed',1,{startedAt:'2026-04-21T10:00:00Z',completedAt:'2026-04-21T10:30:00Z'}),
      stg('test-case-authoring','passed',1,{startedAt:'2026-04-21T10:30:00Z',completedAt:'2026-04-21T11:00:00Z'}),
      stg('contract','passed',1,{startedAt:'2026-04-21T11:00:00Z',completedAt:'2026-04-21T13:00:00Z',executorId:'sa-01'}),
      stg('contract-review-gate','passed',1,{startedAt:'2026-04-21T13:00:00Z',completedAt:'2026-04-21T13:30:00Z'}),
      stg('implement','passed',1,{startedAt:'2026-04-21T14:00:00Z',completedAt:'2026-04-22T10:00:00Z',executorId:'cc'}),
      stg('review','active',1,{startedAt:'2026-04-22T10:00:00Z',executorId:'audit-01'}),
      ...pendingStages(7),
    ],
    createdAt: '2026-04-21T09:00:00Z', updatedAt: '2026-04-22T12:00:00Z',
  },
  {
    instanceId: 'pi-cd-004', projectSlug: 'claw-design', status: 'completed',
    routingResult: { taskId: 'task-cd-004', level: 'L1', requiredStages: ALL_STAGES, skippedStages: [] },
    currentStage: 'ledger',
    stages: ALL_STAGES.map(id => stg(id,'passed',1,{startedAt:'2026-04-12T09:00:00Z',completedAt:'2026-04-13T12:00:00Z'})),
    createdAt: '2026-04-12T09:00:00Z', updatedAt: '2026-04-13T12:00:00Z',
  },
];

// ── Seed: Notifications ─────────────────────────────────────────

const MOCK_NOTIFICATIONS: NotificationRecord[] = [
  {
    notificationId: 'notif-001', pipelineId: 'pi-sevo-001', stageId: 'ledger',
    severity: 'info', channel: 'web',
    title: 'FR pi-sevo-001 全流程完成',
    message: 'Self-Evolving Harness 核心管线引擎 FR 已通过所有阶段，进入 ledger 归档。',
    read: true, createdAt: '2026-04-11T11:00:00Z',
  },
  {
    notificationId: 'notif-002', pipelineId: 'pi-sevo-005', stageId: 'implement',
    severity: 'critical', channel: 'web',
    title: 'FR pi-sevo-005 编码阶段失败',
    message: 'dev-01 执行编码任务超时（第 2 次尝试），建议升级到 T1 Agent 重试。',
    read: false, createdAt: '2026-04-13T08:00:00Z',
  },
  {
    notificationId: 'notif-003', pipelineId: 'pi-cd-002', stageId: 'review',
    severity: 'info', channel: 'web',
    title: 'Claw Design FR pi-cd-002 进入审查阶段',
    message: 'Host Adapter 模式实现已完成编码，audit-01 正在执行代码审查。',
    read: false, createdAt: '2026-04-17T10:00:00Z',
  },
  {
    notificationId: 'notif-004', pipelineId: 'pi-sevo-003', stageId: 'contract',
    severity: 'warning', channel: 'web',
    title: '架构设计进行中：通知中心模块',
    message: 'sa-01 正在编写 arc42 架构文档，预计 2 小时内完成。test-case-authoring 同步进行中。',
    read: false, createdAt: '2026-04-18T10:30:00Z',
  },
  {
    notificationId: 'notif-005', pipelineId: 'pi-kivo-002', stageId: 'implement',
    severity: 'info', channel: 'web',
    title: 'KIVO 语义搜索模块编码中',
    message: 'cc 正在实现 Wave 3 语义搜索功能，包括 embedding 缓存和向量索引。',
    read: true, createdAt: '2026-04-16T14:00:00Z',
  },
];

// ── Seed: Clarifications ────────────────────────────────────────

interface InternalClarification {
  clarificationId: string;
  pipelineId: string;
  stageId: StageId;
  blockingLevel: ClarificationBlockingLevel;
  status: ClarificationStatus;
  targetType: 'user' | 'upstream-stage' | 'reviewer' | 'internal-owner';
  question: string;
  context: string;
  responses: ClarificationResponseEntry[];
  createdAt: string;
}

const MOCK_CLARIFICATIONS: InternalClarification[] = [
  {
    clarificationId: 'clr-001',
    pipelineId: 'pi-sevo-004', stageId: 'spec',
    blockingLevel: 'blocking', status: 'open',
    targetType: 'user',
    question: 'FR 矩阵视图是否需要支持跨项目对比？当前 spec 只描述了单项目维度。',
    context: 'UFR-09 要求展示项目级 FR×阶段全景，但未明确是否支持多项目并排对比。',
    responses: [],
    createdAt: '2026-04-20T11:00:00Z',
  },
  {
    clarificationId: 'clr-002',
    pipelineId: 'pi-cd-001', stageId: 'spec',
    blockingLevel: 'non-blocking', status: 'resolved',
    targetType: 'user',
    question: 'Host Adapter 的 fallback 策略：宿主能力不可用时是静默降级还是抛错？',
    context: '架构设计需要明确 Adapter 层的错误处理策略。',
    responses: [{
      responseId: 'resp-001', actorId: 'user:changxu',
      content: '静默降级，核心流程不能因为宿主能力缺失而中断。降级时写日志即可。',
      createdAt: '2026-04-08T14:00:00Z',
    }],
    createdAt: '2026-04-08T11:30:00Z',
  },
];

// ── Seed: Gates ─────────────────────────────────────────────────

interface InternalGate {
  gateId: string;
  gateName: string;
  gateType: string;
  stageId: StageId;
  pipelineId: string;
  status: GateDecisionStatus;
  reviewBundles: ReviewBundle[];
  blockers: { item: string; owner: string }[];
  decisionHistory: GateDecisionHistory[];
  createdAt: string;
}

const MOCK_GATES: InternalGate[] = [
  {
    gateId: 'gate-001',
    gateName: 'Spec Review Gate — 通知中心模块',
    gateType: 'spec-review-gate',
    stageId: 'spec-review-gate',
    pipelineId: 'pi-cd-003',
    status: 'pending',
    reviewBundles: [{
      gateId: 'gate-001',
      reviewer: { agentId: 'sa-01', stageId: 'spec-review-gate' },
      conclusion: 'conditional',
      items: [
        { issue: '通知渠道优先级规则未定义', severity: 'major', owner: 'pm-01' },
        { issue: '静默时段的时区处理需补充', severity: 'minor', owner: 'pm-01' },
      ],
      evidence: [], createdAt: '2026-04-19T12:00:00Z',
    }],
    blockers: [{ item: '通知渠道优先级规则未定义', owner: 'pm-01' }],
    decisionHistory: [],
    createdAt: '2026-04-19T11:00:00Z',
  },
  {
    gateId: 'gate-002',
    gateName: 'Contract Review Gate — 管线引擎 Wave 2',
    gateType: 'contract-review-gate',
    stageId: 'contract-review-gate',
    pipelineId: 'pi-sevo-002',
    status: 'approved',
    reviewBundles: [
      {
        gateId: 'gate-002',
        reviewer: { agentId: 'pm-01', stageId: 'contract-review-gate' },
        conclusion: 'passed',
        items: [], evidence: [], createdAt: '2026-04-14T14:00:00Z',
      },
      {
        gateId: 'gate-002',
        reviewer: { agentId: 'cc', stageId: 'contract-review-gate' },
        conclusion: 'passed',
        items: [], evidence: [], createdAt: '2026-04-14T14:10:00Z',
      },
      {
        gateId: 'gate-002',
        reviewer: { agentId: 'audit-01', stageId: 'contract-review-gate' },
        conclusion: 'passed',
        items: [], evidence: [], createdAt: '2026-04-14T14:20:00Z',
      },
    ],
    blockers: [],
    decisionHistory: [{
      action: 'approved', actorId: 'system',
      reason: '三方会审全部通过，自动放行', timestamp: '2026-04-14T14:30:00Z',
    }],
    createdAt: '2026-04-14T14:00:00Z',
  },
];

const MOCK_PREFERENCES: NotificationPreference[] = [];
let preferenceSeq = 0;

// ── Service functions ───────────────────────────────────────────

function computeHealthStatus(status: PipelineInstanceStatus, stages: StageRecord[]): 'healthy' | 'at-risk' | 'blocked' | 'failed' {
  if (status === 'failed') return 'failed';
  if (stages.some(s => s.status === 'blocked' || s.status === 'clarification-blocked')) return 'blocked';
  if (stages.some(s => s.status === 'failed')) return 'at-risk';
  return 'healthy';
}

const PROJECT_NAMES: Record<string, string> = {
  'sevo': 'Self-Evolving Harness',
  'claw-design': 'Claw Design',
  'kivo': 'KIVO',
};

const DELIVERABLE_TYPE_MAP: Record<string, DeliverableKind> = {
  md: 'document',
  markdown: 'document',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  json: 'artifact',
  html: 'artifact',
  log: 'report',
  txt: 'report',
  report: 'report',
};

const STAGE_LABELS: Record<StageId, string> = {
  spec: '需求澄清',
  'spec-review-gate': '需求评审',
  'test-case-authoring': '测试设计',
  contract: '方案规划',
  'contract-review-gate': '方案评审',
  implement: '执行落地',
  review: '质量复核',
  regression: '回归验证',
  deploy: '部署发布',
  verify: '结果确认',
  ledger: '交付账本',
};

function inferDeliverableType(path: string): DeliverableKind {
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return 'artifact';
  return DELIVERABLE_TYPE_MAP[ext] ?? 'artifact';
}

function makeArtifact(
  artifactId: string,
  path: string,
  createdAt: string,
  type?: string,
): ArtifactRef {
  return {
    artifactId,
    path,
    type: type ?? path.split('.').pop()?.toLowerCase() ?? 'artifact',
    createdAt,
  };
}

function previewContentFor(path: string): string | undefined {
  if (path.endsWith('.md')) {
    return `# ${path.split('/').pop()}\n\n线上预览使用 markdown 渲染，后续会接真实工件服务。`;
  }
  return undefined;
}

export function getDashboardSummary(): DashboardSummary {
  const distribution = { specify: 0, plan: 0, implement: 0, review: 0 };
  let activeFrs = 0, blockedFrs = 0, completedFrs = 0, failedFrs = 0;

  for (const pi of MOCK_PIPELINES) {
    const macro = USER_MACRO_STAGE_MAP[pi.currentStage];
    distribution[macro]++;
    if (pi.status === 'active') activeFrs++;
    else if (pi.status === 'paused') blockedFrs++;
    else if (pi.status === 'completed') completedFrs++;
    else if (pi.status === 'failed') failedFrs++;
  }

  const total = MOCK_PIPELINES.length;
  const healthScore = total > 0 ? Math.round(((total - failedFrs - blockedFrs) / total) * 100) : 100;

  return {
    totalFrs: total,
    macroStageDistribution: distribution,
    healthScore,
    activeFrs,
    blockedFrs,
    completedFrs,
    failedFrs,
    dataSources: {
      systemCall: {
        type: 'derived',
        description: '基于 /api/v1/dashboard/summary 聚合的派生视图，来源是 engine-service.ts 里按 FR 流水线快照计算出的健康摘要。',
      },
      pipelineStages: {
        type: 'derived',
        description: '基于 /api/v1/dashboard/summary 的 macroStageDistribution 派生到 11 阶段展示，不是 runtime ledger 逐阶段实时计数。',
      },
      riskQueue: {
        type: 'derived',
        description: '基于 /api/v1/todos 聚合出的风险动作列表，来源包括门禁、澄清和失败 FR 的文件/内存聚合结果。',
      },
      runtimeMetrics: {
        type: 'derived',
        description: '基于 dashboard summary 与 todos 的派生指标卡，展示失败、门禁、推进中、已进账本等聚合数字。',
      },
    },
    trends: {
      totalFrs: { percent: 12, direction: 'up' as const, current: total, previous: Math.max(0, total - 2) },
      healthScore: { percent: 3, direction: 'up' as const, current: healthScore, previous: Math.max(0, healthScore - 3) },
      activeFrs: { percent: activeFrs > 0 ? 8 : 0, direction: activeFrs > 0 ? 'up' as const : 'flat' as const, current: activeFrs, previous: Math.max(0, activeFrs - 1) },
      blockedFrs: { percent: blockedFrs > 0 ? 15 : 0, direction: blockedFrs > 0 ? 'down' as const : 'flat' as const, current: blockedFrs, previous: blockedFrs + 1 },
    },
  };
}

export function listFrs(params: {
  stage?: string;
  status?: string;
  sort?: string;
  page: number;
  pageSize: number;
}): { items: FrSummaryView[]; total: number } {
  let filtered = MOCK_PIPELINES.slice();

  if (params.stage) {
    filtered = filtered.filter(p => USER_MACRO_STAGE_MAP[p.currentStage] === params.stage);
  }
  if (params.status) {
    filtered = filtered.filter(p => p.status === params.status);
  }

  if (params.sort === 'updatedAt') {
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const total = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  const paged = filtered.slice(start, start + params.pageSize);

  const TITLE_MAP: Record<string, string> = {
    'pi-sevo-001': '核心管线引擎 Wave 1',
    'pi-sevo-002': '管线引擎 Wave 2 — 门禁与澄清',
    'pi-sevo-003': '通知中心模块',
    'pi-sevo-004': 'FR 矩阵与质量仪表盘',
    'pi-sevo-005': '自动化回归测试框架',
    'pi-cd-001': 'Host Adapter 核心框架',
    'pi-cd-002': 'Host Adapter — OpenClaw 适配层',
    'pi-cd-003': '设计原型 Skill 集成',
    'pi-kivo-001': '知识存储与冲突检测引擎',
    'pi-kivo-002': '语义搜索与向量索引',
    'pi-kivo-003': '知识注入策略引擎',
    'pi-sevo-006': 'Web 控制台视觉升级',
    'pi-cd-004': '响应式布局适配',
  };

  return {
    total,
    items: paged.map(p => ({
      frId: p.instanceId,
      frCode: p.instanceId,
      title: TITLE_MAP[p.instanceId] || `Pipeline ${p.instanceId}`,
      currentStage: p.currentStage,
      currentMacroStage: USER_MACRO_STAGE_MAP[p.currentStage],
      status: p.status,
      healthStatus: computeHealthStatus(p.status, p.stages),
      routingResult: p.routingResult,
      updatedAt: p.updatedAt,
    })),
  };
}

const TITLE_MAP: Record<string, string> = {
  'pi-sevo-001': '核心管线引擎 Wave 1',
  'pi-sevo-002': '管线引擎 Wave 2 — 门禁与澄清',
  'pi-sevo-003': '通知中心模块',
  'pi-sevo-004': 'FR 矩阵与质量仪表盘',
  'pi-sevo-005': '自动化回归测试框架',
  'pi-cd-001': 'Host Adapter 核心框架',
  'pi-cd-002': 'Host Adapter — OpenClaw 适配层',
  'pi-cd-003': '设计原型 Skill 集成',
  'pi-kivo-001': '知识存储与冲突检测引擎',
  'pi-kivo-002': '语义搜索与向量索引',
  'pi-kivo-003': '知识注入策略引擎',
  'pi-sevo-006': 'Web 控制台视觉升级',
  'pi-cd-004': '响应式布局适配',
};

function frTitle(instanceId: string): string {
  return TITLE_MAP[instanceId] || `Pipeline ${instanceId}`;
}

function syntheticArtifactsForStage(pi: PipelineInstance, stage: StageRecord): ArtifactRef[] {
  if (stage.status === 'pending') return [];
  const timestamp = stage.completedAt ?? stage.startedAt ?? pi.updatedAt;
  switch (stage.stageId) {
    case 'spec':
      return [makeArtifact(`${pi.instanceId}-spec`, `docs/design/${pi.instanceId}-spec.md`, timestamp, 'md')];
    case 'spec-review-gate':
      return [makeArtifact(`${pi.instanceId}-spec-review`, `reports/${pi.instanceId}-spec-review.md`, timestamp, 'md')];
    case 'test-case-authoring':
      return [makeArtifact(`${pi.instanceId}-test-cases`, `reports/${pi.instanceId}-test-cases.md`, timestamp, 'md')];
    case 'contract':
      return [makeArtifact(`${pi.instanceId}-arc42`, `docs/architecture/${pi.instanceId}-arc42.md`, timestamp, 'md')];
    case 'contract-review-gate':
      return [makeArtifact(`${pi.instanceId}-contract-review`, `reports/${pi.instanceId}-contract-review.md`, timestamp, 'md')];
    case 'implement':
      return [makeArtifact(`${pi.instanceId}-impl`, `projects/${pi.projectSlug}/src/${pi.instanceId}.tsx`, timestamp, 'tsx')];
    case 'review':
      return [makeArtifact(`${pi.instanceId}-audit`, `reports/${pi.instanceId}-audit.md`, timestamp, 'md')];
    case 'regression':
      return [makeArtifact(`${pi.instanceId}-regression`, `reports/${pi.instanceId}-regression.md`, timestamp, 'md')];
    case 'deploy':
      return [makeArtifact(`${pi.instanceId}-deploy`, `artifacts/${pi.instanceId}/deploy-log.json`, timestamp, 'json')];
    case 'verify':
      return [makeArtifact(`${pi.instanceId}-verify`, `reports/${pi.instanceId}-verify.md`, timestamp, 'md')];
    case 'ledger':
      return [makeArtifact(`${pi.instanceId}-ledger`, `reports/${pi.instanceId}-ledger.md`, timestamp, 'md')];
    default:
      return [];
  }
}

function artifactsForStage(pi: PipelineInstance, stage: StageRecord): ArtifactRef[] {
  const artifacts = [...stage.inputArtifacts, ...stage.outputArtifacts];
  return artifacts.length > 0 ? artifacts : syntheticArtifactsForStage(pi, stage);
}

export function getFrDetail(frId: string): (FrDetailView & { version: number }) | null {
  const pi = MOCK_PIPELINES.find(p => p.instanceId === frId);
  if (!pi) return null;

  const timeline: StageTimelineEntry[] = pi.stages.map(s => ({
    stageId: s.stageId,
    macroStage: USER_MACRO_STAGE_MAP[s.stageId],
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    attempt: s.attempt,
    artifacts: artifactsForStage(pi, s),
  }));

  const blockers = pi.stages.flatMap(s => s.blockers);
  const artifacts = pi.stages.flatMap(s => artifactsForStage(pi, s));

  return {
    frId: pi.instanceId,
    frCode: pi.instanceId,
    title: frTitle(pi.instanceId),
    currentStage: pi.currentStage,
    currentMacroStage: USER_MACRO_STAGE_MAP[pi.currentStage],
    status: pi.status,
    routingResult: pi.routingResult,
    stageTimeline: timeline,
    blockers,
    artifacts,
    createdAt: pi.createdAt,
    updatedAt: pi.updatedAt,
    version: getVersion(pi.instanceId),
  };
}

export function getFrTimeline(frId: string): StageTimelineEntry[] | null {
  const pi = MOCK_PIPELINES.find(p => p.instanceId === frId);
  if (!pi) return null;
  return pi.stages.map(s => ({
    stageId: s.stageId,
    macroStage: USER_MACRO_STAGE_MAP[s.stageId],
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    attempt: s.attempt,
    artifacts: artifactsForStage(pi, s),
  }));
}

export function getFrArtifacts(frId: string): ArtifactRef[] | null {
  const pi = MOCK_PIPELINES.find(p => p.instanceId === frId);
  if (!pi) return null;
  return pi.stages.flatMap(s => artifactsForStage(pi, s));
}

export function listNotifications(params: {
  severity?: string;
  read?: string;
  page: number;
  pageSize: number;
}): { items: NotificationRecord[]; total: number } {
  let filtered = MOCK_NOTIFICATIONS.slice();
  if (params.severity) {
    filtered = filtered.filter(n => n.severity === params.severity);
  }
  if (params.read !== undefined) {
    const isRead = params.read === 'true';
    filtered = filtered.filter(n => n.read === isRead);
  }
  const total = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  return { items: filtered.slice(start, start + params.pageSize), total };
}

// ── Command operations ──────────────────────────────────────────

function findPipeline(frId: string): PipelineInstance | undefined {
  return MOCK_PIPELINES.find(p => p.instanceId === frId);
}

function preflightCommand(frId: string, cmd: CommandRequest): string | null {
  if (!checkAndRecordRequestId(cmd.requestId)) return 'DUPLICATE_REQUEST';
  if (cmd.expectedVersion !== undefined) {
    const current = getVersion(frId);
    if (cmd.expectedVersion !== current) return 'VERSION_CONFLICT';
  }
  return null;
}

export function pauseFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  const pi = findPipeline(frId);
  if (!pi) return { success: false, error: 'FR not found' };
  const preErr = preflightCommand(frId, cmd);
  if (preErr) return { success: false, error: preErr };
  if (pi.status !== 'active') return { success: false, error: `Cannot pause FR in status: ${pi.status}` };
  pi.status = 'paused';
  pi.updatedAt = new Date().toISOString();
  incrementVersion(frId);
  return { success: true };
}

export function resumeFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  const pi = findPipeline(frId);
  if (!pi) return { success: false, error: 'FR not found' };
  const preErr = preflightCommand(frId, cmd);
  if (preErr) return { success: false, error: preErr };
  if (pi.status !== 'paused') return { success: false, error: `Cannot resume FR in status: ${pi.status}` };
  pi.status = 'active';
  pi.updatedAt = new Date().toISOString();
  incrementVersion(frId);
  return { success: true };
}

export function cancelFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  const pi = findPipeline(frId);
  if (!pi) return { success: false, error: 'FR not found' };
  const preErr = preflightCommand(frId, cmd);
  if (preErr) return { success: false, error: preErr };
  if (pi.status === 'completed' || pi.status === 'failed') {
    return { success: false, error: `Cannot cancel FR in terminal status: ${pi.status}` };
  }
  pi.status = 'failed';
  pi.updatedAt = new Date().toISOString();
  incrementVersion(frId);
  return { success: true };
}

export function retryFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  const pi = findPipeline(frId);
  if (!pi) return { success: false, error: 'FR not found' };
  const preErr = preflightCommand(frId, cmd);
  if (preErr) return { success: false, error: preErr };
  if (pi.status !== 'failed') return { success: false, error: `Cannot retry FR in status: ${pi.status}` };
  pi.status = 'active';
  pi.updatedAt = new Date().toISOString();
  incrementVersion(frId);
  return { success: true };
}

export function abandonFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  const pi = findPipeline(frId);
  if (!pi) return { success: false, error: 'FR not found' };
  const preErr = preflightCommand(frId, cmd);
  if (preErr) return { success: false, error: preErr };
  if (pi.status === 'completed') return { success: false, error: 'Cannot abandon completed FR' };
  pi.status = 'failed';
  pi.updatedAt = new Date().toISOString();
  incrementVersion(frId);
  return { success: true };
}

// ── Notification Preferences ────────────────────────────────────

export function getNotificationPreferences(userId?: string): NotificationPreference[] {
  if (userId) return MOCK_PREFERENCES.filter(p => p.userId === userId);
  return MOCK_PREFERENCES.slice();
}

export function createNotificationPreference(data: {
  userId: string;
  channels: NotificationPreference['channels'];
  severityFilter: NotificationPreference['severityFilter'];
  quietHours?: NotificationPreference['quietHours'];
  enabled?: boolean;
}): NotificationPreference {
  const now = new Date().toISOString();
  const pref: NotificationPreference = {
    preferenceId: `pref-${String(++preferenceSeq).padStart(3, '0')}`,
    userId: data.userId,
    channels: data.channels,
    severityFilter: data.severityFilter,
    quietHours: data.quietHours,
    enabled: data.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };
  MOCK_PREFERENCES.push(pref);
  return pref;
}

export function updateNotificationPreference(
  preferenceId: string,
  patch: Partial<Pick<NotificationPreference, 'channels' | 'severityFilter' | 'quietHours' | 'enabled'>>,
): NotificationPreference | null {
  const pref = MOCK_PREFERENCES.find(p => p.preferenceId === preferenceId);
  if (!pref) return null;
  if (patch.channels !== undefined) pref.channels = patch.channels;
  if (patch.severityFilter !== undefined) pref.severityFilter = patch.severityFilter;
  if (patch.quietHours !== undefined) pref.quietHours = patch.quietHours;
  if (patch.enabled !== undefined) pref.enabled = patch.enabled;
  pref.updatedAt = new Date().toISOString();
  return pref;
}

export function deleteNotificationPreference(preferenceId: string): boolean {
  const idx = MOCK_PREFERENCES.findIndex(p => p.preferenceId === preferenceId);
  if (idx === -1) return false;
  MOCK_PREFERENCES.splice(idx, 1);
  return true;
}

export function markNotificationRead(notificationId: string): NotificationRecord | null {
  const notif = MOCK_NOTIFICATIONS.find(n => n.notificationId === notificationId);
  if (!notif) return null;
  notif.read = true;
  return notif;
}

// ── Wave 2: Todos ───────────────────────────────────────────────

function computeUrgency(waitMs: number): TodoUrgency {
  const hours = waitMs / (1000 * 60 * 60);
  if (hours >= 24) return 'critical';
  if (hours >= 8) return 'high';
  if (hours >= 2) return 'medium';
  return 'low';
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function listTodos(): TodoItemView[] {
  const now = Date.now();
  const todos: TodoItemView[] = [];

  for (const gate of MOCK_GATES) {
    if (gate.status === 'pending') {
      const pi = MOCK_PIPELINES.find(p => p.instanceId === gate.pipelineId);
      const waitMs = now - new Date(gate.createdAt).getTime();
      todos.push({
        todoId: `todo-gate-${gate.gateId}`,
        type: 'gate',
        frId: gate.pipelineId,
        frCode: pi?.instanceId ?? gate.pipelineId,
        stageId: gate.stageId,
        title: `门禁审批: ${gate.gateName}`,
        projectSlug: pi?.projectSlug ?? 'unknown',
        urgency: computeUrgency(waitMs),
        waitDuration: formatDuration(waitMs),
        summary: `${gate.gateName} 需要审批`,
        status: 'pending',
        createdAt: gate.createdAt,
      });
    }
  }

  for (const clr of MOCK_CLARIFICATIONS) {
    if (clr.status === 'open' && clr.blockingLevel === 'blocking' && clr.targetType === 'user') {
      const pi = MOCK_PIPELINES.find(p => p.instanceId === clr.pipelineId);
      const waitMs = now - new Date(clr.createdAt).getTime();
      todos.push({
        todoId: `todo-clr-${clr.clarificationId}`,
        type: 'clarification',
        frId: clr.pipelineId,
        frCode: pi?.instanceId ?? clr.pipelineId,
        stageId: clr.stageId,
        title: '澄清回复',
        projectSlug: pi?.projectSlug ?? 'unknown',
        urgency: computeUrgency(waitMs),
        waitDuration: formatDuration(waitMs),
        summary: clr.question,
        status: 'pending',
        createdAt: clr.createdAt,
      });
    }
  }

  for (const pi of MOCK_PIPELINES) {
    if (pi.status === 'failed') {
      const waitMs = now - new Date(pi.updatedAt).getTime();
      todos.push({
        todoId: `todo-fail-${pi.instanceId}`,
        type: 'failure',
        frId: pi.instanceId,
        frCode: pi.instanceId,
        stageId: pi.currentStage,
        title: 'FR 流程异常',
        projectSlug: pi.projectSlug,
        urgency: computeUrgency(waitMs),
        waitDuration: formatDuration(waitMs),
        summary: `${frTitle(pi.instanceId)} 流程失败，需决定重试或放弃`,
        status: 'pending',
        createdAt: pi.updatedAt,
      });
    }
  }

  return todos;
}

// ── Wave 2: Clarifications ──────────────────────────────────────

export function getClarification(clarificationId: string): ClarificationThreadView | null {
  const clr = MOCK_CLARIFICATIONS.find(c => c.clarificationId === clarificationId);
  if (!clr) return null;
  const pi = MOCK_PIPELINES.find(p => p.instanceId === clr.pipelineId);
  return {
    clarificationId: clr.clarificationId,
    frId: clr.pipelineId,
    frCode: pi?.instanceId ?? clr.pipelineId,
    stageId: clr.stageId,
    question: clr.question,
    blockingLevel: clr.blockingLevel,
    context: clr.context,
    responses: clr.responses,
    resolutionStatus: clr.status,
    createdAt: clr.createdAt,
  };
}

export function replyClarification(
  clarificationId: string,
  cmd: CommandRequest,
  content: string,
): { success: boolean; error?: string } {
  const preErr = preflightCommand(clarificationId, cmd);
  if (preErr) return { success: false, error: preErr };

  const clr = MOCK_CLARIFICATIONS.find(c => c.clarificationId === clarificationId);
  if (!clr) return { success: false, error: 'Clarification not found' };
  if (clr.status !== 'open') return { success: false, error: `Cannot reply to clarification in status: ${clr.status}` };

  clr.responses.push({
    responseId: `resp-${Date.now()}`,
    actorId: cmd.actorId,
    content,
    createdAt: new Date().toISOString(),
  });
  clr.status = 'resolved';
  return { success: true };
}

// ── Wave 2: Gates ───────────────────────────────────────────────

export function getGate(gateId: string): GateDecisionView | null {
  const gate = MOCK_GATES.find(g => g.gateId === gateId);
  if (!gate) return null;
  return {
    gateId: gate.gateId,
    gateName: gate.gateName,
    gateType: gate.gateType,
    stageId: gate.stageId,
    frId: gate.pipelineId,
    frCode: gate.pipelineId,
    status: gate.status,
    reviewBundles: gate.reviewBundles,
    blockers: gate.blockers,
    decisionHistory: gate.decisionHistory,
    createdAt: gate.createdAt,
  };
}

function updateGateDecision(
  gateId: string,
  cmd: CommandRequest,
  newStatus: GateDecisionStatus,
  reason?: string,
): { success: boolean; error?: string } {
  const gate = MOCK_GATES.find(g => g.gateId === gateId);
  if (!gate) return { success: false, error: 'Gate not found' };

  const preErr = preflightCommand(gateId, cmd);
  if (preErr) return { success: false, error: preErr };

  gate.status = newStatus;
  gate.decisionHistory.push({
    action: newStatus === 'approved' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'request-review',
    actorId: cmd.actorId,
    reason,
    timestamp: new Date().toISOString(),
  });
  return { success: true };
}

export function approveGate(gateId: string, cmd: CommandRequest, reason?: string): { success: boolean; error?: string } {
  return updateGateDecision(gateId, cmd, 'approved', reason);
}

export function rejectGate(gateId: string, cmd: CommandRequest, reason?: string): { success: boolean; error?: string } {
  return updateGateDecision(gateId, cmd, 'rejected', reason);
}

export function requestGateReview(gateId: string, cmd: CommandRequest, reason?: string): { success: boolean; error?: string } {
  return updateGateDecision(gateId, cmd, 'pending', reason);
}

// ── Wave 2: FR Quality ──────────────────────────────────────────

export function getFrQuality(frId: string): FrQualityView | null {
  const pi = MOCK_PIPELINES.find(p => p.instanceId === frId);
  if (!pi) return null;

  function stageStatus(stageId: StageId): StageStatus {
    const stage = pi!.stages.find(s => s.stageId === stageId);
    return stage?.status ?? 'pending';
  }

  const issues: QualityIssue[] = pi.stages
    .filter(s => s.status === 'failed')
    .map((s, i) => ({
      issueId: `issue-${s.stageId}-${i}`,
      severity: 'major' as const,
      description: `Stage ${s.stageId} failed`,
      stage: s.stageId,
      status: 'open' as const,
    }));

  // Compute meaningful quality scores based on pipeline progress
  const passedStages = pi.stages.filter(s => s.status === 'passed').length;
  const totalStages = pi.stages.length;
  const baseScore = Math.round((passedStages / totalStages) * 100);
  const qualityScore = Math.max(0, baseScore - issues.length * 15);

  const testCoverage = pi.status === 'completed' ? 87 :
    stageStatus('test-case-authoring') === 'passed' ? 72 :
    stageStatus('test-case-authoring') === 'active' ? 35 : 0;

  const auditStatus = stageStatus('review') === 'passed' ? 'passed' as const :
    stageStatus('review') === 'active' ? 'in-progress' as const :
    stageStatus('review') === 'failed' ? 'failed' as const : 'pending' as const;

  return {
    frId: pi.instanceId,
    frCode: pi.instanceId,
    title: frTitle(pi.instanceId),
    qualityScore,
    testCoverage,
    auditStatus,
    reviewStatus: stageStatus('review'),
    regressionStatus: stageStatus('regression'),
    verifyStatus: stageStatus('verify'),
    issues,
  };
}

// ── Wave 2: FR Matrix ───────────────────────────────────────────

const MACRO_STAGE_ORDER: UserMacroStage[] = ['specify', 'plan', 'implement', 'review'];

const MACRO_STAGE_MEMBERS: Record<UserMacroStage, StageId[]> = {
  specify: ['spec', 'spec-review-gate'],
  plan: ['test-case-authoring', 'contract', 'contract-review-gate'],
  implement: ['implement'],
  review: ['review', 'regression', 'deploy', 'verify', 'ledger'],
};

function cycleHours(pi: PipelineInstance): number {
  const start = pi.stages.find(s => s.stageId === 'spec')?.startedAt ?? pi.createdAt;
  const end = pi.stages.find(s => s.stageId === 'verify')?.completedAt ?? pi.updatedAt;
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)));
}

function qualityBand(pi: PipelineInstance): 'green' | 'yellow' | 'red' {
  if (pi.status === 'failed' || pi.stages.some(s => s.status === 'failed')) return 'red';
  if (pi.stages.some(s => s.status === 'blocked' || s.status === 'clarification-blocked')) return 'yellow';
  return 'green';
}

export function getDeliverableIndex(): DeliverableIndexView {
  const items: DeliverableIndexItem[] = MOCK_PIPELINES.flatMap((pi) =>
    pi.stages.flatMap((stage) =>
      artifactsForStage(pi, stage).map((artifact, index) => ({
        deliverableId: `${pi.instanceId}-${stage.stageId}-${index}`,
        frId: pi.instanceId,
        frCode: pi.instanceId,
        frTitle: frTitle(pi.instanceId),
        projectSlug: pi.projectSlug,
        stageId: stage.stageId,
        stageLabel: getStageLabel(stage.stageId),
        name: artifact.path.split('/').pop() ?? artifact.path,
        type: inferDeliverableType(artifact.path),
        path: artifact.path,
        createdAt: artifact.createdAt,
        previewable: artifact.path.endsWith('.md'),
        previewContent: previewContentFor(artifact.path),
      })),
    ),
  );

  return {
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export function getCrossProjectAnalytics(timeRange: AnalyticsTimeRange = '30d'): CrossProjectAnalyticsView {
  const pipelines = MOCK_PIPELINES.slice();
  const activeProjects = new Set(pipelines.map((pi) => pi.projectSlug)).size;
  const inProgressFrs = pipelines.filter((pi) => pi.status === 'active' || pi.status === 'paused').length;
  const averageDeliveryHours = Math.round(
    pipelines.reduce((sum, pi) => sum + cycleHours(pi), 0) / Math.max(1, pipelines.length),
  );

  const gateStages: StageId[] = ['spec-review-gate', 'contract-review-gate'];
  const totalGateChecks = pipelines.reduce(
    (sum, pi) => sum + pi.stages.filter((stage) => gateStages.includes(stage.stageId)).length,
    0,
  );
  const firstPassGateChecks = pipelines.reduce(
    (sum, pi) =>
      sum + pi.stages.filter((stage) => gateStages.includes(stage.stageId) && stage.status === 'passed' && stage.attempt <= 1).length,
    0,
  );

  const projectStats: ProjectAnalyticsDatum[] = Object.entries(PROJECT_NAMES).map(([projectId, projectName]) => {
    const projectPipelines = pipelines.filter((pi) => pi.projectSlug === projectId);
    const totalFrs = projectPipelines.length;
    const completedFrs = projectPipelines.filter((pi) => pi.status === 'completed').length;
    const completionRate = totalFrs > 0 ? Math.round((completedFrs / totalFrs) * 100) : 0;
    const averageCycleHours = totalFrs > 0
      ? Math.round(projectPipelines.reduce((sum, pi) => sum + cycleHours(pi), 0) / totalFrs)
      : 0;
    const qualityDistribution = projectPipelines.reduce(
      (acc, pi) => {
        acc[qualityBand(pi)] += 1;
        return acc;
      },
      { green: 0, yellow: 0, red: 0 },
    );

    return {
      projectId,
      projectName,
      totalFrs,
      completedFrs,
      completionRate,
      averageCycleHours,
      qualityDistribution,
    };
  });

  const stageFailureHeatmap: StageFailureDatum[] = ALL_STAGES.map((stageId) => ({
    stageId,
    failures: pipelines.filter((pi) => pi.stages.some((stage) => stage.stageId === stageId && stage.status === 'failed')).length,
    blocked: pipelines.filter((pi) => pi.stages.some((stage) => stage.stageId === stageId && (stage.status === 'blocked' || stage.status === 'clarification-blocked'))).length,
    retries: pipelines.reduce(
      (sum, pi) => sum + pi.stages.filter((stage) => stage.stageId === stageId && stage.attempt > 1).length,
      0,
    ),
  }));

  const agentBucket = new Map<string, { totalHours: number; count: number; activeStages: number }>();
  for (const pi of pipelines) {
    for (const stage of pi.stages) {
      if (!stage.executorId || !stage.startedAt) continue;
      const end = stage.completedAt ?? pi.updatedAt;
      const durationHours = Math.max(1, Math.round((new Date(end).getTime() - new Date(stage.startedAt).getTime()) / (1000 * 60 * 60)));
      const current = agentBucket.get(stage.executorId) ?? { totalHours: 0, count: 0, activeStages: 0 };
      current.totalHours += durationHours;
      current.count += stage.completedAt ? 1 : 0;
      if (!stage.completedAt && stage.status === 'active') current.activeStages += 1;
      agentBucket.set(stage.executorId, current);
    }
  }

  const agentEfficiency: AgentEfficiencyDatum[] = [...agentBucket.entries()]
    .map(([agentId, stats]) => ({
      agentId,
      averageHours: Math.round(stats.totalHours / Math.max(1, stats.count + stats.activeStages)),
      completedStages: stats.count,
      activeStages: stats.activeStages,
    }))
    .sort((a, b) => a.averageHours - b.averageHours);

  return {
    timeRange,
    activeProjects,
    inProgressFrs,
    averageDeliveryHours,
    gateFirstPassRate: totalGateChecks > 0 ? Math.round((firstPassGateChecks / totalGateChecks) * 100) : 0,
    projectStats,
    stageFailureHeatmap,
    agentEfficiency,
  };
}

export function getLedgerView(): LedgerView {
  const entries: LedgerEntryView[] = MOCK_PIPELINES.flatMap((pi) =>
    pi.stages
      .filter((stage) => stage.status !== 'pending')
      .map((stage) => {
        const actionType: LedgerActionType =
          stage.stageId === 'ledger'
            ? pi.status === 'completed'
              ? 'delivered'
              : 'aborted'
            : stage.status === 'failed'
              ? 'stage-failed'
              : stage.stageId.includes('gate')
                ? 'gate-approved'
                : 'stage-passed';

        const evidence: LedgerEvidenceLink[] = artifactsForStage(pi, stage).map((artifact) => ({
          label: artifact.path.split('/').pop() ?? artifact.path,
          path: artifact.path,
          type: artifact.type,
        }));

        return {
          entryId: `${pi.instanceId}-${stage.stageId}`,
          frId: pi.instanceId,
          frCode: pi.instanceId,
          frTitle: frTitle(pi.instanceId),
          projectSlug: pi.projectSlug,
          projectName: PROJECT_NAMES[pi.projectSlug] ?? pi.projectSlug,
          stageId: stage.stageId,
          actionType,
          outcome: pi.status === 'completed' ? 'delivered' : pi.status === 'failed' ? 'aborted' : 'in-progress',
          artifactCount: evidence.length,
          timestamp: stage.completedAt ?? stage.startedAt ?? pi.updatedAt,
          summary:
            stage.stageId === 'ledger'
              ? `${frTitle(pi.instanceId)} 已进入账本归档。`
              : `${STAGE_LABELS[stage.stageId]} 阶段 ${stage.status === 'failed' ? '失败' : '完成'}。`,
          evidence,
        };
      }),
  );

  return {
    entries: entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  };
}

export function getFrMatrix(projectId: string): FrMatrixView {
  const pipelines = MOCK_PIPELINES.filter(p => p.projectSlug === projectId);

  const frs: FrMatrixRow[] = pipelines.map(pi => {
    const stages = {} as Record<UserMacroStage, StageSnapshot>;
    for (const macro of MACRO_STAGE_ORDER) {
      const memberStages = MACRO_STAGE_MEMBERS[macro];
      const stageRecords = pi.stages.filter(s => memberStages.includes(s.stageId));

      let cellStatus: StageStatus = 'pending';
      if (stageRecords.some(s => s.status === 'blocked' || s.status === 'clarification-blocked')) {
        cellStatus = 'blocked';
      } else if (stageRecords.every(s => s.status === 'passed' || s.status === 'skipped') && stageRecords.length > 0) {
        cellStatus = 'passed';
      } else if (stageRecords.some(s => s.status === 'active')) {
        cellStatus = 'active';
      } else if (stageRecords.some(s => s.status === 'failed')) {
        cellStatus = 'failed';
      }

      stages[macro] = { macroStage: macro, status: cellStatus, stageIds: memberStages };
    }

    return {
      frId: pi.instanceId,
      frCode: pi.instanceId,
      title: frTitle(pi.instanceId),
      status: pi.status,
      stages,
    };
  });

  return { projectId, projectName: PROJECT_NAMES[projectId] || projectId, frs };
}

export function listProjects(): { projectSlug: string; projectName: string; frCount: number; completedCount: number; activeCount: number; failedCount: number }[] {
  const slugs = [...new Set(MOCK_PIPELINES.map(p => p.projectSlug))];
  return slugs.map(slug => {
    const pis = MOCK_PIPELINES.filter(p => p.projectSlug === slug);
    return {
      projectSlug: slug,
      projectName: PROJECT_NAMES[slug] ?? slug,
      frCount: pis.length,
      completedCount: pis.filter(p => p.status === 'completed').length,
      activeCount: pis.filter(p => p.status === 'active').length,
      failedCount: pis.filter(p => p.status === 'failed').length,
    };
  });
}

// ── Review Fix Tracking (AC-5.16 ~ AC-5.20) ────────────────────

const MOCK_REVIEW_ISSUES: ReviewIssueView[] = [
  {
    id: 'ri-001', severity: 'P0', status: 'fixing', frId: 'pi-sevo-002', frCode: 'pi-sevo-002',
    projectSlug: 'sevo', artifact: 'src/pipeline/stage-machine.ts',
    fixDescription: '阶段状态机在并行分支合并时可能丢失事件，导致流水线卡死',
    dimension: 'quality', createdAt: '2026-04-20T10:00:00Z', updatedAt: '2026-04-21T08:00:00Z',
    attemptCount: 1, maxAttempts: 3,
  },
  {
    id: 'ri-002', severity: 'P0', status: 'closed', frId: 'pi-sevo-001', frCode: 'pi-sevo-001',
    projectSlug: 'sevo', artifact: 'src/gate/gate-engine.ts',
    fixDescription: '门禁评估结果未持久化，重启后丢失审批状态',
    dimension: 'quality', createdAt: '2026-04-11T09:00:00Z', updatedAt: '2026-04-11T14:00:00Z',
    attemptCount: 1, maxAttempts: 3,
  },
  {
    id: 'ri-003', severity: 'P1', status: 'revalidating', frId: 'pi-sevo-002', frCode: 'pi-sevo-002',
    projectSlug: 'sevo', artifact: 'src/router/stage-router.ts',
    fixDescription: 'L1 路由在 estimatedFiles 为 undefined 时错误降级到 L0',
    dimension: 'quality', createdAt: '2026-04-20T11:00:00Z', updatedAt: '2026-04-21T10:00:00Z',
    attemptCount: 2, maxAttempts: 3,
  },
  {
    id: 'ri-004', severity: 'P1', status: 'open', frId: 'pi-kivo-002', frCode: 'pi-kivo-002',
    projectSlug: 'kivo', artifact: 'src/knowledge/conflict-resolver.ts',
    fixDescription: '知识冲突检测在大批量导入时超时，需要增加分批处理',
    dimension: 'product', createdAt: '2026-04-22T09:00:00Z', updatedAt: '2026-04-22T09:00:00Z',
    attemptCount: 0, maxAttempts: 3,
  },
  {
    id: 'ri-005', severity: 'P2', status: 'deferred', frId: 'pi-sevo-003', frCode: 'pi-sevo-003',
    projectSlug: 'sevo', artifact: 'src/ledger/ledger-engine.ts',
    fixDescription: '账本条目缺少 traceId 字段，影响端到端追踪',
    dimension: 'quality', createdAt: '2026-04-19T14:00:00Z', updatedAt: '2026-04-20T09:00:00Z',
    attemptCount: 0, maxAttempts: 3,
  },
  {
    id: 'ri-006', severity: 'P2', status: 'closed', frId: 'pi-kivo-001', frCode: 'pi-kivo-001',
    projectSlug: 'kivo', artifact: 'src/extraction/extractor.ts',
    fixDescription: '提取器对 Markdown 表格解析不完整',
    dimension: 'product', createdAt: '2026-04-15T10:00:00Z', updatedAt: '2026-04-16T11:00:00Z',
    attemptCount: 1, maxAttempts: 3,
  },
  {
    id: 'ri-007', severity: 'P3', status: 'waived', frId: 'pi-claw-001', frCode: 'pi-claw-001',
    projectSlug: 'claw-design', artifact: 'src/templates/poster.ts',
    fixDescription: '海报模板在极窄屏幕下文字溢出',
    dimension: 'product', createdAt: '2026-04-18T16:00:00Z', updatedAt: '2026-04-19T09:00:00Z',
    attemptCount: 0, maxAttempts: 3,
  },
];

const MOCK_FIX_TASKS: FixTaskView[] = [
  {
    id: 'ft-001', issueId: 'ri-001', frId: 'pi-sevo-002', frCode: 'pi-sevo-002',
    projectSlug: 'sevo', status: 'in_progress', priority: 0, assignee: 'cc',
    createdAt: '2026-04-20T10:30:00Z', updatedAt: '2026-04-21T08:00:00Z',
  },
  {
    id: 'ft-002', issueId: 'ri-002', frId: 'pi-sevo-001', frCode: 'pi-sevo-001',
    projectSlug: 'sevo', status: 'completed', priority: 0, assignee: 'free-code',
    createdAt: '2026-04-11T09:30:00Z', updatedAt: '2026-04-11T13:00:00Z', completedAt: '2026-04-11T13:00:00Z',
  },
  {
    id: 'ft-003', issueId: 'ri-003', frId: 'pi-sevo-002', frCode: 'pi-sevo-002',
    projectSlug: 'sevo', status: 'completed', priority: 1, assignee: 'cc',
    createdAt: '2026-04-20T11:30:00Z', updatedAt: '2026-04-21T09:00:00Z', completedAt: '2026-04-21T09:00:00Z',
  },
  {
    id: 'ft-004', issueId: 'ri-004', frId: 'pi-kivo-002', frCode: 'pi-kivo-002',
    projectSlug: 'kivo', status: 'pending', priority: 1,
    createdAt: '2026-04-22T09:30:00Z', updatedAt: '2026-04-22T09:30:00Z',
  },
  {
    id: 'ft-005', issueId: 'ri-006', frId: 'pi-kivo-001', frCode: 'pi-kivo-001',
    projectSlug: 'kivo', status: 'completed', priority: 2, assignee: 'free-code',
    createdAt: '2026-04-15T10:30:00Z', updatedAt: '2026-04-16T10:00:00Z', completedAt: '2026-04-16T10:00:00Z',
  },
];

const MOCK_REVALIDATIONS: RevalidationResultView[] = [
  {
    issueId: 'ri-002', fixTaskId: 'ft-002', frId: 'pi-sevo-001', frCode: 'pi-sevo-001',
    outcome: 'passed', message: '门禁状态持久化已修复，重启后状态恢复正常',
    reviewer: 'audit-01', revalidatedAt: '2026-04-11T14:00:00Z',
  },
  {
    issueId: 'ri-003', fixTaskId: 'ft-003', frId: 'pi-sevo-002', frCode: 'pi-sevo-002',
    outcome: 'failed', message: '第一次修复未覆盖 estimatedLines 为 undefined 的场景',
    reviewer: 'audit-01', revalidatedAt: '2026-04-21T10:00:00Z',
  },
  {
    issueId: 'ri-006', fixTaskId: 'ft-005', frId: 'pi-kivo-001', frCode: 'pi-kivo-001',
    outcome: 'passed', message: 'Markdown 表格解析已修复，覆盖多列和嵌套场景',
    reviewer: 'audit-01', revalidatedAt: '2026-04-16T11:00:00Z',
  },
];

export function getReviewTracking(): ReviewTrackingView {
  const issues = MOCK_REVIEW_ISSUES;
  const openIssues = issues.filter(i => i.status !== 'closed' && i.status !== 'waived');
  return {
    issues,
    fixTasks: MOCK_FIX_TASKS,
    revalidations: MOCK_REVALIDATIONS,
    summary: {
      totalIssues: issues.length,
      p0Open: openIssues.filter(i => i.severity === 'P0').length,
      p1Open: openIssues.filter(i => i.severity === 'P1').length,
      p2Open: openIssues.filter(i => i.severity === 'P2').length,
      p3Open: openIssues.filter(i => i.severity === 'P3').length,
      fixInProgress: MOCK_FIX_TASKS.filter(t => t.status === 'in_progress').length,
      fixCompleted: MOCK_FIX_TASKS.filter(t => t.status === 'completed').length,
      revalidationsPassed: MOCK_REVALIDATIONS.filter(r => r.outcome === 'passed').length,
      revalidationsFailed: MOCK_REVALIDATIONS.filter(r => r.outcome === 'failed').length,
    },
  };
}

// ── Config & Settings (AC-5.21 ~ AC-5.26) ──────────────────────

const STAGE_LABEL_MAP: Record<string, string> = {
  spec: '需求澄清', 'spec-review-gate': '需求评审', 'test-case-authoring': '测试设计',
  contract: '方案规划', 'contract-review-gate': '方案评审', implement: '执行落地',
  review: '质量复核', regression: '回归验证', deploy: '部署发布',
  verify: '结果确认', ledger: '交付账本', 'smoke-test': '冒烟测试',
  'ux-acceptance': 'UX 验收', 'pm-commercial-review': 'PM 商用评审',
  'publish-generalization-gate': '发布通用化门禁', 'post-release-validation': '发布后验证',
  'ux-acceptance-authoring': 'UX 评测编写', 'commercial-acceptance-authoring': '商用评测编写',
};

function buildStageConfigs(stages: StageId[]): StageConfigView[] {
  return stages.map(stageId => ({
    stageId,
    label: STAGE_LABEL_MAP[stageId] ?? stageId,
    enabled: true,
    timeoutSeconds: stageId === 'implement' ? 3600 : stageId === 'spec' ? 1800 : 600,
  }));
}

const MOCK_PRINCIPLES: PrincipleView[] = [
  {
    id: 'pr-001', name: 'Spec-Code 覆盖', description: 'spec 中每条 AC 必须有对应代码实现',
    category: 'quality', enabled: true, appliesTo: ['implement' as StageId, 'review' as StageId],
  },
  {
    id: 'pr-002', name: '开箱即用', description: '陌生用户安装后 5 分钟内能感受到核心价值',
    category: 'quality', enabled: true, appliesTo: ['verify' as StageId, 'deploy' as StageId],
  },
  {
    id: 'pr-003', name: '最小改动', description: '每一行改动都应能追溯到用户请求',
    category: 'process', enabled: true, appliesTo: ['implement' as StageId],
  },
  {
    id: 'pr-004', name: '开发审计分离', description: '开发 Agent 不能自审，必须由独立 Agent 审计',
    category: 'process', enabled: true, appliesTo: ['review' as StageId],
  },
  {
    id: 'pr-005', name: '渐进式披露', description: '用户不需要一次理解整个系统，按需逐层展开',
    category: 'architecture', enabled: true, appliesTo: ['spec' as StageId, 'contract' as StageId],
  },
  {
    id: 'pr-006', name: '安全编码', description: '参数化查询、输入验证、错误处理',
    category: 'security', enabled: true, appliesTo: ['implement' as StageId, 'review' as StageId],
  },
  {
    id: 'pr-007', name: '术语纪律', description: '意图路由必须走 LLM 推理链路，禁止关键词匹配',
    category: 'architecture', enabled: false, appliesTo: ['spec' as StageId],
  },
];

export function getDeliverableContent(deliverableId: string): { name: string; content: string; type: string; path: string } | null {
  const index = getDeliverableIndex();
  const item = index.items.find(i => i.deliverableId === deliverableId);
  if (!item) return null;

  // Generate synthetic content based on type
  let content: string;
  if (item.path.endsWith('.md')) {
    content = `# ${item.name}\n\n## ${item.frTitle}\n\n**项目**: ${item.projectSlug}  \n**阶段**: ${item.stageLabel}  \n**创建时间**: ${item.createdAt}\n\n---\n\n这是 ${item.frTitle} 在 ${item.stageLabel} 阶段产出的文档。\n\n### 概述\n\n本文档记录了 ${item.frTitle} 的关键设计决策和实现细节。\n\n### 详细内容\n\n- 需求分析完成\n- 技术方案已评审\n- 实现符合 spec 定义的 AC\n\n### 验证结果\n\n所有验收条件已通过验证。\n`;
  } else if (item.path.endsWith('.json')) {
    content = JSON.stringify({
      name: item.name,
      project: item.projectSlug,
      stage: item.stageId,
      fr: item.frCode,
      timestamp: item.createdAt,
      status: 'completed',
    }, null, 2);
  } else {
    content = `// ${item.name}\n// Project: ${item.projectSlug}\n// FR: ${item.frCode}\n// Stage: ${item.stageLabel}\n\n// Implementation file for ${item.frTitle}\n`;
  }

  return {
    name: item.name,
    content,
    type: item.type,
    path: item.path,
  };
}

export function getSettings(): SettingsView {
  const slugs = [...new Set(MOCK_PIPELINES.map(p => p.projectSlug))];
  const projects: ProjectConfigView[] = slugs.map(slug => {
    const allStages: StageId[] = ['spec','spec-review-gate','test-case-authoring','contract','contract-review-gate','implement','review','regression','deploy','verify','ledger'];
    return {
      projectSlug: slug,
      projectName: PROJECT_NAMES[slug] ?? slug,
      adapter: 'openclaw' as const,
      specPath: `projects/${slug}/docs/product-requirements.md`,
      arcPath: `projects/${slug}/docs/arc42-architecture.md`,
      stages: buildStageConfigs(allStages),
      rules: [
        { ruleId: 'spec-completeness', appliesTo: ['spec-review-gate' as StageId], severity: 'blocker' as const, description: 'Spec 必须包含所有 FR 和 AC' },
        { ruleId: 'contract-alignment', appliesTo: ['contract-review-gate' as StageId], severity: 'blocker' as const, description: '架构契约必须与 Spec 对齐' },
        { ruleId: 'test-coverage', appliesTo: ['review' as StageId], severity: 'warning' as const, description: '测试覆盖率不低于 80%' },
      ],
      principles: MOCK_PRINCIPLES,
    };
  });
  return { projects };
}
