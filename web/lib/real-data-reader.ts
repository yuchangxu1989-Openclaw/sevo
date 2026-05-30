/**
 * Real data reader for SEVO dashboard — replaces mock data.
 *
 * Reads:
 * - docs/product-requirements.md → FR definitions per project
 * - docs/gap-scan-summary.json → L1 coverage status
 * - docs/gap-scan-l1.json → L1 evidence
 * - docs/gap-scan-l2.json → L2 AC coverage
 * - .sevo/notifications.jsonl → runtime notifications (optional)
 * - .sevo/gates.jsonl → runtime gate decisions (optional)
 * - .sevo/clarifications.jsonl → runtime clarifications (optional)
 * - .sevo/review-issues.jsonl → runtime review issues (optional)
 * - .sevo/fix-tasks.jsonl → runtime fix tasks (optional)
 * - .sevo/revalidations.jsonl → runtime revalidation results (optional)
 *
 * Behavior contract:
 * - When a runtime file is missing or empty, return [] (NOT mock).
 * - Pipelines are synthesized from spec + scan data per project (no mock).
 * - Falls back gracefully if any file fails to parse (returns [] for that source).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  FrMatrixView,
  FrMatrixRow,
  StageSnapshot,
  UserMacroStage,
  StageStatus,
  PipelineInstanceStatus,
  PipelineInstance,
  StageRecord,
  StageId,
  NotificationRecord,
  ClarificationBlockingLevel,
  ClarificationStatus,
  ClarificationResponseEntry,
  GateDecisionStatus,
  GateDecisionHistory,
  ReviewBundle,
  ReviewIssueView,
  FixTaskView,
  RevalidationResultView,
} from '@/types';

// ── Configuration ───────────────────────────────────────────────

/**
 * Resolve the SEVO project root.
 *
 * Production: the Next.js server runs with cwd = <project>/web, so the
 * project root is one level up. Tests/CLI may run with cwd = <project>.
 * Rather than assume a fixed depth, walk up from cwd looking for the
 * project marker (.sevo runtime dir or docs/product-requirements.md).
 */
function resolveSevoProjectRoot(): string {
  if (process.env.SEVO_PROJECT_ROOT) return process.env.SEVO_PROJECT_ROOT;

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const hasRuntime = fs.existsSync(path.join(dir, '.sevo'));
    const hasSpec = fs.existsSync(path.join(dir, 'docs', 'product-requirements.md'));
    if (hasRuntime || hasSpec) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fall back to the historical one-level-up assumption (cwd = web/).
  return path.resolve(process.cwd(), '..');
}

const SEVO_PROJECT_ROOT = resolveSevoProjectRoot();

const SPEC_PATH = path.join(SEVO_PROJECT_ROOT, 'docs/product-requirements.md');
const SCAN_SUMMARY_PATH = path.join(SEVO_PROJECT_ROOT, 'docs/gap-scan-summary.json');
const SCAN_L1_PATH = path.join(SEVO_PROJECT_ROOT, 'docs/gap-scan-l1.json');
const SCAN_L2_PATH = path.join(SEVO_PROJECT_ROOT, 'docs/gap-scan-l2.json');
const RUNTIME_DIR = path.join(SEVO_PROJECT_ROOT, '.sevo');
const NOTIFICATIONS_FILE = path.join(RUNTIME_DIR, 'notifications.jsonl');
const GATES_FILE = path.join(RUNTIME_DIR, 'gates.jsonl');
const CLARIFICATIONS_FILE = path.join(RUNTIME_DIR, 'clarifications.jsonl');
const REVIEW_ISSUES_FILE = path.join(RUNTIME_DIR, 'review-issues.jsonl');
const FIX_TASKS_FILE = path.join(RUNTIME_DIR, 'fix-tasks.jsonl');
const REVALIDATIONS_FILE = path.join(RUNTIME_DIR, 'revalidations.jsonl');

// ── Types for scan data ─────────────────────────────────────────

interface L1Entry {
  frId: string;
  status: 'covered' | 'uncovered';
  evidence: { files: string[] };
  reason?: string;
}

interface L2Entry {
  frId: string;
  acId: string;
  status: 'covered' | 'uncovered' | 'needs-review';
  confidence: number;
  evidence: { file: string; lineRange: [number, number] };
}

interface L1Report {
  pass: boolean;
  entries: L1Entry[];
}

interface L2Report {
  pass: boolean;
  entries: L2Entry[];
}

interface ParsedFR {
  frId: string;
  title: string;
  description: string;
  acCount: number;
  projectSlug: string;
}

// ── Internal types for runtime objects ──────────────────────────

export interface InternalClarification {
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

export interface InternalGate {
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

// ── Spec Parser ─────────────────────────────────────────────────

function parseSpecFRs(specPath: string, projectSlug: string = 'sevo'): ParsedFR[] {
  if (!fs.existsSync(specPath)) return [];

  const content = fs.readFileSync(specPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const frs: ParsedFR[] = [];
  let current: ParsedFR | undefined;

  for (const line of lines) {
    const frMatch = line.match(/^#{2,5}\s+(FR-\d+[A-Za-z0-9.-]*)\s+(.+)$/);
    if (frMatch?.[1]) {
      current = {
        frId: frMatch[1],
        title: (frMatch[2] ?? '').trim(),
        description: '',
        acCount: 0,
        projectSlug,
      };
      frs.push(current);
      continue;
    }

    if (!current) continue;

    const acMatch = line.match(/AC-\d+(?:\.\d+)?[A-Za-z0-9.-]*/);
    if (acMatch) {
      current.acCount += 1;
      continue;
    }

    if (line.trim() && current.description.length < 200) {
      current.description = `${current.description} ${line.trim()}`.trim();
    }
  }

  return frs;
}

// ── Scan Data Loader ────────────────────────────────────────────

function loadL1Report(): L1Report | null {
  try {
    if (!fs.existsSync(SCAN_L1_PATH)) return null;
    return JSON.parse(fs.readFileSync(SCAN_L1_PATH, 'utf8')) as L1Report;
  } catch {
    return null;
  }
}

function loadL2Report(): L2Report | null {
  try {
    if (!fs.existsSync(SCAN_L2_PATH)) return null;
    return JSON.parse(fs.readFileSync(SCAN_L2_PATH, 'utf8')) as L2Report;
  } catch {
    return null;
  }
}

// ── Generic JSONL loader ────────────────────────────────────────

function readJsonlSafe<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const out: T[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as T);
      } catch {
        // skip malformed lines
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Coverage Status Derivation ──────────────────────────────────

function deriveFrStatus(
  frId: string,
  l1: L1Report | null,
  l2: L2Report | null,
): { pipelineStatus: PipelineInstanceStatus; specifyStatus: StageStatus; planStatus: StageStatus; implementStatus: StageStatus; reviewStatus: StageStatus } {
  const l1Entry = l1?.entries.find((e) => e.frId === frId);
  const l2Entries = l2?.entries.filter((e) => e.frId === frId) ?? [];

  const hasCoverage = l1Entry?.status === 'covered';
  const l2Covered = l2Entries.filter((e) => e.status === 'covered').length;
  const l2Total = l2Entries.length;
  const l2AllCovered = l2Total > 0 && l2Covered === l2Total;

  let pipelineStatus: PipelineInstanceStatus = 'created';
  if (hasCoverage && l2AllCovered) {
    pipelineStatus = 'completed';
  } else if (hasCoverage) {
    pipelineStatus = 'active';
  } else if (l1Entry) {
    pipelineStatus = 'active';
  }

  const specifyStatus: StageStatus = 'passed';
  const planStatus: StageStatus = hasCoverage ? 'passed' : 'pending';
  const implementStatus: StageStatus = hasCoverage
    ? (l2AllCovered ? 'passed' : 'active')
    : 'pending';
  const reviewStatus: StageStatus = l2AllCovered ? 'passed' : 'pending';

  return { pipelineStatus, specifyStatus, planStatus, implementStatus, reviewStatus };
}

// ── Public API: FR Matrix ───────────────────────────────────────

const MACRO_STAGES: UserMacroStage[] = ['specify', 'plan', 'implement', 'review'];

const MACRO_STAGE_IDS: Record<UserMacroStage, StageId[]> = {
  specify: ['spec', 'spec-review-gate'],
  plan: ['test-case-authoring', 'contract', 'contract-review-gate'],
  implement: ['implement', 'review', 'regression'],
  review: ['deploy', 'verify', 'ledger'],
};

export function getRealFrMatrix(projectId: string): FrMatrixView {
  const frs = parseSpecFRs(SPEC_PATH, projectId);
  const l1 = loadL1Report();
  const l2 = loadL2Report();

  const rows: FrMatrixRow[] = frs.map((fr) => {
    const { pipelineStatus, specifyStatus, planStatus, implementStatus, reviewStatus } =
      deriveFrStatus(fr.frId, l1, l2);

    const statusMap: Record<UserMacroStage, StageStatus> = {
      specify: specifyStatus,
      plan: planStatus,
      implement: implementStatus,
      review: reviewStatus,
    };

    const stages = {} as Record<UserMacroStage, StageSnapshot>;
    for (const macro of MACRO_STAGES) {
      stages[macro] = {
        macroStage: macro,
        status: statusMap[macro],
        stageIds: MACRO_STAGE_IDS[macro] as StageId[],
      };
    }

    return {
      frId: fr.frId,
      frCode: fr.frId,
      title: fr.title,
      status: pipelineStatus,
      stages,
    };
  });

  return {
    projectId,
    projectName: 'SEVO',
    frs: rows,
  };
}

export function getRealProjectList(): {
  projectSlug: string;
  projectName: string;
  frCount: number;
  completedCount: number;
  activeCount: number;
  failedCount: number;
}[] {
  const frs = parseSpecFRs(SPEC_PATH, 'sevo');
  const l1 = loadL1Report();
  const l2 = loadL2Report();

  let completedCount = 0;
  let activeCount = 0;
  let failedCount = 0;

  for (const fr of frs) {
    const { pipelineStatus } = deriveFrStatus(fr.frId, l1, l2);
    if (pipelineStatus === 'completed') completedCount += 1;
    else if (pipelineStatus === 'active') activeCount += 1;
    else if (pipelineStatus === 'failed') failedCount += 1;
  }

  return [{
    projectSlug: 'sevo',
    projectName: 'SEVO',
    frCount: frs.length,
    completedCount,
    activeCount,
    failedCount,
  }];
}

// ── Public API: Pipelines (synthesized from spec + scan) ────────

const ALL_STAGES: StageId[] = [
  'spec',
  'spec-review-gate',
  'test-case-authoring',
  'contract',
  'contract-review-gate',
  'implement',
  'review',
  'regression',
  'deploy',
  'verify',
  'ledger',
];

function buildStage(stageId: StageId, status: StageStatus, attempt: number, timestamp: string): StageRecord {
  return {
    stageId,
    status,
    attempt,
    inputArtifacts: [],
    outputArtifacts: [],
    blockers: [],
    startedAt: status === 'pending' ? undefined : timestamp,
    completedAt: status === 'passed' || status === 'failed' ? timestamp : undefined,
    executorId: undefined,
  };
}

function synthesizePipeline(fr: ParsedFR, l1: L1Report | null, l2: L2Report | null): PipelineInstance {
  const { pipelineStatus, specifyStatus, planStatus, implementStatus, reviewStatus } =
    deriveFrStatus(fr.frId, l1, l2);

  // Resolve a synthetic timestamp from L1 evidence file mtime if available.
  let timestamp = new Date().toISOString();
  const l1Entry = l1?.entries.find((e) => e.frId === fr.frId);
  if (l1Entry && l1Entry.evidence.files.length > 0) {
    const evidenceFile = path.join(SEVO_PROJECT_ROOT, l1Entry.evidence.files[0] ?? '');
    try {
      if (fs.existsSync(evidenceFile)) {
        timestamp = fs.statSync(evidenceFile).mtime.toISOString();
      }
    } catch {
      /* keep default */
    }
  }

  // Per-stage status mapping based on macro coverage.
  const stageStatuses: Record<StageId, StageStatus> = {
    'spec': specifyStatus,
    'spec-review-gate': specifyStatus,
    'test-case-authoring': planStatus,
    'contract': planStatus,
    'contract-review-gate': planStatus,
    'implement': implementStatus,
    'review': reviewStatus,
    'regression': reviewStatus,
    'deploy': reviewStatus,
    'verify': reviewStatus,
    'ledger': pipelineStatus === 'completed' ? 'passed' : 'pending',
  };

  const stages: StageRecord[] = ALL_STAGES.map((stageId) =>
    buildStage(stageId, stageStatuses[stageId], 1, timestamp),
  );

  // Determine current stage = first non-passed stage, or last stage if all passed.
  const firstNonPassed = stages.find((s) => s.status !== 'passed');
  const currentStage: StageId = firstNonPassed ? firstNonPassed.stageId : 'ledger';

  return {
    instanceId: fr.frId,
    projectSlug: fr.projectSlug,
    status: pipelineStatus,
    routingResult: {
      taskId: `task-${fr.frId}`,
      level: 'L2+',
      requiredStages: ALL_STAGES,
      skippedStages: [],
    },
    currentStage,
    stages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

let _pipelinesCache: PipelineInstance[] | null = null;

export function getRealPipelines(): PipelineInstance[] {
  if (_pipelinesCache) return _pipelinesCache;
  const frs = parseSpecFRs(SPEC_PATH, 'sevo');
  const l1 = loadL1Report();
  const l2 = loadL2Report();
  _pipelinesCache = frs.map((fr) => synthesizePipeline(fr, l1, l2));
  return _pipelinesCache;
}

/** For tests only — clear cached synthesized pipelines so a fresh read happens. */
export function _resetPipelinesCache(): void {
  _pipelinesCache = null;
  _frTitleCache = null;
}

// ── Public API: Runtime data (notifications/gates/etc.) ─────────

export function getRealNotifications(): NotificationRecord[] {
  return readJsonlSafe<NotificationRecord>(NOTIFICATIONS_FILE);
}

export function getRealGates(): InternalGate[] {
  return readJsonlSafe<InternalGate>(GATES_FILE);
}

export function getRealClarifications(): InternalClarification[] {
  return readJsonlSafe<InternalClarification>(CLARIFICATIONS_FILE);
}

export function getRealReviewIssues(): ReviewIssueView[] {
  return readJsonlSafe<ReviewIssueView>(REVIEW_ISSUES_FILE);
}

export function getRealFixTasks(): FixTaskView[] {
  return readJsonlSafe<FixTaskView>(FIX_TASKS_FILE);
}

export function getRealRevalidations(): RevalidationResultView[] {
  return readJsonlSafe<RevalidationResultView>(REVALIDATIONS_FILE);
}

// ── Public API: Real pipeline runs (.sevo/<pipelineId>/state.json) ──
//
// Each .sevo/<pipelineId>/state.json represents one real pipeline
// execution with real artifact records. When the directory is empty,
// these accessors return [].

export interface RealPipelineArtifact {
  id: string;
  type: string;
  path: string;
  createdAt: string;
}

export interface RealPipelineStageState {
  stageId: string;
  status: string;
  artifacts: RealPipelineArtifact[];
  startedAt?: string;
  completedAt?: string;
}

export interface RealPipelineRun {
  pipelineId: string;
  projectSlug: string;
  taskId?: string;
  description: string;
  level?: string;
  status: string;
  currentStage: string | null;
  requiredStages: string[];
  stages: Record<string, RealPipelineStageState>;
  createdAt?: string;
  updatedAt?: string;
}

export function getRealPipelineRuns(): RealPipelineRun[] {
  if (!fs.existsSync(RUNTIME_DIR)) return [];
  const out: RealPipelineRun[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(RUNTIME_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateFile = path.join(RUNTIME_DIR, entry.name, 'state.json');
    if (!fs.existsSync(stateFile)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as Partial<RealPipelineRun> & {
        pipelineId?: string;
        projectSlug?: string;
        stages?: Record<string, RealPipelineStageState>;
      };
      out.push({
        pipelineId: raw.pipelineId ?? entry.name,
        projectSlug: raw.projectSlug ?? raw.pipelineId ?? entry.name,
        taskId: raw.taskId,
        description: raw.description ?? '',
        level: raw.level,
        status: raw.status ?? 'unknown',
        currentStage: raw.currentStage ?? null,
        requiredStages: raw.requiredStages ?? [],
        stages: raw.stages ?? {},
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      });
    } catch {
      // skip malformed state.json
    }
  }
  return out;
}

/**
 * Read a real artifact file from .sevo/<pipelineId>/<relPath>.
 * Returns null when the pipeline directory or file does not exist,
 * or when the resolved path escapes the pipeline directory.
 */
export function readRealArtifactFile(pipelineId: string, relPath: string): string | null {
  const safeBase = path.resolve(RUNTIME_DIR, pipelineId);
  const safeFull = path.resolve(safeBase, relPath);
  if (safeFull !== safeBase && !safeFull.startsWith(safeBase + path.sep)) return null;
  try {
    if (!fs.existsSync(safeFull)) return null;
    if (!fs.statSync(safeFull).isFile()) return null;
    return fs.readFileSync(safeFull, 'utf8');
  } catch {
    return null;
  }
}

let _frTitleCache: Map<string, string> | null = null;

export function getRealFrTitle(frId: string): string | undefined {
  if (_frTitleCache == null) {
    _frTitleCache = new Map();
    for (const fr of parseSpecFRs(SPEC_PATH, 'sevo')) {
      _frTitleCache.set(fr.frId, fr.title);
    }
  }
  return _frTitleCache.get(frId);
}

/** Expose paths for diagnostics / docs / tests. */
export const _PATHS = {
  SEVO_PROJECT_ROOT,
  SPEC_PATH,
  SCAN_SUMMARY_PATH,
  SCAN_L1_PATH,
  SCAN_L2_PATH,
  NOTIFICATIONS_FILE,
  GATES_FILE,
  CLARIFICATIONS_FILE,
  REVIEW_ISSUES_FILE,
  FIX_TASKS_FILE,
  REVALIDATIONS_FILE,
};
