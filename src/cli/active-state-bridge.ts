import * as fs from 'node:fs';
import * as path from 'node:path';

const CURRENT_SCHEMA_VERSION = 2;
const ACTIVE_PIPELINES_PATH = ['state', 'active-pipelines.json'];
const PENDING_ADVANCES_PATH = ['state', 'pending-advances.jsonl'];

interface ActivePipelinesState {
  schemaVersion?: number;
  pipelines?: Record<string, Record<string, unknown>>;
}

export interface ActiveStateRegistration {
  root: string;
  pipelineId: string;
  projectSlug: string;
  projectRoot: string;
  tier: number;
  source: string;
  instanceId?: string;
}

export interface PendingAdvanceEntry {
  root: string;
  pipelineId: string;
  projectSlug: string;
  projectRoot: string;
  stageId: string;
  source: string;
  instanceId?: string;
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(filePath);
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
}

function withFileLock<T>(lockPath: string, fn: () => T): T {
  const maxRetries = 5;
  const retryDelayMs = 100;
  let acquired = false;

  for (let index = 0; index < maxRetries; index += 1) {
    try {
      ensureDir(lockPath);
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      acquired = true;
      break;
    } catch {
      if (index < maxRetries - 1) {
        const start = Date.now();
        while (Date.now() - start < retryDelayMs) {
          // Spin-wait to match the runtime plugin lock strategy.
        }
      }
    }
  }

  try {
    return fn();
  } finally {
    if (acquired) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

function activePipelinesPath(root: string): string {
  return path.join(root, ...ACTIVE_PIPELINES_PATH);
}

function pendingAdvancesPath(root: string): string {
  return path.join(root, ...PENDING_ADVANCES_PATH);
}

function pipelinesLockPath(root: string): string {
  return path.join(root, 'state', '.pipelines.lock');
}

export function registerToActiveState(entry: ActiveStateRegistration): void {
  const filePath = activePipelinesPath(entry.root);
  const state = readJson<ActivePipelinesState>(filePath, {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pipelines: {},
  });

  state.schemaVersion = state.schemaVersion ?? CURRENT_SCHEMA_VERSION;
  state.pipelines = state.pipelines ?? {};
  state.pipelines[entry.pipelineId] = {
    ...(state.pipelines[entry.pipelineId] ?? {}),
    projectSlug: entry.projectSlug,
    projectRoot: entry.projectRoot,
    createdAt: new Date().toISOString(),
    lastAdvancedAt: new Date().toISOString(),
    tier: entry.tier,
    source: entry.source,
    instanceId: entry.instanceId,
  };

  withFileLock(pipelinesLockPath(entry.root), () => {
    writeJson(filePath, state);
  });
}

export function enqueuePendingAdvanceFile(entry: PendingAdvanceEntry): void {
  const filePath = pendingAdvancesPath(entry.root);
  ensureDir(filePath);
  fs.appendFileSync(filePath, JSON.stringify({
    pipelineId: entry.pipelineId,
    projectSlug: entry.projectSlug,
    projectRoot: entry.projectRoot,
    stageId: entry.stageId,
    enqueuedAt: new Date().toISOString(),
    enqueuedBy: entry.source,
    instanceId: entry.instanceId,
    needsBuildPrompt: true,
  }) + '\n', 'utf8');
}

// ── Reconcile: scan project pipelines dirs and backfill active-pipelines.json ──

export interface ReconcileResult {
  registered: number;
  enqueued: number;
  errors: string[];
}

/**
 * Reconcile CLI-created pipelines that missed active state registration.
 * Scans all `projects/<slug>/pipelines/*.json` under workspaceRoot,
 * registers any active instances not yet in active-pipelines.json,
 * and enqueues their first active stage to pending-advances.
 */
export function reconcileCliCreatedPipelines(workspaceRoot: string): ReconcileResult {
  const result: ReconcileResult = { registered: 0, enqueued: 0, errors: [] };
  const projectsDir = path.join(workspaceRoot, 'projects');
  if (!fs.existsSync(projectsDir)) return result;

  const filePath = activePipelinesPath(workspaceRoot);
  const state = readJson<ActivePipelinesState>(filePath, {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pipelines: {},
  });
  state.pipelines = state.pipelines ?? {};
  let dirty = false;

  let projectDirs: fs.Dirent[];
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const projEntry of projectDirs) {
    if (!projEntry.isDirectory()) continue;
    const pipelinesDir = path.join(projectsDir, projEntry.name, 'pipelines');
    if (!fs.existsSync(pipelinesDir)) continue;

    let files: string[];
    try {
      files = fs.readdirSync(pipelinesDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const instancePath = path.join(pipelinesDir, file);
        const instance = JSON.parse(fs.readFileSync(instancePath, 'utf8')) as Record<string, unknown>;

        // Only reconcile active instances
        const status = instance['status'] as string | undefined;
        if (!status || !['created', 'active', 'paused'].includes(status)) continue;

        const pipelineId = (instance['pipelineId'] ?? instance['instanceId']) as string | undefined;
        if (!pipelineId) continue;

        // Skip if already registered
        if (state.pipelines[pipelineId]) continue;

        const projectSlug = (instance['projectSlug'] as string) ?? projEntry.name;
        const routingResult = instance['routingResult'] as Record<string, unknown> | undefined;

        state.pipelines[pipelineId] = {
          projectSlug,
          projectRoot: `projects/${projEntry.name}`,
          createdAt: (instance['createdAt'] as string) ?? new Date().toISOString(),
          lastAdvancedAt: (instance['updatedAt'] as string) ?? (instance['createdAt'] as string) ?? new Date().toISOString(),
          tier: (routingResult?.['tier'] as number) ?? 3,
          source: 'reconcile-backfill',
          instanceId: instance['instanceId'] as string,
        };
        dirty = true;
        result.registered += 1;

        // Enqueue first active stage if not already pending
        const requiredStages = routingResult?.['requiredStages'] as string[] | undefined;
        if (requiredStages && requiredStages.length > 0) {
          enqueuePendingAdvanceFile({
            root: workspaceRoot,
            pipelineId,
            projectSlug,
            projectRoot: `projects/${projEntry.name}`,
            stageId: requiredStages[0]!,
            source: 'reconcile-backfill',
            instanceId: instance['instanceId'] as string,
          });
          result.enqueued += 1;
        }
      } catch (err) {
        result.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (dirty) {
    withFileLock(pipelinesLockPath(workspaceRoot), () => {
      writeJson(filePath, state);
    });
  }

  return result;
}

/**
 * Drain the pending-advances.jsonl file queue.
 * Returns entries that were queued by CLI processes.
 */
export function drainPendingAdvances(workspaceRoot: string): Array<Record<string, unknown>> {
  const filePath = pendingAdvancesPath(workspaceRoot);
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    const entries: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // Skip malformed lines
      }
    }

    // Atomic truncate after consume
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, '', 'utf8');
    fs.renameSync(tempPath, filePath);

    return entries;
  } catch {
    return [];
  }
}
