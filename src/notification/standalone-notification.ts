/**
 * Standalone Notification Adapter — formatted stdout output.
 *
 * Used when running SEVO outside of OpenClaw (CI, local dev, testing).
 * Outputs human-readable, structured text to stdout without external deps.
 *
 * (FR-19, AC-19.9)
 */

import type { NotificationAdapter, PipelineNotification, PipelineNotificationEvent } from './notification-adapter.js';

const EVENT_ICONS: Record<PipelineNotificationEvent, string> = {
  stage_completed:    '[DONE]',
  gate_passed:        '[PASS]',
  gate_blocked:       '[BLOCK]',
  publish_success:    '[PUBLISH OK]',
  publish_failed:     '[PUBLISH FAIL]',
  liveness_passed:    '[LIVENESS OK]',
  liveness_p0_failed: '[LIVENESS P0 FAIL]',
  gap_scan_result:    '[GAP SCAN]',
  pipeline_completed: '[PIPELINE OK]',
  pipeline_blocked:   '[PIPELINE BLOCK]',
};

function formatStdout(n: PipelineNotification): string {
  const icon = EVENT_ICONS[n.event] ?? `[${n.event.toUpperCase()}]`;
  const sep = '─'.repeat(60);
  const lines: string[] = [
    sep,
    `${icon}  ${n.projectSlug} — ${n.summary}`,
  ];

  if (n.stageName) {
    lines.push(`  Stage: ${n.stageName}`);
  }

  if (n.details && Object.keys(n.details).length > 0) {
    for (const [k, v] of Object.entries(n.details)) {
      lines.push(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    }
  }

  lines.push(`  ${n.timestamp}`, sep);
  return lines.join('\n');
}

export class StandaloneNotificationAdapter implements NotificationAdapter {
  async notify(notification: PipelineNotification): Promise<void> {
    console.log(formatStdout(notification));
  }
}
