import * as fs from 'node:fs';
import * as path from 'node:path';

import type { GateConclusion } from '../types/index.js';
import type { AcceptanceCriteria, FunctionalRequirement, SpecOutput } from '../stages/spec-types.js';
import type { ImplementationBundle, TaskExecution } from '../stages/implement-types.js';
import { L1FileScanner } from '../scan/l1-file-scanner.js';
import { L2ACSemanticScanner } from '../scan/l2-ac-semantic-scanner.js';
import type { L2ScanInput, L2ScanReport } from '../scan/types.js';
import type { GateResult, GateSeverity, ReviewFinding } from './gate-types.js';
import type {
  ACCoverageResult,
  ImplementationReviewGateOutput,
  ImplementationReviewInput,
} from './implementation-review-types.js';

interface ExtractedAC {
  ac: AcceptanceCriteria;
  fr: FunctionalRequirement;
}

interface ImplementationReviewGateOptions {
  l2Scanner?: Pick<L2ACSemanticScanner, 'scan'>;
}

export class ImplementationReviewGate {
  constructor(private readonly options: ImplementationReviewGateOptions = {}) {}

  async evaluate(input: ImplementationReviewInput): Promise<ImplementationReviewGateOutput> {
    return this.evaluateSyncCore(input, await this.runL2Scan(input));
  }

  evaluateSync(input: ImplementationReviewInput): ImplementationReviewGateOutput {
    return this.evaluateSyncCore(input);
  }

  private evaluateSyncCore(input: ImplementationReviewInput, l2Scan?: L2ScanReport): ImplementationReviewGateOutput {
    const extractedAcs = this.extractAcceptanceCriteria(input.specOutput);

    if (extractedAcs.length === 0) {
      return {
        conclusion: 'passed',
        findings: [],
        mustFix: [],
        score: 1,
        coverageResults: [],
        coverageRate: 1,
        coveredCount: 0,
        partialCount: 0,
        missingCount: 0,
      };
    }

    const coverageResults = extractedAcs.map(({ ac, fr }) =>
      this.evaluateCoverage(ac, fr, input.implementationBundle),
    );

    const l1Scan = input.l1ScanInput ? new L1FileScanner().scan(input.l1ScanInput) : undefined;

    const findings: ReviewFinding[] = [
      ...coverageResults.flatMap((result) => this.toCoverageFindings(result)),
      ...this.findFailedTests(coverageResults, input.implementationBundle.executions),
      ...this.toL1Findings(l1Scan),
      ...this.toL2Findings(l2Scan, extractedAcs),
    ];

    const mustFix = findings.filter((f) => f.severity === 'blocker');
    const warnings = findings.filter((f) => f.severity === 'warning');

    const coveredCount = coverageResults.filter((r) => r.status === 'covered').length;
    const partialCount = coverageResults.filter((r) => r.status === 'partial').length;
    const missingCount = coverageResults.filter((r) => r.status === 'missing').length;
    const coverageRate = coveredCount / coverageResults.length;
    const score = coverageRate;

    let conclusion: GateConclusion;
    if (mustFix.length > 0 || coverageRate < 1) {
      conclusion = 'rejected';
    } else if (warnings.length > 0) {
      conclusion = 'conditional';
    } else {
      conclusion = 'passed';
    }

    return {
      conclusion,
      findings,
      mustFix,
      score,
      coverageResults,
      coverageRate,
      coveredCount,
      partialCount,
      missingCount,
      l1Scan,
      l2Scan,
    };
  }

  private extractAcceptanceCriteria(specOutput: SpecOutput): ExtractedAC[] {
    return specOutput.functionalRequirements.flatMap((fr) =>
      fr.acceptanceCriteria.map((ac) => ({ ac, fr })),
    );
  }

  private evaluateCoverage(
    ac: AcceptanceCriteria,
    fr: FunctionalRequirement,
    implementationBundle: ImplementationBundle,
  ): ACCoverageResult {
    const directMatches = implementationBundle.executions.filter((execution) =>
      execution.allowedScope.includes(ac.id),
    );

    if (directMatches.length > 0) {
      return {
        acId: ac.id,
        acContent: ac.description,
        status: 'covered',
        evidence: this.formatEvidence(directMatches),
      };
    }

    const frLevelMatches = implementationBundle.executions.filter((execution) =>
      execution.allowedScope.includes(fr.id),
    );

    if (frLevelMatches.length > 0) {
      return {
        acId: ac.id,
        acContent: ac.description,
        status: 'partial',
        evidence: this.formatEvidence(frLevelMatches),
      };
    }

    return {
      acId: ac.id,
      acContent: ac.description,
      status: 'missing',
    };
  }

  private toCoverageFindings(result: ACCoverageResult): ReviewFinding[] {
    if (result.status === 'missing') {
      return [finding(
        'implementation-ac-coverage',
        'blocker',
        `Acceptance criterion ${result.acId} is not implemented: ${result.acContent}`,
        `acceptanceCriteria.${result.acId}`,
      )];
    }

    if (result.status === 'partial') {
      return [finding(
        'implementation-ac-coverage',
        'blocker',
        `Acceptance criterion ${result.acId} is only partially covered via FR-level scope: ${result.acContent}${result.evidence ? ` (${result.evidence})` : ''}`,
        `acceptanceCriteria.${result.acId}`,
      )];
    }

    return [];
  }

  private findFailedTests(
    coverageResults: ACCoverageResult[],
    executions: TaskExecution[],
  ): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const result of coverageResults) {
      if (result.status !== 'covered') {
        continue;
      }

      const matchedExecutions = executions.filter((execution) => execution.allowedScope.includes(result.acId));
      const failedTests = matchedExecutions.flatMap((execution) =>
        execution.testResults
          .filter((test) => !test.passed)
          .map((test) => ({ execution, test })),
      );

      if (failedTests.length === 0) {
        continue;
      }

      const evidence = failedTests
        .map(({ execution, test }) => `${execution.taskId}:${test.name}${test.message ? ` (${test.message})` : ''}`)
        .join(', ');

      findings.push(finding(
        'implementation-test-results',
        'blocker',
        `Acceptance criterion ${result.acId} has failing tests: ${evidence}`,
        `acceptanceCriteria.${result.acId}`,
      ));
    }

    return findings;
  }

  private formatEvidence(executions: TaskExecution[]): string {
    return executions
      .map((execution) => execution.subTaskId ? `${execution.taskId} (subTask:${execution.subTaskId})` : execution.taskId)
      .join(', ');
  }

  private async runL2Scan(input: ImplementationReviewInput): Promise<L2ScanReport | undefined> {
    const l2Input = input.l2ScanInput ?? this.inferL2ScanInput(input);
    if (!l2Input) return undefined;
    return (this.options.l2Scanner ?? new L2ACSemanticScanner()).scan(l2Input);
  }

  private inferL2ScanInput(input: ImplementationReviewInput): L2ScanInput | undefined {
    if (input.l1ScanInput) {
      return {
        specPath: input.l1ScanInput.specPath,
        sourceDir: input.l1ScanInput.sourceDir,
        writeReport: false,
      };
    }

    const specPath = input.specOutput.artifact.path;
    if (!specPath || !fs.existsSync(specPath)) return undefined;

    const projectRoot = this.inferProjectRoot(specPath);
    const sourceDir = fs.existsSync(path.join(projectRoot, 'src'))
      ? path.join(projectRoot, 'src')
      : projectRoot;

    return { specPath, sourceDir, writeReport: false };
  }

  private inferProjectRoot(specPath: string): string {
    let dir = path.dirname(path.resolve(specPath));
    while (path.basename(dir) === 'design' || path.basename(dir) === 'docs' || path.basename(dir) === 'specs') {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return dir;
  }

  private toL1Findings(l1Scan: import('../scan/types.js').L1ScanReport | undefined): ReviewFinding[] {
    if (!l1Scan || l1Scan.pass) return [];

    const findings: ReviewFinding[] = [];
    for (const entry of l1Scan.entries.filter((item) => item.status === 'uncovered')) {
      findings.push(finding(
        'implementation-l1-gap-scan',
        'blocker',
        `Functional requirement ${entry.frId} failed L1 scan: ${entry.reason ?? 'uncovered'}`,
        `functionalRequirements.${entry.frId}`,
      ));
    }

    if (!l1Scan.compile.passed) {
      findings.push(finding(
        'implementation-l1-compile',
        'blocker',
        `L1 compile check failed: ${l1Scan.compile.output}`,
      ));
    }

    if (!l1Scan.tests.passed) {
      findings.push(finding(
        'implementation-l1-tests',
        'blocker',
        `L1 test check failed: ${l1Scan.tests.output}`,
      ));
    }

    return findings;
  }

  private toL2Findings(l2Scan: L2ScanReport | undefined, extractedAcs: ExtractedAC[]): ReviewFinding[] {
    if (!l2Scan) return [];

    const findings: ReviewFinding[] = [];
    const acById = new Map(extractedAcs.map(({ ac }) => [ac.id, ac]));

    for (const entry of l2Scan.entries) {
      if (entry.status === 'covered') continue;

      const severity: GateSeverity = entry.status === 'uncovered' ? 'blocker' : 'warning';
      const ac = acById.get(entry.acId);
      const critical = ac ? this.isCriticalAcceptanceCriteria(ac) : false;
      findings.push(finding(
        entry.status === 'uncovered' ? 'implementation-l2-ac-semantic-coverage' : 'implementation-l2-ac-semantic-review',
        critical ? 'blocker' : severity,
        `Acceptance criterion ${entry.acId} ${entry.status === 'uncovered' ? 'is not covered' : 'needs review'} by L2 semantic scan: ${entry.rationale ?? 'no semantic evidence'}${critical ? ' (critical AC)' : ''}`,
        `acceptanceCriteria.${entry.acId}`,
      ));
    }

    return findings;
  }

  private isCriticalAcceptanceCriteria(ac: AcceptanceCriteria): boolean {
    const metadata = (ac as unknown as { metadata?: { critical?: unknown; severity?: unknown; priority?: unknown } }).metadata;
    const severity = String(metadata?.severity ?? metadata?.priority ?? '').toLowerCase();
    return metadata?.critical === true
      || severity === 'critical'
      || severity === 'p0'
      || /(?:\bcritical\b|\bP0\b|关键|阻断)/i.test(ac.description);
  }

}

function finding(ruleId: string, severity: GateSeverity, message: string, field?: string): ReviewFinding {
  return { ruleId, severity, message, field };
}
