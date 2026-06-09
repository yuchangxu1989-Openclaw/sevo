import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildTaskPrompt, getStageMapping } from '../task-mapper.js';
import { queueActiveStagesForFr19, FULL_PIPELINE_STAGES, buildPipelineStagePlan, areDesignStagesSatisfied, assertImplementPromptReferencesDesign } from '../index.js';

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

  it('records design advisory and keeps implement active when architecture design is not passed', () => {
    const advisoryState = {
      requiredStages: ['ux-interaction-design', 'architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'ux-interaction-design': { status: 'passed', metadata: { pmReviewStatus: 'passed' } },
        'architecture-design': { status: 'active' },
      },
    };

    const activeStages = queueActiveStagesForFr19('pipe-design-advisory', advisoryState);

    expect(advisoryState.stages.implement.status).toBe('active');
    expect(advisoryState.stages.implement.blockReason).toBeUndefined();
    expect(advisoryState.stages.implement.designGateAdvisory).toBeDefined();
    expect(JSON.stringify(advisoryState.stages.implement.designGateAdvisory)).toContain('architecture-design');
    expect(activeStages).toEqual(['architecture-design', 'implement']);
  });

  it('records design advisory and keeps implement active when UX PM review is not passed', () => {
    const advisoryState = {
      requiredStages: ['ux-interaction-design', 'architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'ux-interaction-design': { status: 'passed', metadata: { pmReviewStatus: 'pending' } },
        'architecture-design': { status: 'passed' },
      },
    };

    const activeStages = queueActiveStagesForFr19('pipe-ux-review-advisory', advisoryState);

    expect(advisoryState.stages.implement.status).toBe('active');
    expect(advisoryState.stages.implement.blockReason).toBeUndefined();
    expect(advisoryState.stages.implement.designGateAdvisory).toBeDefined();
    expect(JSON.stringify(advisoryState.stages.implement.designGateAdvisory)).toContain('ux-interaction-design(pmReviewStatus)');
    expect(activeStages).toEqual(['implement']);
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

  it('AC-4.8n: records design advisory and keeps implement active when a passed design stage has empty/missing artifacts', () => {
    // UX stage status=passed and pmReviewStatus=passed but artifacts=[] →
    // the design document is not on disk, so Implement records an advisory
    // while the pipeline keeps moving forward.
    const advisoryState = {
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

    const gate = areDesignStagesSatisfied(advisoryState);
    expect(gate.satisfied).toBe(false);
    expect(gate.blockers).toContain('ux-interaction-design(artifact-missing)');

    const activeStages = queueActiveStagesForFr19('pipe-ux-empty-artifact', advisoryState);
    expect(advisoryState.stages.implement.status).toBe('active');
    expect(advisoryState.stages.implement.blockReason).toBeUndefined();
    expect(advisoryState.stages.implement.designGateAdvisory).toBeDefined();
    expect(JSON.stringify(advisoryState.stages.implement.designGateAdvisory)).toContain('ux-interaction-design(artifact-missing)');
    expect(activeStages).toEqual(['implement']);
  });

  it('AC-4.8n: records design advisory and keeps implement active when a passed design artifact path points at a non-existent file', () => {
    const advisoryState = {
      requiredStages: ['architecture-design', 'implement'],
      stages: {
        implement: { status: 'active' },
        'architecture-design': {
          status: 'passed',
          artifacts: [{ path: path.join(tmpDir, 'does-not-exist.md') }],
        },
      },
    };

    const gate = areDesignStagesSatisfied(advisoryState);
    expect(gate.satisfied).toBe(false);
    expect(gate.blockers).toContain('architecture-design(artifact-unreadable)');

    const activeStages = queueActiveStagesForFr19('pipe-arch-unreadable', advisoryState);
    expect(advisoryState.stages.implement.status).toBe('active');
    expect(advisoryState.stages.implement.blockReason).toBeUndefined();
    expect(advisoryState.stages.implement.designGateAdvisory).toBeDefined();
    expect(JSON.stringify(advisoryState.stages.implement.designGateAdvisory)).toContain('architecture-design(artifact-unreadable)');
    expect(activeStages).toEqual(['implement']);
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

  it('builds the single canonical full-pipeline stage chain', () => {
    // 「全阶段无条件存在」：没有 lightweight/full 分档，也没有 design routing。
    // buildPipelineStagePlan 始终返回完整链，且不接受 scale/designRouting 参数。
    const plan = buildPipelineStagePlan();

    expect(plan.requiredStages).toEqual(FULL_PIPELINE_STAGES);
    expect(plan.skippedStages).toEqual([]);
    expect(plan.endgamePolicy.includeDeploy).toBe(true);
  });

  it('keeps design stages unconditionally in the canonical chain', () => {
    expect(FULL_PIPELINE_STAGES).toContain('ux-interaction-design');
    expect(FULL_PIPELINE_STAGES).toContain('architecture-design');
    // Design stages precede implement.
    expect(FULL_PIPELINE_STAGES.indexOf('ux-interaction-design')).toBeLessThan(FULL_PIPELINE_STAGES.indexOf('implement'));
    expect(FULL_PIPELINE_STAGES.indexOf('architecture-design')).toBeLessThan(FULL_PIPELINE_STAGES.indexOf('implement'));
  });
});
