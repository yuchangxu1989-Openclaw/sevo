import { GateEngine } from './gate-engine.js';
import type { GateRule } from './gate-rule.js';
import { createSpecReviewGateRules } from './built-in-rules.js';
import type { SemanticRuleOptions } from './rules/semantic-rule-utils.js';

/**
 * Runtime default GateEngine with spec-review-gate LLM semantic rules wired in.
 * Passing a custom GateEngine to runtime constructors intentionally bypasses this default.
 */
export function createSpecReviewGateEngine(options?: SemanticRuleOptions): GateEngine {
  const engine = new GateEngine();
  registerSpecReviewGateRules(engine, options);
  return engine;
}

export function registerSpecReviewGateRules(engine: GateEngine, options?: SemanticRuleOptions): void {
  for (const rule of createSpecReviewGateRules(options)) {
    engine.registerRule(rule as GateRule);
  }
}
