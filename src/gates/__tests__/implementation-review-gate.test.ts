import { describe, expect, it, vi } from 'vitest';

import { ImplementationReviewGate } from '../implementation-review-gate.js';
import type { ImplementationReviewInput } from '../implementation-review-types.js';
import type { SpecOutput } from '../../stages/spec-types.js';
import type { ImplementationBundle, TaskExecution } from '../../stages/implement-types.js';
import type { ArtifactRef } from '../../types/index.js';

function makeArtifact(id = 'test:spec-package'): ArtifactRef {
  return { id, type: 'spec-package', path: '/tmp/spec.json', createdAt: '2026-01-01T00:00:00Z' };
}

function makeSpec(overrides?: Partial<SpecOutput>): SpecOutput {
  return {
    summary: 'Spec for implementation review',
    functionalRequirements: [
      {
        id: 'FR-01',
        title: 'Feature one',
        description: 'Does something',
        acceptanceCriteria: [
          { id: 'AC-1.1', description: 'Primary path works', requirementId: 'FR-01' },
          { id: 'AC-1.2', description: 'Secondary path works', requirementId: 'FR-01' },
        ],
      },
      {
        id: 'FR-02',
        title: 'Feature two',
        description: 'Does another thing',
        acceptanceCriteria: [
          { id: 'AC-2.1', description: 'Other path works', requirementId: 'FR-02' },
        ],
      },
    ],
    acceptanceCriteria: [
      { id: 'AC-1.1', description: 'Primary path works', requirementId: 'FR-01' },
      { id: 'AC-1.2', description: 'Secondary path works', requirementId: 'FR-01' },
      { id: 'AC-2.1', description: 'Other path works', requirementId: 'FR-02' },
    ],
    clarifications: [],
    artifact: makeArtifact(),
    ...overrides,
  };
}

function makeExecution(overrides?: Partial<TaskExecution>): TaskExecution {
  return {
    taskId: overrides?.taskId ?? 'task-1:WP-01',
    workPackageId: overrides?.workPackageId ?? 'WP-01',
    subTaskId: overrides?.subTaskId,
    targetFiles: overrides?.targetFiles,
    estimatedMinutes: overrides?.estimatedMinutes,
    input: overrides?.input ?? 'Implement feature',
    output: overrides?.output ?? 'done',
    allowedScope: overrides?.allowedScope ?? ['AC-1.1'],
    evidence: overrides?.evidence ?? [],
    testResults: overrides?.testResults ?? [{ name: 'unit', passed: true }],
  };
}

function makeBundle(executions: TaskExecution[]): ImplementationBundle {
  return {
    executions,
    summary: 'Implementation bundle',
    traceability: new Map(),
  };
}

function makeInput(overrides?: Partial<ImplementationReviewInput>): ImplementationReviewInput {
  return {
    specOutput: makeSpec(),
    implementationBundle: makeBundle([]),
    ...overrides,
  };
}

describe('ImplementationReviewGate', () => {
  it('approves when all ACs are directly covered and tests pass', () => {
    const gate = new ImplementationReviewGate();
    const result = gate.evaluateSync(makeInput({
      implementationBundle: makeBundle([
        makeExecution({ taskId: 'task-1:WP-01:ST-01', subTaskId: 'ST-01', allowedScope: ['AC-1.1'] }),
        makeExecution({ taskId: 'task-1:WP-01:ST-02', subTaskId: 'ST-02', allowedScope: ['AC-1.2'] }),
        makeExecution({ taskId: 'task-1:WP-02:ST-01', subTaskId: 'ST-01', allowedScope: ['AC-2.1'] }),
      ]),
    }));

    expect(result.conclusion).toBe('passed');
    expect(result.findings).toHaveLength(0);
    expect(result.mustFix).toHaveLength(0);
    expect(result.coverageRate).toBe(1);
    expect(result.coveredCount).toBe(3);
    expect(result.partialCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.score).toBe(1);
  });

  it('rejects when any AC is missing', () => {
    const gate = new ImplementationReviewGate();
    const result = gate.evaluateSync(makeInput({
      implementationBundle: makeBundle([
        makeExecution({ allowedScope: ['AC-1.1'] }),
      ]),
    }));

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.some((f) => f.message.includes('AC-1.2'))).toBe(true);
    expect(result.mustFix.some((f) => f.message.includes('AC-2.1'))).toBe(true);
    expect(result.coverageRate).toBeCloseTo(1 / 3);
    expect(result.missingCount).toBe(2);
  });

  it('rejects when covered AC has failing tests', () => {
    const gate = new ImplementationReviewGate();
    const result = gate.evaluateSync(makeInput({
      implementationBundle: makeBundle([
        makeExecution({
          taskId: 'task-1:WP-01:ST-01',
          allowedScope: ['AC-1.1'],
          testResults: [{ name: 'unit', passed: false, message: 'assertion error' }],
        }),
        makeExecution({ taskId: 'task-1:WP-01:ST-02', allowedScope: ['AC-1.2'] }),
        makeExecution({ taskId: 'task-1:WP-02:ST-01', allowedScope: ['AC-2.1'] }),
      ]),
    }));

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.some((f) => f.ruleId === 'implementation-test-results')).toBe(true);
    expect(result.mustFix.some((f) => f.message.includes('AC-1.1'))).toBe(true);
    expect(result.coverageRate).toBe(1);
  });

  it('approves empty spec vacuously', () => {
    const gate = new ImplementationReviewGate();
    const result = gate.evaluateSync(makeInput({
      specOutput: makeSpec({
        functionalRequirements: [],
        acceptanceCriteria: [],
      }),
      implementationBundle: makeBundle([]),
    }));

    expect(result.conclusion).toBe('passed');
    expect(result.coverageResults).toEqual([]);
    expect(result.coverageRate).toBe(1);
    expect(result.score).toBe(1);
  });

  it('treats FR-level only scope as partial coverage and rejects with coverage score', () => {
    const gate = new ImplementationReviewGate();
    const result = gate.evaluateSync(makeInput({
      implementationBundle: makeBundle([
        makeExecution({ taskId: 'task-1:WP-01', allowedScope: ['FR-01'] }),
        makeExecution({ taskId: 'task-1:WP-02', allowedScope: ['AC-2.1'] }),
      ]),
    }));

    expect(result.conclusion).toBe('rejected');
    expect(result.partialCount).toBe(2);
    expect(result.coveredCount).toBe(1);
    expect(result.missingCount).toBe(0);
    expect(result.coverageRate).toBeCloseTo(1 / 3);
    expect(result.mustFix.some((f) => f.message.includes('only partially covered'))).toBe(true);
  });

  it('includes execution evidence for covered ACs', () => {
    const gate = new ImplementationReviewGate();
    const result = gate.evaluateSync(makeInput({
      implementationBundle: makeBundle([
        makeExecution({ taskId: 'task-1:WP-01:ST-01', subTaskId: 'ST-01', allowedScope: ['AC-1.1'] }),
        makeExecution({ taskId: 'task-1:WP-01:ST-02', subTaskId: 'ST-02', allowedScope: ['AC-1.2'] }),
        makeExecution({ taskId: 'task-1:WP-02:ST-01', subTaskId: 'ST-03', allowedScope: ['AC-2.1'] }),
      ]),
    }));

    const coverage = result.coverageResults.find((r) => r.acId === 'AC-1.1');
    expect(coverage?.evidence).toContain('task-1:WP-01:ST-01');
    expect(coverage?.evidence).toContain('subTask:ST-01');
  });

  it('adds L2 semantic scan gaps to review findings and rejects uncovered ACs', async () => {
    const l2Scanner = {
      scan: vi.fn(async () => ({
        level: 'l2' as const,
        pass: false,
        timestamp: '2026-05-23T00:00:00.000Z',
        logs: [],
        entries: [
          {
            frId: 'FR-01',
            acId: 'AC-1.2',
            status: 'uncovered' as const,
            confidence: 0,
            evidence: { file: '', lineRange: [1, 1] as [number, number] },
            rationale: 'No semantic evidence found.',
          },
        ],
      })),
    };
    const gate = new ImplementationReviewGate({ l2Scanner });

    const result = await gate.evaluate(makeInput({
      implementationBundle: makeBundle([
        makeExecution({ taskId: 'task-1:WP-01:ST-01', allowedScope: ['AC-1.1'] }),
        makeExecution({ taskId: 'task-1:WP-01:ST-02', allowedScope: ['AC-1.2'] }),
        makeExecution({ taskId: 'task-1:WP-02:ST-01', allowedScope: ['AC-2.1'] }),
      ]),
      l2ScanInput: { specPath: '/tmp/spec.md', sourceDir: '/tmp/src', writeReport: false },
    }));

    expect(l2Scanner.scan).toHaveBeenCalledOnce();
    expect(result.conclusion).toBe('rejected');
    expect(result.l2Scan?.pass).toBe(false);
    expect(result.mustFix.some((f) => f.ruleId === 'implementation-l2-ac-semantic-coverage' && f.message.includes('AC-1.2'))).toBe(true);
  });
});
