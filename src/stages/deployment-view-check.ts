import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

// ── Types ───────────────────────────────────────────────────────

export interface ConsumerEntry {
  path: string;
  type: string;
  description: string;
  loadTest: string;
}

export interface ConsumersManifest {
  consumers: ConsumerEntry[];
}

export interface DeploymentCheckResult {
  consumer: ConsumerEntry;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface DeploymentViewReport {
  checked: boolean;
  skipped: boolean;
  skipReason?: string;
  results: DeploymentCheckResult[];
  passed: boolean;
  failedCount: number;
  totalCount: number;
}

export interface DeploymentViewOptions {
  projectRoot: string;
  skip?: boolean;
  timeoutMs?: number;
}

// ── Constants ───────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const CONSUMERS_FILENAME = 'consumers.json';

// ── Main Function ───────────────────────────────────────────────

/**
 * Check deployment view by loading and executing consumers.json loadTests.
 *
 * - If consumers.json does not exist, returns skipped (AC1).
 * - If skip option is set, returns skipped (AC5).
 * - Otherwise, runs each loadTest and collects results (AC2).
 * - Any failure = P0 blocker.
 */
export function checkDeploymentView(options: DeploymentViewOptions): DeploymentViewReport {
  const { projectRoot, skip = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (skip) {
    return {
      checked: false,
      skipped: true,
      skipReason: '--skip-deployment-check flag set',
      results: [],
      passed: true,
      failedCount: 0,
      totalCount: 0,
    };
  }

  const consumersPath = path.join(projectRoot, CONSUMERS_FILENAME);

  if (!existsSync(consumersPath)) {
    return {
      checked: false,
      skipped: true,
      skipReason: `${CONSUMERS_FILENAME} not found at ${consumersPath}`,
      results: [],
      passed: true,
      failedCount: 0,
      totalCount: 0,
    };
  }

  let manifest: ConsumersManifest;
  try {
    const raw = readFileSync(consumersPath, 'utf8');
    manifest = JSON.parse(raw) as ConsumersManifest;
  } catch (err) {
    return {
      checked: true,
      skipped: false,
      results: [],
      passed: false,
      failedCount: 1,
      totalCount: 0,
    };
  }

  if (!Array.isArray(manifest.consumers) || manifest.consumers.length === 0) {
    return {
      checked: true,
      skipped: false,
      results: [],
      passed: true,
      failedCount: 0,
      totalCount: 0,
    };
  }

  const results: DeploymentCheckResult[] = [];
  const cwd = path.dirname(consumersPath);

  for (const consumer of manifest.consumers) {
    const start = Date.now();
    try {
      execSync(consumer.loadTest, {
        cwd,
        timeout: timeoutMs,
        stdio: 'pipe',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });
      results.push({
        consumer,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        consumer,
        passed: false,
        error: message.slice(0, 500),
        durationMs: Date.now() - start,
      });
    }
  }

  const failedCount = results.filter((r) => !r.passed).length;

  return {
    checked: true,
    skipped: false,
    results,
    passed: failedCount === 0,
    failedCount,
    totalCount: results.length,
  };
}

/**
 * Format deployment view report as markdown section for review reports (AC4).
 */
export function formatDeploymentViewSection(report: DeploymentViewReport): string {
  const lines: string[] = ['## 部署视图'];

  if (report.skipped) {
    lines.push('', `跳过: ${report.skipReason}`);
    return lines.join('\n');
  }

  lines.push('', `检查结果: ${report.passed ? '✅ 全部通过' : '❌ 存在失败'}`);
  lines.push(`总计: ${report.totalCount} | 失败: ${report.failedCount}`);

  if (report.results.length > 0) {
    lines.push('', '| 组件 | 类型 | 状态 | 耗时 | 错误 |');
    lines.push('|------|------|------|------|------|');
    for (const r of report.results) {
      const status = r.passed ? '✅' : '❌';
      const error = r.error ? r.error.split('\n')[0]!.slice(0, 80) : '-';
      lines.push(`| ${r.consumer.description} | ${r.consumer.type} | ${status} | ${r.durationMs}ms | ${error} |`);
    }
  }

  return lines.join('\n');
}
