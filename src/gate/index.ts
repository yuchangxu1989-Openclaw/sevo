export { evaluate, GateEngine, assessGoalAlignment } from './gate-engine.js';
export type { GateRuleConfig } from './gate-engine.js';
export { aggregate, aggregateRuleResults } from './verdict-aggregator.js';
export type { AggregatedVerdict } from './verdict-aggregator.js';
export {
  getGateConfig,
  getRequiredRoles,
  findMissingRoles,
} from './review-role-assigner.js';
export type {
  ReviewRole,
  DimensionPriority,
  GateConfig,
  ReviewDimension,
} from './review-role-assigner.js';
export type { GateRule } from './gate-rule.js';
export {
  FileExistsRule,
  TypeCheckRule,
  TestPassRule,
  MinCoverageRule,
  createSpecReviewGateRules,
  SpecSectionsRule,
  FrValidationCriteriaRule,
  FrTraceabilityRule,
} from './built-in-rules.js';
