import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildTaskPrompt, getStageMapping } from '../task-mapper.js';
import { queueActiveStagesForFr19, QUICKSTART_STAGES, TIER2_STAGES, CANONICAL_14_STAGES, LIGHTWEIGHT_BASE_STAGES, FULL_PIPELINE_STAGES, buildPipelineStagePlan, insertDesignStages, areDesignStagesSatisfied, assertImplementPromptReferencesDesign } from '../index.js';

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

  // AC-4.8n: the Implement gate now verifies design artifacts on disk, so set up
  // a real readable, non-empty architecture artifact for the positive cases.
  let tmpDir: string;
  let archArtifactAbs: string;
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-design-gate-'));
    archArtifactAbs = path.join(tmpDir, 'architecture.md');
    fs.writeFileSync(archArtifactAbs, '# Architecture Design\n\nNon-empty content.\n', 'utf8');
  });
  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

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


  it('builds readme-update prompt with standard injection', () => {
    const prompt = buildTaskPrompt('readme-update', state, 'demo', 'projects/demo');
    expect(prompt).toContain('README update review for project "demo"');
    expect(prompt).toContain('projects/sevo/docs/readme-standard.md');
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
        'architecture-design': {
          status: 'passed',
          metadata: {
            architectureReviewRequired: true,
            pmReviewStatus: 'passed',
            architectureReviewStatus: 'passed',
          },
          artifacts: [{ path: archArtifactAbs }],
        },
      },
    };

    const activeStages = queueActiveStagesForFr19('pipe-no-ux-stage', blockedState);

    expect(blockedState.stages.implement.status).toBe('active');
    expect(activeStages).toEqual(['implement']);
  });

  it('AC-4.8n: blocks implement when a passed design stage has empty/missing artifacts', () => {
    // UX stage status=passed and pmReviewStatus=passed but artifacts=[] →
    // the design document is not on disk, so Implement must be blocked.
    const blockedState = {
      requiredStages: ['ux-interaction-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'ux-interaction-design': {
          status: 'passed',
          metadata: { pmReviewStatus: 'passed' },
          artifacts: [],
        },
      },
    };

    const gate = areDesignStagesSatisfied(blockedState);
    expect(gate.satisfied).toBe(false);
    expect(gate.blockers).toContain('ux-interaction-design(artifact-missing)');

    const activeStages = queueActiveStagesForFr19('pipe-ux-empty-artifact', blockedState);
    expect(blockedState.stages.implement.status).toBe('blocked');
    expect(blockedState.stages.implement.blockReason).toContain('ux-interaction-design(artifact-missing)');
    expect(activeStages).toEqual([]);
  });

  it('AC-4.8n: blocks implement when a passed design artifact path points at a non-existent file', () => {
    const blockedState = {
      requiredStages: ['architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'architecture-design': {
          status: 'passed',
          artifacts: [{ path: path.join(tmpDir, 'does-not-exist.md') }],
        },
      },
    };

    const gate = areDesignStagesSatisfied(blockedState);
    expect(gate.satisfied).toBe(false);
    expect(gate.blockers).toContain('architecture-design(artifact-unreadable)');

    queueActiveStagesForFr19('pipe-arch-unreadable', blockedState);
    expect(blockedState.stages.implement.status).toBe('blocked');
  });

  it('AC-4.8n: allows implement when a passed design artifact exists and is non-empty', () => {
    const okState = {
      requiredStages: ['architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'architecture-design': {
          status: 'passed',
          metadata: {
            architectureReviewRequired: true,
            pmReviewStatus: 'passed',
            architectureReviewStatus: 'passed',
          },
          artifacts: [{ path: archArtifactAbs }],
        },
      },
    };

    const gate = areDesignStagesSatisfied(okState);
    expect(gate.satisfied).toBe(true);
    expect(gate.blockers).toEqual([]);
  });

  it('AC-4.20g: implement prompt reference assertion passes when design references are present', () => {
    const taskPrompt = [
      'Implement project "demo".',
      'Reference (ux-interaction-design): projects/demo/docs/ux/interaction-design.md',
      'Reference (architecture-design): projects/demo/docs/architecture/architecture.md',
    ].join('\n');
    const result = assertImplementPromptReferencesDesign(taskPrompt, {
      requiredStages: ['ux-interaction-design', 'architecture-design', 'implement'],
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('AC-4.20g: implement prompt reference assertion fails when a required design reference is missing', () => {
    // requiredStages includes ux-interaction-design, but the prompt omits the
    // "Reference (ux-interaction-design):" line → dispatch must be flagged.
    const taskPrompt = [
      'Implement project "demo".',
      'Reference (architecture-design): projects/demo/docs/architecture/architecture.md',
    ].join('\n');
    const result = assertImplementPromptReferencesDesign(taskPrompt, {
      requiredStages: ['ux-interaction-design', 'architecture-design', 'implement'],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('ux-interaction-design');
  });

  it('keeps design stages out of the lightweight base and inserts them dynamically via designRouting', () => {
    // FR-D05/D06: the lightweight base no longer hardcodes design stages.
    // They are inserted on demand based on the design routing decision.
    expect(QUICKSTART_STAGES).toContain('ux-interaction-design');
    expect(QUICKSTART_STAGES).toContain('architecture-design');
    expect(TIER2_STAGES).not.toContain('ux-interaction-design');
    expect(TIER2_STAGES).not.toContain('architecture-design');

    // When routing requires them, insertDesignStages places them before implement.
    const withDesign = insertDesignStages(
      [...TIER2_STAGES],
      { needsUxDesign: true, needsArchitectureDesign: true },
      'lightweight',
    );
    expect(withDesign).toContain('ux-interaction-design');
    expect(withDesign).toContain('architecture-design');
    expect(withDesign.indexOf('ux-interaction-design')).toBeLessThan(withDesign.indexOf('implement'));
    expect(withDesign.indexOf('architecture-design')).toBeLessThan(withDesign.indexOf('implement'));
  });

  it('keeps every full-pipeline stage required regardless of design routing', () => {
    const plan = buildPipelineStagePlan({
      scale: 'full',
      designRouting: {
        needsUxDesign: false,
        needsArchitectureDesign: false,
        reason: 'LLM says no dedicated design work is needed',
        source: 'llm',
      },
    });

    expect(plan.designRouting).toMatchObject({
      needsUxDesign: false,
      needsArchitectureDesign: false,
      source: 'llm',
    });
    expect(plan.requiredStages).toEqual(FULL_PIPELINE_STAGES);
    expect(plan.requiredStages).toContain('ux-interaction-design');
    expect(plan.requiredStages).toContain('architecture-design');
  });

  it('preserves lightweight base behavior when design routing says no design stages are needed', () => {
    const plan = buildPipelineStagePlan({
      scale: 'lightweight',
      designRouting: {
        needsUxDesign: false,
        needsArchitectureDesign: false,
        reason: 'LLM says no dedicated design work is needed',
        source: 'llm',
      },
    });

    expect(plan.requiredStages).toEqual(LIGHTWEIGHT_BASE_STAGES);
    expect(plan.requiredStages).not.toContain('ux-interaction-design');
    expect(plan.requiredStages).not.toContain('architecture-design');
  });

  it('keeps new design stages in canonical stage sequence', () => {
    expect(CANONICAL_14_STAGES).toContain('ux-interaction-design');
    expect(CANONICAL_14_STAGES).toContain('architecture-design');
  });
});
