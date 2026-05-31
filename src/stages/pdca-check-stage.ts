import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

import type {
  PdcaLivenessConfig,
  PdcaLivenessGoal,
  PdcaLivenessProject,
  PdcaProbeResult,
  PdcaCheckReport,
  PdcaCheckOutput,
  PdcaFailureTask,
  PdcaTaskAdapter,
  PdcaCheckRunnerOptions,
  PdcaSeverity,
  LlmProbeContext,
  LlmProbeResult,
} from './pdca-check-types.js';
import { resolveOpenclawConfigPath } from '../utils/path-defaults.js';

// NFR-5.18: 不再硬编码维护者机器上的 openclaw.json。
// configPath 缺省时通过 ENV (`OPENCLAW_CONFIG_PATH` / `OPENCLAW_CONFIG`) 或 cwd 向上 findUpward 解析。
function defaultOpenclawConfigPath(): string | null {
  return resolveOpenclawConfigPath();
}

// ── Built-in Probe Functions (AC-20.5) ──────────────────────────

/**
 * Check that a log file was modified within `window` and contains `keyword`.
 * Window format: 24h / 1h / 30m / 7d etc.
 */
export async function checkLogRecent(
  file: string,
  keyword: string,
  window: string,
): Promise<{ passed: boolean; output: string }> {
  if (!existsSync(file)) {
    return { passed: false, output: `日志文件不存在: ${file}` };
  }

  const seconds = parseTimeWindow(window);
  if (seconds === null) {
    return { passed: false, output: `无法解析时间窗口: ${window}` };
  }

  const cutoff = Date.now() - seconds * 1000;
  const fileStat = await stat(file);
  if (fileStat.mtimeMs < cutoff) {
    return { passed: false, output: `日志文件最后修改时间超出 ${window} 窗口` };
  }

  const content = await readFile(file, 'utf8');
  const lines = content.split('\n').filter((l) => l.includes(keyword));
  if (lines.length > 0) {
    return { passed: true, output: `找到 ${lines.length} 条 '${keyword}' 记录（文件在 ${window} 内有更新）` };
  }
  return { passed: false, output: `日志文件中未找到关键词 '${keyword}'` };
}

/**
 * Execute a SQL query against a SQLite database and verify result >= minValue.
 */
export async function checkSqlite(
  db: string,
  query: string,
  minValue: number,
  execCommand?: PdcaCheckRunnerOptions['execCommand'],
): Promise<{ passed: boolean; output: string }> {
  // P1-04: Verify python3 is available before attempting SQLite probe
  try {
    execSync('which python3', { encoding: 'utf8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return { passed: false, output: 'python3 not found, required for SQLite probe' };
  }

  if (!existsSync(db)) {
    return { passed: false, output: `数据库文件不存在: ${db}` };
  }

  const escapedQuery = query.replace(/"/g, '\\"');
  const escapedDb = db.replace(/'/g, "'\\''");
  const cmd = `python3 -c "import sqlite3; conn=sqlite3.connect('${escapedDb}'); val=conn.cursor().execute(\\"${escapedQuery}\\").fetchone()[0]; print(val)"`;

  try {
    const result = execCommand
      ? await execCommand(cmd)
      : { stdout: execSync(cmd, { encoding: 'utf8', timeout: 10_000 }).trim(), exitCode: 0 };

    const val = Number(result.stdout.trim());
    if (Number.isNaN(val)) {
      return { passed: false, output: `查询结果非数值: ${result.stdout.trim()}` };
    }
    if (val >= minValue) {
      return { passed: true, output: `查询结果 ${val} >= 阈值 ${minValue}` };
    }
    return { passed: false, output: `查询结果 ${val} < 阈值 ${minValue}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { passed: false, output: `查询执行失败: ${msg}` };
  }
}

/**
 * Verify an npm package is published with version >= minVersion.
 */
export async function checkNpmVersion(
  packageName: string,
  minVersion: string,
  execCommand?: PdcaCheckRunnerOptions['execCommand'],
): Promise<{ passed: boolean; output: string }> {
  const cmd = `npm view ${packageName} version 2>/dev/null`;
  try {
    const result = execCommand
      ? await execCommand(cmd)
      : { stdout: execSync(cmd, { encoding: 'utf8', timeout: 30_000 }).trim(), exitCode: 0 };

    const current = result.stdout.trim();
    if (!current) {
      return { passed: false, output: `npm 包 '${packageName}' 未找到或无法访问 registry` };
    }

    if (semverGte(current, minVersion)) {
      return { passed: true, output: `${packageName}@${current} >= ${minVersion}` };
    }
    return { passed: false, output: `${packageName}@${current} < ${minVersion}` };
  } catch {
    return { passed: false, output: `npm 包 '${packageName}' 未找到或无法访问 registry` };
  }
}

/**
 * Verify a file exists and is non-empty.
 */
export async function checkFileExists(
  filePath: string,
): Promise<{ passed: boolean; output: string }> {
  if (!existsSync(filePath)) {
    return { passed: false, output: `文件不存在: ${filePath}` };
  }
  const fileStat = await stat(filePath);
  if (fileStat.size === 0) {
    return { passed: false, output: `file exists but is empty: ${filePath}` };
  }
  return { passed: true, output: `文件存在 (${fileStat.size} bytes)` };
}

/**
 * Verify a hook is registered and enabled in openclaw.json.
 */
export async function checkHookRegistered(
  hookName: string,
  configPath?: string,
): Promise<{ passed: boolean; output: string }> {
  const resolved = configPath ?? defaultOpenclawConfigPath();
  if (!resolved) {
    return {
      passed: false,
      output:
        'openclaw.json 未找到：请通过 OPENCLAW_CONFIG_PATH / OPENCLAW_CONFIG 环境变量或 configPath 参数指定。',
    };
  }
  if (!existsSync(resolved)) {
    return { passed: false, output: `openclaw.json 不存在: ${resolved}` };
  }

  try {
    const raw = await readFile(resolved, 'utf8');
    const cfg = JSON.parse(raw) as Record<string, unknown>;
    const hooks = (cfg['hooks'] ?? {}) as Record<string, Record<string, unknown>>;

    for (const [groupName, group] of Object.entries(hooks)) {
      const entries = (group['entries'] ?? {}) as Record<string, Record<string, unknown>>;
      if (hookName in entries) {
        const entry = entries[hookName]!;
        if (entry['enabled'] === true) {
          return { passed: true, output: `hook ${hookName} 已注册且 enabled (group=${groupName})` };
        }
        return { passed: false, output: `hook ${hookName} 已注册但 enabled=false (group=${groupName})` };
      }
    }
    return { passed: false, output: `hook ${hookName} 未在 openclaw.json 中注册` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { passed: false, output: `解析 openclaw.json 失败: ${msg}` };
  }
}

// ── PdcaCheckRunner (AC-20.1 ~ AC-20.6) ────────────────────────

/**
 * PDCA Check Runner — reads a liveness config, executes probes,
 * generates a report, and optionally creates tasks for P0 failures.
 */
export class PdcaCheckRunner {
  private config: PdcaLivenessConfig | null = null;
  private readonly now: () => string;
  private readonly execCommand: PdcaCheckRunnerOptions['execCommand'];
  private readonly openclawConfigPath: string | null;
  private readonly llmProbe: PdcaCheckRunnerOptions['llmProbe'];

  constructor(options: PdcaCheckRunnerOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.execCommand = options.execCommand;
    // NFR-5.18: 不再默认回退到宿主字面路径。options 未传时交由 ENV / findUpward 解析。
    this.openclawConfigPath = options.openclawConfigPath ?? defaultOpenclawConfigPath();
    this.llmProbe = options.llmProbe;
  }

  /** AC-20.1 / AC-20.6: Load config from a JSON file. */
  async loadConfig(configPath: string): Promise<PdcaLivenessConfig> {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as PdcaLivenessConfig;

    // P1-03: Runtime input validation
    if (!parsed.projects || !Array.isArray(parsed.projects)) {
      throw new Error(`Invalid PDCA config: 'projects' array is missing or not an array in ${configPath}`);
    }
    for (const project of parsed.projects) {
      if (!project.goals || !Array.isArray(project.goals)) {
        throw new Error(`Invalid PDCA config: project '${project.name ?? 'unknown'}' has no 'goals' array`);
      }
      for (const goal of project.goals) {
        if (!goal.id) {
          throw new Error(`Invalid PDCA config: a goal in project '${project.name}' is missing 'id'`);
        }
        if (!goal.probe) {
          throw new Error(`Invalid PDCA config: goal '${goal.id}' in project '${project.name}' is missing 'probe'`);
        }
        if (!goal.severity) {
          throw new Error(`Invalid PDCA config: goal '${goal.id}' in project '${project.name}' is missing 'severity'`);
        }
      }
    }

    this.config = parsed;
    return parsed;
  }

  /** AC-20.2 / AC-20.5: Execute all probes and collect results. */
  async runProbes(projectFilter?: string): Promise<PdcaProbeResult[]> {
    if (!this.config) {
      throw new Error('Config not loaded. Call loadConfig() first.');
    }

    const projects = projectFilter
      ? this.config.projects.filter((p) => p.name === projectFilter)
      : this.config.projects;

    const results: PdcaProbeResult[] = [];

    for (const project of projects) {
      for (const goal of project.goals) {
        const timestamp = this.now();
        const probeResult = await this.executeProbe(goal, project.name);
        results.push({
          goalId: goal.id,
          project: project.name,
          status: probeResult.status ?? (probeResult.passed === true ? 'PASS' : probeResult.passed === false ? 'FAIL' : 'INCONCLUSIVE'),
          reason: probeResult.output,
          severity: goal.severity as PdcaSeverity,
          executedAt: timestamp,
          ...(probeResult.confidence !== undefined ? { confidence: probeResult.confidence } : {}),
        });
      }
    }

    return results;
  }

  /** AC-20.2: Generate a markdown report from probe results. */
  generateReport(results: PdcaProbeResult[]): PdcaCheckReport {
    const passCount = results.filter((r) => r.status === 'PASS').length;
    const failCount = results.filter((r) => r.status === 'FAIL').length;
    const p0Failures = results
      .filter((r) => r.status === 'FAIL' && r.severity === 'P0')
      .map((r) => r.goalId);
    const p1Failures = results
      .filter((r) => r.status === 'FAIL' && r.severity === 'P1')
      .map((r) => r.goalId);

    return {
      totalGoals: results.length,
      passCount,
      failCount,
      p0Failures,
      p1Failures,
      entries: results,
      executedAt: this.now(),
    };
  }

  /** AC-20.2: Render report as markdown string. */
  renderMarkdown(report: PdcaCheckReport): string {
    const lines: string[] = [
      '# PDCA Liveness Check Report',
      '',
      `检查时间：${report.executedAt}`,
      '',
      '## 汇总',
      '',
      `- 总目标数：${report.totalGoals}`,
      `- 通过：${report.passCount}`,
      `- 失败：${report.failCount}（P0: ${report.p0Failures.length}, P1: ${report.p1Failures.length}）`,
      '',
      '## 逐项结果',
      '',
      '| 项目 | 目标 ID | 严重度 | 状态 | 详情 |',
      '|------|---------|--------|------|------|',
    ];

    for (const entry of report.entries) {
      const icon = entry.status === 'PASS' ? '✅ PASS' : entry.status === 'FAIL' ? '❌ FAIL' : entry.status === 'SKIP' ? '⏭️ SKIP' : '⚠️ INCONCLUSIVE';
      lines.push(`| ${entry.project} | ${entry.goalId} | ${entry.severity} | ${icon} | ${entry.reason} |`);
    }

    lines.push('', '---', '', '_由 PdcaCheckRunner 自动生成_');
    return lines.join('\n');
  }

  /** AC-20.4: Create tasks for P0 failures via adapter. */
  async createTasksForFailures(
    report: PdcaCheckReport,
    adapter?: PdcaTaskAdapter,
  ): Promise<PdcaFailureTask[]> {
    const p0Entries = report.entries.filter(
      (e) => e.status === 'FAIL' && e.severity === 'P0',
    );

    if (p0Entries.length === 0 || !adapter) {
      return [];
    }

    const tasks: PdcaFailureTask[] = [];
    for (const entry of p0Entries) {
      // P1-02: Extract FR identifier from goalId (e.g. "FR-20-npm" → "FR-20")
      const frMatch = entry.goalId.match(/^(FR-\d+)/i);
      const task: PdcaFailureTask = {
        goalId: entry.goalId,
        project: entry.project,
        severity: entry.severity,
        reason: entry.reason,
        description: `[PDCA P0] ${entry.project}/${entry.goalId} 失败: ${entry.reason}`,
        relatedFr: frMatch ? frMatch[1] : undefined,
      };
      await adapter.createTask(task);
      tasks.push(task);
    }

    return tasks;
  }

  /** AC-20.3 / AC-20.6: Full run — load, probe, report, create tasks. */
  async run(
    configPath: string,
    options?: { projectFilter?: string; taskAdapter?: PdcaTaskAdapter },
  ): Promise<PdcaCheckOutput> {
    await this.loadConfig(configPath);
    const results = await this.runProbes(options?.projectFilter);
    const report = this.generateReport(results);
    const markdown = this.renderMarkdown(report);
    const tasksCreated = await this.createTasksForFailures(report, options?.taskAdapter);

    return { report, markdown, tasksCreated };
  }

  // ── Private: probe dispatch ───────────────────────────────────

  private async executeProbe(
    goal: PdcaLivenessGoal,
    _project: string,
  ): Promise<{ passed: boolean | null; output: string; confidence?: number; status?: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'SKIP' }> {
    const probe = goal.probe.trim();

    // AC-20.7: Handle llm: prefixed probes
    if (probe.startsWith('llm:')) {
      return this.executeLlmProbe(probe.slice(4).trim(), goal, _project);
    }

    // Try to match built-in probe functions (AC-20.5)
    const builtinResult = await this.tryBuiltinProbe(probe);
    if (builtinResult !== null) {
      return builtinResult;
    }

    // Fallback: execute as shell command (AC-20.5 custom extension)
    return this.executeShellProbe(probe);
  }

  /**
   * AC-20.7: Execute an LLM-based semantic quality probe.
   * Returns INCONCLUSIVE when confidence < threshold (default 0.7).
   */
  private async executeLlmProbe(
    probeName: string,
    goal: PdcaLivenessGoal,
    project: string,
  ): Promise<{ passed: boolean | null; output: string; confidence?: number; status?: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'SKIP' }> {
    if (!this.llmProbe) {
      return {
        passed: null,
        output: `LLM probe '${probeName}' requested but no llmProbe executor configured`,
        confidence: 0,
      };
    }

    try {
      const context: LlmProbeContext = {
        goalId: goal.id,
        project,
        metric: goal.metric,
        description: goal.description,
      };
      const result: LlmProbeResult = await this.llmProbe(probeName, context);
      const threshold = result.threshold ?? 0.7;

      if (result.confidence < threshold) {
        return {
          passed: null,
          status: 'INCONCLUSIVE',
          output: `LLM probe '${probeName}': INCONCLUSIVE (confidence ${result.confidence.toFixed(2)} < threshold ${threshold}). ${result.judgment}`,
          confidence: result.confidence,
        };
      }

      // Confidence >= threshold: judgment semantics determine pass/fail.
      // Parse judgment for negative indicators to avoid false PASS when
      // confidence is high but the assessment is negative.
      const passed = isJudgmentPositive(result.judgment);
      return {
        passed,
        status: passed ? 'PASS' : 'FAIL',
        output: `LLM probe '${probeName}': ${passed ? 'PASS' : 'FAIL'} (confidence ${result.confidence.toFixed(2)}). ${result.judgment}`,
        confidence: result.confidence,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        passed: null,
        status: 'INCONCLUSIVE',
        output: `LLM probe '${probeName}' inconclusive: LLM 不可用 (${msg})`,
        confidence: 0,
      };
    }
  }

  private async tryBuiltinProbe(
    probe: string,
  ): Promise<{ passed: boolean; output: string } | null> {
    // check_log_recent <file> <keyword> <window>
    const logMatch = probe.match(/^check_log_recent\s+(\S+)\s+(\S+)\s+(\S+)$/);
    if (logMatch) {
      return checkLogRecent(logMatch[1]!, logMatch[2]!, logMatch[3]!);
    }

    // check_sqlite <db> <query> <min_value>
    const sqliteMatch = probe.match(/^check_sqlite\s+(\S+)\s+'([^']+)'\s+(\d+)$/);
    if (sqliteMatch) {
      return checkSqlite(sqliteMatch[1]!, sqliteMatch[2]!, Number(sqliteMatch[3]!), this.execCommand);
    }

    // check_npm_version <package> <min_version>
    const npmMatch = probe.match(/^check_npm_version\s+(\S+)\s+(\S+)$/);
    if (npmMatch) {
      return checkNpmVersion(npmMatch[1]!, npmMatch[2]!, this.execCommand);
    }

    // check_file_exists <path>
    const fileMatch = probe.match(/^check_file_exists\s+(\S+)$/);
    if (fileMatch) {
      return checkFileExists(fileMatch[1]!);
    }

    // check_hook_registered <hook_name>
    const hookMatch = probe.match(/^check_hook_registered\s+(\S+)$/);
    if (hookMatch) {
      return checkHookRegistered(hookMatch[1]!, this.openclawConfigPath ?? undefined);
    }

    return null; // Not a built-in probe
  }

  private async executeShellProbe(
    cmd: string,
  ): Promise<{ passed: boolean; output: string }> {
    try {
      if (this.execCommand) {
        const result = await this.execCommand(cmd);
        return {
          passed: result.exitCode === 0,
          output: result.stdout.trim() || (result.exitCode === 0 ? 'PASS' : 'FAIL'),
        };
      }

      const stdout = execSync(cmd, {
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return { passed: true, output: stdout || 'PASS' };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      const output = (execErr.stdout ?? execErr.stderr ?? execErr.message ?? 'probe execution failed').trim();
      return { passed: false, output };
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function parseTimeWindow(window: string): number | null {
  const match = window.match(/^(\d+)([hmd])$/);
  if (!match) return null;
  const value = Number(match[1]);
  switch (match[2]) {
    case 'h': return value * 3600;
    case 'm': return value * 60;
    case 'd': return value * 86400;
    default: return null;
  }
}

function semverGte(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return true; // equal
}

/**
 * Determine if an LLM judgment text indicates a positive (PASS) outcome.
 * Checks for negative semantic indicators in both Chinese and English.
 * Returns false if any negative indicator is found.
 */
function isJudgmentPositive(judgment: string): boolean {
  const normalized = judgment.toLowerCase();
  const negativeIndicators = [
    // Chinese negative indicators
    '不合格', '不通过', '未通过', '失败', '不达标', '不满足',
    '不符合', '未达到', '未满足', '质量差', '存在问题', '严重',
    // English negative indicators
    'fail', 'not pass', 'unacceptable', 'inadequate', 'poor',
    'does not meet', 'did not pass', 'below standard', 'rejected',
    'insufficient', 'not qualified', 'disqualified',
  ];
  return !negativeIndicators.some((indicator) => normalized.includes(indicator));
}
