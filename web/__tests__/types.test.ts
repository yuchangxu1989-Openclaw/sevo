/**
 * Type-level tests — verifies that the new types are properly exported
 * and label functions work correctly.
 */
import { describe, it, expect } from 'vitest';
import {
  getIssueSeverityLabel,
  getIssueStatusLabel,
  getFixTaskStatusLabel,
  getRevalidationOutcomeLabel,
  getPrincipleCategoryLabel,
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_LABELS,
  FIX_TASK_STATUS_LABELS,
  REVALIDATION_OUTCOME_LABELS,
  PRINCIPLE_CATEGORY_LABELS,
} from '../types';
import type {
  IssueSeverity,
  ReviewIssueStatus,
  FixTaskStatus,
  RevalidationOutcome,
  ReviewTrackingView,
  SettingsView,
  ProjectConfigView,
  PrincipleView,
} from '../types';

describe('types/index', () => {
  describe('review tracking labels', () => {
    it('severity labels cover all values', () => {
      const severities: IssueSeverity[] = ['P0', 'P1', 'P2', 'P3'];
      for (const s of severities) {
        expect(getIssueSeverityLabel(s)).toBeTruthy();
        expect(ISSUE_SEVERITY_LABELS[s]).toBeTruthy();
      }
    });

    it('issue status labels cover all values', () => {
      const statuses: ReviewIssueStatus[] = ['open', 'fixing', 'revalidating', 'closed', 'deferred', 'waived'];
      for (const s of statuses) {
        expect(getIssueStatusLabel(s)).toBeTruthy();
        expect(ISSUE_STATUS_LABELS[s]).toBeTruthy();
      }
    });

    it('fix task status labels cover all values', () => {
      const statuses: FixTaskStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
      for (const s of statuses) {
        expect(getFixTaskStatusLabel(s)).toBeTruthy();
        expect(FIX_TASK_STATUS_LABELS[s]).toBeTruthy();
      }
    });

    it('revalidation outcome labels cover all values', () => {
      const outcomes: RevalidationOutcome[] = ['passed', 'failed', 'waived'];
      for (const o of outcomes) {
        expect(getRevalidationOutcomeLabel(o)).toBeTruthy();
        expect(REVALIDATION_OUTCOME_LABELS[o]).toBeTruthy();
      }
    });
  });

  describe('settings labels', () => {
    it('principle category labels cover all values', () => {
      const categories: PrincipleView['category'][] = ['quality', 'process', 'architecture', 'security'];
      for (const c of categories) {
        expect(getPrincipleCategoryLabel(c)).toBeTruthy();
        expect(PRINCIPLE_CATEGORY_LABELS[c]).toBeTruthy();
      }
    });
  });
});
