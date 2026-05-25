/**
 * FR-19 OKR Goal Declaration + SMART Decomposition tests.
 *
 * Covers: OkrGoalStage decomposition, fallback, artifact writing;
 * SmartDecompositionStage task generation, KR coverage, empty input.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { OkrGoalStage } from '../okr-goal-stage.js';
import { SmartDecompositionStage } from '../smart-decomposition-stage.js';
import type { OkrGoalInput, OkrDecompositionResponse } from '../okr-goal-types.js';
import type { SmartDecompositionInput } from '../smart-decomposition-types.js';
import type { ObjectiveKeyResult, EndStateGoal } from '../../types/index.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr19-okr-'));
}

const FIXED_TIME = '2026-01-15T10:00:00Z';

function makeGoal(desc = 'Ship v2.0 with 95% test coverage'): EndStateGoal {
  return { description: desc, lockedAt: FIXED_TIME };
}

// ── OKR Goal Stage ─────────────────────────────────────────────

describe('FR-19: OKR Goal Declaration', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('decomposes goal via adapter and writes artifact', async () => {
    const mockResponse: OkrDecompositionResponse = {
      objectives: [{
        description: 'Achieve production readiness',
        keyResults: [
          { description: 'Test coverage >= 95%', measure: 'percentage' },
          { description: 'Zero P0 bugs', measure: 'count' },
        ],
      }],
    };

    const stage = new OkrGoalStage({
      adapter: { decomposeOkr: async () => mockResponse },
      now: () => FIXED_TIME,
    });

    const input: OkrGoalInput = {
      taskId: 'task-fr19',
      endStateGoal: makeGoal(),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);

    expect(output.okrTree).toHaveLength(1);
    expect(output.okrTree[0]!.objectiveId).toBe('OBJ-01');
    expect(output.okrTree[0]!.keyResults).toHaveLength(2);
    expect(output.okrTree[0]!.keyResults[0]!.krId).toBe('KR-01.1');
    expect(output.metadata.totalKeyResults).toBe(2);
    expect(output.metadata.declaredAt).toBe(FIXED_TIME);
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });

  it('uses fallback when no adapter provided', async () => {
    const stage = new OkrGoalStage({
      adapter: {},
      now: () => FIXED_TIME,
    });

    const input: OkrGoalInput = {
      taskId: 'task-fallback',
      endStateGoal: makeGoal('Deploy microservice'),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);

    expect(output.okrTree).toHaveLength(1);
    expect(output.okrTree[0]!.keyResults[0]!.description).toContain('Deploy microservice');
  });

  it('handles multiple objectives with stable ID assignment', async () => {
    const mockResponse: OkrDecompositionResponse = {
      objectives: [
        {
          description: 'Performance',
          keyResults: [{ description: 'P99 < 200ms', measure: 'latency' }],
        },
        {
          description: 'Reliability',
          keyResults: [
            { description: '99.9% uptime', measure: 'percentage' },
            { description: 'MTTR < 15min', measure: 'duration', threshold: '15m' },
          ],
        },
      ],
    };

    const stage = new OkrGoalStage({
      adapter: { decomposeOkr: async () => mockResponse },
      now: () => FIXED_TIME,
    });

    const input: OkrGoalInput = {
      taskId: 'task-multi-obj',
      endStateGoal: makeGoal('Production excellence'),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);

    expect(output.okrTree).toHaveLength(2);
    expect(output.okrTree[0]!.objectiveId).toBe('OBJ-01');
    expect(output.okrTree[1]!.objectiveId).toBe('OBJ-02');
    expect(output.okrTree[1]!.keyResults[1]!.krId).toBe('KR-02.2');
    expect(output.metadata.objectiveCount).toBe(2);
    expect(output.metadata.totalKeyResults).toBe(3);
  });

  it('artifact JSON contains correct structure', async () => {
    const stage = new OkrGoalStage({
      adapter: {},
      now: () => FIXED_TIME,
    });

    const input: OkrGoalInput = {
      taskId: 'task-artifact-check',
      endStateGoal: makeGoal('Verify artifact'),
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    const raw = fs.readFileSync(output.artifact.path, 'utf8');
    const parsed = JSON.parse(raw);

    expect(parsed.declaredAt).toBe(FIXED_TIME);
    expect(parsed.okrTree).toHaveLength(1);
    expect(parsed.okrTree[0].objectiveId).toBe('OBJ-01');
  });

  it('reuses existing OKR tree when provided', async () => {
    const existing: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-EXISTING',
      description: 'Pre-existing objective',
      keyResults: [{ krId: 'KR-E1', description: 'Existing KR', measure: 'bool', status: 'not-started' }],
    }];

    const stage = new OkrGoalStage({
      adapter: { decomposeOkr: async () => { throw new Error('should not call'); } },
      now: () => FIXED_TIME,
    });

    const input: OkrGoalInput = {
      taskId: 'task-existing',
      endStateGoal: makeGoal(),
      existingOkrTree: existing,
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    expect(output.okrTree[0]!.objectiveId).toBe('OBJ-EXISTING');
  });
});

// ── SMART Decomposition Stage ──────────────────────────────────

describe('FR-19: SMART Decomposition', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('decomposes FRs into SMART tasks with KR mapping', async () => {
    const stage = new SmartDecompositionStage({
      adapter: {},
      now: () => FIXED_TIME,
    });

    const okrTree: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-01',
      description: 'Ship v2',
      keyResults: [
        { krId: 'KR-01.1', description: 'Coverage', measure: 'pct', status: 'not-started' },
      ],
    }];

    const input: SmartDecompositionInput = {
      taskId: 'task-smart',
      functionalRequirements: [
        {
          id: 'FR-01',
          title: 'Add login page',
          description: 'Add login page',
          tracesTo: 'KR-01.1',
          acceptanceCriteria: [{ id: 'AC-01.1', description: 'Form validates email', requirementId: 'FR-01' }],
        },
      ],
      okrTree,
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);

    expect(output.tasks).toHaveLength(1);
    expect(output.tasks[0]!.id).toBe('SMART-001');
    expect(output.tasks[0]!.frId).toBe('FR-01');
    expect(output.tasks[0]!.krId).toBe('KR-01.1');
    expect(output.metadata.krCoverage).toBe(1);
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });

  it('returns empty tasks for empty FR list', async () => {
    const stage = new SmartDecompositionStage({
      adapter: {},
      now: () => FIXED_TIME,
    });

    const input: SmartDecompositionInput = {
      taskId: 'task-empty',
      functionalRequirements: [],
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    expect(output.tasks).toHaveLength(0);
    expect(output.metadata.totalTasks).toBe(0);
  });

  it('uses explicit krMapping to override FR.tracesTo', async () => {
    const stage = new SmartDecompositionStage({
      adapter: {},
      now: () => FIXED_TIME,
    });

    const okrTree: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-01',
      description: 'Ship v2',
      keyResults: [
        { krId: 'KR-01.1', description: 'Coverage', measure: 'pct', status: 'not-started' },
        { krId: 'KR-01.2', description: 'Perf', measure: 'ms', status: 'not-started' },
      ],
    }];

    const input: SmartDecompositionInput = {
      taskId: 'task-krmap',
      functionalRequirements: [
        { id: 'FR-01', title: 'Login', description: 'Login', tracesTo: 'KR-01.1', acceptanceCriteria: [] },
        { id: 'FR-02', title: 'Dashboard', description: 'Dashboard', acceptanceCriteria: [] },
      ],
      okrTree,
      krMapping: { 'FR-01': 'KR-01.2', 'FR-02': 'KR-01.1' },
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);

    expect(output.tasks[0]!.krId).toBe('KR-01.2');
    expect(output.tasks[1]!.krId).toBe('KR-01.1');
    expect(output.metadata.krCoverage).toBe(1);
  });

  it('computes partial KR coverage correctly', async () => {
    const stage = new SmartDecompositionStage({
      adapter: {},
      now: () => FIXED_TIME,
    });

    const okrTree: ObjectiveKeyResult[] = [{
      objectiveId: 'OBJ-01',
      description: 'Ship v2',
      keyResults: [
        { krId: 'KR-01.1', description: 'A', measure: 'x', status: 'not-started' },
        { krId: 'KR-01.2', description: 'B', measure: 'x', status: 'not-started' },
        { krId: 'KR-01.3', description: 'C', measure: 'x', status: 'not-started' },
      ],
    }];

    const input: SmartDecompositionInput = {
      taskId: 'task-partial',
      functionalRequirements: [
        { id: 'FR-01', title: 'Only covers one KR', description: 'Only covers one KR', tracesTo: 'KR-01.2', acceptanceCriteria: [] },
      ],
      okrTree,
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);

    expect(output.metadata.krCoverage).toBeCloseTo(0.33, 1);
    expect(output.metadata.totalTasks).toBe(1);
  });

  it('uses adapter when decomposeSmart is provided', async () => {
    const stage = new SmartDecompositionStage({
      adapter: {
        decomposeSmart: async () => ({
          tasks: [{
            frId: 'FR-X',
            specific: 'Build auth module',
            measurable: 'All tests pass',
            achievable: 'Uses existing lib',
            relevant: 'Security KR',
            timeBound: '1 sprint',
            krId: 'KR-02.1',
          }],
        }),
      },
      now: () => FIXED_TIME,
    });

    const input: SmartDecompositionInput = {
      taskId: 'task-adapter',
      functionalRequirements: [{ id: 'FR-X', title: 'Auth', description: 'Auth', acceptanceCriteria: [] }],
      artifactBasePath: path.join(tmpDir, 'artifacts'),
    };

    const output = await stage.execute(input);
    expect(output.tasks[0]!.specific).toBe('Build auth module');
    expect(output.tasks[0]!.krId).toBe('KR-02.1');
  });
});
