import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ArtifactRef } from '../../types/index.js';
import { FrTraceabilityRule } from '../rules/fr-traceability-rule.js';

function writeSpec(markdown: string): ArtifactRef {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sevo-fr-trace-'));
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
  return new FrTraceabilityRule({
    llmClient: {
      async chat(messages) {
        const prompt = messages.map((message) => message.content).join('\n');
        expect(prompt).toContain('<h2_sections>');
        expect(prompt).toContain('<fr_sections>');
        return JSON.stringify({ pass, reasons });
      },
    },
  });
}

const baseSpec = `
# Product Requirements

## 一线审核者
销售主管在电脑上审核报价。
## 现在的麻烦
表格流转慢且版本错乱，审核经常漏掉。
## 用户原话
我想快速看到待处理报价。
## 完整操作旅程
打开网页，选择报价，审核并提交。
## 功能需求
`;

describe('FrTraceabilityRule', () => {
  it('passes when every FR traces to user, source issue, or flow sources', async () => {
    const artifact = writeSpec(`${baseSpec}
### FR-01 报价审核
让销售主管看到待处理报价并提交审核。
`);
    try {
      const result = await mockRule(true).evaluate([artifact]);
      expect(result.pass).toBe(true);
      expect(result.message).toContain('traceability');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when the source chapters are missing for traceability judgment', async () => {
    const artifact = writeSpec(`
# Product Requirements
## 功能需求
### FR-01 报价审核
让销售主管看到待处理报价并提交审核。
`);
    try {
      const result = await mockRule(false, [
        { type: 'missing-source-chapters', line: 1, detail: '缺少用户人群、痛点或用户体验流来源章节，无法追溯 FR-01' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.severity).toBe('blocker');
      expect(result.message).toContain('missing-source-chapters');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when source content is too empty to support traceability', async () => {
    const artifact = writeSpec(`
# Product Requirements
## 用户人群
TODO
## 痛点
待补
## 原始需求
要更好。
## 用户体验流
打开。
## 功能需求
### FR-01 报价审核
让销售主管看到待处理报价并提交审核。
`);
    try {
      const result = await mockRule(false, [
        { type: 'empty-source-content', line: 3, detail: '来源章节为空或占位，不能支撑 FR-01 的来源追溯' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('empty-source-content');
    } finally {
      cleanupArtifact(artifact);
    }
  });

  it('fails when an FR has no semantic source and is isolated', async () => {
    const artifact = writeSpec(`${baseSpec}
### FR-01 区块链积分商城
提供积分铸造、链上交易和 NFT 徽章。
`);
    try {
      const result = await mockRule(false, [
        { type: 'isolated-fr', line: 12, detail: 'FR-01 与用户人群、痛点和用户体验流没有语义来源关系' },
      ]).evaluate([artifact]);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('isolated-fr');
      expect(result.message).toContain('FR-01');
    } finally {
      cleanupArtifact(artifact);
    }
  });
});
