/**
 * Verify-with-Real-Data Gate Types — FR-36 implementation.
 *
 * This gate runs before the final verify stage to ensure the pipeline
 * can process real-world materials end-to-end, not just synthetic test data.
 */

import type { ArtifactRef } from '../types/index.js';

export interface RealDataVerifyInput {
  /** Path to directory containing real materials for verification. */
  materialDir: string;
  /** Minimum number of materials that must be processed successfully. */
  minSuccessCount?: number;
  /** Maximum allowed failure rate (0-1). Default: 0.2 (20%). */
  maxFailureRate?: number;
}

export interface MaterialProcessResult {
  /** File path of the material. */
  filePath: string;
  /** Whether processing succeeded. */
  success: boolean;
  /** Processing output summary. */
  output: string;
  /** Error message if failed. */
  error?: string;
  /** Processing duration in ms. */
  durationMs: number;
}

export interface RealDataVerifyReport {
  /** Overall pass/fail. */
  pass: boolean;
  /** Total materials found. */
  totalMaterials: number;
  /** Successfully processed count. */
  successCount: number;
  /** Failed count. */
  failureCount: number;
  /** Failure rate (0-1). */
  failureRate: number;
  /** Individual results. */
  results: MaterialProcessResult[];
  /** Timestamp of verification. */
  verifiedAt: string;
  /** Path where report was written. */
  reportPath?: string;
}
