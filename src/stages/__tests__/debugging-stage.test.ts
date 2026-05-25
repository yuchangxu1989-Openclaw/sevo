import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { SystematicDebuggingStage } from '../debugging-stage.js';
import type { DebuggingStageInput, DebuggingPhaseResponse } from '../debugging-types.js';

describe('SystematicDebuggingStage', () => {
  const tmpDir = path.join(os.tmpdir(), 'sevo-debugging-test');

  it('executes four phases in strict order (AC-4.20c)', async () => {
    const phaseOrder: string[] = [];
    const stage = new SystematicDebuggingStage({
      adapter: {
        executePhase: async (req) => {
          phaseOrder.push(req.phase);
          return { status: 'passed', evidence: [], conclusion: `Done ${req.phase}` };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: DebuggingStageInput = {
      taskId: 'debug-001',
      issues: [{ id: 'BUG-1', title: 'Crash on save', description: 'App crashes' }],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(phaseOrder).toEqual(['reproduce', 'locate', 'analyze', 'verify']);
    expect(output.records[0]!.phases).toHaveLength(4);
  });

  it('halts if reproduce phase fails (AC-4.20c)', async () => {
    const stage = new SystematicDebuggingStage({
      adapter: {
        executePhase: async (req) => {
          if (req.phase === 'reproduce') {
            return { status: 'failed', evidence: [], conclusion: 'Cannot reproduce' };
          }
          return { status: 'passed', evidence: [], conclusion: 'ok' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: DebuggingStageInput = {
      taskId: 'debug-002',
      issues: [{ id: 'BUG-2', title: 'Flaky', description: 'Intermittent' }],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    // Only reproduce phase should be recorded
    expect(output.records[0]!.phases).toHaveLength(1);
    expect(output.records[0]!.phases[0]!.phase).toBe('reproduce');
    expect(output.records[0]!.fixApplied).toBe(false);
    expect(output.metadata.unresolved).toBe(1);
  });

  it('conclusions are evidence-based (AC-4.20d)', async () => {
    const stage = new SystematicDebuggingStage({
      adapter: {
        executePhase: async (req) => {
          return {
            status: 'passed',
            evidence: [{ type: 'root_cause', content: `Evidence for ${req.phase}` }],
            conclusion: `Concluded ${req.phase}`,
          };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: DebuggingStageInput = {
      taskId: 'debug-003',
      issues: [{ id: 'BUG-3', title: 'Leak', description: 'Memory leak' }],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    for (const phase of output.records[0]!.phases) {
      expect(phase.evidence.length).toBeGreaterThan(0);
      expect(phase.conclusion).toBeTruthy();
    }
  });

  it('verify phase covers original failure + regression (AC-4.20e)', async () => {
    const stage = new SystematicDebuggingStage({
      adapter: {
        executePhase: async (req) => {
          if (req.phase === 'verify') {
            return {
              status: 'passed',
              evidence: [
                { type: 'verification_result', content: 'Original failure fixed' },
                { type: 'verification_result', content: 'Regression suite green' },
              ],
              conclusion: 'Fix verified with regression',
            };
          }
          return { status: 'passed', evidence: [], conclusion: `Done ${req.phase}` };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: DebuggingStageInput = {
      taskId: 'debug-004',
      issues: [{ id: 'BUG-4', title: 'Fix', description: 'Fixable' }],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.records[0]!.fixApplied).toBe(true);
    expect(output.records[0]!.regressionCovered).toBe(true);
    expect(output.metadata.resolved).toBe(1);
  });
});
