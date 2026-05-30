/**
 * Stranger-Ready Gate — FR-35 AC-35.4, AC-35.5, AC-35.6.
 *
 * A publish-stage gate that verifies the project artifact is usable
 * by a stranger (fresh install, no prior context).
 *
 * - AC-35.4: Executes `scripts/npm-stranger-verify.sh` or equivalent script
 * - AC-35.5: On failure, pipeline status → `publish-blocked`, outputs failure details
 * - AC-35.6: Skippable via `strangerVerify: false` config or `--skip-stranger-verify` flag
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ── Types ───────────────────────────────────────────────────────

/** Configuration for the Stranger-Ready Gate. */
export interface StrangerReadyGateConfig {
  /** Whether stranger verification is enabled (default: true). */
  strangerVerify?: boolean;
  /** Custom verification script path (relative to project root). */
  verifyScript?: string;
  /** Timeout for the verification script in milliseconds (default: 300000 = 5min). */
  timeoutMs?: number;
}

/** Input to the Stranger-Ready Gate evaluation. */
export interface StrangerReadyGateInput {
  /** Project root directory. */
  projectRoot: string;
  /** Pipeline instance ID. */
  pipelineId: string;
  /** Project slug. */
  projectSlug: string;
  /** Gate configuration. */
  config: StrangerReadyGateConfig;
  /** Runtime override: skip stranger verification for this run. */
  skipStrangerVerify?: boolean;
}

/** Result of the Stranger-Ready Gate evaluation. */
export interface StrangerReadyGateResult {
  /** Gate conclusion. */
  conclusion: 'passed' | 'failed' | 'skipped';
  /** Exit code from the verification script (null if skipped). */
  exitCode: number | null;
  /** Stdout from the verification script. */
  stdout: string;
  /** Stderr from the verification script (contains failure details). */
  stderr: string;
  /** Human-readable summary. */
  summary: string;
  /** Suggested fix actions when failed. */
  fixSuggestions: string[];
  /** Skip reason (only when conclusion is 'skipped'). */
  skipReason?: string;
  /** Duration of the verification in milliseconds. */
  durationMs: number;
}

/** Default verification script path. */
const DEFAULT_VERIFY_SCRIPT = 'scripts/npm-stranger-verify.sh';

/** Default timeout: 5 minutes. */
const DEFAULT_TIMEOUT_MS = 300_000;

// ── Stranger-Ready Gate ─────────────────────────────────────────

/**
 * Evaluate the Stranger-Ready Gate for a pipeline's publish stage.
 *
 * Decision flow:
 * 1. If `skipStrangerVerify` runtime flag is set → skip
 * 2. If `config.strangerVerify === false` → skip (project-level opt-out)
 * 3. Locate verification script
 * 4. Execute script in a clean environment
 * 5. Return pass/fail based on exit code
 */
export function evaluateStrangerReadyGate(input: StrangerReadyGateInput): StrangerReadyGateResult {
  const startTime = Date.now();

  // ── AC-35.6: Skip mechanism ──

  if (input.skipStrangerVerify) {
    return {
      conclusion: 'skipped',
      exitCode: null,
      stdout: '',
      stderr: '',
      summary: '陌生人验证已通过 --skip-stranger-verify 参数跳过。',
      fixSuggestions: [],
      skipReason: 'Runtime override: --skip-stranger-verify flag provided',
      durationMs: Date.now() - startTime,
    };
  }

  if (input.config.strangerVerify === false) {
    return {
      conclusion: 'skipped',
      exitCode: null,
      stdout: '',
      stderr: '',
      summary: '项目配置声明非 npm 包，跳过陌生人验证。',
      fixSuggestions: [],
      skipReason: 'Project config declares strangerVerify: false',
      durationMs: Date.now() - startTime,
    };
  }

  // ── Locate verification script ──

  const scriptRelPath = input.config.verifyScript ?? DEFAULT_VERIFY_SCRIPT;
  const scriptAbsPath = path.resolve(input.projectRoot, scriptRelPath);

  if (!fs.existsSync(scriptAbsPath)) {
    // Try workspace-level fallback
    const workspaceFallback = path.resolve(input.projectRoot, '..', '..', scriptRelPath);
    if (!fs.existsSync(workspaceFallback)) {
      return {
        conclusion: 'failed',
        exitCode: 127,
        stdout: '',
        stderr: `Verification script not found: ${scriptRelPath}\nSearched: ${scriptAbsPath}, ${workspaceFallback}`,
        summary: `陌生人验证脚本未找到: ${scriptRelPath}`,
        fixSuggestions: [
          `创建验证脚本: ${scriptRelPath}`,
          '或在项目配置中设置 strangerVerify: false 跳过验证',
          '或使用 --skip-stranger-verify 参数临时跳过',
        ],
        durationMs: Date.now() - startTime,
      };
    }
    // Use workspace fallback
    return executeVerification(workspaceFallback, input, startTime);
  }

  return executeVerification(scriptAbsPath, input, startTime);
}

export const runStrangerReadyGate = evaluateStrangerReadyGate;

/**
 * Execute the verification script and return the gate result.
 */
function executeVerification(
  scriptPath: string,
  input: StrangerReadyGateInput,
  startTime: number,
): StrangerReadyGateResult {
  const timeoutMs = input.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    // Ensure script is executable
    try {
      fs.chmodSync(scriptPath, 0o755);
    } catch {
      // Ignore chmod errors (might not have permission)
    }

    const result = execSync(`bash "${scriptPath}" "${input.projectSlug}"`, {
      cwd: input.projectRoot,
      timeout: timeoutMs,
      encoding: 'utf-8',
      env: {
        ...process.env,
        SEVO_PIPELINE_ID: input.pipelineId,
        SEVO_PROJECT_SLUG: input.projectSlug,
        SEVO_PROJECT_ROOT: input.projectRoot,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // AC-35.4: Script exited with 0 → gate passed
    return {
      conclusion: 'passed',
      exitCode: 0,
      stdout: typeof result === 'string' ? result : '',
      stderr: '',
      summary: `陌生人验证通过。项目 "${input.projectSlug}" 对陌生用户开箱即用。`,
      fixSuggestions: [],
      durationMs: Date.now() - startTime,
    };
  } catch (error: unknown) {
    // AC-35.5: Script failed → gate failed, pipeline stays in publish-blocked
    const execError = error as NodeJS.ErrnoException & {
      status?: number;
      stdout?: string;
      stderr?: string;
    };

    const exitCode = execError.status ?? 1;
    const stdout = execError.stdout ?? '';
    const stderr = execError.stderr ?? '';

    // Generate fix suggestions based on common failure patterns
    const fixSuggestions = generateFixSuggestions(stderr, exitCode);

    return {
      conclusion: 'failed',
      exitCode,
      stdout,
      stderr,
      summary: `陌生人验证失败 (exit code: ${exitCode})。Pipeline 状态将停留在 publish-blocked。`,
      fixSuggestions,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Generate fix suggestions based on failure output patterns.
 * Uses heuristic analysis of stderr content.
 */
function generateFixSuggestions(stderr: string, exitCode: number): string[] {
  const suggestions: string[] = [];

  if (exitCode === 127) {
    suggestions.push('验证脚本不存在或不可执行，请检查脚本路径');
  }

  if (stderr.includes('ENOENT') || stderr.includes('not found')) {
    suggestions.push('缺少依赖或文件，请检查 package.json 的 files 字段和 dependencies');
  }

  if (stderr.includes('permission denied') || stderr.includes('EACCES')) {
    suggestions.push('权限不足，请检查文件权限设置');
  }

  if (stderr.includes('npm ERR!') || stderr.includes('npm error')) {
    suggestions.push('npm 安装失败，请检查 package.json 配置和 npm registry 可达性');
  }

  if (stderr.includes('Cannot find module') || stderr.includes('MODULE_NOT_FOUND')) {
    suggestions.push('模块缺失，请确认所有运行时依赖已正确声明在 dependencies 中（非 devDependencies）');
  }

  if (stderr.includes('SyntaxError') || stderr.includes('TypeError')) {
    suggestions.push('代码运行时错误，请在本地执行 npm pack && npm install 验证');
  }

  if (stderr.includes('timeout') || stderr.includes('ETIMEDOUT')) {
    suggestions.push('验证超时，请检查是否有网络依赖或死循环');
  }

  if (suggestions.length === 0) {
    suggestions.push('请查看 stderr 输出定位具体失败原因');
    suggestions.push(`修复后使用 sevo gate retry <instance-id> stranger-ready 重新触发验证`);
  } else {
    suggestions.push(`修复后使用 sevo gate retry <instance-id> stranger-ready 重新触发验证`);
  }

  return suggestions;
}

/**
 * Determine if a pipeline should transition to publish-blocked status (AC-35.5).
 */
export function shouldBlockPublish(gateResult: StrangerReadyGateResult): boolean {
  return gateResult.conclusion === 'failed';
}

/**
 * Format the gate result for human-readable output.
 */
export function formatGateResult(result: StrangerReadyGateResult): string {
  const lines: string[] = [];

  lines.push(`## Stranger-Ready Gate: ${result.conclusion.toUpperCase()}`);
  lines.push('');

  if (result.conclusion === 'skipped') {
    lines.push(`跳过原因: ${result.skipReason}`);
  } else if (result.conclusion === 'passed') {
    lines.push(result.summary);
  } else {
    lines.push(result.summary);
    lines.push('');
    if (result.stderr) {
      lines.push('### 失败详情 (stderr)');
      lines.push('```');
      lines.push(result.stderr.slice(0, 2000)); // Truncate long output
      lines.push('```');
    }
    if (result.fixSuggestions.length > 0) {
      lines.push('');
      lines.push('### 修复建议');
      for (const suggestion of result.fixSuggestions) {
        lines.push(`- ${suggestion}`);
      }
    }
  }

  lines.push('');
  lines.push(`耗时: ${result.durationMs}ms`);

  return lines.join('\n');
}
