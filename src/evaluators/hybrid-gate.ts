/**
 * Hybrid evaluation mode (FR-25).
 *
 * Orchestrates executable evaluators (FR-23) and LLM evaluation into a
 * unified gate verdict. Implements fast-fail: if executable evaluators
 * fail, LLM evaluation is skipped to save tokens and time.
 *
 * AC-25.1: Evaluators run before LLM; any fail → skip LLM, gate fails.
 * AC-25.2: Evaluator pass → trigger LLM with quantitative context.
 * AC-25.3: Any layer fail → overall fail.
 * AC-25.4: Each verdict item tagged with source (evaluator / llm).
 * AC-25.5: No evaluators → pure LLM (backward compatible).
 * AC-25.6: Result included in Ledger evidence chain.
 * AC-25.7: LLM prompt includes evaluator quantitative summary.
 */

import type { GateConclusion, GateVerdict } from '../types/index.js';
import type {
  EvaluatorResultSet,
  EvaluatorRegistry,
  LlmEvaluationResult,
  HybridGateVerdict,
  HybridVerdictItem,
} from './evaluator-types.js';
import { runEvaluators, loadEvaluatorRegistry, getEvaluatorsDir } from './evaluator-runner.js';
import type { RatchetResult } from './ratchet.js';
import {
  loadRatchetRegistry,
  isRatchetEnabled,
  meetsRatchetThreshold,
} from './ratchet.js';

/**
 * Generate a human-readable summary of evaluator results for LLM context injection.
 *
 * AC-25.7: LLM receives quantitative summary so it doesn't re-check
 * dimensions already covered by executable evaluators.
 */
export function generateEvaluatorSummary(resultSet: EvaluatorResultSet): string {
  if (resultSet.executions.length === 0) {
    return '';
  }

  const lines = ['## Executable Evaluator Results (automated, already verified)'];

  for (const exec of resultSet.executions) {
    if (exec.status === 'completed' && exec.result) {
      const icon = exec.result.verdict === 'pass' ? '✅' : '❌';
      lines.push(`- ${icon} **${exec.name}**: ${exec.result.verdict} (score: ${exec.result.score}/100)`);
      for (const detail of exec.result.details) {
        const detailIcon = detail.passed ? '  ✓' : '  ✗';
        lines.push(`${detailIcon} ${detail.rule}: ${detail.message}`);
      }
    } else {
      lines.push(`- ⚠️ **${exec.name}**: ${exec.status}${exec.errorMessage ? ` — ${exec.errorMessage}` : ''}`);
    }
  }

  lines.push('');
  lines.push('You do NOT need to re-verify the dimensions above. Focus your review on:');
  lines.push('- Code quality, readability, and naming conventions');
  lines.push('- Architecture and design decisions');
  lines.push('- Edge cases and error handling not covered by automated checks');

  return lines.join('\n');
}

/**
 * Convert evaluator result set into hybrid verdict items with source attribution.
 */
function evaluatorResultsToItems(resultSet: EvaluatorResultSet): HybridVerdictItem[] {
  const items: HybridVerdictItem[] = [];

  for (const exec of resultSet.executions) {
    if (exec.status === 'completed' && exec.result) {
      items.push({
        source: 'evaluator',
        id: exec.name,
        passed: exec.result.verdict === 'pass',
        message: exec.result.details.map((d) => d.message).join('; '),
        score: exec.result.score,
      });
    } else {
      // Timeout or error — treated as not-pass (AC-23.5)
      items.push({
        source: 'evaluator',
        id: exec.name,
        passed: false,
        message: exec.errorMessage ?? `Evaluator ${exec.status}`,
      });
    }
  }

  return items;
}

/**
 * Convert LLM evaluation into hybrid verdict items.
 */
function llmResultToItems(llmResult: LlmEvaluationResult): HybridVerdictItem[] {
  if (llmResult.skipped) {
    return [{
      source: 'llm',
      id: 'llm-review',
      passed: false,
      message: `LLM evaluation skipped: ${llmResult.skipReason ?? 'evaluator fast-fail'}`,
    }];
  }

  const passed = llmResult.conclusion === 'passed';
  const items: HybridVerdictItem[] = [{
    source: 'llm',
    id: 'llm-review',
    passed,
    message: llmResult.issues.length > 0
      ? `LLM review: ${llmResult.conclusion}. Issues: ${llmResult.issues.join('; ')}`
      : `LLM review: ${llmResult.conclusion}`,
  }];

  return items;
}

/**
 * Determine final gate conclusion from evaluator + LLM results.
 *
 * AC-25.3: Any layer fail → overall fail.
 */
function determineConclusion(
  evaluatorResults: EvaluatorResultSet | null,
  llmResult: LlmEvaluationResult,
): GateConclusion {
  // Check evaluator results
  if (evaluatorResults) {
    if (evaluatorResults.overallVerdict === 'fail' || evaluatorResults.overallVerdict === 'error') {
      return 'rejected';
    }
  }

  // Check LLM result
  if (!llmResult.skipped) {
    return llmResult.conclusion;
  }

  // LLM was skipped due to evaluator failure — already rejected above
  return 'rejected';
}

// ── Public API ──────────────────────────────────────────────────

export interface HybridGateOptions {
  /** Project root directory. */
  projectRoot: string;
  /** Pipeline stage name. */
  stage: string;
  /** Paths to stage output artifacts. */
  artifactPaths: string[];
  /** Project metadata passed to evaluators. */
  projectMeta: Record<string, unknown>;
  /**
   * LLM evaluation function. Called only when evaluators pass.
   * Receives the evaluator summary string for context injection (AC-25.7).
   */
  runLlmEvaluation: (evaluatorSummary: string) => Promise<LlmEvaluationResult>;
  /** Override evaluator registry (for testing). */
  evaluatorRegistry?: EvaluatorRegistry;
  /**
   * FR-26: Optional work-package ID for ratchet threshold check.
   * When provided, evaluator scores are checked against historical high scores.
   * Regression from high score → gate fails with ratchet violation.
   */
  ratchetWorkPackageId?: string;
}

/**
 * Execute hybrid gate evaluation.
 *
 * 1. Run executable evaluators (if any registered for this stage).
 * 2. If evaluators fail → fast-fail, skip LLM (AC-25.1).
 * 3. If evaluators pass → run LLM with evaluator summary (AC-25.2).
 * 4. Combine results into HybridGateVerdict (AC-25.3, AC-25.4).
 * 5. No evaluators → pure LLM evaluation (AC-25.5).
 */
export async function evaluateHybridGate(options: HybridGateOptions): Promise<HybridGateVerdict> {
  const {
    projectRoot,
    stage,
    artifactPaths,
    projectMeta,
    runLlmEvaluation,
  } = options;

  const registry = options.evaluatorRegistry ?? loadEvaluatorRegistry(projectRoot);
  const evaluatorsDir = getEvaluatorsDir(projectRoot);

  // Step 1: Run executable evaluators
  const evaluatorResults = await runEvaluators(
    stage,
    registry,
    artifactPaths,
    projectMeta,
    evaluatorsDir,
  );

  let evaluatorSummary = '';
  let llmResult: LlmEvaluationResult;

  if (evaluatorResults === null) {
    // AC-25.5: No evaluators mounted → pure LLM evaluation
    evaluatorSummary = '';
    llmResult = await runLlmEvaluation('');
  } else if (evaluatorResults.overallVerdict === 'fail' || evaluatorResults.overallVerdict === 'error') {
    // AC-25.1: Fast-fail — skip LLM evaluation
    evaluatorSummary = generateEvaluatorSummary(evaluatorResults);
    llmResult = {
      conclusion: 'rejected',
      issues: [`Executable evaluators ${evaluatorResults.overallVerdict}: LLM evaluation skipped (fast-fail).`],
      skipped: true,
      skipReason: `Executable evaluators ${evaluatorResults.overallVerdict}`,
    };
  } else {
    // AC-25.2: Evaluators passed → run LLM with context
    evaluatorSummary = generateEvaluatorSummary(evaluatorResults);
    llmResult = await runLlmEvaluation(evaluatorSummary);
  }

  // Step 2: Build verdict items with source attribution (AC-25.4)
  const items: HybridVerdictItem[] = [];
  if (evaluatorResults) {
    items.push(...evaluatorResultsToItems(evaluatorResults));
  }
  items.push(...llmResultToItems(llmResult));

  // Step 3: Determine final conclusion (AC-25.3)
  const conclusion = determineConclusion(evaluatorResults, llmResult);

  // FR-26: Ratchet threshold check (optional)
  // If a work-package ID is provided, verify evaluator scores don't regress
  // from historical high scores. This is a gate-level check, separate from
  // the full ratchet evaluation in evaluateRatchet().
  let ratchetViolation: HybridVerdictItem | null = null;

  if (options.ratchetWorkPackageId && evaluatorResults) {
    const ratchetRegistry = loadRatchetRegistry(projectRoot);
    const ratchetConfig = ratchetRegistry[options.ratchetWorkPackageId];

    if (ratchetConfig?.enabled) {
      const higherIsBetter = ratchetConfig.higherIsBetter ?? false;

      // Check each evaluator's score against ratchet threshold
      for (const exec of evaluatorResults.executions) {
        if (exec.status === 'completed' && exec.result) {
          const meets = meetsRatchetThreshold(
            projectRoot,
            options.ratchetWorkPackageId,
            exec.name,
            exec.result.score,
            higherIsBetter,
          );

          if (!meets) {
            ratchetViolation = {
              source: 'evaluator',
              id: `ratchet-${exec.name}`,
              passed: false,
              message: `Ratchet violation: "${exec.name}" score ${exec.result.score} regressed from historical high`,
              score: exec.result.score,
            };
            // One violation is enough to fail the gate
            break;
          }
        }
      }
    }
  }

  if (ratchetViolation) {
    items.push(ratchetViolation);
    // Ratchet violation overrides conclusion to rejected
    return {
      conclusion: 'rejected',
      evaluatorResults,
      llmResult,
      items,
      evaluatorSummaryForLlm: evaluatorSummary,
      evaluatedAt: new Date().toISOString(),
    };
  }

  return {
    conclusion,
    evaluatorResults,
    llmResult,
    items,
    evaluatorSummaryForLlm: evaluatorSummary,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Convert an existing GateVerdict into an LlmEvaluationResult.
 *
 * Utility for integrating hybrid evaluation with existing gate infrastructure.
 */
export function gateVerdictToLlmResult(verdict: GateVerdict): LlmEvaluationResult {
  return {
    conclusion: verdict.conclusion,
    issues: verdict.blockers.map((b) => `[${b.owner}] ${b.item}`),
    skipped: false,
  };
}
