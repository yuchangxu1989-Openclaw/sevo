/**
 * StageRunner — single-stage executor (arc42 §5.3).
 *
 * Assembles StageContext (input artifacts + principles + gate rules),
 * injects role knowledge via RoleKnowledgeInjector, triggers execution
 * through the HostAdapter, and evaluates exit conditions via GateEngine.
 */

import type { ArtifactRef, StageId, StageResult, RuleVerdict } from '../types/index.js';
import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import type { GateRule } from '../gate/gate-rule.js';
import type { SemanticRuleOptions } from '../gate/rules/semantic-rule-utils.js';
import { GateEngine } from '../gate/gate-engine.js';
import { createSpecReviewGateEngine } from '../gate/default-spec-review-gate-engine.js';
import { RoleKnowledgeInjector } from '../knowledge/role-knowledge-injector.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';
import type { RoleStageValidator, RoleMismatchEvent } from '../role-registry/index.js';

// ── StageContext (arc42 §5.3) ───────────────────────────────────

export interface StageContext {
  pipelineId: string;
  stageId: StageId;
  inputArtifacts: ArtifactRef[];
  principles: string;
  gateRules: GateRule[];
  agentHint?: string;
}

// ── StageRunner options ─────────────────────────────────────────

export interface StageRunnerOptions {
  adapter: SevoHostAdapter;
  knowledgeInjector?: RoleKnowledgeInjector;
  gateEngine?: GateEngine;
  /** Options forwarded to default spec-review-gate semantic LLM rules. Ignored when gateEngine is provided. */
  specReviewGateRuleOptions?: SemanticRuleOptions;
  /** Additional gate rules to register beyond defaults. */
  additionalRules?: GateRule[];
  /** Role-stage validator for dispatch constraints (FR-22). */
  roleStageValidator?: RoleStageValidator;
  /** Callback for role mismatch audit events (AC-22.3). */
  onRoleMismatch?: (event: RoleMismatchEvent) => void;
}

// ── Gate evaluation result ──────────────────────────────────────

export interface GateEvaluationResult {
  passed: boolean;
  verdict: RuleVerdict;
  issues: string[];
}

// ── StageRunner ─────────────────────────────────────────────────

export class StageRunner {
  private readonly adapter: SevoHostAdapter;
  private readonly knowledgeInjector: RoleKnowledgeInjector;
  private readonly gateEngine: GateEngine;
  private readonly roleStageValidator?: RoleStageValidator;
  private readonly onRoleMismatch?: (event: RoleMismatchEvent) => void;

  constructor(options: StageRunnerOptions) {
    this.adapter = options.adapter;
    this.knowledgeInjector = options.knowledgeInjector ?? new RoleKnowledgeInjector();
    this.gateEngine = options.gateEngine ?? createSpecReviewGateEngine(options.specReviewGateRuleOptions);
    this.roleStageValidator = options.roleStageValidator;
    this.onRoleMismatch = options.onRoleMismatch;

    // Register additional rules if provided
    if (options.additionalRules) {
      for (const rule of options.additionalRules) {
        this.gateEngine.registerRule(rule);
      }
    }
  }

  /**
   * Execute a single pipeline stage.
   *
   * 1. Assemble StageContext (input artifacts + principles + gate rules)
   * 2. Inject role knowledge via RoleKnowledgeInjector
   * 3. Dispatch execution through HostAdapter
   * 4. Collect output artifacts
   * 5. Evaluate exit gate conditions
   *
   * @returns StageResult with outcome and artifacts
   */
  async run(pipelineId: string, stageId: StageId, inputArtifacts: ArtifactRef[] = []): Promise<StageResult> {
    // 0. Role-task matching validation (FR-22, AC-22.2)
    const agentHint = this.resolveAgentHint(stageId);
    if (agentHint && this.roleStageValidator) {
      const validation = this.roleStageValidator.validate(agentHint, stageId);
      if (validation.mismatchEvent) {
        // AC-22.3: Emit audit event
        this.onRoleMismatch?.(validation.mismatchEvent);
        // AC-22.4: Block in multi-agent mode
        if (!validation.allowed) {
          return {
            stageId,
            outcome: 'failed',
            artifacts: [],
            failureReason: validation.mismatchEvent.reason,
          };
        }
      }
    }

    // 1. Get principles and gate rules from RoleKnowledgeInjector
    const principles = this.knowledgeInjector.getPrinciples(stageId);
    const gateRuleDescriptors = this.knowledgeInjector.getGateRules(stageId);

    // 2. Build StageContext
    const context: StageContext = {
      pipelineId,
      stageId,
      inputArtifacts,
      principles,
      gateRules: this.gateEngine.getRules().filter(r => r.appliesTo.includes(stageId)),
      agentHint: this.resolveAgentHint(stageId),
    };

    // 3. Inject role knowledge into task context
    const enrichedContext = this.knowledgeInjector.inject(stageId, {
      pipelineId,
      stageId: stageId as string,
      inputArtifacts,
      principles,
    });

    // 4. Dispatch task through adapter
    const taskPayload: TaskPayload = {
      taskId: `${pipelineId}:${stageId}`,
      title: `[SEVO] ${stageId} — ${pipelineId}`,
      initialStage: stageId,
      stages: [stageId],
    };

    const taskId = await this.adapter.dispatchTask(stageId, taskPayload);

    // 5. Collect artifacts produced by the stage
    const outputArtifacts = await this.adapter.collectArtifacts(taskId);

    // 6. Evaluate exit gate
    const gateResult = await this.evaluateGateAsync(stageId, outputArtifacts);

    // 7. Build StageResult
    const result: StageResult = {
      stageId,
      outcome: gateResult.passed ? 'passed' : 'failed',
      artifacts: outputArtifacts,
      failureReason: gateResult.passed ? undefined : gateResult.issues.join('; '),
    };

    // 8. Notify adapter of gate result if failed
    if (!gateResult.passed) {
      this.adapter.notifyGateResult(stageId, {
        gateId: `${stageId}-exit`,
        conclusion: 'rejected',
        blockers: gateResult.issues.map(item => ({ item, owner: stageId })),
        reviewBundles: [],
      });
    }

    return result;
  }

  /**
   * Synchronous compatibility API for non-LLM gate paths.
   * spec-review-gate uses async semantic rules, so callers must use evaluateGateAsync there.
   */
  evaluateGate(stageId: StageId, artifacts: ArtifactRef[]): GateEvaluationResult {
    if (stageId === 'spec-review-gate') {
      throw new Error('spec-review-gate requires asynchronous LLM evaluation; use evaluateGateAsync');
    }
    const verdict = this.gateEngine.evaluateGate(stageId, artifacts);
    return {
      passed: verdict.pass,
      verdict,
      issues: verdict.blockers,
    };
  }

  async evaluateGateAsync(stageId: StageId, artifacts: ArtifactRef[]): Promise<GateEvaluationResult> {
    const verdict = await this.gateEngine.evaluateGateAsync(stageId, artifacts);
    return {
      passed: verdict.pass,
      verdict,
      issues: verdict.blockers,
    };
  }

  /**
   * Get the assembled StageContext without executing.
   * Useful for inspection/debugging.
   */
  buildContext(pipelineId: string, stageId: StageId, inputArtifacts: ArtifactRef[] = []): StageContext {
    const principles = this.knowledgeInjector.getPrinciples(stageId);
    return {
      pipelineId,
      stageId,
      inputArtifacts,
      principles,
      gateRules: this.gateEngine.getRules().filter(r => r.appliesTo.includes(stageId)),
      agentHint: this.resolveAgentHint(stageId),
    };
  }

  /** Access the underlying GateEngine for rule registration. */
  getGateEngine(): GateEngine {
    return this.gateEngine;
  }

  /** Access the underlying RoleKnowledgeInjector. */
  getKnowledgeInjector(): RoleKnowledgeInjector {
    return this.knowledgeInjector;
  }

  // ── Private ─────────────────────────────────────────────────

  private resolveAgentHint(stageId: StageId): string | undefined {
    const config = this.adapter.getProjectConfig();
    return config.stageAgents?.[stageId] ?? config.defaultAgentId;
  }
}
