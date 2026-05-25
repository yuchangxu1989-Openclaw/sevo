import { describe, expect, it } from 'vitest';

import { PostReleaseValidationStage } from '../post-release-validation-stage.js';
import type {
  PostReleaseValidationInput,
} from '../post-release-validation-types.js';
import type { ArtifactRef, ObjectiveKeyResult } from '../../types/index.js';

function makeArtifact(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: overrides.id ?? 'art-001',
    type: overrides.type ?? 'generic',
    path: overrides.path ?? 'artifacts/generic.json',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    metadata: overrides.metadata,
  };
}

function makeOkrTree(statuses: Array<'not-started' | 'in-progress' | 'achieved' | 'blocked'>): ObjectiveKeyResult[] {
  return [{
    objectiveId: 'O-1',
    description: 'Stranger can run first pipeline in 5 minutes',
    keyResults: statuses.map((status, i) => ({
      krId: `KR-${i + 1}`,
      description: `Key Result ${i + 1}`,
      measure: `Measure ${i + 1}`,
      status,
    })),
  }];
}

function makeInput(overrides: Partial<PostReleaseValidationInput> = {}): PostReleaseValidationInput {
  return {
    pipelineId: overrides.pipelineId ?? 'pipe-001',
    projectSlug: overrides.projectSlug ?? 'test-project',
    frList: overrides.frList ?? [
      { frId: 'FR-01', summary: 'User login' },
      { frId: 'FR-02', summary: 'Dashboard' },
    ],
    deployArtifacts: overrides.deployArtifacts ?? [],
    endStateGoal: overrides.endStateGoal,
    okrTree: overrides.okrTree,
  };
}

describe('PostReleaseValidationStage — OKR-driven', () => {
  const stage = new PostReleaseValidationStage();

  describe('KR-level gap analysis', () => {
    it('reports all KRs achieved when all statuses are achieved', () => {
      const input = makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved', 'achieved']),
        deployArtifacts: [
          makeArtifact({ id: 'deploy-001', type: 'deploy-bundle' }),
          makeArtifact({ id: 'verify-001', type: 'verify-report' }),
        ],
      });

      const result = stage.run(input);

      expect(result.report.krEntries).toHaveLength(3);
      expect(result.report.krGaps).toBe(0);
      expect(result.canComplete).toBe(true);
    });

    it('reports KR gaps when some KRs are not achieved', () => {
      const input = makeInput({
        okrTree: makeOkrTree(['achieved', 'in-progress', 'not-started']),
        deployArtifacts: [
          makeArtifact({ id: 'deploy-001', type: 'deploy-bundle' }),
          makeArtifact({ id: 'verify-001', type: 'verify-report' }),
        ],
      });

      const result = stage.run(input);

      expect(result.report.krEntries).toHaveLength(3);
      expect(result.report.krGaps).toBe(2);
      expect(result.canComplete).toBe(false);

      const kr1 = result.report.krEntries!.find((e) => e.krId === 'KR-1');
      const kr2 = result.report.krEntries!.find((e) => e.krId === 'KR-2');
      const kr3 = result.report.krEntries!.find((e) => e.krId === 'KR-3');

      expect(kr1?.status).toBe('achieved');
      expect(kr2?.status).toBe('partial');
      expect(kr3?.status).toBe('not-achieved');
    });

    it('maps blocked KR status to not-achieved', () => {
      const input = makeInput({
        okrTree: makeOkrTree(['achieved', 'blocked']),
        deployArtifacts: [],
      });

      const result = stage.run(input);

      const kr2 = result.report.krEntries!.find((e) => e.krId === 'KR-2');
      expect(kr2?.status).toBe('not-achieved');
      expect(kr2?.reason).toContain('blocked');
    });
  });

  describe('canComplete KR-level determination', () => {
    it('canComplete is true only when krGaps === 0', () => {
      const allAchieved = stage.run(makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved']),
        deployArtifacts: [],
      }));
      expect(allAchieved.canComplete).toBe(true);

      const hasGaps = stage.run(makeInput({
        okrTree: makeOkrTree(['achieved', 'not-started']),
        deployArtifacts: [],
      }));
      expect(hasGaps.canComplete).toBe(false);
    });

    it('KR-level takes precedence over FR-level when okrTree present', () => {
      // FR gaps exist (no artifacts) but all KRs achieved → canComplete = true
      const input = makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved']),
        deployArtifacts: [], // No artifacts → FR gaps exist
      });

      const result = stage.run(input);

      expect(result.report.gaps).toBe(2); // FR gaps
      expect(result.report.krGaps).toBe(0); // KR gaps
      expect(result.canComplete).toBe(true); // KR takes precedence
    });
  });

  describe('fixTasks KR-level generation', () => {
    it('generates fix tasks based on KR when okrTree present', () => {
      const input = makeInput({
        okrTree: makeOkrTree(['achieved', 'not-started', 'in-progress']),
        deployArtifacts: [],
      });

      const result = stage.run(input);

      expect(result.fixTasks).toHaveLength(2);
      expect(result.fixTasks[0]!.frId).toBe('KR-2');
      expect(result.fixTasks[0]!.description).toContain('Implement KR KR-2');
      expect(result.fixTasks[1]!.frId).toBe('KR-3');
      expect(result.fixTasks[1]!.description).toContain('Complete KR KR-3');
    });

    it('generates no fix tasks when all KRs achieved', () => {
      const input = makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved']),
        deployArtifacts: [],
      });

      const result = stage.run(input);
      expect(result.fixTasks).toHaveLength(0);
    });
  });

  describe('backward compatibility (no OKR)', () => {
    it('falls back to FR-based validation when no okrTree', () => {
      const input = makeInput({
        deployArtifacts: [],
        // No okrTree
      });

      const result = stage.run(input);

      expect(result.report.krEntries).toBeUndefined();
      expect(result.report.krGaps).toBeUndefined();
      expect(result.canComplete).toBe(false); // Based on FR gaps
      expect(result.fixTasks[0]!.frId).toBe('FR-01'); // FR-based fix tasks
    });

    it('falls back to FR-based when okrTree is empty array', () => {
      const input = makeInput({
        okrTree: [],
        deployArtifacts: [
          makeArtifact({ id: 'deploy-001', type: 'deploy-bundle' }),
          makeArtifact({ id: 'verify-001', type: 'verify-report' }),
        ],
      });

      const result = stage.run(input);

      expect(result.report.krEntries).toBeUndefined();
      expect(result.report.krGaps).toBeUndefined();
      expect(result.canComplete).toBe(true); // FR-based: all covered
    });
  });
});
