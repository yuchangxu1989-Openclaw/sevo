import { describe, expect, it } from 'vitest';
import { decode, encode } from '../label-protocol.js';

describe('SEVO label protocol', () => {
  it('keeps the canonical machine label format stable', () => {
    expect(encode('kivo', 'implement', 2)).toBe('sevo:kivo:implement:2');
    expect(decode('sevo:kivo:implement:2')).toEqual({
      projectSlug: 'kivo',
      stageId: 'implement',
      attempt: 2,
    });
  });

  it('decodes documented natural labels used by runtime dispatch', () => {
    expect(decode('sevo:implement kivo 修复自动推进')).toEqual({
      projectSlug: 'kivo',
      stageId: 'implement',
      attempt: 1,
    });

    expect(decode('sevo:fix aco spec-first bug')).toEqual({
      projectSlug: 'aco',
      stageId: 'fix',
      attempt: 1,
    });
  });
});
