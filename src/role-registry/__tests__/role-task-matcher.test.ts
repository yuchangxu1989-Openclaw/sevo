import { describe, expect, it } from 'vitest';

import type { StageId } from '../../types/index.js';
import {
  RoleDispatchBlockedError,
  RoleTaskMatcher,
  validateDispatchMatrix,
} from '../role-task-matcher.js';

describe('RoleTaskMatcher', () => {
  it('allows matching roles in multi-agent mode', () => {
    const matcher = new RoleTaskMatcher({
      agentRoles: { 'dev-01': 'Coder', 'audit-01': 'Auditor' },
      multiAgent: true,
    });

    const result = matcher.match({ agentId: 'dev-01', stageId: 'implement' as StageId });

    expect(result.allowed).toBe(true);
    expect(result.requiredRole).toBe('Coder');
    expect(result.actualRole).toBe('Coder');
    expect(result.mismatchEvent).toBeNull();
  });

  it('blocks mismatched roles in multi-agent strict mode with structured error', () => {
    const matcher = new RoleTaskMatcher({
      agentIds: ['dev-01', 'audit-01'],
      agentRoles: { 'dev-01': 'Coder', 'audit-01': 'Auditor' },
      multiAgent: true,
      strictRoleMatching: true,
    });

    const result = matcher.match({ agentId: 'dev-01', stageId: 'review' as StageId });

    expect(result.allowed).toBe(false);
    expect(result.mismatchEvent?.action).toBe('blocked');
    expect(() => matcher.assertAllowed({ agentId: 'dev-01', stageId: 'review' as StageId }))
      .toThrow(RoleDispatchBlockedError);
  });

  it('warns but allows mismatches in single-agent mode', () => {
    const matcher = new RoleTaskMatcher({
      agentRoles: { solo: 'Any' },
      multiAgent: false,
    });

    const result = matcher.match({ agentId: 'solo', stageId: 'spec' as StageId });

    expect(result.allowed).toBe(true);
    expect(result.mismatchEvent?.action).toBe('warning');
  });



  it('degrades multi-agent mismatches by default with low trust fallback', () => {
    const matcher = new RoleTaskMatcher({
      agentIds: ['dev-01', 'audit-01'],
      agentRoles: { 'dev-01': 'Coder', 'audit-01': 'Auditor' },
      fallbackAgentId: 'dev-01',
      multiAgent: true,
    });

    const result = matcher.assertAllowed({ agentId: 'dev-01', stageId: 'review' as StageId });

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.dispatchAgentId).toBe('dev-01');
    expect(result.trustLevel).toBe('low');
    expect(result.mismatchEvent?.action).toBe('role-degraded');
    expect(result.mismatchEvent?.reason).toContain('trust-level: low');
  });

  it('validateDispatchMatrix returns complete strict matrix and coverage', () => {
    const report = validateDispatchMatrix({
      agentIds: ['pm-01', 'dev-01', 'audit-01'],
      agentRoles: { 'pm-01': 'Product', 'dev-01': 'Coder', 'audit-01': 'Auditor' },
      multiAgent: true,
      strictRoleMatching: true,
    });

    expect(report.matrix.length).toBeGreaterThan(0);
    expect(report.coverage.totalStages).toBeGreaterThan(0);
    expect(report.coverage.stagesWithMatchedAgent).toBeGreaterThan(0);
    expect(report.matrix).toEqual(expect.arrayContaining([
      expect.objectContaining({ stageId: 'implement', agentId: 'dev-01', decision: 'allowed' }),
      expect.objectContaining({ stageId: 'review', agentId: 'dev-01', decision: 'blocked' }),
    ]));
    expect(report.violations.length).toBeGreaterThan(0);
  });
});
