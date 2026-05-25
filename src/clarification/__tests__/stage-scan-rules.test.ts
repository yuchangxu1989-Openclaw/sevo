import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  SpecStageScanRule,
  ContractStageScanRule,
  ImplementStageScanRule,
  createStageScanRules,
} from '../stage-scan-rules.js';
import type { SevoHostAdapter } from '../../adapter/host-adapter.js';
import type { ArtifactRef, StageRecord } from '../../types/index.js';
import { BlockingLevel, ClarificationType } from '../clarification-types.js';

let tmpDir: string;

function mockAdapter(llmResponse?: string): SevoHostAdapter {
  return {
    callLlm: vi.fn().mockResolvedValue(llmResponse ?? '{"findings": []}'),
    dispatchTask: vi.fn(),
    collectArtifacts: vi.fn(),
    notifyGateResult: vi.fn(),
    triggerStage: vi.fn(),
    getProjectConfig: vi.fn().mockReturnValue({ workspaceRoot: '/tmp', projectRoot: '/tmp' }),
  } as unknown as SevoHostAdapter;
}

function makeStageRecord(stageId: string, artifacts: ArtifactRef[] = []): StageRecord {
  return {
    stageId: stageId as StageRecord['stageId'],
    status: 'active',
    attempt: 1,
    artifacts,
  };
}

function writeArtifact(filename: string, content: string): ArtifactRef {
  const filePath = path.join(tmpDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return {
    id: `art-${filename}`,
    type: filename.replace('.md', ''),
    path: filePath,
    createdAt: '2025-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-scan-rules-'));
});

describe('SpecStageScanRule', () => {
  it('returns empty for non-spec stages', () => {
    const rule = new SpecStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('contract');
    expect(rule.evaluate(record, [])).toEqual([]);
  });

  it('returns empty when no spec artifact exists', () => {
    const rule = new SpecStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('spec');
    expect(rule.evaluate(record, [])).toEqual([]);
  });

  it('detects structural ambiguities in spec content', () => {
    const specContent = `### FR-01 User Authentication
This feature handles user login. The system should respond in a reasonable time.
`;
    const artifact = writeArtifact('spec.md', specContent);
    const rule = new SpecStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('spec', [artifact]);

    const findings = rule.evaluate(record, [artifact]);

    // Should detect: AC missing for FR-01, vague "reasonable" boundary
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.question.includes('lacks acceptance criteria'))).toBe(true);
  });

  it('semantic detection calls LLM with spec-specific prompt', async () => {
    const specContent = '### FR-01 Feature\nAC-1: System works correctly.\n';
    const artifact = writeArtifact('spec.md', specContent);
    const adapter = mockAdapter(JSON.stringify({
      findings: [{
        type: 'acceptance-criteria-missing',
        description: 'AC-1 is not measurable or verifiable',
        location: 'AC-1: System works correctly',
        severity: 'high',
        reasoning: 'What does "correctly" mean?',
      }],
    }));

    const rule = new SpecStageScanRule({ adapter, pipelineId: 'pipe-1' });
    const record = makeStageRecord('spec', [artifact]);

    const findings = await rule.detectSemantic(record, [artifact]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.question).toContain('Semantic');
    expect(findings[0]!.blockingLevel).toBe(BlockingLevel.BLOCKING);
    expect(adapter.callLlm).toHaveBeenCalled();
  });
});

describe('ContractStageScanRule', () => {
  it('returns empty for non-contract stages', () => {
    const rule = new ContractStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('spec');
    expect(rule.evaluate(record, [])).toEqual([]);
  });

  it('routes requirement-level ambiguities to user', () => {
    const contractContent = `## Architecture
This contradicts the spec requirement about data flow.
The interface: UserService handles authentication.
`;
    const artifact = writeArtifact('contract.md', contractContent);
    const rule = new ContractStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('contract', [artifact]);

    const findings = rule.evaluate(record, [artifact]);
    // Contradiction findings should target user
    const contradictions = findings.filter((f) => f.type === ClarificationType.CORRECTION);
    for (const c of contradictions) {
      expect(c.targetType).toBe('user');
    }
  });

  it('semantic detection includes spec content for contradiction detection (AC-4.48)', async () => {
    const contractContent = '## Module Design\nUserService handles all auth.\n';
    const specContent = '## Requirements\nAuth is handled by AuthModule, not UserService.\n';
    const contractArtifact = writeArtifact('contract.md', contractContent);
    const specArtifact = writeArtifact('spec.md', specContent);

    const adapter = mockAdapter(JSON.stringify({
      findings: [{
        type: 'spec-contract-contradiction',
        description: 'Contract assigns auth to UserService but spec says AuthModule',
        location: 'UserService handles all auth',
        severity: 'critical',
        reasoning: 'Fundamental disagreement on module responsibility',
      }],
    }));

    const rule = new ContractStageScanRule({ adapter, pipelineId: 'pipe-1' });
    const record = makeStageRecord('contract', [contractArtifact, specArtifact]);

    const findings = await rule.detectSemantic(record, [contractArtifact, specArtifact]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe(ClarificationType.CORRECTION);
    expect(findings[0]!.blockingLevel).toBe(BlockingLevel.BLOCKING);
    expect(findings[0]!.targetType).toBe('user');

    // Verify spec content was passed to LLM
    const callArgs = (adapter.callLlm as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ role: string; content: string }>;
    expect(callArgs[1]!.content).toContain('Auth is handled by AuthModule');
  });
});

describe('ImplementStageScanRule', () => {
  it('returns empty for non-implement stages', () => {
    const rule = new ImplementStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('spec');
    expect(rule.evaluate(record, [])).toEqual([]);
  });

  it('detects missing verification steps in task description (AC-4.49)', () => {
    const taskContent = 'Implement the login feature. Make it work with OAuth.';
    const artifact = writeArtifact('task.md', taskContent);
    const rule = new ImplementStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('implement', [artifact]);

    const findings = rule.evaluate(record, [artifact]);

    expect(findings.some((f) => f.question.includes('verification steps'))).toBe(true);
  });

  it('detects missing target files in task description', () => {
    const taskContent = 'Add error handling to the authentication flow. Verify by following these steps: run npm test.';
    const artifact = writeArtifact('task.md', taskContent);
    const rule = new ImplementStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('implement', [artifact]);

    const findings = rule.evaluate(record, [artifact]);

    // Has verification steps but no target files
    expect(findings.some((f) => f.question.includes('target files'))).toBe(true);
    expect(findings.some((f) => f.question.includes('verification steps'))).toBe(false);
  });

  it('no findings for complete task description', () => {
    const taskContent = `Implement login in src/auth/login.ts.
Verify by running test steps: npm test -- --grep "login"`;
    const artifact = writeArtifact('task.md', taskContent);
    const rule = new ImplementStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('implement', [artifact]);

    const findings = rule.evaluate(record, [artifact]);
    expect(findings).toHaveLength(0);
  });

  it('semantic detection marks contradictions as BLOCKING (AC-4.50)', async () => {
    const taskContent = 'Implement feature X as described in contract.';
    const contractContent = 'Feature X uses REST API.';
    const taskArtifact = writeArtifact('task.md', taskContent);
    const contractArtifact = writeArtifact('contract.md', contractContent);

    const adapter = mockAdapter(JSON.stringify({
      findings: [{
        type: 'spec-contract-contradiction',
        description: 'Task says gRPC but contract says REST',
        location: 'Implement feature X',
        severity: 'critical',
        reasoning: 'Fundamental protocol mismatch',
      }],
    }));

    const rule = new ImplementStageScanRule({ adapter, pipelineId: 'pipe-1' });
    const record = makeStageRecord('implement', [taskArtifact, contractArtifact]);

    const findings = await rule.detectSemantic(record, [taskArtifact, contractArtifact]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.blockingLevel).toBe(BlockingLevel.BLOCKING);
    expect(findings[0]!.targetType).toBe('user');
  });

  it('non-blocking findings have assumed defaults (AC-4.51)', () => {
    const taskContent = 'Implement the feature.';
    const artifact = writeArtifact('task.md', taskContent);
    const rule = new ImplementStageScanRule({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    const record = makeStageRecord('implement', [artifact]);

    const findings = rule.evaluate(record, [artifact]);
    const nonBlocking = findings.filter((f) => f.blockingLevel === BlockingLevel.NON_BLOCKING);

    for (const finding of nonBlocking) {
      expect(finding.assumedDefault).toBeTruthy();
    }
  });
});

describe('createStageScanRules', () => {
  it('creates rules for all three stages', () => {
    const rules = createStageScanRules({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.id)).toEqual([
      'spec-stage-ambiguity',
      'contract-stage-ambiguity',
      'implement-stage-ambiguity',
    ]);
  });

  it('rules are stage-bound not agent-bound (AC-4.55)', () => {
    const rules = createStageScanRules({ adapter: mockAdapter(), pipelineId: 'pipe-1' });
    // Each rule only responds to its own stage
    const specRecord = makeStageRecord('spec');
    const contractRecord = makeStageRecord('contract');
    const implementRecord = makeStageRecord('implement');

    // Spec rule only fires for spec stage
    expect(rules[0]!.evaluate(contractRecord, [])).toEqual([]);
    expect(rules[0]!.evaluate(implementRecord, [])).toEqual([]);

    // Contract rule only fires for contract stage
    expect(rules[1]!.evaluate(specRecord, [])).toEqual([]);
    expect(rules[1]!.evaluate(implementRecord, [])).toEqual([]);

    // Implement rule only fires for implement stage
    expect(rules[2]!.evaluate(specRecord, [])).toEqual([]);
    expect(rules[2]!.evaluate(contractRecord, [])).toEqual([]);
  });
});
