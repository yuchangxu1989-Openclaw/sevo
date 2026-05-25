import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  DeployStageInput,
  DeployStageOutput,
  DeployStageOptions,
  ReleaseArtifact,
  DeployTarget,
  PublishReleaseResult,
  PublishTargetStatus,
} from './deploy-types.js';

// NFR-5.18: 禁止字面量宿主绝对路径。publishScript 通过 input > options > env 注入，
// 缺失时显式抛错而不是回退到维护者私有路径。env 名遵循 NFR-5.19 的 `SEVO_` 前缀约定。
const PUBLISH_SCRIPT_ENV = 'SEVO_PUBLISH_SCRIPT';
const DEFAULT_PUBLISH_PROJECT = 'sevo';
const DEFAULT_PUBLISH_BUMP = 'patch';

function resolvePublishScript(
  inputScript: string | undefined,
  optionsScript: string | undefined,
): string {
  const candidates = [
    inputScript,
    optionsScript,
    process.env[PUBLISH_SCRIPT_ENV],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  throw new Error(
    `SEVO_PUBLISH_SCRIPT_MISSING: deploy stage requires publishScript via input.publishScript, \
options.publishScript, or env ${PUBLISH_SCRIPT_ENV}; refusing to fall back to a host-specific absolute path.`,
  );
}

export class DeployStage implements Stage<DeployStageInput, DeployStageOutput> {
  readonly stageId: StageId = 'deploy' as const;
  private readonly now: () => string;

  constructor(private readonly options: DeployStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: DeployStageInput): Promise<DeployStageOutput> {
    const timestamp = this.now();

    // AC-4.29: Build release artifact with version, source, scope
    const releaseArtifact: ReleaseArtifact = {
      version: input.version,
      source: input.source,
      scope: input.scope,
      releaseNotes: input.releaseNotes,
      artifacts: input.candidateArtifacts,
      createdAt: timestamp,
    };

    let publishResult: PublishReleaseResult | undefined;
    if (input.publishTargets && input.publishTargets.length > 0) {
      publishResult = this.runPublishRelease(input);
    }

    // AC-4.30 / AC-4.31: Deploy to targets; failure does not pollute candidate
    let allSuccess = true;
    for (const target of input.targets) {
      const success = await this.deployToTarget(target, releaseArtifact);
      if (!success) {
        allSuccess = false;
        break;
      }
    }

    if (publishResult && !publishResult.success) {
      allSuccess = false;
    }

    // AC-4.32: Write artifact so Verify can consume it
    const artifact = await this.writeArtifact(input, releaseArtifact, allSuccess, timestamp, publishResult);

    return {
      releaseArtifact,
      metadata: {
        version: input.version,
        targetCount: input.targets.length,
        deployedAt: timestamp,
        success: allSuccess,
        publishExecuted: Boolean(publishResult),
        publishSuccess: publishResult?.success,
      },
      artifact,
      verifyReady: allSuccess,
      publishResult,
    };
  }

  private async deployToTarget(target: DeployTarget, release: ReleaseArtifact): Promise<boolean> {
    if (!this.options.adapter.deploy) {
      return true;
    }
    const response = await this.options.adapter.deploy({ target, releaseArtifact: release });
    return response.success;
  }

  private runPublishRelease(input: DeployStageInput): PublishReleaseResult {
    const scriptPath = resolvePublishScript(input.publishScript, this.options.publishScript);
    const project = this.options.publishProject ?? DEFAULT_PUBLISH_PROJECT;
    const bump = this.options.publishBump ?? DEFAULT_PUBLISH_BUMP;
    const commandCwd = this.options.publishCommandCwd ?? process.cwd();
    const execFileSync = this.options.execFileSync ?? nodeExecFileSync;
    const targets = input.publishTargets ?? [];
    const args = [scriptPath, project, bump] as const;
    const command = `bash ${args.map((arg) => this.escapeShellArg(arg)).join(' ')}`;

    try {
      const output = execFileSync('bash', [...args], {
        cwd: commandCwd,
        encoding: 'utf8',
      });
      const rawOutput = this.normalizeExecOutput(output);
      const statuses = this.parsePublishStatuses(rawOutput, targets);
      return {
        scriptPath,
        command,
        project,
        requestedTargets: [...targets],
        success: this.isPublishSuccess(true, statuses, targets),
        rawOutput,
        statuses,
      };
    } catch (error) {
      const rawOutput = this.extractExecErrorOutput(error);
      const statuses = this.parsePublishStatuses(rawOutput, targets);
      return {
        scriptPath,
        command,
        project,
        requestedTargets: [...targets],
        success: this.isPublishSuccess(false, statuses, targets),
        rawOutput,
        statuses,
      };
    }
  }

  private isPublishSuccess(
    commandSucceeded: boolean,
    statuses: PublishTargetStatus[],
    requestedTargets: string[],
  ): boolean {
    if (!commandSucceeded) {
      return false;
    }

    const statusMap = new Map(statuses.map((status) => [status.target.toLowerCase(), status]));
    return requestedTargets.every((target) => {
      const status = statusMap.get(target.toLowerCase());
      return Boolean(status?.reported && status.success);
    });
  }

  private parsePublishStatuses(rawOutput: string, requestedTargets: string[]): PublishTargetStatus[] {
    const normalizedOutput = rawOutput.replace(/\r/g, '');
    const lines = normalizedOutput.split('\n');
    const statuses = new Map<string, PublishTargetStatus>();

    const ensureStatus = (target: string): PublishTargetStatus => {
      const key = target.toLowerCase();
      const existing = statuses.get(key);
      if (existing) {
        return existing;
      }
      const created: PublishTargetStatus = {
        target,
        reported: false,
        success: false,
      };
      statuses.set(key, created);
      return created;
    };

    for (const target of requestedTargets) {
      ensureStatus(target);
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('npm: ')) {
        const status = ensureStatus('npm');
        status.reported = true;
        status.success = trimmed.includes('@');
        status.detail = trimmed;
      }

      if (trimmed.startsWith('github: ')) {
        const status = ensureStatus('github');
        status.reported = true;
        status.success = !trimmed.includes('unknown') && !trimmed.includes('<empty>');
        status.detail = trimmed;
      }

      if (trimmed.startsWith('main-repo: ')) {
        const status = ensureStatus('main-repo');
        status.reported = true;
        status.success = !trimmed.includes('<no-origin>');
        status.detail = trimmed;
      }
    }

    if (statuses.has('clawhub')) {
      const status = statuses.get('clawhub');
      if (status && !status.reported) {
        status.detail = 'Target requested but publish script does not report ClawHub status';
      }
    }

    return Array.from(statuses.values());
  }

  private normalizeExecOutput(output: string | Buffer): string {
    if (Buffer.isBuffer(output)) {
      return output.toString('utf8');
    }
    return output;
  }

  private extractExecErrorOutput(error: unknown): string {
    if (error && typeof error === 'object') {
      const stdout = 'stdout' in error ? this.tryReadExecField((error as Record<string, unknown>).stdout) : '';
      const stderr = 'stderr' in error ? this.tryReadExecField((error as Record<string, unknown>).stderr) : '';
      const message = 'message' in error && typeof (error as Record<string, unknown>).message === 'string'
        ? String((error as Record<string, unknown>).message)
        : '';
      return [stdout, stderr, message].filter((part) => part.length > 0).join('\n');
    }

    return String(error ?? 'Unknown publish execution failure');
  }

  private tryReadExecField(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (Buffer.isBuffer(value)) {
      return value.toString('utf8');
    }

    return '';
  }

  private escapeShellArg(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private async writeArtifact(
    input: DeployStageInput,
    release: ReleaseArtifact,
    success: boolean,
    timestamp: string,
    publishResult?: PublishReleaseResult,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'deploy');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-release-artifact.json`);
    await writeFile(
      filePath,
      JSON.stringify({ ...release, deploySuccess: success, publishResult }, null, 2),
      'utf8',
    );

    return {
      id: `${input.taskId}:release-artifact`,
      type: 'release-artifact',
      path: filePath,
      createdAt: timestamp,
      metadata: { version: input.version, success, publishExecuted: Boolean(publishResult) },
    };
  }
}
