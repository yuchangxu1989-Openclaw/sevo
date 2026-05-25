/**
 * Tests for FR-22: Role-Task Matching Dispatch Constraints.
 *
 * Covers all 8 ACs:
 *   AC-22.1: Stage requiredRole declaration
 *   AC-22.2: Pre-dispatch role validation
 *   AC-22.3: Audit event generation on mismatch
 *   AC-22.4: Multi-agent blocking
 *   AC-22.5: Single-agent warning (no block)
 *   AC-22.6: Dual-source role resolution (config + naming)
 *   AC-22.7: Configurable role mappings
 *   AC-22.8: sevo init generates role assignment table
 */

import { describe, it, expect } from 'vitest';
import { RoleRegistry } from '../role-registry/role-registry.js';
import { RoleStageValidator } from '../role-registry/role-stage-validator.js';
import type { StageId } from '../types/index.js';

// ── AC-22.6: Dual-source role resolution ────────────────────────

describe('RoleRegistry', () => {
  it('resolves role from explicit config (highest priority)', () => {
    const registry = new RoleRegistry({
      agentRoles: { 'my-custom-agent': 'Architect' },
    });
    expect(registry.resolveRole('my-custom-agent')).toBe('Architect');
  });

  it('resolves role from agentId naming convention', () => {
    const registry = new RoleRegistry();
    expect(registry.resolveRole('pm-01')).toBe('Product');
    expect(registry.resolveRole('ux-01')).toBe('UX');
    expect(registry.resolveRole('sa-01')).toBe('Architect');
    expect(registry.resolveRole('dev-01')).toBe('Coder');
    expect(registry.resolveRole('audit-01')).toBe('Auditor');
    expect(registry.resolveRole('free-code')).toBe('Coder');
    expect(registry.resolveRole('cc')).toBe('Coder');
    expect(registry.resolveRole('codex')).toBe('Coder');
    expect(registry.resolveRole('hermes')).toBe('Coder');
  });

  it('returns null for unknown agentId', () => {
    const registry = new RoleRegistry();
    expect(registry.resolveRole('random-agent')).toBeNull();
  });

  it('explicit config overrides naming convention', () => {
    const registry = new RoleRegistry({
      agentRoles: { 'pm-01': 'Coder' }, // Override: pm-01 is actually a coder
    });
    expect(registry.resolveRole('pm-01')).toBe('Coder');
  });

  it('supports custom naming patterns', () => {
    const registry = new RoleRegistry({
      namingPatterns: [{ pattern: '^qa[-_]', role: 'Auditor' }],
    });
    expect(registry.resolveRole('qa-01')).toBe('Auditor');
  });

  it('matches role correctly', () => {
    const registry = new RoleRegistry();
    expect(registry.matches('Product', 'Product')).toBe(true);
    expect(registry.matches('Product', 'Coder')).toBe(false);
    expect(registry.matches(null, 'Product')).toBe(false);
    expect(registry.matches('Coder', 'Any')).toBe(true);
    expect(registry.matches(null, 'Any')).toBe(true);
  });
});

// ── AC-22.1 / AC-22.2: Stage requiredRole + validation ─────────

describe('RoleStageValidator', () => {
  const registry = new RoleRegistry({
    agentRoles: {
      'pm-01': 'Product',
      'dev-01': 'Coder',
      'audit-01': 'Auditor',
      'sa-01': 'Architect',
      'ux-01': 'UX',
    },
  });

  describe('AC-22.1: requiredRole declaration', () => {
    it('returns correct required role for each stage', () => {
      const validator = new RoleStageValidator(registry);
      expect(validator.getRequiredRole('spec' as StageId)).toBe('Product');
      expect(validator.getRequiredRole('contract' as StageId)).toBe('Architect');
      expect(validator.getRequiredRole('implement' as StageId)).toBe('Coder');
      expect(validator.getRequiredRole('review' as StageId)).toBe('Auditor');
      expect(validator.getRequiredRole('ux-acceptance' as StageId)).toBe('UX');
      expect(validator.getRequiredRole('deploy' as StageId)).toBe('Any');
      expect(validator.getRequiredRole('ledger' as StageId)).toBe('Any');
    });

    it('lists all stage-role mappings', () => {
      const validator = new RoleStageValidator(registry);
      const mappings = validator.listStageRoles();
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings.find((m) => m.stageId === 'spec')?.requiredRole).toBe('Product');
    });
  });

  describe('AC-22.2: pre-dispatch validation', () => {
    it('allows matching role', () => {
      const validator = new RoleStageValidator(registry);
      const result = validator.validate('pm-01', 'spec' as StageId);
      expect(result.allowed).toBe(true);
      expect(result.mismatchEvent).toBeNull();
    });

    it('allows any agent for "Any" stages', () => {
      const validator = new RoleStageValidator(registry);
      const result = validator.validate('dev-01', 'deploy' as StageId);
      expect(result.allowed).toBe(true);
      expect(result.mismatchEvent).toBeNull();
    });
  });

  describe('AC-22.3: audit event on mismatch', () => {
    it('generates audit event with correct fields', () => {
      const validator = new RoleStageValidator(registry, { multiAgent: true, strictRoleMatching: true });
      const result = validator.validate('dev-01', 'spec' as StageId);
      expect(result.mismatchEvent).not.toBeNull();
      const event = result.mismatchEvent!;
      expect(event.timestamp).toBeTruthy();
      expect(event.agentId).toBe('dev-01');
      expect(event.stage).toBe('spec');
      expect(event.requiredRole).toBe('Product');
      expect(event.actualRole).toBe('Coder');
      expect(event.action).toBe('blocked');
      expect(event.reason).toContain('dev-01');
      expect(event.reason).toContain('Coder');
      expect(event.reason).toContain('Product');
    });
  });

  describe('AC-22.4/AC-22.10: adaptive multi-agent role handling', () => {
    it('warns and degrades mismatched dispatch by default', () => {
      const validator = new RoleStageValidator(registry, { multiAgent: true });
      const result = validator.validate('dev-01', 'spec' as StageId);
      expect(result.allowed).toBe(true);
      expect(result.mismatchEvent?.action).toBe('role-degraded');
    });

    it('blocks mismatched dispatch only when strictRoleMatching is true', () => {
      const validator = new RoleStageValidator(registry, { multiAgent: true, strictRoleMatching: true });
      const result = validator.validate('dev-01', 'spec' as StageId);
      expect(result.allowed).toBe(false);
      expect(result.mismatchEvent?.action).toBe('blocked');
    });
  });

  describe('AC-22.5: single-agent warning', () => {
    it('allows mismatched dispatch in single-agent mode with warning', () => {
      const validator = new RoleStageValidator(registry, { multiAgent: false });
      const result = validator.validate('dev-01', 'spec' as StageId);
      expect(result.allowed).toBe(true);
      expect(result.mismatchEvent).not.toBeNull();
      expect(result.mismatchEvent?.action).toBe('warning');
    });
  });

  describe('AC-22.7: configurable role mappings', () => {
    it('allows custom stage-role overrides', () => {
      const validator = new RoleStageValidator(registry, {
        stageRoles: { 'spec': 'Coder' }, // Override: spec now requires Coder
      });
      expect(validator.getRequiredRole('spec' as StageId)).toBe('Coder');
      const result = validator.validate('dev-01', 'spec' as StageId);
      expect(result.allowed).toBe(true);
    });
  });
});

// ── AC-22.8: sevo init role assignment table ────────────────────

describe('AC-22.8: init generates role assignment', () => {
  it('mergeConfig preserves roleAssignment', async () => {
    const { mergeConfig } = await import('../config.js');
    const config = mergeConfig({
      projectName: 'test',
      roleAssignment: {
        agentRoles: { 'pm-01': 'Product' },
        stageRoles: { 'spec': 'Product' },
      },
    });
    expect(config.roleAssignment).toBeDefined();
    expect(config.roleAssignment?.agentRoles?.['pm-01']).toBe('Product');
    expect(config.roleAssignment?.stageRoles?.['spec']).toBe('Product');
  });
});
