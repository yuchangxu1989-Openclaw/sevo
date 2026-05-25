import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TestCaseStage } from '../test-case-stage.js';
import type { TestCaseStageInput } from '../test-case-types.js';
import type { SpecOutput } from '../spec-types.js';

function makeSpecOutput(frCount: number, acsPerFr = 2): SpecOutput {
  const functionalRequirements = Array.from({ length: frCount }, (_, i) => {
    const frId = `FR-${String(i + 1).padStart(2, '0')}`;
    const acceptanceCriteria = Array.from({ length: acsPerFr }, (_, j) => ({
      id: `AC-${i + 1}.${j + 1}`,
      description: `Criteria ${j + 1} for ${frId}`,
      requirementId: frId,
    }));
    return {
      id: frId,
      title: `Requirement ${i + 1}`,
      description: `Description for ${frId}`,
      acceptanceCriteria,
    };
  });

  return {
    summary: 'Test spec summary',
    functionalRequirements,
    acceptanceCriteria: functionalRequirements.flatMap((fr) => fr.acceptanceCriteria),
    clarifications: [],
    artifact: { id: 'test:spec-v1', type: 'spec-package', path: '/tmp/spec.json', createdAt: '2025-01-01T00:00:00Z' },
  };
}

describe('TestCaseStage', () => {
  const tmpDir = path.join(os.tmpdir(), 'sevo-test-case-test');

  it('generates at least one test case per AC (default adapter)', async () => {
    const stage = new TestCaseStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const spec = makeSpecOutput(3, 2); // 3 FRs × 2 ACs = 6 test cases minimum
    const input: TestCaseStageInput = {
      taskId: 'task-tc-001',
      specPackage: spec,
      artifactBasePath: path.join(tmpDir, 'default'),
    };

    const output = await stage.execute(input);

    // At least one TC per AC
    const allAcIds = spec.acceptanceCriteria.map((ac) => ac.id);
    const coveredAcIds = new Set(output.testCaseDocument.testCases.map((tc) => tc.acId));
    for (const acId of allAcIds) {
      expect(coveredAcIds.has(acId)).toBe(true);
    }

    expect(output.testCaseDocument.testCases.length).toBeGreaterThanOrEqual(6);
    expect(output.metadata.totalTestCases).toBe(output.testCaseDocument.testCases.length);
    expect(output.artifact.type).toBe('test-case-document');

    // Verify file written
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });

  it('high priority FRs appear first in output', async () => {
    const stage = new TestCaseStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const spec = makeSpecOutput(3, 1);
    const input: TestCaseStageInput = {
      taskId: 'task-tc-002',
      specPackage: spec,
      artifactBasePath: path.join(tmpDir, 'priority'),
      frPriorities: {
        'FR-01': 'low',
        'FR-02': 'high',
        'FR-03': 'medium',
      },
    };

    const output = await stage.execute(input);
    const frOrder = output.testCaseDocument.testCases.map((tc) => tc.frId);

    // FR-02 (high) should come before FR-03 (medium) and FR-01 (low)
    const fr02Index = frOrder.indexOf('FR-02');
    const fr03Index = frOrder.indexOf('FR-03');
    const fr01Index = frOrder.indexOf('FR-01');

    expect(fr02Index).toBeLessThan(fr03Index);
    expect(fr03Index).toBeLessThan(fr01Index);
  });

  it('handles empty spec (zero FRs)', async () => {
    const stage = new TestCaseStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: TestCaseStageInput = {
      taskId: 'task-tc-003',
      specPackage: makeSpecOutput(0),
      artifactBasePath: path.join(tmpDir, 'empty'),
    };

    const output = await stage.execute(input);

    expect(output.testCaseDocument.testCases).toHaveLength(0);
    expect(output.metadata.totalTestCases).toBe(0);
    expect(Object.keys(output.metadata.coverageByFR)).toHaveLength(0);
  });

  it('test cases are independent from spec (stored separately)', async () => {
    const stage = new TestCaseStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const spec = makeSpecOutput(2, 1);
    const input: TestCaseStageInput = {
      taskId: 'task-tc-004',
      specPackage: spec,
      artifactBasePath: path.join(tmpDir, 'independent'),
    };

    const output = await stage.execute(input);

    // Artifact is a separate file, not the spec artifact
    expect(output.artifact.id).toBe('task-tc-004:test-cases');
    expect(output.artifact.type).toBe('test-case-document');
    expect(output.artifact.path).toContain('test-cases.json');
    expect(output.artifact.path).not.toContain('spec-package');
  });

  it('uses custom adapter for test case generation', async () => {
    const stage = new TestCaseStage({
      adapter: {
        generateTestCases: async () => ({
          testCases: [
            {
              frId: 'FR-01',
              acId: 'AC-1.1',
              description: 'Custom test case from adapter',
              steps: [
                { action: 'Do something', expected: 'Something happens' },
                { action: 'Verify result' },
              ],
              expectedResult: 'System behaves correctly',
              priority: 'high',
            },
          ],
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: TestCaseStageInput = {
      taskId: 'task-tc-005',
      specPackage: makeSpecOutput(1, 1),
      artifactBasePath: path.join(tmpDir, 'adapter'),
    };

    const output = await stage.execute(input);

    expect(output.testCaseDocument.testCases).toHaveLength(1);
    const tc = output.testCaseDocument.testCases[0]!;
    expect(tc.description).toBe('Custom test case from adapter');
    expect(tc.steps).toHaveLength(2);
    expect(tc.steps[0]!.order).toBe(1);
    expect(tc.steps[1]!.order).toBe(2);
    expect(tc.priority).toBe('high');
  });
});
