import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ReviewFixLoop, createReviewFixLoop } from '../review-fix-loop.js';
import type { ReviewFixLoopInput } from '../review-fix-loop-types.js';
import type { ArtifactRef } from '../../types/index.js';

function makeReviewReportRef(): ArtifactRef {
  return {
    id: 'review-001:review-bundle',
    type: 'review-bundle',
    path: '/tmp/review-bundle.json',
    createdAt: '2025-01-01T00:00:00Z',
  };
}

describe('ReviewFixLoop', () => {
  let mockNow: () => string;

  beforeEach(() => {
    mockNow = vi.fn(() => '2025-01-01T00:00:00Z');
  });

  describe('extractIssues (AC-4.24a, AC-4.24b)', () => {
    it('extracts structured issue list from review bundle', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const reviewBundle = {
        gateConclusion: 'rejected' as const,
        fixRequirements: [],
        reviews: [
          {
            dimension: 'quality' as const,
            conclusion: 'rejected' as const,
            findings: [
              { id: 'finding-1', severity: 'blocker' as const, message: 'Critical security issue in auth module', artifact: 'src/auth.ts' },
            ],
          },
        ],
      };

      const issues = loop.extractIssues(reviewBundle, '2025-01-01T00:00:00Z', 3);

      expect(issues).toHaveLength(1);
      expect(issues[0]!.id).toBe('issue-finding-1');
      expect(issues[0]!.severity).toBe('P0');
      expect(issues[0]!.artifact).toBe('src/auth.ts');
      expect(issues[0]!.fixDescription).toBe('Critical security issue in auth module');
    });

    it('extracts multiple issues with correct severity mapping', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const reviewBundle = {
        gateConclusion: 'rejected' as const,
        fixRequirements: [],
        reviews: [
          {
            dimension: 'quality' as const,
            conclusion: 'rejected' as const,
            findings: [
              { id: 'critical-1', severity: 'blocker' as const, message: 'Issue 1' },
              { id: 'major-1', severity: 'major' as const, message: 'Issue 2' },
              { id: 'minor-1', severity: 'minor' as const, message: 'Issue 3' },
            ],
          },
        ],
      };

      const issues = loop.extractIssues(reviewBundle, '2025-01-01T00:00:00Z', 3);

      expect(issues).toHaveLength(2);
      expect(issues[0]!.severity).toBe('P0');
      expect(issues[1]!.severity).toBe('P1');
    });

    it('sets initial status based on severity', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const reviewBundle = {
        gateConclusion: 'conditional' as const,
        fixRequirements: [],
        reviews: [
          {
            dimension: 'product' as const,
            conclusion: 'conditional' as const,
            findings: [
              { id: 'p0-issue', severity: 'blocker' as const, message: 'P0 issue' },
              { id: 'p1-issue', severity: 'major' as const, message: 'P1 issue' },
            ],
          },
        ],
      };

      const issues = loop.extractIssues(reviewBundle, '2025-01-01T00:00:00Z', 3);

      const p0Issue = issues.find((i) => i.severity === 'P0');
      const p1Issue = issues.find((i) => i.severity === 'P1');

      expect(p0Issue?.status).toBe('open');
      expect(p1Issue?.status).toBe('open');
    });
  });

  describe('generateFixTasks (AC-4.24c, AC-4.24d)', () => {
    it('generates fix tasks only for P0 and P1 issues', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        {
          id: 'issue-1',
          severity: 'P0' as const,
          status: 'open' as const,
          findingId: 'f1',
          artifact: 'src/a.ts',
          fixDescription: 'Fix P0',
          dimension: 'quality' as const,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          attemptCount: 0,
          maxAttempts: 3,
        },
        {
          id: 'issue-2',
          severity: 'P1' as const,
          status: 'open' as const,
          findingId: 'f2',
          artifact: 'src/b.ts',
          fixDescription: 'Fix P1',
          dimension: 'product' as const,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          attemptCount: 0,
          maxAttempts: 3,
        },
        {
          id: 'issue-3',
          severity: 'P2' as const,
          status: 'deferred' as const,
          findingId: 'f3',
          artifact: 'src/c.ts',
          fixDescription: 'Fix P2',
          dimension: 'quality' as const,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          attemptCount: 0,
          maxAttempts: 3,
        },
      ];

      const pipeline = { pipelineId: 'fr-sevo-20260421-001', taskId: 'task-001' };
      const reviewReportRef = makeReviewReportRef();

      const fixTasks = loop.generateFixTasks(issues, pipeline, reviewReportRef, '2025-01-01T00:00:00Z');

      expect(fixTasks).toHaveLength(2);
      expect(fixTasks.map((t) => t.issueId)).toContain('issue-1');
      expect(fixTasks.map((t) => t.issueId)).toContain('issue-2');
      expect(fixTasks.map((t) => t.issueId)).not.toContain('issue-3');
    });

    it('associates fix task with pipeline ID and review report ref', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        {
          id: 'issue-1',
          severity: 'P0' as const,
          status: 'open' as const,
          findingId: 'f1',
          artifact: 'src/a.ts',
          fixDescription: 'Fix P0',
          dimension: 'quality' as const,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          attemptCount: 0,
          maxAttempts: 3,
        },
      ];

      const pipeline = { pipelineId: 'fr-sevo-20260421-001', taskId: 'task-001' };
      const reviewReportRef = makeReviewReportRef();

      const fixTasks = loop.generateFixTasks(issues, pipeline, reviewReportRef, '2025-01-01T00:00:00Z');

      expect(fixTasks[0]!.pipelineId).toBe('fr-sevo-20260421-001');
      expect(fixTasks[0]!.reviewReportRef.id).toBe('review-001:review-bundle');
    });
  });

  describe('sortByPriority (AC-4.24d)', () => {
    it('sorts fix tasks by P0 > P1 priority', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const tasks = [
        { id: 'fix-2', issueId: 'issue-2', pipelineId: 'p1', reviewReportRef: makeReviewReportRef(), status: 'pending' as const, priority: 1, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'fix-1', issueId: 'issue-1', pipelineId: 'p1', reviewReportRef: makeReviewReportRef(), status: 'pending' as const, priority: 0, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
      ];

      const sorted = loop.sortByPriority(tasks);

      expect(sorted[0]!.id).toBe('fix-1');
      expect(sorted[1]!.id).toBe('fix-2');
    });
  });

  describe('triggerRevalidation (AC-4.24e, AC-4.24f)', () => {
    it('triggers revalidation with adapter', async () => {
      const revalidateAdapter = vi.fn().mockResolvedValue({
        outcome: 'passed' as const,
        revalidatedArtifacts: ['src/auth.ts'],
        affectedScope: ['src/auth.ts', 'src/auth.test.ts'],
        message: 'All checks passed',
        reviewer: 'revalidator-bot',
      });

      const loop = new ReviewFixLoop({
        now: mockNow,
        revalidateAdapter,
      });

      const task = {
        id: 'fix-1',
        issueId: 'issue-1',
        pipelineId: 'fr-sevo-20260421-001',
        reviewReportRef: makeReviewReportRef(),
        status: 'completed' as const,
        priority: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:00:00Z',
      };

      const issues = [
        {
          id: 'issue-1',
          severity: 'P0' as const,
          status: 'open' as const,
          findingId: 'f1',
          artifact: 'src/auth.ts',
          fixDescription: 'Fix',
          dimension: 'quality' as const,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          attemptCount: 0,
          maxAttempts: 3,
        },
      ];

      const result = await loop.triggerRevalidation(task, issues);

      expect(revalidateAdapter).toHaveBeenCalledWith(['src/auth.ts']);
      expect(result?.outcome).toBe('passed');
      expect(result?.revalidatedArtifacts).toContain('src/auth.ts');
    });

    it('auto-passes when adapter not configured', async () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const task = {
        id: 'fix-1',
        issueId: 'issue-1',
        pipelineId: 'p1',
        reviewReportRef: makeReviewReportRef(),
        status: 'completed' as const,
        priority: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:00:00Z',
      };

      const issues = [
        {
          id: 'issue-1',
          severity: 'P0' as const,
          status: 'open' as const,
          findingId: 'f1',
          artifact: 'src/auth.ts',
          fixDescription: 'Fix',
          dimension: 'quality' as const,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          attemptCount: 0,
          maxAttempts: 3,
        },
      ];

      const result = await loop.triggerRevalidation(task, issues);

      expect(result?.outcome).toBe('passed');
      expect(result?.message).toBe('Revalidation not configured - auto-passed');
    });
  });

  describe('evaluateGate (AC-4.24g)', () => {
    it('passes gate when all P0 closed and P1 closed or waived', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        { id: 'i1', severity: 'P0' as const, status: 'closed' as const, findingId: 'f1', artifact: 'a', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 1, maxAttempts: 3 },
        { id: 'i2', severity: 'P1' as const, status: 'closed' as const, findingId: 'f2', artifact: 'b', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 1, maxAttempts: 3 },
      ];

      const result = loop.evaluateGate(issues, '2025-01-01T00:00:00Z');

      expect(result.gatePassed).toBe(true);
      expect(result.p0Closed).toBe(true);
      expect(result.p1Closed).toBe(true);
    });

    it('passes gate when all P0 closed and P1 waived', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        { id: 'i1', severity: 'P0' as const, status: 'closed' as const, findingId: 'f1', artifact: 'a', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 1, maxAttempts: 3 },
        { id: 'i2', severity: 'P1' as const, status: 'waived' as const, findingId: 'f2', artifact: 'b', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 1, maxAttempts: 3 },
      ];

      const result = loop.evaluateGate(issues, '2025-01-01T00:00:00Z');

      expect(result.gatePassed).toBe(true);
      expect(result.p1Waived).toBe(true);
    });

    it('blocks gate when P0 open', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        { id: 'i1', severity: 'P0' as const, status: 'open' as const, findingId: 'f1', artifact: 'a', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 0, maxAttempts: 3 },
      ];

      const result = loop.evaluateGate(issues, '2025-01-01T00:00:00Z');

      expect(result.gatePassed).toBe(false);
      expect(result.pendingP0).toBe(1);
    });

    it('blocks gate when P1 open without waiver', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        { id: 'i1', severity: 'P0' as const, status: 'closed' as const, findingId: 'f1', artifact: 'a', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 1, maxAttempts: 3 },
        { id: 'i2', severity: 'P1' as const, status: 'open' as const, findingId: 'f2', artifact: 'b', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 0, maxAttempts: 3 },
      ];

      const result = loop.evaluateGate(issues, '2025-01-01T00:00:00Z');

      expect(result.gatePassed).toBe(false);
      expect(result.pendingP1).toBe(1);
    });
  });

  describe('retry logic (AC-4.24i)', () => {
    it('canRetry returns true when attempts remaining', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issue = {
        id: 'i1',
        severity: 'P0' as const,
        status: 'open' as const,
        findingId: 'f1',
        artifact: 'a',
        fixDescription: 'f',
        dimension: 'quality' as const,
        createdAt: 't',
        updatedAt: 't',
        attemptCount: 1,
        maxAttempts: 3,
      };

      expect(loop.canRetry(issue)).toBe(true);
    });

    it('canRetry returns false when max attempts reached', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issue = {
        id: 'i1',
        severity: 'P0' as const,
        status: 'open' as const,
        findingId: 'f1',
        artifact: 'a',
        fixDescription: 'f',
        dimension: 'quality' as const,
        createdAt: 't',
        updatedAt: 't',
        attemptCount: 3,
        maxAttempts: 3,
      };

      expect(loop.canRetry(issue)).toBe(false);
    });

    it('shouldEscalate returns true when any issue exceeds max attempts', () => {
      const loop = new ReviewFixLoop({ now: mockNow });

      const issues = [
        { id: 'i1', severity: 'P0' as const, status: 'open' as const, findingId: 'f1', artifact: 'a', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 3, maxAttempts: 3 },
        { id: 'i2', severity: 'P1' as const, status: 'open' as const, findingId: 'f2', artifact: 'b', fixDescription: 'f', dimension: 'quality' as const, createdAt: 't', updatedAt: 't', attemptCount: 0, maxAttempts: 3 },
      ];

      expect(loop.shouldEscalate(issues)).toBe(true);
    });
  });

  describe('createReviewFixLoop factory', () => {
    it('creates instance with default options', () => {
      const loop = createReviewFixLoop();

      expect(loop).toBeInstanceOf(ReviewFixLoop);
    });

    it('creates instance with custom options', () => {
      const customNow = () => '2025-01-01T00:00:00Z';
      const loop = createReviewFixLoop({ now: customNow, maxAttempts: 5 });

      expect(loop).toBeInstanceOf(ReviewFixLoop);
    });
  });
});