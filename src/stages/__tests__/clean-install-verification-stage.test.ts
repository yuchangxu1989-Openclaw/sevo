import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { CleanInstallVerificationStage } from '../clean-install-verification-stage.js';
import type { CleanInstallVerificationInput } from '../clean-install-verification-types.js';

function makeInput(overrides: Partial<CleanInstallVerificationInput> = {}): CleanInstallVerificationInput {
  const projectRoot = overrides.projectRoot ?? os.tmpdir();
  return {
    taskId: overrides.taskId ?? 'clean-001',
    pipelineId: overrides.pipelineId ?? 'pipe-001',
    projectSlug: overrides.projectSlug ?? 'sevo',
    packageName: overrides.packageName ?? 'sevo',
    version: overrides.version ?? '1.10.1',
    cliBin: overrides.cliBin ?? 'sevo',
    projectRoot,
    artifactBasePath: overrides.artifactBasePath ?? path.join(os.tmpdir(), 'sevo-clean-install-test'),
    l1ScriptPath: overrides.l1ScriptPath ?? '/tmp/npm-stranger-verify.sh',
    l2Checks: overrides.l2Checks,
    l3Checks: overrides.l3Checks,
    skip: overrides.skip,
  };
}

describe('CleanInstallVerificationStage', () => {
  it('passes when L1 and declared checks exit successfully', async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const stage = new CleanInstallVerificationStage({
      execFile: (file, args) => {
        calls.push({ file, args });
        return { stdout: `ok:${args.join(' ')}` };
      },
      now: () => '2026-05-11T00:00:00.000Z',
    });

    const output = await stage.execute(makeInput({
      taskId: 'clean-success',
      l2Checks: [{ id: 'l2-help', description: 'CLI help works', command: 'sevo --help' }],
      l3Checks: [{ id: 'l3-value', description: 'Value path works', command: 'sevo demo' }],
    }));

    expect(output.canComplete).toBe(true);
    expect(output.report.overall).toBe('pass');
    expect(output.report.failedChecks).toHaveLength(0);
    expect(output.artifact.type).toBe('clean-install-verification-report');
    expect(calls).toHaveLength(4);
    expect(calls[0]?.args[1]).toContain('npm install');
    expect(calls[0]?.args[1]).toContain('sevo@1.10.1');
  });

  it('fails and creates fix tasks when a declared check fails', async () => {
    const stage = new CleanInstallVerificationStage({
      execFile: (_file, args) => {
        if (args.some((arg) => arg.includes('exit 1'))) {
          const err = new Error('command failed') as Error & { stdout: string; stderr: string };
          err.stdout = 'partial output';
          err.stderr = 'declared failure';
          throw err;
        }
        return { stdout: 'ok' };
      },
      now: () => '2026-05-11T00:00:00.000Z',
    });

    const output = await stage.execute(makeInput({
      taskId: 'clean-fail',
      l2Checks: [{
        id: 'l2-fail',
        description: 'Failing declared check',
        command: 'exit 1',
        suggestion: 'Fix the declared command.',
      }],
    }));

    expect(output.canComplete).toBe(false);
    expect(output.report.overall).toBe('fail');
    expect(output.report.failedChecks).toEqual([
      expect.objectContaining({ layer: 'l2', checkId: 'l2-fail', output: expect.stringContaining('declared failure') }),
    ]);
    expect(output.report.fixTasks).toEqual([
      { layer: 'l2', checkId: 'l2-fail', suggestion: 'Fix the declared command.' },
    ]);
  });

  it('captures timeout failures from L1 verification', async () => {
    let callCount = 0;
    const stage = new CleanInstallVerificationStage({
      execFile: () => {
        callCount += 1;
        if (callCount === 1) {
          return { stdout: 'ok', stderr: '' };
        }
        const err = new Error('Command timed out after 300000ms') as Error & { stderr: string };
        err.stderr = 'timeout';
        throw err;
      },
      now: () => '2026-05-11T00:00:00.000Z',
    });

    const output = await stage.execute(makeInput({ taskId: 'clean-timeout' }));

    expect(output.canComplete).toBe(false);
    expect(output.report.l1.pass).toBe(false);
    expect(output.report.failedChecks).toEqual([
      expect.objectContaining({
        layer: 'l1',
        checkId: 'l1-npm-stranger-verify',
        output: expect.stringContaining('timeout'),
      }),
      ...output.report.l2.checks.map((check) => expect.objectContaining({
        layer: 'l2',
        checkId: check.id,
        output: expect.stringContaining('timeout'),
      })),
      ...output.report.l3.checks.map((check) => expect.objectContaining({
        layer: 'l3',
        checkId: check.id,
        output: expect.stringContaining('timeout'),
      })),
    ]);
    expect(output.report.fixTasks[0]?.suggestion).toContain('npm-stranger-verify');
  });
});
