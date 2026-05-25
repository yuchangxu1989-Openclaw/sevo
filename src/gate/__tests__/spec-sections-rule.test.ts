import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ArtifactRef } from '../../types/index.js';
import { SpecSectionsRule } from '../rules/spec-sections-rule.js';

function writeSpec(markdown: string, fileName = 'product-requirements.md'): ArtifactRef {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sevo-spec-rule-'));
  const filePath = path.join(tempDir, fileName);
  writeFileSync(filePath, markdown, 'utf8');

  return {
    id: `artifact:${fileName}`,
    type: 'file',
    path: filePath,
    createdAt: '2026-05-24T00:00:00.000Z',
    metadata: { cleanupDir: tempDir },
  };
}

function cleanupArtifact(artifact: ArtifactRef): void {
  const cleanupDir = artifact.metadata?.['cleanupDir'];
  if (typeof cleanupDir === 'string') {
    rmSync(cleanupDir, { recursive: true, force: true });
  }
}

function mockRule(pass: boolean, reasons: Array<{ type: string; line: number; detail: string }> = []) {
  return new SpecSectionsRule({
    llmClient: {
      async chat(messages) {
        const prompt = messages.map((message) => message.content).join('\n');
        expect(prompt).toContain('<h2_sections>');
        expect(prompt).toContain('<full_markdown_with_line_numbers>');
        return JSON.stringify({ pass, reasons });
      },
    },
  });
}

describe('SpecSectionsRule', () => {
  it('passes when LLM judges all mandatory sections substantive and before 功能需求', async () => {
    const artifact = writeSpec(`
# Product Requirements

## 目标使用者与场景
销售主管在手机和电脑上审核报价。

## 当前卡点
现在用表格来回传，版本错乱导致报价延迟。

## 用户原话
我想打开后马上知道哪张报价单要我处理。

## 完整体验路径
用户打开网页，选择待审核报价，确认差异并提交。

## 功能需求
### FR-01 报价审核
`.trim());

    try {
      const result = await mockRule(true).evaluate([artifact]);
      expect(result.pass).toBe(true);
      expect(result.message).toContain('LLM semantic check');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when LLM reports a missing mandatory section', async () => {
    const artifact = writeSpec(`
# Product Requirements

## 目标使用者与场景
销售主管在手机和电脑上审核报价。

## 当前卡点
现在用表格来回传，版本错乱导致报价延迟。

## 完整体验路径
用户打开网页，选择待审核报价，确认差异并提交。

## 功能需求
### FR-01 报价审核
`.trim());

    try {
      const result = await mockRule(false, [
        { type: 'missing-section', line: 1, detail: '缺少语义等价于原始需求的 H2 独立章节' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.severity).toBe('blocker');
      expect(result.message).toContain('missing-section');
      expect(result.message).toContain('原始需求');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when LLM reports empty or placeholder content', async () => {
    const artifact = writeSpec(`
# Product Requirements

## 使用者
TODO

## 痛苦
待补充

## 想要什么
用户想要更好。

## 体验步骤
打开页面。

## 功能需求
### FR-01 报价审核
`.trim());

    try {
      const result = await mockRule(false, [
        { type: 'empty-content', line: 3, detail: '用户人群章节只有占位符，没有具体人群、场景和设备' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('empty-content');
      expect(result.message).toContain('占位符');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when LLM reports a trace/order style semantic blocker', async () => {
    const artifact = writeSpec(`
# Product Requirements

## 功能需求
### FR-01 报价审核

## 谁会用
销售主管在手机和电脑上审核报价。

## 当前卡点
现在用表格来回传。

## 用户原话
我想快速处理报价。

## 完整体验路径
用户打开网页并提交审核。
`.trim());

    try {
      const result = await mockRule(false, [
        { type: 'section-order', line: 6, detail: '用户人群章节出现在功能需求之后' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('section-order');
      expect(result.message).toContain('功能需求之后');
    } finally {
      cleanupArtifact(artifact);
    }
  });
});
