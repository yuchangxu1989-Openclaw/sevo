/**
 * FR-28 Governance Enforcement Injection tests.
 *
 * Covers:
 * - AC-28.1: dispatch-guard detection and rule injection
 * - AC-28.2: standalone sevo-guard creation
 * - AC-28.5: exemption rules
 * - AC-28.7: status summary output
 * - AC-28.8: governance.enabled false disables injection
 * - AC-28.9: idempotent injection
 * - AC-28.10: GovernanceAdapter interface decoupling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DispatchGuardAdapter } from '../dispatch-guard-adapter.js';
import { StandaloneGuardAdapter } from '../standalone-guard.js';
import type { SevoGuardConfig } from '../standalone-guard.js';
import { SEVO_GOVERNANCE_RULES } from '../rules.js';
import { injectGovernance, selectAdapter, printGovernanceStatus } from '../inject.js';
import type { GovernanceAdapter, GovernanceRule } from '../adapter.js';

describe('FR-28 Governance Enforcement Injection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-governance-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('DispatchGuardAdapter', () => {
    it('AC-28.1: detects dispatch-guard from extensions directory', () => {
      const dgDir = path.join(tmpDir, 'extensions', 'dispatch-guard');
      fs.mkdirSync(dgDir, { recursive: true });

      const adapter = new DispatchGuardAdapter();
      const detection = adapter.detect(tmpDir);

      expect(detection.exists).toBe(true);
      expect(detection.type).toBe('dispatch-guard');
    });

    it('AC-28.1: detects dispatch-guard from openclaw.json extensions array', () => {
      const openclawJson = {
        extensions: [{ name: 'dispatch-guard', enabled: true }],
      };
      fs.writeFileSync(
        path.join(tmpDir, 'openclaw.json'),
        JSON.stringify(openclawJson),
      );

      const adapter = new DispatchGuardAdapter();
      const detection = adapter.detect(tmpDir);

      expect(detection.exists).toBe(true);
      expect(detection.type).toBe('dispatch-guard');
    });

    it('returns exists=false when dispatch-guard not present', () => {
      const adapter = new DispatchGuardAdapter();
      const detection = adapter.detect(tmpDir);

      expect(detection.exists).toBe(false);
      expect(detection.type).toBe('none');
    });

    it('AC-28.1: injects rules into existing dispatch-guard config without overwriting', () => {
      // Setup: existing dispatch-guard with a custom rule
      const dgDir = path.join(tmpDir, 'extensions', 'dispatch-guard');
      fs.mkdirSync(dgDir, { recursive: true });
      const existingConfig = {
        rules: [
          {
            id: 'custom:my-rule',
            description: 'User custom rule',
            taskTypes: ['deploy'],
            action: 'warn',
            message: 'Be careful with deploys',
          },
        ],
      };
      fs.writeFileSync(
        path.join(dgDir, 'rules.json'),
        JSON.stringify(existingConfig),
      );

      const adapter = new DispatchGuardAdapter();
      const result = adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('dispatch-guard');
      expect(result.rulesInjected).toBe(4);
      expect(result.rulesSkipped).toBe(0);

      // Verify custom rule preserved
      const written = JSON.parse(
        fs.readFileSync(path.join(dgDir, 'rules.json'), 'utf-8'),
      );
      expect(written.rules[0].id).toBe('custom:my-rule');
      expect(written.rules.length).toBe(5); // 1 custom + 4 sevo
    });

    it('AC-28.9: idempotent — repeated injection does not duplicate rules', () => {
      const dgDir = path.join(tmpDir, 'extensions', 'dispatch-guard');
      fs.mkdirSync(dgDir, { recursive: true });
      fs.writeFileSync(path.join(dgDir, 'rules.json'), JSON.stringify({ rules: [] }));

      const adapter = new DispatchGuardAdapter();

      // First injection
      const first = adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);
      expect(first.rulesInjected).toBe(4);
      expect(first.rulesSkipped).toBe(0);

      // Second injection — should skip all
      const second = adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);
      expect(second.rulesInjected).toBe(0);
      expect(second.rulesSkipped).toBe(4);

      // Verify no duplicates
      const config = JSON.parse(
        fs.readFileSync(path.join(dgDir, 'rules.json'), 'utf-8'),
      );
      expect(config.rules.length).toBe(4);
    });

    it('verify returns active when sevo rules present', () => {
      const dgDir = path.join(tmpDir, 'extensions', 'dispatch-guard');
      fs.mkdirSync(dgDir, { recursive: true });

      const adapter = new DispatchGuardAdapter();
      adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);

      const verification = adapter.verify(tmpDir);
      expect(verification.active).toBe(true);
      expect(verification.message).toContain('4 SEVO governance rule(s) active');
    });
  });

  describe('StandaloneGuardAdapter', () => {
    it('AC-28.2: creates sevo-guard.json when no governance mechanism exists', () => {
      const adapter = new StandaloneGuardAdapter();
      const result = adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('sevo-guard');
      expect(result.rulesInjected).toBe(4);

      const configPath = path.join(tmpDir, 'sevo-guard.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config: SevoGuardConfig = JSON.parse(
        fs.readFileSync(configPath, 'utf-8'),
      );
      expect(config.version).toBe(1);
      expect(config.enabled).toBe(true);
      expect(config.source).toBe('sevo-governance');
      expect(config.rules.length).toBe(4);
    });

    it('AC-28.9: idempotent — repeated injection does not duplicate rules', () => {
      const adapter = new StandaloneGuardAdapter();

      adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);
      const second = adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);

      expect(second.rulesInjected).toBe(0);
      expect(second.rulesSkipped).toBe(4);

      const config: SevoGuardConfig = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'sevo-guard.json'), 'utf-8'),
      );
      expect(config.rules.length).toBe(4);
    });

    it('detects existing sevo-guard.json', () => {
      const adapter = new StandaloneGuardAdapter();
      adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);

      const detection = adapter.detect(tmpDir);
      expect(detection.exists).toBe(true);
      expect(detection.type).toBe('sevo-guard');
      expect(detection.configPath).toBe(path.join(tmpDir, 'sevo-guard.json'));
    });

    it('verify returns active when rules present and enabled', () => {
      const adapter = new StandaloneGuardAdapter();
      adapter.inject(tmpDir, SEVO_GOVERNANCE_RULES);

      const verification = adapter.verify(tmpDir);
      expect(verification.active).toBe(true);
    });

    it('verify returns inactive when governance disabled', () => {
      const configPath = path.join(tmpDir, 'sevo-guard.json');
      const config: SevoGuardConfig = {
        version: 1,
        enabled: false,
        source: 'sevo-governance',
        rules: SEVO_GOVERNANCE_RULES,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(configPath, JSON.stringify(config));

      const adapter = new StandaloneGuardAdapter();
      const verification = adapter.verify(tmpDir);
      expect(verification.active).toBe(false);
      expect(verification.message).toContain('disabled');
    });
  });

  describe('injectGovernance orchestrator', () => {
    it('AC-28.8: skips injection when governance.enabled is false', () => {
      const result = injectGovernance({
        projectRoot: tmpDir,
        hostAdapter: 'standalone',
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(result.rulesInjected).toBe(0);
      expect(result.summary).toContain('disabled');
      expect(fs.existsSync(path.join(tmpDir, 'sevo-guard.json'))).toBe(false);
    });

    it('uses dispatch-guard adapter for openclaw host with dispatch-guard present', () => {
      const dgDir = path.join(tmpDir, 'extensions', 'dispatch-guard');
      fs.mkdirSync(dgDir, { recursive: true });
      fs.writeFileSync(path.join(dgDir, 'rules.json'), JSON.stringify({ rules: [] }));

      const result = injectGovernance({
        projectRoot: tmpDir,
        hostAdapter: 'openclaw',
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('dispatch-guard');
      expect(result.rulesInjected).toBe(4);
    });

    it('falls back to standalone guard for openclaw host without dispatch-guard', () => {
      const result = injectGovernance({
        projectRoot: tmpDir,
        hostAdapter: 'openclaw',
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('sevo-guard');
    });

    it('uses standalone guard for standalone host', () => {
      const result = injectGovernance({
        projectRoot: tmpDir,
        hostAdapter: 'standalone',
        enabled: true,
      });

      expect(result.success).toBe(true);
      expect(result.mechanism).toBe('sevo-guard');
      expect(fs.existsSync(path.join(tmpDir, 'sevo-guard.json'))).toBe(true);
    });
  });

  describe('selectAdapter', () => {
    it('AC-28.10: returns DispatchGuardAdapter when dispatch-guard exists in openclaw env', () => {
      const dgDir = path.join(tmpDir, 'extensions', 'dispatch-guard');
      fs.mkdirSync(dgDir, { recursive: true });

      const adapter = selectAdapter(tmpDir, 'openclaw');
      expect(adapter).toBeInstanceOf(DispatchGuardAdapter);
    });

    it('AC-28.10: returns StandaloneGuardAdapter for standalone env', () => {
      const adapter = selectAdapter(tmpDir, 'standalone');
      expect(adapter).toBeInstanceOf(StandaloneGuardAdapter);
    });

    it('AC-28.10: returns StandaloneGuardAdapter for openclaw env without dispatch-guard', () => {
      const adapter = selectAdapter(tmpDir, 'openclaw');
      expect(adapter).toBeInstanceOf(StandaloneGuardAdapter);
    });
  });

  describe('SEVO_GOVERNANCE_RULES', () => {
    it('AC-28.5: includes exemption rules for doc fixes, config tweaks, and hotfixes', () => {
      const featureRule = SEVO_GOVERNANCE_RULES.find(
        (r) => r.id === 'sevo:new-feature-requires-pipeline',
      );
      expect(featureRule).toBeDefined();
      expect(featureRule!.exemptions).toBeDefined();
      expect(featureRule!.exemptions!.length).toBeGreaterThanOrEqual(3);

      const exemptionIds = featureRule!.exemptions!.map((e) => e.id);
      expect(exemptionIds).toContain('hotfix');
      expect(exemptionIds).toContain('doc-only');
      expect(exemptionIds).toContain('config-tweak');
    });

    it('covers all required task types from spec', () => {
      const allTaskTypes = SEVO_GOVERNANCE_RULES.flatMap((r) => r.taskTypes);
      // New features
      expect(allTaskTypes).toContain('code');
      expect(allTaskTypes).toContain('feature');
      // Bug fixes
      expect(allTaskTypes).toContain('bugfix');
      expect(allTaskTypes).toContain('fix');
      // Architecture
      expect(allTaskTypes).toContain('architecture');
      // Requirements
      expect(allTaskTypes).toContain('spec');
      expect(allTaskTypes).toContain('requirement');
    });
  });

  describe('printGovernanceStatus', () => {
    it('AC-28.7: prints governance status summary', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      printGovernanceStatus({
        success: true,
        mechanism: 'dispatch-guard',
        rulesInjected: 4,
        rulesSkipped: 0,
        summary: 'Injected 4 SEVO governance rule(s) into dispatch-guard.',
        managedTaskTypes: ['code', 'feature', 'bugfix', 'architecture', 'spec'],
        exemptions: ['Emergency hotfix', 'Pure documentation change'],
        disableInstruction: 'sevo config set governance.enabled false',
      });

      const output = logSpy.mock.calls.flat().join('\n');
      expect(output).toContain('Governance enforcement');
      expect(output).toContain('dispatch-guard');
      expect(output).toContain('Managed task types');
      expect(output).toContain('Exemptions');
      expect(output).toContain('To disable');

      logSpy.mockRestore();
    });

    it('prints skip message when governance disabled', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      printGovernanceStatus({
        success: true,
        mechanism: 'sevo-guard',
        rulesInjected: 0,
        rulesSkipped: 0,
        summary: 'Governance enforcement is disabled.',
        managedTaskTypes: [],
        exemptions: [],
        disableInstruction: 'sevo config set governance.enabled false',
      });

      const output = logSpy.mock.calls.flat().join('\n');
      expect(output).toContain('disabled');

      logSpy.mockRestore();
    });
  });

  describe('GovernanceAdapter interface compliance', () => {
    it('AC-28.10: both adapters implement the same interface', () => {
      const dgAdapter: GovernanceAdapter = new DispatchGuardAdapter();
      const saAdapter: GovernanceAdapter = new StandaloneGuardAdapter();

      // Both have detect, inject, verify
      expect(typeof dgAdapter.detect).toBe('function');
      expect(typeof dgAdapter.inject).toBe('function');
      expect(typeof dgAdapter.verify).toBe('function');
      expect(typeof saAdapter.detect).toBe('function');
      expect(typeof saAdapter.inject).toBe('function');
      expect(typeof saAdapter.verify).toBe('function');
    });
  });
});
