import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
const g = () => (globalThis as any)[GLOBAL_KEY];

describe('Bug 1: markExistingArtifactStagesCompleted', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-artifact-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('marks spec stage completed when product-requirements.md exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'product-requirements.md'), '# Spec');

    const state = {
      requiredStages: ['spec', 'spec-review-gate', 'implement'],
      stages: {
        spec: { status: 'active', stageId: 'spec' },
        'spec-review-gate': { status: 'pending', stageId: 'spec-review-gate' },
        implement: { status: 'pending', stageId: 'implement' },
      },
    };

    const marked = mod.markExistingArtifactStagesCompleted(state, tmpDir);

    expect(marked).toContain('spec');
    expect(state.stages.spec.status).toBe('active');
    expect((state.stages.spec as any).needsPassNoChangeReview).toBe(true);
    expect((state.stages.spec as any).artifactExistsAt).toBeDefined();
    expect(state.stages['spec-review-gate'].status).toBe('pending');
  });

  it('marks architecture-design completed when arc42 file exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs', 'architecture'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'architecture', 'arc42-architecture.md'),
      '# Arc42',
    );

    const state = {
      requiredStages: ['spec', 'architecture-design', 'implement'],
      stages: {
        spec: { status: 'active', stageId: 'spec' },
        'architecture-design': { status: 'pending', stageId: 'architecture-design' },
        implement: { status: 'pending', stageId: 'implement' },
      },
    };

    const marked = mod.markExistingArtifactStagesCompleted(state, tmpDir);

    expect(marked).toContain('architecture-design');
    expect(state.stages['architecture-design'].status).toBe('active');
    expect((state.stages['architecture-design'] as any).needsPassNoChangeReview).toBe(true);
    expect((state.stages['architecture-design'] as any).artifactExistsAt).toBeDefined();
  });

  it('does not mark stages when no artifacts exist', () => {
    const state = {
      requiredStages: ['spec', 'architecture-design', 'contract'],
      stages: {
        spec: { status: 'active', stageId: 'spec' },
        'architecture-design': { status: 'pending', stageId: 'architecture-design' },
        contract: { status: 'pending', stageId: 'contract' },
      },
    };

    const marked = mod.markExistingArtifactStagesCompleted(state, tmpDir);
    expect(marked).toHaveLength(0);
    expect(state.stages.spec.status).toBe('active');
  });

  it('keeps artifact stages active for V2 pass/no-change review instead of auto-advancing', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'product-requirements.md'), '# Spec');

    const state = {
      requiredStages: ['spec', 'implement', 'review'],
      stages: {
        spec: { status: 'active', stageId: 'spec' },
        implement: { status: 'pending', stageId: 'implement' },
        review: { status: 'pending', stageId: 'review' },
      },
    };

    mod.markExistingArtifactStagesCompleted(state, tmpDir);

    expect(state.stages.spec.status).toBe('active');
    expect((state.stages.spec as any).needsPassNoChangeReview).toBe(true);
    expect(state.stages.implement.status).toBe('pending');
  });

  it('checkStageArtifactExists matches glob patterns', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs', 'design'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'docs', 'design', 'sevo-product-requirements.md'),
      '# spec',
    );

    expect(mod.checkStageArtifactExists(tmpDir, 'spec')).toBe(true);
  });
});

describe('Bug 2: advancePromptCount persistence to state.json', () => {
  let pipelineDir: string;
  let pipelineId: string;

  beforeEach(() => {
    pipelineId = 'test-advance-persist-' + Date.now();
    pipelineDir = path.dirname(mod.getPipelineStateFile(pipelineId));
    fs.mkdirSync(pipelineDir, { recursive: true });
    fs.writeFileSync(
      mod.getPipelineStateFile(pipelineId),
      JSON.stringify({ pipelineId, stages: {}, updatedAt: '2026-06-09T00:00:00Z' }),
    );
  });

  afterEach(() => {
    fs.rmSync(pipelineDir, { recursive: true, force: true });
    const state = g();
    state.injectedAdvances = new Map();
  });

  it('persistAdvancePromptCountToState writes count into state.json', () => {
    const label = 'sevo:test-proj:implement:1';
    mod.persistAdvancePromptCountToState(pipelineId, label, 3);

    const raw = JSON.parse(fs.readFileSync(mod.getPipelineStateFile(pipelineId), 'utf8'));
    expect(raw.advancePromptCounts).toBeUndefined();
  });

  it('hydrateAdvanceCountsFromPipelineStates ignores stale V1 counts from state.json', () => {
    const label = 'sevo:test-proj:implement:1';
    const statePath = mod.getPipelineStateFile(pipelineId);
    const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    stateData.advancePromptCounts = { [label]: 4 };
    fs.writeFileSync(statePath, JSON.stringify(stateData));

    const sevoState = g();
    sevoState.injectedAdvances = new Map();

    mod.hydrateAdvanceCountsFromPipelineStates();

    const record = sevoState.injectedAdvances.get(label);
    expect(record).toBeUndefined();
  });

  it('markAdvanceInjected persists count to state.json', () => {
    const label = 'sevo:test-proj:spec:1';
    const advance = {
      pipelineId,
      stageId: 'spec',
      label,
      taskDescription: 'write spec',
      agentId: 'codex',
      timeout: 1200,
    };

    mod.markAdvanceInjected(advance);
    mod.markAdvanceInjected(advance);

    const raw = JSON.parse(fs.readFileSync(mod.getPipelineStateFile(pipelineId), 'utf8'));
    expect(raw.advancePromptCounts).toBeUndefined();

    const sevoState = g();
    expect(sevoState.injectedAdvances.get(label).injectedCount).toBe(2);
  });
});
