/**
 * Standalone sevo-guard implementation (FR-28, AC-28.2).
 *
 * When no dispatch-guard plugin exists, SEVO creates a minimal
 * standalone governance config file that can be consumed by
 * a lightweight sevo-guard mechanism.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  GovernanceAdapter,
  GovernanceDetection,
  GovernanceInjectionResult,
  GovernanceRule,
} from './adapter.js';

/** Shape of the standalone sevo-guard config. */
export interface SevoGuardConfig {
  /** Version of the config schema. */
  version: 1;
  /** Whether governance is enabled. */
  enabled: boolean;
  /** Source identifier. */
  source: 'sevo-governance';
  /** Governance rules. */
  rules: GovernanceRule[];
  /** Timestamp of last injection. */
  lastUpdated: string;
}

/** Default filename for standalone guard config. */
const SEVO_GUARD_FILENAME = 'sevo-guard.json';

/**
 * Standalone sevo-guard adapter.
 * Creates a self-contained governance config when no host mechanism exists.
 */
export class StandaloneGuardAdapter implements GovernanceAdapter {
  detect(projectRoot: string): GovernanceDetection {
    const configPath = path.join(projectRoot, SEVO_GUARD_FILENAME);
    if (fs.existsSync(configPath)) {
      return {
        exists: true,
        type: 'sevo-guard',
        configPath,
      };
    }
    return { exists: false, type: 'none' };
  }

  inject(projectRoot: string, rules: GovernanceRule[]): GovernanceInjectionResult {
    const configPath = path.join(projectRoot, SEVO_GUARD_FILENAME);
    const allTaskTypes = new Set<string>();
    const allExemptions = new Set<string>();

    // Load existing config if present (idempotency — AC-28.9)
    let existing: SevoGuardConfig | null = null;
    if (fs.existsSync(configPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SevoGuardConfig;
      } catch {
        existing = null;
      }
    }

    const existingRuleIds = new Set(
      (existing?.rules ?? []).map((r) => r.id),
    );

    let injected = 0;
    let skipped = 0;
    const finalRules: GovernanceRule[] = [...(existing?.rules ?? [])];

    for (const rule of rules) {
      if (existingRuleIds.has(rule.id)) {
        skipped++;
      } else {
        finalRules.push(rule);
        injected++;
      }
      for (const t of rule.taskTypes) allTaskTypes.add(t);
      for (const e of rule.exemptions ?? []) allExemptions.add(e.reason);
    }

    const config: SevoGuardConfig = {
      version: 1,
      enabled: true,
      source: 'sevo-governance',
      rules: finalRules,
      lastUpdated: new Date().toISOString(),
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    const summary = injected > 0
      ? `Created sevo-guard.json with ${injected} governance rule(s) (${skipped} already existed).`
      : `All ${skipped} SEVO governance rules already present in sevo-guard.json.`;

    return {
      success: true,
      mechanism: 'sevo-guard',
      rulesInjected: injected,
      rulesSkipped: skipped,
      summary,
      managedTaskTypes: [...allTaskTypes],
      exemptions: [...allExemptions],
      disableInstruction: 'sevo config set governance.enabled false',
    };
  }

  verify(projectRoot: string): { active: boolean; message: string } {
    const configPath = path.join(projectRoot, SEVO_GUARD_FILENAME);
    if (!fs.existsSync(configPath)) {
      return { active: false, message: 'sevo-guard.json not found.' };
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SevoGuardConfig;
      if (!config.enabled) {
        return { active: false, message: 'sevo-guard.json exists but governance is disabled.' };
      }
      if (config.rules.length === 0) {
        return { active: false, message: 'sevo-guard.json exists but has no rules.' };
      }
      return { active: true, message: `${config.rules.length} SEVO governance rule(s) active in sevo-guard.json.` };
    } catch {
      return { active: false, message: 'Failed to parse sevo-guard.json.' };
    }
  }
}
