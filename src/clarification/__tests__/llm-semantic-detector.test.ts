import { describe, expect, it, vi } from 'vitest';

import { LlmSemanticAmbiguityDetector } from '../llm-semantic-detector.js';
import type { SevoHostAdapter } from '../../adapter/host-adapter.js';

function mockAdapter(response: string): SevoHostAdapter {
  return {
    callLlm: vi.fn().mockResolvedValue(response),
    dispatchTask: vi.fn(),
    collectArtifacts: vi.fn(),
    notifyGateResult: vi.fn(),
    triggerStage: vi.fn(),
    getProjectConfig: vi.fn().mockReturnValue({ workspaceRoot: '/tmp', projectRoot: '/tmp' }),
  } as unknown as SevoHostAdapter;
}

function mockRejectingAdapter(error: unknown): SevoHostAdapter {
  return {
    callLlm: vi.fn().mockRejectedValue(error),
    dispatchTask: vi.fn(),
    collectArtifacts: vi.fn(),
    notifyGateResult: vi.fn(),
    triggerStage: vi.fn(),
    getProjectConfig: vi.fn().mockReturnValue({ workspaceRoot: '/tmp', projectRoot: '/tmp' }),
  } as unknown as SevoHostAdapter;
}

describe('LlmSemanticAmbiguityDetector', () => {
  it('returns empty array for empty content', async () => {
    const adapter = mockAdapter('{}');
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    const result = await detector.detect('');
    expect(result).toEqual([]);
    expect(adapter.callLlm).not.toHaveBeenCalled();
  });

  it('parses valid LLM response into AmbiguitySignal[]', async () => {
    const llmResponse = JSON.stringify({
      findings: [
        {
          type: 'boundary-undefined',
          description: 'The timeout value is described as "reasonable" without a specific number',
          location: 'Section 3.2: timeout configuration',
          severity: 'high',
          reasoning: 'Different implementers may choose vastly different values',
        },
        {
          type: 'acceptance-criteria-missing',
          description: 'FR-05 has no verifiable acceptance criteria',
          location: 'FR-05 section',
          severity: 'critical',
          reasoning: 'Cannot verify completion without measurable criteria',
        },
      ],
    });

    const adapter = mockAdapter(llmResponse);
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    const result = await detector.detect('Some spec content about timeouts and FR-05');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: 'boundary-undefined',
      description: 'The timeout value is described as "reasonable" without a specific number',
      location: 'Section 3.2: timeout configuration',
      severity: 'high',
    });
    expect(result[1]).toEqual({
      type: 'acceptance-criteria-missing',
      description: 'FR-05 has no verifiable acceptance criteria',
      location: 'FR-05 section',
      severity: 'critical',
    });
  });

  it('returns empty array when LLM call fails', async () => {
    const adapter = mockRejectingAdapter(new Error('rate limit'));
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });

    await expect(detector.detect('Some spec content')).resolves.toEqual([]);
    expect(adapter.callLlm).toHaveBeenCalledOnce();
  });

  it('handles LLM response with no findings', async () => {
    const adapter = mockAdapter('{"findings": []}');
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'contract' });
    const result = await detector.detect('Well-defined contract content');
    expect(result).toEqual([]);
  });

  it('handles malformed LLM response gracefully', async () => {
    const adapter = mockAdapter('This is not JSON at all');
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    const result = await detector.detect('Some content');
    expect(result).toEqual([]);
  });

  it('handles LLM response with invalid finding types gracefully', async () => {
    const llmResponse = JSON.stringify({
      findings: [
        {
          type: 'unknown-type',
          description: 'Something vague',
          location: 'somewhere',
          severity: 'invalid-severity',
          reasoning: 'because',
        },
      ],
    });

    const adapter = mockAdapter(llmResponse);
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'implement' });
    const result = await detector.detect('Task content');

    expect(result).toHaveLength(1);
    // Falls back to defaults for invalid type/severity
    expect(result[0]!.type).toBe('boundary-undefined');
    expect(result[0]!.severity).toBe('medium');
  });

  it('passes stage-specific system prompt to LLM', async () => {
    const adapter = mockAdapter('{"findings": []}');
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    await detector.detect('Content');

    const callArgs = (adapter.callLlm as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ role: string; content: string }>;
    expect(callArgs[0]!.content).toContain('requirements specification');
    expect(callArgs[0]!.content).toContain('Acceptance criteria');
  });

  it('includes related content for contradiction detection', async () => {
    const adapter = mockAdapter('{"findings": []}');
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'contract' });
    await detector.detect('Contract content', {
      relatedContent: 'Original spec content for cross-reference',
    });

    const callArgs = (adapter.callLlm as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ role: string; content: string }>;
    expect(callArgs[1]!.content).toContain('Related Context');
    expect(callArgs[1]!.content).toContain('Original spec content');
  });

  it('includes focus areas in system prompt', async () => {
    const adapter = mockAdapter('{"findings": []}');
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    await detector.detect('Content', {
      focusAreas: ['Custom focus area 1', 'Custom focus area 2'],
    });

    const callArgs = (adapter.callLlm as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ role: string; content: string }>;
    expect(callArgs[0]!.content).toContain('Custom focus area 1');
    expect(callArgs[0]!.content).toContain('Custom focus area 2');
  });

  it('truncates long descriptions and locations', async () => {
    const longDesc = 'A'.repeat(300);
    const longLoc = 'B'.repeat(200);
    const llmResponse = JSON.stringify({
      findings: [{
        type: 'boundary-undefined',
        description: longDesc,
        location: longLoc,
        severity: 'medium',
        reasoning: 'test',
      }],
    });

    const adapter = mockAdapter(llmResponse);
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    const result = await detector.detect('Content');

    expect(result[0]!.description.length).toBeLessThanOrEqual(200);
    expect(result[0]!.location.length).toBeLessThanOrEqual(80);
  });

  it('filters out findings with empty description', async () => {
    const llmResponse = JSON.stringify({
      findings: [
        { type: 'boundary-undefined', description: '', location: 'x', severity: 'high', reasoning: 'y' },
        { type: 'boundary-undefined', description: 'Valid finding', location: 'y', severity: 'high', reasoning: 'z' },
      ],
    });

    const adapter = mockAdapter(llmResponse);
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    const result = await detector.detect('Content');

    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe('Valid finding');
  });

  it('extracts JSON from markdown-wrapped response', async () => {
    const llmResponse = `Here's my analysis:
\`\`\`json
{"findings": [{"type": "term-undefined", "description": "Term X undefined", "location": "line 5", "severity": "low", "reasoning": "unclear"}]}
\`\`\``;

    const adapter = mockAdapter(llmResponse);
    const detector = new LlmSemanticAmbiguityDetector({ adapter, stage: 'spec' });
    const result = await detector.detect('Content with term X');

    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('term-undefined');
  });
});
