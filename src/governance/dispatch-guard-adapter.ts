/**
 * Dispatch-guard adapter for OpenClaw environments (FR-28, AC-28.1).
 *
 * Detects and injects SEVO governance rules into an existing
 * dispatch-guard plugin configuration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  GovernanceAdapter,
  GovernanceDetection,
  GovernanceInjectionResult,
  GovernanceRule,
} from './adapter.js';

/** Shape of a dispatch-guard rule entry. */
interface DispatchGuardRule {
  id: string;
  description?: string;
  taskTypes: string[];
  action: 'block' | 'warn';
  message: string;
  exemptions?: Array<{
    id: string;
    reason: string;
    type: string;
    value: string;
  }>;
  source?: string;
}

/** Shape of the dispatch-guard config file. */
interface DispatchGuardConfig {
  rules: DispatchGuardRule[];
  [key: string]: unknown;
}

/**
 * Paths where dispatch-guard config might live in an OpenClaw environment.
 */
const DISPATCH_GUARD_CONFIG_PATHS = [
  'extensions/dispatch-guard/rules.json',
  '.openclaw/extensions/dispatch-guard/rules.json',
];

/**
 * Paths to check for dispatch-guard plugin registration.
 */
const DISPATCH_GUARD_PLUGIN_MARKERS = [
  'extensions/dispatch-guard',
  '.openclaw/extensions/dispatch-guard',
];

/**
 * OpenClaw dispatch-guard adapter implementation.
 */
export class DispatchGuardAdapter implements GovernanceAdapter {
  detect(projectRoot: string): GovernanceDetection {
    // Check if dispatch-guard plugin directory exists
    for (const marker of DISPATCH_GUARD_PLUGIN_MARKERS) {
      const fullPath = path.join(projectRoot, marker);
      if (fs.existsSync(fullPath)) {
        // Find the config file
        const configPath = this.findConfigPath(projectRoot);
        return {
          exists: true,
          type: 'dispatch-guard',
          configPath: configPath ?? undefined,
        };
      }
    }

    // Also check openclaw.json for plugin registration
    const openclawJsonPath = this.findOpenClawJson(projectRoot);
    if (openclawJsonPath) {
      try {
        const content = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf-8'));
        const extensions = content.extensions ?? content.plugins ?? [];
        const hasDispatchGuard = Array.isArray(extensions)
          ? extensions.some((ext: unknown) => {
            if (typeof ext === 'string') return ext.includes('dispatch-guard');
            if (typeof ext === 'object' && ext !== null) {
              return (ext as Record<string, unknown>).name === 'dispatch-guard'
                || (ext as Record<string, unknown>).id === 'dispatch-guard';
            }
            return false;
          })
          : false;

        if (hasDispatchGuard) {
          const configPath = this.findConfigPath(projectRoot);
          return {
            exists: true,
            type: 'dispatch-guard',
            configPath: configPath ?? undefined,
          };
        }
      } catch {
        // Ignore parse errors
      }
    }

    return { exists: false, type: 'none' };
  }

  inject(projectRoot: string, rules: GovernanceRule[]): GovernanceInjectionResult {
    const detection = this.detect(projectRoot);
    if (!detection.exists) {
      return {
        success: false,
        mechanism: 'dispatch-guard',
        rulesInjected: 0,
        rulesSkipped: 0,
        summary: 'dispatch-guard not found in this environment.',
        managedTaskTypes: [],
        exemptions: [],
        disableInstruction: 'sevo config set governance.enabled false',
      };
    }

    // Load or create config
    let config: DispatchGuardConfig;
    const configPath = detection.configPath ?? this.defaultConfigPath(projectRoot);

    if (configPath && fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as DispatchGuardConfig;
      } catch {
        config = { rules: [] };
      }
    } else {
      config = { rules: [] };
    }

    if (!Array.isArray(config.rules)) {
      config.rules = [];
    }

    // Inject rules idempotently (AC-28.9)
    let injected = 0;
    let skipped = 0;
    const allTaskTypes = new Set<string>();
    const allExemptions = new Set<string>();

    for (const rule of rules) {
      const existingIndex = config.rules.findIndex((r) => r.id === rule.id);
      if (existingIndex >= 0) {
        skipped++;
      } else {
        config.rules.push({
          id: rule.id,
          description: rule.description,
          taskTypes: rule.taskTypes,
          action: rule.action,
          message: rule.message,
          exemptions: rule.exemptions?.map((e) => ({
            id: e.id,
            reason: e.reason,
            type: e.type,
            value: e.value,
          })),
          source: 'sevo-governance',
        });
        injected++;
      }

      for (const t of rule.taskTypes) allTaskTypes.add(t);
      for (const e of rule.exemptions ?? []) allExemptions.add(e.reason);
    }

    // Write back config (AC-28.1: append, don't overwrite)
    const targetPath = configPath ?? this.defaultConfigPath(projectRoot);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n');

    const summary = injected > 0
      ? `Injected ${injected} SEVO governance rule(s) into dispatch-guard (${skipped} already existed).`
      : `All ${skipped} SEVO governance rules already present in dispatch-guard.`;

    return {
      success: true,
      mechanism: 'dispatch-guard',
      rulesInjected: injected,
      rulesSkipped: skipped,
      summary,
      managedTaskTypes: [...allTaskTypes],
      exemptions: [...allExemptions],
      disableInstruction: 'sevo config set governance.enabled false',
    };
  }

  verify(projectRoot: string): { active: boolean; message: string } {
    const detection = this.detect(projectRoot);
    if (!detection.exists || !detection.configPath) {
      return { active: false, message: 'dispatch-guard not detected or config missing.' };
    }

    try {
      const config = JSON.parse(fs.readFileSync(detection.configPath, 'utf-8')) as DispatchGuardConfig;
      const sevoRules = (config.rules ?? []).filter((r) => r.source === 'sevo-governance');
      if (sevoRules.length > 0) {
        return { active: true, message: `${sevoRules.length} SEVO governance rule(s) active in dispatch-guard.` };
      }
      return { active: false, message: 'No SEVO governance rules found in dispatch-guard config.' };
    } catch {
      return { active: false, message: 'Failed to read dispatch-guard config.' };
    }
  }

  private findConfigPath(projectRoot: string): string | null {
    for (const candidate of DISPATCH_GUARD_CONFIG_PATHS) {
      const full = path.join(projectRoot, candidate);
      if (fs.existsSync(full)) return full;
    }
    return null;
  }

  private defaultConfigPath(projectRoot: string): string {
    return path.join(projectRoot, 'extensions', 'dispatch-guard', 'rules.json');
  }

  private findOpenClawJson(projectRoot: string): string | null {
    const candidates = [
      path.join(projectRoot, 'openclaw.json'),
      path.join(projectRoot, '.openclaw', 'openclaw.json'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }
}
