/**
 * Tests for FR-18 Batch B: PDCA sub-cycle, max cycles, and Ledger OKR/PDCA evidence.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PostReleaseValidationStage } from '../post-release-validation-stage.js';
import type {
  PostReleaseValidationInput,
  KrGapEntry,
} from '../post-release-validation-types.js';
import type {
  ArtifactRef,
  ObjectiveKeyResult,
  PipelineState,
  StageId,
  StageRecord,
} from '../../types/index.js';
import { LedgerEngine } from '../../ledger/ledger-engine.js';

// ── Helpers ──

function makeArtifact(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: overrides.id ?? 'art-001',
    type: overrides.type ?? 'generic',
    path: overrides.path ?? 'artifacts/generic.json',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    metadata: overrides.metadata,
  };
}

function makeOkrTree(
  statuses: Array<'not-started' | 'in-progress' | 'achieved' | 'blocked'>,
): ObjectiveKeyResult[] {
  return [{
    objectiveId: 'O-1',
    description: 'Test objective',
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
    maxPdcaCycles: overrides.maxPdcaCycles,
  };
}

// ── AC-18.10: Sub-cycle tests ──

describe('PostReleaseValidationStage — PDCA sub-cycle (AC-18.10)', () => {
  const stage = new PostReleaseValidationStage();

  it('runWithPdca converges after one fix cycle', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started']),
    });

    const result = stage.runWithPdca(input, (_gaps, cycle) => {
      // After cycle 1, fix KR-2
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved']),
      });
    });

    expect(result.canComplete).toBe(true);
    expect(result.pdcaCycles).toHaveLength(1);
    expect(result.pdcaCycles![0]!.cycle).toBe(1);
    expect(result.pdcaCycles![0]!.result).toBe('converged');
    expect(result.pdcaCycles![0]!.triggeredBy).toContain('KR-2');
  });

  it('runWithPdca handles multiple cycles before convergence', () => {
    let callCount = 0;
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started', 'not-started']),
    });

    const result = stage.runWithPdca(input, (_gaps, cycle) => {
      callCount++;
      if (cycle === 1) {
        // Fix KR-2 only
        return makeInput({
          okrTree: makeOkrTree(['achieved', 'achieved', 'not-started']),
        });
      }
      // Fix KR-3 in cycle 2
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved', 'achieved']),
      });
    });

    expect(result.canComplete).toBe(true);
    expect(result.pdcaCycles).toHaveLength(2);
    expect(result.pdcaCycles![0]!.result).toBe('gap-remaining');
    expect(result.pdcaCycles![1]!.result).toBe('converged');
    expect(callCount).toBe(2);
  });

  it('sub-cycle does not modify main state machine (internal management)', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started']),
    });

    const result = stage.runWithPdca(input, () => {
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved']),
      });
    });

    // The result is a PostReleaseValidationOutput, not a PipelineState change
    expect(result.report).toBeDefined();
    expect(result.canComplete).toBe(true);
    expect(result.pdcaCycles).toBeDefined();
    // No PipelineState mutation — sub-cycle is internal
  });

  it('generates new work packages (fix tasks) for each sub-cycle', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started']),
    });

    const result = stage.runWithPdca(input, () => {
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved']),
      });
    });

    expect(result.pdcaCycles![0]!.newTasks.length).toBeGreaterThan(0);
    expect(result.pdcaCycles![0]!.newTasks[0]).toContain('KR-2');
  });

  it('no PDCA cycles when canComplete is true from the start', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'achieved']),
    });

    const result = stage.runWithPdca(input, () => {
      throw new Error('Should not be called');
    });

    expect(result.canComplete).toBe(true);
    expect(result.pdcaCycles).toHaveLength(0);
  });
});

// ── AC-18.11: PDCA max cycles + PdcaCycleRecord ──

describe('PostReleaseValidationStage — PDCA max cycles (AC-18.11)', () => {
  const stage = new PostReleaseValidationStage();

  it('escalates after reaching default max cycles (3)', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started']),
    });

    const result = stage.runWithPdca(input, () => {
      // Never fix — always return same gaps
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'not-started']),
      });
    });

    expect(result.canComplete).toBe(false);
    expect(result.pdcaCycles).toHaveLength(3);
    expect(result.pdcaCycles![2]!.result).toBe('escalated');
  });

  it('respects custom maxPdcaCycles', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started']),
      maxPdcaCycles: 5,
    });

    const result = stage.runWithPdca(input, () => {
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'not-started']),
        maxPdcaCycles: 5,
      });
    });

    expect(result.pdcaCycles).toHaveLength(5);
    expect(result.pdcaCycles![4]!.result).toBe('escalated');
  });

  it('maxPdcaCycles=1 allows only one cycle', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started']),
      maxPdcaCycles: 1,
    });

    const result = stage.runWithPdca(input, () => {
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'not-started']),
        maxPdcaCycles: 1,
      });
    });

    expect(result.pdcaCycles).toHaveLength(1);
    expect(result.pdcaCycles![0]!.result).toBe('escalated');
  });

  it('PdcaCycleRecord has correct structure', () => {
    const input = makeInput({
      okrTree: makeOkrTree(['achieved', 'not-started', 'blocked']),
    });

    const result = stage.runWithPdca(input, () => {
      return makeInput({
        okrTree: makeOkrTree(['achieved', 'achieved', 'achieved']),
      });
    });

    const record = result.pdcaCycles![0]!;
    expect(record.cycle).toBe(1);
    expect(record.triggeredBy).toEqual(['KR-2', 'KR-3']);
    expect(record.newTasks).toHaveLength(2);
    expect(record.result).toBe('converged');
  });
});

// ── AC-18.14: Ledger OKR/PDCA evidence ──

describe('LedgerEngine — OKR/PDCA evidence (AC-18.14)', () => {
  let tmpDir: string;

  function makeStageRecord(stageId: StageId, status: StageRecord['status']): StageRecord {
    return {
      stageId,
      status,
      artifacts: [{ id: `${stageId}-art`, type: 'document', path: `/artifacts/${stageId}`, createdAt: '2026-01-01T00:00:00Z' }],
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T01:00:00Z',
    };
  }

  function makePipelineState(): PipelineState {
    const requiredStages: StageId[] = ['spec', 'implement', 'review', 'ledger'];
    const stages = {} as Record<StageId, StageRecord>;
    for (const sid of requiredStages) {
      stages[sid] = makeStageRecord(sid, 'passed');
    }
    return {
      pipelineId: 'pipe-okr-001',
      taskId: 'task-001',
      level: 'L2+',
      requiredStages,
      stages,
      currentStage: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T01:00:00Z',
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-ledger-okr-'));
    const state = makePipelineState();
    const dir = path.join(tmpDir, 'pipelines', state.pipelineId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records OKR tree in ledger entry', () => {
    const engine = new LedgerEngine(tmpDir);
    const okrTree = makeOkrTree(['achieved', 'achieved']);

    const entry = engine.record('pipe-okr-001', { okrTree });

    expect(entry.okrTree).toEqual(okrTree);
  });

  it('records KR achievement in ledger entry', () => {
    const engine = new LedgerEngine(tmpDir);
    const krAchievement = [
      { krId: 'KR-1', status: 'achieved', achievementPct: 100 },
      { krId: 'KR-2', status: 'partial', achievementPct: 50 },
    ];

    const entry = engine.record('pipe-okr-001', { krAchievement });

    expect(entry.krAchievement).toEqual(krAchievement);
  });

  it('records PDCA cycles in ledger entry', () => {
    const engine = new LedgerEngine(tmpDir);
    const pdcaCycles = [
      { cycle: 1, triggeredBy: ['KR-2'], newTasks: ['Fix KR-2'], result: 'converged' as const },
    ];

    const entry = engine.record('pipe-okr-001', { pdcaCycles });

    expect(entry.pdcaCycles).toEqual(pdcaCycles);
  });

  it('records all OKR/PDCA data together', () => {
    const engine = new LedgerEngine(tmpDir);
    const okrTree = makeOkrTree(['achieved', 'achieved']);
    const krAchievement = [
      { krId: 'KR-1', status: 'achieved', achievementPct: 100 },
      { krId: 'KR-2', status: 'achieved', achievementPct: 100 },
    ];
    const pdcaCycles = [
      { cycle: 1, triggeredBy: ['KR-2'], newTasks: ['Fix KR-2'], result: 'converged' as const },
    ];

    const entry = engine.record('pipe-okr-001', { okrTree, krAchievement, pdcaCycles });

    expect(entry.okrTree).toBeDefined();
    expect(entry.krAchievement).toBeDefined();
    expect(entry.pdcaCycles).toBeDefined();
    expect(entry.conclusion).toBe('delivered');
  });

  it('omits OKR/PDCA fields when not provided (backward compatible)', () => {
    const engine = new LedgerEngine(tmpDir);

    const entry = engine.record('pipe-okr-001');

    expect(entry.okrTree).toBeUndefined();
    expect(entry.krAchievement).toBeUndefined();
    expect(entry.pdcaCycles).toBeUndefined();
    // Existing fields still work
    expect(entry.pipelineId).toBe('pipe-okr-001');
    expect(entry.conclusion).toBe('delivered');
  });

  it('OKR/PDCA data persists in ledger.jsonl', () => {
    const engine = new LedgerEngine(tmpDir);
    const okrTree = makeOkrTree(['achieved', 'achieved']);
    const pdcaCycles = [
      { cycle: 1, triggeredBy: ['KR-1'], newTasks: ['task-1'], result: 'converged' as const },
    ];

    engine.record('pipe-okr-001', { okrTree, pdcaCycles });

    const content = fs.readFileSync(path.join(tmpDir, 'ledger.jsonl'), 'utf-8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.okrTree).toBeDefined();
    expect(parsed.pdcaCycles).toBeDefined();
  });
});
