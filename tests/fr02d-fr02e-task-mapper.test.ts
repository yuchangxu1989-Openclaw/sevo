import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, getStageMapping } from '../task-mapper.js';
import { queueActiveStagesForFr19, QUICKSTART_STAGES, TIER2_STAGES, CANONICAL_14_STAGES } from '../index.js';

describe('FR-02d / FR-02e task mapper integration', () => {
  const state = {
    pipelineId: 'sevo-test-pipeline',
    level: 'L2+',
    requiredStages: ['spec', 'spec-review-gate', 'ux-interaction-design', 'architecture-design', 'contract', 'contract-review-gate', 'implement'],
    stages: {
      spec: {
        status: 'passed',
        artifacts: [{ path: 'projects/demo/docs/product-requirements.md' }],
      },
      'ux-interaction-design': {
        status: 'passed',
        metadata: { pmReviewStatus: 'passed' },
        artifacts: [{ path: 'projects/demo/docs/ux/interaction-design.md' }],
      },
      'architecture-design': {
        status: 'passed',
        artifacts: [{ path: 'projects/demo/docs/architecture/architecture.md' }],
      },
      contract: {
        status: 'passed',
        artifacts: [{ path: 'projects/demo/docs/architecture/arc42-architecture.md' }],
      },
    },
  };

  it('maps ux-interaction-design to UX role and correct timeout', () => {
    const mapping = getStageMapping('ux-interaction-design');
    expect(mapping).toMatchObject({ tier: 'ux', timeout: 1800 });
  });

  it('maps architecture-design to SA role and correct timeout', () => {
    const mapping = getStageMapping('architecture-design');
    expect(mapping).toMatchObject({ tier: 'arch', timeout: 3600 });
  });

  it('builds ux-interaction-design prompt with standard injection', () => {
    const prompt = buildTaskPrompt('ux-interaction-design', state, 'demo', 'projects/demo');
    expect(prompt).toContain('Role constraint: this stage must be executed by a UX role');
    expect(prompt).toContain('Output: projects/demo/docs/ux/interaction-design.md');
    expect(prompt).toContain('projects/sevo/docs/interaction-design-standard.md');
    expect(prompt).toContain('authorRole=ux');
  });

  it('builds architecture-design prompt with UX artifact reference and standard injection', () => {
    const prompt = buildTaskPrompt('architecture-design', state, 'demo', 'projects/demo');
    expect(prompt).toContain('Reference (ux-interaction-design): projects/demo/docs/ux/interaction-design.md');
    expect(prompt).toContain('Output: projects/demo/docs/architecture/architecture.md');
    expect(prompt).toContain('projects/sevo/docs/architecture-standard.md');
    expect(prompt).toContain('authorRole=sa');
  });



  it('injects UX and architecture design artifacts into contract review gate prompt', () => {
    const prompt = buildTaskPrompt('contract-review-gate', state, 'demo', 'projects/demo');
    expect(prompt).toContain('Reference (ux-interaction-design): projects/demo/docs/ux/interaction-design.md');
    expect(prompt).toContain('Reference (architecture-design): projects/demo/docs/architecture/architecture.md');
    expect(prompt).toContain('If UX Interaction Design artifact exists: check whether the contract carries the user flows');
    expect(prompt).toContain('If Architecture Design artifact exists: check whether the contract carries the API interfaces');
  });

  it('injects UX and architecture design artifacts into implement prompt as mandatory references', () => {
    const prompt = buildTaskPrompt('implement', state, 'demo', 'projects/demo');
    expect(prompt).toContain('Reference (ux-interaction-design): projects/demo/docs/ux/interaction-design.md');
    expect(prompt).toContain('Reference (architecture-design): projects/demo/docs/architecture/architecture.md');
    expect(prompt).toContain('If a UX Interaction Design artifact exists, it is a mandatory input');
    expect(prompt).toContain('If an Architecture Design artifact exists, it is a mandatory input');
  });

  it('blocks implement when architecture design is not passed', () => {
    const blockedState = {
      requiredStages: ['ux-interaction-design', 'architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'ux-interaction-design': { status: 'passed', metadata: { pmReviewStatus: 'passed' } },
        'architecture-design': { status: 'active' },
      },
    };

    const activeStages = queueActiveStagesForFr19('pipe-design-blocked', blockedState);

    expect(blockedState.stages.implement.status).toBe('blocked');
    expect(blockedState.stages.implement.blockReason).toContain('architecture-design');
    expect(activeStages).toEqual(['architecture-design']);
  });

  it('blocks implement when UX PM review is not passed', () => {
    const blockedState = {
      requiredStages: ['ux-interaction-design', 'architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'ux-interaction-design': { status: 'passed', metadata: { pmReviewStatus: 'pending' } },
        'architecture-design': { status: 'passed' },
      },
    };

    const activeStages = queueActiveStagesForFr19('pipe-ux-review-blocked', blockedState);

    expect(blockedState.stages.implement.status).toBe('blocked');
    expect(blockedState.stages.implement.blockReason).toContain('ux-interaction-design(pmReviewStatus)');
    expect(activeStages).toEqual([]);
  });

  it('allows implement when UX stage is absent from required stages', () => {
    const blockedState = {
      requiredStages: ['architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'architecture-design': { status: 'passed' },
      },
    };

    const activeStages = queueActiveStagesForFr19('pipe-no-ux-stage', blockedState);

    expect(blockedState.stages.implement.status).toBe('active');
    expect(activeStages).toEqual(['implement']);
  });

  it('keeps new design stages in quickstart and tier2 stage lists', () => {
    expect(QUICKSTART_STAGES).toContain('ux-interaction-design');
    expect(QUICKSTART_STAGES).toContain('architecture-design');
    expect(TIER2_STAGES).toContain('ux-interaction-design');
    expect(TIER2_STAGES).toContain('architecture-design');
  });

  it('keeps new design stages in canonical stage sequence', () => {
    expect(CANONICAL_14_STAGES).toContain('ux-interaction-design');
    expect(CANONICAL_14_STAGES).toContain('architecture-design');
  });
});
