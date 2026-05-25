/**
 * Tests for FR-D01, FR-D02, FR-D03: Proactive Drive Layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StageTransitionTrigger } from '../stage-transition-trigger.js';
import { SpecGapDetector } from '../spec-gap-detector.js';
import { PostReleaseAutoScanner } from '../post-release-auto-scanner.js';
import { ProactiveDriveEngine } from '../proactive-drive-engine.js';
import type { DriveEventListener, DriveContext } from '../proactive-drive-engine.js';

vi.mock('../../llm/index.js', () => ({
  LLMProvider: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockImplementation(async (messages: Array<{ role: string; content: string }>) => {
      const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
      const frSection = userMsg.split('## Subject to Evaluate')[0] ?? '';
      const subject = userMsg.split('## Subject to Evaluate\n')[1] ?? '';
      // Simulate semantic judgment: covered if subject words appear in FR context
      const subjectWords = subject.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const frLower = frSection.toLowerCase();
      const matchCount = subjectWords.filter((w) => frLower.includes(w)).length;
      return matchCount >= 2 ? 'yes' : 'no';
    }),
  })),
}));
import type { FrReference, ImplementationModule } from '../spec-gap-detector.js';
import { GateEngine } from '../../gate/gate-engine.js';
import { EventLedger } from '../../pipeline/ledger.js';
import { DEFAULT_TRANSITION_GATES } from '../types.js';
import type { ArtifactRef, StageId } from '../../types/index.js';

// ── Helpers ─────────────────────────────────────────────────────

function createArtifact(overrides?: Partial<ArtifactRef>): ArtifactRef {
  return {
    id: 'art-001',
    type: 'implement-code',
    path: '/src/module.ts',
    createdAt: '2026-05-08T00:00:00Z',
    ...overrides,
  };
}

// ── FR-D01: StageTransitionTrigger ──────────────────────────────

describe('StageTransitionTrigger (FR-D01)', () => {
  let gateEngine: GateEngine;
  let trigger: StageTransitionTrigger;

  beforeEach(() => {
    gateEngine = new GateEngine();
    trigger = new StageTransitionTrigger(gateEngine, DEFAULT_TRANSITION_GATES);
  });

  describe('hasGateBinding', () => {
    it('returns true for configured transition points', () => {
      expect(trigger.hasGateBinding('implement', 'review')).toBe(true);
      expect(trigger.hasGateBinding('review', 'regression')).toBe(true);
      expect(trigger.hasGateBinding('deploy', 'verify')).toBe(true);
    });

    it('returns false for unconfigured transition points', () => {
      expect(trigger.hasGateBinding('spec', 'implement')).toBe(false);
      expect(trigger.hasGateBinding('verify', 'ledger')).toBe(false);
    });
  });

  describe('getGateType', () => {
    it('returns gate type for configured transitions', () => {
      expect(trigger.getGateType('implement', 'review')).toBe('ImplementationReviewGate');
      expect(trigger.getGateType('review', 'regression')).toBe('ReviewBundleCompleteness');
      expect(trigger.getGateType('deploy', 'verify')).toBe('DeployArtifactCompleteness');
    });

    it('returns undefined for unconfigured transitions', () => {
      expect(trigger.getGateType('spec', 'implement')).toBeUndefined();
    });
  });

  describe('evaluate (AC-D01.1, AC-D01.2, AC-D01.5)', () => {
    it('returns null for transitions without gate binding', () => {
      const result = trigger.evaluate('spec' as StageId, 'implement' as StageId, []);
      expect(result).toBeNull();
    });

    it('passes when no rules are registered (empty gate = pass)', () => {
      const artifacts = [createArtifact()];
      const result = trigger.evaluate('implement', 'review', artifacts);

      expect(result).not.toBeNull();
      expect(result!.passed).toBe(true);
      expect(result!.record.gateType).toBe('ImplementationReviewGate');
      expect(result!.record.fixTasks).toHaveLength(0);
    });

    it('rejects and generates fixTasks when gate rules fail (AC-D01.3)', () => {
      // Register a blocker rule
      gateEngine.registerRule({
        id: 'test-rule',
        appliesTo: ['implement'],
        evaluate: () => ({
          pass: false,
          message: 'Missing test coverage for AC-05.1',
          severity: 'blocker',
        }),
      });

      const artifacts = [createArtifact()];
      const result = trigger.evaluate('implement', 'review', artifacts);

      expect(result).not.toBeNull();
      expect(result!.passed).toBe(false);
      expect(result!.record.fixTasks.length).toBeGreaterThan(0);
      expect(result!.record.fixTasks[0]!.description).toContain('Missing test coverage');
      expect(result!.record.fixTasks[0]!.severity).toMatch(/P[012]/);
    });

    it('records trigger timestamp and transition point (AC-D01.6)', () => {
      const result = trigger.evaluate('implement', 'review', [createArtifact()]);

      expect(result!.record.triggeredAt).toBeDefined();
      expect(result!.record.transitionPoint).toBe('implement→review');
      expect(result!.record.fromStage).toBe('implement');
      expect(result!.record.toStage).toBe('review');
    });

    it('includes score from gate evaluation', () => {
      const result = trigger.evaluate('implement', 'review', [createArtifact()]);
      expect(result!.record.score).toBeGreaterThanOrEqual(0);
      expect(result!.record.score).toBeLessThanOrEqual(1);
    });
  });
});

// ── FR-D02: SpecGapDetector ─────────────────────────────────────

describe('SpecGapDetector (FR-D02)', () => {
  let detector: SpecGapDetector;

  beforeEach(() => {
    detector = new SpecGapDetector();
  });

  describe('scan (AC-D02.1, AC-D02.2, AC-D02.7)', () => {
    it('returns no gaps when all modules are covered', async () => {
      const frRefs: FrReference[] = [
        { frId: 'FR-01', summary: 'Pipeline routing and classification', keywords: ['pipeline', 'routing', 'classification'] },
        { frId: 'FR-02', summary: 'Gate evaluation engine', keywords: ['gate', 'evaluation', 'engine'] },
      ];
      const modules: ImplementationModule[] = [
        { path: 'src/router/', description: 'Pipeline routing module', keywords: ['pipeline', 'routing'] },
        { path: 'src/gate/', description: 'Gate evaluation engine', keywords: ['gate', 'evaluation'] },
      ];

      const report = await detector.scan('pipeline-001', frRefs, modules);

      expect(report.hasGaps).toBe(false);
      expect(report.uncoveredModules).toHaveLength(0);
      expect(report.pipelineId).toBe('pipeline-001');
      expect(report.severity).toBe('advisory'); // AC-D02.5
    });

    it('detects uncovered modules (AC-D02.2)', async () => {
      const frRefs: FrReference[] = [
        { frId: 'FR-01', summary: 'Pipeline routing', keywords: ['pipeline', 'routing'] },
      ];
      const modules: ImplementationModule[] = [
        { path: 'src/router/', description: 'Pipeline routing module', keywords: ['pipeline', 'routing'] },
        { path: 'src/analytics/', description: 'Usage analytics tracker', keywords: ['analytics', 'tracker', 'usage'] },
      ];

      const report = await detector.scan('pipeline-001', frRefs, modules);

      expect(report.hasGaps).toBe(true);
      expect(report.uncoveredModules).toHaveLength(1);
      expect(report.uncoveredModules[0]!.path).toBe('src/analytics/');
      expect(report.uncoveredModules[0]!.suggestedFr).toContain('analytics');
    });

    it('severity is always advisory (AC-D02.5)', async () => {
      const report = await detector.scan('pipeline-001', [], [
        { path: 'src/x/', description: 'Unknown module', keywords: ['unknown'] },
      ]);
      expect(report.severity).toBe('advisory');
    });

    it('includes analyzedAt timestamp', async () => {
      const report = await detector.scan('pipeline-001', [], []);
      expect(report.analyzedAt).toBeDefined();
      expect(new Date(report.analyzedAt).getTime()).not.toBeNaN();
    });
  });

  describe('preCheck (AC-D02.4)', () => {
    it('returns covered when requirement matches existing FRs', async () => {
      const frRefs: FrReference[] = [
        { frId: 'FR-01', summary: 'Pipeline routing and stage classification', keywords: ['pipeline', 'routing', 'stage', 'classification'] },
      ];

      const result = await detector.preCheck(frRefs, 'Add pipeline routing for new stage');
      expect(result.covered).toBe(true);
    });

    it('returns not covered when requirement is novel', async () => {
      const frRefs: FrReference[] = [
        { frId: 'FR-01', summary: 'Pipeline routing', keywords: ['pipeline', 'routing'] },
      ];

      const result = await detector.preCheck(frRefs, 'Add machine learning model training');
      expect(result.covered).toBe(false);
      expect(result.suggestedAction).toContain('specify');
    });
  });

  describe('extractModulesFromArtifacts', () => {
    it('extracts implementation artifacts as modules', () => {
      const artifacts: ArtifactRef[] = [
        createArtifact({ id: 'a1', type: 'implement-code', path: 'src/drive/engine.ts' }),
        createArtifact({ id: 'a2', type: 'test-result', path: 'test-output.json' }),
      ];

      const modules = detector.extractModulesFromArtifacts(artifacts);
      expect(modules).toHaveLength(1);
      expect(modules[0]!.path).toBe('src/drive/engine.ts');
    });
  });

  describe('frListToReferences', () => {
    it('converts simple FR list to FrReference format', () => {
      const frList = [
        { frId: 'FR-01', summary: 'Pipeline routing and classification' },
        { frId: 'FR-02', summary: 'Gate evaluation engine' },
      ];

      const refs = detector.frListToReferences(frList);
      expect(refs).toHaveLength(2);
      expect(refs[0]!.frId).toBe('FR-01');
      expect(refs[0]!.summary).toBe('Pipeline routing and classification');
    });
  });
});

// ── FR-D03: PostReleaseAutoScanner ──────────────────────────────

describe('PostReleaseAutoScanner (FR-D03)', () => {
  let scanner: PostReleaseAutoScanner;

  beforeEach(() => {
    scanner = new PostReleaseAutoScanner(3);
  });

  describe('scan (AC-D03.1, AC-D03.2)', () => {
    it('returns canComplete=true when all FRs are covered (AC-D03.3)', () => {
      const result = scanner.scan({
        pipelineId: 'pipeline-001',
        projectSlug: 'test-project',
        frList: [{ frId: 'FR-01', summary: 'Routing' }],
        deployArtifacts: [
          createArtifact({ id: 'fr-01-impl', type: 'implement-code', metadata: { frId: 'fr-01' } }),
          createArtifact({ id: 'fr-01-verify', type: 'verify-smoke', metadata: { frId: 'fr-01' } }),
        ],
      });

      expect(result.canComplete).toBe(true);
      expect(result.fixTasks).toHaveLength(0);
      expect(result.backEdge).toBeNull();
    });

    it('returns canComplete=false with fixTasks when gaps exist (AC-D03.4)', () => {
      const result = scanner.scan({
        pipelineId: 'pipeline-001',
        projectSlug: 'test-project',
        frList: [
          { frId: 'FR-01', summary: 'Routing' },
          { frId: 'FR-02', summary: 'Gate engine' },
        ],
        deployArtifacts: [], // No artifacts = all missing
      });

      expect(result.canComplete).toBe(false);
      expect(result.fixTasks.length).toBeGreaterThan(0);
    });

    it('generates back-edge record when gaps > 0 (AC-D03.5)', () => {
      const result = scanner.scan({
        pipelineId: 'pipeline-001',
        projectSlug: 'test-project',
        frList: [{ frId: 'FR-01', summary: 'Routing' }],
        deployArtifacts: [], // Missing
      });

      expect(result.backEdge).not.toBeNull();
      expect(result.backEdge!.cycle).toBe(1);
      expect(result.backEdge!.fixTasks.length).toBeGreaterThan(0);
      expect(result.backEdge!.triggeredAt).toBeDefined();
    });

    it('tracks cycle number', () => {
      const input = {
        pipelineId: 'pipeline-001',
        projectSlug: 'test-project',
        frList: [{ frId: 'FR-01', summary: 'Routing' }],
        deployArtifacts: [],
      };

      const result1 = scanner.scan(input, 1);
      const result2 = scanner.scan(input, 2);

      expect(result1.cycle).toBe(1);
      expect(result2.cycle).toBe(2);
    });
  });

  describe('buildBackEdgeStageQueue (AC-D03.6)', () => {
    it('returns correct stage sequence for back-edge', () => {
      const queue = scanner.buildBackEdgeStageQueue();
      expect(queue).toEqual([
        'implement',
        'review',
        'deploy',
        'verify',
        'post-release-validation',
      ]);
    });
  });

  describe('createCycleRecord (AC-D03.7)', () => {
    it('creates converged record when gaps = 0', () => {
      const record = scanner.createCycleRecord(1, [], true);
      expect(record.cycle).toBe(1);
      expect(record.result).toBe('converged');
    });

    it('creates gap-remaining record when gaps > 0 and under max', () => {
      const fixTasks = [{ frId: 'FR-01', description: 'Fix routing' }];
      const record = scanner.createCycleRecord(1, fixTasks, false);
      expect(record.result).toBe('gap-remaining');
      expect(record.triggeredBy).toContain('FR-01');
      expect(record.newTasks).toContain('Fix routing');
    });

    it('creates escalated record when at max cycles', () => {
      const fixTasks = [{ frId: 'FR-01', description: 'Fix routing' }];
      const record = scanner.createCycleRecord(3, fixTasks, false);
      expect(record.result).toBe('escalated');
    });
  });

  describe('canContinueCycle', () => {
    it('returns true when under max', () => {
      expect(scanner.canContinueCycle(1)).toBe(true);
      expect(scanner.canContinueCycle(2)).toBe(true);
    });

    it('returns false when at or over max', () => {
      expect(scanner.canContinueCycle(3)).toBe(false);
      expect(scanner.canContinueCycle(4)).toBe(false);
    });
  });
});

// ── ProactiveDriveEngine (integration) ──────────────────────────

describe('ProactiveDriveEngine', () => {
  let gateEngine: GateEngine;
  let ledger: EventLedger;
  let engine: ProactiveDriveEngine;
  let emittedEvents: Array<{ type: string; payload: unknown }>;

  beforeEach(() => {
    gateEngine = new GateEngine();
    ledger = new EventLedger();
    engine = new ProactiveDriveEngine(gateEngine, ledger);
    emittedEvents = [];
    engine.onEvent((type, payload) => {
      emittedEvents.push({ type, payload });
    });
  });

  describe('FR-D01 integration: gate auto-trigger on stage completion', () => {
    it('triggers gate at implement→review transition (AC-D01.1)', async () => {
      const result = await engine.onStageCompleted(
        'pipeline-001',
        'implement',
        'review',
        [createArtifact()],
      );

      expect(result.gateResult).toBeDefined();
      expect(result.gateResult!.passed).toBe(true);
      expect(result.emittedEvents.some((e) => e.type === 'gate-auto-triggered')).toBe(true);
    });

    it('blocks transition when gate rejects (AC-D01.4)', async () => {
      gateEngine.registerRule({
        id: 'blocker-rule',
        appliesTo: ['implement'],
        evaluate: () => ({ pass: false, message: 'Tests missing', severity: 'blocker' }),
      });

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'implement',
        'review',
        [createArtifact()],
      );

      expect(result.blocked).toBe(true);
      expect(result.gateResult!.passed).toBe(false);
      expect(result.gateResult!.record.fixTasks.length).toBeGreaterThan(0);
    });

    it('does not trigger for transitions without gate binding', async () => {
      const result = await engine.onStageCompleted(
        'pipeline-001',
        'spec',
        'implement',
        [createArtifact()],
      );

      expect(result.gateResult).toBeUndefined();
      expect(result.blocked).toBe(false);
    });

    it('emits event to registered listeners (AC-D01.4)', async () => {
      await engine.onStageCompleted('pipeline-001', 'implement', 'review', [createArtifact()]);
      expect(emittedEvents.some((e) => e.type === 'gate-auto-triggered')).toBe(true);
    });

    it('records gate trigger in ledger (AC-D01.6)', async () => {
      await engine.onStageCompleted('pipeline-001', 'implement', 'review', [createArtifact()]);
      const history = ledger.getHistory('pipeline-001');
      expect(history.length).toBeGreaterThan(0);
      expect(history.some((e) => e.detail?.['driveEvent'] === 'gate-auto-triggered')).toBe(true);
    });

    it('works without listeners (AC-D01.7 degradation)', async () => {
      const engineNoListeners = new ProactiveDriveEngine(gateEngine, ledger);
      // Should not throw
      const result = await engineNoListeners.onStageCompleted(
        'pipeline-001',
        'implement',
        'review',
        [createArtifact()],
      );
      expect(result.gateResult).toBeDefined();
    });
  });

  describe('FR-D02 integration: spec gap detection at implement completion', () => {
    it('detects spec gaps when context is provided (AC-D02.1)', async () => {
      const context: DriveContext = {
        frReferences: [
          { frId: 'FR-01', summary: 'Pipeline routing', keywords: ['pipeline', 'routing'] },
        ],
        implementationModules: [
          { path: 'src/router/', description: 'Pipeline routing', keywords: ['pipeline', 'routing'] },
          { path: 'src/analytics/', description: 'Usage analytics', keywords: ['analytics', 'usage'] },
        ],
      };

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'implement',
        'review',
        [createArtifact()],
        context,
      );

      expect(result.specGapReport).toBeDefined();
      expect(result.specGapReport!.hasGaps).toBe(true);
      expect(result.specGapReport!.uncoveredModules).toHaveLength(1);
    });

    it('emits spec-gap-detected event when gaps found (AC-D02.3)', async () => {
      const context: DriveContext = {
        frReferences: [
          { frId: 'FR-01', summary: 'Routing', keywords: ['routing'] },
        ],
        implementationModules: [
          { path: 'src/unknown/', description: 'Unknown feature', keywords: ['unknown', 'feature'] },
        ],
      };

      await engine.onStageCompleted('pipeline-001', 'implement', 'review', [createArtifact()], context);
      expect(emittedEvents.some((e) => e.type === 'spec-gap-detected')).toBe(true);
    });

    it('does not emit when no gaps found', async () => {
      const context: DriveContext = {
        frReferences: [
          { frId: 'FR-01', summary: 'Pipeline routing module', keywords: ['pipeline', 'routing'] },
        ],
        implementationModules: [
          { path: 'src/router/', description: 'Pipeline routing module', keywords: ['pipeline', 'routing'] },
        ],
      };

      await engine.onStageCompleted('pipeline-001', 'implement', 'review', [createArtifact()], context);
      expect(emittedEvents.some((e) => e.type === 'spec-gap-detected')).toBe(false);
    });

    it('does not block pipeline (AC-D02.5)', async () => {
      const context: DriveContext = {
        frReferences: [],
        implementationModules: [
          { path: 'src/x/', description: 'Uncovered', keywords: ['uncovered'] },
        ],
      };

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'implement',
        'review',
        [createArtifact()],
        context,
      );

      // Spec gap is advisory, should not block
      expect(result.blocked).toBe(false);
    });

    it('only triggers at implement stage completion', async () => {
      const context: DriveContext = {
        frReferences: [],
        implementationModules: [
          { path: 'src/x/', description: 'Uncovered', keywords: ['uncovered'] },
        ],
      };

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'review',
        'regression',
        [createArtifact()],
        context,
      );

      expect(result.specGapReport).toBeUndefined();
    });
  });

  describe('FR-D03 integration: post-release auto scan at verify completion', () => {
    it('triggers post-release scan when verify completes (AC-D03.1)', async () => {
      const context: DriveContext = {
        postReleaseInput: {
          pipelineId: 'pipeline-001',
          projectSlug: 'test',
          frList: [{ frId: 'FR-01', summary: 'Routing' }],
          deployArtifacts: [
            createArtifact({ id: 'fr-01-impl', type: 'implement-code', metadata: { frId: 'fr-01' } }),
            createArtifact({ id: 'fr-01-verify', type: 'verify-smoke', metadata: { frId: 'fr-01' } }),
          ],
        },
      };

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'verify',
        'post-release-validation',
        [createArtifact()],
        context,
      );

      expect(result.postReleaseScanResult).toBeDefined();
      expect(result.postReleaseScanResult!.canComplete).toBe(true);
    });

    it('emits post-release-passed when gaps = 0 (AC-D03.3)', async () => {
      const context: DriveContext = {
        postReleaseInput: {
          pipelineId: 'pipeline-001',
          projectSlug: 'test',
          frList: [{ frId: 'FR-01', summary: 'Routing' }],
          deployArtifacts: [
            createArtifact({ id: 'fr-01-impl', type: 'implement-code', metadata: { frId: 'fr-01' } }),
            createArtifact({ id: 'fr-01-verify', type: 'verify-smoke', metadata: { frId: 'fr-01' } }),
          ],
        },
      };

      await engine.onStageCompleted('pipeline-001', 'verify', 'post-release-validation', [], context);
      expect(emittedEvents.some((e) => e.type === 'post-release-passed')).toBe(true);
    });

    it('emits post-release-gap-found with fixTasks when gaps > 0 (AC-D03.4)', async () => {
      const context: DriveContext = {
        postReleaseInput: {
          pipelineId: 'pipeline-001',
          projectSlug: 'test',
          frList: [{ frId: 'FR-01', summary: 'Routing' }],
          deployArtifacts: [], // No artifacts = gaps
        },
      };

      await engine.onStageCompleted('pipeline-001', 'verify', 'post-release-validation', [], context);
      expect(emittedEvents.some((e) => e.type === 'post-release-gap-found')).toBe(true);
    });

    it('triggers back-edge when gaps > 0 (AC-D03.5)', async () => {
      const context: DriveContext = {
        postReleaseInput: {
          pipelineId: 'pipeline-001',
          projectSlug: 'test',
          frList: [{ frId: 'FR-01', summary: 'Routing' }],
          deployArtifacts: [],
        },
      };

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'verify',
        'post-release-validation',
        [],
        context,
      );

      expect(result.postReleaseScanResult!.backEdge).not.toBeNull();
      expect(emittedEvents.some((e) => e.type === 'back-edge-triggered')).toBe(true);
    });

    it('tracks PDCA cycles across multiple scans (AC-D03.7)', async () => {
      const context: DriveContext = {
        postReleaseInput: {
          pipelineId: 'pipeline-001',
          projectSlug: 'test',
          frList: [{ frId: 'FR-01', summary: 'Routing' }],
          deployArtifacts: [],
        },
      };

      await engine.onStageCompleted('pipeline-001', 'verify', 'post-release-validation', [], context);
      await engine.onStageCompleted('pipeline-001', 'verify', 'post-release-validation', [], context);

      const records = engine.getPdcaCycleRecords('pipeline-001');
      expect(records).toHaveLength(2);
      expect(records[0]!.cycle).toBe(1);
      expect(records[1]!.cycle).toBe(2);
    });

    it('does not trigger for non-verify stages', async () => {
      const context: DriveContext = {
        postReleaseInput: {
          pipelineId: 'pipeline-001',
          projectSlug: 'test',
          frList: [{ frId: 'FR-01', summary: 'Routing' }],
          deployArtifacts: [],
        },
      };

      const result = await engine.onStageCompleted(
        'pipeline-001',
        'implement',
        'review',
        [],
        context,
      );

      expect(result.postReleaseScanResult).toBeUndefined();
    });
  });

  describe('getBackEdgeStageQueue (AC-D03.6)', () => {
    it('returns the correct back-edge stage sequence', () => {
      const queue = engine.getBackEdgeStageQueue();
      expect(queue).toEqual([
        'implement',
        'review',
        'deploy',
        'verify',
        'post-release-validation',
      ]);
    });
  });

  describe('getSpecGapDetector (AC-D02.4 pre-check access)', () => {
    it('exposes the spec gap detector for pre-checks', () => {
      const detector = engine.getSpecGapDetector();
      expect(detector).toBeInstanceOf(SpecGapDetector);
    });
  });
});
