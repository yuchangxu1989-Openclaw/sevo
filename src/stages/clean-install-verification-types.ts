import type { ArtifactRef } from '../types/index.js';

export type CleanInstallLayer = 'l1' | 'l2' | 'l3';
export type CleanInstallStatus = 'pass' | 'fail';

export interface CleanInstallCheck {
  id: string;
  description: string;
  status: CleanInstallStatus;
  output?: string;
  suggestion?: string;
}

export interface CleanInstallLayerReport {
  pass: boolean;
  checks: CleanInstallCheck[];
}

export interface CleanInstallFailedCheck {
  layer: CleanInstallLayer;
  checkId: string;
  description: string;
  output?: string;
}

export interface CleanInstallFixTask {
  layer: CleanInstallLayer;
  checkId: string;
  suggestion: string;
}

export interface CleanInstallVerificationReport {
  l1: CleanInstallLayerReport;
  l2: CleanInstallLayerReport;
  l3: CleanInstallLayerReport;
  overall: 'pass' | 'fail';
  failedChecks: CleanInstallFailedCheck[];
  fixTasks: CleanInstallFixTask[];
}

export interface CleanInstallDeclaredCheck {
  id: string;
  description: string;
  command: string;
  suggestion?: string;
}

export interface CleanInstallVerificationInput {
  taskId: string;
  pipelineId: string;
  projectSlug: string;
  packageName: string;
  version: string;
  cliBin: string;
  projectRoot: string;
  artifactBasePath?: string;
  l1ScriptPath?: string;
  l2Checks?: CleanInstallDeclaredCheck[];
  l3Checks?: CleanInstallDeclaredCheck[];
  isolationBasePath?: string;
  keepIsolationDir?: boolean;
  skip?: boolean;
}

export interface CleanInstallVerificationOutput {
  report: CleanInstallVerificationReport;
  canComplete: boolean;
  artifact: ArtifactRef;
}

export interface CleanInstallExecResult {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

export interface CleanInstallVerificationStageOptions {
  execFile?: (
    file: string,
    args: string[],
    options: { cwd: string; encoding: 'utf8'; timeout: number; maxBuffer: number },
  ) => CleanInstallExecResult;
  now?: () => string;
}
