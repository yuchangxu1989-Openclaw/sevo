/**
 * FR-17 PDCA Liveness — extended tests.
 *
 * Supplements fr17-pdca-liveness.test.ts with coverage for:
 *  - checkHookRegistered (AC-20.5)
 *  - checkSqlite (AC-20.5)
 *  - Shell probe fallback
 *  - LLM probe PASS / FAIL / error paths (AC-20.7)
 *  - projectFilter in runProbes
 *  - renderMarkdown output format (AC-20.2)
 *  - parseTimeWindow edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  PdcaCheckRunner,
  checkHookRegistered,
  checkSqlite,
  checkLogRecent,
} from '../pdca-check-stage.js';
import type { PdcaTaskAdapter, PdcaFailureTask } from '../pdca-check-types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr17-ext-'));
}

function writeJson(dir: string, name: string, data: object): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return p;
}

// ── Tests ───────────────────────────────────────────────────────

describe('FR-17 Extended: checkHookRegistered', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns PASS when hook is registered and enabled', async () => {
    const cfgPath = writeJson(tmpDir, 'openclaw.json', {
      hooks: {
        'before_tool_call': {
          entries: {
            'my-hook': { enabled: true, script: 'echo hi' },
          },
        },
      },
    });
    const result = await checkHookRegistered('my-hook', cfgPath);
    expect(result.passed).toBe(true);
    expect(result.output).toContain('my-hook');
    expect(result.output).toContain('enabled');
  });

  it('returns FAIL when hook exists but is disabled', async () => {
    const cfgPath = writeJson(tmpDir, 'openclaw.json', {
      hooks: {
        'session_start': {
          entries: {
            'disabled-hook': { enabled: false },
          },
        },
      },
    });
    const result = await checkHookRegistered('disabled-hook', cfgPath);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('enabled=false');
  });

  it('returns FAIL when hook is not registered at all', async () => {
    const cfgPath = writeJson(tmpDir, 'openclaw.json', {
      hooks: { 'before_prompt_build': { entries: {} } },
    });
    const result = await checkHookRegistered('nonexistent-hook', cfgPath);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('未在 openclaw.json 中注册');
  });

  it('returns FAIL when openclaw.json does not exist', async () => {
    const result = await checkHookRegistered('any', '/tmp/no-such-file-xyz.json');
    expect(result.passed).toBe(false);
    expect(result.output).toContain('不存在');
  });

  it('returns FAIL when openclaw.json is malformed', async () => {
    const cfgPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(cfgPath, '{ not valid json !!!', 'utf8');
    const result = await checkHookRegistered('x', cfgPath);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('解析 openclaw.json 失败');
  });
});

describe('FR-17 Extended: checkSqlite', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns PASS when query result meets threshold', async () => {
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, ''); // placeholder — we mock execCommand
    const exec = async () => ({ stdout: '42', exitCode: 0 });
    const result = await checkSqlite(dbPath, 'SELECT count(*) FROM t', 10, exec);
    expect(result.passed).toBe(true);
    expect(result.output).toContain('42');
    expect(result.output).toContain('>= 阈值 10');
  });

  it('returns FAIL when query result is below threshold', async () => {
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, '');
    const exec = async () => ({ stdout: '3', exitCode: 0 });
    const result = await checkSqlite(dbPath, 'SELECT count(*) FROM t', 10, exec);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('3');
    expect(result.output).toContain('< 阈值 10');
  });

  it('returns FAIL when database file does not exist', async () => {
    const exec = async () => ({ stdout: '', exitCode: 1 });
    const result = await checkSqlite('/no/such/db.sqlite', 'SELECT 1', 1, exec);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('不存在');
  });

  it('returns FAIL when query returns non-numeric value', async () => {
    const dbPath = path.join(tmpDir, 'test.db');
    fs.writeFileSync(dbPath, '');
    const exec = async () => ({ stdout: 'hello', exitCode: 0 });
    const result = await checkSqlite(dbPath, 'SELECT name FROM t', 1, exec);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('非数值');
  });
});

describe('FR-17 Extended: Shell probe & projectFilter', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('executes shell probe and returns PASS on exit 0', async () => {
    const config = {
      projects: [{
        name: 'shell-proj',
        goals: [{
          id: 'FR-17-shell',
          description: 'Shell probe test',
          metric: 'exit code',
          probe: 'echo hello-world',
          severity: 'P1',
        }],
      }],
    };
    const cfgPath = writeJson(tmpDir, 'config.json', config);
    const exec = async (cmd: string) => ({ stdout: 'hello-world', exitCode: 0 });

    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      execCommand: exec,
    });
    const output = await runner.run(cfgPath);
    expect(output.report.passCount).toBe(1);
    expect(output.report.entries[0]!.status).toBe('PASS');
    expect(output.report.entries[0]!.reason).toContain('hello-world');
  });

  it('shell probe returns FAIL on non-zero exit', async () => {
    const config = {
      projects: [{
        name: 'fail-proj',
        goals: [{
          id: 'FR-17-fail-shell',
          description: 'Failing shell',
          metric: 'exit code',
          probe: 'false',
          severity: 'P0',
        }],
      }],
    };
    const cfgPath = writeJson(tmpDir, 'config.json', config);
    const exec = async () => ({ stdout: 'error output', exitCode: 1 });

    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      execCommand: exec,
    });
    const output = await runner.run(cfgPath);
    expect(output.report.failCount).toBe(1);
    expect(output.report.entries[0]!.status).toBe('FAIL');
  });

  it('projectFilter limits probes to matching project only', async () => {
    const config = {
      projects: [
        {
          name: 'alpha',
          goals: [{
            id: 'alpha-g1', description: 'A', metric: 'm',
            probe: 'echo a', severity: 'P1',
          }],
        },
        {
          name: 'beta',
          goals: [{
            id: 'beta-g1', description: 'B', metric: 'm',
            probe: 'echo b', severity: 'P1',
          }],
        },
      ],
    };
    const cfgPath = writeJson(tmpDir, 'config.json', config);
    const exec = async () => ({ stdout: 'ok', exitCode: 0 });

    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      execCommand: exec,
    });
    const output = await runner.run(cfgPath, { projectFilter: 'beta' });
    expect(output.report.totalGoals).toBe(1);
    expect(output.report.entries[0]!.project).toBe('beta');
  });
});

describe('FR-17 Extended: LLM probe PASS/FAIL/error', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  function makeLlmConfig(dir: string) {
    return writeJson(dir, 'config.json', {
      projects: [{
        name: 'llm-proj',
        goals: [{
          id: 'FR-17-llm',
          description: 'Quality check',
          metric: 'code quality',
          probe: 'llm:quality-check',
          severity: 'P0',
        }],
      }],
    });
  }

  it('returns PASS when confidence >= threshold and judgment is positive', async () => {
    const cfgPath = makeLlmConfig(tmpDir);
    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      llmProbe: async () => ({
        confidence: 0.9,
        judgment: 'Code quality is excellent, well structured',
      }),
    });
    const output = await runner.run(cfgPath);
    expect(output.report.entries[0]!.status).toBe('PASS');
    expect(output.report.entries[0]!.confidence).toBe(0.9);
  });

  it('returns FAIL when confidence >= threshold but judgment is negative', async () => {
    const cfgPath = makeLlmConfig(tmpDir);
    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      llmProbe: async () => ({
        confidence: 0.85,
        judgment: '代码质量差，存在问题，不合格',
      }),
    });
    const output = await runner.run(cfgPath);
    expect(output.report.entries[0]!.status).toBe('FAIL');
    expect(output.report.entries[0]!.confidence).toBe(0.85);
  });

  it('returns INCONCLUSIVE when llmProbe executor throws', async () => {
    const cfgPath = makeLlmConfig(tmpDir);
    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      llmProbe: async () => { throw new Error('LLM service unavailable'); },
    });
    const output = await runner.run(cfgPath);
    expect(output.report.entries[0]!.status).toBe('INCONCLUSIVE');
    expect(output.report.entries[0]!.reason).toContain('LLM service unavailable');
  });

  it('returns INCONCLUSIVE when no llmProbe executor is configured', async () => {
    const cfgPath = makeLlmConfig(tmpDir);
    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      // no llmProbe provided
    });
    const output = await runner.run(cfgPath);
    expect(output.report.entries[0]!.status).toBe('INCONCLUSIVE');
    expect(output.report.entries[0]!.reason).toContain('no llmProbe executor configured');
  });
});

describe('FR-17 Extended: renderMarkdown & report structure', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('markdown output contains table headers and all entries', async () => {
    const config = {
      projects: [{
        name: 'md-proj',
        goals: [
          { id: 'g1', description: 'G1', metric: 'm', probe: 'echo ok', severity: 'P0' },
          { id: 'g2', description: 'G2', metric: 'm', probe: 'echo ok', severity: 'P1' },
        ],
      }],
    };
    const cfgPath = writeJson(tmpDir, 'config.json', config);
    const exec = async () => ({ stdout: 'ok', exitCode: 0 });

    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      execCommand: exec,
    });
    const output = await runner.run(cfgPath);

    expect(output.markdown).toContain('PDCA Liveness Check');
    expect(output.markdown).toContain('| 项目');
    expect(output.markdown).toContain('md-proj');
    expect(output.markdown).toContain('g1');
    expect(output.markdown).toContain('g2');
    expect(output.markdown).toContain('✅ PASS');
  });

  it('report correctly categorizes P0 and P1 failures', async () => {
    const config = {
      projects: [{
        name: 'cat-proj',
        goals: [
          { id: 'p0-goal', description: 'P0', metric: 'm', probe: 'fail-cmd', severity: 'P0' },
          { id: 'p1-goal', description: 'P1', metric: 'm', probe: 'fail-cmd', severity: 'P1' },
          { id: 'p2-goal', description: 'P2', metric: 'm', probe: 'ok-cmd', severity: 'P2' },
        ],
      }],
    };
    const cfgPath = writeJson(tmpDir, 'config.json', config);
    const exec = async (cmd: string) => {
      if (cmd === 'ok-cmd') return { stdout: 'ok', exitCode: 0 };
      return { stdout: 'error', exitCode: 1 };
    };

    const runner = new PdcaCheckRunner({
      now: () => '2026-01-01T00:00:00Z',
      execCommand: exec,
    });
    const output = await runner.run(cfgPath);

    expect(output.report.p0Failures).toEqual(['p0-goal']);
    expect(output.report.p1Failures).toEqual(['p1-goal']);
    expect(output.report.passCount).toBe(1);
    expect(output.report.failCount).toBe(2);
  });
});

describe('FR-17 Extended: parseTimeWindow edge cases via checkLogRecent', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns FAIL for invalid time window format', async () => {
    const logFile = path.join(tmpDir, 'app.log');
    fs.writeFileSync(logFile, 'some content\n');
    const result = await checkLogRecent(logFile, 'content', 'invalid');
    expect(result.passed).toBe(false);
    expect(result.output).toContain('无法解析时间窗口');
  });

  it('supports days (d) time window', async () => {
    const logFile = path.join(tmpDir, 'app.log');
    fs.writeFileSync(logFile, 'deploy success\n');
    const result = await checkLogRecent(logFile, 'deploy', '7d');
    expect(result.passed).toBe(true);
  });

  it('supports minutes (m) time window', async () => {
    const logFile = path.join(tmpDir, 'app.log');
    fs.writeFileSync(logFile, 'heartbeat ping\n');
    const result = await checkLogRecent(logFile, 'heartbeat', '30m');
    expect(result.passed).toBe(true);
  });
});
