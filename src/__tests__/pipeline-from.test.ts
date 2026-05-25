/**
 * Tests for FR-27: Flexible Stage Entry (pipeline-from).
 *
 * Covers all ACs: AC-27.1 through AC-27.9.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createPipelineFromStage,
  isValidEntryStage,
  isGateStage,
  parseFromLabel,
  parseSevoFromCommand,
  computeSkippedStages,
  VALID_ENTRY_STAGES,
  GATE_STAGES,
  type PipelineFromOptions,
  type PipelineFromRequest,
} from '../pipeline/pipeline-from.js';
import type { PipelineInstance, PipelineTask, StageId } from '../types/index.js';
import type { InstanceStore } from '../pipeline/pipeline-create.js';

// ── Test Helpers ────────────────────────────────────────────────

function createMockStore(): InstanceStore & { saved: PipelineInstance[] } {
  const saved: PipelineInstance[] = [];
  return {
    saved,
    listByProject: () => [],
    save: (instance: PipelineInstance) => { saved.push(instance); },
  };
}

function createMockTask(overrides?: Partial<PipelineTask>): PipelineTask {
  return {
    taskId: 'test-task-001',
    title: 'Test task',
    description: 'A test task for FR-27',
    scope: {},
    ...overrides,
  };
}

function createDefaultOptions(store?: InstanceStore): PipelineFromOptions {
  return {
    store: store ?? createMockStore(),
    workspaceRoot: '/tmp/test-workspace',
    projectExists: () => true,
    specFileExists: () => true,
    contractFileExists: () => true,
    now: new Date('2026-05-05T10:00:00Z'),
  };
}

function createRequest(overrides?: Partial<PipelineFromRequest>): PipelineFromRequest {
  return {
    projectSlug: 'my-project',
    stage: 'implement',
    task: createMockTask(),
    ...overrides,
  };
}

// ── AC-27.1: Stage Validation ───────────────────────────────────

describe('AC-27.1: Stage validation', () => {
  it('accepts all valid entry stages', async () => {
    for (const stage of VALID_ENTRY_STAGES) {
      expect(isValidEntryStage(stage)).toBe(true);
    }
  });

  it('rejects gate stages', async () => {
    for (const stage of GATE_STAGES) {
      expect(isGateStage(stage)).toBe(true);
      expect(isValidEntryStage(stage)).toBe(false);
    }
  });

  it('rejects invalid stage identifiers', async () => {
    expect(isValidEntryStage('nonexistent')).toBe(false);
    expect(isValidEntryStage('smoke-test')).toBe(false);
    expect(isValidEntryStage('ledger')).toBe(false);
    expect(isValidEntryStage('regression')).toBe(false);
  });

  it('returns error for gate stage entry', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'spec-review-gate' }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GATE_STAGE_NOT_ALLOWED');
      expect(result.error.message).toContain('gate stage');
    }
  });

  it('returns error for invalid stage', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'smoke-test' }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STAGE');
    }
  });
});

// ── AC-27.2: Skipped Stages ─────────────────────────────────────

describe('AC-27.2: Skipped stages', () => {
  it('marks all stages before entry point as skipped', async () => {
    const skipped = computeSkippedStages('implement');
    const skippedIds = skipped.map(s => s.stage);

    expect(skippedIds).toContain('spec');
    expect(skippedIds).toContain('spec-review-gate');
    expect(skippedIds).toContain('contract');
    expect(skippedIds).toContain('contract-review-gate');
    expect(skippedIds).not.toContain('implement');
    expect(skippedIds).not.toContain('review');
  });

  it('includes skip reason in each skipped stage', async () => {
    const skipped = computeSkippedStages('review');
    for (const s of skipped) {
      expect(s.reason).toContain('用户指定从 review 开始');
    }
  });

  it('skips nothing when entering from spec', async () => {
    const skipped = computeSkippedStages('spec');
    expect(skipped).toHaveLength(0);
  });

  it('pipeline instance has skipped stages in routing result', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const skippedIds = result.value.routingResult.skippedStages.map(s => s.stage);
      expect(skippedIds).toContain('spec');
      expect(skippedIds).toContain('contract');
      expect(skippedIds).not.toContain('implement');
    }
  });
});

// ── AC-27.3: Subsequent stages proceed normally ─────────────────

describe('AC-27.3: Subsequent stages proceed normally', () => {
  it('required stages include entry stage and all after it', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const required = result.value.routingResult.requiredStages;
      expect(required).toContain('implement');
      expect(required).toContain('review');
      expect(required).not.toContain('spec');
      expect(required).not.toContain('contract');
    }
  });
});

// ── AC-27.4a: Project must exist for non-spec entry ─────────────

describe('AC-27.4a: Project existence check', () => {
  it('rejects non-spec entry when project does not exist', async () => {
    const store = createMockStore();
    const options = {
      ...createDefaultOptions(store),
      projectExists: () => false,
    };

    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      options,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PROJECT_NOT_FOUND');
      expect(result.error.message).toContain('does not exist');
    }
  });

  it('allows spec entry even when project does not exist', async () => {
    const store = createMockStore();
    const options = {
      ...createDefaultOptions(store),
      projectExists: () => false,
    };

    // spec entry delegates to FR-12, which doesn't check projectExists
    const result = await createPipelineFromStage(
      createRequest({ stage: 'spec' }),
      options,
    );

    expect(result.ok).toBe(true);
  });
});

// ── AC-27.4b: Spec file must exist when skipping spec ───────────

describe('AC-27.4b: Spec file requirement', () => {
  it('rejects when spec file is missing and skipping spec stage', async () => {
    const store = createMockStore();
    const options = {
      ...createDefaultOptions(store),
      specFileExists: () => false,
    };

    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      options,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SPEC_FILE_MISSING');
      expect(result.error.message).toContain('product-requirements.md');
    }
  });
});

// ── AC-27.4c: Contract file warning ─────────────────────────────

describe('AC-27.4c: Contract file warning', () => {
  it('emits warning when contract file is missing and skipping contract', async () => {
    const store = createMockStore();
    const onWarning = vi.fn();
    const options = {
      ...createDefaultOptions(store),
      contractFileExists: () => false,
      onWarning,
    };

    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      options,
    );

    expect(result.ok).toBe(true);
    expect(onWarning).toHaveBeenCalledWith(
      expect.stringContaining('No architecture/contract file found'),
    );
  });

  it('does not warn when entering at contract stage (not skipping it)', async () => {
    const store = createMockStore();
    const onWarning = vi.fn();
    const options = {
      ...createDefaultOptions(store),
      contractFileExists: () => false,
      onWarning,
    };

    // Use L1+ scope so 'contract' is in requiredStages
    const result = await createPipelineFromStage(
      createRequest({ stage: 'contract', task: createMockTask({ scope: { estimatedFiles: 5 } }) }),
      options,
    );

    expect(result.ok).toBe(true);
    expect(onWarning).not.toHaveBeenCalled();
  });
});

// ── AC-27.5: End-to-end flexible entry ──────────────────────────

describe('AC-27.5: End-to-end flexible entry', () => {
  it('creates pipeline from implement stage for existing project', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({
        projectSlug: 'myproject',
        stage: 'implement',
        task: createMockTask({ title: 'Implement feature X' }),
      }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectSlug).toBe('myproject');
      expect(result.value.instanceId).toContain('myproject');
      expect(result.value.routingResult.requiredStages).toContain('implement');
      expect(result.value.routingResult.requiredStages).toContain('review');
      expect(result.value.routingResult.requiredStages).not.toContain('spec');
    }
  });
});

// ── AC-27.6: Label parsing ──────────────────────────────────────

describe('AC-27.6: Label parsing', () => {
  it('parses from:<stage> from label', async () => {
    expect(parseFromLabel('from:implement')).toBe('implement');
    expect(parseFromLabel('sevo:myproject:implement:1 from:review')).toBe('review');
    expect(parseFromLabel('task:fix-bug from:deploy')).toBe('deploy');
  });

  it('returns null for labels without from: prefix', async () => {
    expect(parseFromLabel('sevo:myproject:implement:1')).toBeNull();
    expect(parseFromLabel('regular-label')).toBeNull();
    expect(parseFromLabel('')).toBeNull();
  });

  it('parses sevo:from command format', async () => {
    const parsed = parseSevoFromCommand('sevo:from myproject implement');
    expect(parsed).toEqual({ projectSlug: 'myproject', stage: 'implement' });
  });

  it('parses sevo:from with hyphenated project slug', async () => {
    const parsed = parseSevoFromCommand('sevo:from my-cool-project review');
    expect(parsed).toEqual({ projectSlug: 'my-cool-project', stage: 'review' });
  });

  it('returns null for invalid sevo:from format', async () => {
    expect(parseSevoFromCommand('sevo:create myproject')).toBeNull();
    expect(parseSevoFromCommand('from myproject implement')).toBeNull();
    expect(parseSevoFromCommand('')).toBeNull();
  });
});

// ── AC-27.7: spec entry delegates to FR-12 ──────────────────────

describe('AC-27.7: spec entry delegates to FR-12', () => {
  it('sevo:from <project> spec creates pipeline same as sevo:create', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'spec' }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // When entering from spec, no stages are skipped (full pipeline)
      const skippedByFR27 = result.value.routingResult.skippedStages.filter(
        s => s.reason.includes('用户指定从'),
      );
      expect(skippedByFR27).toHaveLength(0);
    }
  });
});

// ── AC-27.8: Active pipeline conflict ───────────────────────────

describe('AC-27.8: Active pipeline conflict', () => {
  it('rejects when project has active pipeline', async () => {
    const store: InstanceStore = {
      listByProject: () => [{
        instanceId: 'fr-my-project-20260505-001',
        projectSlug: 'my-project',
        status: 'active',
        routingResult: {
          taskId: 'existing',
          level: 'L1',
          requiredStages: [],
          skippedStages: [],
          matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
        },
        directoryStructure: {
          projectRoot: '/tmp',
          createdDirs: [],
          existingDirs: [],
          createdFiles: [],
          existingFiles: [],
          complete: true,
        },
        createdAt: '2026-05-05T00:00:00Z',
        updatedAt: '2026-05-05T00:00:00Z',
      }],
      save: () => {},
    };

    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      { ...createDefaultOptions(), store },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACTIVE_INSTANCE_EXISTS');
    }
  });
});

// ── AC-27.9: Tier stage compatibility ───────────────────────────

describe('AC-27.9: Tier stage compatibility', () => {
  it('rejects when stage is not in tier stage set', async () => {
    const store = createMockStore();
    const options = {
      ...createDefaultOptions(store),
      getTierStages: () => ['implement', 'review', 'verify'] as StageId[],
    };

    const result = await createPipelineFromStage(
      createRequest({ stage: 'deploy' }),
      options,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('STAGE_NOT_IN_TIER');
      expect(result.error.message).toContain('not available for this task\'s tier');
    }
  });

  it('allows when stage is in tier stage set', async () => {
    const store = createMockStore();
    const options = {
      ...createDefaultOptions(store),
      getTierStages: () => ['implement', 'review', 'deploy', 'verify'] as StageId[],
    };

    const result = await createPipelineFromStage(
      createRequest({ stage: 'implement' }),
      options,
    );

    expect(result.ok).toBe(true);
  });

  it('allows any stage when getTierStages returns null (no restriction)', async () => {
    const store = createMockStore();
    const options = {
      ...createDefaultOptions(store),
      getTierStages: () => null,
    };

    // Use L1+ scope so 'deploy' is in requiredStages
    const result = await createPipelineFromStage(
      createRequest({ stage: 'deploy', task: createMockTask({ scope: { estimatedFiles: 5 } }) }),
      options,
    );

    expect(result.ok).toBe(true);
  });
});

// ── computeSkippedStages edge cases ─────────────────────────────

describe('computeSkippedStages', () => {
  it('skips all stages before deploy', async () => {
    const skipped = computeSkippedStages('deploy');
    const skippedIds = skipped.map(s => s.stage);

    expect(skippedIds).toContain('spec');
    expect(skippedIds).toContain('implement');
    expect(skippedIds).toContain('review');
    expect(skippedIds).toContain('publish-generalization-gate');
    expect(skippedIds).not.toContain('deploy');
    expect(skippedIds).not.toContain('verify');
  });

  it('skips only spec for contract entry', async () => {
    const skipped = computeSkippedStages('contract');
    const skippedIds = skipped.map(s => s.stage);

    expect(skippedIds).toContain('spec');
    expect(skippedIds).toContain('spec-review-gate');
    // test-case-authoring, ux-acceptance-authoring, commercial-acceptance-authoring
    // come between spec-review-gate and contract in ALL_STAGES
    expect(skippedIds).toContain('test-case-authoring');
    expect(skippedIds).not.toContain('contract');
  });
});

// ── P1 Fix: targetStageId not in requiredStages ─────────────────

describe('P1: targetStageId not in requiredStages', () => {
  it('returns error when target stage is not in pipeline required stages (L0 routing)', async () => {
    // L0 must be explicitly opted-in (FR-2 AC3); only contains: implement, review, regression, verify, ledger.
    // 'contract' is not in L0 requiredStages.
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'contract', task: createMockTask({ scope: { userExplicitL0: true } }) }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('STAGE_NOT_IN_TIER');
      expect(result.error.message).toContain('not in this pipeline\'s stage list');
    }
  });

  it('succeeds when target stage is in pipeline required stages (L1+ routing)', async () => {
    const store = createMockStore();
    const result = await createPipelineFromStage(
      createRequest({ stage: 'contract', task: createMockTask({ scope: { estimatedFiles: 5 } }) }),
      createDefaultOptions(store),
    );

    expect(result.ok).toBe(true);
  });
});
