import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { advanceOnComplete } from '../advance-on-complete.js';
import { PipelineEngine } from '../../pipeline/pipeline-engine.js';
import { STAGE_IDS } from '../../constants.js';
import { TieredScanOrchestrator } from '../../scan/tiered-scan-orchestrator.js';
import type { PipelineState } from '../../types/index.js';

function makeState(basePath: string): PipelineState {
  const now = '2026-05-23T00:00:00.000Z';
  const state: PipelineState = {
    pipelineId: 'pipe-review-scan',
    taskId: 'task-review-scan',
    level: 'L0',
    requiredStages: [STAGE_IDS.REVIEW, STAGE_IDS.VERIFY],
    skippedStages: [],
    stages: {
      [STAGE_IDS.REVIEW]: { stageId: STAGE_IDS.REVIEW, status: 'active', artifacts: [] },
      [STAGE_IDS.VERIFY]: { stageId: STAGE_IDS.VERIFY, status: 'pending', artifacts: [] },
    } as unknown as PipelineState['stages'],
    currentStage: STAGE_IDS.REVIEW,
    createdAt: now,
    updatedAt: now,
  };
  const dir = path.join(basePath, 'pipelines', state.pipelineId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

describe('advanceOnComplete review tiered scan handoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps existing persisted tiered scan on the activated verify record', async () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-advance-tiered-'));
    const state = makeState(basePath);
    state.tieredScan = {
      status: 'passed',
      reportPath: path.join(basePath, 'scan.json'),
      completedAt: '2026-05-23T00:01:00.000Z',
    };
    fs.writeFileSync(path.join(basePath, 'pipelines', state.pipelineId, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
    vi.spyOn(TieredScanOrchestrator.prototype, 'run').mockResolvedValue({
      summary: {
        l1: { pass: true, total: 1, covered: 1 },
        l2: { pass: true, total: 1, covered: 1, needsReview: 0 },
        l3: { pass: true, total: 0, alive: 0 },
        overall: 'pass',
        timestamp: '2026-05-23T00:01:00.000Z',
        blockers: [],
      },
    } as any);

    const engine = new PipelineEngine(basePath);
    const artifact = { id: 'review-artifact', type: 'review-bundle', path: 'review.json', createdAt: '2026-05-23T00:02:00.000Z' };
    await advanceOnComplete({
      pipelineId: state.pipelineId,
      stageId: STAGE_IDS.REVIEW,
      outcome: 'passed',
      artifacts: [artifact],
    }, {
      basePath,
      engine,
      logDecision: () => undefined,
      getPipelineState: () => JSON.parse(fs.readFileSync(path.join(basePath, 'pipelines', state.pipelineId, 'state.json'), 'utf8')) as PipelineState,
    });

    const updated = JSON.parse(fs.readFileSync(path.join(basePath, 'pipelines', state.pipelineId, 'state.json'), 'utf8')) as PipelineState;
    expect(updated.tieredScan?.status).toBe('passed');
    expect(updated.stages[STAGE_IDS.VERIFY]?.status).toBe('active');
    expect(updated.stages[STAGE_IDS.REVIEW]?.artifacts[0]?.metadata?.['tieredScan']).toEqual(updated.tieredScan);
  });

  it('blocks verify when persisted tiered scan is not an explicit pass', async () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-advance-tiered-fail-'));
    const state = makeState(basePath);
    state.tieredScan = {
      status: 'failed',
      reportPath: path.join(basePath, 'scan.json'),
      completedAt: '2026-05-23T00:01:00.000Z',
    };
    fs.writeFileSync(path.join(basePath, 'pipelines', state.pipelineId, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
    vi.spyOn(TieredScanOrchestrator.prototype, 'run').mockResolvedValue({
      summary: {
        l1: { pass: true, total: 1, covered: 1 },
        l2: { pass: false, total: 1, covered: 0, needsReview: 1 },
        l3: { pass: false, total: 0, alive: 0 },
        overall: 'fail',
        timestamp: '2026-05-23T00:01:00.000Z',
        blockers: ['l2 coverage incomplete'],
      },
    } as any);

    const engine = new PipelineEngine(basePath);
    const result = await advanceOnComplete({
      pipelineId: state.pipelineId,
      stageId: STAGE_IDS.REVIEW,
      outcome: 'passed',
      artifacts: [],
    }, {
      basePath,
      engine,
      logDecision: () => undefined,
      getPipelineState: () => JSON.parse(fs.readFileSync(path.join(basePath, 'pipelines', state.pipelineId, 'state.json'), 'utf8')) as PipelineState,
    });

    expect(result.transition.status).toBe('failed');
    const updated = JSON.parse(fs.readFileSync(path.join(basePath, 'pipelines', state.pipelineId, 'state.json'), 'utf8')) as PipelineState;
    expect(updated.stages[STAGE_IDS.VERIFY]?.status).toBe('pending');
  });
});
