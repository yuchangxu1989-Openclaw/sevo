/**
 * Stranger-Ready Gate Tests — FR-35 AC-35.4, AC-35.5, AC-35.6.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluateStrangerReadyGate,
  shouldBlockPublish,
  formatGateResult,
  type StrangerReadyGateInput,
  type StrangerReadyGateConfig,
} from '../governance/stranger-ready-gate.js';
import * as fs from 'node:fs';
import * as child_process from 'node:child_process';

// ── Mocks ───────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    chmodSync: vi.fn(),
  };
});

// ── Test Fixtures ───────────────────────────────────────────────

function createInput(overrides?: Partial<StrangerReadyGateInput>): StrangerReadyGateInput {
  return {
    projectRoot: '/workspace/projects/sevo',
    pipelineId: 'fr-sevo-20260516-001',
    projectSlug: 'sevo',
    config: {
      strangerVerify: true,
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('Stranger-Ready Gate: AC-35.6 — Skip mechanism', () => {
  it('should skip when skipStrangerVerify runtime flag is set', () => {
    const input = createInput({ skipStrangerVerify: true });

    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('skipped');
    expect(result.skipReason).toContain('--skip-stranger-verify');
    expect(result.exitCode).toBeNull();
  });

  it('should skip when config.strangerVerify is false', () => {
    const input = createInput({
      config: { strangerVerify: false },
    });

    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('skipped');
    expect(result.skipReason).toContain('strangerVerify: false');
    expect(result.summary).toContain('非 npm 包');
  });

  it('should NOT skip when config.strangerVerify is true', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue('All checks passed\n');

    const input = createInput({
      config: { strangerVerify: true },
    });

    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('passed');
  });

  it('should NOT skip when strangerVerify is undefined (default: enabled)', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue('All checks passed\n');

    const input = createInput({
      config: {},
    });

    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('passed');
  });
});

describe('Stranger-Ready Gate: AC-35.4 — Script execution', () => {
  it('should pass when verification script exits with 0', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue('✓ Package installs cleanly\n✓ CLI runs\n');

    const input = createInput();
    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('passed');
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain('开箱即用');
  });

  it('should use custom verifyScript path when configured', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue('OK\n');

    const input = createInput({
      config: { strangerVerify: true, verifyScript: 'scripts/custom-verify.sh' },
    });

    evaluateStrangerReadyGate(input);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('custom-verify.sh'),
      expect.any(Object),
    );
  });

  it('should fail when verification script is not found', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(false);

    const input = createInput();
    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('failed');
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('not found');
    expect(result.fixSuggestions.length).toBeGreaterThan(0);
  });

  it('should pass environment variables to the script', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    mockExecSync.mockReturnValue('OK\n');

    const input = createInput({
      pipelineId: 'fr-sevo-20260516-001',
      projectSlug: 'sevo',
      projectRoot: '/workspace/projects/sevo',
    });

    evaluateStrangerReadyGate(input);

    const callArgs = mockExecSync.mock.calls[0]!;
    const options = callArgs[1] as any;
    expect(options.env.SEVO_PIPELINE_ID).toBe('fr-sevo-20260516-001');
    expect(options.env.SEVO_PROJECT_SLUG).toBe('sevo');
    expect(options.env.SEVO_PROJECT_ROOT).toBe('/workspace/projects/sevo');
  });
});

describe('Stranger-Ready Gate: AC-35.5 — Failure handling', () => {
  it('should return failed with exit code and stderr on script failure', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    const error = new Error('Command failed') as any;
    error.status = 1;
    error.stdout = 'Installing package...\n';
    error.stderr = 'npm ERR! Cannot find module "missing-dep"\n';
    mockExecSync.mockImplementation(() => { throw error; });

    const input = createInput();
    const result = evaluateStrangerReadyGate(input);

    expect(result.conclusion).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Installing package');
    expect(result.stderr).toContain('Cannot find module');
    expect(result.summary).toContain('publish-blocked');
  });

  it('should generate fix suggestions based on npm errors', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    const error = new Error('Command failed') as any;
    error.status = 1;
    error.stdout = '';
    error.stderr = 'npm ERR! code ETARGET\nnpm ERR! notarget No matching version found';
    mockExecSync.mockImplementation(() => { throw error; });

    const input = createInput();
    const result = evaluateStrangerReadyGate(input);

    expect(result.fixSuggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('npm'),
      ]),
    );
  });

  it('should generate fix suggestions for missing modules', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    const error = new Error('Command failed') as any;
    error.status = 1;
    error.stdout = '';
    error.stderr = 'Error: Cannot find module "some-lib"\nMODULE_NOT_FOUND';
    mockExecSync.mockImplementation(() => { throw error; });

    const input = createInput();
    const result = evaluateStrangerReadyGate(input);

    expect(result.fixSuggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('dependencies'),
      ]),
    );
  });

  it('should include retry instruction in fix suggestions', () => {
    const mockExistsSync = vi.mocked(fs.existsSync);
    mockExistsSync.mockReturnValue(true);

    const mockExecSync = vi.mocked(child_process.execSync);
    const error = new Error('Command failed') as any;
    error.status = 2;
    error.stdout = '';
    error.stderr = 'Some unknown error';
    mockExecSync.mockImplementation(() => { throw error; });

    const input = createInput();
    const result = evaluateStrangerReadyGate(input);

    expect(result.fixSuggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sevo gate retry'),
      ]),
    );
  });
});

describe('Stranger-Ready Gate: shouldBlockPublish', () => {
  it('should return true for failed gate', () => {
    expect(shouldBlockPublish({
      conclusion: 'failed',
      exitCode: 1,
      stdout: '',
      stderr: 'error',
      summary: 'failed',
      fixSuggestions: [],
      durationMs: 100,
    })).toBe(true);
  });

  it('should return false for passed gate', () => {
    expect(shouldBlockPublish({
      conclusion: 'passed',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      summary: 'passed',
      fixSuggestions: [],
      durationMs: 100,
    })).toBe(false);
  });

  it('should return false for skipped gate', () => {
    expect(shouldBlockPublish({
      conclusion: 'skipped',
      exitCode: null,
      stdout: '',
      stderr: '',
      summary: 'skipped',
      fixSuggestions: [],
      skipReason: 'config',
      durationMs: 0,
    })).toBe(false);
  });
});

describe('Stranger-Ready Gate: formatGateResult', () => {
  it('should format passed result', () => {
    const output = formatGateResult({
      conclusion: 'passed',
      exitCode: 0,
      stdout: 'All good',
      stderr: '',
      summary: '陌生人验证通过。',
      fixSuggestions: [],
      durationMs: 5000,
    });

    expect(output).toContain('PASSED');
    expect(output).toContain('陌生人验证通过');
    expect(output).toContain('5000ms');
  });

  it('should format failed result with suggestions', () => {
    const output = formatGateResult({
      conclusion: 'failed',
      exitCode: 1,
      stdout: '',
      stderr: 'npm ERR! missing dep',
      summary: '陌生人验证失败',
      fixSuggestions: ['Fix dependencies', 'Run sevo gate retry'],
      durationMs: 3000,
    });

    expect(output).toContain('FAILED');
    expect(output).toContain('npm ERR!');
    expect(output).toContain('Fix dependencies');
    expect(output).toContain('修复建议');
  });

  it('should format skipped result', () => {
    const output = formatGateResult({
      conclusion: 'skipped',
      exitCode: null,
      stdout: '',
      stderr: '',
      summary: '跳过',
      fixSuggestions: [],
      skipReason: 'strangerVerify: false',
      durationMs: 0,
    });

    expect(output).toContain('SKIPPED');
    expect(output).toContain('strangerVerify: false');
  });
});
