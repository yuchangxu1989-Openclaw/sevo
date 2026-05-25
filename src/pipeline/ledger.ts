/**
 * Pipeline Event Ledger — simple append-only event log.
 *
 * Records stage lifecycle events (start, complete, fail, gate results)
 * for audit and debugging. Distinct from LedgerEngine (which records
 * pipeline-level delivery outcomes); this is the per-pipeline event trail.
 *
 * (arc42 §5.2, internal sub-module of PipelineEngine)
 */

import type { NotificationAdapter, PipelineNotificationEvent } from '../notification/notification-adapter.js';

export interface LedgerEvent {
  timestamp: string;
  pipelineId: string;
  type:
    | 'pipeline_created'
    | 'pipeline_running'
    | 'pipeline_completed'
    | 'pipeline_failed'
    | 'pipeline_blocked'
    | 'pipeline_paused'
    | 'pipeline_resumed'
    | 'pipeline_cancelled'
    | 'stage_started'
    | 'stage_completed'
    | 'stage_failed'
    | 'stage_blocked'
    | 'stage_rolled_back'
    | 'clarification_opened'
    | 'clarification_resolved'
    | 'clarification_settled'
    | 'gate_passed'
    | 'gate_rejected'
    | 'fix_attempt_initiated'
    | 'fix_attempt_completed'
    | 'fix_loop_exhausted'
    | 'artifact_passed';  // AC-4.3: inter-stage artifact flow record
  stageId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Map internal ledger event types to user-facing notification events.
 * Returns null for events that don't warrant a notification.
 */
function mapToNotificationEvent(
  type: LedgerEvent['type'],
): PipelineNotificationEvent | null {
  switch (type) {
    case 'stage_completed':     return 'stage_completed';
    case 'gate_passed':         return 'gate_passed';
    case 'gate_rejected':       return 'gate_blocked';
    case 'pipeline_completed':  return 'pipeline_completed';
    case 'pipeline_blocked':    return 'pipeline_blocked';
    case 'stage_blocked':       return 'gate_blocked';
    default:                    return null;
  }
}

/**
 * In-memory event ledger with append-only semantics.
 * Each pipeline gets its own event stream, keyed by pipelineId.
 */
export class EventLedger {
  private readonly events = new Map<string, LedgerEvent[]>();
  private notificationAdapter: NotificationAdapter | null = null;

  /** Attach a notification adapter. Events will be forwarded to it. */
  setNotificationAdapter(adapter: NotificationAdapter): void {
    this.notificationAdapter = adapter;
  }

  /** Append an event for a pipeline. */
  append(pipelineId: string, event: Omit<LedgerEvent, 'timestamp' | 'pipelineId'>): LedgerEvent {
    const full: LedgerEvent = {
      timestamp: new Date().toISOString(),
      pipelineId,
      ...event,
    };

    let list = this.events.get(pipelineId);
    if (!list) {
      list = [];
      this.events.set(pipelineId, list);
    }
    list.push(full);

    // Fire-and-forget notification for user-facing events
    if (this.notificationAdapter) {
      const notifEvent = mapToNotificationEvent(full.type);
      if (notifEvent) {
        this.notificationAdapter.notify({
          pipelineId: full.pipelineId,
          projectSlug: (full.detail?.['projectSlug'] as string) ?? full.pipelineId,
          event: notifEvent,
          stageName: full.stageId,
          summary: (full.detail?.['summary'] as string) ?? `${full.type}${full.stageId ? ` (${full.stageId})` : ''}`,
          details: full.detail,
          timestamp: full.timestamp,
        }).catch((err: unknown) => {
          console.error('[sevo:ledger] notification failed:', err);
        });
      }
    }

    return full;
  }

  /** Get the full event history for a pipeline. Returns empty array if unknown. */
  getHistory(pipelineId: string): readonly LedgerEvent[] {
    return this.events.get(pipelineId) ?? [];
  }

  /** Get events across all pipelines (most recent first). */
  getAllEvents(): readonly LedgerEvent[] {
    const all: LedgerEvent[] = [];
    for (const list of this.events.values()) {
      all.push(...list);
    }
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /** Clear all events (useful for testing). */
  clear(): void {
    this.events.clear();
  }
}
