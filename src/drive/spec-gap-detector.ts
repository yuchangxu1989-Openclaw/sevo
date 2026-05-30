/**
 * FR-D02: Spec Gap Detection.
 *
 * Detects code modules that cannot be traced back to any FR/AC in the spec.
 * Runs at implement stage completion and on pipeline creation (coverage pre-check).
 *
 * Uses LLM semantic judgment for coverage assessment (no keyword matching).
 *
 * (spec §FR-D02, AC-D02.1 through AC-D02.7)
 */

import type { ArtifactRef } from '../types/index.js';
import type { UncoveredModule, SpecGapReport } from './types.js';
import { LLMProvider } from '../llm/index.js';
import type { LLMProviderConfig } from '../llm/index.js';

/** Minimal FR reference for alignment scanning. */
export interface FrReference {
  frId: string;
  summary: string;
  /** @deprecated Keywords are no longer used for matching; kept for API compat. */
  keywords?: string[];
}

/** Implementation module descriptor for alignment scanning. */
export interface ImplementationModule {
  /** File or directory path. */
  path: string;
  /** Description of what this module does. */
  description: string;
  /** @deprecated Keywords are no longer used for matching; kept for API compat. */
  keywords?: string[];
}

/**
 * SpecGapDetector — identifies code modules not traceable to spec FRs.
 *
 * AC-D02.1: Triggered automatically at implement completion.
 * AC-D02.2: Identifies untraceable modules, outputs structured report.
 * AC-D02.5: Advisory only, does not block pipeline.
 * AC-D02.7: Module-level granularity (file/directory/API endpoint).
 */
export class SpecGapDetector {
  private llm: LLMProvider;

  constructor(llmConfig?: LLMProviderConfig) {
    this.llm = new LLMProvider(llmConfig);
  }

  /**
   * Run spec-code alignment scan.
   *
   * Compares implementation modules against FR references to find
   * modules that cannot be traced to any FR.
   *
   * AC-D02.2: Outputs structured SpecGapReport.
   * AC-D02.7: Module-level granularity.
   */
  async scan(
    pipelineId: string,
    frReferences: FrReference[],
    implementationModules: ImplementationModule[],
  ): Promise<SpecGapReport> {
    const uncoveredModules: UncoveredModule[] = [];

    for (const module of implementationModules) {
      const isCovered = await this.isModuleCovered(module, frReferences);
      if (!isCovered) {
        uncoveredModules.push({
          path: module.path,
          description: module.description,
          suggestedFr: this.generateSuggestedFr(module),
        });
      }
    }

    return {
      analyzedAt: new Date().toISOString(),
      pipelineId,
      uncoveredModules,
      hasGaps: uncoveredModules.length > 0,
      severity: 'advisory', // AC-D02.5
    };
  }

  /**
   * Pre-check coverage for a new requirement description (AC-D02.4).
   *
   * Scans existing FR references to determine if the new requirement
   * involves capabilities not yet defined in the spec.
   */
  async preCheck(
    existingFrReferences: FrReference[],
    newRequirementDescription: string,
  ): Promise<{ covered: boolean; suggestedAction: string }> {
    if (existingFrReferences.length === 0) {
      return {
        covered: false,
        suggestedAction: 'No existing FRs. Suggest running specify stage first.',
      };
    }

    const covered = await this.judgeCoverage(
      newRequirementDescription,
      existingFrReferences.map((fr) => `${fr.frId}: ${fr.summary}`).join('\n'),
    );

    if (covered) {
      return {
        covered: true,
        suggestedAction: 'Requirement appears covered by existing spec.',
      };
    }

    return {
      covered: false,
      suggestedAction: 'Requirement involves undefined capabilities. Suggest running specify stage first.',
    };
  }

  /**
   * Extract implementation modules from deploy artifacts.
   * Converts ArtifactRef[] to ImplementationModule[] for scanning.
   */
  extractModulesFromArtifacts(artifacts: ArtifactRef[]): ImplementationModule[] {
    return artifacts
      .filter((a) => a.type.includes('implement') || a.type.includes('code') || a.type.includes('source'))
      .map((a) => ({
        path: a.path,
        description: (a.metadata?.['description'] as string) ?? `Module at ${a.path}`,
      }));
  }

  /**
   * Convert FR list (simple format) to FrReference format for scanning.
   */
  frListToReferences(frList: Array<{ frId: string; summary: string }>): FrReference[] {
    return frList.map((fr) => ({
      frId: fr.frId,
      summary: fr.summary,
    }));
  }

  // ── Private helpers ───────────────────────────────────────────

  private async isModuleCovered(module: ImplementationModule, frReferences: FrReference[]): Promise<boolean> {
    if (frReferences.length === 0) return false;

    const frSummaries = frReferences
      .map((fr) => `${fr.frId}: ${fr.summary}`)
      .join('\n');

    return this.judgeCoverage(module.description, frSummaries);
  }

  private async judgeCoverage(subject: string, frContext: string): Promise<boolean> {
    const response = await this.llm.chat([
      {
        role: 'system',
        content: COVERAGE_JUDGE_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `## Functional Requirements\n${frContext}\n\n## Subject to Evaluate\n${subject}`,
      },
    ]);

    const normalized = response.trim().toLowerCase();
    return normalized.startsWith('yes') || normalized.includes('"covered":true') || normalized.includes('"covered": true');
  }

  private generateSuggestedFr(module: ImplementationModule): string {
    return `Add FR for: ${module.description} (path: ${module.path})`;
  }
}

const COVERAGE_JUDGE_SYSTEM_PROMPT = `You are a spec-code alignment judge. Given a list of Functional Requirements (FRs) and a subject (module description or requirement), determine whether the subject is covered by any of the listed FRs.

Rules:
- "Covered" means the subject's functionality can be reasonably traced to at least one FR.
- Consider semantic equivalence, not just keyword overlap.
- A module that implements infrastructure shared across multiple FRs (e.g. logging, config) counts as covered if any FR implies its necessity.

Respond with exactly one word: "yes" if covered, "no" if not covered.`;
