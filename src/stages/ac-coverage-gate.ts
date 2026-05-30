import type { GateConclusion } from '../types/index.js';
import type { GateResult, ReviewFinding } from '../gates/gate-types.js';
import { L2ACSemanticScanner } from '../scan/l2-ac-semantic-scanner.js';
import type { L2ScanInput, L2ScanReport } from '../scan/types.js';

export interface ACCoverageGateOutput extends GateResult {
  report: L2ScanReport;
}

export class ACCoverageGate {
  constructor(private readonly scanner = new L2ACSemanticScanner()) {}

  async evaluate(input: L2ScanInput): Promise<ACCoverageGateOutput> {
    const report = await this.scanner.scan(input);
    const findings: ReviewFinding[] = report.entries
      .filter((entry) => entry.status === 'uncovered')
      .map((entry) => ({
        ruleId: 'ac-semantic-coverage',
        severity: 'blocker' as const,
        message: `Acceptance criterion ${entry.acId} is uncovered by semantic scan`,
        field: `acceptanceCriteria.${entry.acId}`,
      }));

    const needsReview = report.entries
      .filter((entry) => entry.status === 'needs-review')
      .map((entry) => ({
        ruleId: 'ac-semantic-confidence',
        severity: 'warning' as const,
        message: `Acceptance criterion ${entry.acId} needs review (confidence ${entry.confidence})`,
        field: `acceptanceCriteria.${entry.acId}`,
      }));

    const allFindings = [...findings, ...needsReview];
    const conclusion: GateConclusion = findings.length > 0 ? 'rejected' : needsReview.length > 0 ? 'conditional' : 'passed';
    const covered = report.entries.filter((entry) => entry.status === 'covered').length;

    return {
      conclusion,
      findings: allFindings,
      mustFix: findings,
      score: report.entries.length === 0 ? 1 : covered / report.entries.length,
      report,
    };
  }
}
