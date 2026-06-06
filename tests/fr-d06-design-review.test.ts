import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseDesignReviewStage,
  isDesignStageId,
  buildDesignReviewPrompt,
  buildDesignReviewFixPrompt,
  queueDesignReview,
  queueDesignReviewFix,
  patchDesignReviewStatus,
  designStageArtifactPath,
  areDesignStagesSatisfied,
  DESIGN_REVIEW_CONFIG,
  MAX_DESIGN_REVIEW_ROUNDS,
} from '../index.js';

// Reach the plugin-global so we can read the pendingAdvances queue the
// orchestration helpers write into.
const SEVO_GLOBAL = (globalThis as any)[Symbol.for('openclaw.sevo-pipeline.instance')];

function clearPending(pipelineId: string) {
  SEVO_GLOBAL.pendingAdvances.delete(pipelineId);
}
function pendingFor(pipelineId: string): any[] {
  return SEVO_GLOBAL.pendingAdvances.get(pipelineId) || [];
}

// Minimal in-memory engine stub: queueDesignReview / patchDesignReviewStatus
// only need load()/save() to read+mutate stage metadata.
function makeEngine(state: any) {
  return {
    load: (_pid: string) => state,
    save: (_pid: string, s: any) => { state = s; },
  };
}

describe('FR-D06 design review orchestration', () => {
  describe('stage id parsing', () => {
    it('recognizes the reviewable design stages', () => {
      expect(isDesignStageId('ux-interaction-design')).toBe(true);
      expect(isDesignStageId('architecture-design')).toBe(true);
      expect(isDesignStageId('implement')).toBe(false);
      expect(isDesignStageId('review')).toBe(false);
    });

    it('parses design-review and design-review-fix special stage ids', () => {
      expect(parseDesignReviewStage('ux-interaction-design-design-review-1'))
        .toEqual({ type: 'review', origin: 'ux-interaction-design', round: 1 });
      expect(parseDesignReviewStage('architecture-design-design-review-fix-2'))
        .toEqual({ type: 'fix', origin: 'architecture-design', round: 2 });
      expect(parseDesignReviewStage('architecture-design-pm-design-review-1'))
        .toEqual({ type: 'review', origin: 'architecture-design', reviewKey: 'pm', round: 1 });
      expect(parseDesignReviewStage('architecture-design-audit-design-review-fix-2'))
        .toEqual({ type: 'fix', origin: 'architecture-design', reviewKey: 'audit', round: 2 });
      expect(parseDesignReviewStage('implement')).toBeNull();
      expect(parseDesignReviewStage('review-rfl-fix-1')).toBeNull();
    });

    it('exposes a config entry with a status field for each reviewable design stage', () => {
      expect(DESIGN_REVIEW_CONFIG['ux-interaction-design'].statusField).toBe('pmReviewStatus');
      expect(DESIGN_REVIEW_CONFIG['architecture-design'].statusField).toBe('architectureReviewStatus');
      expect(DESIGN_REVIEW_CONFIG['architecture-design'].reviews.map((r: any) => r.statusField))
        .toEqual(['pmReviewStatus', 'architectureReviewStatus']);
      expect(MAX_DESIGN_REVIEW_ROUNDS).toBeGreaterThanOrEqual(1);
    });
  });

  describe('prompt construction', () => {
    it('builds a review prompt referencing the artifact and review focus', () => {
      const prompt = buildDesignReviewPrompt({
        pipelineId: 'pipe-1',
        projectSlug: 'demo',
        designStageId: 'ux-interaction-design',
        artifactPath: 'projects/demo/docs/ux/interaction-design.md',
        round: 1,
      });
      expect(prompt).toContain('SEVO Design Review');
      expect(prompt).toContain('projects/demo/docs/ux/interaction-design.md');
      expect(prompt).toContain('Conclusion: passed / conditional / rejected.');
      expect(prompt).toContain('demo-ux-interaction-design-review.md');
    });

    it('builds a fix prompt listing the blockers', () => {
      const prompt = buildDesignReviewFixPrompt({
        pipelineId: 'pipe-1',
        projectSlug: 'demo',
        designStageId: 'architecture-design',
        artifactPath: 'projects/demo/docs/architecture/architecture.md',
        blockers: [{ item: 'API schema undefined' }, 'module boundary crosses spec'],
        round: 1,
      });
      expect(prompt).toContain('SEVO Design Review Fix');
      expect(prompt).toContain('API schema undefined');
      expect(prompt).toContain('module boundary crosses spec');
    });
  });

  describe('artifact path resolution', () => {
    it('returns the first recorded artifact path', () => {
      const state = {
        stages: {
          'ux-interaction-design': { artifacts: [{ path: 'a/ux.md' }, { path: 'a/ux2.md' }] },
        },
      };
      expect(designStageArtifactPath(state, 'ux-interaction-design')).toBe('a/ux.md');
    });
    it('returns null when no artifact recorded', () => {
      expect(designStageArtifactPath({ stages: { 'ux-interaction-design': {} } }, 'ux-interaction-design')).toBeNull();
    });
  });

  describe('status patching closes the Implement admission gate', () => {
    let tmpDir: string;
    let uxArtifact: string;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-dr-'));
      uxArtifact = path.join(tmpDir, 'interaction-design.md');
      fs.writeFileSync(uxArtifact, '# UX\n\ncontent\n', 'utf8');
    });

    it('blocks Implement while UX pmReviewStatus is pending, unblocks once patched to passed', () => {
      const state: any = {
        requiredStages: ['ux-interaction-design', 'implement'],
        stages: {
          'ux-interaction-design': {
            status: 'passed',
            metadata: { pmReviewStatus: 'pending' },
            artifacts: [{ path: uxArtifact }],
          },
        },
      };

      // Pending review → Implement blocked.
      let gate = areDesignStagesSatisfied(state);
      expect(gate.satisfied).toBe(false);
      expect(gate.blockers.some((b: string) => b.includes('pmReviewStatus'))).toBe(true);

      // Patch the review to passed via the orchestration helper.
      const engine = makeEngine(state);
      const ok = patchDesignReviewStatus(engine as any, 'pipe-ux', 'ux-interaction-design', 'passed', { round: 1 });
      expect(ok).toBe(true);
      expect(state.stages['ux-interaction-design'].metadata.pmReviewStatus).toBe('passed');

      // Now the gate is satisfied.
      gate = areDesignStagesSatisfied(state);
      expect(gate.satisfied).toBe(true);
    });

    it('architecture PM + Audit reviews are both required and missing metadata blocks by default', () => {
      const archArtifact = path.join(tmpDir, 'architecture.md');
      fs.writeFileSync(archArtifact, '# Arch\n\ncontent\n', 'utf8');
      const state: any = {
        requiredStages: ['architecture-design', 'implement'],
        stages: {
          'architecture-design': {
            status: 'passed',
            metadata: {},
            artifacts: [{ path: archArtifact }],
          },
        },
      };

      let gate = areDesignStagesSatisfied(state);
      expect(gate.satisfied).toBe(false);
      expect(gate.blockers.some((b: string) => b.includes('architectureReviewRequired'))).toBe(true);
      expect(gate.blockers.some((b: string) => b.includes('pmReviewStatus'))).toBe(true);
      expect(gate.blockers.some((b: string) => b.includes('architectureReviewStatus'))).toBe(true);

      const engine = makeEngine(state);
      patchDesignReviewStatus(engine as any, 'pipe-arch', 'architecture-design', 'passed', { round: 1, reviewKey: 'pm' });
      gate = areDesignStagesSatisfied(state);
      expect(gate.satisfied).toBe(false);
      expect(gate.blockers.some((b: string) => b.includes('pmReviewStatus'))).toBe(false);
      expect(gate.blockers.some((b: string) => b.includes('architectureReviewStatus'))).toBe(true);

      patchDesignReviewStatus(engine as any, 'pipe-arch', 'architecture-design', 'passed', { round: 1, reviewKey: 'audit' });
      gate = areDesignStagesSatisfied(state);
      expect(gate.satisfied).toBe(true);
    });

    it('blocks architecture Implement admission when either PM or Audit review is not passed', () => {
      const archArtifact = path.join(tmpDir, 'architecture-one-missing.md');
      fs.writeFileSync(archArtifact, '# Arch\n\ncontent\n', 'utf8');
      const base = (metadata: any) => ({
        requiredStages: ['architecture-design', 'implement'],
        stages: {
          'architecture-design': {
            status: 'passed',
            metadata,
            artifacts: [{ path: archArtifact }],
          },
        },
      });

      expect(areDesignStagesSatisfied(base({ architectureReviewRequired: true, pmReviewStatus: 'passed', architectureReviewStatus: 'pending' })).satisfied).toBe(false);
      expect(areDesignStagesSatisfied(base({ architectureReviewRequired: true, pmReviewStatus: 'pending', architectureReviewStatus: 'passed' })).satisfied).toBe(false);
      expect(areDesignStagesSatisfied(base({ architectureReviewRequired: true, pmReviewStatus: 'passed', architectureReviewStatus: 'passed' })).satisfied).toBe(true);
    });
  });

  describe('review and fix tasks are queued onto pendingAdvances', () => {
    it('queueDesignReview enqueues a design-review task and marks the design pending', () => {
      const pipelineId = 'pipe-queue-1';
      clearPending(pipelineId);
      const state: any = {
        stages: {
          'ux-interaction-design': {
            status: 'passed',
            metadata: {},
            artifacts: [{ path: 'projects/demo/docs/ux/interaction-design.md' }],
          },
        },
      };
      const engine = makeEngine(state);
      const queued = queueDesignReview(pipelineId, 'ux-interaction-design', 1, state, engine as any);
      expect(queued).toBe(true);

      const entries = pendingFor(pipelineId);
      const reviewEntry = entries.find(e => e.stageId === 'ux-interaction-design-design-review-1');
      expect(reviewEntry).toBeTruthy();
      expect(reviewEntry.taskDescription).toContain('SEVO Design Review');
      // Marked pending so the Implement gate stays blocked until the verdict.
      expect(state.stages['ux-interaction-design'].metadata.pmReviewStatus).toBe('pending');

      // Idempotent: a second call does not double-queue.
      expect(queueDesignReview(pipelineId, 'ux-interaction-design', 1, state, engine as any)).toBe(false);
      clearPending(pipelineId);
    });

    it('queueDesignReview enqueues PM and Audit architecture reviews and marks both pending', () => {
      const pipelineId = 'pipe-queue-arch-dual';
      clearPending(pipelineId);
      const state: any = {
        stages: {
          'architecture-design': {
            status: 'active',
            metadata: {},
            artifacts: [{ path: 'projects/demo/docs/architecture/architecture.md' }],
          },
        },
      };
      const engine = makeEngine(state);
      const queued = queueDesignReview(pipelineId, 'architecture-design', 1, state, engine as any);
      expect(queued).toBe(true);

      const entries = pendingFor(pipelineId);
      expect(entries.find(e => e.stageId === 'architecture-design-pm-design-review-1')).toBeTruthy();
      expect(entries.find(e => e.stageId === 'architecture-design-audit-design-review-1')).toBeTruthy();
      expect(state.stages['architecture-design'].status).toBe('active');
      expect(state.stages['architecture-design'].metadata.architectureReviewRequired).toBe(true);
      expect(state.stages['architecture-design'].metadata.pmReviewStatus).toBe('pending');
      expect(state.stages['architecture-design'].metadata.architectureReviewStatus).toBe('pending');
      clearPending(pipelineId);
    });

    it('queueDesignReviewFix enqueues a fix task carrying the blockers', () => {
      const pipelineId = 'pipe-queue-2';
      clearPending(pipelineId);
      const state: any = {
        stages: {
          'architecture-design': {
            status: 'passed',
            metadata: {},
            artifacts: [{ path: 'projects/demo/docs/architecture/architecture.md' }],
          },
        },
      };
      const queued = queueDesignReviewFix(pipelineId, 'architecture-design', [{ item: 'data model missing' }], 1, state);
      expect(queued).toBe(true);
      const entries = pendingFor(pipelineId);
      const fixEntry = entries.find(e => e.stageId === 'architecture-design-design-review-fix-1');
      expect(fixEntry).toBeTruthy();
      expect(fixEntry.taskDescription).toContain('data model missing');
      clearPending(pipelineId);
    });
  });
});
