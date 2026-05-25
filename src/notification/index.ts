/**
 * Notification module — public exports.
 */

export type {
  PipelineNotification,
  PipelineNotificationEvent,
  NotificationAdapter,
} from './notification-adapter.js';

export {
  OpenClawNotificationAdapter,
} from './openclaw-notification.js';
export type { OpenClawNotificationOptions } from './openclaw-notification.js';

export {
  StandaloneNotificationAdapter,
} from './standalone-notification.js';
