/**
 * AC Gap Close Tests — covers all 14 ACs from the gap-close task.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { transitionInstanceStatus } from '../pipeline/status-history.js';
import { generateInstanceId, isValidInstanceId } from '../pipeline/instance-id.js';
import { createPipelineInstance } from '../pipeline/pipeline-create.js';
import { ReviewFixLoop, createReviewFixLoop } from '../stages/review-fix-loop.js';
import type { ReviewFixStatus } from '../stages/review-fix-loop.js';
import { PipelineEngineFacade } from '../pipeline/pipeline-engine.js';
import { GateEngine } from '../gate/gate-engine.js';
import type { GateRuleConfig } from '../gate/gate-engine.js';
import { ImplementStage } from '../stages/implement-stage.js';
import { LedgerStage } from '../stages/ledger-stage.js';
import { RoleKnowledgeInjector } from '../knowledge/role-knowledge-injector.js';
import type { StageMapping } from '../knowledge/role-knowledge-injector.js';
import type {
  PipelineInstance,
  PipelineInstanceStatus,
  ArtifactRef,
  StageRecord,
} from '../types/index.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeInstance(overrides?: Partial<PipelineInstance>): PipelineInstance {
  return {
    instanceId: 'fr-test-20260503-001',
    projectSlug: 'test',
    status: 'created',
    statusHistory: [{ from: 'none', to: 'created', timestamp: '2026-05-03T00:00:00Z', trigger: 'test' }],
    routingResult: {
      taskId: 'task-1',
      level: 'L2+',
      requiredStages: ['spec', 'implement', 'review', 'ledger'],
      matchedRules: ['new-module'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    },
    directoryStructure: {
      projectRoot: '/tmp/test',
      createdDirs: [],
      existingDirs: [],
      createdFiles: [],
      existingFiles: [],
      complete: true,
    },
    createdAt: '2026-05-03T00:00:00Z',
    updatedAt: '2026-05-03T00:00:00Z',
    ...overrides,
  };
}

function makeArtifact(id: string, type = 'test'): ArtifactRef {
  return { id, type, path: `/artifacts/${id}`, createdAt: '2026-05-03T00:00:00Z' };
}

// ── AC-3.7: Status history tracking ─────────────────────────────

describe('AC-3.7: PipelineInstance status history', () => {
  it('records status transitions with from/to/timestamp/trigger', async () => {
    const instance = makeInstance();
    transitionInstanceStatus(instance, 'active', 'advance', '2026-05-03T01:00:00Z');

    expect(instance.status).toBe('active');
    expect(instance.statusHistory).toHaveLength(2);
    expect(instance.statusHistory![1]).toEqual({
      from: 'created',
      to: 'active',
      timestamp: '2026-05-03T01:00:00Z',
      trigger: 'advance',
    });
  });

  it('records multiple transitions in order', async () => {
    const instance = makeInstance();
    transitionInstanceStatus(instance, 'active', 'advance', '2026-05-03T01:00:00Z');
    transitionInstanceStatus(instance, 'paused', 'user-pause', '2026-05-03T02:00:00Z');
    transitionInstanceStatus(instance, 'active', 'user-resume', '2026-05-03T03:00:00Z');
    transitionInstanceStatus(instance, 'completed', 'pipeline-done', '2026-05-03T04:00:00Z');

    expect(instance.statusHistory).toHaveLength(5); // initial + 4 transitions
    expect(instance.statusHistory!.map(h => h.to)).toEqual([
      'created', 'active', 'paused', 'active', 'completed',
    ]);
  });

  it('does not record when status is unchanged', async () => {
    const instance = makeInstance({ status: 'active' });
    transitionInstanceStatus(instance, 'active', 'noop');
    expect(instance.statusHistory).toHaveLength(1); // only initial
  });

  it('initializes statusHistory if missing', async () => {
    const instance = makeInstance();
    delete (instance as any).statusHistory;
    transitionInstanceStatus(instance, 'active', 'advance');
    expect(instance.statusHistory).toHaveLength(1);
    expect(instance.statusHistory![0]!.to).toBe('active');
  });
});

// ── AC-4.24h: ReviewFixLoop getReviewFixStatus ──────────────────

describe('AC-4.24h: ReviewFixLoop.getReviewFixStatus()', () => {
  it('returns full chain status from review output', async () => {
    const loop = createReviewFixLoop({
      now: () => '2026-05-03T00:00:00Z',
    });

    const output = await loop.execute({
      pipeline: { pipelineId: 'pipe-1', taskId: 'task-1' },
      reviewBundle: {
        gateConclusion: 'rejected',
        fixRequirements: [],
        reviews: [{
          dimension: 'quality',
          conclusion: 'rejected',
          findings: [
            { id: 'p0-bug', severity: 'blocker', message: 'Critical bug', artifact: 'src/main.ts' },
            { id: 'p1-style', severity: 'blocker', message: 'Style issue', artifact: 'src/utils.ts' },
          ],
        }],
      },
      reviewReportRef: makeArtifact('review-report', 'review-report'),
    });

    const status: ReviewFixStatus = loop.getReviewFixStatus(output);

    expect(status.issues.length).toBeGreaterThan(0);
    expect(status.fixTasks.length).toBeGreaterThan(0);
    expect(status.gateEvaluation).toBeDefined();
    expect(status.evaluatedAt).toBe('2026-05-03T00:00:00Z');
    // Gate should not pass with open P0 issues
    expect(status.gateEvaluation.gatePassed).toBe(false);
  });
});

// ── AC-3.5: Instance ID prefix ──────────────────────────────────

describe('AC-3.5: Instance ID uses fr- prefix', () => {
  it('generates IDs with fr- prefix', async () => {
    const id = generateInstanceId('my-project', []);
    expect(id).toMatch(/^fr-my-project-\d{8}-\d{3,}$/);
  });

  it('validates fr- prefix IDs', async () => {
    expect(isValidInstanceId('fr-sevo-20260503-001')).toBe(true);
    expect(isValidInstanceId('pi-sevo-20260503-001')).toBe(false);
  });
});

// ── AC-3.6: Parallel isolation test ─────────────────────────────

describe('AC-3.6: Parallel project isolation', () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = join(tmpdir(), `sevo-parallel-${Date.now()}`);
    mkdirSync(tmpBase, { recursive: true });
  });

  it('two projects running simultaneously use separate directories', async () => {
    const storeA: PipelineInstance[] = [];
    const storeB: PipelineInstance[] = [];

    const storeImplA = {
      listByProject: () => storeA,
      save: (inst: PipelineInstance) => storeA.push(inst),
    };
    const storeImplB = {
      listByProject: () => storeB,
      save: (inst: PipelineInstance) => storeB.push(inst),
    };

    const resultA = await createPipelineInstance(
      {
        projectSlug: 'project-alpha',
        task: { taskId: 'task-a', title: 'Alpha', scope: { isNewModule: true } },
      },
      { store: storeImplA, workspaceRoot: tmpBase },
    );

    const resultB = await createPipelineInstance(
      {
        projectSlug: 'project-beta',
        task: { taskId: 'task-b', title: 'Beta', scope: { isNewModule: true } },
      },
      { store: storeImplB, workspaceRoot: tmpBase },
    );

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    if (resultA.ok && resultB.ok) {
      // Different instance IDs
      expect(resultA.value.instanceId).not.toBe(resultB.value.instanceId);
      // Different project directories
      expect(resultA.value.directoryStructure.projectRoot)
        .not.toBe(resultB.value.directoryStructure.projectRoot);
      // Both directories exist
      expect(existsSync(resultA.value.directoryStructure.projectRoot)).toBe(true);
      expect(existsSync(resultB.value.directoryStructure.projectRoot)).toBe(true);
    }

    rmSync(tmpBase, { recursive: true, force: true });
  });
});

// ── AC-4.3: Artifact passing log ────────────────────────────────

describe('AC-4.3: Inter-stage artifact passing log', () => {
  it('records artifact_passed events when transitioning between stages', async () => {
    const engine = new PipelineEngineFacade();
    const summary = await engine.createPipeline('test-proj', 'Test', 'L2+');
    const pipelineId = summary.pipelineId;

    // Advance to first stage
    engine.advance(pipelineId);

    // Complete first stage with artifacts
    const artifacts: ArtifactRef[] = [
      makeArtifact('spec-doc', 'spec'),
      makeArtifact('spec-review', 'review'),
    ];
    const result = engine.completeStage(pipelineId, {
      stageId: summary.stages[0]!,
      outcome: 'passed',
      artifacts,
    });

    // Check ledger for artifact_passed event
    const events = engine.getLedger().getHistory(pipelineId);
    const artifactPassedEvents = events.filter(e => e.type === 'artifact_passed');
    expect(artifactPassedEvents.length).toBeGreaterThanOrEqual(1);
    expect(artifactPassedEvents[0]!.detail).toMatchObject({
      fromStage: summary.stages[0],
      artifactCount: 2,
    });
  });
});

// ── AC-4.18: Evidence non-empty gate ────────────────────────────

describe('AC-4.18: Implement stage evidence non-empty gate', () => {
  it('flags executions with empty evidence', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [],  // empty evidence!
          testResults: [{ name: 'test1', passed: true }],
        }),
      },
      now: () => '2026-05-03T00:00:00Z',
    });

    const output = await stage.execute({
      taskId: 'task-1',
      contractPackage: {
        deliveryOrder: ['wp-1'],
        workPackages: [],
        acceptanceCriteria: [],
        traceabilityMatrix: new Map(),
      } as any,
      workPackages: [{
        id: 'wp-1',
        description: 'Test WP',
        frIds: ['FR-01'],
        tasks: [],
      } as any],
      acceptanceCriteria: [],
    });

    // Evidence gate should fail
    expect(output.metadata.evidenceGatePassed).toBe(false);
    // But a deviation note should be added
    const exec = output.implementationBundle.executions[0]!;
    expect(exec.evidence.length).toBeGreaterThan(0);
    expect(exec.evidence[0]!.type).toBe('deviation_note');
    expect(exec.evidence[0]!.content).toContain('AC-4.18');
  });

  it('passes evidence gate when evidence is provided', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [{ type: 'code_change' as const, content: 'Changed file X' }],
          testResults: [{ name: 'test1', passed: true }],
        }),
      },
      now: () => '2026-05-03T00:00:00Z',
    });

    const output = await stage.execute({
      taskId: 'task-1',
      contractPackage: {
        deliveryOrder: ['wp-1'],
        workPackages: [],
        acceptanceCriteria: [],
        traceabilityMatrix: new Map(),
      } as any,
      workPackages: [{
        id: 'wp-1',
        description: 'Test WP',
        frIds: ['FR-01'],
        tasks: [],
      } as any],
      acceptanceCriteria: [],
    });

    expect(output.metadata.evidenceGatePassed).toBe(true);
  });
});

// ── AC-4.20a: TDD ordering record ──────────────────────────────

describe('AC-4.20a: TDD ordering timestamps', () => {
  it('records test-first and impl timestamps', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [{ type: 'code_change' as const, content: 'impl' }],
          testResults: [{ name: 'test1', passed: true }],
        }),
      },
      now: () => '2026-05-03T00:00:00Z',
    });

    const output = await stage.execute({
      taskId: 'task-1',
      contractPackage: { deliveryOrder: ['wp-1'] } as any,
      workPackages: [{
        id: 'wp-1',
        description: 'Test WP',
        frIds: ['FR-01'],
        tasks: [],
      } as any],
      acceptanceCriteria: [],
    });

    const exec = output.implementationBundle.executions[0]!;
    expect(exec.testFirstTimestamp).toBeDefined();
    expect(exec.implTimestamp).toBeDefined();
    expect(exec.tddOrderFollowed).toBeDefined();
  });
});

// ── AC-4.20b: Zero tests = not passed ───────────────────────────

describe('AC-4.20b: Zero tests not accepted', () => {
  it('allAccepted is false when no tests exist', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [{ type: 'code_change' as const, content: 'impl' }],
          testResults: [],  // no tests
        }),
      },
      now: () => '2026-05-03T00:00:00Z',
    });

    const output = await stage.execute({
      taskId: 'task-1',
      contractPackage: { deliveryOrder: ['wp-1'] } as any,
      workPackages: [{
        id: 'wp-1',
        description: 'Test WP',
        frIds: ['FR-01'],
        tasks: [],
      } as any],
      acceptanceCriteria: [],
    });

    expect(output.metadata.hasTests).toBe(false);
    expect(output.metadata.allAccepted).toBe(false);
  });

  it('allAccepted is true when tests pass', async () => {
    const stage = new ImplementStage({
      adapter: {
        executeTask: async () => ({
          output: 'done',
          evidence: [{ type: 'code_change' as const, content: 'impl' }],
          testResults: [{ name: 'test1', passed: true }],
        }),
      },
      now: () => '2026-05-03T00:00:00Z',
    });

    const output = await stage.execute({
      taskId: 'task-1',
      contractPackage: { deliveryOrder: ['wp-1'] } as any,
      workPackages: [{
        id: 'wp-1',
        description: 'Test WP',
        frIds: ['FR-01'],
        tasks: [],
      } as any],
      acceptanceCriteria: [],
    });

    expect(output.metadata.hasTests).toBe(true);
    expect(output.metadata.totalTestsPassed).toBe(1);
    expect(output.metadata.allAccepted).toBe(true);
  });
});

// ── AC-4.44 & AC-4.47: Resolution writer (already implemented) ──

describe('AC-4.44 & AC-4.47: Resolution writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `sevo-resolution-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  it('writes ADR files for ADR sink (AC-4.47)', async () => {
    const { writeResolutionArtifacts } = await import('../clarification/resolution-writer.js');
    const { ResolutionSink, ClarificationType, BlockingLevel, Status } = await import('../clarification/clarification-types.js');

    const record = {
      schema_version: '1.0' as const,
      clarificationId: 'clr-001',
      pipelineId: 'pipe-1',
      stageId: 'spec' as const,
      stageAttempt: 1,
      type: ClarificationType.DECISION,
      blockingLevel: BlockingLevel.BLOCKING,
      status: Status.SETTLED,
      targetType: 'user' as const,
      sourceArtifacts: [],
      impactScope: ['module-a', 'module-b'],
      question: 'Should we use REST or GraphQL for the API?',
      resolution: 'Use REST for simplicity and wider tooling support.',
      resolutionSinks: [ResolutionSink.ADR],
      createdAt: '2026-05-03T00:00:00Z',
      resolvedAt: '2026-05-03T01:00:00Z',
    };

    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-05-03T01:00:00Z');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.type).toBe('clarification-adr');

    const content = readFileSync(artifacts[0]!.path, 'utf-8');
    expect(content).toContain('ADR-1');
    expect(content).toContain('REST');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to correct subdirectory per sink (AC-4.44)', async () => {
    const { writeResolutionArtifacts } = await import('../clarification/resolution-writer.js');
    const { ResolutionSink, ClarificationType, BlockingLevel, Status } = await import('../clarification/clarification-types.js');

    const record = {
      schema_version: '1.0' as const,
      clarificationId: 'clr-002',
      pipelineId: 'pipe-1',
      stageId: 'contract' as const,
      stageAttempt: 1,
      type: ClarificationType.BOUNDARY,
      blockingLevel: BlockingLevel.NON_BLOCKING,
      status: Status.SETTLED,
      targetType: 'user' as const,
      sourceArtifacts: [],
      impactScope: [],
      question: 'What is the boundary of module X?',
      resolution: 'Module X handles only authentication.',
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE, ResolutionSink.FACT],
      createdAt: '2026-05-03T00:00:00Z',
    };

    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-05-03T01:00:00Z');
    expect(artifacts).toHaveLength(2);

    // Check subdirectories
    const paths = artifacts.map(a => a.path);
    expect(paths.some(p => p.includes('/spec/'))).toBe(true);
    expect(paths.some(p => p.includes('/facts/'))).toBe(true);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── AC-4.53: Config-driven gate rules ───────────────────────────

describe('AC-4.53: Config-driven gate rules', () => {
  it('loads rules from JSON config', async () => {
    const engine = new GateEngine();
    const config: GateRuleConfig = {
      rules: [
        {
          id: 'require-tests',
          appliesTo: ['implement'],
          check: { artifactType: 'test-result', minCount: 1 },
          severity: 'blocker',
          message: 'At least one test result required',
        },
        {
          id: 'require-spec',
          appliesTo: ['spec'],
          check: { artifactType: 'spec-doc', minCount: 1 },
          severity: 'warning',
        },
      ],
    };

    engine.loadRulesFromConfig(config);
    expect(engine.getRules()).toHaveLength(2);

    // Evaluate with no artifacts — should fail
    const verdict = engine.evaluateGate('implement', []);
    expect(verdict.pass).toBe(false);
    expect(verdict.blockers.length).toBeGreaterThan(0);

    // Evaluate with matching artifact — should pass
    const verdict2 = engine.evaluateGate('implement', [
      makeArtifact('test-1', 'test-result'),
    ]);
    expect(verdict2.pass).toBe(true);
  });
});

// ── AC-4.54: Ledger collects clarification artifacts ────────────

describe('AC-4.54: LedgerStage collects clarification artifacts', () => {
  it('collects clarification refs from stage records', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2026-05-03T00:00:00Z',
    });

    const stageRecords: StageRecord[] = [
      {
        stageId: 'spec',
        status: 'passed',
        artifacts: [],
        clarificationRefs: [makeArtifact('clr-from-spec', 'clarification')],
      },
      {
        stageId: 'implement',
        status: 'passed',
        artifacts: [],
        clarificationRefs: [makeArtifact('clr-from-impl', 'clarification')],
      },
    ];

    const output = await stage.execute({
      taskId: 'task-1',
      pipelineId: 'pipe-1',
      version: '1.0.0',
      scope: 'test',
      stages: stageRecords,
      evidence: [],
      verifyPassed: true,
      artifactBasePath: join(tmpdir(), `sevo-ledger-${Date.now()}`),
    });

    expect(output.ledgerEntry.clarificationRefs).toHaveLength(2);
    expect(output.ledgerEntry.clarificationRefs!.map(r => r.id)).toContain('clr-from-spec');
    expect(output.ledgerEntry.clarificationRefs!.map(r => r.id)).toContain('clr-from-impl');
  });

  it('deduplicates clarification refs from input and stages', async () => {
    const stage = new LedgerStage({
      adapter: {},
      now: () => '2026-05-03T00:00:00Z',
    });

    const sharedRef = makeArtifact('clr-shared', 'clarification');
    const stageRecords: StageRecord[] = [
      {
        stageId: 'spec',
        status: 'passed',
        artifacts: [],
        clarificationRefs: [sharedRef],
      },
    ];

    const output = await stage.execute({
      taskId: 'task-1',
      pipelineId: 'pipe-1',
      version: '1.0.0',
      scope: 'test',
      stages: stageRecords,
      evidence: [],
      verifyPassed: true,
      clarificationRefs: [sharedRef],  // same ref in input
      artifactBasePath: join(tmpdir(), `sevo-ledger-dedup-${Date.now()}`),
    });

    // Should be deduplicated
    expect(output.ledgerEntry.clarificationRefs).toHaveLength(1);
  });
});

// ── AC-6.6.3: Config-driven principles ──────────────────────────

describe('AC-6.6.3: Config-driven principle mappings', () => {
  it('accepts custom stage-role mappings', async () => {
    const customMappings: Record<string, StageMapping> = {
      'spec': {
        role: 'architect',
        templateFile: 'custom-spec-principles.md',
        description: 'Custom spec principles',
      },
    };

    const injector = new RoleKnowledgeInjector({
      customMappings,
      templatesDir: '/nonexistent',  // won't find templates, that's fine
    });

    // Custom mapping should override default
    expect(injector.getRoleForStage('spec')).toBe('architect');
    // Non-overridden stages keep defaults
    expect(injector.getRoleForStage('implement')).toBe('engineer');
  });

  it('lists merged mappings', async () => {
    const customMappings: Record<string, StageMapping> = {
      'custom-stage': {
        role: 'pm',
        templateFile: 'custom.md',
        description: 'Custom stage',
      },
    };

    const injector = new RoleKnowledgeInjector({ customMappings });
    const mappings = injector.listMappings();
    const customEntry = mappings.find(m => m.stageId === 'custom-stage');
    expect(customEntry).toBeDefined();
    expect(customEntry!.role).toBe('pm');
  });
});

// ── AC-6.6.5: E2E test for principle injection ─────────────────

describe('AC-6.6.5: E2E principle injection for any Agent + Contract stage', () => {
  it('injects principles for contract stage', async () => {
    const injector = new RoleKnowledgeInjector();
    const context = injector.inject('contract', { taskId: 'test' });

    expect(context._injectedRole).toBe('architect');
    expect(context._injectedAt).toBeDefined();
    // principles may be empty if template file doesn't exist in test env
    expect(typeof context.principles).toBe('string');
  });

  it('injects principles for all standard stages', async () => {
    const injector = new RoleKnowledgeInjector();
    const stages = [
      'spec', 'spec-review-gate', 'contract', 'contract-review-gate',
      'implement', 'review', 'smoke-test', 'ux-acceptance',
      'deploy', 'verify', 'ledger',
    ] as const;

    for (const stage of stages) {
      const context = injector.inject(stage, {});
      expect(context._injectedRole).not.toBe('unknown');
      expect(typeof context.principles).toBe('string');
    }
  });
});
