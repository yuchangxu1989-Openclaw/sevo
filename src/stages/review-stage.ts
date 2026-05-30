import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, GateConclusion, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  ReviewStageInput,
  ReviewStageOutput,
  ReviewStageOptions,
  ReviewBundle,
  DimensionReview,
  ReviewFinding,
  ReviewFixRequirement,
  DimensionReviewRequest,
  ReviewDimension,
} from './review-types.js';
import { ALL_REVIEW_DIMENSIONS } from './review-types.js';
import { checkDeploymentView } from './deployment-view-check.js';
import type { DeploymentViewReport } from './deployment-view-check.js';

export class ReviewStage implements Stage<ReviewStageInput, ReviewStageOutput> {
  readonly stageId: StageId = 'review' as const;
  private readonly now: () => string;

  constructor(private readonly options: ReviewStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: ReviewStageInput): Promise<ReviewStageOutput> {
    // AC-4.21: Dual-dimension parallel review (quality + product)
    const settled = await Promise.allSettled(
      ALL_REVIEW_DIMENSIONS.map((dim) => this.evaluateDimension(dim, input)),
    );

    const reviews: DimensionReview[] = [];
    for (let i = 0; i < ALL_REVIEW_DIMENSIONS.length; i++) {
      const result = settled[i]!;
      if (result.status === 'fulfilled') {
        reviews.push(result.value);
      } else {
        // Dimension evaluation failed — treat as rejected
        reviews.push({
          dimension: ALL_REVIEW_DIMENSIONS[i]!,
          conclusion: 'rejected',
          findings: [{
            id: `error-${ALL_REVIEW_DIMENSIONS[i]!}`,
            dimension: ALL_REVIEW_DIMENSIONS[i]!,
            severity: 'blocker',
            message: `Dimension evaluation failed: ${String(result.reason)}`,
          }],
          reviewer: 'system',
        });
      }
    }

    const sourceRoots = normalizeRoots(input.sourceRoots);
    const scannedRoots = normalizeRoots(input.scannedRoots ?? input.sourceRoots);
    const missingSourceRoots = sourceRoots.filter((root) => !scannedRoots.includes(root));

    const scanFindings: ReviewFinding[] = [];
    if (scannedRoots.length > 0) {
      scanFindings.push({
        id: 'scan-roots-info',
        dimension: 'quality',
        severity: 'info',
        message: `Review scanned source roots: ${scannedRoots.join(', ')}`,
        artifact: 'sourceRoots',
      });
    }
    if (missingSourceRoots.length > 0) {
      scanFindings.push({
        id: 'scan-roots-missing',
        dimension: 'quality',
        severity: 'blocker',
        message: `Review scan omitted configured source roots: ${missingSourceRoots.join(', ')}`,
        artifact: 'sourceRoots',
      });
    }

    // AC-4.22: Three-tier conclusion (passed/conditional/rejected)
    const gateConclusion = deriveConclusion(reviews, scanFindings);

    // AC-4.23: Blockers point to specific artifacts with fix requirements
    const blockers = [
      ...reviews.flatMap((r) => r.findings.filter((f) => f.severity === 'blocker')),
      ...scanFindings.filter((f) => f.severity === 'blocker'),
    ];
    const fixRequirements = blockers.map((b) => toFixRequirement(b));

    const reviewBundle: ReviewBundle = {
      reviews,
      gateConclusion,
      blockers,
      fixRequirements,
      sourceRoots,
      scannedRoots,
      missingSourceRoots,
    };

    // FR-06e: Deployment view check
    let deploymentView: DeploymentViewReport | undefined;
    if (input.projectRoot) {
      deploymentView = checkDeploymentView({
        projectRoot: input.projectRoot,
        skip: input.skipDeploymentCheck,
      });
      reviewBundle.deploymentView = deploymentView;

      // If deployment view check failed, add blockers
      if (deploymentView.checked && !deploymentView.passed) {
        for (const result of deploymentView.results) {
          if (!result.passed) {
            const finding: ReviewFinding = {
              id: `deployment-view-${result.consumer.type}-${result.consumer.path}`,
              dimension: 'quality',
              severity: 'blocker',
              message: `Deployment consumer load failed: ${result.consumer.description} (${result.consumer.path}): ${result.error ?? 'unknown error'}`,
              artifact: result.consumer.path,
            };
            blockers.push(finding);
            fixRequirements.push(toFixRequirement(finding));
          }
        }
        // Re-derive conclusion with new blockers
        reviewBundle.gateConclusion = 'rejected';
      }
    }

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, reviewBundle, timestamp);

    return {
      reviewBundle,
      metadata: {
        gateConclusion,
        totalFindings: reviews.flatMap((r) => r.findings).length + scanFindings.length,
        blockerCount: blockers.length,
        evaluatedAt: timestamp,
      },
      artifact,
    };
  }

  private async evaluateDimension(
    dimension: ReviewDimension,
    input: ReviewStageInput,
  ): Promise<DimensionReview> {
    if (!this.options.adapter.evaluateDimension) {
      return {
        dimension,
        conclusion: 'passed',
        findings: [],
        reviewer: `${dimension}-reviewer-default`,
      };
    }

    const request: DimensionReviewRequest = {
      dimension,
      implementationArtifacts: input.implementationArtifacts,
    };

    const response = await this.options.adapter.evaluateDimension(request);
    const findings: ReviewFinding[] = response.findings.map((f, idx) => ({
      id: `${dimension}-${idx + 1}`,
      dimension,
      severity: f.severity,
      message: f.message,
      artifact: f.artifact,
    }));

    return {
      dimension,
      conclusion: response.conclusion,
      findings,
      reviewer: response.reviewer,
    };
  }

  /**
   * AC-4.24n3: Resolve the list of directories actually scanned.
   * Uses sourceRoots when provided; otherwise derives from artifact paths.
   */
  private async writeArtifact(
    input: ReviewStageInput,
    bundle: ReviewBundle,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'review');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-review-bundle.json`);
    await writeFile(filePath, JSON.stringify({ ...bundle, generatedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:review-bundle`,
      type: 'review-bundle',
      path: filePath,
      createdAt: timestamp,
      metadata: { dimensionCount: bundle.reviews.length },
    };
  }
}

function deriveConclusion(reviews: DimensionReview[], scanFindings: ReviewFinding[] = []): GateConclusion {
  const findings = [...reviews.flatMap((r) => r.findings), ...scanFindings];
  if (reviews.some((r) => r.conclusion === 'rejected')) return 'rejected';
  if (findings.some((f) => f.severity === 'blocker')) return 'rejected';
  if (reviews.some((r) => r.conclusion === 'conditional')) return 'conditional';
  return 'passed';
}

function toFixRequirement(finding: ReviewFinding): ReviewFixRequirement {
  return {
    findingId: finding.id,
    artifact: finding.artifact ?? 'unknown',
    fixDescription: finding.message,
    dimension: finding.dimension,
  };
}

function normalizeRoots(roots: string[] | undefined): string[] {
  if (!roots) return [];
  const unique = new Set<string>();
  for (const root of roots) {
    const normalized = root.trim().replace(/\\/g, '/').replace(/\/+$|^\.\//g, '');
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique.values());
}
