import { L1FileScanner } from './l1-file-scanner.js';
import { L1LlmScanner } from './l1-llm-scanner.js';
import type { L1LlmScanInput } from './l1-llm-scanner.js';
import { L2ACSemanticScanner } from './l2-ac-semantic-scanner.js';
import { L3RuntimeVerifier } from './l3-runtime-verifier.js';
import { createTieredScanReport, writeTieredScanReport } from './scan-report.js';
import type { TieredScanInput, TieredScanReport, L1ScanInput } from './types.js';
import type { LLMProviderConfig } from '../llm/index.js';

export type ScannerMode = 'llm' | 'filename';

export interface TieredScanOptions {
  /** Scanner mode: 'llm' uses LLM semantic mapping, 'filename' uses legacy file-name matching. Default: 'llm'. */
  scanner?: ScannerMode;
  /** LLM config for LLM scanner mode. */
  llm?: LLMProviderConfig;
  /** If true, regenerate sevo.scan.json even if it exists. */
  regenerateMap?: boolean;
}

export class TieredScanOrchestrator {
  constructor(
    private readonly l1FileScanner = new L1FileScanner(),
    private readonly l1LlmScanner = new L1LlmScanner(),
    private readonly l2Scanner = new L2ACSemanticScanner(),
    private readonly l3Verifier = new L3RuntimeVerifier(),
  ) {}

  async run(input: TieredScanInput, options?: TieredScanOptions): Promise<TieredScanReport> {
    const scannerMode: ScannerMode = options?.scanner ?? 'llm';

    // Run L1
    let l1: TieredScanReport['l1'];
    if (input.l1) {
      if (scannerMode === 'llm') {
        const llmInput: L1LlmScanInput = {
          ...input.l1,
          llm: options?.llm,
          regenerateMap: options?.regenerateMap,
        };
        l1 = await this.l1LlmScanner.scan(llmInput);
      } else {
        l1 = this.l1FileScanner.scan(input.l1);
      }
    }
    const l1Passed = l1?.pass ?? true;

    // Always run L2 if requested (don't skip on L1 failure)
    const l2 = input.l2
      ? await this.l2Scanner.scan(input.l2)
      : undefined;
    const l2Passed = l2?.pass ?? true;

    // Always run L3 if requested (don't skip on L1/L2 failure)
    const l3 = input.l3
      ? await this.l3Verifier.verify({
          ...input.l3,
          l2Results: input.l3.l2Results ?? l2?.entries,
        })
      : undefined;

    const report = createTieredScanReport({ l1, l2, l3 });

    // Add informational blockers (but don't skip execution)
    if (!l1Passed && input.l2) {
      report.summary.blockers.push('L1 has uncovered FRs (L2/L3 still executed for full picture)');
    }
    if (!l2Passed && input.l3) {
      report.summary.blockers.push('L2 has uncovered ACs (L3 still executed for full picture)');
    }

    if (input.outputPath) writeTieredScanReport(input.outputPath, report);
    return report;
  }
}
