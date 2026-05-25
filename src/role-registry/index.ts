/**
 * Role Registry module — role resolution and stage-dispatch validation.
 * (FR-22: Role-Task Matching Dispatch Constraints)
 */

export { RoleRegistry } from './role-registry.js';
export type { PipelineRole, RoleRegistryConfig } from './role-registry.js';

export { RoleStageValidator } from './role-stage-validator.js';
export type {
  RoleMismatchEvent,
  RoleValidationResult,
  RoleStageValidatorConfig,
} from './role-stage-validator.js';

export { RoleTaskMatcher, RoleDispatchBlockedError, validateDispatchMatrix } from './role-task-matcher.js';
export type {
  RoleTaskMatcherConfig,
  RoleTaskMatchRequest,
  RoleTaskMatchResult,
  DispatchMatrixCell,
  DispatchMatrixReport,
} from './role-task-matcher.js';
