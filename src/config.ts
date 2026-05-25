/**
 * SEVO Configuration — defines, merges, and validates SevoConfig.
 */

import type { StageId } from './types/index.js';
import { DEFAULT_STAGES } from './constants.js';
import type { PipelineRole } from './role-registry/index.js';
import type { EvaluatorConfig } from './evaluators/evaluator-types.js';

/** Rule configuration for gate evaluation. */
export interface GateRuleConfig {
  ruleId: string;
  appliesTo: StageId[];
  severity: 'blocker' | 'warning';
  params?: Record<string, unknown>;
}

/** Endgame delivery chain configuration (AC-19.12). */
export interface EndgameDeliveryConfig {
  /** Master switch for the entire endgame chain. */
  enabled: boolean;
  /** Auto-generate README after review passes. */
  autoReadme: boolean;
  /** Auto-verify README CLI commands are real before publish (B10). Default: true. */
  autoReadmeHonesty?: boolean;
  /** CLI binary name for README honesty check. If unset, derived from package.json bin field. */
  readmeHonestyCliBin?: string;
  /** Auto-publish (npm/platform) after README. */
  autoPublish: boolean;
  /** Auto-run gap scan after publish. */
  autoGapScan: boolean;
}

/** Role assignment configuration (FR-22, AC-22.6/AC-22.7). */
export interface RoleAssignmentConfig {
  /** Explicit agentId → role mapping. */
  agentRoles?: Record<string, PipelineRole>;
  /** FR-14: role pools for host adapters that group agents by responsibility. */
  roles?: Partial<Record<'product' | 'ux' | 'architect' | 'coder' | 'auditor', string[]>>;
  /** Custom stage → required role overrides. */
  stageRoles?: Record<string, PipelineRole>;
  /** Whether missing roles were automatically filled by init fallback (AC-22.9). */
  autoFallback?: boolean;
  /** Agent used when a required role has no dedicated match in the host. */
  fallbackAgentId?: string;
  /** Additional naming convention patterns for role inference. */
  namingPatterns?: Array<{ pattern: string; role: PipelineRole }>;
}

/** Agent action level for progressive disclosure (AC-15.7). */
export type ActionLevel = 'L0' | 'L1' | 'L2';

/**
 * AC-15.7: Action level classification.
 * L0 — no confirmation (file read/write, build, test, code generation)
 * L1 — execute then notify (config changes, dependency install, branch creation)
 * L2 — confirm before execute (publish, delete, external comms, production changes)
 */
export interface ActionLevelConfig {
  /** Operations that execute without confirmation. */
  L0: string[];
  /** Operations that execute then notify the user. */
  L1: string[];
  /** Operations that require user confirmation before execution. */
  L2: string[];
}

/** Default action level assignments (AC-15.7). */
export const DEFAULT_ACTION_LEVELS: ActionLevelConfig = {
  L0: ['file-read', 'file-write', 'build', 'test', 'code-generation', 'lint'],
  L1: ['config-change', 'dependency-install', 'branch-create', 'branch-switch'],
  L2: ['publish', 'delete', 'external-communication', 'production-deploy', 'data-migration'],
};

/** Evaluator registration per stage (FR-23, AC-23.1). */
export type EvaluatorRegistryConfig = Record<string, EvaluatorConfig[]>;

export interface PdcaCheckScheduleConfig {
  enabled: boolean;
  cron: string;
}

/** Top-level SEVO configuration. */
export interface SevoConfig {
  projectName: string;
  specPath?: string;
  arcPath?: string;
  stages: StageId[];
  rules: GateRuleConfig[];
  adapter: 'openclaw' | 'standalone';
  /** Endgame delivery chain settings (AC-19.12). */
  endgameDelivery: EndgameDeliveryConfig;
  /** Pipeline notification settings (AC-19.8 / AC-19.9). */
  notification?: NotificationConfig;
  /** Role assignment configuration (FR-22). */
  roleAssignment?: RoleAssignmentConfig;
  /** AC-22.10: false = warn/degrade on role gaps; true = fail closed on role mismatch. */
  strictRoleMatching: boolean;
  /** AC-15.7: Agent action level classification. */
  actionLevels: ActionLevelConfig;
  /** FR-23: Evaluator registry — stage name → evaluator list. */
  evaluators?: EvaluatorRegistryConfig;
  /** PDCA check schedule registered by init; default daily 06:00. */
  pdcaCheck?: PdcaCheckScheduleConfig;
}

/** Notification configuration (FR-19). */
export interface NotificationConfig {
  /** Whether notifications are enabled (default: false; OpenClaw host auto-enables). */
  enabled: boolean;
  /** Which adapter to use for delivery. */
  adapter: 'openclaw' | 'standalone';
  /** Feishu user ID for the OpenClaw adapter. */
  userId?: string;
}

/** Default endgame delivery config — all steps enabled. */
export const DEFAULT_ENDGAME_DELIVERY: EndgameDeliveryConfig = {
  enabled: true,
  autoReadme: true,
  autoReadmeHonesty: true,
  autoPublish: true,
  autoGapScan: true,
};

const DEFAULT_NOTIFICATION: NotificationConfig = {
  enabled: false,
  adapter: 'standalone',
};

const DEFAULT_PDCA_CHECK: PdcaCheckScheduleConfig = {
  enabled: true,
  cron: '0 6 * * *',
};

const DEFAULT_CONFIG: SevoConfig = {
  projectName: 'unnamed',
  stages: DEFAULT_STAGES,
  rules: [],
  adapter: 'standalone',
  endgameDelivery: DEFAULT_ENDGAME_DELIVERY,
  notification: DEFAULT_NOTIFICATION,
  strictRoleMatching: false,
  actionLevels: DEFAULT_ACTION_LEVELS,
  evaluators: {},
  pdcaCheck: DEFAULT_PDCA_CHECK,
};

/**
 * Deep-merge a partial config over defaults.
 * Arrays are replaced (not concatenated).
 */
export function mergeConfig(
  partial: Partial<SevoConfig>,
  defaults: SevoConfig = DEFAULT_CONFIG,
): SevoConfig {
  return {
    ...defaults,
    ...partial,
    // Explicit fields that should only override when provided
    stages: partial.stages ?? defaults.stages,
    rules: partial.rules ?? defaults.rules,
    adapter: partial.adapter ?? defaults.adapter,
    endgameDelivery: partial.endgameDelivery
      ? { ...defaults.endgameDelivery, ...partial.endgameDelivery }
      : defaults.endgameDelivery,
    notification: partial.notification
      ? { ...DEFAULT_NOTIFICATION, ...partial.notification }
      : defaults.notification,
    roleAssignment: partial.roleAssignment
      ? { ...defaults.roleAssignment, ...partial.roleAssignment }
      : defaults.roleAssignment,
    strictRoleMatching: partial.strictRoleMatching ?? defaults.strictRoleMatching ?? false,
    actionLevels: partial.actionLevels
      ? { ...defaults.actionLevels, ...partial.actionLevels }
      : defaults.actionLevels,
    evaluators: partial.evaluators ?? defaults.evaluators,
    pdcaCheck: partial.pdcaCheck
      ? { ...DEFAULT_PDCA_CHECK, ...partial.pdcaCheck }
      : defaults.pdcaCheck,
  };
}

/** Validate a SevoConfig, returning errors if invalid. */
export function validateConfig(config: SevoConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.projectName || config.projectName.trim() === '') {
    errors.push('projectName must be a non-empty string');
  }

  if (!Array.isArray(config.stages) || config.stages.length === 0) {
    errors.push('stages must be a non-empty array');
  }

  if (!Array.isArray(config.rules)) {
    errors.push('rules must be an array');
  }

  if (config.adapter !== 'openclaw' && config.adapter !== 'standalone') {
    errors.push(`adapter must be 'openclaw' or 'standalone', got '${config.adapter as string}'`);
  }

  if (typeof config.strictRoleMatching !== 'boolean') {
    errors.push('strictRoleMatching must be a boolean');
  }

  for (const rule of config.rules) {
    if (!rule.ruleId || rule.ruleId.trim() === '') {
      errors.push('Each rule must have a non-empty ruleId');
    }
    if (!Array.isArray(rule.appliesTo) || rule.appliesTo.length === 0) {
      errors.push(`Rule '${rule.ruleId}' must have a non-empty appliesTo array`);
    }
  }

  return { valid: errors.length === 0, errors };
}
