/**
 * PostReleaseValidationStage — gap analysis after publish/deploy (FR-17 + FR-18).
 *
 * FR-17: Compares spec FR list against deploy artifacts.
 * FR-18: When OKR tree is present, upgrades to KR-level gap analysis,
 *         supports PDCA sub-cycles, and enforces max cycle limits.
 */

import { L3RuntimeVerifier } from '../scan/l3-runtime-verifier.js';
import type { ArtifactRef } from '../types/index.js';
import type { PdcaCycleRecord } from '../types/index.js';
import type {
  PostReleaseValidationInput,
  PostReleaseValidationOutput,
  GapAnalysisReport,
  FrGapEntry,
  FrGapStatus,
  KrGapEntry,
  KrGapStatus,
} from './post-release-validation-types.js';

const DEFAULT_MAX_PDCA_CYCLES = 3;

export class PostReleaseValidationStage {
  /**
   * Run gap analysis against the spec FR list.
   * When okrTree is present and non-empty, KR-level analysis takes precedence
   * for canComplete determination (AC-18.9).
   */
  run(input: PostReleaseValidationInput): PostReleaseValidationOutput {
    const frResult = this.runFrAnalysis(input.frList, input.deployArtifacts);
    const hasOkr = input.okrTree && input.okrTree.length > 0;

    if (!hasOkr) {
      return {
        report: frResult.report,
        fixTasks: frResult.fixTasks,
        canComplete: frResult.report.gaps === 0,
      };
    }

    const krEntries = this.analyzeKrGaps(input.okrTree!);
    const krGaps = krEntries.filter((e) => e.status !== 'achieved').length;
    const report: GapAnalysisReport = {
      ...frResult.report,
      krEntries,
      krGaps,
    };

    return {
      report,
      fixTasks: krEntries
        .filter((e) => e.status !== 'achieved')
        .map((e) => ({
          frId: e.krId,
          description:
            e.status === 'not-achieved'
              ? `Implement KR ${e.krId}: ${e.description}`
              : `Complete KR ${e.krId}: ${e.description}`,
        })),
      canComplete: krGaps === 0,
    };
  }

  async execute(input: PostReleaseValidationInput): Promise<PostReleaseValidationOutput> {
    // Always run FR-level analysis
    const l3Report = input.runtimeVerification
      ? await new L3RuntimeVerifier().verify(input.runtimeVerification)
      : undefined;
    const frResult = this.runFrAnalysis(input.frList, input.deployArtifacts, l3Report);
    if (l3Report && !l3Report.pass) {
      const report: GapAnalysisReport = {
        ...frResult.report,
        tieredRuntime: l3Report,
      };
      return {
        report,
        fixTasks: [
          ...frResult.fixTasks,
          ...l3Report.entries
            .filter((entry) => entry.status === 'dead')
            .map((entry) => ({ frId: entry.domain, description: `Fix runtime domain ${entry.domain}: ${entry.judgment}` })),
        ],
        canComplete: false,
      };
    }

    const hasOkr = input.okrTree && input.okrTree.length > 0;

    if (!hasOkr) {
      // No OKR tree — pure FR-level (backward compatible)
      return {
        report: l3Report ? { ...frResult.report, tieredRuntime: l3Report } : frResult.report,
        fixTasks: frResult.fixTasks,
        canComplete: frResult.report.gaps === 0,
      };
    }

    // KR-level analysis (AC-18.8)
    const krEntries = this.analyzeKrGaps(input.okrTree!);
    const krGaps = krEntries.filter((e) => e.status !== 'achieved').length;

    const report: GapAnalysisReport = {
      ...frResult.report,
      tieredRuntime: l3Report,
      krEntries,
      krGaps,
    };

    // canComplete based on KR (AC-18.9): KR takes precedence
    const canComplete = krGaps === 0;

    // Generate fix tasks from KR gaps (not FR gaps) when OKR present
    const fixTasks = krEntries
      .filter((e) => e.status !== 'achieved')
      .map((e) => ({
        frId: e.krId,
        description:
          e.status === 'not-achieved'
            ? `Implement KR ${e.krId}: ${e.description}`
            : `Complete KR ${e.krId}: ${e.description}`,
      }));

    return {
      report,
      fixTasks,
      canComplete,
    };
  }

  /**
   * Run a PDCA sub-cycle within Post-Release Validation (AC-18.10, AC-18.11).
   * Simulates Implement→Review→Deploy→Validate sub-loop without modifying
   * the pipeline's main state machine.
   *
   * @param input - The validation input (with okrTree)
   * @param simulateFix - Callback that simulates fixing KR gaps and returns updated okrTree.
   *                      In real usage, this triggers actual work packages.
   * @returns Final output after all PDCA cycles complete or max reached.
   */
  runWithPdca(
    input: PostReleaseValidationInput,
    simulateFix: (gaps: KrGapEntry[], cycle: number) => PostReleaseValidationInput,
  ): PostReleaseValidationOutput {
    const maxCycles = input.maxPdcaCycles ?? DEFAULT_MAX_PDCA_CYCLES;
    const pdcaCycles: PdcaCycleRecord[] = [];
    let currentInput = input;
    let result = this.run(currentInput);

    for (let cycle = 1; cycle <= maxCycles && !result.canComplete; cycle++) {
      const gapKrs = result.report.krEntries?.filter((e) => e.status !== 'achieved') ?? [];
      const triggeredBy = gapKrs.map((e) => e.krId);
      const newTasks = result.fixTasks.map((t) => t.description);

      // Simulate fix: caller provides updated input after sub-cycle
      currentInput = simulateFix(gapKrs, cycle);
      result = this.run(currentInput);

      const cycleResult: PdcaCycleRecord['result'] = result.canComplete
        ? 'converged'
        : cycle >= maxCycles
          ? 'escalated'
          : 'gap-remaining';

      pdcaCycles.push({
        cycle,
        triggeredBy,
        newTasks,
        result: cycleResult,
      });
    }

    return {
      ...result,
      pdcaCycles,
    };
  }

  // ── FR-level analysis (existing logic) ──

  private runFrAnalysis(
    frList: Array<{ frId: string; summary: string }>,
    deployArtifacts: ArtifactRef[],
    l3Report?: import('../scan/types.js').L3ScanReport,
  ): { report: GapAnalysisReport; fixTasks: Array<{ frId: string; description: string }> } {
    const entries: FrGapEntry[] = frList.map((fr) => {
      const status = this.assessFr(fr.frId, deployArtifacts, l3Report);
      return {
        frId: fr.frId,
        summary: fr.summary,
        status,
        reason: this.reasonForStatus(status, fr.frId, l3Report),
      };
    });

    const coveredCount = entries.filter((e) => e.status === 'covered').length;
    const codeOnlyCount = entries.filter((e) => e.status === 'code-only').length;
    const missingCount = entries.filter((e) => e.status === 'missing').length;

    const report: GapAnalysisReport = {
      totalFrs: entries.length,
      coveredCount,
      codeOnlyCount,
      missingCount,
      entries,
      gaps: codeOnlyCount + missingCount,
      analyzedAt: new Date().toISOString(),
    };

    const fixTasks = entries
      .filter((e) => e.status !== 'covered')
      .map((e) => ({
        frId: e.frId,
        description:
          e.status === 'missing'
            ? `Implement and verify ${e.frId}: ${e.summary}`
            : `Verify runtime availability for ${e.frId}: ${e.summary}`,
      }));

    return { report, fixTasks };
  }

  // ── KR-level analysis (FR-18, AC-18.8) ──

  private analyzeKrGaps(okrTree: import('../types/index.js').ObjectiveKeyResult[]): KrGapEntry[] {
    const entries: KrGapEntry[] = [];

    for (const obj of okrTree) {
      for (const kr of obj.keyResults) {
        const { status, achievementPct } = this.mapKrStatus(kr.status);
        entries.push({
          krId: kr.krId,
          description: kr.description,
          status,
          achievementPct,
          reason: this.krReasonForStatus(status, kr),
        });
      }
    }

    return entries;
  }

  private mapKrStatus(
    krStatus: 'not-started' | 'in-progress' | 'achieved' | 'at-risk',
  ): { status: KrGapStatus; achievementPct: number } {
    switch (krStatus) {
      case 'achieved':
        return { status: 'achieved', achievementPct: 100 };
      case 'in-progress':
        return { status: 'partial', achievementPct: 50 };
      case 'not-started':
        return { status: 'not-achieved', achievementPct: 0 };
      case 'at-risk':
        return { status: 'not-achieved', achievementPct: 0 };
    }
  }

  private krReasonForStatus(
    status: KrGapStatus,
    kr: import('../types/index.js').KeyResult,
  ): string {
    switch (status) {
      case 'achieved':
        return '';
      case 'partial':
        return `${kr.krId} is in-progress, not yet fully achieved`;
      case 'not-achieved':
        return kr.status === 'at-risk'
          ? `${kr.krId} is at-risk and not achieved`
          : `${kr.krId} has not been started`;
    }
  }

  // ── FR assessment helpers ──

  private assessFr(
    frId: string,
    artifacts: ArtifactRef[],
    l3Report?: import('../scan/types.js').L3ScanReport,
  ): FrGapStatus {
    const frLower = frId.toLowerCase();
    const enforceL3 = Boolean(l3Report);
    const l3AcChecks = l3Report?.acVerification?.filter((entry) => entry.frId.toLowerCase() === frLower) ?? [];
    const hasRuntimeExecution = (l3Report?.entries.length ?? 0) > 0;
    const allAcSatisfied = l3AcChecks.length > 0 && l3AcChecks.every((entry) => entry.satisfied);
    const matchingArtifacts = artifacts.filter(
      (a) =>
        a.id.toLowerCase().includes(frLower) ||
        (a.metadata?.frId as string)?.toLowerCase() === frLower,
    );

    if (matchingArtifacts.length === 0) {
      const hasDeployEvidence = artifacts.some(
        (a) =>
          a.type.includes('deploy') ||
          a.type.includes('release') ||
          a.type.includes('publish'),
      );
      const hasVerifyEvidence = artifacts.some(
        (a) =>
          a.type.includes('verify') ||
          a.type.includes('smoke') ||
          a.type.includes('regression'),
      );

      if (hasDeployEvidence && hasVerifyEvidence && (!enforceL3 || (hasRuntimeExecution && allAcSatisfied))) {
        return 'covered';
      }
      if (hasDeployEvidence) {
        return 'code-only';
      }
      return 'missing';
    }

    const hasImpl = matchingArtifacts.some(
      (a) =>
        a.type.includes('implement') ||
        a.type.includes('code') ||
        a.type.includes('test') ||
        a.type.includes('review'),
    );
    const hasVerify = matchingArtifacts.some(
      (a) =>
        a.type.includes('verify') ||
        a.type.includes('smoke') ||
        a.type.includes('regression') ||
        a.type.includes('acceptance'),
    );

    if (hasImpl && hasVerify && (!enforceL3 || (hasRuntimeExecution && allAcSatisfied))) return 'covered';
    if (hasImpl) return 'code-only';
    return 'missing';
  }

  private reasonForStatus(
    status: FrGapStatus,
    frId: string,
    l3Report?: import('../scan/types.js').L3ScanReport,
  ): string {
    switch (status) {
      case 'covered':
        return '';
      case 'code-only':
        if (!l3Report || l3Report.entries.length === 0) {
          return `${frId} has implementation artifacts but no runtime verification evidence`;
        }
        if (!l3Report.acVerification?.some((entry) => entry.frId === frId)) {
          return `${frId} has runtime checks, but no FR-scoped AC runtime verification evidence`;
        }
        if (l3Report.acVerification.some((entry) => entry.frId === frId && !entry.satisfied)) {
          return `${frId} has runtime execution, but at least one AC failed runtime verification`;
        }
        return `${frId} has implementation artifacts but no runtime verification evidence`;
      case 'missing':
        return `${frId} has no implementation or verification artifacts`;
    }
  }
}
