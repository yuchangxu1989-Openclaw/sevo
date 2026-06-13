/**
 * Role-Stage Validator — enforces role-task matching at dispatch time.
 *
 * AC-22.1: Each stage declares requiredRole.
 * AC-22.2: Pre-dispatch validation of agent role vs stage requirement.
 * AC-22.3: Audit event generation on mismatch.
 * AC-22.4: Multi-agent mode blocks mismatched dispatch only in strict mode.
 * AC-22.5: Single-agent mode degrades to warning (no block).
 */

import type { StageId } from '../types/index.js';
import type { PipelineRole, RoleRegistry } from './role-registry.js';

// ── Default Stage → Required Role mapping (AC-22.1) ─────────────

const DEFAULT_STAGE_ROLES: Readonly<Record<string, PipelineRole>> = {
  'spec': 'Product',
  'spec-review-gate': 'Product',
  'commercial-acceptance-authoring': 'Product',
  'pm-commercial-review': 'Product',

  'ux-acceptance-authoring': 'UX',
  'ux-acceptance': 'UX',

  'contract': 'Architect',
  'contract-review-gate': 'Architect',

  'implement': 'Coder',
  'smoke-test': 'Coder',
  'test-case-authoring': 'Coder',

  'review': 'Auditor',
  'regression': 'Auditor',

  'publish-generalization-gate': 'Any',
  'deploy': 'Any',
  'verify': 'Any',
  'post-release-validation': 'Any',
  'ledger': 'Any',
};

/** Audit event emitted on role mismatch (AC-22.3). */
export interface RoleMismatchEvent {
  timestamp: string;
  agentId: string;
  stage: StageId;
  requiredRole: PipelineRole;
  actualRole: PipelineRole | null;
  action: 'denied' | 'warning' | 'role-degraded';
  reason: string;
}

/** Result of a role validation check. */
export interface RoleValidationResult {
  allowed: boolean;
  mismatchEvent: RoleMismatchEvent | null;
}

export interface RoleStageValidatorConfig {
  /** Custom stage → required role overrides (AC-22.7). */
  stageRoles?: Record<string, PipelineRole>;
  /** Whether the environment has multiple agents available. */
  multiAgent?: boolean;
  /** AC-22.10: true blocks role mismatches; false warns/degrades. */
  strictRoleMatching?: boolean;
}

export class RoleStageValidator {
  private readonly stageRoles: Readonly<Record<string, PipelineRole>>;
  private readonly multiAgent: boolean;
  private readonly strictRoleMatching: boolean;
  private readonly registry: RoleRegistry;

  constructor(registry: RoleRegistry, config?: RoleStageValidatorConfig) {
    this.registry = registry;
    this.multiAgent = config?.multiAgent ?? true;
    this.strictRoleMatching = config?.strictRoleMatching ?? false;
    // AC-22.7: Merge custom stage roles over defaults
    this.stageRoles = config?.stageRoles
      ? { ...DEFAULT_STAGE_ROLES, ...config.stageRoles }
      : DEFAULT_STAGE_ROLES;
  }

  /**
   * Get the required role for a pipeline stage (AC-22.1).
   * Returns 'Any' for stages without explicit role requirements.
   */
  getRequiredRole(stageId: StageId): PipelineRole {
    return this.stageRoles[stageId] ?? 'Any';
  }

  /**
   * Validate whether an agent can be dispatched to a stage (AC-22.2).
   *
   * AC-22.4: In multi-agent strict mode, mismatch → denied.
   * AC-22.4/AC-22.5: Default mode and single-agent mode degrade to warning (allowed).
   */
  validate(agentId: string, stageId: StageId): RoleValidationResult {
    const requiredRole = this.getRequiredRole(stageId);
    const actualRole = this.registry.resolveRole(agentId);

    if (this.registry.matches(actualRole, requiredRole)) {
      return { allowed: true, mismatchEvent: null };
    }

    // Mismatch detected
    const denied = this.multiAgent && this.strictRoleMatching;
    const action: 'denied' | 'warning' | 'role-degraded' = denied
      ? 'denied'
      : (this.multiAgent ? 'role-degraded' : 'warning');

    const mismatchEvent: RoleMismatchEvent = {
      timestamp: new Date().toISOString(),
      agentId,
      stage: stageId,
      requiredRole,
      actualRole,
      action,
      reason: `Agent '${agentId}' has role '${actualRole ?? 'unknown'}' but stage '${stageId}' requires '${requiredRole}'`,
    };

    return {
      allowed: !denied,
      mismatchEvent,
    };
  }

  /**
   * List all stage → required role mappings.
   */
  listStageRoles(): Array<{ stageId: string; requiredRole: PipelineRole }> {
    return Object.entries(this.stageRoles).map(([stageId, requiredRole]) => ({
      stageId,
      requiredRole,
    }));
  }

  /**
   * Check if running in multi-agent mode.
   */
  isMultiAgent(): boolean {
    return this.multiAgent;
  }
}
