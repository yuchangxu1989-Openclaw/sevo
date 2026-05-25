import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ImplementStage } from '../implement-stage.js';
import type { ImplementStageInput, TaskExecutionResponse } from '../implement-types.js';
import type { DebuggingPhaseResponse } from '../debugging-types.js';
import type { ContractPackage, WorkPackage, SubTask } from '../contract-types.js';
import type { AcceptanceCriteria } from '../spec-types.js';

function makeWorkPackages(count: number): WorkPackage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `WP-${String(i + 1).padStart(2, '0')}`,
    frIds: [`FR-${String(i + 1).padStart(2, '0')}`],
    description: `Implement feature ${i + 1}`,
    dependencies: [],
  }));
}

function makeContractPackage(wpCount: number): ContractPackage {
  const wps = makeWorkPackages(wpCount);
  return {
    architecturePlan: 'Test architecture',
    implementationBoundaries: [{ scope: 'all', constraints: [], outOfScope: [] }],
    workPackages: wps,
    deliveryOrder: wps.map((wp) => wp.id),
  };
}

function makeAcceptanceCriteria(wpCount: number): AcceptanceCriteria[] {
  return Array.from({ length: wpCount }, (_, i) => ({
    id: `AC-${i + 1}.1`,
    description: `Feature ${i + 1} works correctly`,
    requirementId: `FR-${String(i + 1).padStart(2, '0')}`,
  }));
}

describe('ImplementStage', () => {
  const tmpDir = path.join(os.tmpdir(), 'sevo-implement-test');

  it('executes tasks for each work package in order', async () => {
    const executionOrder: string[] = [];
    const stage = new ImplementStage({
      adapter: {
        executeTask: async (req) => {
          executionOrder.push(req.workPackage.id);
          return {
            output: `Implemented ${req.workPackage.id}`,
            evidence: [{ type: 'code_change', content: `Changed files for ${req.workPackage.id}` }],
            testResults: [{ name: 'test-1', passed: true }],
          };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(3);
    const input: ImplementStageInput = {
      taskId: 'task-impl-001',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(3),
      artifactBasePath: path.join(tmpDir, 'order'),
    };

    const output = await stage.execute(input);

    expect(executionOrder).toEqual(['WP-01', 'WP-02', 'WP-03']);
    expect(output.implementationBundle.executions).toHaveLength(3);
    expect(output.metadata.totalTasksExecuted).toBe(3);
  });

  it('records evidence completely for each task', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [
            { type: 'test_result', content: 'All tests pass' },
            { type: 'code_change', content: 'Modified src/foo.ts' },
            { type: 'deviation_note', content: 'Used alternative approach' },
          ],
          testResults: [{ name: 'unit', passed: true }],
        }),
      },
      now: () => '2025-02-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(1);
    const input: ImplementStageInput = {
      taskId: 'task-evidence',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(1),
      artifactBasePath: path.join(tmpDir, 'evidence'),
    };

    const output = await stage.execute(input);
    const exec = output.implementationBundle.executions[0]!;

    expect(exec.evidence).toHaveLength(3);
    expect(exec.evidence[0]!.type).toBe('test_result');
    expect(exec.evidence[1]!.type).toBe('code_change');
    expect(exec.evidence[2]!.type).toBe('deviation_note');
    expect(exec.evidence[0]!.timestamp).toBe('2025-02-01T00:00:00Z');
  });

  it('builds FR→Task traceability mapping', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [],
          testResults: [{ name: 't', passed: true }],
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const wps: WorkPackage[] = [
      { id: 'WP-01', frIds: ['FR-01', 'FR-02'], description: 'Multi-FR', dependencies: [] },
      { id: 'WP-02', frIds: ['FR-02', 'FR-03'], description: 'Overlap', dependencies: [] },
    ];
    const contractPkg: ContractPackage = {
      architecturePlan: 'plan',
      implementationBoundaries: [],
      workPackages: wps,
      deliveryOrder: ['WP-01', 'WP-02'],
    };

    const input: ImplementStageInput = {
      taskId: 'task-trace',
      contractPackage: contractPkg,
      workPackages: wps,
      acceptanceCriteria: [],
      artifactBasePath: path.join(tmpDir, 'trace'),
    };

    const output = await stage.execute(input);
    const trace = output.implementationBundle.traceability;

    expect(trace.get('FR-01')).toEqual(['task-trace:WP-01']);
    expect(trace.get('FR-02')).toEqual(['task-trace:WP-01', 'task-trace:WP-02']);
    expect(trace.get('FR-03')).toEqual(['task-trace:WP-02']);
  });

  it('acceptance is based on test results, not self-report', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async (req) => ({
          output: 'I claim success!',
          evidence: [],
          testResults: req.workPackage.id === 'WP-02'
            ? [{ name: 'failing', passed: false, message: 'assertion error' }]
            : [{ name: 'passing', passed: true }],
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(2);
    const input: ImplementStageInput = {
      taskId: 'task-accept',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(2),
      artifactBasePath: path.join(tmpDir, 'accept'),
    };

    const output = await stage.execute(input);

    expect(output.metadata.allAccepted).toBe(false);
    expect(output.metadata.totalTestsPassed).toBe(1);
    expect(output.metadata.totalTestsFailed).toBe(1);
  });

  it('handles empty work packages gracefully', async () => {
    const stage = new ImplementStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const contractPkg: ContractPackage = {
      architecturePlan: 'empty',
      implementationBoundaries: [],
      workPackages: [],
      deliveryOrder: [],
    };

    const input: ImplementStageInput = {
      taskId: 'task-empty',
      contractPackage: contractPkg,
      workPackages: [],
      acceptanceCriteria: [],
      artifactBasePath: path.join(tmpDir, 'empty'),
    };

    const output = await stage.execute(input);

    expect(output.implementationBundle.executions).toHaveLength(0);
    expect(output.implementationBundle.summary).toContain('0');
    expect(output.metadata.totalTasksExecuted).toBe(0);
    expect(output.metadata.allAccepted).toBe(false); // zero tests = not accepted (AC-4.20b)
    expect(output.metadata.hasTests).toBe(false);
  });

  it('zero tests means allAccepted is false (AC-4.20b)', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [],
          testResults: [],
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(1);
    const input: ImplementStageInput = {
      taskId: 'task-zero-tests',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(1),
      artifactBasePath: path.join(tmpDir, 'zero-tests'),
    };

    const output = await stage.execute(input);

    expect(output.metadata.totalTestsPassed).toBe(0);
    expect(output.metadata.totalTestsFailed).toBe(0);
    expect(output.metadata.hasTests).toBe(false);
    expect(output.metadata.allAccepted).toBe(false);
  });

  it('uses default adapter when none provided', async () => {
    const stage = new ImplementStage({
      adapter: {},
      now: () => '2025-03-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(1);
    const input: ImplementStageInput = {
      taskId: 'task-default',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(1),
      artifactBasePath: path.join(tmpDir, 'default'),
    };

    const output = await stage.execute(input);

    expect(output.implementationBundle.executions).toHaveLength(1);
    const exec = output.implementationBundle.executions[0]!;
    expect(exec.evidence).toHaveLength(1);
    expect(exec.evidence[0]!.type).toBe('deviation_note');
    expect(exec.testResults).toHaveLength(0);
    expect(output.metadata.allAccepted).toBe(false); // no tests = not accepted (AC-4.20b)
    expect(output.metadata.hasTests).toBe(false);
  });

  it('runs embedded systematic debugging when debugging issues are present', async () => {
    const phaseOrder: string[] = [];
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [{ type: 'code_change', content: 'implemented' }],
          testResults: [{ name: 'unit', passed: true }],
        }),
        executeDebuggingPhase: async (req): Promise<DebuggingPhaseResponse> => {
          phaseOrder.push(req.phase);
          return {
            status: 'passed',
            evidence: [{ type: 'verification_result', content: `phase ${req.phase}` }],
            conclusion: `Done ${req.phase}`,
          };
        },
      },
      now: () => '2025-05-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(1);
    const input: ImplementStageInput = {
      taskId: 'task-debugging',
      pipelineId: 'pipe-debugging',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(1),
      debuggingIssues: [{ id: 'BUG-1', title: 'Crash', description: 'Save crashes intermittently' }],
      artifactBasePath: path.join(tmpDir, 'debugging-hook'),
    };

    const output = await stage.execute(input);

    expect(phaseOrder).toEqual(['reproduce', 'locate', 'analyze', 'verify']);
    expect(output.metadata.debugging).toMatchObject({
      totalIssues: 1,
      resolved: 1,
      unresolved: 0,
    });
  });

  it('writes artifact to disk', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [],
          testResults: [{ name: 't', passed: true }],
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const contractPkg = makeContractPackage(1);
    const input: ImplementStageInput = {
      taskId: 'task-artifact',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(1),
      artifactBasePath: path.join(tmpDir, 'artifact'),
    };

    const output = await stage.execute(input);

    expect(output.artifact.type).toBe('implementation-bundle');
    expect(fs.existsSync(output.artifact.path)).toBe(true);

    const content = JSON.parse(fs.readFileSync(output.artifact.path, 'utf8'));
    expect(content.executions).toHaveLength(1);
  });

  // ── SubTask tests (AC-4.12a, AC-4.17, AC-4.20) ──────────────────

  it('executes sub-tasks individually when WorkPackage has tasks', async () => {
    const executionOrder: string[] = [];
    const stage = new ImplementStage({
      adapter: {
        executeTask: async (req) => {
          executionOrder.push(req.subTask?.id ?? req.workPackage.id);
          return {
            output: `Implemented ${req.subTask?.id ?? req.workPackage.id}`,
            evidence: [{ type: 'code_change', content: 'changed' }],
            testResults: [{ name: 'test', passed: true }],
          };
        },
      },
      now: () => '2025-04-01T00:00:00Z',
    });

    const subTasks: SubTask[] = [
      { id: 'ST-01', description: 'Add interface', targetFiles: ['src/types.ts'], expectedChanges: 'New SubTask interface', estimatedMinutes: 3, acIds: ['AC-4.12a'], dependsOn: [], parallel: true },
      { id: 'ST-02', description: 'Update logic', targetFiles: ['src/stage.ts'], expectedChanges: 'Iterate sub-tasks', estimatedMinutes: 5, acIds: ['AC-4.17'], dependsOn: [], parallel: true },
    ];

    const wps: WorkPackage[] = [{
      id: 'WP-01',
      frIds: ['FR-01'],
      description: 'Implement sub-task decomposition',
      dependencies: [],
      tasks: subTasks,
    }];

    const contractPkg: ContractPackage = {
      architecturePlan: 'plan',
      implementationBoundaries: [],
      workPackages: wps,
      deliveryOrder: ['WP-01'],
    };

    const input: ImplementStageInput = {
      taskId: 'task-subtask',
      contractPackage: contractPkg,
      workPackages: wps,
      acceptanceCriteria: [{ id: 'AC-4.12a', description: 'Sub-task list', requirementId: 'FR-01' }],
      artifactBasePath: path.join(tmpDir, 'subtask'),
    };

    const output = await stage.execute(input);

    // Should execute each sub-task, not the WP as a whole
    expect(executionOrder).toEqual(['ST-01', 'ST-02']);
    expect(output.implementationBundle.executions).toHaveLength(2);

    const exec0 = output.implementationBundle.executions[0]!;
    expect(exec0.subTaskId).toBe('ST-01');
    expect(exec0.targetFiles).toEqual(['src/types.ts']);
    expect(exec0.estimatedMinutes).toBe(3);
    expect(exec0.taskId).toBe('task-subtask:WP-01:ST-01');
    expect(exec0.workPackageId).toBe('WP-01');
    expect(exec0.allowedScope).toEqual(['AC-4.12a']);

    const exec1 = output.implementationBundle.executions[1]!;
    expect(exec1.subTaskId).toBe('ST-02');
    expect(exec1.targetFiles).toEqual(['src/stage.ts']);
    expect(exec1.estimatedMinutes).toBe(5);
  });

  it('falls back to whole-WP execution when no tasks defined (backward compat)', async () => {
    const executionOrder: string[] = [];
    const stage = new ImplementStage({
      adapter: {
        executeTask: async (req) => {
          executionOrder.push(req.workPackage.id);
          return {
            output: `Implemented ${req.workPackage.id}`,
            evidence: [],
            testResults: [{ name: 'test', passed: true }],
          };
        },
      },
      now: () => '2025-04-01T00:00:00Z',
    });

    // WP without tasks field
    const contractPkg = makeContractPackage(2);
    const input: ImplementStageInput = {
      taskId: 'task-compat',
      contractPackage: contractPkg,
      workPackages: contractPkg.workPackages,
      acceptanceCriteria: makeAcceptanceCriteria(2),
      artifactBasePath: path.join(tmpDir, 'compat'),
    };

    const output = await stage.execute(input);

    expect(executionOrder).toEqual(['WP-01', 'WP-02']);
    expect(output.implementationBundle.executions).toHaveLength(2);
    // No subTaskId on whole-WP executions
    expect(output.implementationBundle.executions[0]!.subTaskId).toBeUndefined();
  });

  it('sub-task failure does not block sibling sub-tasks', async () => {
    let callCount = 0;
    const stage = new ImplementStage({
      adapter: {
        executeTask: async (req) => {
          callCount++;
          if (req.subTask?.id === 'ST-FAIL') {
            throw new Error('Simulated failure');
          }
          return {
            output: 'ok',
            evidence: [],
            testResults: [{ name: 'test', passed: true }],
          };
        },
      },
      now: () => '2025-04-01T00:00:00Z',
    });

    const subTasks: SubTask[] = [
      { id: 'ST-OK-1', description: 'First', targetFiles: ['a.ts'], expectedChanges: 'add', estimatedMinutes: 2, acIds: [], dependsOn: [], parallel: true },
      { id: 'ST-FAIL', description: 'Broken', targetFiles: ['b.ts'], expectedChanges: 'fix', estimatedMinutes: 3, acIds: [], dependsOn: [], parallel: true },
      { id: 'ST-OK-2', description: 'Third', targetFiles: ['c.ts'], expectedChanges: 'update', estimatedMinutes: 2, acIds: [], dependsOn: [], parallel: true },
    ];

    const wps: WorkPackage[] = [{
      id: 'WP-01',
      frIds: ['FR-01'],
      description: 'Mixed success',
      dependencies: [],
      tasks: subTasks,
    }];

    const contractPkg: ContractPackage = {
      architecturePlan: 'plan',
      implementationBoundaries: [],
      workPackages: wps,
      deliveryOrder: ['WP-01'],
    };

    const input: ImplementStageInput = {
      taskId: 'task-fail',
      contractPackage: contractPkg,
      workPackages: wps,
      acceptanceCriteria: [],
      artifactBasePath: path.join(tmpDir, 'fail'),
    };

    const output = await stage.execute(input);

    // All 3 sub-tasks should be attempted
    expect(callCount).toBe(3);
    expect(output.implementationBundle.executions).toHaveLength(3);

    // The failed one should have deviation_note evidence
    const failedExec = output.implementationBundle.executions[1]!;
    expect(failedExec.subTaskId).toBe('ST-FAIL');
    expect(failedExec.output).toContain('SubTask failed');
    expect(failedExec.evidence[0]!.type).toBe('deviation_note');

    // The third one should still succeed
    const thirdExec = output.implementationBundle.executions[2]!;
    expect(thirdExec.subTaskId).toBe('ST-OK-2');
    expect(thirdExec.output).toBe('ok');
  });
});
