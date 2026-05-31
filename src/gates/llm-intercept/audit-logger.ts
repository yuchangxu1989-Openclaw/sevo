import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { InterceptAuditEntry } from './types.js';

/**
 * Resolve audit log path with the following precedence:
 *   1. SEVO_LLM_GATE_AUDIT_LOG env var (explicit override)
 *   2. <SEVO_PROJECTS_DIR or process.cwd()>/.sevo/logs/sevo-llm-gate-audit.jsonl
 *
 * The legacy hard-coded maintainer workspace log path was a true leak that
 * blocked stranger users from running the LLM intercept gate (permission denied
 * outside the maintainer's host).  We resolve lazily so test/CI fixtures can
 * mutate env before the first call.
 */
function resolveLogPath(): string {
  const envOverride = process.env.SEVO_LLM_GATE_AUDIT_LOG;
  if (envOverride && envOverride.length > 0) {
    return isAbsolute(envOverride) ? envOverride : join(process.cwd(), envOverride);
  }
  const projectsDir = process.env.SEVO_PROJECTS_DIR;
  const base = projectsDir && projectsDir.length > 0 ? projectsDir : process.cwd();
  return join(base, '.sevo', 'logs', 'sevo-llm-gate-audit.jsonl');
}

let cachedPath: string | null = null;
let initialized = false;

function logPath(): string {
  if (!cachedPath) cachedPath = resolveLogPath();
  return cachedPath;
}

async function ensureDir(): Promise<void> {
  if (initialized) return;
  await mkdir(dirname(logPath()), { recursive: true });
  initialized = true;
}

export async function logAudit(entry: InterceptAuditEntry): Promise<void> {
  await ensureDir();
  const line = JSON.stringify(entry) + '\n';
  await appendFile(logPath(), line, 'utf-8');
}

/** Test-only helper: reset cached path so subsequent calls re-read env. */
export function __resetAuditLoggerForTest(): void {
  cachedPath = null;
  initialized = false;
}
