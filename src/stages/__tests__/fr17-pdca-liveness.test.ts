/**
 * FR-17 PDCA Liveness Check tests.
 *
 * Covers: PdcaCheckRunner core flow, built-in probes, LLM probes,
 * report generation, and P0 task creation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  PdcaCheckRunner,
  checkLogRecent,
  checkFileExists,
  checkNpmVersion,
} from '../pdca-check-stage.js';
import type { PdcaFailureTask, PdcaTaskAdapter } from '../pdca-check-types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr17-pdca-'));
}

function writeConfig(dir: string, config: object): string {
  const p = path.join(dir, 'pdca-config.json');
  fs.writeFileSync(p, JSON.stringify(config), 'utf8');
  return p;
}

// ── Tests ───────────────────────────────────────────────────────

describe('FR-17: PDCA Liveness Check', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Built-in probes ──────────────────────────────────────────

  describe('checkLogRecent', () => {
    it('returns PASS when log file is recent and contains keyword', async () => {
      const logFile = path.join(tmpDir, 'app.log');
      fs.writeFileSync(logFile, 'INFO startup complete\nERROR something\n');
      const result = await checkLogRecent(logFile, 'startup', '1h');
      expect(result.passed).toBe(true);
      expect(result.output).toContain('startup');
    });

    it('returns FAIL when file does not exist', async () => {
      const result = await checkLogRecent('/nonexistent/log.txt', 'x', '1h');
      expect(result.passed).toBe(false);
      expect(result.output).toContain('不存在');
    });

    it('returns FAIL when keyword not found', async () => {
      const logFile = path.join(tmpDir, 'empty.log');
      fs.writeFileSync(logFile, 'nothing relevant here\n');
      const result = await checkLogRecent(logFile, 'CRITICAL', '24h');
      expect(result.passed).toBe(false);
      expect(result.output).toContain('未找到');
    });
  });

  describe('checkFileExists', () => {
    it('returns PASS for existing non-empty file', async () => {
      const f = path.join(tmpDir, 'data.json');
      fs.writeFileSync(f, '{"ok":true}');
      const result = await checkFileExists(f);
      expect(result.passed).toBe(true);
    });

    it('returns FAIL for empty file', async () => {
      const f = path.join(tmpDir, 'empty.txt');
      fs.writeFileSync(f, '');
      const result = await checkFileExists(f);
      expect(result.passed).toBe(false);
      expect(result.output).toContain('empty');
    });

    it('returns FAIL for missing file', async () => {
      const result = await checkFileExists(path.join(tmpDir, 'nope'));
      expect(result.passed).toBe(false);
    });
  });

  describe('checkNpmVersion', () => {
    it('returns FAIL when package not found', async () => {
      const exec = async () => ({ stdout: '', exitCode: 1 });
      const result = await checkNpmVersion('nonexistent-pkg-xyz', '1.0.0', exec);
      expect(result.passed).toBe(false);
    });

    it('returns PASS when version meets minimum', async () => {
      const exec = async () => ({ stdout: '2.3.0', exitCode: 0 });
      const result = await checkNpmVersion('some-pkg', '2.0.0', exec);
      expect(result.passed).toBe(true);
    });

    it('returns FAIL when version below minimum', async () => {
      const exec = async () => ({ stdout: '1.0.0', exitCode: 0 });
      const result = await checkNpmVersion('some-pkg', '2.0.0', exec);
      expect(result.passed).toBe(false);
    });
  });

  // ── PdcaCheckRunner ──────────────────────────────────────────

  describe('PdcaCheckRunner', () => {
    it('loads config and runs probes end-to-end', async () => {
      const logFile = path.join(tmpDir, 'run.log');
      fs.writeFileSync(logFile, 'deploy OK\n');

      const config = {
        projects: [{
          name: 'test-proj',
          goals: [{
            id: 'FR-17-log',
            description: 'Log check',
            metric: 'log freshness',
            probe: `check_log_recent ${logFile} deploy 1h`,
            severity: 'P0',
          }],
        }],
      };
      const configPath = writeConfig(tmpDir, config);

      const runner = new PdcaCheckRunner({ now: () => '2026-01-01T00:00:00Z' });
      const output = await runner.run(configPath);

      expect(output.report.totalGoals).toBe(1);
      expect(output.report.passCount).toBe(1);
      expect(output.report.failCount).toBe(0);
      expect(output.markdown).toContain('PDCA Liveness Check Report');
    });

    it('creates tasks for P0 failures', async () => {
      const config = {
        projects: [{
          name: 'proj-a',
          goals: [{
            id: 'FR-17-missing',
            description: 'Missing file',
            metric: 'file exists',
            probe: 'check_file_exists /nonexistent/path',
            severity: 'P0',
          }],
        }],
      };
      const configPath = writeConfig(tmpDir, config);
      const created: PdcaFailureTask[] = [];
      const adapter: PdcaTaskAdapter = {
        createTask: async (t) => { created.push(t); },
      };

      const runner = new PdcaCheckRunner({ now: () => '2026-01-01T00:00:00Z' });
      const output = await runner.run(configPath, { taskAdapter: adapter });

      expect(output.report.failCount).toBe(1);
      expect(output.report.p0Failures).toContain('FR-17-missing');
      expect(created).toHaveLength(1);
      expect(created[0]!.relatedFr).toBe('FR-17');
    });

    it('rejects invalid config missing goals array', async () => {
      const configPath = writeConfig(tmpDir, { projects: [{ name: 'bad' }] });
      const runner = new PdcaCheckRunner();
      await expect(runner.run(configPath)).rejects.toThrow(/goals/);
    });

    it('handles LLM probes with INCONCLUSIVE when confidence below threshold', async () => {
      const config = {
        projects: [{
          name: 'llm-proj',
          goals: [{
            id: 'FR-17-quality',
            description: 'Code quality',
            metric: 'quality score',
            probe: 'llm:code-quality',
            severity: 'P1',
          }],
        }],
      };
      const configPath = writeConfig(tmpDir, config);

      const runner = new PdcaCheckRunner({
        now: () => '2026-01-01T00:00:00Z',
        llmProbe: async () => ({ confidence: 0.4, judgment: 'Uncertain quality' }),
      });
      const output = await runner.run(configPath);

      expect(output.report.entries[0]!.status).toBe('INCONCLUSIVE');
    });
  });
});
