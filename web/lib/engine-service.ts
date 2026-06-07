import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStageLabel } from '@/lib/stage-labels';
import type {
  ArtifactRef,
  CockpitBlocker,
  CockpitFrCoverage,
  CockpitLifecycleStatus,
  CockpitPipelineDetail,
  CockpitPipelineSummary,
  CockpitProjectDetail,
  CockpitProjectSummary,
  CockpitTimelineStage,
  DashboardStageCount,
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
  GateRuleConfigView,
  LedgerActionType,
  LedgerEntryView,
  LedgerEvidenceLink,
  LedgerView,
  MacroStageDistribution,
  PipelineInstance,
  PipelineInstanceStatus,
  PrincipleView,
  ProjectConfigView,
  RevalidationResultView,
  ReviewIssueView,
  ReviewTrackingView,
  RoutingResult,
  SettingsView,
  StageConfigView,
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
  lastAdvancedAt?: string;
  pausedStage?: string;
  pausedReason?: string;
  pausedAt?: string;
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

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SEVO_ROOT = path.resolve(MODULE_DIR, '../..');
const WORKSPACE_ROOT = process.env.SEVO_WORKSPACE_ROOT ?? path.resolve(SEVO_ROOT, '../..');
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

const VERSION_MAP = new Map<string, number>();

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
  return readEventsForPipeline(id, pi);
}

export function getEventStreamEvents(): PipelineEvent[] {
  const pipelineIds = [...new Set([...getPipelines().map((pipeline) => pipeline.instanceId), ...listPipelineStateIds()])];
  return pipelineIds
    .flatMap((id) => {
      const filePath = pipelineEventsPath(id);
      return filePath ? readJsonl(filePath) : [];
    })
    .sort((a, b) => String(a.timestamp ?? a.occurredAt ?? '').localeCompare(String(b.timestamp ?? b.occurredAt ?? '')));
}

function readEventsForPipeline(id: string, pi?: PipelineInstance): PipelineEvent[] {
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
  const stageCounts = dashboardStageCounts(pipelines);

  return {
    totalFrs: total,
    macroStageDistribution: distribution,
    healthScore,
    activeFrs,
    blockedFrs,
    completedFrs,
    failedFrs,
    stageCounts,
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

function dashboardStageCounts(pipelines: PipelineInstance[]): DashboardStageCount[] {
  const stageIds = [...new Set(pipelines.flatMap((pipeline) => pipeline.routingResult.requiredStages))];
  const sourceStageIds = stageIds.length > 0 ? stageIds : [...new Set(pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => stage.stageId)))];

  return sourceStageIds.map((stageId) => {
    const count = pipelines.filter((pipeline) => pipeline.currentStage === stageId).length;
    const macroStage = macroStageOf(stageId, pipelines.find((pipeline) => pipeline.routingResult.requiredStages.includes(stageId)));
    return {
      stageId,
      label: stageLabelOf(stageId),
      shortLabel: stageId,
      count,
      macroStage,
      hasRisk: pipelines.some((pipeline) =>
        pipeline.stages.some((stage) => stage.stageId === stageId && (stage.status === 'failed' || stage.status === 'blocked' || stage.status === 'clarification-blocked')),
      ),
    };
  });
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

// ── Cockpit projections (FR-45a) ───────────────────────────────────
//
// Read-only projection over the real pipeline runtime. The cockpit only needs
// project view + pipeline view; everything here derives from real state files
// (state/active-pipelines.json, data/pipelines/<id>/state.json,
// logs/sevo-pipeline-events.jsonl). No mock, seed or front-end invented data.

const STAGE_STATUS_PHRASES: Record<StageStatus, (label: string) => string> = {
  pending: (label) => `等待${label}`,
  active: (label) => `正在${label}`,
  blocked: (label) => `${label}受阻`,
  'clarification-blocked': (label) => `${label}等待澄清`,
  passed: (label) => `${label}已完成`,
  failed: (label) => `${label}失败`,
  skipped: (label) => `${label}已跳过`,
};

function stageStatusPhrase(stageId: string, status: StageStatus): string {
  const label = stageLabelOf(stageId);
  return (STAGE_STATUS_PHRASES[status] ?? ((l: string) => l))(label);
}

// Human-readable phrase for the pipeline's current stage (AC-45a.6).
function currentStagePhrase(pi: PipelineInstance): string {
  const stage = pi.stages.find((s) => s.stageId === pi.currentStage);
  const status: StageStatus = stage?.status ?? 'pending';
  if (pi.status === 'completed') return '流水线已完成';
  return stageStatusPhrase(pi.currentStage, status === 'pending' ? 'active' : status);
}

// Map real runtime status into the FR-45a lifecycle vocabulary (AC-45a.3).
// active-registry membership = live; state-only on disk = archived; paused or
// failure signals map to stale/failed accordingly.
function cockpitLifecycleStatus(pi: PipelineInstance, isRegistered: boolean): CockpitLifecycleStatus {
  if (pi.status === 'failed' || pi.stages.some((s) => s.status === 'failed')) return 'failed';
  if (pi.status === 'completed') return 'completed';
  if (!isRegistered) return 'archived';
  if (pi.status === 'paused' || pi.stages.some((s) => s.status === 'blocked' || s.status === 'clarification-blocked')) {
    return 'stale';
  }
  return 'active';
}

function lastAdvancedOf(pi: PipelineInstance, active?: ActivePipelineRecord, state?: PipelineStateFile | null): string | null {
  return active?.lastAdvancedAt ?? state?.lastAdvancedAt ?? pi.updatedAt ?? null;
}

function cockpitPipelineSummary(
  pi: PipelineInstance,
  isRegistered: boolean,
  active?: ActivePipelineRecord,
  state?: PipelineStateFile | null,
): CockpitPipelineSummary {
  return {
    pipelineId: pi.instanceId,
    projectSlug: pi.projectSlug,
    title: pipelineTitle(pi),
    status: cockpitLifecycleStatus(pi, isRegistered),
    currentStagePhrase: currentStagePhrase(pi),
    currentStageId: pi.currentStage,
    createdAt: pi.createdAt,
    lastAdvancedAt: lastAdvancedOf(pi, active, state),
  };
}

// Build all cockpit pipeline summaries once, tracking registry membership so
// archived (state-only) pipelines are distinguishable from live ones.
function allCockpitPipelines(): CockpitPipelineSummary[] {
  const active = activeRegistry();
  const registeredIds = new Set(Object.keys(active));
  const ids = [...new Set([...registeredIds, ...listPipelineStateIds()])];
  return ids
    .map((id) => {
      const state = readPipelineState(id);
      const pi = toPipelineInstance(id, state, active[id]);
      return cockpitPipelineSummary(pi, registeredIds.has(id), active[id], state);
    })
    .sort((a, b) => String(b.lastAdvancedAt ?? '').localeCompare(String(a.lastAdvancedAt ?? '')));
}

function maxTime(values: Array<string | null | undefined>): string | null {
  const real = values.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (real.length === 0) return null;
  return real.reduce((acc, cur) => (cur.localeCompare(acc) > 0 ? cur : acc));
}

export function getCockpitProjects(): CockpitProjectSummary[] {
  const pipelines = allCockpitPipelines();
  return getProjects()
    .map((project) => {
      const own = pipelines.filter((p) => p.projectSlug === project.projectSlug);
      const activeCount = own.filter((p) => p.status === 'active' || p.status === 'stale').length;
      return {
        projectSlug: project.projectSlug,
        projectName: project.projectName,
        activePipelineCount: activeCount,
        pipelineCount: own.length,
        lastAdvancedAt: maxTime(own.map((p) => p.lastAdvancedAt)),
      };
    })
    // Only surface projects that have at least one real pipeline. A registered
    // .sevo directory with no runtime pipeline would otherwise show 0/null,
    // which is placeholder data, not real state.
    .filter((project) => project.pipelineCount > 0);
}

// FR coverage for a project (AC-45a.2). Aggregates real frTracking/targetFRs
// across the project's live pipelines; null when no coverage data exists.
function frCoverageForProject(projectSlug: string): CockpitFrCoverage | null {
  const active = activeRegistry();
  const totals = new Set<string>();
  const completed = new Set<string>();
  let hasData = false;
  for (const record of Object.values(active)) {
    if (record.projectSlug !== projectSlug) continue;
    const tracking = record.frTracking;
    for (const fr of tracking?.total ?? []) {
      totals.add(fr);
      hasData = true;
    }
    for (const fr of tracking?.completed ?? []) {
      completed.add(fr);
      hasData = true;
    }
    for (const fr of record.targetFRs ?? []) {
      totals.add(fr);
      hasData = true;
    }
  }
  if (!hasData || totals.size === 0) return null;
  const completedInScope = [...completed].filter((fr) => totals.has(fr)).length;
  return {
    total: totals.size,
    completed: completedInScope,
    remaining: Math.max(0, totals.size - completedInScope),
  };
}

export function getCockpitProjectDetail(projectSlug: string): CockpitProjectDetail | null {
  const project = getProjects().find((p) => p.projectSlug === projectSlug);
  if (!project) return null;
  const pipelines = allCockpitPipelines().filter((p) => p.projectSlug === projectSlug);
  return {
    projectSlug: project.projectSlug,
    projectName: project.projectName,
    frCoverage: frCoverageForProject(projectSlug),
    pipelines,
  };
}

export function getCockpitPipelines(): CockpitPipelineSummary[] {
  return allCockpitPipelines();
}

// Derive the current blocker from real state (AC-45a.5). Uses pausedReason /
// pausedStage and blocked stages; returns blocked=false ("当前无阻塞") otherwise.
function cockpitBlocker(pi: PipelineInstance, state: PipelineStateFile | null): CockpitBlocker {
  const pausedReason = state?.pausedReason;
  const pausedStage = state?.pausedStage;
  if (pausedReason) {
    const stageId = pausedStage ?? pi.currentStage;
    return {
      blocked: true,
      stageId,
      stagePhrase: stageLabelOf(stageId),
      reason: pausedReason,
    };
  }
  const blockedStage = pi.stages.find(
    (s) => s.status === 'blocked' || s.status === 'clarification-blocked' || s.status === 'failed',
  );
  if (blockedStage) {
    const reasonFromBlockers = blockedStage.blockers.find(Boolean) ?? null;
    return {
      blocked: true,
      stageId: blockedStage.stageId,
      stagePhrase: stageLabelOf(blockedStage.stageId),
      reason: reasonFromBlockers ?? stageStatusPhrase(blockedStage.stageId, blockedStage.status),
    };
  }
  return { blocked: false, stageId: null, stagePhrase: null, reason: null };
}

function cockpitTimeline(pi: PipelineInstance): CockpitTimelineStage[] {
  return pi.stages.map((stage) => ({
    stageId: stage.stageId,
    label: stageLabelOf(stage.stageId),
    status: stage.status,
    statusPhrase: stageStatusPhrase(stage.stageId, stage.status),
    startedAt: stage.startedAt ?? null,
    completedAt: stage.completedAt ?? null,
    artifacts: artifactsForStage(stage),
    skipReason: stage.skipReason,
  }));
}

export function getCockpitPipelineDetail(id: string): CockpitPipelineDetail | null {
  const active = activeRegistry();
  const state = readPipelineState(id);
  if (!state && !active[id]) return null;
  const pi = toPipelineInstance(id, state, active[id]);
  const isRegistered = Object.prototype.hasOwnProperty.call(active, id);
  return {
    pipelineId: pi.instanceId,
    projectSlug: pi.projectSlug,
    projectName: projectNameOf(pi.projectSlug),
    title: pipelineTitle(pi),
    status: cockpitLifecycleStatus(pi, isRegistered),
    currentStagePhrase: currentStagePhrase(pi),
    currentStageId: pi.currentStage,
    createdAt: pi.createdAt,
    lastAdvancedAt: lastAdvancedOf(pi, active[id], state),
    timeline: cockpitTimeline(pi),
    blocker: cockpitBlocker(pi, state),
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
