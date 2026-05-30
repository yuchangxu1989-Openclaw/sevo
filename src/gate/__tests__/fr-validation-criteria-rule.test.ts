import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ArtifactRef } from '../../types/index.js';
import { FrValidationCriteriaRule } from '../rules/fr-validation-criteria-rule.js';

function writeSpec(markdown: string): ArtifactRef {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sevo-fr-validation-'));
  const filePath = path.join(tempDir, 'product-requirements.md');
  writeFileSync(filePath, markdown, 'utf8');
  return {
    id: 'artifact:product-requirements.md',
    type: 'file',
    path: filePath,
    createdAt: '2026-05-24T00:00:00.000Z',
    metadata: { cleanupDir: tempDir },
  };
}

function cleanupArtifact(artifact: ArtifactRef): void {
  const cleanupDir = artifact.metadata?.['cleanupDir'];
  if (typeof cleanupDir === 'string') rmSync(cleanupDir, { recursive: true, force: true });
}

function mockRule(pass: boolean, reasons: Array<{ type: string; line: number; detail: string }> = []) {
  return new FrValidationCriteriaRule({
    llmClient: {
      async chat(messages) {
        const prompt = messages.map((message) => message.content).join('\n');
        expect(prompt).toContain('<fr_sections>');
        expect(prompt).toContain('FR-01');
        return JSON.stringify({ pass, reasons });
      },
    },
  });
}

const baseSpec = `
# Product Requirements

## 用户人群
销售主管在电脑上审核报价。
## 痛点
表格流转慢且版本错乱。
## 原始需求
我想快速看到待处理报价。
## 用户体验流
打开网页，选择报价，审核并提交。
## 功能需求
`;

describe('FrValidationCriteriaRule', () => {
  it('passes when every FR has end-to-end validation criteria', async () => {
    const artifact = writeSpec(`${baseSpec}
### FR-01 报价审核
- **处理**：展示待审核报价。
#### 用户视角验证准则
陌生用户从 /quotes 打开待审核列表，3 分钟内选择 1 张报价并提交审核，页面显示状态为“已审核”，详情页有 1 条审核记录。
`);
    try {
      const result = await mockRule(true).evaluate([artifact]);
      expect(result.pass).toBe(true);
      expect(result.message).toContain('validation criteria');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when an FR lacks a validation criteria subsection', async () => {
    const artifact = writeSpec(`${baseSpec}
### FR-01 报价审核
- **处理**：展示待审核报价。
`);
    try {
      const result = await mockRule(false, [
        { type: 'missing-validation-criteria', line: 12, detail: 'FR-01 缺少用户视角验证准则子节' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.severity).toBe('blocker');
      expect(result.message).toContain('missing-validation-criteria');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when validation criteria is empty or placeholder content', async () => {
    const artifact = writeSpec(`${baseSpec}
### FR-01 报价审核
#### 用户视角验证准则
TODO
`);
    try {
      const result = await mockRule(false, [
        { type: 'empty-validation-criteria', line: 13, detail: 'FR-01 验证准则为空或占位符' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('empty-validation-criteria');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when LLM judges the criteria as page-level instead of end-to-end', async () => {
    const artifact = writeSpec(`${baseSpec}
### FR-01 报价审核
#### 用户视角验证准则
页面能打开，列表能显示。
`);
    try {
      const result = await mockRule(false, [
        { type: 'page-level-validation', line: 14, detail: 'FR-01 只有页面状态，没有操作者、路径时长和可量化产出' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('page-level-validation');
      expect(result.message).toContain('可量化产出');
    } finally {
      cleanupArtifact(artifact);
    }
  });
});
