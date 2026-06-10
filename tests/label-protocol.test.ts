import { describe, expect, it } from 'vitest';
import { decode, encode } from '../label-protocol.js';

describe('SEVO label protocol', () => {
  it('keeps the canonical machine label format stable', () => {
    expect(encode('kivo', 'implement', 2)).toBe('sevo:kivo:implement:2');
    expect(decode('sevo:kivo:implement:2')).toEqual({
      projectSlug: 'kivo',
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: 'implement',
      attempt: 2,
    });
  });

  it('encodes and decodes the V2 pipeline run label format', () => {
    const pipelineRunId = '4aabebe2-785b-4e90-a5ac-27bb822a11b4';
    expect(encode({ projectSlug: 'kivo', pipelineRunId, stageId: 'implement', attempt: 2 })).toBe(
      'sevo:kivo:4aabebe2:implement:2',
    );
    expect(decode('sevo:kivo:4aabebe2:implement:2')).toEqual({
      projectSlug: 'kivo',
      pipelineRunId: '4aabebe2',
      pipelineRunIdShort: '4aabebe2',
      stageId: 'implement',
      attempt: 2,
    });
  });

  it('decodes documented natural labels used by runtime dispatch', () => {
    expect(decode('sevo:implement kivo 修复自动推进')).toEqual({
      projectSlug: 'kivo',
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: 'implement',
      attempt: 1,
    });

    expect(decode('sevo:fix aco spec-first bug')).toEqual({
      projectSlug: 'aco',
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: 'fix',
      attempt: 1,
    });
  });

  it('decodes stage-only labels with non-ASCII descriptions (no projectSlug)', () => {
    expect(decode('sevo:fix 官网SEVO页面品字形布局修复')).toEqual({
      projectSlug: null,
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: 'fix',
      attempt: 1,
    });

    expect(decode('sevo:review 官网SEVO品字形布局审计')).toEqual({
      projectSlug: null,
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: 'review',
      attempt: 1,
    });

    expect(decode('sevo:implement 添加用户认证功能')).toEqual({
      projectSlug: null,
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: 'implement',
      attempt: 1,
    });
  });
});
