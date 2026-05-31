import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { Sevo } from '../sevo.js';
import { TaskOrchestrator } from '../orchestrator/task-orchestrator.js';
import { PipelineEngineFacade } from '../pipeline/pipeline-engine.js';
import { StageRunner } from '../stage-runner/stage-runner.js';
import { StandaloneAdapter } from '../adapter/standalone-adapter.js';
import { GateEngine } from '../gate/gate-engine.js';
import type { SevoConfig } from '../config.js';
import type { ArtifactRef, RuleResult, StageId } from '../types/index.js';
import type { ChatMessage } from '../llm/index.js';

const REQUIRED_RULE_IDS = [
  'spec-mandatory-sections',
  'fr-validation-criteria',
  'fr-traceability',
];

const KIVO_SPEC_FIXTURE = path.resolve(
  import.meta.dirname,
  'fixtures',
  'kivo-product-requirements.md',
);

const passLlm = {
  async chat(_messages: ChatMessage[]): Promise<string> {
    return '{"pass":true,"reasons":[]}';
  },
};

function asyncPassRule(id: string) {
  return {
    id,
    appliesTo: ['spec-review-gate' as StageId],
    async evaluate(_artifacts: ArtifactRef[]): Promise<RuleResult> {
      return { pass: true, message: `${id} async pass`, severity: 'blocker' };
    },
  };
}

function asyncPassEngine(): GateEngine {
  const engine = new GateEngine();
  for (const id of REQUIRED_RULE_IDS) {
    engine.registerRule(asyncPassRule(id));
  }
  return engine;
}

function makeConfig(): SevoConfig {
  return {
    projectName: 'runtime-wire-test',
    stages: ['spec', 'spec-review-gate', 'contract'],
    rules: [],
    adapter: 'standalone',
    endgameDelivery: { enabled: true, autoReadme: true, autoPublish: true, autoGapScan: true },
    strictRoleMatching: false,
    actionLevels: { L0: [], L1: [], L2: [] },
  };
}

function specArtifact(filePath: string): ArtifactRef {
  return {
    id: 'spec-artifact',
    type: 'product-requirements',
    path: filePath,
    createdAt: '2026-05-24T00:00:00.000Z',
  };
}

function copyKivoSpecFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'sevo-kivo-spec-'));
  const target = path.join(dir, 'product-requirements.md');
  copyFileSync(KIVO_SPEC_FIXTURE, target);
  return target;
}

describe('spec-review-gate runtime wiring', () => {
  it('Sevo default GateEngine registers spec-review-gate LLM semantic rules', async () => {
    const sevo = new Sevo(makeConfig(), { specReviewGateRuleOptions: { llmClient: passLlm } });
    await sevo.init();

    const ids = sevo.getGateEngine().getRules().map((rule) => rule.id);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_RULE_IDS));
  });

  it('preserves custom GateEngine override for empty-engine tests', async () => {
    const empty = new GateEngine();
    const sevo = new Sevo(makeConfig(), { gateEngine: empty });
    await sevo.init();

    expect(sevo.getGateEngine().getRules()).toHaveLength(0);
  });

  it('TaskOrchestrator default spec-review-gate path uses async LLM rules', async () => {
    const orchestrator = new TaskOrchestrator(undefined, asyncPassEngine());
    const specPath = copyKivoSpecFixture();
    const run = orchestrator.startPipeline({
      taskId: 'runtime-orchestrator',
      title: 'runtime orchestrator',
      initialStage: 'spec-review-gate',
      stages: ['spec-review-gate', 'contract'],
    });
    orchestrator.submitArtifacts(run.runId, [specArtifact(specPath)]);

    const result = await orchestrator.evaluateAndAdvanceAsync(run.runId);

    expect(result.verdict.conclusion).toBe('passed');
    expect(result.nextStage).toBe('contract');
  });

  it('PipelineEngineFacade default spec-review-gate path uses async LLM rules', async () => {
    const engine = new PipelineEngineFacade({ specReviewGateRuleOptions: { llmClient: passLlm } });
    const summary = await engine.createPipeline('runtime-pipeline', 'new module requiring full pipeline', 'L2+');
    engine.advance(summary.pipelineId);
    const specPath = copyKivoSpecFixture();

    const specResult = engine.completeStage(summary.pipelineId, {
      stageId: 'spec',
      outcome: 'passed',
      artifacts: [specArtifact(specPath)],
    });
    if (engine.getStatus(summary.pipelineId).currentStage === 'spec') {
      expect(specResult.lifecycle).toBe('awaiting-clarification');
      return;
    }
    expect(engine.getStatus(summary.pipelineId).currentStage).toBe('spec-review-gate');

    const result = await engine.advanceAsync(summary.pipelineId);

    expect(result.gateVerdict?.pass).toBe(true);
    expect(result.transition?.fromStage).toBe('spec-review-gate');
  });

  it('StageRunner default spec-review-gate path uses async LLM rules', async () => {
    const specPath = copyKivoSpecFixture();
    const adapter = new StandaloneAdapter(
      { workspaceRoot: process.cwd(), projectRoot: process.cwd() },
      { llmClient: passLlm },
    );
    const runner = new StageRunner({
      adapter,
      gateEngine: asyncPassEngine(),
    });

    const result = await runner.evaluateGateAsync('spec-review-gate', [specArtifact(specPath)]);

    expect(result.passed).toBe(true);
    expect(result.verdict.blockers).toHaveLength(0);
  });

  it('runs KIVO spec fixture through spec-review-gate to pass with mocked structured LLM', async () => {
    const specPath = copyKivoSpecFixture();
    const engine = new PipelineEngineFacade({ specReviewGateRuleOptions: { llmClient: passLlm } });
    const summary = await engine.createPipeline('kivo', 'new knowledge operations product', 'L2+');
    engine.advance(summary.pipelineId);

    const specResult = engine.completeStage(summary.pipelineId, {
      stageId: 'spec',
      outcome: 'passed',
      artifacts: [specArtifact(specPath)],
    });
    if (engine.getStatus(summary.pipelineId).currentStage === 'spec') {
      expect(specResult.lifecycle).toBe('awaiting-clarification');
      return;
    }
    const gate = await engine.advanceAsync(summary.pipelineId);

    expect(gate.gateVerdict?.pass).toBe(true);
    expect(engine.getStatus(summary.pipelineId).currentStage as StageId | null).not.toBe('spec-review-gate');
  });
});
