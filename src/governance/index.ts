/**
 * Governance module public API (FR-28, FR-35).
 */

export type {
  GovernanceAdapter,
  GovernanceDetection,
  GovernanceExemption,
  GovernanceInjectionResult,
  GovernanceRule,
} from './adapter.js';

export { DispatchGuardAdapter } from './dispatch-guard-adapter.js';
export { StandaloneGuardAdapter } from './standalone-guard.js';
export type { SevoGuardConfig } from './standalone-guard.js';
export { SEVO_GOVERNANCE_RULES } from './rules.js';
export {
  injectGovernance,
  printGovernanceStatus,
  selectAdapter,
} from './inject.js';
export type { GovernanceInjectOptions } from './inject.js';

// ── FR-35: Pipeline Interceptor ─────────────────────────────────
export { PipelineInterceptor } from './pipeline-interceptor.js';
export type {
  RegisteredProject,
  SpawnInterceptContext,
  InterceptAction,
  InterceptResult,
  PipelineInstanceStore,
  InterceptAuditEvent,
  PipelineInterceptorConfig,
} from './pipeline-interceptor.js';

// ── FR-35: Stranger-Ready Gate ──────────────────────────────────
export {
  evaluateStrangerReadyGate,
  shouldBlockPublish,
  formatGateResult,
} from './stranger-ready-gate.js';
export type {
  StrangerReadyGateConfig,
  StrangerReadyGateInput,
  StrangerReadyGateResult,
} from './stranger-ready-gate.js';

// ── SEVO Exemption Check (L2 Interceptor) ───────────────────────
export { checkSevoExemption } from './check-sevo-exemption.js';
export type { ExemptionResult } from './check-sevo-exemption.js';
