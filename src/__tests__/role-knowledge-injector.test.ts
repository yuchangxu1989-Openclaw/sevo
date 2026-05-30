/**
 * Tests for RoleKnowledgeInjector (arc42 §5.4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoleKnowledgeInjector } from '../knowledge/role-knowledge-injector.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname_test = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname_test, '..', '..', 'templates');

describe('RoleKnowledgeInjector', () => {
  let injector: RoleKnowledgeInjector;

  beforeEach(() => {
    injector = new RoleKnowledgeInjector({ templatesDir: TEMPLATES_DIR });
  });

  describe('getPrinciples', () => {
    it('returns spec-principles for spec stage', () => {
      const principles = injector.getPrinciples('spec');
      expect(principles).toContain('PM');
      expect(principles.length).toBeGreaterThan(0);
    });

    it('returns contract-principles for contract stage', () => {
      const principles = injector.getPrinciples('contract');
      expect(principles).toContain('架构师');
    });

    it('returns implement-principles for implement stage', () => {
      const principles = injector.getPrinciples('implement');
      expect(principles).toContain('TDD');
    });

    it('returns review-principles for review stage', () => {
      const principles = injector.getPrinciples('review');
      expect(principles).toContain('审计');
    });

    it('returns ux-principles for smoke-test stage', () => {
      const principles = injector.getPrinciples('smoke-test');
      expect(principles).toContain('UX');
    });

    it('returns ux-principles for ux-acceptance stage', () => {
      const principles = injector.getPrinciples('ux-acceptance');
      expect(principles).toContain('陌生用户');
    });

    it('returns deploy-principles for deploy stage', () => {
      const principles = injector.getPrinciples('deploy');
      expect(principles).toContain('五层');
    });

    it('returns empty string for unknown stage', () => {
      const principles = injector.getPrinciples('nonexistent' as any);
      expect(principles).toBe('');
    });

    it('caches templates after first load', () => {
      const first = injector.getPrinciples('spec');
      const second = injector.getPrinciples('spec');
      expect(first).toBe(second);
    });
  });

  describe('getGateRules', () => {
    it('extracts rules from spec-principles template', () => {
      const rules = injector.getGateRules('spec');
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.ruleId).toContain('spec/');
        expect(rule.severity).toBe('warning');
        expect(rule.description.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array for unknown stage', () => {
      const rules = injector.getGateRules('nonexistent' as any);
      expect(rules).toEqual([]);
    });
  });

  describe('inject', () => {
    it('enriches context with principles and metadata', () => {
      const context = { taskId: 'test-1', description: 'Write spec' };
      const enriched = injector.inject('spec', context);

      expect(enriched.taskId).toBe('test-1');
      expect(enriched.description).toBe('Write spec');
      expect(enriched.principles).toContain('PM');
      expect(enriched._injectedRole).toBe('pm');
      expect(enriched._injectedAt).toBeDefined();
    });

    it('sets role to unknown for unmapped stage', () => {
      const enriched = injector.inject('nonexistent' as any, {});
      expect(enriched._injectedRole).toBe('unknown');
      expect(enriched.principles).toBe('');
    });
  });

  describe('getRoleForStage', () => {
    it('returns pm for spec', () => {
      expect(injector.getRoleForStage('spec')).toBe('pm');
    });

    it('returns architect for contract', () => {
      expect(injector.getRoleForStage('contract')).toBe('architect');
    });

    it('returns engineer for implement', () => {
      expect(injector.getRoleForStage('implement')).toBe('engineer');
    });

    it('returns auditor for review', () => {
      expect(injector.getRoleForStage('review')).toBe('auditor');
    });

    it('returns ux for smoke-test', () => {
      expect(injector.getRoleForStage('smoke-test')).toBe('ux');
    });

    it('returns release for deploy', () => {
      expect(injector.getRoleForStage('deploy')).toBe('release');
    });

    it('returns null for unknown stage', () => {
      expect(injector.getRoleForStage('nonexistent' as any)).toBeNull();
    });
  });

  describe('listMappings', () => {
    it('returns all stage-role mappings', () => {
      const mappings = injector.listMappings();
      expect(mappings.length).toBeGreaterThan(10);

      const stageIds = mappings.map(m => m.stageId);
      expect(stageIds).toContain('spec');
      expect(stageIds).toContain('contract');
      expect(stageIds).toContain('implement');
      expect(stageIds).toContain('review');
      expect(stageIds).toContain('deploy');
    });
  });

  describe('missing templates directory', () => {
    it('returns empty string when templates dir does not exist', () => {
      const badInjector = new RoleKnowledgeInjector({ templatesDir: '/nonexistent/path' });
      expect(badInjector.getPrinciples('spec')).toBe('');
    });
  });
});
