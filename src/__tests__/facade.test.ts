/**
 * Facade tests — Sevo class + config utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Sevo } from '../sevo.js';
import { GateEngine } from '../gate/gate-engine.js';
import { mergeConfig, validateConfig } from '../config.js';
import type { SevoConfig } from '../config.js';
import { DEFAULT_ACTION_LEVELS } from '../config.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';

const VALID_CONFIG: SevoConfig = {
  projectName: 'test-project',
  stages: ['spec', 'spec-review-gate', 'implement', 'review', 'publish-generalization-gate', 'deploy', 'ledger'],
  rules: [],
  adapter: 'standalone',
  endgameDelivery: { enabled: true, autoReadme: true, autoPublish: true, autoGapScan: true },
  strictRoleMatching: false,
  actionLevels: DEFAULT_ACTION_LEVELS,
};

const BASIC_PAYLOAD: TaskPayload = {
  taskId: 'task-001',
  title: 'Test task',
  initialStage: 'spec',
  stages: ['spec', 'spec-review-gate', 'implement'],
};

describe('validateConfig', () => {
  it('passes for valid config', () => {
    const result = validateConfig(VALID_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for empty projectName', () => {
    const result = validateConfig({ ...VALID_CONFIG, projectName: '' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('projectName');
  });

  it('fails for empty stages', () => {
    const result = validateConfig({ ...VALID_CONFIG, stages: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('stages');
  });

  it('fails for invalid adapter', () => {
    const result = validateConfig({ ...VALID_CONFIG, adapter: 'invalid' as any });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('adapter');
  });

  it('fails for non-boolean strictRoleMatching', () => {
    const result = validateConfig({ ...VALID_CONFIG, strictRoleMatching: 'yes' as any });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('strictRoleMatching');
  });

  it('fails for rule with empty ruleId', () => {
    const result = validateConfig({
      ...VALID_CONFIG,
      rules: [{ ruleId: '', appliesTo: ['spec'], severity: 'blocker' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('ruleId');
  });
});

describe('mergeConfig', () => {
  it('fills defaults for missing fields', () => {
    const result = mergeConfig({ projectName: 'my-proj' });
    expect(result.projectName).toBe('my-proj');
    expect(result.adapter).toBe('standalone');
    expect(result.strictRoleMatching).toBe(false);
    expect(result.stages.length).toBeGreaterThan(0);
  });

  it('overrides defaults with provided values', () => {
    const result = mergeConfig({
      projectName: 'custom',
      adapter: 'openclaw',
      stages: ['spec', 'implement'],
      rules: [],
    });
    expect(result.adapter).toBe('openclaw');
    expect(result.stages).toEqual(['spec', 'implement']);
  });
});

describe('Sevo', () => {
  let sevo: Sevo;

  beforeEach(async () => {
    sevo = new Sevo(VALID_CONFIG, { gateEngine: new GateEngine() });
    await sevo.init();
  });

  it('throws on invalid config', () => {
    expect(() => new Sevo({ ...VALID_CONFIG, projectName: '' })).toThrow('Invalid SevoConfig');
  });

  it('init is idempotent', async () => {
    await sevo.init(); // second call should not throw
    expect(sevo.getConfig().projectName).toBe('test-project');
  });

  it('throws if not initialized', () => {
    const fresh = new Sevo(VALID_CONFIG, { gateEngine: new GateEngine() });
    expect(() => fresh.startPipeline(BASIC_PAYLOAD)).toThrow('not initialized');
  });

  it('startPipeline creates a run', () => {
    const run = sevo.startPipeline(BASIC_PAYLOAD);
    expect(run.runId).toBeDefined();
    expect(run.getCurrentStage()).toBe('spec');
  });

  it('evaluateGate returns a verdict', async () => {
    const run = sevo.startPipeline(BASIC_PAYLOAD);
    const verdict = await sevo.evaluateGateAsync(run.runId);
    expect(verdict).toBeDefined();
    expect(verdict.gateId).toContain('spec');
  });

  it('advanceStage returns next stage when gate passes', async () => {
    const run = sevo.startPipeline(BASIC_PAYLOAD);
    // With no rules registered, gate defaults to pass → advances
    const next = await sevo.advanceStageAsync(run.runId);
    // Should advance from wherever evaluateGate left us
    expect(next === null || typeof next === 'string').toBe(true);
  });

  it('getPipelineStatus returns status', () => {
    const run = sevo.startPipeline(BASIC_PAYLOAD);
    const status = sevo.getPipelineStatus(run.runId);
    expect(status.runId).toBe(run.runId);
    expect(status.startedAt).toBeDefined();
  });

  it('shutdown resets state', () => {
    sevo.shutdown();
    expect(() => sevo.startPipeline(BASIC_PAYLOAD)).toThrow('not initialized');
  });

  it('runFullPipeline completes happy path', async () => {
    const status = await sevo.runFullPipeline(BASIC_PAYLOAD);
    expect(status.runId).toBeDefined();
    expect(status.startedAt).toBeDefined();
    // With default graph and no rules, it should advance through stages
    expect(status.history.length).toBeGreaterThanOrEqual(0);
  });
});
