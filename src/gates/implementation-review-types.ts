import type { SpecOutput } from '../stages/spec-types.js';
import type { ImplementationBundle } from '../stages/implement-types.js';
import type { L1ScanInput, L1ScanReport, L2ScanInput, L2ScanReport } from '../scan/types.js';
import type { GateResult } from './gate-types.js';

export interface ImplementationReviewInput {
  specOutput: SpecOutput;
  implementationBundle: ImplementationBundle;
  /** FR-29 L1: optional file-level scan executed when review gate runs. */
  l1ScanInput?: L1ScanInput;
  /** P0-1: optional semantic AC scan executed when review gate runs. */
  l2ScanInput?: L2ScanInput;
}

export interface ACCoverageResult {
  acId: string;
  acContent: string;
  status: 'covered' | 'partial' | 'missing';
  evidence?: string;
}

export interface ImplementationReviewGateOutput extends GateResult {
  coverageResults: ACCoverageResult[];
  coverageRate: number;
  coveredCount: number;
  partialCount: number;
  missingCount: number;
  l1Scan?: L1ScanReport;
  l2Scan?: L2ScanReport;
}
