/**
 * Stage State Machine — manages the stage lifecycle, including clarification-specific blocking
 * and fix-loop states (AC-13.3).
 *
 * Valid transitions:
 *   pending                → active | skipped
 *   active                 → passed | failed | blocked | clarification-blocked | fix_pending
 *   blocked                → active          (unblock / retry)
 *   clarification-blocked  → active          (clarification settled)
 *   failed                 → active          (fix & retry)
 *   fix_pending            → active | rolled_back
 *   passed                 → active          (rollback only, guarded)
 *   rolled_back            → (terminal, no outgoing)
 *
 * Terminal states: passed, skipped, rolled_back (no outgoing transitions).
 * Note: passed → active is restricted to rollback operations only (enforced by caller).
 */

import type { StageStatus } from '../types/index.js';

const VALID_TRANSITIONS: Record<StageStatus, StageStatus[]> = {
  pending: ['active', 'skipped'],
  active: ['passed', 'failed', 'blocked', 'clarification-blocked', 'fix_pending'],
  blocked: ['active'],
  'clarification-blocked': ['active'],
  failed: ['active'],
  fix_pending: ['active', 'rolled_back'],
  passed: [],
  skipped: [],
  rolled_back: [],
};

export function isValidTransition(from: StageStatus, to: StageStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: StageStatus, to: StageStatus, opts?: { reason?: string }): void {
  // Guard: passed → active only allowed for rollback
  if (from === 'passed' && to === 'active' && opts?.reason === 'rollback') {
    return;
  }

  if (!isValidTransition(from, to)) {
    throw new Error(
      `Invalid stage transition: ${from} → ${to}. ` +
      `Allowed from '${from}': [${VALID_TRANSITIONS[from].join(', ')}]`
    );
  }
}

export function isTerminal(status: StageStatus): boolean {
  return status === 'passed' || status === 'skipped' || status === 'rolled_back';
}

export function canActivate(status: StageStatus): boolean {
  return status === 'pending' || status === 'blocked' || status === 'clarification-blocked' || status === 'failed' || status === 'fix_pending';
}
