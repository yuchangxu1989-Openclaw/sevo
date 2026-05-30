import type { ArtifactRef } from '../types/index.js';

// ── Release Artifact ────────────────────────────────────────────

export interface ReleaseArtifact {
  version: string;
  source: string;
  scope: string;
  releaseNotes: string;
  artifacts: ArtifactRef[];
  createdAt: string;
}

export interface PublishTargetStatus {
  target: string;
  reported: boolean;
  success: boolean;
  detail?: string;
}

export interface PublishReleaseResult {
  scriptPath: string;
  command: string;
  project: string;
  requestedTargets: string[];
  success: boolean;
  rawOutput: string;
  statuses: PublishTargetStatus[];
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface DeployTarget {
  environment: string;
  description?: string;
}

export interface DeployStageInput {
  taskId: string;
  pipelineId?: string;
  version: string;
  source: string;
  scope: string;
  releaseNotes: string;
  candidateArtifacts: ArtifactRef[];
  targets: DeployTarget[];
  artifactBasePath?: string;
  publishScript?: string;
  publishTargets?: string[];
}

export interface DeployStageOutput {
  releaseArtifact: ReleaseArtifact;
  metadata: DeployMetadata;
  artifact: ArtifactRef;
  verifyReady: boolean;
  publishResult?: PublishReleaseResult;
}

export interface DeployMetadata {
  version: string;
  targetCount: number;
  deployedAt: string;
  success: boolean;
  publishExecuted: boolean;
  publishSuccess?: boolean;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface DeployRequest {
  target: DeployTarget;
  releaseArtifact: ReleaseArtifact;
}

export interface DeployResponse {
  success: boolean;
  error?: string;
}

export type DeployExecFileSync = (
  file: string,
  args: readonly string[],
  options?: {
    encoding?: BufferEncoding;
    cwd?: string;
  },
) => string | Buffer;

export interface DeployStageOptions {
  adapter: {
    deploy?: (request: DeployRequest) => Promise<DeployResponse>;
  };
  now?: () => string;
  execFileSync?: DeployExecFileSync;
  publishScript?: string;
  publishProject?: string;
  publishBump?: 'patch' | 'minor' | 'major';
  publishCommandCwd?: string;
}
