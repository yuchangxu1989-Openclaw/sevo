import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { ReviewStage } from '../review-stage.js';
import type { ReviewStageInput } from '../review-types.js';
import type { ArtifactRef } from '../../types/index.js';

function makeArtifacts(): ArtifactRef[] {
  return [{
    id: 'impl-001:bundle',
    type: 'implementation-bundle',
    path: '/tmp/impl.json',
    createdAt: '2025-01-01T00:00:00Z',
  }];
}

describe('ReviewStage', () => {
  const tmpDir = path.join(os.tmpdir(), 'sevo-review-test');

  it('evaluates both quality and product dimensions in parallel (AC-4.21)', async () => {
    const evaluated: string[] = [];
    const stage = new ReviewStage({
      adapter: {
        evaluateDimension: async (req) => {
          evaluated.push(req.dimension);
          return { conclusion: 'passed', findings: [], reviewer: `${req.dimension}-bot` };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ReviewStageInput = {
      taskId: 'review-001',
      implementationArtifacts: makeArtifacts(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(evaluated.sort()).toEqual(['product', 'quality']);
    expect(output.reviewBundle.reviews).toHaveLength(2);
  });

  it('produces three-tier conclusion: passed (AC-4.22)', async () => {
    const stage = new ReviewStage({
      adapter: {
        evaluateDimension: async () => ({
          conclusion: 'passed',
          findings: [],
          reviewer: 'bot',
        }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ReviewStageInput = {
      taskId: 'review-002',
      implementationArtifacts: makeArtifacts(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.reviewBundle.gateConclusion).toBe('passed');
  });

  it('produces conditional when one dimension has warnings (AC-4.22)', async () => {
    const stage = new ReviewStage({
      adapter: {
        evaluateDimension: async (req) => {
          if (req.dimension === 'quality') {
            return {
              conclusion: 'conditional',
              findings: [{ severity: 'warning', message: 'Minor issue' }],
              reviewer: 'quality-bot',
            };
          }
          return { conclusion: 'passed', findings: [], reviewer: 'product-bot' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ReviewStageInput = {
      taskId: 'review-003',
      implementationArtifacts: makeArtifacts(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.reviewBundle.gateConclusion).toBe('conditional');
  });

  it('produces rejected with blockers pointing to artifacts (AC-4.23)', async () => {
    const stage = new ReviewStage({
      adapter: {
        evaluateDimension: async (req) => {
          if (req.dimension === 'product') {
            return {
              conclusion: 'rejected',
              findings: [{ severity: 'blocker', message: 'Missing FR-03 coverage', artifact: 'impl.ts' }],
              reviewer: 'product-bot',
            };
          }
          return { conclusion: 'passed', findings: [], reviewer: 'quality-bot' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ReviewStageInput = {
      taskId: 'review-004',
      implementationArtifacts: makeArtifacts(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.reviewBundle.gateConclusion).toBe('rejected');
    expect(output.reviewBundle.blockers).toHaveLength(1);
    expect(output.reviewBundle.fixRequirements[0]!.artifact).toBe('impl.ts');
  });

  it('handles adapter failure gracefully as rejected (AC-4.24)', async () => {
    const stage = new ReviewStage({
      adapter: {
        evaluateDimension: async (req) => {
          if (req.dimension === 'quality') throw new Error('Adapter timeout');
          return { conclusion: 'passed', findings: [], reviewer: 'product-bot' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const input: ReviewStageInput = {
      taskId: 'review-005',
      implementationArtifacts: makeArtifacts(),
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.reviewBundle.gateConclusion).toBe('rejected');
    const qualityReview = output.reviewBundle.reviews.find((r) => r.dimension === 'quality');
    expect(qualityReview!.conclusion).toBe('rejected');
  });
});
