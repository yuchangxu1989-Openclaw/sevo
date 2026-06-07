import { describe, expect, it } from 'vitest';

import {
  buildGeneralizeAdvancePrompt,
  buildPublishAdvancePrompt,
  buildPublishGeneralizationAdvancePrompt,
  buildGeneralizeChangeSignature,
  evaluateGeneralizeGateResult,
  evaluatePublishGeneralizationGateResult,
  evaluateFr19QualityGate,
  evaluatePublishRoutingResult,
  hasValidGeneralizeRecord,
  parsePublishGeneralizationGateResult,
  parsePublishRoutingResult,
  PUBLISH_GENERALIZATION_RESULT_END,
  PUBLISH_GENERALIZATION_RESULT_START,
  resolveGeneralizeBackfill,
  resolvePublishRoutingConfig,
} from '../index.js';

const REQUIRED_CHECKS = [
  'agentModelProviderDynamicConfig',
  'absolutePathPortWorkspaceConfig',
  'trackedProjectDependency',
  'singleAgentMinimumRunPath',
  'readmeInitializationErrorGuidance',
] as const;

function checks(status = 'pass') {
  return Object.fromEntries(
    REQUIRED_CHECKS.map((key) => [key, { status, evidence: `${key} evidence` }]),
  );
}

function singleAgentEvidence(overrides: Record<string, unknown> = {}) {
  return {
    availableAgentCount: 1,
    mode: 'single-agent',
    stageStrategy: 'step-by-step',
    pipelineId: 'pipe-fr48',
    stageRecords: [{ stageId: 'specify', status: 'passed' }],
    evidence: {
      pipelineId: 'pipe-fr48',
      stageRecords: [{ stageId: 'specify', status: 'passed' }],
      reportPath: 'reports/generalize-gate.md',
    },
    ...overrides,
  };
}

function resultBlock(overrides: Record<string, unknown> = {}) {
  const payload = {
    generalize: {
      status: 'passed',
      publishEligible: true,
      resultPath: 'reports/generalize-gate.md',
      checks: checks(),
      findings: [],
      singleAgentEvidence: singleAgentEvidence(),
    },
    publishRouting: {
      status: 'planned',
      skipReason: null,
      publishTargets: ['npm'],
      classificationCounts: {
        generalizedArtifacts: 1,
        localMainConfig: 1,
        blockedSensitiveItems: 0,
        noPublishItems: 1,
      },
      classifications: {
        generalizedArtifacts: [{ path: 'README.md', basis: 'third-party entrypoint' }],
        localMainConfig: [{ path: 'sevo.json', basis: 'local main config' }],
        blockedSensitiveItems: [],
        noPublishItems: [{ path: 'reports/audit.md', basis: 'evidence only' }],
      },
      localMainConfigResult: {
        status: 'pending',
        pending: true,
        items: ['sevo.json'],
        purpose: 'local main config remains in main repository only',
      },
      targetResults: [
        { targetName: 'npm', targetType: 'npm', status: 'passed', versionOrCommit: '1.2.3', location: 'npm:sevo-pipeline@1.2.3', artifacts: ['README.md'] },
      ],
      ledgerEvidence: [
        { category: 'generalizedArtifacts', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        { category: 'localMainConfig', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        { category: 'noPublishItems', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
      ],
    },
    ...overrides,
  };
  return `${PUBLISH_GENERALIZATION_RESULT_START}\n${JSON.stringify(payload)}\n${PUBLISH_GENERALIZATION_RESULT_END}`;
}

describe('FR-48/FR-49 publish-generalization-gate orchestration', () => {
  it('builds separate generalize and publish advance prompts', () => {
    const state = {
      pipelineId: 'pipe-fr48',
      publishTargets: ['npm', 'github'],
      requiredStages: ['regression', 'generalize', 'publish'],
      stages: {
        generalize: {
          status: 'passed',
          metadata: {
            generalize: { status: 'passed', publishEligible: true },
            changeSignature: 'stale-signature',
          },
        },
      },
    };
    const generalizePrompt = buildGeneralizeAdvancePrompt(state, 'sevo', 'projects/sevo');
    const publishPrompt = buildPublishAdvancePrompt(state, 'sevo', 'projects/sevo');

    expect(generalizePrompt).toContain('[SEVO Advance Prompt - FR-48 Generalize Gate]');
    expect(generalizePrompt).toContain('Stage ID: generalize');
    expect(generalizePrompt).toContain('agentModelProviderDynamicConfig');
    expect(generalizePrompt).toContain('[SEVO_GENERALIZE_RESULT]');
    expect(generalizePrompt).not.toContain('blockedSensitiveItems');

    expect(publishPrompt).toContain('[SEVO Advance Prompt - FR-49 Publish Split Routing]');
    expect(publishPrompt).toContain('Stage ID: publish');
    expect(publishPrompt).toContain('blockedSensitiveItems');
    expect(publishPrompt).toContain('[SEVO_PUBLISH_RESULT]');
    expect(publishPrompt).toContain('- npm');
    expect(publishPrompt).toContain('- github');
  });

  it('accepts a passed generalize result with publish split routing targets', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock());
    const gate = evaluatePublishGeneralizationGateResult(parsed);

    expect(gate.ok).toBe(true);
    expect(parsed.generalize.status).toBe('passed');
    expect(parsed.publishRouting.publishTargets).toEqual(['npm']);
  });

  it('accepts skipped-with-evidence when the project has no external publish target', () => {
    const routing = resolvePublishRoutingConfig({ stages: {} }, 'no-target-fixture', 'tests/fixtures/no-target-fixture');
    expect(routing.hasExternalPublishTarget).toBe(false);
    expect(routing.skipReason).toContain('no-target');

    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'skipped-with-evidence',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {},
        skipEvidence: {
          reason: 'no product artifact changed',
          source: 'git diff',
          reviewEntry: 'reports/no-change.md',
        },
      },
      publishRouting: {
        status: 'skipped-with-evidence',
        skipReason: routing.skipReason,
        publishTargets: [],
        classificationCounts: {
          generalizedArtifacts: 0,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 1,
        },
        classifications: {
          generalizedArtifacts: [],
          localMainConfig: [],
          blockedSensitiveItems: [],
          noPublishItems: [{ path: 'reports/internal.md', basis: 'internal evidence only' }],
        },
        targetResults: [],
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 0, reason: 'no external publish target', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 1, reason: 'internal evidence only', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(true);
    expect(parsed.publishRouting.status).toBe('skipped-with-evidence');
  });

  it('blocks when publish routing contains sensitive items', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      publishRouting: {
        status: 'planned',
        publishTargets: ['github'],
        classificationCounts: {
          generalizedArtifacts: 1,
          localMainConfig: 0,
          blockedSensitiveItems: 1,
          noPublishItems: 0,
        },
        classifications: {
          generalizedArtifacts: [{ path: 'README.md', basis: 'third-party entrypoint' }],
          localMainConfig: [],
          blockedSensitiveItems: [{ path: 'state/device.json', basis: 'device identity' }],
          noPublishItems: [],
        },
        targetResults: [],
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 1, reason: 'device identity cannot publish', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('blocked sensitive items');
  });
  it('blocks when any required generalize check reports failure or lacks evidence', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'passed',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {
          ...checks(),
          agentModelProviderDynamicConfig: { status: 'fail', evidence: 'hardcoded provider name found' },
        },
        singleAgentEvidence: singleAgentEvidence(),
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('agentModelProviderDynamicConfig');
  });

  it('blocks no-target routing unless it is skipped-with-evidence', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      publishRouting: {
        status: 'planned',
        skipReason: null,
        publishTargets: [],
        classificationCounts: {
          generalizedArtifacts: 0,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 1,
        },
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('skipped-with-evidence');
  });
  it('blocks check-level skipped-with-evidence when generalize is not skipped', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'passed',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {
          ...checks(),
          singleAgentMinimumRunPath: { status: 'skipped-with-evidence', evidence: 'not executed' },
        },
        singleAgentEvidence: singleAgentEvidence(),
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('singleAgentMinimumRunPath');
  });

  it('blocks top-level skipped-with-evidence without skip evidence', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'skipped-with-evidence',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {},
      },
      publishRouting: {
        status: 'skipped-with-evidence',
        skipReason: 'no-target: project config declares no external publish target',
        publishTargets: [],
        classificationCounts: {
          generalizedArtifacts: 0,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 1,
        },
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('skipEvidence');
  });

  it('parses normal completion envelopes with result.output', () => {
    const parsed = parsePublishGeneralizationGateResult({
      result: {
        status: 'success',
        output: resultBlock(),
      },
    });

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(true);
    expect(parsed.generalize.status).toBe('passed');
  });
  it('blocks sensitive item classification even when the count says zero', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      publishRouting: {
        status: 'planned',
        publishTargets: ['github'],
        classificationCounts: {
          generalizedArtifacts: 1,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 0,
        },
        classifications: {
          generalizedArtifacts: [{ path: 'README.md', basis: 'third-party entrypoint' }],
          localMainConfig: [],
          blockedSensitiveItems: [{ path: 'state/device.json', basis: 'device identity' }],
          noPublishItems: [],
        },
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('blockedSensitiveItems');
  });
  it('blocks publish routing without same-pipeline generalize evidence', () => {
    const parsed = parsePublishRoutingResult(resultBlock());
    const gate = evaluatePublishRoutingResult(parsed, null);

    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('missing same-pipeline generalize gate result');
  });

  it('blocks planned publish targets without version or location evidence', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      publishRouting: {
        status: 'planned',
        skipReason: null,
        publishTargets: ['npm'],
        classificationCounts: {
          generalizedArtifacts: 1,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 0,
        },
        classifications: {
          generalizedArtifacts: [{ path: 'README.md', basis: 'third-party entrypoint' }],
          localMainConfig: [],
          blockedSensitiveItems: [],
          noPublishItems: [],
        },
        targetResults: [
          { targetName: 'npm', targetType: 'npm', status: 'passed', versionOrCommit: null, location: null, artifacts: ['README.md'] },
        ],
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('versionOrCommit/location');
  });

  it('blocks multi-target publish routing when any declared target lacks a result', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock());
    const publishRouting = {
      ...parsed.publishRouting,
      publishTargets: ['npm', 'github'],
    };

    const gate = evaluatePublishGeneralizationGateResult({ ...parsed, publishRouting });

    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('github');
  });

  it('blocks classification counts that do not match object list lengths', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock());
    const publishRouting = {
      ...parsed.publishRouting,
      classificationCounts: {
        ...parsed.publishRouting.classificationCounts,
        generalizedArtifacts: 2,
      },
    };

    const gate = evaluatePublishGeneralizationGateResult({ ...parsed, publishRouting });

    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('lists 1 objects');
  });

  it('blocks local main config without main repository trace evidence', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock());
    const publishRouting = { ...parsed.publishRouting };
    delete publishRouting.localMainConfigResult;

    const gate = evaluatePublishGeneralizationGateResult({ ...parsed, publishRouting });

    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('localMainConfigResult');
  });

  it('blocks local main config when it appears in external target artifacts', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock());
    const publishRouting = {
      ...parsed.publishRouting,
      targetResults: [
        {
          targetName: 'npm',
          targetType: 'npm',
          status: 'passed',
          versionOrCommit: '1.2.3',
          location: 'npm:sevo-pipeline@1.2.3',
          artifacts: ['README.md', 'sevo.json'],
        },
      ],
    };

    const gate = evaluatePublishGeneralizationGateResult({ ...parsed, publishRouting });

    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('must not be in external publish target');
  });

  it('blocks single-agent evidence that does not prove a one-agent minimum run', () => {
    const gate = evaluateGeneralizeGateResult({
      found: true,
      generalize: {
        status: 'passed',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: checks(),
        findings: [],
        singleAgentEvidence: singleAgentEvidence({
          availableAgentCount: 2,
          mode: 'multi-agent',
        }),
      },
    });

    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('single-agent minimum-run evidence');
  });

  it('blocks skipped publish routing when ledger evidence lacks count reason or checkedAt', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'skipped-with-evidence',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {},
        skipEvidence: { reason: 'no product artifact changes', source: 'git diff', reviewEntry: 'reports/no-change.md' },
      },
      publishRouting: {
        status: 'skipped-with-evidence',
        skipReason: 'no-target: project config declares no external publish target',
        publishTargets: [],
        classificationCounts: {
          generalizedArtifacts: 0,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 1,
        },
        classifications: {
          generalizedArtifacts: [],
          localMainConfig: [],
          blockedSensitiveItems: [],
          noPublishItems: [{ path: 'reports/internal.md', basis: 'internal evidence only' }],
        },
        ledgerEvidence: [
          { category: 'generalizedArtifacts' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('generalizedArtifacts');
  });
  it('does not accept sibling skipReason as top-level generalize skip evidence', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'skipped-with-evidence',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {},
        skipReason: 'sibling reason must not count',
        skipEvidence: { source: 'git diff' },
      },
      publishRouting: {
        status: 'skipped-with-evidence',
        skipReason: 'no-target: project config declares no external publish target',
        publishTargets: [],
        classificationCounts: {
          generalizedArtifacts: 0,
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 1,
        },
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: 1, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('skipEvidence');
  });

  it('blocks blank or null classification and ledger counts', () => {
    const parsed = parsePublishGeneralizationGateResult(resultBlock({
      generalize: {
        status: 'skipped-with-evidence',
        publishEligible: true,
        resultPath: 'reports/generalize-gate.md',
        checks: {},
        skipEvidence: { reason: 'no product artifact changes', source: 'git diff', reviewEntry: 'reports/no-change.md' },
      },
      publishRouting: {
        status: 'skipped-with-evidence',
        skipReason: 'no-target: project config declares no external publish target',
        publishTargets: [],
        classificationCounts: {
          generalizedArtifacts: '',
          localMainConfig: 0,
          blockedSensitiveItems: 0,
          noPublishItems: 1,
        },
        ledgerEvidence: [
          { category: 'generalizedArtifacts', count: '', reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'localMainConfig', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'blockedSensitiveItems', count: 0, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
          { category: 'noPublishItems', count: null, reason: 'checked', checkedAt: '2026-06-07T00:00:00.000Z' },
        ],
      },
    }));

    const gate = evaluatePublishGeneralizationGateResult(parsed);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('generalizedArtifacts');
  });


  it('requires a current generalize signature before downstream re-entry can skip backfill', () => {
    const state = {
      pipelineId: 'pipe-reentry',
      requiredStages: ['implement', 'review', 'regression', 'generalize', 'publish', 'deploy'],
      stages: {
        implement: { status: 'passed', metadata: { changedFiles: ['index.js'], completedAt: '2026-06-07T00:00:00.000Z' } },
        review: { status: 'passed' },
        regression: { status: 'passed' },
        generalize: {
          pipelineId: 'pipe-reentry',
          stageId: 'generalize',
          status: 'passed',
          startedAt: '2026-06-07T00:00:00.000Z',
          completedAt: '2026-06-07T00:01:00.000Z',
          resultPath: 'reports/generalize-gate.md',
          metadata: {
            generalize: {
              status: 'passed',
              publishEligible: true,
              resultPath: 'reports/generalize-gate.md',
              checks: checks(),
              findings: [],
              singleAgentEvidence: singleAgentEvidence({ pipelineId: 'pipe-reentry' }),
            },
            changeSignature: 'stale-signature',
          },
        },
        publish: { status: 'active' },
        deploy: { status: 'pending' },
      },
    };

    expect(hasValidGeneralizeRecord(state)).toBe(false);
    const backfill = resolveGeneralizeBackfill(state, 'publish');
    expect(backfill?.backfillStageId).toBe('generalize');
    expect(backfill?.resumeTargetStageId).toBe('publish');

    state.stages.generalize.metadata.changeSignature = buildGeneralizeChangeSignature(state);
    expect(hasValidGeneralizeRecord(state)).toBe(true);
    expect(resolveGeneralizeBackfill(state, 'publish')).toBeNull();
  });

  it('rejects matching generalize signatures when required evidence is missing', () => {
    const state = {
      pipelineId: 'pipe-empty-generalize',
      requiredStages: ['implement', 'review', 'regression', 'generalize', 'publish'],
      stages: {
        implement: { status: 'passed', metadata: { changedFiles: ['index.js'], completedAt: '2026-06-07T00:00:00.000Z' } },
        review: { status: 'passed' },
        regression: { status: 'passed' },
        generalize: {
          status: 'passed',
          metadata: {
            generalize: { status: 'passed', publishEligible: true },
            changeSignature: 'stale-signature',
          },
        },
        publish: { status: 'active' },
      },
    };

    state.stages.generalize.metadata.changeSignature = buildGeneralizeChangeSignature(state);
    expect(hasValidGeneralizeRecord(state)).toBe(false);
    const gate = evaluateFr19QualityGate('publish', 'passed', { result: { output: resultBlock() } }, state);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('missing or stale');
  });

  it('blocks publish quality gate when generalize signature is stale', () => {
    const state = {
      pipelineId: 'pipe-stale-publish',
      requiredStages: ['implement', 'review', 'regression', 'generalize', 'publish'],
      stages: {
        implement: { status: 'passed', metadata: { changedFiles: ['index.js'], completedAt: '2026-06-07T00:00:00.000Z' } },
        review: { status: 'passed' },
        regression: { status: 'passed' },
        generalize: {
          status: 'passed',
          metadata: {
            generalize: { status: 'passed', publishEligible: true },
            changeSignature: 'stale-signature',
          },
        },
        publish: { status: 'active' },
      },
    };

    const gate = evaluateFr19QualityGate('publish', 'passed', { result: { output: resultBlock() } }, state);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain('missing or stale');
  });
});
