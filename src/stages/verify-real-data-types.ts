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

export interface DatabaseIssue {
  /** Database file containing the problematic row or aggregate. */
  databasePath: string;
  /** Table containing the issue. */
  tableName: string;
  /** Problem class defined by FR-36 AC-36.7. */
  kind: 'test-residue' | 'dead-data' | 'garbage-data' | 'stats-drift';
  /** Primary key or synthetic row identifier when available. */
  rowId?: string | number;
  /** Column that triggered the issue when known. */
  columnName?: string;
  /** Sample value for diagnostics. */
  sampleValue?: string;
  /** Human-readable reason for the issue. */
  reason: string;
  /** Suggested cleanup action. */
  suggestedAction?: 'delete' | 'mark-failed' | 'dedupe' | 'repair-counter' | 'review';
}

export interface TableAuthenticityReport {
  /** Database file that owns the table. */
  databasePath: string;
  /** Table name under inspection. */
  tableName: string;
  /** Total row count in the table. */
  rowCount: number;
  /** Number of rows flagged by heuristics or drift checks. */
  issueCount: number;
  /** Flagged ratio derived from issueCount / rowCount. */
  issueRatio: number;
  /** Whether the table stayed within the configured threshold. */
  pass: boolean;
  /** Detailed findings for the table. */
  issues: DatabaseIssue[];
}

export interface DatabaseAuthenticityResult {
  /** Whether all scanned user-data tables stay within threshold. */
  pass: boolean;
  /** Number of database files scanned. */
  scannedDatabases: number;
  /** Number of user-data tables scanned. */
  scannedTables: number;
  /** Number of rows scanned across user-data tables. */
  scannedRows: number;
  /** Maximum allowed issue ratio per table. */
  threshold: number;
  /** Per-table authenticity reports. */
  tables: TableAuthenticityReport[];
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
  /** Runtime database authenticity verdict. */
  databaseAuthenticity?: DatabaseAuthenticityResult;
}
