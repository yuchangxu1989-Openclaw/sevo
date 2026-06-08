import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mod from '../index.js';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE_PIPELINES_PATH = path.join(PLUGIN_ROOT, 'state', 'active-pipelines.json');
const TEST_PIPELINE_IDS = [
  'pipe-fr38c-active',
  'pipe-fr38c-a',
  'pipe-fr38c-b',
  'pipe-fr38c-done',
];

const {
  FULL_PIPELINE_STAGES,
  buildPreciseRouteHint38c,
  formatPreciseRouteHint38c,
} = mod as any;

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readFileIfExists(filePath: string) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function restoreFile(filePath: string, previous: string | null) {
  if (previous === null) {
    try { fs.rmSync(filePath, { force: true }); } catch {}
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, previous);
}

function cleanupTestPipelineState() {
  for (const pipelineId of TEST_PIPELINE_IDS) {
    fs.rmSync(path.join(PLUGIN_ROOT, 'data', 'pipelines', pipelineId), { recursive: true, force: true });
  }
}

function makeState({
  pipelineId = 'pipe-fr38c-active',
  currentStage = 'implement',
  completedThrough = 'contract-review-gate',
  allPassed = false,
}: {
  pipelineId?: string;
  currentStage?: string;
  completedThrough?: string;
  allPassed?: boolean;
} = {}) {
  const requiredStages = [...FULL_PIPELINE_STAGES];
  const completedIndex = requiredStages.indexOf(completedThrough);
  const stages: Record<string, { status: string }> = {};
  requiredStages.forEach((stageId: string, index: number) => {
    stages[stageId] = { status: allPassed || index <= completedIndex ? 'passed' : 'pending' };
  });
  if (!allPassed) stages[currentStage] = { status: 'active' };
  return { pipelineId, requiredStages, stages, currentStage };
}

describe('FR-38c Precise Route Hint Injection', () => {
  let previousActivePipelines: string | null;

  beforeEach(() => {
    previousActivePipelines = readFileIfExists(ACTIVE_PIPELINES_PATH);
    cleanupTestPipelineState();
  });

  afterEach(() => {
    restoreFile(ACTIVE_PIPELINES_PATH, previousActivePipelines);
    cleanupTestPipelineState();
  });

  it('AC-38c.1/.2/.3/.9/.10 injects concise project route state with why and do-not-jump risks', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': {
          projectSlug: 'fr38c-app',
          currentStage: 'implement',
          status: 'active',
          specIntegrityCheck: { covered: false, verdict: 'gap' },
        },
      },
    });
    writeJsonFile(path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-active', 'state.json'), makeState());

    const hint = buildPreciseRouteHint38c({ message: 'fr38c app 现在准备 sevo:implement' });
    const text = formatPreciseRouteHint38c(hint);

    expect(hint.kind).toBe('single-pipeline-route');
    expect(hint.projectSlug).toBe('fr38c-app');
    expect(hint.pipelineId).toBe('pipe-fr38c-active');
    expect(hint.currentStage).toBe('implement');
    expect(hint.completedStages).toContain('contract-review-gate');
    expect(hint.pendingStages).toContain('implement');
    expect(hint.recommendedNextStage).toBe('spec');
    expect(hint.recommendationReason).toContain('specCoverageStatus=gap');
    expect(hint.doNotJumpTo.some((entry: any) => entry.stage === 'implement')).toBe(true);
    expect(text).toContain('FR-38b 仍会继续 advisory/clarification/gate');
    expect(text.length).toBeLessThanOrEqual(300);
  });

  it('AC-38c.4 asks for project confirmation when multiple registered projects match', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'fr38c-app', currentStage: 'implement', status: 'active' },
        'pipe-fr38c-a': { projectSlug: 'fr38c-api', currentStage: 'review', status: 'active' },
      },
    });

    const hint = buildPreciseRouteHint38c({ message: 'fr38c app 和 fr38c api 都要看一下' });
    const text = formatPreciseRouteHint38c(hint);

    expect(hint.kind).toBe('project-confirmation');
    expect(hint.recommendedNextStage).toBeNull();
    expect(hint.candidateProjects.map((p: any) => p.projectSlug)).toEqual(['fr38c-app', 'fr38c-api']);
    expect(text).toContain('先确认项目');
    expect(text).not.toContain('推荐');
  });

  it('AC-38c.5 prefers an exact slug match over weaker similar project matches', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'fr-38c', currentStage: 'implement', status: 'active' },
      },
    });

    const backticked = buildPreciseRouteHint38c({
      message: '`sevo:implement fr38c-empty` 项目要继续',
      registeredProjects: [
        { slug: 'fr38c-empty', sourceRoots: ['src'], projectPath: 'projects/fr38c-empty' },
        { slug: 'sevo', sourceRoots: ['src'], projectPath: 'projects/sevo' },
      ],
    });

    expect(backticked.kind).toBe('no-active-pipeline');
    expect(backticked.projectSlug).toBe('fr38c-empty');
    expect(backticked.candidateProjects).toBeUndefined();


    const genericCommandOnly = buildPreciseRouteHint38c({
      message: '请执行(sevo:review 继续)',
      registeredProjects: [{ slug: 'sevo', sourceRoots: ['src'], projectPath: 'projects/sevo' }],
    });

    expect(genericCommandOnly?.projectSlug).not.toBe('sevo');
    expect((genericCommandOnly?.candidateProjects || []).map((p: any) => p.projectSlug)).not.toContain('sevo');

    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'sevo', currentStage: 'review', status: 'active' },
      },
    });
    const explicitSevo = buildPreciseRouteHint38c({
      message: 'sevo 项目 sevo:review 继续',
      registeredProjects: [{ slug: 'sevo', sourceRoots: ['src'], projectPath: 'projects/sevo' }],
    });

    expect(explicitSevo.projectSlug).toBe('sevo');
    const hint = buildPreciseRouteHint38c({
      message: 'fr38c-empty 项目要继续',
      registeredProjects: [{ slug: 'fr38c-empty', sourceRoots: ['src'], projectPath: 'projects/fr38c-empty' }],
    });

    expect(hint.kind).toBe('no-active-pipeline');
    expect(hint.projectSlug).toBe('fr38c-empty');
    expect(hint.candidateProjects).toBeUndefined();
    expect(hint.currentStage).toBeUndefined();
    expect(hint.completedStages).toBeUndefined();
    expect(hint.recommendedNextStage).toBe('create-or-select-pipeline');
    expect(formatPreciseRouteHint38c(hint)).toContain('先创建或选择 pipeline');
  });

  it('AC-38c.6 is read-only and does not queue advances or mutate pipeline state', () => {
    const active = {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'fr38c-app', currentStage: 'implement', status: 'active' },
      },
    };
    const state = makeState();
    writeJsonFile(ACTIVE_PIPELINES_PATH, active);
    const statePath = path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-active', 'state.json');
    writeJsonFile(statePath, state);
    const beforeActive = readFileIfExists(ACTIVE_PIPELINES_PATH);
    const beforeState = readFileIfExists(statePath);

    buildPreciseRouteHint38c({ message: 'fr38c app 当前状态' });

    expect(readFileIfExists(ACTIVE_PIPELINES_PATH)).toBe(beforeActive);
    expect(readFileIfExists(statePath)).toBe(beforeState);
    const globalState = (globalThis as any)[Symbol.for('openclaw.sevo-pipeline.instance')];
    expect(globalState.pendingAdvances?.get?.('pipe-fr38c-active') || []).toEqual([]);
  });

  it('AC-38c.7 reflects updated pipeline state on the next build', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'fr38c-app', currentStage: 'implement', status: 'active', specIntegrityCheck: { covered: true } },
      },
    });
    const statePath = path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-active', 'state.json');
    writeJsonFile(statePath, makeState({ currentStage: 'implement', completedThrough: 'contract-review-gate' }));
    expect(buildPreciseRouteHint38c({ message: 'fr38c app 状态' }).currentStage).toBe('implement');

    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'fr38c-app', currentStage: 'review', status: 'active', specIntegrityCheck: { covered: true } },
      },
    });
    writeJsonFile(statePath, makeState({ currentStage: 'review', completedThrough: 'implement' }));

    const refreshed = buildPreciseRouteHint38c({ message: 'fr38c app 状态' });
    expect(refreshed.currentStage).toBe('review');
    expect(refreshed.completedStages).toContain('implement');
    expect(refreshed.recommendedNextStage).toBe('review');
  });

  it('AC-38c.8 builds the hint for a sevo stage request before dispatch-time gates', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-active': { projectSlug: 'fr38c-app', currentStage: 'implement', status: 'active', specIntegrityCheck: { covered: true } },
      },
    });
    writeJsonFile(path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-active', 'state.json'), makeState());

    const hint = buildPreciseRouteHint38c({ message: '主会话准备派 sevo:implement fr38c app' });

    expect(hint.kind).toBe('single-pipeline-route');
    expect(hint.injectionTiming).toBe('before-sevo-stage-selection');
  });

  it('AC-38c.11 lists every candidate pipeline instead of selecting one', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-a': {
          projectSlug: 'fr38c-app',
          currentStage: 'implement',
          status: 'active',
          lastAdvancedAt: '2026-06-08T09:00:00.000Z',
        },
        'pipe-fr38c-b': {
          projectSlug: 'fr38c-app',
          currentStage: 'review',
          status: 'active',
          lastAdvancedAt: '2026-06-08T10:00:00.000Z',
        },
      },
    });
    writeJsonFile(path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-a', 'state.json'), makeState({ pipelineId: 'pipe-fr38c-a', currentStage: 'implement' }));
    writeJsonFile(path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-b', 'state.json'), makeState({ pipelineId: 'pipe-fr38c-b', currentStage: 'review', completedThrough: 'implement' }));

    const hint = buildPreciseRouteHint38c({ message: 'fr38c app 下一步是什么' });

    expect(hint.kind).toBe('pipeline-confirmation');
    expect(hint.pipelineId).toBeUndefined();
    expect(hint.recommendedNextStage).toBeNull();
    expect(hint.candidatePipelines).toHaveLength(2);
    expect(hint.candidatePipelines[0]).toMatchObject({ pipelineId: 'pipe-fr38c-a', currentStage: 'implement', lastActivityAt: '2026-06-08T09:00:00.000Z' });
    expect(hint.candidatePipelines[1]).toMatchObject({ pipelineId: 'pipe-fr38c-b', currentStage: 'review', lastActivityAt: '2026-06-08T10:00:00.000Z' });
    expect(formatPreciseRouteHint38c(hint)).toContain('先选择 pipeline');
  });

  it('AC-38c.12 does not recommend old stages for a completed pipeline', () => {
    writeJsonFile(ACTIVE_PIPELINES_PATH, {
      pipelines: {
        'pipe-fr38c-done': {
          projectSlug: 'fr38c-done',
          currentStage: 'ledger',
          status: 'completed',
          lastAdvancedAt: '2026-06-08T11:00:00.000Z',
        },
      },
    });
    writeJsonFile(
      path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38c-done', 'state.json'),
      makeState({ pipelineId: 'pipe-fr38c-done', currentStage: 'ledger', allPassed: true }),
    );

    const hint = buildPreciseRouteHint38c({ message: 'fr38c done pipeline pipe-fr38c-done 还要做什么' });
    const text = formatPreciseRouteHint38c(hint);

    expect(hint.kind).toBe('completed-pipeline');
    expect(hint.pendingStages).toEqual([]);
    expect(hint.recommendedNextStage).toBeNull();
    expect(text).toContain('所有阶段已完成，无需新的阶段推进');
    expect(text).not.toContain('推荐 review');
    expect(text).not.toContain('推荐 publish');
    expect(text).not.toContain('推荐 ledger');
  });
});
