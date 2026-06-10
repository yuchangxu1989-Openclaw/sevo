/**
 * Advisory Ledger — structured, non-blocking risk record storage.
 *
 * Advisories are appended to a run's state (openAdvisories[]),
 * resolved when addressed, and listed for injection into advance prompts.
 */

import { randomUUID } from 'node:crypto';

/**
 * Append a new advisory to a run's state.
 *
 * @param {string} runId
 * @param {{ stageId: string, type: string, severity: 'info'|'warn'|'must-review', message: string, evidence?: string[] }} advisory
 * @param {object} deps - { runStore }
 * @returns {{ id: string }} The created advisory's id.
 */
export function append(runId, advisory, deps) {
  const run = deps.runStore.getRun(runId);
  if (!run) throw new Error(`advisory-ledger: run not found: ${runId}`);

  const entry = {
    id: randomUUID(),
    runId,
    stageId: advisory.stageId,
    type: advisory.type,
    severity: advisory.severity || 'info',
    message: advisory.message,
    evidence: Array.isArray(advisory.evidence) ? advisory.evidence : [],
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  const openAdvisories = [...(run.openAdvisories || []), entry];
  if (typeof deps.runStore.patchRun === 'function') {
    deps.runStore.patchRun(runId, { openAdvisories });
  }
  return { id: entry.id };
}

/**
 * Resolve an advisory by marking it with a resolution and timestamp.
 *
 * @param {string} runId
 * @param {string} advisoryId
 * @param {string} resolution
 * @param {object} deps - { runStore }
 */
export function resolve(runId, advisoryId, resolution, deps) {
  const run = deps.runStore.getRun(runId);
  if (!run) throw new Error(`advisory-ledger: run not found: ${runId}`);

  const openAdvisories = (run.openAdvisories || []).map((a) =>
    a.id === advisoryId
      ? { ...a, resolvedAt: new Date().toISOString(), resolution }
      : a
  );
  if (typeof deps.runStore.patchRun === 'function') {
    deps.runStore.patchRun(runId, { openAdvisories });
  }
}

/**
 * List all unresolved advisories for a run.
 *
 * @param {string} runId
 * @param {object} deps - { runStore }
 * @returns {Array<object>}
 */
export function listOpen(runId, deps) {
  const run = deps.runStore.getRun(runId);
  if (!run) return [];
  return (run.openAdvisories || []).filter((a) => a.resolvedAt === null);
}
