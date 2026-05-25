import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { VerifyStage } from '../verify-stage.js';
import type { VerifyStageInput, VerifyTarget } from '../verify-types.js';
import type { ArtifactRef } from '../../types/index.js';

const releaseArtifact: ArtifactRef = {
  id: 'deploy-001:release-artifact',
  type: 'release-artifact',
  path: 'artifacts/deploy/release.json',
  createdAt: '2025-01-01T00:00:00Z',
};

function makeTargets(): VerifyTarget[] {
  return [
    { id: 'V-1', description: 'Login flow e2e', category: 'functional' },
    { id: 'V-2', description: 'P95 latency < 200ms', category: 'nfr' },
    { id: 'V-3', description: 'Package installable', category: 'deliverability' },
  ];
}

function makeInput(overrides?: Partial<VerifyStageInput>): VerifyStageInput {
  return {
    taskId: 'verify-001',
    pipelineId: 'pipe-1',
    releaseArtifact,
    targets: makeTargets(),
    artifactBasePath: path.join(os.tmpdir(), 'sevo-verify-test'),
    ...overrides,
  };
}

describe('VerifyStage', () => {
  it('runs verification independent of dev environment (AC-4.33)', async () => {
    const checked: string[] = [];
    const stage = new VerifyStage({
      adapter: {
        runVerification: async (req) => {
          checked.push(req.target.id);
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(checked).toEqual(['V-1', 'V-2', 'V-3']);
    expect(output.verificationBundle.allPassed).toBe(true);
  });

  it('covers functional, NFR, and deliverability categories (AC-4.34)', async () => {
    const categories: string[] = [];
    const stage = new VerifyStage({
      adapter: {
        runVerification: async (req) => {
          categories.push(req.target.category);
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    await stage.execute(makeInput());
    expect(categories).toContain('functional');
    expect(categories).toContain('nfr');
    expect(categories).toContain('deliverability');
  });

  it('distinguishes deliverable vs not-deliverable (AC-4.35)', async () => {
    const stage = new VerifyStage({
      adapter: {
        runVerification: async (req) => {
          if (req.target.id === 'V-2') return { status: 'fail', detail: 'P95 = 350ms' };
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.deliverable).toBe(false);
    expect(output.verificationBundle.failedChecks).toHaveLength(1);
    expect(output.verificationBundle.failedChecks[0]!.detail).toBe('P95 = 350ms');
  });

  it('verify failure blocks ledger pass conclusion (AC-4.36)', async () => {
    const stage = new VerifyStage({
      adapter: {
        runVerification: async () => ({ status: 'fail', detail: 'broken' }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.deliverable).toBe(false);
    expect(output.metadata.failed).toBe(3);
  });

  it('denies by default when no explicit verification evidence is provided', async () => {
    const stage = new VerifyStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput({ targets: [] }));
    expect(output.deliverable).toBe(false);
    expect(output.verificationBundle.failedChecks).toHaveLength(1);
    expect(output.verificationBundle.failedChecks[0]!.detail).toBe('No verification evidence provided');
    expect(output.metadata.failed).toBe(1);
  });

  it('does not accept tiered scan evidence as a substitute for runtime verification', async () => {
    const stage = new VerifyStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput({
      targets: [],
      releaseArtifact: {
        ...releaseArtifact,
        metadata: { tieredScan: { status: 'passed' } },
      },
    }));

    expect(output.deliverable).toBe(false);
    expect(output.metadata.totalChecks).toBe(1);
    expect(output.metadata.passed).toBe(0);
    expect(output.verificationBundle.failedChecks[0]!.id).toBe('verify-no-evidence');
  });
});
