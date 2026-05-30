import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ContractStage } from '../contract-stage.js';
import type { ContractStageInput, ContractAnalysisResponse } from '../contract-types.js';
import type { SpecOutput } from '../spec-types.js';

function makeSpecOutput(frCount: number): SpecOutput {
  const functionalRequirements = Array.from({ length: frCount }, (_, i) => ({
    id: `FR-${String(i + 1).padStart(2, '0')}`,
    title: `Requirement ${i + 1}`,
    description: `Description for FR-${String(i + 1).padStart(2, '0')}`,
    acceptanceCriteria: [
      { id: `AC-${i + 1}.1`, description: `Criteria for FR-${i + 1}`, requirementId: `FR-${String(i + 1).padStart(2, '0')}` },
    ],
  }));

  return {
    summary: 'Test spec summary',
    functionalRequirements,
    acceptanceCriteria: functionalRequirements.flatMap((fr) => fr.acceptanceCriteria),
    clarifications: [],
    artifact: { id: 'test:spec', type: 'spec-package', path: '/tmp/spec.json', createdAt: '2025-01-01T00:00:00Z' },
  };
}

describe('ContractStage', () => {
  const tmpDir = path.join(os.tmpdir(), 'sevo-contract-test');

  it('generates contract package from spec (default adapter)', async () => {
    const stage = new ContractStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ContractStageInput = {
      taskId: 'task-001',
      specPackage: makeSpecOutput(3),
      artifactBasePath: path.join(tmpDir, 'default'),
    };

    const output = await stage.execute(input);

    expect(output.contractPackage.workPackages).toHaveLength(3);
    expect(output.contractPackage.architecturePlan).toContain('Test spec summary');
    expect(output.contractPackage.implementationBoundaries).toHaveLength(1);
    expect(output.contractPackage.deliveryOrder).toEqual(['WP-01', 'WP-02', 'WP-03']);
    expect(output.metadata.totalWorkPackages).toBe(3);
    expect(output.metadata.totalFRsCovered).toBe(3);
    expect(output.artifact.type).toBe('contract-package');

    // Verify file written
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });

  it('work packages cover all FRs', async () => {
    const stage = new ContractStage({ adapter: {} });
    const spec = makeSpecOutput(5);
    const input: ContractStageInput = {
      taskId: 'task-002',
      specPackage: spec,
      artifactBasePath: path.join(tmpDir, 'coverage'),
    };

    const output = await stage.execute(input);
    const coveredFRs = new Set(output.contractPackage.workPackages.flatMap((wp) => wp.frIds));

    for (const fr of spec.functionalRequirements) {
      expect(coveredFRs.has(fr.id)).toBe(true);
    }
  });

  it('delivery order respects dependencies (topological sort)', async () => {
    const stage = new ContractStage({
      adapter: {
        generateContract: async () => ({
          architecturePlan: 'Plan with deps',
          workPackages: [
            { frIds: ['FR-01'], description: 'Foundation', dependencies: [], estimatedEffort: '2d' },
            { frIds: ['FR-02'], description: 'Core logic', dependencies: ['WP-01'], estimatedEffort: '3d' },
            { frIds: ['FR-03'], description: 'UI layer', dependencies: ['WP-02'], estimatedEffort: '2d' },
          ],
          implementationBoundaries: [
            { scope: 'Backend + Frontend', constraints: ['TypeScript only'], outOfScope: ['Mobile'] },
          ],
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ContractStageInput = {
      taskId: 'task-003',
      specPackage: makeSpecOutput(3),
      artifactBasePath: path.join(tmpDir, 'deps'),
    };

    const output = await stage.execute(input);

    expect(output.contractPackage.deliveryOrder).toEqual(['WP-01', 'WP-02', 'WP-03']);
    expect(output.contractPackage.workPackages[1]!.dependencies).toEqual(['WP-01']);
  });

  it('annotates implementation boundaries', async () => {
    const stage = new ContractStage({
      adapter: {
        generateContract: async () => ({
          architecturePlan: 'Bounded plan',
          workPackages: [
            { frIds: ['FR-01'], description: 'Core', dependencies: [] },
          ],
          implementationBoundaries: [
            { scope: 'Core module', constraints: ['No external deps'], outOfScope: ['Analytics', 'Billing'] },
          ],
        }),
      },
    });

    const input: ContractStageInput = {
      taskId: 'task-004',
      specPackage: makeSpecOutput(1),
      artifactBasePath: path.join(tmpDir, 'boundaries'),
    };

    const output = await stage.execute(input);
    const boundary = output.contractPackage.implementationBoundaries[0]!;

    expect(boundary.scope).toBe('Core module');
    expect(boundary.constraints).toContain('No external deps');
    expect(boundary.outOfScope).toContain('Analytics');
    expect(boundary.outOfScope).toContain('Billing');
  });

  it('handles empty spec (zero FRs)', async () => {
    const stage = new ContractStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ContractStageInput = {
      taskId: 'task-005',
      specPackage: makeSpecOutput(0),
      artifactBasePath: path.join(tmpDir, 'empty'),
    };

    const output = await stage.execute(input);

    expect(output.contractPackage.workPackages).toHaveLength(0);
    expect(output.contractPackage.deliveryOrder).toEqual([]);
    expect(output.metadata.totalWorkPackages).toBe(0);
    expect(output.metadata.totalFRsCovered).toBe(0);
  });
});
