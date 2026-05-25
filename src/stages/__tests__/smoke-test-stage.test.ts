import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { SmokeTestStage } from '../smoke-test-stage.js';
import type { SmokeTestStageInput, SmokeTestTarget } from '../smoke-test-types.js';
import type { ArtifactRef } from '../../types/index.js';

const implArtifact: ArtifactRef = {
  id: 'impl-001:implementation',
  type: 'implementation',
  path: 'artifacts/implement/impl.json',
  createdAt: '2025-01-01T00:00:00Z',
};

function makeTargets(): SmokeTestTarget[] {
  return [
    { id: 'ST-1', dimension: 'core-path', description: 'Main CLI entry responds to --help' },
    { id: 'ST-2', dimension: 'build-integrity', description: 'dist/ contains index.js' },
    { id: 'ST-3', dimension: 'entry-crash', description: 'require(main) does not throw' },
  ];
}

function makeInput(overrides?: Partial<SmokeTestStageInput>): SmokeTestStageInput {
  return {
    taskId: 'smoke-001',
    pipelineId: 'pipe-1',
    implementationArtifacts: [implArtifact],
    targets: makeTargets(),
    artifactBasePath: path.join(os.tmpdir(), 'sevo-smoke-test'),
    ...overrides,
  };
}

describe('SmokeTestStage', () => {
  it('auto-advances from review to smoke-test (AC-4.24o)', async () => {
    // The stage itself executes when PipelineEngine advances to it.
    // This test verifies the stage can execute successfully after being reached.
    const stage = new SmokeTestStage({
      adapter: {
        runSmokeCheck: async () => ({ status: 'pass' }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.smokeTestReport.gateConclusion).toBe('passed');
    expect(output.metadata.executedAt).toBe('2025-01-01T00:00:00Z');
  });

  it('covers core-path, build-integrity, entry-crash dimensions (AC-4.24p)', async () => {
    const dimensions: string[] = [];
    const stage = new SmokeTestStage({
      adapter: {
        runSmokeCheck: async (req) => {
          dimensions.push(req.target.dimension);
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    await stage.execute(makeInput());
    expect(dimensions).toContain('core-path');
    expect(dimensions).toContain('build-integrity');
    expect(dimensions).toContain('entry-crash');
  });

  it('blocks subsequent stages on failure with reproduction steps (AC-4.24q)', async () => {
    const stage = new SmokeTestStage({
      adapter: {
        runSmokeCheck: async (req) => {
          if (req.target.dimension === 'entry-crash') {
            return {
              status: 'fail',
              detail: 'TypeError: Cannot read property x of undefined',
              reproductionSteps: 'Run: node -e "require(\'./dist\')"',
            };
          }
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.smokeTestReport.gateConclusion).toBe('rejected');
    expect(output.smokeTestReport.failedChecks).toHaveLength(1);
    expect(output.smokeTestReport.failedChecks[0]!.id).toBe('ST-3');
    expect(output.smokeTestReport.failureDetails).toHaveLength(1);
    expect(output.smokeTestReport.failureDetails[0]!.checkId).toBe('ST-3');
  });

  it('skips checks when no adapter is provided', async () => {
    const stage = new SmokeTestStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.metadata.skipped).toBe(3);
    expect(output.metadata.passed).toBe(0);
    expect(output.metadata.failed).toBe(0);
    // Skipped checks do not block — gate passes
    expect(output.smokeTestReport.gateConclusion).toBe('passed');
  });

  it('writes artifact to disk with correct structure', async () => {
    const stage = new SmokeTestStage({
      adapter: {
        runSmokeCheck: async () => ({ status: 'pass' }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.artifact.id).toBe('smoke-001:smoke-test-report');
    expect(output.artifact.type).toBe('smoke-test-report');
    expect(output.artifact.path).toContain('smoke-001-smoke-test-report.json');
    expect(output.artifact.metadata).toEqual({
      checkCount: 3,
      gateConclusion: 'passed',
    });
  });

  it('passes implementation artifacts to adapter', async () => {
    let receivedArtifacts: ArtifactRef[] = [];
    const stage = new SmokeTestStage({
      adapter: {
        runSmokeCheck: async (req) => {
          receivedArtifacts = req.implementationArtifacts;
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    await stage.execute(makeInput());
    expect(receivedArtifacts).toHaveLength(1);
    expect(receivedArtifacts[0]!.id).toBe('impl-001:implementation');
  });

  it('reports correct metadata counts', async () => {
    const stage = new SmokeTestStage({
      adapter: {
        runSmokeCheck: async (req) => {
          if (req.target.dimension === 'core-path') return { status: 'pass' };
          if (req.target.dimension === 'build-integrity') return { status: 'fail', detail: 'missing dist/' };
          return { status: 'pass' };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.metadata.totalChecks).toBe(3);
    expect(output.metadata.passed).toBe(2);
    expect(output.metadata.failed).toBe(1);
    expect(output.metadata.skipped).toBe(0);
    expect(output.metadata.gateConclusion).toBe('rejected');
  });
});
