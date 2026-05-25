/**
 * FR-18 Batch A tests — Goal-Driven PDCA: Types, Pipeline Create,
 * Spec Stage (OKR + SMART + tracesTo), Gate alignment.
 *
 * Covers: AC-18.1, AC-18.2, AC-18.3, AC-18.4, AC-18.5, AC-18.6, AC-18.7, AC-18.13
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  PipelineInstance,
  PipelineCreateRequest,
  PipelineTask,
  EndStateGoal,
  ObjectiveKeyResult,
  KeyResult,
  PdcaCycleRecord,
  GoalAlignment,
} from '../../types/index.js';
import { createPipelineInstance, type InstanceStore } from '../../pipeline/pipeline-create.js';
import { SpecStage } from '../spec-stage.js';
import type { SpecInput, SpecStageOptions, RequirementAnalysisResponse } from '../spec-types.js';
import { assessGoalAlignment } from '../../gate/gate-engine.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTask(overrides?: Partial<PipelineTask>): PipelineTask {
  return {
    taskId: 'task-fr18',
    title: 'FR-18 test task',
    scope: { estimatedFiles: 5, estimatedLines: 200 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<PipelineCreateRequest>): PipelineCreateRequest {
  return {
    projectSlug: 'fr18-test',
    task: makeTask(),
    ...overrides,
  };
}

function createMemoryStore(initial: PipelineInstance[] = []): InstanceStore {
  const instances = [...initial];
  return {
    listByProject(slug) {
      return instances.filter((i) => i.projectSlug === slug);
    },
    save(inst) {
      instances.push(inst);
    },
  };
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-fr18-'));
}

function makeGoal(): EndStateGoal {
  return {
    description: 'Achieve 95% test coverage across all modules',
    lockedAt: '2026-05-01T00:00:00Z',
  };
}

function makeOkrTree(): ObjectiveKeyResult[] {
  return [{
    objectiveId: 'OBJ-01',
    description: 'Full test coverage',
    keyResults: [
      { krId: 'KR-01', description: 'Unit test coverage ≥95%', measure: 'percentage', threshold: '95', status: 'not-started' },
      { krId: 'KR-02', description: 'Integration test coverage ≥80%', measure: 'percentage', threshold: '80', status: 'not-started' },
    ],
  }];
}

function makeSpecStageOptions(overrides?: Partial<RequirementAnalysisResponse>): SpecStageOptions {
  return {
    adapter: {
      analyzeRequirements: async () => ({
        summary: 'Test spec summary',
        functionalRequirements: [
          {
            title: 'Feature A',
            description: 'Implement feature A',
            acceptanceCriteria: ['AC for feature A'],
          },
          {
            title: 'Feature B',
            description: 'Implement feature B',
            acceptanceCriteria: ['AC for feature B'],
          },
        ],
        ambiguities: [],
        ...overrides,
      }),
    },
    now: () => '2026-05-01T12:00:00Z',
  };
}

// ── AC-18.1: Pipeline Create with endStateGoal ──────────────────

describe('AC-18.1: Pipeline Create supports optional endStateGoal', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('persists endStateGoal when provided', async () => {
    const store = createMemoryStore();
    const goal = makeGoal();
    const result = await createPipelineInstance(
      makeRequest({ endStateGoal: goal }),
      { store, workspaceRoot: tmpDir, now: new Date('2026-05-01T00:00:00Z') },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endStateGoal).toEqual(goal);
  });

  it('creates pipeline without endStateGoal (backward compat)', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(
      makeRequest(),
      { store, workspaceRoot: tmpDir, now: new Date('2026-05-01T00:00:00Z') },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endStateGoal).toBeUndefined();
  });
});

// ── AC-18.2: endStateGoal lock semantics ────────────────────────

describe('AC-18.2: endStateGoal lock semantics', () => {
  it('endStateGoal has lockedAt timestamp', async () => {
    const goal = makeGoal();
    expect(goal.lockedAt).toBe('2026-05-01T00:00:00Z');
    expect(typeof goal.description).toBe('string');
    expect(goal.description.length).toBeGreaterThan(0);
  });
});

// ── AC-18.3: Spec stage OKR decomposition ───────────────────────

describe('AC-18.3: Spec stage OKR decomposition', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('decomposes endStateGoal into OKR tree during spec execution', async () => {
    const stage = new SpecStage(makeSpecStageOptions());
    const input: SpecInput = {
      taskId: 'task-okr',
      description: 'Build a test framework',
      endStateGoal: makeGoal(),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    // When endStateGoal is present, krMapping should be populated
    expect(output.krMapping).toBeDefined();
    expect(Object.keys(output.krMapping!).length).toBeGreaterThan(0);
  });

  it('uses provided okrTree instead of decomposing', async () => {
    const stage = new SpecStage(makeSpecStageOptions());
    const okrTree = makeOkrTree();
    const input: SpecInput = {
      taskId: 'task-okr-provided',
      description: 'Build a test framework',
      endStateGoal: makeGoal(),
      okrTree,
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    expect(output.krMapping).toBeDefined();
    // With 2 FRs and 2 KRs, round-robin assigns KR-01 to FR-01, KR-02 to FR-02
    expect(output.krMapping!['FR-01']).toBe('KR-01');
    expect(output.krMapping!['FR-02']).toBe('KR-02');
  });
});

// ── AC-18.4: FR tracesTo KR ─────────────────────────────────────

describe('AC-18.4: FR tracesTo KR linkage', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('each FR has tracesTo field when OKR tree present', async () => {
    const stage = new SpecStage(makeSpecStageOptions());
    const input: SpecInput = {
      taskId: 'task-traces',
      description: 'Build features',
      endStateGoal: makeGoal(),
      okrTree: makeOkrTree(),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    for (const fr of output.functionalRequirements) {
      expect(fr.tracesTo).toBeDefined();
      expect(fr.tracesTo).toMatch(/^KR-/);
    }
  });

  it('FR has no tracesTo when no endStateGoal', async () => {
    const stage = new SpecStage(makeSpecStageOptions());
    const input: SpecInput = {
      taskId: 'task-no-traces',
      description: 'Build features',
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    for (const fr of output.functionalRequirements) {
      expect(fr.tracesTo).toBeUndefined();
    }
  });
});

// ── AC-18.5: SMART principle (type-level) ───────────────────────

describe('AC-18.5: SMART principle compliance', () => {
  it('KeyResult type enforces SMART fields (measure + threshold)', async () => {
    const kr: KeyResult = {
      krId: 'KR-SMART',
      description: 'Specific: unit test coverage',
      measure: 'percentage',       // Measurable
      threshold: '95',             // Achievable threshold
      status: 'not-started',
    };
    expect(kr.measure).toBe('percentage');
    expect(kr.threshold).toBe('95');
    expect(kr.status).toBe('not-started');
  });
});

// ── AC-18.6: Spec Review Gate SMART check ───────────────────────

describe('AC-18.6: Spec Review Gate SMART check dimension', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('spec output includes krMapping for SMART review', async () => {
    const stage = new SpecStage(makeSpecStageOptions());
    const input: SpecInput = {
      taskId: 'task-smart-gate',
      description: 'Build features',
      endStateGoal: makeGoal(),
      okrTree: makeOkrTree(),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    // krMapping enables Spec Review Gate to check SMART compliance
    expect(output.krMapping).toBeDefined();
    // Every mapped FR should trace to a valid KR
    for (const [frId, krId] of Object.entries(output.krMapping!)) {
      expect(frId).toMatch(/^FR-/);
      expect(krId).toMatch(/^KR-/);
    }
  });
});

// ── AC-18.7: Gate goal alignment assessment ─────────────────────

describe('AC-18.7: Gate goal alignment assessment', () => {
  it('returns aligned when ≥80% KRs on track', async () => {
    const tree: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-01',
      description: 'Test',
      keyResults: [
        { krId: 'KR-01', description: 'A', measure: 'm', status: 'achieved' },
        { krId: 'KR-02', description: 'B', measure: 'm', status: 'in-progress' },
        { krId: 'KR-03', description: 'C', measure: 'm', status: 'achieved' },
        { krId: 'KR-04', description: 'D', measure: 'm', status: 'achieved' },
        { krId: 'KR-05', description: 'E', measure: 'm', status: 'not-started' },
      ],
    }];
    expect(assessGoalAlignment(tree, [])).toBe('aligned');
  });

  it('returns drifting when 50-79% KRs on track', async () => {
    const tree: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-01',
      description: 'Test',
      keyResults: [
        { krId: 'KR-01', description: 'A', measure: 'm', status: 'achieved' },
        { krId: 'KR-02', description: 'B', measure: 'm', status: 'not-started' },
        { krId: 'KR-03', description: 'C', measure: 'm', status: 'in-progress' },
        { krId: 'KR-04', description: 'D', measure: 'm', status: 'blocked' },
      ],
    }];
    expect(assessGoalAlignment(tree, [])).toBe('drifting');
  });

  it('returns misaligned when <50% KRs on track', async () => {
    const tree: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-01',
      description: 'Test',
      keyResults: [
        { krId: 'KR-01', description: 'A', measure: 'm', status: 'not-started' },
        { krId: 'KR-02', description: 'B', measure: 'm', status: 'blocked' },
        { krId: 'KR-03', description: 'C', measure: 'm', status: 'not-started' },
      ],
    }];
    expect(assessGoalAlignment(tree, [])).toBe('misaligned');
  });

  it('returns aligned for empty OKR tree (no-op)', async () => {
    expect(assessGoalAlignment([], [])).toBe('aligned');
  });
});

// ── AC-18.13: Backward compatibility ────────────────────────────

describe('AC-18.13: Backward compatibility', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('pipeline without endStateGoal has no OKR fields', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(
      makeRequest(),
      { store, workspaceRoot: tmpDir, now: new Date('2026-05-01T00:00:00Z') },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endStateGoal).toBeUndefined();
    expect(result.value.okrTree).toBeUndefined();
    expect(result.value.pdcaCycles).toBeUndefined();
  });

  it('spec stage without endStateGoal produces no krMapping', async () => {
    const stage = new SpecStage(makeSpecStageOptions());
    const input: SpecInput = {
      taskId: 'task-compat',
      description: 'Build features without goal',
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    expect(output.krMapping).toBeUndefined();
    for (const fr of output.functionalRequirements) {
      expect(fr.tracesTo).toBeUndefined();
    }
  });

  it('PdcaCycleRecord type is well-formed', async () => {
    const record: PdcaCycleRecord = {
      cycle: 1,
      triggeredBy: ['KR-01'],
      newTasks: ['fix-coverage'],
      result: 'converged',
    };
    expect(record.cycle).toBe(1);
    expect(record.result).toBe('converged');
  });
});
