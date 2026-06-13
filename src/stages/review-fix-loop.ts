import type { ArtifactRef } from '../types/index.js';
import type { ReviewDimension } from './review-types.js';
import type {
  ReviewFixLoopInput,
  ReviewFixLoopOutput,
  ReviewIssue,
  FixTask,
  RevalidationResult,
  GateReevaluationResult,
  IssueSeverity,
  IssueStatus,
  FixTaskStatus,
} from './review-fix-loop-types.js';
import { severityToPriority } from './review-fix-loop-types.js';
import { REVIEW_FIX_LOOP } from '../constants.js';

export class ReviewFixLoop {
  private readonly now: () => string;
  private readonly maxAttempts: number;
  private readonly revalidateAdapter?: (
    artifacts: string[],
  ) => Promise<RevalidationResult>;

  constructor(options?: {
    now?: () => string;
    maxAttempts?: number;
    revalidateAdapter?: (artifacts: string[]) => Promise<RevalidationResult>;
  }) {
    this.now = options?.now ?? (() => new Date().toISOString());
    this.maxAttempts = options?.maxAttempts ?? REVIEW_FIX_LOOP.DEFAULT_MAX_ATTEMPTS;
    this.revalidateAdapter = options?.revalidateAdapter;
  }

  async execute(input: ReviewFixLoopInput): Promise<ReviewFixLoopOutput> {
    const { pipeline, reviewBundle, reviewReportRef, maxAttempts } = input;
    const actualMaxAttempts = maxAttempts ?? this.maxAttempts;
    const timestamp = this.now();

    const issues = this.extractIssues(reviewBundle, timestamp, actualMaxAttempts);
    const fixTasks = this.generateFixTasks(issues, pipeline, reviewReportRef, timestamp);
    const sortedFixTasks = this.sortByPriority(fixTasks);

    const revalidationResults: RevalidationResult[] = [];
    for (const task of sortedFixTasks) {
      if (task.status === 'completed') {
        const result = await this.triggerRevalidation(task, issues);
        if (result) {
          revalidationResults.push(result);
        }
      }
    }

    const gateEvaluation = this.evaluateGate(issues, timestamp);

    return {
      issues,
      fixTasks: sortedFixTasks,
      revalidationResults,
      gateEvaluation,
    };
  }

  extractIssues(
    reviewBundle: ReviewFixLoopInput['reviewBundle'],
    timestamp: string,
    maxAttempts: number,
  ): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    for (const review of reviewBundle.reviews) {
      const reviewDimension = review.dimension;
      for (const finding of review.findings) {
        const severity = this.mapToSeverity(finding);
        if (severity === 'P0' || severity === 'P1') {
          issues.push({
            id: `issue-${finding.id}`,
            severity,
            status: this.getInitialStatus(severity),
            findingId: finding.id,
            associatedFrId: undefined,
            artifact: finding.artifact ?? 'unknown',
            fixDescription: finding.message,
            dimension: reviewDimension,
            createdAt: timestamp,
            updatedAt: timestamp,
            attemptCount: 0,
            maxAttempts,
          });
        }
      }
    }

    return issues;
  }

  private mapToSeverity(
    finding: { id: string; severity: string },
  ): IssueSeverity {
    const severity = finding.severity.toLowerCase();
    // Direct mapping from structured severity field — no ID-based guessing
    if (severity === 'critical' || severity === 'blocker') return 'P0';
    if (severity === 'major' || severity === 'warning') return 'P1';
    if (severity === 'minor') return 'P2';
    if (severity === 'info') return 'P3';
    return 'P0'; // Unknown severity defaults to highest priority
  }

  private getInitialStatus(severity: IssueSeverity): IssueStatus {
    return severity === 'P0' || severity === 'P1' ? 'open' : 'deferred';
  }

  generateFixTasks(
    issues: ReviewIssue[],
    pipeline: ReviewFixLoopInput['pipeline'],
    reviewReportRef: ArtifactRef,
    timestamp: string,
  ): FixTask[] {
    return issues
      .filter((issue) => issue.severity === 'P0' || issue.severity === 'P1')
      .map((issue) => ({
        id: `fix-${issue.id}`,
        issueId: issue.id,
        pipelineId: pipeline.pipelineId,
        reviewReportRef,
        status: 'pending' as FixTaskStatus,
        priority: severityToPriority(issue.severity),
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
  }

  sortByPriority(tasks: FixTask[]): FixTask[] {
    return [...tasks].sort((a, b) => a.priority - b.priority);
  }

  async triggerRevalidation(
    task: FixTask,
    issues: ReviewIssue[],
  ): Promise<RevalidationResult | null> {
    const issue = issues.find((i) => i.id === task.issueId);
    if (!issue) return null;

    const timestamp = this.now();

    if (this.revalidateAdapter) {
      const result = await this.revalidateAdapter([issue.artifact]);
      return {
        issueId: issue.id,
        fixTaskId: task.id,
        outcome: result.outcome,
        revalidatedArtifacts: result.revalidatedArtifacts,
        affectedScope: result.affectedScope,
        message: result.message,
        revalidatedAt: timestamp,
        reviewer: result.reviewer,
      };
    }

    return {
      issueId: issue.id,
      fixTaskId: task.id,
      outcome: 'passed',
      revalidatedArtifacts: [issue.artifact],
      affectedScope: [issue.artifact],
      message: 'Revalidation not configured - auto-passed',
      revalidatedAt: timestamp,
    };
  }

  updateIssueStatus(
    issues: ReviewIssue[],
    issueId: string,
    newStatus: IssueStatus,
  ): ReviewIssue[] {
    const timestamp = this.now();
    return issues.map((issue) =>
      issue.id === issueId
        ? { ...issue, status: newStatus, updatedAt: timestamp }
        : issue,
    );
  }

  updateFixTaskStatus(
    tasks: FixTask[],
    taskId: string,
    newStatus: FixTaskStatus,
  ): FixTask[] {
    const timestamp = this.now();
    return tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: newStatus,
            updatedAt: timestamp,
            completedAt: newStatus === 'completed' ? timestamp : task.completedAt,
          }
        : task,
    );
  }

  evaluateGate(issues: ReviewIssue[], timestamp: string): GateReevaluationResult {
    const pendingP0 = issues.filter(
      (i) => i.severity === 'P0' && i.status === 'open',
    ).length;
    const pendingP1 = issues.filter(
      (i) => i.severity === 'P1' && i.status === 'open',
    ).length;
    const deferredP2 = issues.filter(
      (i) => i.severity === 'P2' && i.status === 'deferred',
    ).length;
    const deferredP3 = issues.filter(
      (i) => i.severity === 'P3' && i.status === 'deferred',
    ).length;

    const p0Closed = pendingP0 === 0;
    const p1Closed = pendingP1 === 0;
    const p1Waived = issues.some(
      (i) => i.severity === 'P1' && i.status === 'waived',
    );

    const gatePassed = p0Closed && (p1Closed || p1Waived);
    const escalated = this.shouldEscalate(issues);

    let message = '';
    if (gatePassed) {
      message = 'Gate passed: all P0 closed, P1 closed or waived';
    } else {
      const blockers: string[] = [];
      if (pendingP0 > 0) blockers.push(`${pendingP0} P0 open`);
      if (pendingP1 > 0) blockers.push(`${pendingP1} P1 open`);
      message = `Gate advisory: ${blockers.join(', ')}`;
    }

    return {
      gatePassed,
      p0Closed,
      p1Closed,
      p1Waived,
      pendingP0,
      pendingP1,
      deferredP2,
      deferredP3,
      escalated,
      message,
      evaluatedAt: timestamp,
    };
  }

  handleRevalidationResult(
    result: RevalidationResult,
    issues: ReviewIssue[],
  ): ReviewIssue[] {
    const timestamp = this.now();

    return issues.map((issue) => {
      if (issue.id !== result.issueId) {
        return issue;
      }

      const newStatus: IssueStatus = result.outcome === 'passed'
        ? 'closed'
        : result.outcome === 'waived'
          ? 'waived'
          : issue.status === 'revalidating'
            ? 'open'
            : issue.status;

      const updatedIssue: ReviewIssue = {
        ...issue,
        status: newStatus,
        updatedAt: timestamp,
        attemptCount: result.outcome === 'failed'
          ? issue.attemptCount + 1
          : issue.attemptCount,
      };

      return updatedIssue;
    });
  }

  canRetry(issue: ReviewIssue): boolean {
    return (
      issue.attemptCount < issue.maxAttempts &&
      issue.status !== 'closed' &&
      issue.status !== 'waived'
    );
  }

  incrementAttempt(issues: ReviewIssue[], issueId: string): ReviewIssue[] {
    const timestamp = this.now();
    return issues.map((issue) =>
      issue.id === issueId
        ? { ...issue, attemptCount: issue.attemptCount + 1, updatedAt: timestamp }
        : issue,
    );
  }

  shouldEscalate(issues: ReviewIssue[]): boolean {
    const openIssues = issues.filter(
      (i) => i.severity === 'P0' || i.severity === 'P1',
    );
    for (const issue of openIssues) {
      if (issue.attemptCount >= issue.maxAttempts) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the full review-fix status for a pipeline instance (AC-4.24h).
   *
   * Returns the complete chain: review report → issues → fix tasks → revalidation results,
   * plus the current gate evaluation. This is the API surface for exposing
   * the full review-fix loop state.
   */
  getReviewFixStatus(
    output: ReviewFixLoopOutput,
  ): ReviewFixStatus {
    const timestamp = this.now();
    const gateEvaluation = this.evaluateGate(output.issues, timestamp);

    const issueStatuses = output.issues.map((issue) => ({
      issueId: issue.id,
      severity: issue.severity,
      status: issue.status,
      dimension: issue.dimension,
      attemptCount: issue.attemptCount,
      maxAttempts: issue.maxAttempts,
    }));

    const fixTaskStatuses = output.fixTasks.map((task) => ({
      taskId: task.id,
      issueId: task.issueId,
      status: task.status,
      priority: task.priority,
    }));

    const revalidationStatuses = output.revalidationResults.map((r) => ({
      issueId: r.issueId,
      fixTaskId: r.fixTaskId,
      outcome: r.outcome,
      revalidatedAt: r.revalidatedAt,
    }));

    return {
      issues: issueStatuses,
      fixTasks: fixTaskStatuses,
      revalidations: revalidationStatuses,
      gateEvaluation,
      evaluatedAt: timestamp,
    };
  }
}

/** Summary of review-fix loop status for API exposure (AC-4.24h). */
export interface ReviewFixStatus {
  issues: Array<{
    issueId: string;
    severity: IssueSeverity;
    status: IssueStatus;
    dimension?: ReviewDimension;
    attemptCount: number;
    maxAttempts: number;
  }>;
  fixTasks: Array<{
    taskId: string;
    issueId: string;
    status: FixTaskStatus;
    priority: number;
  }>;
  revalidations: Array<{
    issueId: string;
    fixTaskId: string;
    outcome: string;
    revalidatedAt: string;
  }>;
  gateEvaluation: GateReevaluationResult;
  evaluatedAt: string;
}

export function createReviewFixLoop(
  options?: ReviewFixLoopOptions,
): ReviewFixLoop {
  return new ReviewFixLoop(options);
}

export interface ReviewFixLoopOptions {
  now?: () => string;
  maxAttempts?: number;
  revalidateAdapter?: (artifacts: string[]) => Promise<RevalidationResult>;
}