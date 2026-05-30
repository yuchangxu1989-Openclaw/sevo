/**
 * Status History — records PipelineInstance status transitions (AC-3.7).
 *
 * Every status change on a PipelineInstance must go through this helper
 * to ensure the transition is appended to statusHistory.
 */

import type { PipelineInstance, PipelineInstanceStatus, StatusTransition } from '../types/index.js';

/**
 * Transition a PipelineInstance to a new status, recording the change
 * in statusHistory. Mutates the instance in place and returns it.
 *
 * @param instance - The pipeline instance to transition.
 * @param to - Target status.
 * @param trigger - What caused the transition (e.g. 'advance', 'pause', 'cancel').
 * @param now - Optional timestamp override for testing.
 */
export function transitionInstanceStatus(
  instance: PipelineInstance,
  to: PipelineInstanceStatus,
  trigger: string,
  now?: string,
): PipelineInstance {
  const timestamp = now ?? new Date().toISOString();
  const from = instance.status;

  if (from === to) return instance;

  const entry: StatusTransition = {
    from,
    to,
    timestamp,
    trigger,
  };

  if (!instance.statusHistory) {
    instance.statusHistory = [];
  }
  instance.statusHistory.push(entry);
  instance.status = to;
  instance.updatedAt = timestamp;

  return instance;
}
