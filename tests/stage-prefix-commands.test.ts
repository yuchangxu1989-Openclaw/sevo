import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

// P1-2: sevo:specify / sevo:design / sevo:review / sevo:ux must be parsed by the
// command-parsing layer (not just listed in the injected prefix guide) and map to
// the matching pipeline stage, routed through the same handleFromCommand path as
// sevo:from. These tests pin the pure parser + the stage mapping.

const { parseStagePrefixCommand, STAGE_PREFIX_TO_STAGE, FROM_STAGE_MAP } = mod as any;

describe('SEVO stage-prefix commands (P1-2)', () => {
  describe('parseStagePrefixCommand', () => {
    it('recognizes sevo:specify and captures the description', () => {
      const parsed = parseStagePrefixCommand('sevo:specify 知识提取FR补充');
      expect(parsed).not.toBeNull();
      expect(parsed.prefix).toBe('specify');
      expect(parsed.targetStage).toBe('specify');
      expect(parsed.description).toBe('知识提取FR补充');
    });

    it('recognizes sevo:design', () => {
      const parsed = parseStagePrefixCommand('sevo:design 向量检索架构');
      expect(parsed?.prefix).toBe('design');
      expect(parsed?.targetStage).toBe('design');
    });

    it('recognizes sevo:review', () => {
      const parsed = parseStagePrefixCommand('sevo:review autoDispatch实现审计');
      expect(parsed?.prefix).toBe('review');
      expect(parsed?.targetStage).toBe('review');
    });

    it('recognizes sevo:ux', () => {
      const parsed = parseStagePrefixCommand('sevo:ux KIVO开箱即用验证');
      expect(parsed?.prefix).toBe('ux');
      expect(parsed?.targetStage).toBe('ux');
    });

    it('accepts the fullwidth colon variant', () => {
      const parsed = parseStagePrefixCommand('sevo：specify 全角冒号');
      expect(parsed?.prefix).toBe('specify');
    });

    it('returns null when there is no description', () => {
      expect(parseStagePrefixCommand('sevo:specify')).toBeNull();
      expect(parseStagePrefixCommand('sevo:specify   ')).toBeNull();
    });

    it('returns null for unrelated messages', () => {
      expect(parseStagePrefixCommand('just a normal message')).toBeNull();
      expect(parseStagePrefixCommand('sevo:fix something')).toBeNull();
    });

    it('does not trigger inside a fenced code block', () => {
      const msg = '```\nsevo:specify inside code\n```';
      expect(parseStagePrefixCommand(msg)).toBeNull();
    });

    it('does not trigger inside an inline code span', () => {
      const msg = 'use `sevo:design something` as an example';
      expect(parseStagePrefixCommand(msg)).toBeNull();
    });

    it('does not trigger inside a blockquote', () => {
      const msg = '> sevo:review quoted example';
      expect(parseStagePrefixCommand(msg)).toBeNull();
    });

    it('handles a non-string input gracefully', () => {
      expect(parseStagePrefixCommand(null)).toBeNull();
      expect(parseStagePrefixCommand(undefined)).toBeNull();
    });
  });

  describe('stage mapping', () => {
    it('every stage-prefix target resolves to a real pipeline stage via FROM_STAGE_MAP', () => {
      for (const prefix of Object.keys(STAGE_PREFIX_TO_STAGE)) {
        const stageName = STAGE_PREFIX_TO_STAGE[prefix];
        expect(FROM_STAGE_MAP[stageName]).toBeTruthy();
      }
    });

    it('maps design and ux to architecture-design and ux-acceptance stages', () => {
      expect(FROM_STAGE_MAP['design']).toBe('architecture-design');
      expect(FROM_STAGE_MAP['ux']).toBe('ux-acceptance');
    });
  });
});
