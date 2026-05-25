/**
 * Role-Task Matcher — standalone FR-22 pre-dispatch validation facade.
 *
 * Keeps role-task matching reusable outside the stage runner/compliance path:
 * callers provide an agent and a target stage, the matcher resolves role
 * assignment and returns an allow/block decision with an auditable mismatch
 * event when needed.
 */

import type { StageId } from '../types/index.js';
import type { PipelineRole, RoleRegistryConfig } from './role-registry.js';
import { RoleRegistry } from './role-registry.js';
import {
  RoleStageValidator,
  type RoleMismatchEvent,
  type RoleStageValidatorConfig,
  type RoleValidationResult,
} from './role-stage-validator.js';

export interface RoleTaskMatcherConfig extends RoleRegistryConfig, RoleStageValidatorConfig {
  /** Agent IDs to include in standalone dispatch-matrix validation. Defaults to keys of agentRoles. */
  agentIds?: string[];
  /** Host-selected fallback agent for degraded dispatch. Defaults to first available agent. */
  fallbackAgentId?: string;
}

export interface RoleTaskMatchRequest {
  agentId: string;
  stageId: StageId;
  taskLabel?: string;
  taskDescription?: string;
}

export interface RoleTaskMatchResult extends RoleValidationResult {
  agentId: string;
  stageId: StageId;
  requiredRole: PipelineRole;
  actualRole: PipelineRole | null;
  /** Agent that should run the task after adaptive degradation. */
  dispatchAgentId: string;
  /** Trust level for degraded execution. */
  trustLevel: 'normal' | 'low';
  /** Whether dispatch fell back because the requested role/agent was unavailable. */
  degraded: boolean;
}

export interface DispatchMatrixCell {
  stageId: StageId;
  agentId: string;
  requiredRole: PipelineRole;
  actualRole: PipelineRole | null;
  decision: 'allowed' | 'warned' | 'blocked' | 'role-degraded';
  dispatchAgentId: string;
  trustLevel: 'normal' | 'low';
}

export interface DispatchMatrixReport {
  matrix: DispatchMatrixCell[];
  violations: RoleMismatchEvent[];
  coverage: { stagesWithMatchedAgent: number; totalStages: number };
  fallbackAgentId?: string;
  trustLevel: 'normal' | 'low';
}

export class RoleDispatchBlockedError extends Error {
  constructor(public readonly event: RoleMismatchEvent) {
    super(event.reason);
    this.name = 'RoleDispatchBlockedError';
  }
}

export class RoleTaskMatcher {
  private readonly registry: RoleRegistry;
  private readonly validator: RoleStageValidator;
  private readonly agentIds: string[];
  private readonly fallbackAgentId?: string;
  private readonly strictRoleMatching: boolean;

  constructor(config?: RoleTaskMatcherConfig) {
    this.registry = new RoleRegistry({
      agentRoles: config?.agentRoles,
      namingPatterns: config?.namingPatterns,
    });
    this.agentIds = config?.agentIds ?? Object.keys(config?.agentRoles ?? {});
    this.fallbackAgentId = config?.fallbackAgentId ?? this.agentIds[0];
    this.strictRoleMatching = config?.strictRoleMatching ?? false;
    this.validator = new RoleStageValidator(this.registry, {
      stageRoles: config?.stageRoles,
      multiAgent: config?.multiAgent,
      strictRoleMatching: this.strictRoleMatching,
    });
  }

  match(request: RoleTaskMatchRequest): RoleTaskMatchResult {
    const requiredRole = this.validator.getRequiredRole(request.stageId);
    const actualRole = this.registry.resolveRole(request.agentId);
    const validation = this.validator.validate(request.agentId, request.stageId);

    const degraded = Boolean(validation.mismatchEvent && validation.allowed);
    const dispatchAgentId = degraded ? (this.fallbackAgentId ?? request.agentId) : request.agentId;

    return {
      ...validation,
      agentId: request.agentId,
      stageId: request.stageId,
      requiredRole,
      actualRole,
      dispatchAgentId,
      trustLevel: degraded ? 'low' : 'normal',
      degraded,
      mismatchEvent: validation.mismatchEvent
        ? this.withTaskContext(validation.mismatchEvent, request, dispatchAgentId, degraded)
        : null,
    };
  }

  assertAllowed(request: RoleTaskMatchRequest): RoleTaskMatchResult {
    const result = this.match(request);
    if (!result.allowed) {
      const event = result.mismatchEvent;
      if (event) throw new RoleDispatchBlockedError(event);
      throw new RoleDispatchBlockedError({
        timestamp: new Date().toISOString(),
        agentId: request.agentId,
        stage: request.stageId,
        requiredRole: result.requiredRole,
        actualRole: result.actualRole,
        action: 'blocked',
        reason: `Agent '${request.agentId}' cannot run stage '${request.stageId}'`,
      });
    }
    return result;
  }

  getRequiredRole(stageId: StageId): PipelineRole {
    return this.validator.getRequiredRole(stageId);
  }

  isMultiAgent(): boolean {
    return this.validator.isMultiAgent();
  }

  listStageRoles(): Array<{ stageId: string; requiredRole: PipelineRole }> {
    return this.validator.listStageRoles();
  }

  validateDispatchMatrix(agentIds: string[]): DispatchMatrixReport {
    const stageRoles = this.validator.listStageRoles();
    const matrix: DispatchMatrixCell[] = [];
    const violations: RoleMismatchEvent[] = [];
    let stagesWithMatch = 0;

    for (const { stageId, requiredRole } of stageRoles) {
      let stageHasMatch = false;
      for (const agentId of agentIds) {
        const result = this.match({ agentId, stageId: stageId as StageId });
        let decision: 'allowed' | 'warned' | 'blocked' | 'role-degraded';
        if (result.allowed && !result.mismatchEvent) {
          decision = 'allowed';
          stageHasMatch = true;
        } else if (result.allowed && result.mismatchEvent) {
          decision = result.degraded ? 'role-degraded' : 'warned';
          stageHasMatch = true;
          violations.push(result.mismatchEvent);
        } else {
          decision = 'blocked';
          if (result.mismatchEvent) violations.push(result.mismatchEvent);
        }
        matrix.push({
          stageId: stageId as StageId,
          agentId,
          requiredRole,
          actualRole: result.actualRole,
          decision,
          dispatchAgentId: result.dispatchAgentId,
          trustLevel: result.trustLevel,
        });
      }
      if (stageHasMatch) stagesWithMatch++;
    }

    return {
      matrix,
      violations,
      coverage: { stagesWithMatchedAgent: stagesWithMatch, totalStages: stageRoles.length },
      fallbackAgentId: this.fallbackAgentId,
      trustLevel: violations.length > 0 && !this.strictRoleMatching ? 'low' : 'normal',
    };
  }

  private withTaskContext(
    event: RoleMismatchEvent,
    request: RoleTaskMatchRequest,
    dispatchAgentId: string,
    degraded: boolean,
  ): RoleMismatchEvent {
    const context = [request.taskLabel, request.taskDescription]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' — ');

    const fallbackContext = degraded
      ? `Fallback dispatch agent '${dispatchAgentId}', trust-level: low`
      : '';
    const suffix = [context ? `Task: ${context}` : '', fallbackContext].filter(Boolean).join('. ');
    if (!suffix) return event;

    return {
      ...event,
      reason: `${event.reason}. ${suffix}`,
    };
  }
}


/**
 * Standalone FR-22 validation entry point for doctor/CI usage.
 * Builds a complete stage × agent dispatch matrix from role config.
 */
export function validateDispatchMatrix(config: RoleTaskMatcherConfig): DispatchMatrixReport {
  const agentIds = config.agentIds ?? Object.keys(config.agentRoles ?? {});
  const multiAgent = config.multiAgent ?? agentIds.length > 1;
  return new RoleTaskMatcher({ ...config, multiAgent }).validateDispatchMatrix(agentIds);
}
