import type { PostReleaseValidationOutput } from './post-release-validation-types.js';

export interface EndgameDeliveryInput {
  pipelineId: string;
  projectSlug: string;
  specPath: string;
  readmePath: string;
  packageJsonPath: string;
  changedFRs: string[];
  changeType: 'patch' | 'minor' | 'major';
}

export interface LivenessProbeResult {
  goalId: string;
  project: string;
  severity: 'P0' | 'P1';
  passed: boolean;
  output: string;
}

export interface LivenessVerificationResult {
  executed: boolean;
  probes: LivenessProbeResult[];
  p0Failures: string[];
  p1Failures: string[];
}

export interface EndgameDeliveryResult {
  readmeUpdated: boolean;
  versionBumped: { from: string; to: string } | null;
  publishResult: { success: boolean; platforms: string[]; error?: string };
  livenessResult: LivenessVerificationResult;
  gapScanResult: { totalFRs: number; coveredFRs: number; gaps: string[] };
}

export interface ReadmeSyncCheckResult {
  missingFrs: string[];
  semanticMatches: Array<{
    frId: string;
    covered: boolean;
    rationale: string;
  }>;
}

export interface VersionBumpDecision {
  level: 'patch' | 'minor' | 'major';
  from: string;
  to: string;
}

export interface GapScanSummary {
  totalFRs: number;
  coveredFRs: number;
  gaps: string[];
  raw: PostReleaseValidationOutput;
}
