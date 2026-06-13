/**
 * OpenClaw Notification Adapter — delivers pipeline notifications via Feishu/Lark.
 *
 * Uses lark-cli (installed at /usr/bin/lark-cli) to send markdown messages.
 * Falls back to console.log if lark-cli is unavailable or the send fails.
 *
 * (FR-19, AC-19.9)
 */

import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import type { NotificationAdapter, PipelineNotification, PipelineNotificationEvent } from './notification-adapter.js';

const LARK_CLI_PATH = '/usr/bin/lark-cli';

export interface OpenClawNotificationOptions {
  /** Feishu user ID of the notification recipient. */
  userId: string;
  /** Override lark-cli path (mainly for testing). */
  larkCliPath?: string;
}

/** Emoji + label mapping for each event type. */
const EVENT_LABELS: Record<PipelineNotificationEvent, { emoji: string; label: string }> = {
  stage_completed:    { emoji: '✅', label: '阶段完成' },
  gate_passed:        { emoji: '🟢', label: '门禁通过' },
  gate_advisory:      { emoji: '🟡', label: '门禁建议' },
  publish_success:    { emoji: '🚀', label: '发布成功' },
  publish_failed:     { emoji: '❌', label: '发布失败' },
  liveness_passed:    { emoji: '💚', label: 'Liveness 通过' },
  liveness_p0_failed: { emoji: '🚨', label: 'Liveness P0 失败' },
  gap_scan_result:    { emoji: '🔍', label: '差距扫描' },
  pipeline_completed: { emoji: '🎉', label: '流水线完成' },
  pipeline_advisory:  { emoji: '🟡', label: '流水线建议' },
};

/** Format a PipelineNotification into a user-friendly markdown string. */
function formatMarkdown(n: PipelineNotification): string {
  const meta = EVENT_LABELS[n.event] ?? { emoji: 'ℹ️', label: n.event };
  const lines: string[] = [
    `${meta.emoji} **SEVO ${meta.label}**`,
    '',
    `**项目**: ${n.projectSlug}`,
  ];

  if (n.stageName) {
    lines.push(`**阶段**: ${n.stageName}`);
  }

  lines.push(`**摘要**: ${n.summary}`);

  if (n.details && Object.keys(n.details).length > 0) {
    lines.push('');
    for (const [k, v] of Object.entries(n.details)) {
      lines.push(`- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    }
  }

  lines.push('', `_${n.timestamp}_`);
  return lines.join('\n');
}

/** Check whether lark-cli binary exists and is executable. */
async function isLarkCliAvailable(cliPath: string): Promise<boolean> {
  try {
    await access(cliPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Send a markdown message via lark-cli. Returns true on success. */
function sendViaLarkCli(cliPath: string, userId: string, markdown: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      cliPath,
      ['im', '+messages-send', '--user-id', userId, '--markdown', markdown],
      { timeout: 15_000 },
      (error) => {
        if (error) {
          console.error(`[sevo:notification] lark-cli send failed: ${error.message}`);
          resolve(false);
        } else {
          resolve(true);
        }
      },
    );
  });
}

export class OpenClawNotificationAdapter implements NotificationAdapter {
  private readonly userId: string;
  private readonly cliPath: string;

  constructor(options: OpenClawNotificationOptions) {
    this.userId = options.userId;
    this.cliPath = options.larkCliPath ?? LARK_CLI_PATH;
  }

  async notify(notification: PipelineNotification): Promise<void> {
    const markdown = formatMarkdown(notification);

    const available = await isLarkCliAvailable(this.cliPath);
    if (!available) {
      console.log(`[sevo:notification] lark-cli not available, fallback to stdout`);
      console.log(markdown);
      return;
    }

    const ok = await sendViaLarkCli(this.cliPath, this.userId, markdown);
    if (!ok) {
      // Fallback: at least print to stdout so the message isn't lost
      console.log(`[sevo:notification] lark-cli failed, fallback to stdout`);
      console.log(markdown);
    }
  }
}
