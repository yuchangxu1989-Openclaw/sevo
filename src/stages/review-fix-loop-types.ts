import type { ArtifactRef, GateConclusion } from '../types/index.js';
import type { ReviewDimension, ReviewFixRequirement } from './review-types.js';

export type IssueSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type IssueStatus = 'open' | 'fixing' | 'revalidating' | 'closed' | 'deferred' | 'waived';

export type FixTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type RevalidationOutcome = 'passed' | 'failed' | 'waived';

export interface ReviewIssue {
  id: string;
  severity: IssueSeverity;
  status: IssueStatus;
  findingId: string;
  associatedFrId?: string;
  artifact: string;
  fixDescription: string;
  dimension: ReviewDimension;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface FixTask {
  id: string;
  issueId: string;
  pipelineId: string;
  reviewReportRef: ArtifactRef;
  status: FixTaskStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  assignee?: string;
}

export interface RevalidationResult {
  issueId: string;
  fixTaskId: string;
  outcome: RevalidationOutcome;
  revalidatedArtifacts: string[];
  affectedScope: string[];
  message: string;
  revalidatedAt: string;
  reviewer?: string;
}

export interface GateReevaluationResult {
  gatePassed: boolean;
  p0Closed: boolean;
  p1Closed: boolean;
  p1Waived: boolean;
  pendingP0: number;
  pendingP1: number;
  deferredP2: number;
  deferredP3: number;
  escalated: boolean;
  message: string;
  evaluatedAt: string;
}

export interface ReviewFixLoopInputPipeline {
  pipelineId: string;
  taskId: string;
}

export interface ReviewFixLoopInput {
  pipeline: ReviewFixLoopInputPipeline;
  reviewBundle: {
    gateConclusion: GateConclusion;
    fixRequirements: ReviewFixRequirement[];
    reviews: Array<{
      dimension: ReviewDimension;
      conclusion: GateConclusion;
      findings: Array<{
        id: string;
        severity: 'critical' | 'blocker' | 'major' | 'warning' | 'minor' | 'info';
        message: string;
        artifact?: string;
      }>;
    }>;
  };
  reviewReportRef: ArtifactRef;
  maxAttempts?: number;
}

export interface ReviewFixLoopOutput {
  issues: ReviewIssue[];
  fixTasks: FixTask[];
  revalidationResults: RevalidationResult[];
  gateEvaluation: GateReevaluationResult;
}

export type ReviewIssuePriority = 0 | 1 | 2 | 3;

export function severityToPriority(severity: IssueSeverity): ReviewIssuePriority {
  switch (severity) {
    case 'P0': return 0;
    case 'P1': return 1;
    case 'P2': return 2;
    case 'P3': return 3;
  }
}

export function priorityToSeverity(priority: ReviewIssuePriority): IssueSeverity {
  switch (priority) {
    case 0: return 'P0';
    case 1: return 'P1';
    case 2: return 'P2';
    case 3: return 'P3';
  }
}