/**
 * RoleKnowledgeInjector — maps role-specific professional standards to pipeline stages.
 *
 * Implements Stage-Bound Design (arc42 §5.4): capabilities bind to stages,
 * not to Agent identities. Each stage gets the relevant role's best practices
 * injected as execution principles.
 *
 * Templates are loaded from `templates/` directory (shipped with npm package).
 * Users can override defaults via L2 configuration (custom template paths).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import type { StageId } from '../types/index.js';
import type { RuleResult } from '../types/index.js';

// ── Stage → Template mapping (arc42 §5.4 table) ────────────────

/** Coarse role category for principle injection. */
export type RoleCategory = 'pm' | 'architect' | 'engineer' | 'auditor' | 'ux' | 'release';

export interface StageMapping {
  role: RoleCategory;
  templateFile: string;
  description: string;
}

/**
 * Canonical mapping from StageId to role principles.
 * Multiple StageIds can map to the same template (e.g. smoke-test and ux-acceptance both use UX).
 */
const STAGE_ROLE_MAP: Readonly<Record<string, StageMapping>> = {
  // Specify phase
  'spec': { role: 'pm', templateFile: 'spec-principles.md', description: 'PM best practices' },
  'spec-review-gate': { role: 'pm', templateFile: 'spec-principles.md', description: 'PM best practices (gate)' },

  // Design phase
  'contract': { role: 'architect', templateFile: 'contract-principles.md', description: 'Architect best practices' },
  'contract-review-gate': { role: 'architect', templateFile: 'contract-principles.md', description: 'Architect best practices (gate)' },
  'test-case-authoring': { role: 'engineer', templateFile: 'implement-principles.md', description: 'Engineering best practices (test authoring)' },
  'ux-acceptance-authoring': { role: 'ux', templateFile: 'ux-principles.md', description: 'UX best practices (acceptance authoring)' },
  'commercial-acceptance-authoring': { role: 'pm', templateFile: 'spec-principles.md', description: 'PM best practices (commercial acceptance)' },

  // Implement phase
  'implement': { role: 'engineer', templateFile: 'implement-principles.md', description: 'Engineering best practices' },

  // Review phase
  'review': { role: 'auditor', templateFile: 'review-principles.md', description: 'Audit best practices' },

  // Test & acceptance phase
  'smoke-test': { role: 'ux', templateFile: 'ux-principles.md', description: 'UX best practices (smoke test)' },
  'ux-acceptance': { role: 'ux', templateFile: 'ux-principles.md', description: 'UX best practices (acceptance)' },
  'pm-commercial-review': { role: 'pm', templateFile: 'spec-principles.md', description: 'PM best practices (commercial review)' },

  // Regression & publish
  'regression': { role: 'engineer', templateFile: 'implement-principles.md', description: 'Engineering best practices (regression)' },
  'publish-generalization-gate': { role: 'release', templateFile: 'deploy-principles.md', description: 'Release engineering (generalization gate)' },

  // Deploy & verify
  'deploy': { role: 'release', templateFile: 'deploy-principles.md', description: 'Release engineering best practices' },
  'verify': { role: 'auditor', templateFile: 'review-principles.md', description: 'Audit best practices (verification)' },

  // Ledger
  'ledger': { role: 'auditor', templateFile: 'review-principles.md', description: 'Audit best practices (ledger)' },
};

// ── RoleKnowledgeInjector ───────────────────────────────────────

export interface RoleKnowledgeInjectorOptions {
  /** Custom templates directory. Overrides the default `templates/` path. */
  templatesDir?: string;
  /** Custom stage-role mappings loaded from config (AC-6.6.3). Merged with defaults. */
  customMappings?: Record<string, StageMapping>;
}

export class RoleKnowledgeInjector {
  private readonly templatesDir: string;
  private readonly cache = new Map<string, string>();
  private readonly stageRoleMap: Readonly<Record<string, StageMapping>>;

  constructor(options?: RoleKnowledgeInjectorOptions) {
    if (options?.templatesDir) {
      this.templatesDir = resolve(options.templatesDir);
    } else {
      // Default: `templates/` relative to package root (two levels up from src/knowledge/)
      this.templatesDir = resolve(dirname(dirname(__dirname)), 'templates');
    }
    // AC-6.6.3: Merge custom mappings over defaults (config-driven)
    this.stageRoleMap = options?.customMappings
      ? { ...STAGE_ROLE_MAP, ...options.customMappings }
      : STAGE_ROLE_MAP;
  }

  /**
   * Get execution principles for a given stage.
   * Returns the markdown content of the corresponding role template.
   * Returns empty string if stage has no mapping or template is missing.
   */
  getPrinciples(stageId: StageId): string {
    const mapping = this.stageRoleMap[stageId];
    if (!mapping) return '';
    return this.loadTemplate(mapping.templateFile);
  }

  /**
   * Get default gate rules for a given stage.
   * Extracts rule-like items from the principles template.
   * Each bullet point becomes a gate rule with 'warning' severity.
   */
  getGateRules(stageId: StageId): Array<{ ruleId: string; description: string; severity: 'blocker' | 'warning' }> {
    const principles = this.getPrinciples(stageId);
    if (!principles) return [];

    const rules: Array<{ ruleId: string; description: string; severity: 'blocker' | 'warning' }> = [];
    const lines = principles.split('\n');
    let ruleIndex = 0;

    for (const line of lines) {
      const bulletMatch = /^[-*]\s+(.+)$/.exec(line.trim());
      if (bulletMatch) {
        ruleIndex++;
        const desc = bulletMatch[1]!.trim();
        // Extract rule ID from description (text before colon) or generate one
        const colonIdx = desc.indexOf('：');
        const colonIdx2 = desc.indexOf(':');
        const splitIdx = colonIdx >= 0 ? colonIdx : colonIdx2;
        const ruleId = splitIdx > 0
          ? desc.slice(0, splitIdx).trim().toLowerCase().replace(/\s+/g, '-')
          : `${stageId}-rule-${ruleIndex}`;

        rules.push({
          ruleId: `${stageId}/${ruleId}`,
          description: desc,
          severity: 'warning',
        });
      }
    }

    return rules;
  }

  /**
   * Inject stage principles into a task context object.
   * Returns an enriched context with `principles` field populated.
   */
  inject(stageId: StageId, context: Record<string, unknown>): Record<string, unknown> {
    const principles = this.getPrinciples(stageId);
    return {
      ...context,
      principles,
      _injectedRole: this.stageRoleMap[stageId]?.role ?? 'unknown',
      _injectedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the role category for a stage.
   */
  getRoleForStage(stageId: StageId): RoleCategory | null {
    return this.stageRoleMap[stageId]?.role ?? null;
  }

  /**
   * List all known stage-to-role mappings.
   */
  listMappings(): Array<{ stageId: string; role: RoleCategory; templateFile: string; description: string }> {
    return Object.entries(this.stageRoleMap).map(([stageId, mapping]) => ({
      stageId,
      ...mapping,
    }));
  }

  // ── Private ─────────────────────────────────────────────────

  private loadTemplate(filename: string): string {
    if (this.cache.has(filename)) {
      return this.cache.get(filename)!;
    }

    const filePath = join(this.templatesDir, filename);
    if (!existsSync(filePath)) {
      return '';
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      this.cache.set(filename, content);
      return content;
    } catch {
      return '';
    }
  }
}
