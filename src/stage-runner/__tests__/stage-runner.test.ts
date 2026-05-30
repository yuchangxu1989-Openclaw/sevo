/**
 * StageRunner unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StageRunner } from '../stage-runner.js';
import { GateEngine } from '../../gate/gate-engine.js';
import { RoleKnowledgeInjector } from '../../knowledge/role-knowledge-injector.js';
import type { SevoHostAdapter } from '../../adapter/host-adapter.js';
import type { ArtifactRef, StageId } from '../../types/index.js';
import type { GateRule } from '../../gate/gate-rule.js';

function createMockAdapter(overrides: Partial<SevoHostAdapter> = {}): SevoHostAdapter {
  return {
    dispatchTask: vi.fn().mockResolvedValue('task-123'),
    collectArtifacts: vi.fn().mockResolvedValue([]),
    notifyGateResult: vi.fn(),
    callLlm: vi.fn().mockResolvedValue('{}'),
    triggerStage: vi.fn().mockResolvedValue(undefined),
    getProjectConfig: vi.fn().mockReturnValue({
      workspaceRoot: '/tmp/ws',
      projectRoot: '/tmp/project',
      defaultAgentId: 'dev-01',
      stageAgents: { spec: 'pm-01', review: 'audit-01' },
    }),
    ...overrides,
  };
}

function createMockArtifact(id: string): ArtifactRef {
  return {
    id,
    type: 'document',
    path: `/tmp/artifacts/${id}.md`,
    createdAt: new Date().toISOString(),
  };
}

describe('StageRunner', () => {
  let adapter: SevoHostAdapter;
  let runner: StageRunner;

  beforeEach(() => {
    adapter = createMockAdapter();
    runner = new StageRunner({ adapter });
  });

  describe('constructor', () => {
    it('creates with default GateEngine and RoleKnowledgeInjector', async () => {
      expect(runner.getGateEngine()).toBeInstanceOf(GateEngine);
      expect(runner.getKnowledgeInjector()).toBeInstanceOf(RoleKnowledgeInjector);
    });

    it('accepts custom GateEngine and RoleKnowledgeInjector', async () => {
      const ge = new GateEngine();
      const ki = new RoleKnowledgeInjector();
      const r = new StageRunner({ adapter, gateEngine: ge, knowledgeInjector: ki });
      expect(r.getGateEngine()).toBe(ge);
      expect(r.getKnowledgeInjector()).toBe(ki);
    });

    it('registers additional rules', async () => {
      const rule: GateRule = {
        id: 'test-rule',
        appliesTo: ['spec'],
        evaluate: () => ({ pass: true, message: 'ok', severity: 'warning' }),
      };
      const r = new StageRunner({ adapter, additionalRules: [rule] });
      expect(r.getGateEngine().getRules().some((registered) => registered.id === rule.id)).toBe(true);
    });
  });

  describe('run()', () => {
    it('dispatches task through adapter and returns passed result', async () => {
      const artifacts = [createMockArtifact('spec-output')];
      adapter.collectArtifacts = vi.fn().mockResolvedValue(artifacts);

      const result = await runner.run('pipeline-1', 'spec');

      expect(adapter.dispatchTask).toHaveBeenCalledWith('spec', expect.objectContaining({
        taskId: 'pipeline-1:spec',
        initialStage: 'spec',
      }));
      expect(adapter.collectArtifacts).toHaveBeenCalledWith('task-123');
      expect(result.stageId).toBe('spec');
      expect(result.outcome).toBe('passed');
      expect(result.artifacts).toEqual(artifacts);
      expect(result.failureReason).toBeUndefined();
    });

    it('returns failed result when gate rules fail', async () => {
      const failingRule: GateRule = {
        id: 'must-have-docs',
        appliesTo: ['spec'],
        evaluate: () => ({ pass: false, message: 'Missing spec document', severity: 'blocker' }),
      };
      runner = new StageRunner({ adapter, additionalRules: [failingRule] });

      const result = await runner.run('pipeline-1', 'spec');

      expect(result.outcome).toBe('failed');
      expect(result.failureReason).toContain('Missing spec document');
      expect(adapter.notifyGateResult).toHaveBeenCalledWith('spec', expect.objectContaining({
        conclusion: 'rejected',
      }));
    });

    it('passes input artifacts to context', async () => {
      const inputs = [createMockArtifact('upstream-artifact')];
      await runner.run('pipeline-1', 'implement', inputs);

      expect(adapter.dispatchTask).toHaveBeenCalled();
    });
  });

  describe('evaluateGateAsync()', () => {
    it('returns passed when no rules apply', async () => {
      const result = await runner.evaluateGateAsync('spec', []);
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('returns failed with issues when rules fail', async () => {
      const rule: GateRule = {
        id: 'check-artifacts',
        appliesTo: ['review'],
        evaluate: (artifacts) => ({
          pass: artifacts.length > 0,
          message: artifacts.length > 0 ? 'Has artifacts' : 'No artifacts found',
          severity: 'blocker',
        }),
      };
      runner = new StageRunner({ adapter, additionalRules: [rule] });

      const result = await runner.evaluateGateAsync('review', []);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('No artifacts found');
    });
  });

  describe('buildContext()', () => {
    it('assembles StageContext with correct fields', async () => {
      const inputs = [createMockArtifact('input-1')];
      const ctx = runner.buildContext('pipeline-1', 'spec', inputs);

      expect(ctx.pipelineId).toBe('pipeline-1');
      expect(ctx.stageId).toBe('spec');
      expect(ctx.inputArtifacts).toEqual(inputs);
      expect(ctx.agentHint).toBe('pm-01'); // from stageAgents config
      expect(typeof ctx.principles).toBe('string');
    });

    it('uses defaultAgentId when no stage-specific agent', async () => {
      const ctx = runner.buildContext('pipeline-1', 'implement');
      expect(ctx.agentHint).toBe('dev-01'); // defaultAgentId
    });
  });
});
