import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { LedgerStage } from '../ledger-stage.js';
import type { LedgerStageInput } from '../ledger-types.js';
import type { ArtifactRef, StageRecord } from '../../types/index.js';

function makeEvidence(): ArtifactRef[] {
  return [
    { id: 'spec-001:spec', type: 'spec', path: 'artifacts/spec.json', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'deploy-001:release', type: 'release-artifact', path: 'artifacts/release.json', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'verify-001:bundle', type: 'verification-bundle', path: 'artifacts/verify.json', createdAt: '2025-01-01T00:00:00Z' },
  ];
}

function makeStages(): StageRecord[] {
  return [
    { stageId: 'spec', status: 'passed', artifacts: [] },
    { stageId: 'implement', status: 'passed', artifacts: [] },
    { stageId: 'deploy', status: 'passed', artifacts: [] },
    { stageId: 'verify', status: 'passed', artifacts: [] },
  ];
}

function makeInput(overrides?: Partial<LedgerStageInput>): LedgerStageInput {
  return {
    taskId: 'ledger-001',
    pipelineId: 'pipe-1',
    version: '1.0.0',
    scope: 'auth-module',
    stages: makeStages(),
    evidence: makeEvidence(),
    verifyPassed: true,
    responsibilities: ['team-backend owns auth module'],
    followUpActions: ['Monitor P95 latency post-release'],
    lessons: [
      { id: 'L-1', category: 'process', description: 'Gate checks caught spec ambiguity early', actionable: false },
    ],
    artifactBasePath: path.join(os.tmpdir(), 'sevo-ledger-test'),
    ...overrides,
  };
}

describe('LedgerStage', () => {
  it('traces all key artifacts from the pipeline (AC-4.37)', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.ledgerEntry.evidence).toHaveLength(3);
    expect(output.ledgerEntry.stages).toHaveLength(4);
    expect(output.ledgerEntry.pipelineId).toBe('pipe-1');
  });

  it('records conclusion, responsibilities, and follow-up actions (AC-4.38)', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.ledgerEntry.conclusion).toBe('delivered');
    expect(output.ledgerEntry.responsibilities).toContain('team-backend owns auth module');
    expect(output.ledgerEntry.followUpActions).toContain('Monitor P95 latency post-release');
  });

  it('lessons are reusable by subsequent tasks (AC-4.39)', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.ledgerEntry.lessons).toHaveLength(1);
    expect(output.ledgerEntry.lessons[0]!.category).toBe('process');
    expect(output.metadata.lessonCount).toBe(1);
  });

  it('verify failure produces aborted conclusion (AC-4.36 + AC-4.40)', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput({ verifyPassed: false }));
    expect(output.ledgerEntry.conclusion).toBe('aborted');
    expect(output.metadata.conclusion).toBe('aborted');
    // Artifact still written — no ledger entry = no closure
    expect(output.artifact.type).toBe('ledger-entry');
  });

  it('persists entry via adapter when provided', async () => {
    let persisted = false;
    const stage = new LedgerStage({
      adapter: {
        persistEntry: async () => {
          persisted = true;
          return { persisted: true };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    await stage.execute(makeInput());
    expect(persisted).toBe(true);
  });

  it('populates clarificationRefs when provided in input (AC-4.54)', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const clarificationRefs = [
      { id: 'clr-001:spec-package', type: 'clarification-spec-package', path: '/artifacts/clr-001.md', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'clr-002:adr', type: 'clarification-adr', path: '/artifacts/decisions/ADR-1-foo.md', createdAt: '2025-01-01T00:00:00Z' },
    ];

    const output = await stage.execute(makeInput({ clarificationRefs }));
    expect(output.ledgerEntry.clarificationRefs).toHaveLength(2);
    expect(output.ledgerEntry.clarificationRefs![0]!.id).toBe('clr-001:spec-package');
    expect(output.ledgerEntry.clarificationRefs![1]!.id).toBe('clr-002:adr');
  });

  it('returns empty array for clarificationRefs when not provided in input (AC-4.54)', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.ledgerEntry.clarificationRefs).toEqual([]);
  });
});
