import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { RegressionStage } from '../regression-stage.js';
import type { RegressionStageInput, RegressionTarget } from '../regression-types.js';

function makeTargets(): RegressionTarget[] {
  return [
    { id: 'REG-1', description: 'Login flow', path: 'src/auth/login.ts' },
    { id: 'REG-2', description: 'Payment flow', path: 'src/payment/checkout.ts' },
    { id: 'REG-3', description: 'BUG-42 recurrence', path: 'src/core/parser.ts', isRecurrencePrevention: true },
  ];
}

describe('RegressionStage', () => {
  const tmpDir = path.join(os.tmpdir(), 'sevo-regression-test');

  it('runs checks for all critical paths (AC-4.25)', async () => {
    const checked: string[] = [];
    const stage = new RegressionStage({
      adapter: {
        runCheck: async (req) => {
          checked.push(req.target.id);
          return { status: 'passed' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: RegressionStageInput = {
      taskId: 'reg-001',
      targets: makeTargets(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(checked).toEqual(['REG-1', 'REG-2', 'REG-3']);
    expect(output.regressionBundle.allPassed).toBe(true);
    expect(output.metadata.passed).toBe(3);
  });

  it('identifies recurrence prevention checks (AC-4.26)', async () => {
    const stage = new RegressionStage({
      adapter: {
        runCheck: async () => ({ status: 'passed' }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: RegressionStageInput = {
      taskId: 'reg-002',
      targets: makeTargets(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.regressionBundle.recurrenceChecks).toHaveLength(1);
    expect(output.regressionBundle.recurrenceChecks[0]!.id).toBe('REG-3');
  });

  it('reports affected scope on failure (AC-4.27)', async () => {
    const stage = new RegressionStage({
      adapter: {
        runCheck: async (req) => {
          if (req.target.id === 'REG-2') {
            return { status: 'failed', affectedScope: ['payment', 'billing'] };
          }
          return { status: 'passed' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: RegressionStageInput = {
      taskId: 'reg-003',
      targets: makeTargets(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.regressionBundle.allPassed).toBe(false);
    expect(output.regressionBundle.failedChecks).toHaveLength(1);
    expect(output.regressionBundle.failedChecks[0]!.affectedScope).toEqual(['payment', 'billing']);
  });

  it('feeds deploy readiness from regression result (AC-4.28)', async () => {
    const stage = new RegressionStage({
      adapter: {
        runCheck: async (req) => {
          if (req.target.id === 'REG-1') return { status: 'failed', affectedScope: ['auth'] };
          return { status: 'passed' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: RegressionStageInput = {
      taskId: 'reg-004',
      targets: makeTargets(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.deployReady).toBe(false);
    expect(output.metadata.failed).toBe(1);
  });
});
