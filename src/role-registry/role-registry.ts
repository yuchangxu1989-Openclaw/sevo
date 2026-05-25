/**
 * Role Registry — resolves agent roles from config + naming convention.
 *
 * AC-22.6: Dual-source role resolution:
 *   1. Explicit config mapping (agentId → role)
 *   2. AgentId naming convention (prefix-based: pm-01 → Product, audit-01 → Auditor)
 *
 * AC-22.7: Role mappings are fully configurable via SevoConfig.
 */

/** Pipeline role that maps to stage requirements. */
export type PipelineRole =
  | 'Product'
  | 'UX'
  | 'Architect'
  | 'Coder'
  | 'Auditor'
  | 'Any';

/** Naming convention patterns for role inference from agentId. */
const DEFAULT_NAMING_PATTERNS: ReadonlyArray<{ pattern: RegExp; role: PipelineRole }> = [
  { pattern: /^pm[-_]/i, role: 'Product' },
  { pattern: /^product[-_]/i, role: 'Product' },
  { pattern: /^ux[-_]/i, role: 'UX' },
  { pattern: /^design[-_]/i, role: 'UX' },
  { pattern: /^sa[-_]/i, role: 'Architect' },
  { pattern: /^arch[-_]/i, role: 'Architect' },
  { pattern: /^dev[-_]/i, role: 'Coder' },
  { pattern: /^code[-_]/i, role: 'Coder' },
  { pattern: /^free[-_]?code/i, role: 'Coder' },
  { pattern: /^cc$/i, role: 'Coder' },
  { pattern: /^opencode/i, role: 'Coder' },
  { pattern: /^codex/i, role: 'Coder' },
  { pattern: /^hermes/i, role: 'Coder' },
  { pattern: /^audit[-_]/i, role: 'Auditor' },
  { pattern: /^review[-_]/i, role: 'Auditor' },
];

export interface RoleRegistryConfig {
  /** Explicit agentId → role mapping (highest priority). */
  agentRoles?: Record<string, PipelineRole>;
  /** Additional naming convention patterns (merged with defaults). */
  namingPatterns?: Array<{ pattern: string; role: PipelineRole }>;
}

export class RoleRegistry {
  private readonly agentRoles: Record<string, PipelineRole>;
  private readonly namingPatterns: ReadonlyArray<{ pattern: RegExp; role: PipelineRole }>;

  constructor(config?: RoleRegistryConfig) {
    this.agentRoles = config?.agentRoles ?? {};

    // Merge custom patterns (prepended so they take priority) with defaults
    const customPatterns = (config?.namingPatterns ?? []).map((p) => ({
      pattern: new RegExp(p.pattern, 'i'),
      role: p.role,
    }));
    this.namingPatterns = [...customPatterns, ...DEFAULT_NAMING_PATTERNS];
  }

  /**
   * Resolve the role for a given agentId.
   * Priority: explicit config > naming convention > null.
   */
  resolveRole(agentId: string): PipelineRole | null {
    // 1. Explicit config mapping
    const explicit = this.agentRoles[agentId];
    if (explicit) return explicit;

    // 2. Naming convention
    for (const { pattern, role } of this.namingPatterns) {
      if (pattern.test(agentId)) return role;
    }

    return null;
  }

  /**
   * Check if an agent's role matches a required role.
   * 'Any' always matches. null role (unknown agent) does not match.
   */
  matches(agentRole: PipelineRole | null, requiredRole: PipelineRole): boolean {
    if (requiredRole === 'Any') return true;
    if (agentRole === null) return false;
    return agentRole === requiredRole;
  }

  /**
   * List all known agent-role assignments (config-based only).
   */
  listExplicitRoles(): Record<string, PipelineRole> {
    return { ...this.agentRoles };
  }
}
