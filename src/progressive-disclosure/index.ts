/**
 * Progressive Disclosure — L2/L3 barrel export.
 *
 * L2: Custom Stage Registry (user-defined stages + insertion)
 * L3: Programmatic SDK API (code-level pipeline control)
 *
 * (spec §FR-15)
 */

// ── CLI maturity helpers (FR-15) ────────────────────────────────
export {
  detectCliUsage,
  detectCliMaturity,
  commandExposureFor,
  recordCliCommandUsage,
  configureProgressiveHelp,
} from './cli-maturity.js';
export type {
  CliMaturityLevel,
  CliUsageSnapshot,
  CliCommandExposure,
} from './cli-maturity.js';

// ── L2: Custom Stage Registry ───────────────────────────────────
export { CustomStageRegistry } from './custom-stage.js';
export type {
  CustomStageDefinition,
  CustomStageRegistrationResult,
  CustomGateRule,
  InsertPosition,
} from './custom-stage.js';

// ── L3: Programmatic SDK ────────────────────────────────────────
export { SevoSDK } from './sdk.js';
export type {
  CreatePipelineOptions,
  CompleteStageOptions,
  PipelineStatusInfo,
  SevoSDKOptions,
} from './sdk.js';

// ── Default Config (AC-15F.3) ───────────────────────────────────
export { getDefaultConfig, CONFIG_LEVELS } from './default-config.js';
export type { ConfigLevel } from './default-config.js';
