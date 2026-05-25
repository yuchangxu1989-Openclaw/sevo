/**
 * GovernanceAdapter — interface for governance enforcement injection (FR-28, AC-28.10).
 *
 * Decouples SEVO governance logic from specific host implementations.
 * Non-OpenClaw hosts can implement this interface to integrate with SEVO governance.
 */

/** A single governance rule that SEVO injects. */
export interface GovernanceRule {
  /** Unique rule identifier (e.g., 'sevo:new-feature-requires-pipeline'). */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Task types this rule applies to (e.g., 'code', 'spec', 'architecture'). */
  taskTypes: string[];
  /** Action to take when rule matches: 'block' or 'warn'. */
  action: 'block' | 'warn';
  /** Message shown to the user when the rule triggers. */
  message: string;
  /** Conditions under which this rule is exempt. */
  exemptions?: GovernanceExemption[];
}

/** Exemption condition for a governance rule. */
export interface GovernanceExemption {
  /** Exemption identifier. */
  id: string;
  /** Human-readable reason. */
  reason: string;
  /** Condition type. */
  type: 'label' | 'file-pattern' | 'flag';
  /** Pattern or value to match. */
  value: string;
}

/** Result of a governance injection attempt. */
export interface GovernanceInjectionResult {
  /** Whether injection succeeded. */
  success: boolean;
  /** Which mechanism was used. */
  mechanism: 'dispatch-guard' | 'sevo-guard' | 'custom';
  /** Number of rules injected (0 if all already existed). */
  rulesInjected: number;
  /** Number of rules that already existed (idempotency). */
  rulesSkipped: number;
  /** Human-readable summary for CLI output. */
  summary: string;
  /** Managed task types. */
  managedTaskTypes: string[];
  /** Active exemptions. */
  exemptions: string[];
  /** How to disable governance. */
  disableInstruction: string;
}

/** Detection result for existing governance mechanisms. */
export interface GovernanceDetection {
  /** Whether a governance mechanism exists in the host. */
  exists: boolean;
  /** Type of mechanism detected. */
  type: 'dispatch-guard' | 'sevo-guard' | 'none';
  /** Path to the configuration file (if any). */
  configPath?: string;
}

/**
 * GovernanceAdapter interface (AC-28.10).
 *
 * Implementations detect, inject, and verify governance rules
 * in a host-specific manner.
 */
export interface GovernanceAdapter {
  /** Detect whether a governance mechanism already exists. */
  detect(projectRoot: string): GovernanceDetection;

  /** Inject SEVO governance rules into the host. Idempotent (AC-28.9). */
  inject(projectRoot: string, rules: GovernanceRule[]): GovernanceInjectionResult;

  /** Verify that injected rules are active and functional. */
  verify(projectRoot: string): { active: boolean; message: string };
}
