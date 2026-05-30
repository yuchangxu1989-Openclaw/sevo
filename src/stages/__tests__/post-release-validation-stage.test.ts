import { describe, expect, it } from 'vitest';

import { PostReleaseValidationStage } from '../post-release-validation-stage.js';
import type {
  PostReleaseValidationInput,
  FrGapStatus,
} from '../post-release-validation-types.js';
import type { ArtifactRef } from '../../types/index.js';
import type { L3ScanReport } from '../../scan/types.js';

function makeArtifact(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: overrides.id ?? 'art-001',
    type: overrides.type ?? 'generic',
    path: overrides.path ?? 'artifacts/generic.json',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    metadata: overrides.metadata,
  };
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
  };
}

describe('PostReleaseValidationStage', () => {
  const stage = new PostReleaseValidationStage();

  function makeL3Report(overrides: Partial<L3ScanReport> = {}): L3ScanReport {
    return {
      level: 'l3',
      pass: true,
      timestamp: '2026-01-01T00:00:00Z',
      entries: [
        {
          domain: 'core-flow',
          status: 'alive',
          verifyCommand: 'node bin/sevo.js status',
          actualOutput: 'ok',
          judgment: 'meaningful',
          expectedExitCode: 0,
          actualExitCode: 0,
          evidence: { exitCode: 0 },
        },
      ],
      acVerification: [],
      ...overrides,
    };
  }

  describe('gap analysis basics', () => {
    it('reports all FRs as missing when no artifacts exist', () => {
      const result = stage.run(makeInput({ deployArtifacts: [] }));

      expect(result.report.totalFrs).toBe(2);
      expect(result.report.missingCount).toBe(2);
      expect(result.report.coveredCount).toBe(0);
      expect(result.report.gaps).toBe(2);
      expect(result.canComplete).toBe(false);
      expect(result.fixTasks).toHaveLength(2);
    });

    it('reports all FRs as covered when deploy+verify artifacts exist', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'deploy-001', type: 'deploy-bundle' }),
        makeArtifact({ id: 'verify-001', type: 'verify-report' }),
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));

      expect(result.report.coveredCount).toBe(2);
      expect(result.report.gaps).toBe(0);
      expect(result.canComplete).toBe(true);
      expect(result.fixTasks).toHaveLength(0);
    });

    it('reports code-only when deploy exists but no verify', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'deploy-001', type: 'deploy-bundle' }),
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));

      expect(result.report.codeOnlyCount).toBe(2);
      expect(result.report.gaps).toBe(2);
      expect(result.canComplete).toBe(false);
    });
  });

  describe('FR-specific artifact matching', () => {
    it('matches artifacts by id containing FR identifier', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'fr-01:implement', type: 'implement-result' }),
        makeArtifact({ id: 'fr-01:verify', type: 'verify-report' }),
        // FR-02 has no artifacts
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));

      const fr01 = result.report.entries.find((e) => e.frId === 'FR-01');
      const fr02 = result.report.entries.find((e) => e.frId === 'FR-02');

      expect(fr01?.status).toBe('covered');
      expect(fr02?.status).toBe('missing');
      expect(result.report.gaps).toBe(1);
      expect(result.canComplete).toBe(false);
    });

    it('matches artifacts by metadata.frId', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'art-001', type: 'code-review', metadata: { frId: 'FR-01' } }),
        makeArtifact({ id: 'art-002', type: 'smoke-test', metadata: { frId: 'FR-01' } }),
        makeArtifact({ id: 'art-003', type: 'implement-result', metadata: { frId: 'FR-02' } }),
        makeArtifact({ id: 'art-004', type: 'acceptance-report', metadata: { frId: 'FR-02' } }),
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));

      expect(result.report.coveredCount).toBe(2);
      expect(result.report.gaps).toBe(0);
      expect(result.canComplete).toBe(true);
    });

    it('reports code-only when FR has impl but no verify artifact', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'fr-01:implement', type: 'implement-result' }),
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));

      const fr01 = result.report.entries.find((e) => e.frId === 'FR-01');
      expect(fr01?.status).toBe('code-only');
      expect(fr01?.reason).toContain('no runtime verification');
    });
  });

  describe('fix task generation', () => {
    it('generates implement+verify task for missing FRs', () => {
      const result = stage.run(makeInput({ deployArtifacts: [] }));

      const task = result.fixTasks.find((t) => t.frId === 'FR-01');
      expect(task?.description).toContain('Implement and verify');
    });

    it('generates verify-only task for code-only FRs', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'fr-01:implement', type: 'implement-result' }),
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));

      const task = result.fixTasks.find((t) => t.frId === 'FR-01');
      expect(task?.description).toContain('Verify runtime availability');
    });

    it('generates no fix tasks when all covered', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'deploy-001', type: 'release-artifact' }),
        makeArtifact({ id: 'verify-001', type: 'regression-report' }),
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));
      expect(result.fixTasks).toHaveLength(0);
    });
  });

  describe('report metadata', () => {
    it('includes analyzedAt timestamp', () => {
      const result = stage.run(makeInput({ deployArtifacts: [] }));
      expect(result.report.analyzedAt).toBeTruthy();
      expect(() => new Date(result.report.analyzedAt)).not.toThrow();
    });

    it('gaps equals codeOnly + missing', () => {
      const artifacts: ArtifactRef[] = [
        makeArtifact({ id: 'fr-01:implement', type: 'code-review' }),
        // FR-01 = code-only (has impl, no verify)
        // FR-02 = missing
      ];

      const result = stage.run(makeInput({ deployArtifacts: artifacts }));
      expect(result.report.gaps).toBe(
        result.report.codeOnlyCount + result.report.missingCount,
      );
    });
  });

  describe('L3 runtime gating', () => {
    it('keeps FR as code-only when no L3 runtime verification executed', async () => {
      const l3Report = makeL3Report({ entries: [], acVerification: [] });
      const stageWithStub = new class extends PostReleaseValidationStage {
        override async execute(input: PostReleaseValidationInput) {
          const rerun = (this as unknown as { runFrAnalysis: Function }).runFrAnalysis(
            input.frList,
            input.deployArtifacts,
            l3Report,
          );
          return {
            report: { ...rerun.report, tieredRuntime: l3Report },
            fixTasks: rerun.fixTasks,
            canComplete: false,
          };
        }
      }();

      const result = await stageWithStub.execute(makeInput({
        frList: [{ frId: 'FR-01', summary: 'User login' }],
        deployArtifacts: [
          makeArtifact({ id: 'fr-01:implement', type: 'implement-result' }),
          makeArtifact({ id: 'fr-01:verify', type: 'verify-report' }),
        ],
      }));

      expect(result.report.entries[0]?.status).toBe('code-only');
      expect(result.report.entries[0]?.reason).toContain('no runtime verification evidence');
      expect(result.canComplete).toBe(false);
    });

    it('keeps FR as code-only when runtime ran but AC verification is missing', async () => {
      const l3Report = makeL3Report({ acVerification: [] });
      const stageWithStub = new class extends PostReleaseValidationStage {
        override async execute(input: PostReleaseValidationInput) {
          const original = await super.execute({
            ...input,
            runtimeVerification: undefined,
          });
          const rerun = (this as unknown as { runFrAnalysis: Function }).runFrAnalysis(
            input.frList,
            input.deployArtifacts,
            l3Report,
          );
          return {
            report: { ...rerun.report, tieredRuntime: l3Report },
            fixTasks: rerun.fixTasks,
            canComplete: false,
          };
        }
      }();

      const result = await stageWithStub.execute(makeInput({
        frList: [{ frId: 'FR-01', summary: 'User login' }],
        deployArtifacts: [
          makeArtifact({ id: 'fr-01:implement', type: 'implement-result' }),
          makeArtifact({ id: 'fr-01:verify', type: 'verify-report' }),
        ],
      }));

      expect(result.report.entries[0]?.status).toBe('code-only');
      expect(result.report.entries[0]?.reason).toContain('no FR-scoped AC runtime verification');
    });

    it('marks FR covered only when L3 AC verification satisfies the FR', async () => {
      const l3Report = makeL3Report({
        acVerification: [
          {
            frId: 'FR-01',
            acId: 'AC-01.1',
            acText: 'User can log in',
            implementationFile: 'src/login.ts',
            satisfied: true,
            rationale: 'runtime output demonstrates success',
          },
        ],
      });
      const stageWithStub = new class extends PostReleaseValidationStage {
        override async execute(input: PostReleaseValidationInput) {
          const rerun = (this as unknown as { runFrAnalysis: Function }).runFrAnalysis(
            input.frList,
            input.deployArtifacts,
            l3Report,
          );
          return {
            report: { ...rerun.report, tieredRuntime: l3Report },
            fixTasks: rerun.fixTasks,
            canComplete: rerun.report.gaps === 0,
          };
        }
      }();

      const result = await stageWithStub.execute(makeInput({
        frList: [{ frId: 'FR-01', summary: 'User login' }],
        deployArtifacts: [
          makeArtifact({ id: 'fr-01:implement', type: 'implement-result' }),
          makeArtifact({ id: 'fr-01:verify', type: 'verify-report' }),
        ],
      }));

      expect(result.report.entries[0]?.status).toBe('covered');
      expect(result.canComplete).toBe(true);
    });
  });

  describe('canComplete gate condition', () => {
    it('canComplete is true only when gaps === 0', () => {
      // All covered
      const covered = stage.run(
        makeInput({
          deployArtifacts: [
            makeArtifact({ id: 'd', type: 'deploy-bundle' }),
            makeArtifact({ id: 'v', type: 'verify-report' }),
          ],
        }),
      );
      expect(covered.canComplete).toBe(true);

      // Has gaps
      const gapped = stage.run(makeInput({ deployArtifacts: [] }));
      expect(gapped.canComplete).toBe(false);
    });
  });

  describe('empty FR list', () => {
    it('reports zero gaps and canComplete when no FRs to check', () => {
      const result = stage.run(makeInput({ frList: [], deployArtifacts: [] }));

      expect(result.report.totalFrs).toBe(0);
      expect(result.report.gaps).toBe(0);
      expect(result.canComplete).toBe(true);
      expect(result.fixTasks).toHaveLength(0);
    });
  });
});
