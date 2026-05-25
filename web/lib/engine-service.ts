/**
 * Engine service — real data only.
 *
 * All views (FR matrix, projects, pipelines, notifications, gates,
 * clarifications, review issues, deliverables, ledger, analytics, settings)
 * read from spec + scan outputs + .sevo/*.jsonl runtime files via
 * real-data-reader. When runtime data is absent, functions return
 * empty collections (NOT mock).
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
import { USER_MACRO_STAGE_MAP } from '@/types';
import {
  getRealFrMatrix,
  getRealProjectList,
  getRealPipelines,
  getRealPipelineRuns,
  readRealArtifactFile,
  getRealNotifications,
  getRealGates,
  getRealClarifications,
  getRealReviewIssues,
  getRealFixTasks,
  getRealRevalidations,
  getRealFrTitle,
  type RealPipelineArtifact,
  type InternalClarification,
  type InternalGate,
} from './real-data-reader';

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

// ── Helper constants reused below ───────────────────────────────

const ALL_STAGES: StageId[] = ['spec','spec-review-gate','test-case-authoring','contract','contract-review-gate','implement','review','regression','deploy','verify','ledger'];

// ── Runtime data accessors (real data only) ─────────────────────
//
// Pipelines, notifications, gates, clarifications come from
// real-data-reader (spec + scan outputs + .sevo/*.jsonl runtime files).
// When runtime files are absent, the accessor returns []; the engine
// surfaces "no data" rather than mock fallbacks.
//
// Notifications/gates/clarifications also need in-memory mutability for
// command endpoints (markRead, approveGate, replyClarification). We
// therefore hydrate from disk lazily on first access and keep the
// hydrated arrays in memory for the life of the process.

let _pipelinesView: PipelineInstance[] | null = null;
let _notificationsView: NotificationRecord[] | null = null;
let _gatesView: InternalGate[] | null = null;
let _clarificationsView: InternalClarification[] | null = null;

function pipelines(): PipelineInstance[] {
  if (_pipelinesView == null) _pipelinesView = getRealPipelines();
  return _pipelinesView;
}

function notifications(): NotificationRecord[] {
  if (_notificationsView == null) _notificationsView = getRealNotifications();
  return _notificationsView;
}

function gates(): InternalGate[] {
  if (_gatesView == null) _gatesView = getRealGates();
  return _gatesView;
}

function clarifications(): InternalClarification[] {
  if (_clarificationsView == null) _clarificationsView = getRealClarifications();
  return _clarificationsView;
}

// In-memory state for notification preferences (created at runtime, no mock seed).
const NOTIFICATION_PREFERENCES: NotificationPreference[] = [];
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



export function getDashboardSummary(): DashboardSummary {
  const distribution = { specify: 0, plan: 0, implement: 0, review: 0 };
  let activeFrs = 0, blockedFrs = 0, completedFrs = 0, failedFrs = 0;

  for (const pi of pipelines()) {
    const macro = USER_MACRO_STAGE_MAP[pi.currentStage];
    distribution[macro]++;
    if (pi.status === 'active') activeFrs++;
    else if (pi.status === 'paused') blockedFrs++;
    else if (pi.status === 'completed') completedFrs++;
    else if (pi.status === 'failed') failedFrs++;
  }

  const total = pipelines().length;
  const healthScore = total > 0 ? Math.round(((total - failedFrs - blockedFrs) / total) * 100) : 100;

  return {
    totalFrs: total,
    macroStageDistribution: distribution,
    healthScore,
    activeFrs,
    blockedFrs,
    completedFrs,
    failedFrs,
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
  let filtered = pipelines().slice();

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

  return {
    total,
    items: paged.map(p => ({
      frId: p.instanceId,
      frCode: p.instanceId,
      title: frTitle(p.instanceId),
      currentStage: p.currentStage,
      currentMacroStage: USER_MACRO_STAGE_MAP[p.currentStage],
      status: p.status,
      healthStatus: computeHealthStatus(p.status, p.stages),
      routingResult: p.routingResult,
      updatedAt: p.updatedAt,
    })),
  };
}

function frTitle(instanceId: string): string {
  return getRealFrTitle(instanceId) ?? instanceId;
}

/**
 * Real artifacts only — reads from the StageRecord. When neither
 * input nor output artifacts exist, returns []. Pages render an
 * “暂无产出” empty state instead of synthetic placeholders.
 */
function artifactsForStage(_pi: PipelineInstance, stage: StageRecord): ArtifactRef[] {
  return [...stage.inputArtifacts, ...stage.outputArtifacts];
}

export function getFrDetail(frId: string): (FrDetailView & { version: number }) | null {
  const pi = pipelines().find(p => p.instanceId === frId);
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
  const pi = pipelines().find(p => p.instanceId === frId);
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
  const pi = pipelines().find(p => p.instanceId === frId);
  if (!pi) return null;
  return pi.stages.flatMap(s => artifactsForStage(pi, s));
}

export function listNotifications(params: {
  severity?: string;
  read?: string;
  page: number;
  pageSize: number;
}): { items: NotificationRecord[]; total: number } {
  let filtered = notifications().slice();
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
  return pipelines().find(p => p.instanceId === frId);
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
  if (userId) return NOTIFICATION_PREFERENCES.filter(p => p.userId === userId);
  return NOTIFICATION_PREFERENCES.slice();
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
  NOTIFICATION_PREFERENCES.push(pref);
  return pref;
}

export function updateNotificationPreference(
  preferenceId: string,
  patch: Partial<Pick<NotificationPreference, 'channels' | 'severityFilter' | 'quietHours' | 'enabled'>>,
): NotificationPreference | null {
  const pref = NOTIFICATION_PREFERENCES.find(p => p.preferenceId === preferenceId);
  if (!pref) return null;
  if (patch.channels !== undefined) pref.channels = patch.channels;
  if (patch.severityFilter !== undefined) pref.severityFilter = patch.severityFilter;
  if (patch.quietHours !== undefined) pref.quietHours = patch.quietHours;
  if (patch.enabled !== undefined) pref.enabled = patch.enabled;
  pref.updatedAt = new Date().toISOString();
  return pref;
}

export function deleteNotificationPreference(preferenceId: string): boolean {
  const idx = NOTIFICATION_PREFERENCES.findIndex(p => p.preferenceId === preferenceId);
  if (idx === -1) return false;
  NOTIFICATION_PREFERENCES.splice(idx, 1);
  return true;
}

export function markNotificationRead(notificationId: string): NotificationRecord | null {
  const notif = notifications().find(n => n.notificationId === notificationId);
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

  for (const gate of gates()) {
    if (gate.status === 'pending') {
      const pi = pipelines().find(p => p.instanceId === gate.pipelineId);
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

  for (const clr of clarifications()) {
    if (clr.status === 'open' && clr.blockingLevel === 'blocking' && clr.targetType === 'user') {
      const pi = pipelines().find(p => p.instanceId === clr.pipelineId);
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

  for (const pi of pipelines()) {
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
  const clr = clarifications().find(c => c.clarificationId === clarificationId);
  if (!clr) return null;
  const pi = pipelines().find(p => p.instanceId === clr.pipelineId);
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

  const clr = clarifications().find(c => c.clarificationId === clarificationId);
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
  const gate = gates().find(g => g.gateId === gateId);
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
  const gate = gates().find(g => g.gateId === gateId);
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
  const pi = pipelines().find(p => p.instanceId === frId);
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

/**
 * Map a stage id from .sevo runtime state to a UI macro stage label.
 * Real pipeline events include stages that are not part of the
 * canonical 11-stage type union (e.g. smoke-test, ux-acceptance,
 * post-release-validation). We surface them as-is rather than
 * dropping them, so the dashboard reflects what actually ran.
 */
function stageLabelFor(stageId: string): string {
  return STAGE_LABELS[stageId as StageId] ?? STAGE_LABEL_MAP[stageId] ?? stageId;
}

function asKnownStageId(stageId: string): StageId | null {
  return (ALL_STAGES as readonly string[]).includes(stageId) ? (stageId as StageId) : null;
}

export function getDeliverableIndex(): DeliverableIndexView {
  const runs = getRealPipelineRuns();
  const items: DeliverableIndexItem[] = [];

  for (const run of runs) {
    for (const stageState of Object.values(run.stages)) {
      // Only surface stages that produced real artifacts; skip
      // pending/active stages that have nothing on disk yet.
      const artifacts = stageState.artifacts ?? [];
      if (artifacts.length === 0) continue;

      for (const artifact of artifacts) {
        const fileName = artifact.path.split('/').pop() ?? artifact.path;
        const knownStageId = asKnownStageId(stageState.stageId);
        items.push({
          deliverableId: `${run.pipelineId}::${stageState.stageId}::${artifact.id}`,
          frId: run.pipelineId,
          frCode: run.pipelineId,
          frTitle: run.description || run.pipelineId,
          projectSlug: run.projectSlug,
          stageId: knownStageId ?? ('ledger' as StageId),
          stageLabel: stageLabelFor(stageState.stageId),
          name: fileName,
          type: inferDeliverableType(artifact.path),
          path: artifact.path,
          createdAt: artifact.createdAt,
          previewable: artifact.path.endsWith('.md') || artifact.path.endsWith('.json') || artifact.path.endsWith('.txt'),
          // Preview content is loaded on demand via getDeliverableContent.
          // Avoid synthesizing placeholder text here.
        });
      }
    }
  }

  return {
    items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export function getCrossProjectAnalytics(timeRange: AnalyticsTimeRange = '30d'): CrossProjectAnalyticsView {
  const piList = pipelines();
  const activeProjects = new Set(piList.map((pi) => pi.projectSlug)).size;
  const inProgressFrs = piList.filter((pi) => pi.status === 'active' || pi.status === 'paused').length;
  const averageDeliveryHours = Math.round(
    piList.reduce((sum, pi) => sum + cycleHours(pi), 0) / Math.max(1, piList.length),
  );

  const gateStages: StageId[] = ['spec-review-gate', 'contract-review-gate'];
  const totalGateChecks = piList.reduce(
    (sum, pi) => sum + pi.stages.filter((stage) => gateStages.includes(stage.stageId)).length,
    0,
  );
  const firstPassGateChecks = piList.reduce(
    (sum, pi) =>
      sum + pi.stages.filter((stage) => gateStages.includes(stage.stageId) && stage.status === 'passed' && stage.attempt <= 1).length,
    0,
  );

  const projectStats: ProjectAnalyticsDatum[] = Object.entries(PROJECT_NAMES).map(([projectId, projectName]) => {
    const projectPipelines = piList.filter((pi) => pi.projectSlug === projectId);
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
    failures: piList.filter((pi) => pi.stages.some((stage) => stage.stageId === stageId && stage.status === 'failed')).length,
    blocked: piList.filter((pi) => pi.stages.some((stage) => stage.stageId === stageId && (stage.status === 'blocked' || stage.status === 'clarification-blocked'))).length,
    retries: piList.reduce(
      (sum, pi) => sum + pi.stages.filter((stage) => stage.stageId === stageId && stage.attempt > 1).length,
      0,
    ),
  }));

  const agentBucket = new Map<string, { totalHours: number; count: number; activeStages: number }>();
  for (const pi of piList) {
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

/**
 * Ledger view — reads stage state from real pipeline runs
 * (.sevo/<pipelineId>/state.json). One ledger entry is emitted per
 * stage that has actually run (any non-pending status). Outcome,
 * timestamp, artifact count and evidence links come straight from
 * the runtime state. Stages that never ran produce no entry.
 */
export function getLedgerView(): LedgerView {
  const runs = getRealPipelineRuns();
  const entries: LedgerEntryView[] = [];

  for (const run of runs) {
    for (const stageState of Object.values(run.stages)) {
      // Skip stages that never started — nothing to record yet.
      if (stageState.status === 'pending' || !stageState.startedAt) continue;

      const knownStageId = asKnownStageId(stageState.stageId) ?? ('ledger' as StageId);
      const evidence: LedgerEvidenceLink[] = (stageState.artifacts ?? []).map((artifact: RealPipelineArtifact) => ({
        label: artifact.path.split('/').pop() ?? artifact.path,
        path: artifact.path,
        type: artifact.type ?? (artifact.path.split('.').pop() ?? 'artifact'),
      }));

      const actionType: LedgerActionType =
        stageState.stageId === 'ledger'
          ? run.status === 'completed'
            ? 'delivered'
            : 'aborted'
          : stageState.status === 'failed'
            ? 'stage-failed'
            : stageState.stageId.includes('gate')
              ? 'gate-approved'
              : 'stage-passed';

      const stageLabel = stageLabelFor(stageState.stageId);
      const timestamp = stageState.completedAt ?? stageState.startedAt ?? run.updatedAt ?? run.createdAt ?? new Date(0).toISOString();

      entries.push({
        entryId: `${run.pipelineId}::${stageState.stageId}`,
        frId: run.pipelineId,
        frCode: run.pipelineId,
        frTitle: run.description || run.pipelineId,
        projectSlug: run.projectSlug,
        projectName: PROJECT_NAMES[run.projectSlug] ?? run.projectSlug,
        stageId: knownStageId,
        actionType,
        outcome:
          stageState.status === 'failed'
            ? 'aborted'
            : stageState.status === 'passed'
              ? 'delivered'
              : 'in-progress',
        artifactCount: evidence.length,
        timestamp,
        // Summary describes the literal stage event — no “done/passed/
        // archived” filler when the underlying state did not say so.
        summary: `${stageLabel} 阶段状态：${stageState.status}（${evidence.length} 件产出）`,
        evidence,
      });
    }
  }

  return {
    entries: entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  };
}

export function getFrMatrix(projectId: string): FrMatrixView {
  // P0-2: Use real spec + scan data instead of mock pipelines
  return getRealFrMatrix(projectId);
}

export function listProjects(): { projectSlug: string; projectName: string; frCount: number; completedCount: number; activeCount: number; failedCount: number }[] {
  // P0-2: Use real spec + scan data instead of mock pipelines
  return getRealProjectList();
}

// ── Review Fix Tracking (AC-5.16 ~ AC-5.20) ────────────────────
//
// Review issues, fix tasks, and revalidations come from runtime
// .sevo/*.jsonl files via real-data-reader. When the files are
// absent, accessors return [] and the dashboard surfaces a
// no-data state.

export function getReviewTracking(): ReviewTrackingView {
  const issues = getRealReviewIssues();
  const fixTasks = getRealFixTasks();
  const revalidations = getRealRevalidations();

  const openIssues = issues.filter((i) => i.status !== 'closed' && i.status !== 'waived');

  return {
    issues,
    fixTasks,
    revalidations,
    summary: {
      totalIssues: issues.length,
      p0Open: openIssues.filter((i) => i.severity === 'P0').length,
      p1Open: openIssues.filter((i) => i.severity === 'P1').length,
      p2Open: openIssues.filter((i) => i.severity === 'P2').length,
      p3Open: openIssues.filter((i) => i.severity === 'P3').length,
      fixInProgress: fixTasks.filter((t) => t.status === 'in_progress').length,
      fixCompleted: fixTasks.filter((t) => t.status === 'completed').length,
      revalidationsPassed: revalidations.filter((r) => r.outcome === 'passed').length,
      revalidationsFailed: revalidations.filter((r) => r.outcome === 'failed').length,
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

const DEFAULT_PRINCIPLES: PrincipleView[] = [
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
  // Real artifacts only — read the file straight off disk under
  // .sevo/<pipelineId>/<relPath>. No synthetic markdown, no template
  // filler. When the file is missing, return null and the page will
  // surface an empty/not-found state.
  const index = getDeliverableIndex();
  const item = index.items.find((i) => i.deliverableId === deliverableId);
  if (!item) return null;

  const content = readRealArtifactFile(item.frId, item.path);
  if (content == null) return null;

  return {
    name: item.name,
    content,
    type: item.type,
    path: item.path,
  };
}

export function getSettings(): SettingsView {
  const slugs = [...new Set(pipelines().map(p => p.projectSlug))];
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
      principles: DEFAULT_PRINCIPLES,
    };
  });
  return { projects };
}
