/**
 * Notification Adapter — abstract interface for pipeline event notifications.
 *
 * Decoupled from any specific notification channel. Implementations provide
 * the actual delivery mechanism (Feishu/Lark, stdout, Slack, etc.).
 *
 * (FR-19, AC-19.8 / AC-19.9)
 */

/** Events that trigger user-facing notifications. */
export type PipelineNotificationEvent =
  | 'stage_completed'
  | 'gate_passed'
  | 'gate_advisory'
  | 'publish_success'
  | 'publish_failed'
  | 'liveness_passed'
  | 'liveness_p0_failed'
  | 'gap_scan_result'
  | 'pipeline_completed'
  | 'pipeline_advisory';

/** Payload delivered to a NotificationAdapter. */
export interface PipelineNotification {
  pipelineId: string;
  projectSlug: string;
  event: PipelineNotificationEvent;
  stageName?: string;
  summary: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/** Adapter interface — implement this to plug in any notification channel. */
export interface NotificationAdapter {
  notify(notification: PipelineNotification): Promise<void>;
}
