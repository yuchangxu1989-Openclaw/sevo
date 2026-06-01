import fs from 'node:fs';
import path from 'node:path';
import { resolveStageLabel } from '@/lib/stage-labels';
import type {
  AgentEfficiencyDatum,
  AnalyticsTimeRange,
  ArtifactRef,
  ClarificationResponseEntry,
  ClarificationThreadView,
  CommandRequest,
  CrossProjectAnalyticsView,
  DashboardSummary,
  DeliverableIndexItem,
  DeliverableIndexView,
  DeliverableKind,
  FixTaskView,
  FrDetailView,
  FrMatrixRow,
  FrMatrixView,
  FrQualityView,
  FrSummaryView,
  GateDecisionHistory,
  GateDecisionStatus,
  GateDecisionView,
  GateRuleConfigView,
  LedgerActionType,
  LedgerEntryView,
  LedgerEvidenceLink,
  LedgerView,
  MacroStageDistribution,
  NotificationPreference,
  NotificationRecord,
  PipelineInstance,
  PipelineInstanceStatus,
  PrincipleView,
  ProjectAnalyticsDatum,
  ProjectConfigView,
  RevalidationResultView,
  ReviewIssueView,
  ReviewTrackingView,
  RoutingResult,
  SettingsView,
  StageConfigView,
  StageFailureDatum,
  StageId,
  StageRecord,
  StageSnapshot,
  StageStatus,
  StageTimelineEntry,
  TodoItemView,
  TodoUrgency,
  UserMacroStage,
} from '@/types';

type JsonRecord = Record<string, unknown>;

interface ActivePipelineRecord {
  projectSlug?: string;
  projectRoot?: string;
  createdAt?: string;
  updatedAt?: string;
  lastAdvancedAt?: string;
  tier?: number;
  status?: string;
  currentStage?: string;
  requiredStages?: string[];
  skippedStages?: Array<string | { stage?: string; stageId?: string; reason?: string }>;
  completedStages?: string[];
  targetFRs?: string[];
  frTracking?: {
    total?: string[];
    completed?: string[];
    remaining?: string[];
    lastUpdatedAt?: string | null;
  };
  convergenceLoop?: {
    projectGoal?: string;
  };
}

interface PipelineStateFile {
  pipelineId?: string;
  taskId?: string;
  level?: string;
  requiredStages?: string[];
  skippedStages?: Array<string | { stage?: string; stageId?: string; reason?: string }>;
  stages?: Record<string, Partial<StageRecord> & { artifacts?: RuntimeArtifact[] }>;
  currentStage?: string;
  status?: string;
  projectSlug?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RuntimeArtifact {
  id?: string;
  artifactId?: string;
  path?: string;
  type?: string;
  createdAt?: string;
  checksum?: string;
}

interface PipelineEvent {
  timestamp?: string;
  occurredAt?: string;
  type?: string;
  eventType?: string;
  pipelineId?: string;
  id?: string;
  projectSlug?: string;
  stageId?: string;
  stage?: string;
  severity?: string;
  message?: string;
  reason?: string;
  [key: string]: unknown;
}

interface ProjectProgress {
  projectSlug: string;
  filePath: string;
  progress: JsonRecord;
}

const WORKSPACE_ROOT = process.env.SEVO_WORKSPACE_ROOT ?? path.resolve(process.cwd(), '../../..');
const SEVO_ROOT = path.resolve(process.cwd(), '..');
const PROJECTS_ROOT = path.join(WORKSPACE_ROOT, 'projects');

const ACTIVE_PIPELINE_PATHS = [
  path.join(WORKSPACE_ROOT, 'state', 'active-pipelines.json'),
  path.join(SEVO_ROOT, 'state', 'active-pipelines.json'),
];

const PIPELINE_DATA_ROOTS = [
  path.join(WORKSPACE_ROOT, 'data', 'pipelines'),
  path.join(SEVO_ROOT, 'data', 'pipelines'),
];

const GLOBAL_EVENT_LOGS = [
  path.join(WORKSPACE_ROOT, 'logs', 'sevo-pipeline-events.jsonl'),
  path.join(SEVO_ROOT, 'logs', 'sevo-pipeline-events.jsonl'),
];

const PROJECT_PROGRESS_NAMES = ['sevo-progress.json'];

const REQUEST_ID_CACHE = new Map<string, number>();
const REQUEST_ID_TTL_MS = 5 * 60 * 1000;
const VERSION_MAP = new Map<string, number>();
const PREFERENCES: NotificationPreference[] = [];
let preferenceSeq = 0;

const DELIVERABLE_TYPE_MAP: Record<string, DeliverableKind> = {
  md: 'document',
  markdown: 'document',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  json: 'artifact',
  html: 'artifact',
  log: 'report',
  txt: 'report',
};

const PRINCIPLES: PrincipleView[] = [
  {
    id: 'spec-code-coverage',
    name: 'Spec-Code 覆盖',
    description: 'spec 中每条 AC 必须有对应实现与验证证据',
    category: 'quality',
    enabled: true,
    appliesTo: ['implement', 'review'],
  },
  {
    id: 'stranger-ready',
    name: '开箱即用',
    description: '外部用户安装后可以独立完成核心流程',
    category: 'quality',
    enabled: true,
    appliesTo: ['verify', 'deploy'],
  },
  {
    id: 'review-separation',
    name: '开发审计分离',
    description: '开发完成后由独立审计角色复核',
    category: 'process',
    enabled: true,
    appliesTo: ['review'],
  },
];

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readJsonl(filePath: string): PipelineEvent[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as PipelineEvent];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function firstExistingDir(paths: string[]): string | null {
  return paths.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) ?? null;
}

function normalizeStatus(value: unknown, stages: StageRecord[]): PipelineInstanceStatus {
  const raw = typeof value === 'string' ? value : undefined;
  if (raw === 'created' || raw === 'active' || raw === 'paused' || raw === 'completed' || raw === 'failed') {
    return raw;
  }
  if (stages.some((stage) => stage.status === 'failed')) return 'failed';
  if (stages.length > 0 && stages.every((stage) => stage.status === 'passed' || stage.status === 'skipped')) return 'completed';
  return 'active';
}

function normalizeStageStatus(value: unknown): StageStatus {
  if (
    value === 'pending' ||
    value === 'active' ||
    value === 'blocked' ||
    value === 'clarification-blocked' ||
    value === 'passed' ||
    value === 'failed' ||
    value === 'skipped'
  ) {
    return value;
  }
  if (value === 'completed' || value === 'done') return 'passed';
  if (value === 'running' || value === 'in_progress') return 'active';
  return 'pending';
}

function normalizeLevel(value: unknown): RoutingResult['level'] {
  return value === 'L0' || value === 'L1' || value === 'L2+' ? value : 'L2+';
}

function normalizeSkippedStages(value: PipelineStateFile['skippedStages']): RoutingResult['skippedStages'] {
  return (value ?? []).flatMap((item) => {
    if (typeof item === 'string') return [{ stage: item, reason: 'skipped by runtime state' }];
    const stage = item.stage ?? item.stageId;
    return stage ? [{ stage, reason: item.reason ?? 'skipped by runtime state' }] : [];
  });
}

function normalizeArtifact(artifact: RuntimeArtifact, fallbackId: string, fallbackTime: string): ArtifactRef | null {
  const artifactPath = artifact.path;
  if (!artifactPath) return null;
  return {
    artifactId: artifact.artifactId ?? artifact.id ?? fallbackId,
    path: artifactPath,
    type: artifact.type ?? artifactPath.split('.').pop()?.toLowerCase() ?? 'artifact',
    createdAt: artifact.createdAt ?? fallbackTime,
    checksum: artifact.checksum,
  };
}

function normalizeStageRecord(stageId: string, raw: Partial<StageRecord> & { artifacts?: RuntimeArtifact[] }, fallbackTime: string): StageRecord {
  const outputArtifacts = (raw.outputArtifacts ?? [])
    .concat((raw.artifacts ?? []).flatMap((artifact, index) => normalizeArtifact(artifact, `${stageId}-${index}`, fallbackTime) ?? []));
  return {
    stageId,
    status: normalizeStageStatus(raw.status),
    attempt: typeof raw.attempt === 'number' ? raw.attempt : 0,
    executorId: raw.executorId,
    inputArtifacts: raw.inputArtifacts ?? [],
    outputArtifacts,
    blockers: raw.blockers ?? [],
    startedAt: raw.startedAt,
    completedAt: raw.completedAt,
    skipReason: raw.skipReason,
    clarificationSummary: raw.clarificationSummary,
  };
}

function activeRegistry(): Record<string, ActivePipelineRecord> {
  for (const filePath of ACTIVE_PIPELINE_PATHS) {
    const parsed = readJsonFile<{ pipelines?: Record<string, ActivePipelineRecord> }>(filePath);
    if (parsed?.pipelines && Object.keys(parsed.pipelines).length > 0) return parsed.pipelines;
  }
  return {};
}

function pipelineStatePath(id: string): string | null {
  for (const root of PIPELINE_DATA_ROOTS) {
    const filePath = path.join(root, id, 'state.json');
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function pipelineEventsPath(id: string): string | null {
  for (const root of PIPELINE_DATA_ROOTS) {
    const filePath = path.join(root, id, 'events.jsonl');
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function readPipelineState(id: string): PipelineStateFile | null {
  const filePath = pipelineStatePath(id);
  return filePath ? readJsonFile<PipelineStateFile>(filePath) : null;
}

function stageOrderFromState(id: string, state: PipelineStateFile | null, active?: ActivePipelineRecord): string[] {
  const fromState = state?.requiredStages ?? [];
  const fromActive = active?.requiredStages ?? [];
  const fromObject = state?.stages ? Object.keys(state.stages) : [];
  return [...new Set([...fromState, ...fromActive, ...fromObject])];
}

function toPipelineInstance(id: string, state: PipelineStateFile | null, active?: ActivePipelineRecord): PipelineInstance {
  const now = new Date().toISOString();
  const updatedAt = state?.updatedAt ?? active?.updatedAt ?? active?.lastAdvancedAt ?? state?.createdAt ?? active?.createdAt ?? now;
  const stageIds = stageOrderFromState(id, state, active);
  const activeCompleted = new Set(active?.completedStages ?? []);
  const stages = stageIds.map((stageId) => {
    const raw = state?.stages?.[stageId];
    if (raw) return normalizeStageRecord(stageId, raw, updatedAt);
    return normalizeStageRecord(
      stageId,
      {
        stageId,
        status: activeCompleted.has(stageId) ? 'passed' : stageId === active?.currentStage ? 'active' : 'pending',
        artifacts: [],
      },
      updatedAt,
    );
  });

  const currentStage =
    state?.currentStage ??
    active?.currentStage ??
    stages.find((stage) => stage.status === 'active')?.stageId ??
    stages.find((stage) => stage.status !== 'passed' && stage.status !== 'skipped')?.stageId ??
    stages.at(-1)?.stageId ??
    'unknown';

  const projectSlug =
    state?.projectSlug ??
    active?.projectSlug ??
    inferProjectFromProgress(id) ??
    'unknown';

  return {
    instanceId: state?.pipelineId ?? id,
    projectSlug,
    status: normalizeStatus(state?.status ?? active?.status, stages),
    routingResult: {
      taskId: state?.taskId ?? id,
      level: normalizeLevel(state?.level ?? (active?.tier ? `L${Math.min(active.tier, 2)}+` : undefined)),
      requiredStages: stageIds,
      skippedStages: normalizeSkippedStages(state?.skippedStages ?? active?.skippedStages),
    },
    currentStage,
    stages,
    createdAt: state?.createdAt ?? active?.createdAt ?? updatedAt,
    updatedAt,
  };
}

function getVersion(instanceId: string): number {
  if (!VERSION_MAP.has(instanceId)) VERSION_MAP.set(instanceId, 1);
  return VERSION_MAP.get(instanceId)!;
}

function checkAndRecordRequestId(requestId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of REQUEST_ID_CACHE) {
    if (now - ts > REQUEST_ID_TTL_MS) REQUEST_ID_CACHE.delete(id);
  }
  if (REQUEST_ID_CACHE.has(requestId)) return false;
  REQUEST_ID_CACHE.set(requestId, now);
  return true;
}

function preflightCommand(cmd: CommandRequest): string | null {
  if (!checkAndRecordRequestId(cmd.requestId)) return 'DUPLICATE_REQUEST';
  return null;
}

function macroStageOf(stageId: string, pipeline?: PipelineInstance): UserMacroStage {
  if (stageId === 'implement') return 'implement';
  const stages = pipeline?.routingResult.requiredStages ?? pipeline?.stages.map((stage) => stage.stageId) ?? [];
  const index = stages.indexOf(stageId);
  if (index >= 0 && stages.length > 0) {
    const ratio = index / Math.max(1, stages.length - 1);
    if (ratio < 0.25) return 'specify';
    if (ratio < 0.55) return 'plan';
    if (ratio < 0.7) return 'implement';
  }
  if (stageId.includes('spec')) return 'specify';
  if (stageId.includes('contract') || stageId.includes('authoring') || stageId.includes('design')) return 'plan';
  return 'review';
}

function stageLabelOf(stageId: string): string {
  return resolveStageLabel(stageId);
}

function projectNameOf(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || slug;
}

function pipelineTitle(pi: PipelineInstance): string {
  const active = activeRegistry()[pi.instanceId];
  const goal = active?.convergenceLoop?.projectGoal;
  if (goal) return goal.split('\n').find(Boolean)?.slice(0, 120) ?? pi.instanceId;
  const targets = active?.targetFRs;
  if (targets && targets.length > 0) return `${pi.projectSlug} ${targets.join(', ')}`;
  return pi.routingResult.taskId || pi.instanceId;
}

function computeHealthStatus(status: PipelineInstanceStatus, stages: StageRecord[]): FrSummaryView['healthStatus'] {
  if (status === 'failed') return 'failed';
  if (stages.some((stage) => stage.status === 'blocked' || stage.status === 'clarification-blocked')) return 'blocked';
  if (stages.some((stage) => stage.status === 'failed')) return 'at-risk';
  return 'healthy';
}

function artifactsForStage(stage: StageRecord): ArtifactRef[] {
  return [...stage.inputArtifacts, ...stage.outputArtifacts];
}

function timelineFor(pi: PipelineInstance): StageTimelineEntry[] {
  return pi.stages.map((stage) => ({
    stageId: stage.stageId,
    macroStage: macroStageOf(stage.stageId, pi),
    status: stage.status,
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
    attempt: stage.attempt,
    artifacts: artifactsForStage(stage),
  }));
}

function listPipelineStateIds(): string[] {
  const root = firstExistingDir(PIPELINE_DATA_ROOTS);
  if (!root) return [];
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'state.json')))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function inferProjectFromProgress(pipelineId: string): string | null {
  const progress = readJsonFile<{ pipelines?: Record<string, { projectSlug?: string }> }>(path.join(WORKSPACE_ROOT, 'logs', 'sevo-progress.json'));
  return progress?.pipelines?.[pipelineId]?.projectSlug ?? null;
}

function projectProgressFiles(): ProjectProgress[] {
  try {
    if (!fs.existsSync(PROJECTS_ROOT)) return [];
    return fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      const sevoDir = path.join(PROJECTS_ROOT, entry.name, '.sevo');
      if (!fs.existsSync(sevoDir)) return [];
      return PROJECT_PROGRESS_NAMES.flatMap((name) => {
        const filePath = path.join(sevoDir, name);
        const progress = readJsonFile<JsonRecord>(filePath);
        return progress ? [{ projectSlug: entry.name, filePath, progress }] : [];
      });
    });
  } catch {
    return [];
  }
}

function allEvents(): PipelineEvent[] {
  const byFile = GLOBAL_EVENT_LOGS.flatMap(readJsonl);
  return byFile.sort((a, b) => String(b.timestamp ?? b.occurredAt ?? '').localeCompare(String(a.timestamp ?? a.occurredAt ?? '')));
}

function eventMatchesPipeline(event: PipelineEvent, id: string, pi?: PipelineInstance): boolean {
  return event.pipelineId === id || event.id === id || (!!pi && event.projectSlug === pi.projectSlug);
}

function commandUnavailable(target: string, cmd: CommandRequest): { success: boolean; error?: string } {
  const preErr = preflightCommand(cmd);
  if (preErr) return { success: false, error: preErr };
  return { success: false, error: `${target} command is not wired to the SEVO runtime yet` };
}

function waitDuration(since: string): string {
  const ms = Math.max(0, Date.now() - new Date(since).getTime());
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function urgencyFrom(since: string): TodoUrgency {
  const hours = (Date.now() - new Date(since).getTime()) / (1000 * 60 * 60);
  if (hours >= 24) return 'critical';
  if (hours >= 8) return 'high';
  if (hours >= 2) return 'medium';
  return 'low';
}

function stageStatus(pi: PipelineInstance, stageId: string): StageStatus {
  return pi.stages.find((stage) => stage.stageId === stageId)?.status ?? 'pending';
}

function cycleHours(pi: PipelineInstance): number {
  const start = pi.createdAt;
  const end = pi.updatedAt;
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)));
}

function qualityBand(pi: PipelineInstance): ProjectAnalyticsDatum['qualityDistribution'] extends infer T
  ? T extends Record<infer K, number>
    ? K
    : never
  : never {
  if (pi.status === 'failed' || pi.stages.some((stage) => stage.status === 'failed')) return 'red';
  if (pi.stages.some((stage) => stage.status === 'blocked' || stage.status === 'clarification-blocked')) return 'yellow';
  return 'green';
}

function inferDeliverableType(filePath: string): DeliverableKind {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return 'artifact';
  return DELIVERABLE_TYPE_MAP[ext] ?? 'artifact';
}

function readArtifactContent(projectSlug: string, artifactPath: string): string | null {
  const candidates = [
    path.isAbsolute(artifactPath) ? artifactPath : path.join(WORKSPACE_ROOT, artifactPath),
    path.join(PROJECTS_ROOT, projectSlug, artifactPath),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.readFileSync(candidate, 'utf8');
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function getPipelines(): PipelineInstance[] {
  const active = activeRegistry();
  const ids = [...new Set([...Object.keys(active), ...listPipelineStateIds()])];
  return ids
    .map((id) => toPipelineInstance(id, readPipelineState(id), active[id]))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPipelineDetail(id: string): PipelineInstance | null {
  const active = activeRegistry();
  const state = readPipelineState(id);
  if (!state && !active[id]) return null;
  return toPipelineInstance(id, state, active[id]);
}

export function getPipelineEvents(id: string): PipelineEvent[] {
  const pi = getPipelineDetail(id) ?? undefined;
  const local = pipelineEventsPath(id);
  const localEvents = local ? readJsonl(local) : [];
  const globalEvents = allEvents().filter((event) => eventMatchesPipeline(event, id, pi));
  return [...localEvents, ...globalEvents].sort((a, b) =>
    String(b.timestamp ?? b.occurredAt ?? '').localeCompare(String(a.timestamp ?? a.occurredAt ?? '')),
  );
}

export function getProjects(): { projectSlug: string; projectName: string; progress?: JsonRecord }[] {
  const progressByProject = new Map(projectProgressFiles().map((item) => [item.projectSlug, item.progress]));
  const pipelineSlugs = new Set(getPipelines().map((pipeline) => pipeline.projectSlug));
  try {
    if (fs.existsSync(PROJECTS_ROOT)) {
      for (const entry of fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })) {
        if (entry.isDirectory() && fs.existsSync(path.join(PROJECTS_ROOT, entry.name, '.sevo'))) {
          pipelineSlugs.add(entry.name);
        }
      }
    }
  } catch {
    return [];
  }
  return [...pipelineSlugs].sort().map((projectSlug) => ({
    projectSlug,
    projectName: projectNameOf(projectSlug),
    progress: progressByProject.get(projectSlug),
  }));
}

export function getDashboardSummary(): DashboardSummary {
  const pipelines = getPipelines();
  const distribution: MacroStageDistribution = { specify: 0, plan: 0, implement: 0, review: 0 };
  for (const pi of pipelines) distribution[macroStageOf(pi.currentStage, pi)] += 1;
  const activeFrs = pipelines.filter((pi) => pi.status === 'active').length;
  const blockedFrs = pipelines.filter((pi) => pi.status === 'paused' || computeHealthStatus(pi.status, pi.stages) === 'blocked').length;
  const completedFrs = pipelines.filter((pi) => pi.status === 'completed').length;
  const failedFrs = pipelines.filter((pi) => pi.status === 'failed').length;
  const total = pipelines.length;
  const healthScore = total > 0 ? Math.round(((total - blockedFrs - failedFrs) / total) * 100) : 100;

  return {
    totalFrs: total,
    macroStageDistribution: distribution,
    healthScore,
    activeFrs,
    blockedFrs,
    completedFrs,
    failedFrs,
    dataSources: {
      systemCall: { type: 'runtime', description: '读取 SEVO 流水线状态文件' },
      pipelineStages: { type: 'runtime', description: '读取 PipelineEngine state.json 阶段状态' },
      riskQueue: { type: 'derived', description: '由真实失败、阻断和事件日志推导' },
      runtimeMetrics: { type: 'derived', description: '由真实流水线状态聚合计算' },
    },
    trends: {
      totalFrs: { percent: 0, direction: 'flat', current: total, previous: total },
      healthScore: { percent: 0, direction: 'flat', current: healthScore, previous: healthScore },
      activeFrs: { percent: 0, direction: 'flat', current: activeFrs, previous: activeFrs },
      blockedFrs: { percent: 0, direction: 'flat', current: blockedFrs, previous: blockedFrs },
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
  let filtered = getPipelines();
  if (params.stage) filtered = filtered.filter((pipeline) => macroStageOf(pipeline.currentStage, pipeline) === params.stage);
  if (params.status) filtered = filtered.filter((pipeline) => pipeline.status === params.status);
  if (params.sort === 'updatedAt') filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const total = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  return {
    total,
    items: filtered.slice(start, start + params.pageSize).map((pi) => ({
      frId: pi.instanceId,
      frCode: pi.instanceId,
      title: pipelineTitle(pi),
      currentStage: pi.currentStage,
      currentMacroStage: macroStageOf(pi.currentStage, pi),
      status: pi.status,
      healthStatus: computeHealthStatus(pi.status, pi.stages),
      routingResult: pi.routingResult,
      updatedAt: pi.updatedAt,
    })),
  };
}

export function getFrDetail(frId: string): (FrDetailView & { version: number }) | null {
  const pi = getPipelineDetail(frId);
  if (!pi) return null;
  const artifacts = pi.stages.flatMap(artifactsForStage);
  return {
    frId: pi.instanceId,
    frCode: pi.instanceId,
    title: pipelineTitle(pi),
    currentStage: pi.currentStage,
    currentMacroStage: macroStageOf(pi.currentStage, pi),
    status: pi.status,
    routingResult: pi.routingResult,
    stageTimeline: timelineFor(pi),
    blockers: pi.stages.flatMap((stage) => stage.blockers),
    artifacts,
    createdAt: pi.createdAt,
    updatedAt: pi.updatedAt,
    version: getVersion(pi.instanceId),
  };
}

export function getFrTimeline(frId: string): StageTimelineEntry[] | null {
  const pi = getPipelineDetail(frId);
  return pi ? timelineFor(pi) : null;
}

export function getFrArtifacts(frId: string): ArtifactRef[] | null {
  const pi = getPipelineDetail(frId);
  return pi ? pi.stages.flatMap(artifactsForStage) : null;
}

export function listNotifications(params: {
  severity?: string;
  read?: string;
  page: number;
  pageSize: number;
}): { items: NotificationRecord[]; total: number } {
  const pipelinesByProject = new Map(getPipelines().map((pipeline) => [pipeline.projectSlug, pipeline]));
  let items: NotificationRecord[] = allEvents().map((event, index) => {
    const pipeline = event.pipelineId ? getPipelineDetail(event.pipelineId) : event.projectSlug ? pipelinesByProject.get(event.projectSlug) : undefined;
    const severity = event.severity === 'critical' || event.type?.includes('failed') ? 'critical' : event.severity === 'warning' ? 'warning' : 'info';
    return {
      notificationId: `${event.timestamp ?? event.occurredAt ?? index}-${event.type ?? event.eventType ?? 'event'}`,
      pipelineId: event.pipelineId ?? pipeline?.instanceId ?? event.projectSlug ?? 'runtime',
      stageId: event.stageId ?? event.stage ?? pipeline?.currentStage ?? 'runtime',
      severity,
      channel: 'web',
      title: String(event.type ?? event.eventType ?? 'SEVO runtime event'),
      message: String(event.message ?? event.reason ?? event.type ?? event.eventType ?? 'SEVO runtime event'),
      read: false,
      createdAt: String(event.timestamp ?? event.occurredAt ?? new Date().toISOString()),
    };
  });
  if (params.severity) items = items.filter((item) => item.severity === params.severity);
  if (params.read !== undefined) items = items.filter((item) => String(item.read) === params.read);
  const total = items.length;
  const start = (params.page - 1) * params.pageSize;
  return { items: items.slice(start, start + params.pageSize), total };
}

export function pauseFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  return getPipelineDetail(frId) ? commandUnavailable('pause', cmd) : { success: false, error: 'FR not found' };
}

export function resumeFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  return getPipelineDetail(frId) ? commandUnavailable('resume', cmd) : { success: false, error: 'FR not found' };
}

export function cancelFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  return getPipelineDetail(frId) ? commandUnavailable('cancel', cmd) : { success: false, error: 'FR not found' };
}

export function retryFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  return getPipelineDetail(frId) ? commandUnavailable('retry', cmd) : { success: false, error: 'FR not found' };
}

export function abandonFr(frId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  return getPipelineDetail(frId) ? commandUnavailable('abandon', cmd) : { success: false, error: 'FR not found' };
}

export function getNotificationPreferences(userId?: string): NotificationPreference[] {
  return userId ? PREFERENCES.filter((pref) => pref.userId === userId) : PREFERENCES.slice();
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
  PREFERENCES.push(pref);
  return pref;
}

export function updateNotificationPreference(
  preferenceId: string,
  patch: Partial<Pick<NotificationPreference, 'channels' | 'severityFilter' | 'quietHours' | 'enabled'>>,
): NotificationPreference | null {
  const pref = PREFERENCES.find((item) => item.preferenceId === preferenceId);
  if (!pref) return null;
  if (patch.channels !== undefined) pref.channels = patch.channels;
  if (patch.severityFilter !== undefined) pref.severityFilter = patch.severityFilter;
  if (patch.quietHours !== undefined) pref.quietHours = patch.quietHours;
  if (patch.enabled !== undefined) pref.enabled = patch.enabled;
  pref.updatedAt = new Date().toISOString();
  return pref;
}

export function deleteNotificationPreference(preferenceId: string): boolean {
  const index = PREFERENCES.findIndex((pref) => pref.preferenceId === preferenceId);
  if (index === -1) return false;
  PREFERENCES.splice(index, 1);
  return true;
}

export function markNotificationRead(notificationId: string): NotificationRecord | null {
  return listNotifications({ page: 1, pageSize: Number.MAX_SAFE_INTEGER }).items.find((item) => item.notificationId === notificationId) ?? null;
}

export function listTodos(): TodoItemView[] {
  return getPipelines()
    .filter((pi) => pi.status === 'failed' || pi.stages.some((stage) => stage.status === 'blocked' || stage.status === 'clarification-blocked' || stage.status === 'failed'))
    .map((pi) => {
      const stage = pi.stages.find((item) => item.status === 'blocked' || item.status === 'clarification-blocked' || item.status === 'failed') ?? pi.stages.find((item) => item.stageId === pi.currentStage);
      const createdAt = stage?.startedAt ?? stage?.completedAt ?? pi.updatedAt;
      return {
        todoId: `todo-${pi.instanceId}-${stage?.stageId ?? pi.currentStage}`,
        type: pi.status === 'failed' || stage?.status === 'failed' ? 'failure' : 'gate',
        frId: pi.instanceId,
        frCode: pi.instanceId,
        stageId: stage?.stageId ?? pi.currentStage,
        title: pi.status === 'failed' || stage?.status === 'failed' ? 'FR 流程异常' : '流水线阻断',
        projectSlug: pi.projectSlug,
        urgency: urgencyFrom(createdAt),
        waitDuration: waitDuration(createdAt),
        summary: `${pipelineTitle(pi)}：${stageLabelOf(stage?.stageId ?? pi.currentStage)} ${stage?.status ?? pi.status}`,
        status: 'pending',
        createdAt,
      };
    });
}

export function getClarification(clarificationId: string): ClarificationThreadView | null {
  const event = allEvents().find((item) => item.id === clarificationId || item.clarificationId === clarificationId);
  if (!event) return null;
  const pi = event.pipelineId ? getPipelineDetail(event.pipelineId) : null;
  return {
    clarificationId,
    frId: pi?.instanceId ?? String(event.pipelineId ?? 'runtime'),
    frCode: pi?.instanceId ?? String(event.pipelineId ?? 'runtime'),
    stageId: event.stageId ?? event.stage ?? pi?.currentStage ?? 'runtime',
    question: String(event.message ?? event.reason ?? 'Clarification requested'),
    blockingLevel: 'blocking',
    context: JSON.stringify(event, null, 2),
    responses: [],
    resolutionStatus: 'open',
    createdAt: String(event.timestamp ?? event.occurredAt ?? new Date().toISOString()),
  };
}

export function replyClarification(
  clarificationId: string,
  cmd: CommandRequest,
  _content: string,
): { success: boolean; error?: string } {
  return getClarification(clarificationId) ? commandUnavailable('clarification reply', cmd) : { success: false, error: 'Clarification not found' };
}

export function getGate(gateId: string): GateDecisionView | null {
  const [pipelineId, stageId] = gateId.includes('::') ? gateId.split('::') : [undefined, undefined];
  const pi = pipelineId ? getPipelineDetail(pipelineId) : getPipelines().find((pipeline) => pipeline.stages.some((stage) => `gate-${pipeline.instanceId}-${stage.stageId}` === gateId));
  const stage = stageId ? pi?.stages.find((item) => item.stageId === stageId) : pi?.stages.find((item) => item.stageId.includes('gate'));
  if (!pi || !stage) return null;
  return {
    gateId,
    gateName: stageLabelOf(stage.stageId),
    gateType: stage.stageId,
    stageId: stage.stageId,
    frId: pi.instanceId,
    frCode: pi.instanceId,
    status: stage.status === 'passed' ? 'approved' : stage.status === 'failed' ? 'rejected' : 'pending',
    reviewBundles: [],
    blockers: stage.blockers.map((item) => ({ item, owner: 'runtime' })),
    decisionHistory: [],
    createdAt: stage.startedAt ?? pi.createdAt,
  };
}

function gateCommand(gateId: string, cmd: CommandRequest): { success: boolean; error?: string } {
  return getGate(gateId) ? commandUnavailable('gate', cmd) : { success: false, error: 'Gate not found' };
}

export function approveGate(gateId: string, cmd: CommandRequest, _reason?: string): { success: boolean; error?: string } {
  return gateCommand(gateId, cmd);
}

export function rejectGate(gateId: string, cmd: CommandRequest, _reason?: string): { success: boolean; error?: string } {
  return gateCommand(gateId, cmd);
}

export function requestGateReview(gateId: string, cmd: CommandRequest, _reason?: string): { success: boolean; error?: string } {
  return gateCommand(gateId, cmd);
}

export function getFrQuality(frId: string): FrQualityView | null {
  const pi = getPipelineDetail(frId);
  if (!pi) return null;
  const issues = pi.stages
    .filter((stage) => stage.status === 'failed' || stage.status === 'blocked' || stage.status === 'clarification-blocked')
    .map((stage, index) => ({
      issueId: `${pi.instanceId}-${stage.stageId}-${index}`,
      severity: stage.status === 'failed' ? 'major' as const : 'minor' as const,
      description: `${stageLabelOf(stage.stageId)} ${stage.status}`,
      stage: stage.stageId,
      status: 'open' as const,
    }));
  const passed = pi.stages.filter((stage) => stage.status === 'passed').length;
  const qualityScore = pi.stages.length > 0 ? Math.max(0, Math.round((passed / pi.stages.length) * 100) - issues.length * 10) : 100;
  const auditStage = stageStatus(pi, 'review');
  return {
    frId: pi.instanceId,
    frCode: pi.instanceId,
    title: pipelineTitle(pi),
    qualityScore,
    testCoverage: stageStatus(pi, 'test-case-authoring') === 'passed' ? 100 : 0,
    auditStatus: auditStage === 'passed' ? 'passed' : auditStage === 'failed' ? 'failed' : auditStage === 'active' ? 'in-progress' : 'pending',
    reviewStatus: auditStage,
    regressionStatus: stageStatus(pi, 'regression'),
    verifyStatus: stageStatus(pi, 'verify'),
    issues,
  };
}

export function getDeliverableIndex(): DeliverableIndexView {
  const items: DeliverableIndexItem[] = getPipelines().flatMap((pi) =>
    pi.stages.flatMap((stage) =>
      artifactsForStage(stage).map((artifact) => ({
        deliverableId: `${pi.instanceId}::${stage.stageId}::${artifact.artifactId}`,
        frId: pi.instanceId,
        frCode: pi.instanceId,
        frTitle: pipelineTitle(pi),
        projectSlug: pi.projectSlug,
        stageId: stage.stageId,
        stageLabel: stageLabelOf(stage.stageId),
        name: artifact.path.split('/').pop() ?? artifact.path,
        type: inferDeliverableType(artifact.path),
        path: artifact.path,
        createdAt: artifact.createdAt,
        previewable: artifact.path.endsWith('.md') || artifact.path.endsWith('.txt') || artifact.path.endsWith('.json'),
      })),
    ),
  );
  return { items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

export function getCrossProjectAnalytics(timeRange: AnalyticsTimeRange = '30d'): CrossProjectAnalyticsView {
  const pipelines = getPipelines();
  const projects = getProjects();
  const activeProjects = new Set(pipelines.map((pi) => pi.projectSlug)).size;
  const inProgressFrs = pipelines.filter((pi) => pi.status === 'active' || pi.status === 'paused').length;
  const averageDeliveryHours = Math.round(pipelines.reduce((sum, pi) => sum + cycleHours(pi), 0) / Math.max(1, pipelines.length));
  const gateStages = new Set(pipelines.flatMap((pi) => pi.stages.map((stage) => stage.stageId).filter((id) => id.includes('gate'))));
  const totalGateChecks = pipelines.reduce((sum, pi) => sum + pi.stages.filter((stage) => gateStages.has(stage.stageId)).length, 0);
  const firstPassGateChecks = pipelines.reduce((sum, pi) => sum + pi.stages.filter((stage) => gateStages.has(stage.stageId) && stage.status === 'passed' && stage.attempt <= 1).length, 0);
  const projectStats: ProjectAnalyticsDatum[] = projects.map((project) => {
    const projectPipelines = pipelines.filter((pi) => pi.projectSlug === project.projectSlug);
    const totalFrs = projectPipelines.length;
    const completedFrs = projectPipelines.filter((pi) => pi.status === 'completed').length;
    const qualityDistribution = projectPipelines.reduce(
      (acc, pi) => {
        acc[qualityBand(pi)] += 1;
        return acc;
      },
      { green: 0, yellow: 0, red: 0 },
    );
    return {
      projectId: project.projectSlug,
      projectName: project.projectName,
      totalFrs,
      completedFrs,
      completionRate: totalFrs > 0 ? Math.round((completedFrs / totalFrs) * 100) : 0,
      averageCycleHours: totalFrs > 0 ? Math.round(projectPipelines.reduce((sum, pi) => sum + cycleHours(pi), 0) / totalFrs) : 0,
      qualityDistribution,
    };
  });
  const allStageIds = [...new Set(pipelines.flatMap((pi) => pi.stages.map((stage) => stage.stageId)))];
  const stageFailureHeatmap: StageFailureDatum[] = allStageIds.map((stageId) => ({
    stageId,
    failures: pipelines.filter((pi) => pi.stages.some((stage) => stage.stageId === stageId && stage.status === 'failed')).length,
    blocked: pipelines.filter((pi) => pi.stages.some((stage) => stage.stageId === stageId && (stage.status === 'blocked' || stage.status === 'clarification-blocked'))).length,
    retries: pipelines.reduce((sum, pi) => sum + pi.stages.filter((stage) => stage.stageId === stageId && stage.attempt > 1).length, 0),
  }));
  const agentBucket = new Map<string, { totalHours: number; count: number; activeStages: number }>();
  for (const pi of pipelines) {
    for (const stage of pi.stages) {
      if (!stage.executorId || !stage.startedAt) continue;
      const end = stage.completedAt ?? pi.updatedAt;
      const current = agentBucket.get(stage.executorId) ?? { totalHours: 0, count: 0, activeStages: 0 };
      current.totalHours += Math.max(1, Math.round((new Date(end).getTime() - new Date(stage.startedAt).getTime()) / (1000 * 60 * 60)));
      current.count += stage.completedAt ? 1 : 0;
      current.activeStages += !stage.completedAt && stage.status === 'active' ? 1 : 0;
      agentBucket.set(stage.executorId, current);
    }
  }
  const agentEfficiency: AgentEfficiencyDatum[] = [...agentBucket.entries()].map(([agentId, stats]) => ({
    agentId,
    averageHours: Math.round(stats.totalHours / Math.max(1, stats.count + stats.activeStages)),
    completedStages: stats.count,
    activeStages: stats.activeStages,
  }));
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
  const entries: LedgerEntryView[] = getPipelines().flatMap((pi) =>
    pi.stages
      .filter((stage) => stage.status !== 'pending')
      .map((stage) => {
        const evidence: LedgerEvidenceLink[] = artifactsForStage(stage).map((artifact) => ({
          label: artifact.path.split('/').pop() ?? artifact.path,
          path: artifact.path,
          type: artifact.type,
        }));
        const isGate = stage.stageId.includes('gate');
        const actionType: LedgerActionType =
          stage.stageId === 'ledger'
            ? pi.status === 'completed'
              ? 'delivered'
              : 'aborted'
            : stage.status === 'failed'
              ? 'stage-failed'
              : isGate
                ? 'gate-approved'
                : 'stage-passed';
        return {
          entryId: `${pi.instanceId}::${stage.stageId}`,
          frId: pi.instanceId,
          frCode: pi.instanceId,
          frTitle: pipelineTitle(pi),
          projectSlug: pi.projectSlug,
          projectName: projectNameOf(pi.projectSlug),
          stageId: stage.stageId,
          actionType,
          outcome: pi.status === 'completed' ? 'delivered' : pi.status === 'failed' ? 'aborted' : 'in-progress',
          artifactCount: evidence.length,
          timestamp: stage.completedAt ?? stage.startedAt ?? pi.updatedAt,
          summary: `${stageLabelOf(stage.stageId)} 状态：${stage.status}`,
          evidence,
        };
      }),
  );
  return { entries: entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)) };
}

export function getFrMatrix(projectId: string): FrMatrixView {
  const pipelines = getPipelines().filter((pi) => pi.projectSlug === projectId);
  const frs: FrMatrixRow[] = pipelines.map((pi) => {
    const stages = { specify: [], plan: [], implement: [], review: [] } as Record<UserMacroStage, StageRecord[]>;
    for (const stage of pi.stages) stages[macroStageOf(stage.stageId, pi)].push(stage);
    const snapshots = {} as Record<UserMacroStage, StageSnapshot>;
    for (const macro of Object.keys(stages) as UserMacroStage[]) {
      const records = stages[macro];
      let status: StageStatus = 'pending';
      if (records.some((stage) => stage.status === 'failed')) status = 'failed';
      else if (records.some((stage) => stage.status === 'blocked' || stage.status === 'clarification-blocked')) status = 'blocked';
      else if (records.some((stage) => stage.status === 'active')) status = 'active';
      else if (records.length > 0 && records.every((stage) => stage.status === 'passed' || stage.status === 'skipped')) status = 'passed';
      snapshots[macro] = { macroStage: macro, status, stageIds: records.map((stage) => stage.stageId) };
    }
    return {
      frId: pi.instanceId,
      frCode: pi.instanceId,
      title: pipelineTitle(pi),
      status: pi.status,
      stages: snapshots,
    };
  });
  return { projectId, projectName: projectNameOf(projectId), frs };
}

export function listProjects(): { projectSlug: string; projectName: string; frCount: number; completedCount: number; activeCount: number; failedCount: number }[] {
  const pipelines = getPipelines();
  return getProjects().map((project) => {
    const projectPipelines = pipelines.filter((pi) => pi.projectSlug === project.projectSlug);
    return {
      projectSlug: project.projectSlug,
      projectName: project.projectName,
      frCount: projectPipelines.length,
      completedCount: projectPipelines.filter((pi) => pi.status === 'completed').length,
      activeCount: projectPipelines.filter((pi) => pi.status === 'active').length,
      failedCount: projectPipelines.filter((pi) => pi.status === 'failed').length,
    };
  });
}

export function getReviewTracking(): ReviewTrackingView {
  const issues: ReviewIssueView[] = getPipelines().flatMap((pi) =>
    pi.stages
      .filter((stage) => stage.status === 'failed' || stage.status === 'blocked' || stage.status === 'clarification-blocked')
      .map((stage, index) => ({
        id: `${pi.instanceId}-${stage.stageId}-${index}`,
        severity: stage.status === 'failed' ? 'P1' : 'P2',
        status: 'open',
        frId: pi.instanceId,
        frCode: pi.instanceId,
        projectSlug: pi.projectSlug,
        artifact: stage.outputArtifacts[0]?.path ?? stage.stageId,
        fixDescription: `${stageLabelOf(stage.stageId)} ${stage.status}`,
        dimension: 'quality',
        createdAt: stage.completedAt ?? stage.startedAt ?? pi.updatedAt,
        updatedAt: pi.updatedAt,
        attemptCount: stage.attempt,
        maxAttempts: 3,
      })),
  );
  const fixTasks: FixTaskView[] = [];
  const revalidations: RevalidationResultView[] = [];
  return {
    issues,
    fixTasks,
    revalidations,
    summary: {
      totalIssues: issues.length,
      p0Open: issues.filter((issue) => issue.severity === 'P0').length,
      p1Open: issues.filter((issue) => issue.severity === 'P1').length,
      p2Open: issues.filter((issue) => issue.severity === 'P2').length,
      p3Open: issues.filter((issue) => issue.severity === 'P3').length,
      fixInProgress: 0,
      fixCompleted: 0,
      revalidationsPassed: 0,
      revalidationsFailed: 0,
    },
  };
}

export function getDeliverableContent(deliverableId: string): { name: string; content: string; type: string; path: string } | null {
  const item = getDeliverableIndex().items.find((candidate) => candidate.deliverableId === deliverableId);
  if (!item) return null;
  const content = readArtifactContent(item.projectSlug, item.path);
  if (content == null) return null;
  return { name: item.name, content, type: item.type, path: item.path };
}

function buildStageConfigs(stages: StageId[]): StageConfigView[] {
  return stages.map((stageId) => ({
    stageId,
    label: stageLabelOf(stageId),
    enabled: true,
    timeoutSeconds: stageId === 'implement' ? 3600 : stageId.includes('review') || stageId.includes('gate') ? 1200 : 600,
  }));
}

function gateRulesFor(stages: StageId[]): GateRuleConfigView[] {
  return stages
    .filter((stageId) => stageId.includes('gate') || stageId.includes('review') || stageId === 'verify')
    .map((stageId) => ({
      ruleId: `${stageId}-runtime-rule`,
      appliesTo: [stageId],
      severity: stageId.includes('gate') ? 'blocker' : 'warning',
      description: `${stageLabelOf(stageId)} runtime gate`,
    }));
}

export function getSettings(): SettingsView {
  const pipelines = getPipelines();
  const projects: ProjectConfigView[] = getProjects().map((project) => {
    const projectPipelines = pipelines.filter((pi) => pi.projectSlug === project.projectSlug);
    const stages = [...new Set(projectPipelines.flatMap((pi) => pi.routingResult.requiredStages))];
    return {
      projectSlug: project.projectSlug,
      projectName: project.projectName,
      adapter: 'openclaw',
      specPath: `projects/${project.projectSlug}/docs/product-requirements.md`,
      arcPath: `projects/${project.projectSlug}/docs/architecture/arc42-architecture.md`,
      stages: buildStageConfigs(stages),
      rules: gateRulesFor(stages),
      principles: PRINCIPLES,
    };
  });
  return { projects };
}
