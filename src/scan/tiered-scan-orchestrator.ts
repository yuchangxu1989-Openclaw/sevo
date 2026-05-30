import { L1FileScanner } from './l1-file-scanner.js';
import { L2ACSemanticScanner } from './l2-ac-semantic-scanner.js';
import { L3RuntimeVerifier } from './l3-runtime-verifier.js';
import { createTieredScanReport, writeTieredScanReport } from './scan-report.js';
import type { TieredScanInput, TieredScanReport } from './types.js';

export class TieredScanOrchestrator {
  constructor(
    private readonly l1Scanner = new L1FileScanner(),
    private readonly l2Scanner = new L2ACSemanticScanner(),
    private readonly l3Verifier = new L3RuntimeVerifier(),
  ) {}

  async run(input: TieredScanInput): Promise<TieredScanReport> {
    const l1 = input.l1 ? this.l1Scanner.scan(input.l1) : undefined;
    const l1Passed = l1?.pass ?? true;

    const l2 = input.l2 && l1Passed
      ? await this.l2Scanner.scan(input.l2)
      : undefined;
    const l2Passed = l2?.pass ?? true;

    const l3 = input.l3 && l1Passed && l2Passed
      ? await this.l3Verifier.verify({
          ...input.l3,
          l2Results: input.l3.l2Results ?? l2?.entries,
        })
      : undefined;

    const report = createTieredScanReport({ l1, l2, l3 });
    if (input.l2 && !l1Passed) {
      report.summary.blockers.push('L2 skipped because L1 failed');
    }
    if (input.l3 && !l1Passed) {
      report.summary.blockers.push('L3 skipped because L1 failed');
    } else if (input.l3 && !l2Passed) {
      report.summary.blockers.push('L3 skipped because L2 failed');
    }

    if (input.outputPath) writeTieredScanReport(input.outputPath, report);
    return report;
  }
}
