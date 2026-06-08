import { describe, expect, it } from 'vitest';

import { renderAdvancePromptTemplate } from '../advance-prompt-templates.js';

describe('advance prompt templates', () => {
  it('renders mandatory dispatch and board ack text from a configurable template', () => {
    const rendered = renderAdvancePromptTemplate('autoAdvanceAction', {
      agentLine: 'Recommended agentId: audit-01',
      timeout: 600,
      roleNavHint: '',
      roleRelevantAgents: '',
      label: 'sevo:demo:review:1',
      commercializationGateBlock: '',
      taskDescription: 'Run review.',
    });

    expect(rendered).toContain('Recommended agentId: audit-01 | timeout: 600s');
    expect(rendered).toContain('Label (required): sevo:demo:review:1');
    expect(rendered).toContain('必须在本回合立即派发');
    expect(rendered).toContain('This is not a suggestion');
    expect(rendered).toContain('task board 中出现同 label 任务');
    expect(rendered).toContain('Run review.');
  });

  it('allows runtime override templates', () => {
    const rendered = renderAdvancePromptTemplate(
      'autoAdvanceAction',
      { label: 'sevo:custom' },
      { autoAdvanceAction: 'OVERRIDE {label}' },
    );

    expect(rendered).toBe('OVERRIDE sevo:custom');
  });
  it('falls back to the built-in template when overrides are empty', () => {
    const rendered = renderAdvancePromptTemplate(
      'autoAdvanceAction',
      { label: 'sevo:fallback', timeout: 120, taskDescription: 'Fallback task.' },
      {},
    );

    expect(rendered).toContain('Label (required): sevo:fallback');
    expect(rendered).toContain('Fallback task.');
  });
});
