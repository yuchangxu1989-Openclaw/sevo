import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE_PIPELINES_PATH = path.join(PLUGIN_ROOT, 'state', 'active-pipelines.json');
const TEST_PIPELINE_IDS = ['pipe-fr38b-hook-a', 'pipe-fr38b-hook-b'];

const {
  FULL_PIPELINE_STAGES,
  buildStageRouteAdvisory38b,
  applyStageRouteAdvisory38b,
  applyStageRouteAdvisoryForExistingLabelSpawn38b,
  isStageRouteGateBlocked38b,
  parseStageRouteHandshake38b,
  recordStageRouteHandshake38b,
  formatStageRouteAdvisory38b,
  STAGE_ROUTE_HANDSHAKE_START,
  STAGE_ROUTE_HANDSHAKE_END,
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
  currentStage = 'implement',
  completedThrough = 'contract-review-gate',
  statuses = {},
}: {
  currentStage?: string;
  completedThrough?: string;
  statuses?: Record<string, string>;
} = {}) {
  const requiredStages = [...FULL_PIPELINE_STAGES];
  const completedIndex = requiredStages.indexOf(completedThrough);
  const stages: Record<string, { status: string }> = {};
  requiredStages.forEach((stageId: string, index: number) => {
    stages[stageId] = { status: index <= completedIndex ? 'passed' : 'pending' };
  });
  stages[currentStage] = { status: 'active' };
  for (const [stageId, status] of Object.entries(statuses)) stages[stageId] = { status };
  return { pipelineId: 'pipe-fr38b', requiredStages, stages, currentStage };
}

function expectRequiredShape(advisory: any) {
  for (const field of [
    'projectSlug',
    'requestedEntry',
    'requestedStage',
    'pipelineId',
    'currentStage',
    'completedStages',
    'pendingStages',
    'specCoverageStatus',
    'routeOptions',
    'recommendedQuestion',
    'confidence',
    'reason',
    'requiresMainAgentDecision',
    'createdAt',
  ]) {
    expect(advisory).toHaveProperty(field);
  }
  expect(advisory.routeOptions.length).toBeGreaterThan(0);
  expect(advisory.routeOptions[0]).toHaveProperty('stage');
  expect(advisory.routeOptions[0]).toHaveProperty('whyThisStage');
  expect(advisory.routeOptions[0]).toHaveProperty('missingInputs');
  expect(advisory.routeOptions[0]).toHaveProperty('readySignals');
  expect(advisory.routeOptions[0]).toHaveProperty('riskIfSkipped');
}

describe('FR-38b Stage Route Advisory + Clarification Gate', () => {
  beforeEach(() => {
    const globalState = (globalThis as any)[GLOBAL_KEY];
    if (globalState?.pendingNotices) globalState.pendingNotices.length = 0;
    if (globalState?.pendingStageRouteAdvisories38b) globalState.pendingStageRouteAdvisories38b.clear();
    if (globalState?.stageRouteHandshakeRecords38b) globalState.stageRouteHandshakeRecords38b.length = 0;
  });

  it('AC-38b.1 produces direct-advance-advisory when entry conditions are ready', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:implement FR-38b',
      requestedStage: 'implement',
      pipelineId: 'pipe-fr38b',
      state: makeState(),
      specCoverageStatus: 'covered',
      routeAnalysis: { status: 'clear', confidence: 0.91, reason: 'covered by FR-38b' },
    });

    expectRequiredShape(advisory);
    expect(advisory.advisoryType).toBe('direct-advance-advisory');
    expect(advisory.specCoverageStatus).toBe('covered');
    expect(advisory.requiresMainAgentDecision).toBe(true);
    expect(advisory.requiresClarificationGate).toBe(false);
    expect(formatStageRouteAdvisory38b(advisory)).not.toContain('已决定');
  });

  it.each([
    ['implement', 'sevo:implement build it'],
    ['review', 'sevo:review build it'],
    ['ux-acceptance', 'sevo:ux build it'],
    ['publish', 'sevo:publish build it'],
  ])('AC-38b.2 and AC-38b.9 route %s requests with missing spec back to spec/spec-review only', (requestedStage, requestedEntry) => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'new-project',
      requestedEntry,
      requestedStage,
      pipelineId: 'pipe-missing-spec',
      state: makeState({ currentStage: 'spec', completedThrough: 'spec' }),
      specCoverageStatus: 'missing',
      routeAnalysis: { status: 'gap', confidence: 0.8, reason: 'spec missing' },
    });

    expect(advisory.advisoryType).toBe('earlier-stage-advisory');
    expect(advisory.specCoverageStatus).toBe('missing');
    expect(advisory.routeOptions.map((o: any) => o.stage)).toEqual(['spec', 'spec-review-gate']);
    expect(advisory.routeOptions.flatMap((o: any) => o.missingInputs)).toContain('spec file missing');
    expect(advisory.requiresClarificationGate).toBe(true);
  });

  it('AC-38b.3 asks the main Agent when spec exists but coverage is uncertain', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:design add undefined concept',
      requestedStage: 'architecture-design',
      pipelineId: 'pipe-ambiguous',
      state: makeState({ currentStage: 'architecture-design', completedThrough: 'ux-interaction-design' }),
      specCoverageStatus: 'unknown',
      routeAnalysis: {
        status: 'ambiguous',
        suggestedStages: ['spec', 'spec-review-gate', 'architecture-design'],
        clarificationItems: ['新增概念归属不明确'],
        confidence: 0.66,
        reason: 'spec exists but scope is unclear',
      },
    });

    expect(advisory.advisoryType).toBe('clarification-required');
    expect(advisory.routeOptions.length).toBeGreaterThanOrEqual(2);
    expect(advisory.recommendedQuestion).toContain('请主 Agent 判断');
    expect(advisory.routeOptions.map((o: any) => o.stage)).toContain('spec');
    expect(advisory.routeOptions.map((o: any) => o.stage)).toContain('architecture-design');
  });

  it('AC-38b.4 gates without mutating pipeline state or auto-dispatching', () => {
    const state = makeState({ currentStage: 'implement', completedThrough: 'spec' });
    const before = JSON.stringify(state);
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:implement',
      requestedStage: 'implement',
      pipelineId: 'pipe-fr38b',
      state,
      specCoverageStatus: 'gap',
      routeAnalysis: { status: 'gap', reason: 'missing contract', confidence: 0.7 },
    });

    applyStageRouteAdvisory38b(advisory, { source: 'unit-test' });
    expect(isStageRouteGateBlocked38b({ pipelineId: 'pipe-fr38b', projectSlug: 'sevo', requestedStage: 'implement' })?.advisoryId).toBe(advisory.advisoryId);
    expect(JSON.stringify(state)).toBe(before);
    const globalState = (globalThis as any)[GLOBAL_KEY];
    expect(globalState.pendingNotices.some((notice: string) => notice.includes('Gate: clarification required'))).toBe(true);
    expect(globalState.pendingAdvances?.get?.('pipe-fr38b') || []).toEqual([]);
  });

  it('AC-38b.5 records main Agent handshake with advisoryId, reason, selected stage and next advance prompt', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:implement',
      requestedStage: 'implement',
      pipelineId: 'pipe-fr38b',
      state: makeState({ currentStage: 'implement', completedThrough: 'spec' }),
      specCoverageStatus: 'gap',
      routeAnalysis: { status: 'gap', reason: 'spec gap', confidence: 0.8 },
    });
    applyStageRouteAdvisory38b(advisory, { source: 'unit-test' });

    const parsed = parseStageRouteHandshake38b([
      STAGE_ROUTE_HANDSHAKE_START,
      JSON.stringify({ advisoryId: advisory.advisoryId, selectedStage: 'spec', reason: '先补 FR-38b AC' }),
      STAGE_ROUTE_HANDSHAKE_END,
    ].join('\n'));
    const record = recordStageRouteHandshake38b(parsed);

    expect(record.advisoryId).toBe(advisory.advisoryId);
    expect(record.selectedStage).toBe('spec');
    expect(record.reason).toContain('先补');
    expect(record.nextAdvancePrompt).toContain('Selected stage: spec');
    expect(isStageRouteGateBlocked38b({ pipelineId: 'pipe-fr38b', projectSlug: 'sevo', requestedStage: 'implement' })).toBeNull();
  });

  it('AC-38b.6 splits mixed inputs into multiple route options', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:implement 补 FR 并实现',
      requestedStage: 'implement',
      pipelineId: 'pipe-mixed',
      state: makeState(),
      specCoverageStatus: 'unknown',
      routeAnalysis: {
        status: 'mixed',
        suggestedStages: ['spec', 'architecture-design', 'implement'],
        clarificationItems: ['补 spec 部分', '设计部分', '实现部分'],
        confidence: 0.72,
        reason: 'mixed request',
      },
    });

    expect(advisory.advisoryType).toBe('clarification-required');
    expect(advisory.routeOptions.map((o: any) => o.stage)).toEqual(['spec', 'architecture-design', 'implement']);
    expect(advisory.requiresMainAgentDecision).toBe(true);
  });

  it('AC-38b.7 carries LLM semantic detection evidence plus structured pipeline summary', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:review',
      requestedStage: 'review',
      pipelineId: 'pipe-semantic',
      state: makeState({ currentStage: 'review', completedThrough: 'implement' }),
      specCoverageStatus: 'covered',
      routeAnalysis: { status: 'clear', confidence: 0.88, reason: 'semantic model says covered', modelCallId: 'chatcmpl-fr38b' },
    });

    expect(advisory.semanticDecision.detectionMethod).toBe('llm-semantic');
    expect(advisory.semanticDecision.modelCallId).toBe('chatcmpl-fr38b');
    expect(advisory.pipelineStateSummary.completedStages).toContain('implement');
  });

  it('AC-38b.8 emits completed-no-action-advisory for finished pipelines', () => {
    const state = makeState();
    for (const stageId of state.requiredStages) state.stages[stageId] = { status: 'passed' };
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:implement new range',
      requestedStage: 'implement',
      pipelineId: 'pipe-completed',
      state,
      specCoverageStatus: 'covered',
      routeAnalysis: { status: 'ambiguous', confidence: 0.7, reason: 'new range maybe' },
    });

    expect(advisory.advisoryType).toBe('completed-no-action-advisory');
    expect(advisory.pendingStages).toEqual([]);
    expect(advisory.requiresMainAgentDecision).toBe(true);
    expect(advisory.recommendedQuestion).toContain('结束当前 pipeline');
  });

  it('AC-38b.10 asks for target pipeline when multiple candidates exist', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:review',
      requestedStage: 'review',
      state: makeState({ currentStage: 'review', completedThrough: 'implement' }),
      specCoverageStatus: 'covered',
      candidatePipelines: [
        { pipelineId: 'pipe-a', currentStage: 'implement', recentTaskSummary: 'FR-A', matchBasis: 'same projectSlug' },
        { pipelineId: 'pipe-b', currentStage: 'review', recentTaskSummary: 'FR-B', matchBasis: 'same projectSlug' },
      ],
      routeAnalysis: { status: 'ambiguous', reason: 'multiple candidates', confidence: 0.5 },
    });

    expect(advisory.advisoryType).toBe('clarification-required');
    expect(advisory.routeOptions.map((o: any) => o.readySignals.join(' ')).join(' ')).toContain('pipelineId=pipe-a');
    expect(advisory.routeOptions.map((o: any) => o.readySignals.join(' ')).join(' ')).toContain('pipelineId=pipe-b');
    expect(advisory.reason).toContain('多条');
  });

  it('AC-38b.10 keeps hook advisory path from preselecting the first active pipeline', async () => {
    const previousActivePipelines = readFileIfExists(ACTIVE_PIPELINES_PATH);
    cleanupTestPipelineState();
    try {
      writeJsonFile(ACTIVE_PIPELINES_PATH, {
        pipelines: {
          'pipe-fr38b-hook-a': {
            projectSlug: 'fr38b-multi',
            currentStage: 'implement',
            status: 'active',
            managedChange: { title: 'FR-A' },
            specIntegrityCheck: { covered: true },
          },
          'pipe-fr38b-hook-b': {
            projectSlug: 'fr38b-multi',
            currentStage: 'review',
            status: 'active',
            managedChange: { title: 'FR-B' },
            specIntegrityCheck: { covered: true },
          },
        },
      });
      writeJsonFile(
        path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38b-hook-a', 'state.json'),
        makeState({ currentStage: 'implement', completedThrough: 'contract-review-gate' }),
      );
      writeJsonFile(
        path.join(PLUGIN_ROOT, 'data', 'pipelines', 'pipe-fr38b-hook-b', 'state.json'),
        makeState({ currentStage: 'review', completedThrough: 'implement' }),
      );

      const result = await applyStageRouteAdvisoryForExistingLabelSpawn38b({
        parsedLabel: { projectSlug: 'fr38b-multi', stageId: 'review' },
        existingLabel: 'sevo:fr38b-multi:review:1',
        params: { prompt: 'review the current change' },
        source: 'unit-test-hook-path',
      });
      const advisory = result.advisory;

      expect(advisory.advisoryType).toBe('clarification-required');
      expect(result.resolvedPid).toBeNull();
      expect(result.blockResponse?.block).toBe(true);
      expect(advisory.pipelineId).toBeNull();
      expect(advisory.requiresClarificationGate).toBe(true);
      const readySignals = advisory.routeOptions.map((o: any) => o.readySignals.join(' ')).join(' ');
      expect(readySignals).toContain('pipelineId=pipe-fr38b-hook-a');
      expect(readySignals).toContain('pipelineId=pipe-fr38b-hook-b');
      expect(isStageRouteGateBlocked38b({
        projectSlug: 'fr38b-multi',
        requestedStage: 'review',
      })?.advisoryId).toBe(advisory.advisoryId);
    } finally {
      restoreFile(ACTIVE_PIPELINES_PATH, previousActivePipelines);
      cleanupTestPipelineState();
    }
  });

  it('AC-38b.11 requires confirmation when an earlier stage is requested after later stages passed', () => {
    const advisory = buildStageRouteAdvisory38b({
      projectSlug: 'sevo',
      requestedEntry: 'sevo:specify',
      requestedStage: 'spec',
      pipelineId: 'pipe-regress',
      state: makeState({
        currentStage: 'implement',
        completedThrough: 'contract-review-gate',
        statuses: { implement: 'active', review: 'passed' },
      }),
      specCoverageStatus: 'covered',
      routeAnalysis: { status: 'ambiguous', reason: 'possible rework', confidence: 0.6 },
    });

    expect(['clarification-required', 'earlier-stage-advisory']).toContain(advisory.advisoryType);
    expect(advisory.reason).toContain('早于当前阶段');
    expect(advisory.routeOptions.flatMap((o: any) => o.missingInputs).join(' ')).toContain('review');
    expect(advisory.routeOptions.map((o: any) => o.whyThisStage).join(' ')).toContain('复用当前 pipeline');
  });
});
