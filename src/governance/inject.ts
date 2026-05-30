/**
 * Governance injection orchestrator (FR-28).
 *
 * Main entry point for governance enforcement injection during `sevo init`.
 * Detects the host environment, selects the appropriate adapter,
 * injects SEVO governance rules, and reports results.
 */

import type { HostAdapter } from '../cli/cmd-init.js';
import type {
  GovernanceAdapter,
  GovernanceInjectionResult,
} from './adapter.js';
import { DispatchGuardAdapter } from './dispatch-guard-adapter.js';
import { StandaloneGuardAdapter } from './standalone-guard.js';
import { SEVO_GOVERNANCE_RULES } from './rules.js';

/** Options for governance injection. */
export interface GovernanceInjectOptions {
  /** Project root directory. */
  projectRoot: string;
  /** Detected host adapter type. */
  hostAdapter: HostAdapter;
  /** Whether governance is enabled (AC-28.8). */
  enabled?: boolean;
}

/**
 * Select the appropriate GovernanceAdapter based on host environment.
 */
export function selectAdapter(projectRoot: string, hostAdapter: HostAdapter): GovernanceAdapter {
  if (hostAdapter === 'openclaw') {
    const dgAdapter = new DispatchGuardAdapter();
    const detection = dgAdapter.detect(projectRoot);
    if (detection.exists) {
      return dgAdapter;
    }
  }

  // Fallback: standalone guard for any environment without dispatch-guard
  return new StandaloneGuardAdapter();
}

/**
 * Inject SEVO governance rules into the host environment.
 *
 * This is the main function called by `sevo init` (AC-28.11).
 * It is idempotent (AC-28.9) — repeated calls do not duplicate rules.
 *
 * @returns Injection result with summary for CLI output (AC-28.7).
 */
export function injectGovernance(options: GovernanceInjectOptions): GovernanceInjectionResult {
  const { projectRoot, hostAdapter, enabled = true } = options;

  // AC-28.8: If governance is disabled, skip injection
  if (!enabled) {
    return {
      success: true,
      mechanism: hostAdapter === 'openclaw' ? 'dispatch-guard' : 'sevo-guard',
      rulesInjected: 0,
      rulesSkipped: 0,
      summary: 'Governance enforcement is disabled (governance.enabled = false).',
      managedTaskTypes: [],
      exemptions: [],
      disableInstruction: 'sevo config set governance.enabled false',
    };
  }

  const adapter = selectAdapter(projectRoot, hostAdapter);
  const result = adapter.inject(projectRoot, SEVO_GOVERNANCE_RULES);

  return result;
}

/**
 * Print governance injection status to console (AC-28.7).
 */
export function printGovernanceStatus(result: GovernanceInjectionResult): void {
  console.log('\nGovernance enforcement:');

  if (result.rulesInjected === 0 && result.rulesSkipped === 0) {
    console.log(`  ⏭️  ${result.summary}`);
    return;
  }

  const icon = result.success ? '✅' : '❌';
  console.log(`  ${icon} ${result.summary}`);
  console.log(`  • Mechanism: ${result.mechanism}`);
  console.log(`  • Managed task types: ${result.managedTaskTypes.join(', ')}`);

  if (result.exemptions.length > 0) {
    console.log('  • Exemptions:');
    for (const exemption of result.exemptions) {
      console.log(`    - ${exemption}`);
    }
  }

  console.log(`  • To disable: ${result.disableInstruction}`);
}
