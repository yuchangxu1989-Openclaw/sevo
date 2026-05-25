import type { L1ScanReport, L2ScanReport, L3ScanReport, TieredScanReport, TieredScanSummary } from './types.js';
import { writeJson } from './utils.js';

export function summarizeTieredScan(
  reports: { l1?: L1ScanReport; l2?: L2ScanReport; l3?: L3ScanReport },
): TieredScanSummary {
  const l1Total = reports.l1?.entries.length ?? 0;
  const l1Covered = reports.l1?.entries.filter((entry) => entry.status === 'covered').length ?? 0;
  const l2Total = reports.l2?.entries.length ?? 0;
  const l2Covered = reports.l2?.entries.filter((entry) => entry.status === 'covered').length ?? 0;
  const l2NeedsReview = reports.l2?.entries.filter((entry) => entry.status === 'needs-review').length ?? 0;
  const l3Total = reports.l3?.entries.length ?? 0;
  const l3Alive = reports.l3?.entries.filter((entry) => entry.status === 'alive').length ?? 0;

  const l1Pass = reports.l1?.pass ?? true;
  const l2Pass = reports.l2?.pass ?? true;
  const l3Pass = reports.l3?.pass ?? true;
  const blockers: string[] = [];

  if (!l1Pass) blockers.push('L1 file-level scan failed: uncovered FR, compile failure, or test failure.');
  if (!l2Pass) blockers.push('L2 AC semantic scan failed: at least one AC is uncovered.');
  if (!l3Pass) blockers.push('L3 runtime verification failed: at least one functional domain is dead.');

  return {
    l1: { pass: l1Pass, total: l1Total, covered: l1Covered },
    l2: { pass: l2Pass, total: l2Total, covered: l2Covered, needsReview: l2NeedsReview },
    l3: { pass: l3Pass, total: l3Total, alive: l3Alive },
    overall: blockers.length === 0 ? 'pass' : 'fail',
    timestamp: new Date().toISOString(),
    blockers,
  };
}

export function createTieredScanReport(
  reports: { l1?: L1ScanReport; l2?: L2ScanReport; l3?: L3ScanReport },
): TieredScanReport {
  return {
    summary: summarizeTieredScan(reports),
    ...reports,
  };
}

export function writeTieredScanReport(outputPath: string, report: TieredScanReport): void {
  writeJson(outputPath, report);
}
