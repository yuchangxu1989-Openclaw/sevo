import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  VerifyStageInput,
  VerifyStageOutput,
  VerifyStageOptions,
  VerificationBundle,
  VerificationCheck,
  VerifyTarget,
} from './verify-types.js';

export class VerifyStage implements Stage<VerifyStageInput, VerifyStageOutput> {
  readonly stageId: StageId = 'verify' as const;
  private readonly now: () => string;

  constructor(private readonly options: VerifyStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: VerifyStageInput): Promise<VerifyStageOutput> {
    const checks: VerificationCheck[] = [];

    // AC-4.33 / AC-4.34: Run each verification target independently
    for (const target of input.targets) {
      const check = await this.runCheck(target, input.releaseArtifact);
      checks.push(check);
    }

    const explicitPassChecks = checks.filter((c) => c.status === 'pass');
    const failedChecks = checks.filter((c) => c.status === 'fail');
    const tieredScanEvidence = this.extractTieredScanEvidence(input.releaseArtifact);
    const noVerificationEvidence = explicitPassChecks.length === 0 && failedChecks.length === 0;
    const effectiveFailedChecks = noVerificationEvidence
      ? [this.noEvidenceCheck()]
      : [...failedChecks, ...(tieredScanEvidence?.status === 'fail' ? [tieredScanEvidence] : [])];
    const allPassed = effectiveFailedChecks.length === 0;

    // AC-4.35: Distinguish deliverable vs not-deliverable
    const bundle: VerificationBundle = {
      checks,
      allPassed,
      failedChecks: effectiveFailedChecks,
      deliverable: allPassed,
    };

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, bundle, timestamp);

    const passed = checks.filter((c) => c.status === 'pass').length;
    const skipped = checks.filter((c) => c.status === 'skip').length;

    return {
      verificationBundle: bundle,
      metadata: {
        totalChecks: checks.length + (tieredScanEvidence ? 1 : 0),
        passed,
        failed: effectiveFailedChecks.length,
        skipped,
        verifiedAt: timestamp,
      },
      artifact,
      // AC-4.36: Verify failure blocks Ledger pass conclusion
      deliverable: allPassed,
    };
  }

  private extractTieredScanEvidence(artifact: ArtifactRef): VerificationCheck | undefined {
    const scan = artifact.metadata?.['tieredScan'];
    if (!scan || typeof scan !== 'object') return undefined;
    const status = (scan as { status?: unknown }).status;
    if (status !== 'passed' && status !== 'failed') return undefined;
    return {
      id: 'verify-tiered-scan',
      description: 'Review-to-verify tiered scan evidence',
      category: 'functional',
      status: status === 'passed' ? 'pass' : 'fail',
      detail: `Tiered scan ${status}`,
    };
  }

  private noEvidenceCheck(): VerificationCheck {
    return {
      id: 'verify-no-evidence',
      description: 'Explicit verification evidence is required',
      category: 'deliverability',
      status: 'fail',
      detail: 'No verification evidence provided',
    };
  }

  private async runCheck(target: VerifyTarget, releaseArtifact: ArtifactRef): Promise<VerificationCheck> {
    if (!this.options.adapter.runVerification) {
      return {
        id: target.id,
        description: target.description,
        category: target.category,
        status: 'skip',
        detail: 'No verification adapter provided',
      };
    }

    const response = await this.options.adapter.runVerification({ target, releaseArtifact });

    return {
      id: target.id,
      description: target.description,
      category: target.category,
      status: response.status,
      detail: response.detail,
    };
  }

  private async writeArtifact(
    input: VerifyStageInput,
    bundle: VerificationBundle,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'verify');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-verification-bundle.json`);
    await writeFile(filePath, JSON.stringify({ ...bundle, verifiedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:verification-bundle`,
      type: 'verification-bundle',
      path: filePath,
      createdAt: timestamp,
      metadata: { checkCount: bundle.checks.length, deliverable: bundle.deliverable },
    };
  }
}
