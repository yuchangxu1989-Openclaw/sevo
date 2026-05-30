import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, PdcaCycleRecord, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  PdcaGapAnalysisInput,
  PdcaGapAnalysisOutput,
  PdcaGapAnalysisStageOptions,
  PdcaGapReport,
  PdcaGap,
  KrCoverage,
} from './pdca-gap-analysis-types.js';

/**
 * PDCA Gap Analysis stage.
 *
 * Evaluates the current pipeline iteration against the OKR tree:
 *   Plan  — Are all KRs covered by FRs?
 *   Do    — Are FRs/ACs implemented?
 *   Check — Do audit findings indicate OKR drift?
 *   Act   — What gaps remain for the next cycle?
 *
 * Graceful skip: when no OKR tree is present, produces a minimal
 * report with implementation-only coverage (no KR alignment).
 */
export class PdcaGapAnalysisStage implements Stage<PdcaGapAnalysisInput, PdcaGapAnalysisOutput> {
  readonly stageId: StageId = 'verify' as const; // Runs in verification phase
  private readonly now: () => string;

  constructor(private readonly options: PdcaGapAnalysisStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: PdcaGapAnalysisInput): Promise<PdcaGapAnalysisOutput> {
    const cycleNumber = input.cycleNumber ?? 1;

    const report = this.options.adapter.analyzeGaps
      ? await this.analyzeViaAdapter(input, cycleNumber)
      : this.analyzeLocally(input, cycleNumber);

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, report, timestamp);

    const criticalGaps = report.act.gaps.filter((g) => g.severity === 'critical').length;

    return {
      report,
      metadata: {
        totalGaps: report.act.gaps.length,
        criticalGaps,
        convergence: report.convergence,
        analyzedAt: timestamp,
      },
      artifact,
    };
  }

  private async analyzeViaAdapter(
    input: PdcaGapAnalysisInput,
    cycleNumber: number,
  ): Promise<PdcaGapReport> {
    const response = await this.options.adapter.analyzeGaps!({
      okrTree: input.okrTree,
      krMapping: input.krMapping,
      functionalRequirements: input.functionalRequirements,
      implementationStatus: input.implementationStatus,
      acImplementationStatus: input.acImplementationStatus,
      auditFindings: input.auditFindings,
      cycleNumber,
    });

    const gaps: PdcaGap[] = response.gaps.map((g, idx) => ({
      id: `GAP-${String(idx + 1).padStart(3, '0')}`,
      ...g,
    }));

    // Still compute plan/do/check locally for structural completeness
    const plan = this.assessPlan(input);
    const doPhase = this.assessDo(input);
    const check = this.assessCheck(input);

    const cycleRecord: PdcaCycleRecord = {
      cycle: cycleNumber,
      triggeredBy: gaps.filter((g) => g.severity === 'critical').map((g) => g.id),
      newTasks: response.nextCycleTasks,
      result: response.convergence,
    };

    return {
      plan,
      do: doPhase,
      check,
      act: { gaps, nextCycleTasks: response.nextCycleTasks },
      convergence: response.convergence,
      cycleRecord,
    };
  }

  /**
   * Local (no-adapter) gap analysis.
   * Deterministic assessment based on coverage numbers.
   */
  private analyzeLocally(
    input: PdcaGapAnalysisInput,
    cycleNumber: number,
  ): PdcaGapReport {
    const plan = this.assessPlan(input);
    const doPhase = this.assessDo(input);
    const check = this.assessCheck(input);

    const gaps: PdcaGap[] = [];
    let gapIdx = 0;

    // Plan gaps: uncovered KRs
    for (const kr of plan.krCoverageDetails) {
      if (kr.status === 'uncovered') {
        gapIdx++;
        gaps.push({
          id: `GAP-${String(gapIdx).padStart(3, '0')}`,
          phase: 'plan',
          severity: 'critical',
          description: `KR ${kr.krId} has no FR coverage: ${kr.description}`,
          remediation: `Add FR(s) that trace to ${kr.krId}`,
          krId: kr.krId,
        });
      }
    }

    // Do gaps: unimplemented FRs
    const implStatus = input.implementationStatus ?? {};
    for (const fr of input.functionalRequirements) {
      if (implStatus[fr.id] === false) {
        gapIdx++;
        gaps.push({
          id: `GAP-${String(gapIdx).padStart(3, '0')}`,
          phase: 'do',
          severity: 'major',
          description: `${fr.id} (${fr.title}) not implemented`,
          remediation: `Implement ${fr.id} and verify AC`,
          krId: input.krMapping?.[fr.id],
        });
      }
    }

    // Check gaps: critical audit findings
    const findings = input.auditFindings ?? [];
    for (const finding of findings) {
      gapIdx++;
      const description = typeof finding === 'string' ? finding : finding.message;
      gaps.push({
        id: `GAP-${String(gapIdx).padStart(3, '0')}`,
        phase: 'check',
        severity: 'major',
        description,
        remediation: 'Address audit finding and re-verify',
      });
    }

    const criticalCount = gaps.filter((g) => g.severity === 'critical').length;
    const convergence = gaps.length === 0
      ? 'converged' as const
      : criticalCount > 0
        ? 'escalated' as const
        : 'gap-remaining' as const;

    const nextCycleTasks = gaps.map((g) => g.remediation);

    const cycleRecord: PdcaCycleRecord = {
      cycle: cycleNumber,
      triggeredBy: gaps.filter((g) => g.severity === 'critical').map((g) => g.id),
      newTasks: nextCycleTasks,
      result: convergence,
    };

    return {
      plan,
      do: doPhase,
      check,
      act: { gaps, nextCycleTasks },
      convergence,
      cycleRecord,
    };
  }

  private assessPlan(input: PdcaGapAnalysisInput): PdcaGapReport['plan'] {
    if (!input.okrTree || input.okrTree.length === 0) {
      return { totalKrs: 0, coveredKrs: 0, krCoverageDetails: [] };
    }

    const krMapping = input.krMapping ?? {};
    const reverseMap = new Map<string, string[]>();
    for (const [frId, krId] of Object.entries(krMapping)) {
      const existing = reverseMap.get(krId) ?? [];
      existing.push(frId);
      reverseMap.set(krId, existing);
    }

    // Also check FR.tracesTo
    for (const fr of input.functionalRequirements) {
      if (fr.tracesTo && !krMapping[fr.id]) {
        const existing = reverseMap.get(fr.tracesTo) ?? [];
        existing.push(fr.id);
        reverseMap.set(fr.tracesTo, existing);
      }
    }

    const details: KrCoverage[] = [];
    let coveredCount = 0;

    for (const obj of input.okrTree) {
      for (const kr of obj.keyResults) {
        const coveredByFrs = reverseMap.get(kr.krId) ?? [];
        const implStatus = input.implementationStatus ?? {};
        const acStatus = input.acImplementationStatus ?? {};

        // Calculate implementation percentage from AC status
        const relatedAcs = input.functionalRequirements
          .filter((fr) => coveredByFrs.includes(fr.id))
          .flatMap((fr) => fr.acceptanceCriteria);
        const totalAcs = relatedAcs.length;
        const implAcs = relatedAcs.filter((ac) => acStatus[ac.id] === true).length;
        const implementationPct = totalAcs > 0
          ? Math.round((implAcs / totalAcs) * 100)
          : (coveredByFrs.length > 0 ? 50 : 0); // 50% if FRs exist but no AC status

        const auditFindings = (input.auditFindings ?? []).filter((f) => {
          // Structured finding: check artifact or message for KR reference
          if (typeof f === 'object' && f !== null && 'message' in f) {
            return (f.artifact ?? '').includes(kr.krId) || f.message.includes(kr.krId);
          }
          // Legacy string: check if string references the KR ID
          return typeof f === 'string' && f.includes(kr.krId);
        });

        const status = coveredByFrs.length === 0
          ? 'uncovered' as const
          : implementationPct >= 100
            ? 'covered' as const
            : 'partial' as const;

        if (status !== 'uncovered') coveredCount++;

        details.push({
          krId: kr.krId,
          description: kr.description,
          coveredByFrs,
          implementationPct,
          auditFindings,
          status,
        });
      }
    }

    return {
      totalKrs: details.length,
      coveredKrs: coveredCount,
      krCoverageDetails: details,
    };
  }

  private assessDo(input: PdcaGapAnalysisInput): PdcaGapReport['do'] {
    const implStatus = input.implementationStatus ?? {};
    const acStatus = input.acImplementationStatus ?? {};

    const totalFrs = input.functionalRequirements.length;
    const implementedFrs = input.functionalRequirements.filter(
      (fr) => implStatus[fr.id] === true,
    ).length;

    const allAcs = input.functionalRequirements.flatMap((fr) => fr.acceptanceCriteria);
    const totalAcs = allAcs.length;
    const implementedAcs = allAcs.filter((ac) => acStatus[ac.id] === true).length;

    return { totalFrs, implementedFrs, totalAcs, implementedAcs };
  }

  private assessCheck(input: PdcaGapAnalysisInput): PdcaGapReport['check'] {
    const findings = input.auditFindings ?? [];
    const criticalFindings = findings.filter((f) => {
      // Structured finding: use explicit severity field
      if (typeof f === 'object' && f !== null && 'severity' in f) {
        const sev = f.severity.toLowerCase();
        return sev === 'critical' || sev === 'blocker';
      }
      // Legacy string fallback (backward compat): match structured prefix pattern
      if (typeof f === 'string') {
        const prefixMatch = f.match(/^\[(critical|blocker)\]/i);
        return !!prefixMatch;
      }
      return false;
    }).length;

    // OKR aligned if no critical findings and plan coverage > 0
    const hasOkr = input.okrTree && input.okrTree.length > 0;
    const okrAligned = hasOkr
      ? criticalFindings === 0
      : true; // No OKR = trivially aligned

    return { totalFindings: findings.length, criticalFindings, okrAligned };
  }

  private async writeArtifact(
    input: PdcaGapAnalysisInput,
    report: PdcaGapReport,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'pdca');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-pdca-gap-report.json`);
    await writeFile(
      filePath,
      JSON.stringify({ ...report, analyzedAt: timestamp }, null, 2),
      'utf8',
    );

    return {
      id: `${input.taskId}:pdca-gap-report`,
      type: 'pdca-gap-report',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        gapCount: report.act.gaps.length,
        convergence: report.convergence,
        cycle: report.cycleRecord.cycle,
      },
    };
  }
}
