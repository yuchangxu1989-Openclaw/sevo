import { describe, expect, it } from 'vitest';
import { DEFAULT_FULL_PIPELINE_STAGES, handleCommand } from '../src/pipeline-commands.js';
import {
  ROUTE_VECTOR_DB_PATH,
  classifyCommandRoute,
  classifyPipelineRoute,
  classifyStageRoute,
  routeVectorSamples,
  selfTestRouteVectors,
} from '../src/route-classifier.js';

function createMockRunStore() {
  const runs = new Map();
  const store = {
    listActiveRuns(projectSlug) {
      return Array.from(runs.values()).filter(
        (run) => run.status === 'running' && (!projectSlug || run.projectSlug === projectSlug),
      );
    },
    createRun(input) {
      const id = `run-${runs.size + 1}`;
      const ordered = input.stagePlan.ordered;
      const skipped = new Set(input.stagePlan.skipped || []);
      const stages = Object.fromEntries(
        ordered.map((stageId, index) => [
          stageId,
          {
            status: skipped.has(stageId) ? 'skipped' : index === 0 ? 'active' : 'pending',
            attempt: 1,
            artifacts: [],
          },
        ]),
      );
      const run = {
        pipelineRunId: id,
        projectSlug: input.projectSlug,
        projectRoot: input.projectRoot,
        goal: input.goal,
        scopeFingerprint: `sha256:${input.goal}`,
        status: 'running',
        entryType: input.entryType || 'create',
        currentStageId: ordered[0],
        stagePlan: input.stagePlan,
        stages,
        lifecycle: { lastActivityAt: new Date().toISOString() },
        metadata: { routeDecision: input.routeDecision || null },
      };
      runs.set(id, run);
      return run;
    },
    getRun(id) {
      return runs.get(id) || null;
    },
    advanceStage(id, stageId, { status, needsPassNoChangeReview, suppressAutoAdvance }) {
      const run = runs.get(id);
      const stage = run.stages[stageId] || { attempt: 1, artifacts: [] };
      run.stages[stageId] = {
        ...stage,
        status,
        ...(needsPassNoChangeReview === undefined ? {} : { needsPassNoChangeReview }),
      };
      if (status === 'active') run.currentStageId = stageId;
      if (!suppressAutoAdvance && (status === 'passed' || status === 'skipped')) {
        const idx = run.stagePlan.ordered.indexOf(stageId);
        const next = run.stagePlan.ordered
          .slice(idx + 1)
          .find((sid) => !['passed', 'skipped', 'failed', 'blocked'].includes(run.stages[sid]?.status));
        if (next) {
          run.stages[next] = { ...run.stages[next], status: 'active' };
          run.currentStageId = next;
        }
      }
      return run;
    },
    closeRun(id, { status }) {
      const run = runs.get(id);
      run.status = status;
      return run;
    },
  };
  return store;
}

describe('SEVO V2 route classifier', { timeout: 30000 }, () => {
  it('loads the V2 route vector database from the project data directory', () => {
    expect(ROUTE_VECTOR_DB_PATH.endsWith('projects/sevo/data/route-vectors.json')).toBe(true);
    const samples = routeVectorSamples();
    expect(samples.length).toBeGreaterThanOrEqual(100);
    expect(samples.filter((sample) => sample.scenario === 'pipeline-trigger').length).toBeGreaterThanOrEqual(12);
    expect(samples.filter((sample) => sample.scenario.startsWith('stage:')).length).toBeGreaterThanOrEqual(70);
  });

  it('self-tests route-vectors samples above 95 percent accuracy', () => {
    const result = selfTestRouteVectors();
    expect(result.total).toBeGreaterThanOrEqual(100);
    expect(result.accuracy).toBeGreaterThan(0.95);
    expect(result.failed).toBe(0);
  });

  it('classifies known trigger and stage samples with direct cosine confidence', async () => {
    const trigger = routeVectorSamples().find((sample) => sample.id === 'trigger-02');
    const publish = routeVectorSamples().find((sample) => sample.id === 'stage-publish-01');

    const triggerResult = await classifyPipelineRoute(trigger.text);
    expect(triggerResult.source).toBe('route-vector-cosine');
    expect(triggerResult.shouldTrigger).toBe(true);
    expect(triggerResult.level).toBe(2);
    expect(triggerResult.confidenceBand).toBe('direct');
    expect(triggerResult.score).toBeGreaterThanOrEqual(0.99);

    const stageResult = await classifyStageRoute(publish.text);
    expect(stageResult.source).toBe('route-vector-cosine');
    expect(stageResult.stage).toBe('publish');
    expect(stageResult.confidenceBand).toBe('direct');
    expect(stageResult.score).toBeGreaterThanOrEqual(0.99);
  });

  it('classifies non-fixture command text with embedding or text-features', async () => {
    const triggerResult = await classifyPipelineRoute('Create or modify source files so the requested runtime behavior is delivered and verified.');
    expect(triggerResult.source).toBe('route-vector-cosine');
    expect(triggerResult.ok).toBe(true);
    expect(triggerResult.score).toBeGreaterThan(0.7);
    expect(triggerResult.matchedSample.id).toBe('trigger-02');
    expect(['embedding', 'text-features']).toContain(triggerResult.vectorKind);

    const stageResult = await classifyStageRoute('Prepare release notes, versioning, artifact routing, and publish evidence for users.');
    expect(stageResult.source).toBe('route-vector-cosine');
    expect(stageResult.stage).toBe('publish');
    expect(stageResult.confidenceBand).toBe('direct');
    expect(stageResult.score).toBeGreaterThan(0.85);
    expect(['embedding', 'text-features']).toContain(stageResult.vectorKind);
  });

  it('V2 command routing uses vector classification metadata on create', async () => {
    const publish = routeVectorSamples().find((sample) => sample.id === 'stage-publish-01');
    const store = createMockRunStore();
    const result = await handleCommand('create', {
      projectSlug: 'sevo',
      projectRoot: 'projects/sevo',
      goal: publish.text,
      stagePlan: { ordered: ['spec', 'implement', 'review', 'publish', 'verify'], skipped: [] },
    }, { runStore: store });

    expect(result).toContain('Route:');
    expect(result).toContain('stage:stage-publish-01/direct');
    const run = store.listActiveRuns('sevo')[0];
    expect(run.metadata.routeDecision.source).toBe('route-vector-classifier');
    expect(run.metadata.routeDecision.selectedStage).toBe('publish');
  });

  it('V2 from entry prefers high-confidence semantic stage over low-confidence default route', async () => {
    const publishGoal = 'Prepare release notes, versioning, artifact routing, and publish evidence for users.';
    const store = createMockRunStore();
    const result = await handleCommand('from', {
      projectSlug: 'sevo',
      projectRoot: 'projects/sevo',
      goal: publishGoal,
      fromStage: 'implement',
      stagePlan: { ordered: ['spec', 'implement', 'review', 'publish', 'verify'], skipped: [] },
    }, {
      runStore: store,
      classifyCommandRoute: async () => ({
        source: 'route-vector-classifier',
        selectedStage: 'publish',
        pipeline: { ok: true },
        stage: {
          ok: true,
          stage: 'publish',
          matchedSample: { id: 'stage-publish-02' },
        },
      }),
    });

    expect(result).toContain('semantic route selected "publish" over requested "implement"');
    expect(result).toContain('Mandatory prior stage "implement" requires pass/no-change review before "publish"');
    const run = store.listActiveRuns('sevo')[0];
    expect(run.currentStageId).toBe('implement');
    expect(run.stages.implement.status).toBe('active');
    expect(run.stages.implement.needsPassNoChangeReview).toBe(true);
    expect(run.stages.review.status).not.toBe('passed');
    expect(run.stages.review.needsPassNoChangeReview).toBe(true);
    expect(run.metadata.routeDecision.stage.matchedSample.id).toBe('stage-publish-02');
  });

  it('default full pipeline stages include the complete V2 chain', () => {
    expect([...DEFAULT_FULL_PIPELINE_STAGES]).toEqual([
      'spec',
      'spec-review-gate',
      'test-case-authoring',
      'ux-acceptance-authoring',
      'commercial-acceptance-authoring',
      'ux-interaction-design',
      'architecture-design',
      'contract',
      'contract-review-gate',
      'implement',
      'review',
      'fix',
      'smoke-test',
      'ux-acceptance',
      'pm-commercial-review',
      'regression',
      'publish-generalization-gate',
      'deploy',
      'verify',
      'readme',
      'post-release-validation',
      'clean-install-verification',
      'ledger',
    ]);
  });

  it('rejects user-requested skips for mandatory implementation and review stages', async () => {
    const store = createMockRunStore();
    const createResult = await handleCommand('create', {
      projectSlug: 'sevo',
      projectRoot: 'projects/sevo',
      goal: 'protect skip stages',
      stagePlan: { ordered: ['spec', 'implement', 'review', 'deploy'], skipped: [] },
    }, { runStore: store });
    expect(createResult).toContain('Created run');

    const run = store.listActiveRuns('sevo')[0];
    const implementSkip = await handleCommand('skip', {
      pipelineRunId: run.pipelineRunId,
      stageId: 'implement',
    }, { runStore: store });
    const reviewSkip = await handleCommand('skip', {
      pipelineRunId: run.pipelineRunId,
      stageId: 'review',
    }, { runStore: store });

    expect(implementSkip).toContain('mandatory and cannot be skipped');
    expect(reviewSkip).toContain('mandatory and cannot be skipped');
    expect(run.stages.implement.status).toBe('pending');
    expect(run.stages.review.status).toBe('pending');
  });

  it('rejects create-time protected stages listed in stagePlan.skipped', async () => {
    const store = createMockRunStore();
    const result = await handleCommand('create', {
      projectSlug: 'sevo',
      projectRoot: 'projects/sevo',
      goal: 'try to pre-skip implementation',
      stagePlan: { ordered: ['spec', 'implement', 'review'], skipped: ['implement'] },
    }, { runStore: store });

    expect(result).toContain('mandatory and cannot be pre-skipped');
    expect(store.listActiveRuns('sevo')).toHaveLength(0);
  });

  it('from entry marks prior review stages for pass/no-change review instead of passed', async () => {
    const store = createMockRunStore();
    const result = await handleCommand('from', {
      projectSlug: 'sevo',
      projectRoot: 'projects/sevo',
      goal: 'resume deployment after implementation and review',
      fromStage: 'deploy',
      stagePlan: { ordered: ['spec', 'implement', 'review', 'fix', 'deploy', 'verify'], skipped: [] },
    }, {
      runStore: store,
      classifyCommandRoute: async () => ({
        source: 'test',
        selectedStage: 'deploy',
        pipeline: { ok: true },
        stage: { ok: true, stage: 'deploy' },
      }),
    });

    const run = store.listActiveRuns('sevo')[0];
    expect(result).toContain('starting from stage "implement"');
    expect(run.currentStageId).toBe('implement');
    expect(run.stages.implement.status).toBe('active');
    expect(run.stages.implement.needsPassNoChangeReview).toBe(true);
    expect(run.stages.review.status).toBe('pending');
    expect(run.stages.review.needsPassNoChangeReview).toBe(true);
    expect(run.stages.fix.status).toBe('pending');
    expect(run.stages.fix.needsPassNoChangeReview).toBe(true);
    expect(run.stages.review.status).not.toBe('passed');
    expect(run.stages.fix.status).not.toBe('passed');
  });
});
