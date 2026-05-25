import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/review/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('review skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: review');
    expect(output).toContain('mappedStage: review');

    for (const keyword of [
      'Stage: review',
      'Acceptance Criteria',
      'Stage constraint: validate acceptance criteria',
      'Review 阶段强制检查项（spec-code 对齐）',
      'AC 覆盖矩阵：AC编号 | 覆盖状态(已实现/部分/未实现) | 对应代码位置',
      '任何 AC 未实现 = blocker，评审结论必须为"不通过"',
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
