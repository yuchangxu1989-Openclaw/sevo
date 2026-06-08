import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { SevoOrchestrator } from '../orchestrator.js';
import type {
  TaskScope,
  StageId,
  StageResult,
  ReviewBundle,
} from '../types/index.js';

// ─── Helpers ───

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-integration-'));
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Build a passing StageResult for a given stage. */
function passStage(stageId: StageId): StageResult {
  return {
    stageId,
    outcome: 'passed',
    artifacts: [
      {
        id: `art-${stageId}`,
        type: 'document',
        path: `/artifacts/${stageId}.md`,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function stageStatus(sevo: SevoOrchestrator, pipelineId: string, stageId: StageId): string {
  return sevo.getPipelineState(pipelineId).stages[stageId]?.status ?? 'missing';
}

function completeIfActive(sevo: SevoOrchestrator, pipelineId: string, stageId: StageId): void {
  if (stageStatus(sevo, pipelineId, stageId) === 'active') {
    sevo.advanceStage(pipelineId, passStage(stageId));
  }
}

// ─── Tests ───

describe('SevoOrchestrator — integration', () => {
  let tmpDir: string;
  let sevo: SevoOrchestrator;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    sevo = new SevoOrchestrator(tmpDir);
  });

  afterEach(() => {
    cleanDir(tmpDir);
  });

  // ── L0 path: implement → review → regression → verify → ledger ──

  describe('L0 direct path', () => {
    it('creates pipeline, advances all stages, records to ledger', async () => {
      // Create — L0 scope: single file, <50 lines, explicit opt-in (FR-2 AC3).
      const scope: TaskScope = {
        estimatedFiles: 1,
        estimatedLines: 20,
        userExplicitL0: true,
      };
      const createResult = await sevo.createPipeline('task-l0', 'Fix typo', scope);
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const state = createResult.value;
      expect(state.level).toBe('L0');
      expect(state.requiredStages.length).toBeGreaterThan(0);

      const pid = state.pipelineId;

      // Advance through all L0 stages
      const l0Stages: StageId[] = [
        'implement',
        'review',
        'regression',
        'verify',
        'ledger',
      ];

      for (const stageId of l0Stages) {
        const transition = sevo.advanceStage(pid, passStage(stageId));
        expect(transition.pipelineId).toBe(pid);
        expect(transition.fromStage).toBe(stageId);
      }

      // Record delivery
      const entry = sevo.recordDelivery(pid);
      expect(entry.pipelineId).toBe(pid);
      expect(entry.conclusion).toBe('delivered');
      expect(entry.stages.length).toBeGreaterThan(0);

      // Query back
      const results = sevo.queryHistory({ pipelineId: pid });
      expect(results).toHaveLength(1);
      expect(results[0]?.conclusion).toBe('delivered');
    });
  });

  // ── L2+ path: full pipeline with gates ──

  describe('L2+ full pipeline', () => {
    it('creates pipeline, advances stages with gate evaluations, records to ledger', async () => {
      // Create — L2+ scope: new module
      const scope: TaskScope = {
        isNewModule: true,
        estimatedFiles: 15,
        estimatedLines: 800,
        affectedDomains: ['auth', 'api', 'db'],
      };
      const createResult = await sevo.createPipeline(
        'task-l2',
        'New auth module',
        scope,
      );
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const state = createResult.value;
      expect(state.level).toBe('L2+');

      const pid = state.pipelineId;

      // 1. spec
      sevo.advanceStage(pid, passStage('spec'));

      // 2. spec-review-gate — evaluate then advance
      const specGateResult = sevo.evaluateGate('spec-review-gate', [
        {
          reviewer: 'sa-01',
          role: 'architect',
          conclusion: 'passed',
          issues: [],
        },
      ]);
      expect(specGateResult.ok).toBe(true);
      if (specGateResult.ok) {
        expect(specGateResult.value.conclusion).toBe('passed');
      }
      sevo.advanceStage(pid, passStage('spec-review-gate'));

      // 3. Branches after spec review run in parallel. Contract review waits for the
      // selected design branches, so complete active design and authoring branches first.
      completeIfActive(sevo, pid, 'test-case-authoring');
      completeIfActive(sevo, pid, 'ux-acceptance-authoring');
      completeIfActive(sevo, pid, 'commercial-acceptance-authoring');
      completeIfActive(sevo, pid, 'ux-interaction-design');
      completeIfActive(sevo, pid, 'architecture-design');

      // 4. contract
      sevo.advanceStage(pid, passStage('contract'));

      // 5. contract-review-gate — three-party review
      const contractGateResult = sevo.evaluateGate('contract-review-gate', [
        {
          reviewer: 'pm-01',
          role: 'product',
          conclusion: 'passed',
          issues: [],
        },
        {
          reviewer: 'dev-01',
          role: 'developer',
          conclusion: 'passed',
          issues: [],
        },
        {
          reviewer: 'audit-01',
          role: 'quality',
          conclusion: 'passed',
          issues: [],
        },
      ]);
      expect(contractGateResult.ok).toBe(true);
      if (contractGateResult.ok) {
        expect(contractGateResult.value.conclusion).toBe('passed');
      }
      sevo.advanceStage(pid, passStage('contract-review-gate'));


      // 6. implement
      sevo.advanceStage(pid, passStage('implement'));

      // 7. review — dual gate (quality + product)
      const reviewGateResult = sevo.evaluateGate('review', [
        {
          reviewer: 'audit-01',
          role: 'quality',
          conclusion: 'passed',
          issues: [],
        },
        {
          reviewer: 'pm-01',
          role: 'product',
          conclusion: 'passed',
          issues: [],
        },
      ]);
      expect(reviewGateResult.ok).toBe(true);
      sevo.advanceStage(pid, passStage('review'));

      // 8. smoke-test → ux-acceptance + pm-commercial-review (parallel) → regression → ...
      sevo.advanceStage(pid, passStage('smoke-test'));
      sevo.advanceStage(pid, passStage('ux-acceptance'));
      sevo.advanceStage(pid, passStage('pm-commercial-review'));
      sevo.advanceStage(pid, passStage('regression'));
      sevo.advanceStage(pid, passStage('publish-generalization-gate'));
      sevo.advanceStage(pid, passStage('deploy'));
      sevo.advanceStage(pid, passStage('verify'));
      sevo.advanceStage(pid, passStage('readme'));
      sevo.advanceStage(pid, passStage('post-release-validation'));
      sevo.advanceStage(pid, passStage('clean-install-verification'));
      sevo.advanceStage(pid, passStage('ledger'));

      // Record delivery
      const entry = sevo.recordDelivery(pid);
      expect(entry.conclusion).toBe('delivered');
      expect(entry.evidence.length).toBeGreaterThan(0);

      // Query — verify it's in the ledger
      const results = sevo.queryHistory({});
      expect(results.length).toBeGreaterThanOrEqual(1);
      const match = results.find((e) => e.pipelineId === pid);
      expect(match).toBeDefined();
      expect(match?.conclusion).toBe('delivered');
    });
  });

  // ── Error cases ──

  describe('error handling', () => {
    it('rejects pipeline creation with empty taskId', async () => {
      const result = await sevo.createPipeline('', 'No ID');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TASK_ID');
      }
    });

    it('rejects gate evaluation with missing roles', async () => {
      const result = sevo.evaluateGate('contract-review-gate', [
        {
          reviewer: 'pm-01',
          role: 'product',
          conclusion: 'passed',
          issues: [],
        },
        // missing developer and quality
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_REQUIRED_ROLES');
      }
    });

    it('rejects gate evaluation for unknown gate', async () => {
      const result = sevo.evaluateGate('nonexistent-gate', [
        {
          reviewer: 'x',
          role: 'architect',
          conclusion: 'passed',
          issues: [],
        },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN_GATE');
      }
    });
  });

  // ── Gate conditional verdict ──

  describe('gate verdict variations', () => {
    it('rejects when a MUST role gives conditional conclusion', async () => {
      // architect is MUST for spec-review-gate; conditional on MUST → rejected
      const result = sevo.evaluateGate('spec-review-gate', [
        {
          reviewer: 'sa-01',
          role: 'architect',
          conclusion: 'conditional',
          issues: ['Spec missing NFR section'],
        },
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.conclusion).toBe('rejected');
        expect(result.value.blockers).toHaveLength(1);
        expect(result.value.blockers[0]?.item).toBe('Spec missing NFR section');
      }
    });

    it('returns conditional when SHOULD role has issues but MUST roles pass', async () => {
      // contract-review-gate: product/developer/quality are all MUST.
      // Add an advisory (non-configured) role with issues → conditional.
      const result = sevo.evaluateGate('contract-review-gate', [
        { reviewer: 'pm-01', role: 'product', conclusion: 'passed', issues: [] },
        { reviewer: 'dev-01', role: 'developer', conclusion: 'passed', issues: [] },
        { reviewer: 'audit-01', role: 'quality', conclusion: 'passed', issues: [] },
        { reviewer: 'advisor', role: 'advisory', conclusion: 'conditional', issues: ['Minor style concern'] },
      ]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.conclusion).toBe('conditional');
      }
    });
  });
});
