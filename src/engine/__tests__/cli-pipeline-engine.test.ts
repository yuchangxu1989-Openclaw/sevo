import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { buildStageHandlers } from '../../cli/cmd-advance.js';
import {
  PipelineEngine,
  CANONICAL_14_STAGES,
  listStageBindings,
} from '../pipeline-engine.js';
import { STAGE_IDS } from '../../constants.js';

describe('CLI PipelineEngine (engine/pipeline-engine.ts)', () => {
  const tmpDirs: string[] = [];
  const originalCwd = process.cwd();

  function makeBase(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-engine-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    process.chdir(originalCwd);
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('create() writes state.json with all 14 canonical stages', () => {
    const base = makeBase();
    const engine = new PipelineEngine(base);
    const state = engine.create('p1');

    expect(state.pipelineId).toBe('p1');
    expect(state.requiredStages).toHaveLength(14);
    expect(state.status).toBe('created');
    expect(state.currentStage).toBe(STAGE_IDS.SPEC);
    expect(state.description).toBeUndefined();

    const fp = path.join(base, 'p1', 'state.json');
    expect(fs.existsSync(fp)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    expect(persisted.requiredStages).toEqual(CANONICAL_14_STAGES);
  });

  it('advanceAsync() runs the next stage, writes artifact, transitions state', async () => {
    const base = makeBase();
    const engine = new PipelineEngine(base);
    engine.create('p1');

    const result = await engine.advanceAsync('p1');
    expect(result.outcome).toBe('passed');
    expect(result.stage).toBe(STAGE_IDS.SPEC);
    expect(result.nextStage).toBe(STAGE_IDS.SPEC_REVIEW_GATE);
    expect(result.artifacts.length).toBeGreaterThan(0);

    const artFile = path.join(base, 'p1', result.artifacts[0]!.path);
    expect(fs.existsSync(artFile)).toBe(true);
    expect(fs.readFileSync(artFile, 'utf-8')).toContain('Stage Output');

    const state = engine.load('p1');
    expect(state.stages[STAGE_IDS.SPEC]?.status).toBe('passed');
    expect(state.currentStage).toBe(STAGE_IDS.SPEC_REVIEW_GATE);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]?.stage).toBe(STAGE_IDS.SPEC);
    expect(state.history[0]?.outcome).toBe('passed');
  });

  it('autoAdvance with real stage handlers preserves description and isolates pipeline docs', async () => {
    const workspace = makeBase();
    process.chdir(workspace);
    fs.writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: 'workspace-test', version: '0.1.0', type: 'module' }, null, 2),
    );
    fs.symlinkSync(path.join(originalCwd, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
    const base = path.join(workspace, '.sevo');
    const engine = new PipelineEngine(base, { handlers: buildStageHandlers() });
    engine.create('demo', { description: '测试描述' });
    engine.create('demo2', { description: '测试描述2' });

    await engine.advanceAsync('demo', { autoAdvance: true });
    await engine.advanceAsync('demo2');

    const demoState = engine.load('demo');
    expect(demoState.status).toBe('blocked');
    expect(demoState.currentStage).toBe(STAGE_IDS.README);
    expect(demoState.history).toHaveLength(CANONICAL_14_STAGES.length - 1);
    expect(demoState.description).toBe('测试描述');
    for (const sid of CANONICAL_14_STAGES.filter((stageId) => stageId !== STAGE_IDS.README && stageId !== STAGE_IDS.LEDGER)) {
      expect(demoState.stages[sid]?.status).toBe('passed');
    }
    expect(demoState.stages[STAGE_IDS.README]?.status).toBe('gate_blocked');
    expect(demoState.stages[STAGE_IDS.LEDGER]?.status).toBe('pending');

    const demoSpec = fs.readFileSync(path.join(base, 'demo', 'docs', 'product-requirements.md'), 'utf-8');
    const demo2Spec = fs.readFileSync(path.join(base, 'demo2', 'docs', 'product-requirements.md'), 'utf-8');
    expect(demoSpec).toContain('测试描述');
    expect(demo2Spec).toContain('测试描述2');
    expect(demoSpec).not.toContain('测试描述2');
  });

  it('advance with --stage targeting runs the requested stage', async () => {
    const base = makeBase();
    const engine = new PipelineEngine(base);
    engine.create('p1');

    const result = await engine.advanceAsync('p1', { stage: STAGE_IDS.IMPLEMENT });
    expect(result.stage).toBe(STAGE_IDS.IMPLEMENT);
    expect(result.outcome).toBe('passed');

    const state = engine.load('p1');
    expect(state.stages[STAGE_IDS.IMPLEMENT]?.status).toBe('passed');
    expect(state.stages[STAGE_IDS.SPEC]?.status).toBe('pending');
  });

  it('onEnter/onExit hooks are called for each stage handler', async () => {
    const base = makeBase();
    const enterCalls: string[] = [];
    const exitCalls: string[] = [];
    const engine = new PipelineEngine(base, {
      onEnter: (stage) => { enterCalls.push(stage); },
      onExit: (stage, _ctx, result) => { exitCalls.push(`${stage}:${result.outcome}`); },
    });
    engine.create('p1');

    await engine.advanceAsync('p1');
    expect(enterCalls).toEqual([STAGE_IDS.SPEC]);
    expect(exitCalls).toEqual([`${STAGE_IDS.SPEC}:passed`]);
  });

  it('handler exception is captured as failed outcome but keeps the pipeline running for retry', async () => {
    const base = makeBase();
    const engine = new PipelineEngine(base, {
      handlers: {
        [STAGE_IDS.SPEC]: async () => { throw new Error('boom'); },
      },
    });
    engine.create('p1');

    const result = await engine.advanceAsync('p1');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toBe('boom');

    const state = engine.load('p1');
    // 原则：流水线永远往前走。stage 失败保留 'failed' 以便 resolveTargetStage
    // 重新选中重试，但 pipeline 层不再终结为 'failed'，保持 'running'。
    expect(state.stages[STAGE_IDS.SPEC]?.status).toBe('failed');
    expect(state.status).toBe('running');
  });

  it('advancing a completed pipeline is idempotent', async () => {
    const base = makeBase();
    const engine = new PipelineEngine(base);
    engine.create('p1');
    await engine.advanceAsync('p1', { autoAdvance: true });

    const result = await engine.advanceAsync('p1');
    expect(result.outcome).toBe('passed');
    expect(result.pipelineStatus).toBe('completed');
    expect(result.reason).toContain('completed');
  });

  it('listStageBindings exposes all stage class wires', () => {
    const bindings = listStageBindings();
    expect(bindings.length).toBeGreaterThanOrEqual(14);
    // Every binding has a non-empty stageClass.name.
    for (const b of bindings) {
      expect(b.stageClass.name.length).toBeGreaterThan(0);
    }
  });
});
