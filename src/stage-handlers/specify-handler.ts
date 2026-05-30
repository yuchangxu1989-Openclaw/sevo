/**
 * Stage 1: specify
 *
 * Produces docs/product-requirements.md with the 4 mandatory sections
 * (用户人群 / 痛点 / 原始需求 / UX 流) plus FR list with AC.
 *
 * If LLM is available it generates real prose; otherwise it produces a
 * deterministic structured spec from frDescription so the pipeline still
 * runs end-to-end without network access.
 */

import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import {
  ensureDir,
  makeArtifact,
  nowIso,
  parseLlmJson,
  slugify,
  writeFileEnsure,
} from './utils.js';

interface LlmSpecPayload {
  userSegment?: string;
  painPoints?: string[];
  originalRequirement?: string;
  uxFlow?: string[];
  functionalRequirements?: Array<{
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
  }>;
}

const SPEC_SYSTEM_PROMPT = [
  'You are a senior product manager writing a SEVO-style spec.',
  'Output STRICT JSON, no markdown fences, with these keys:',
  '{',
  '  "userSegment": string,            // who the user is',
  '  "painPoints": string[],           // 3-5 concrete pain points',
  '  "originalRequirement": string,    // the user\'s raw ask, restated',
  '  "uxFlow": string[],               // 3-7 ordered steps the user takes',
  '  "functionalRequirements": [',
  '    {',
  '      "title": string,              // imperative title',
  '      "description": string,        // 1-3 sentences',
  '      "acceptanceCriteria": string[] // 2-5 AC, each verifiable',
  '    }',
  '  ]',
  '}',
  'At least 1 FR, each with at least 1 AC. No empty fields.',
].join('\n');

function buildDeterministicPayload(description: string): LlmSpecPayload {
  const trimmed = (description || 'Unspecified feature').trim();
  return {
    userSegment: '使用 AI Agent 推进研发的独立产品操盘者与 vibe coding 团队',
    painPoints: [
      '需求口头交代后没有结构化文档,Agent 实现偏离意图',
      '阶段产出散落在聊天记录里,没有可审计的工件链路',
      '验收标准模糊,改动是否完成只能凭感觉',
    ],
    originalRequirement: trimmed,
    uxFlow: [
      '用户描述需求',
      'SEVO 流水线生成结构化 spec',
      '通过 spec-review-gate 校验',
      '后续阶段读取 spec 自动推进',
    ],
    functionalRequirements: [
      {
        title: trimmed.slice(0, 80) || 'Feature placeholder',
        description: `按用户描述实现:${trimmed}`,
        acceptanceCriteria: [
          '用户调用对应 CLI 命令时返回 exit 0',
          '产出文件落盘,路径可追溯到本 FR',
          '验收数据可在 ledger 中查到',
        ],
      },
    ],
  };
}

function renderSpecMarkdown(slug: string, payload: LlmSpecPayload, generatedAt: string): string {
  const segment = payload.userSegment?.trim() || '未指定';
  const pains = (payload.painPoints ?? []).filter((p) => p?.trim());
  const original = payload.originalRequirement?.trim() || '未指定';
  const flow = (payload.uxFlow ?? []).filter((s) => s?.trim());
  const frs = payload.functionalRequirements ?? [];

  const lines: string[] = [];
  lines.push(`# ${slug} — 产品需求规格说明书`);
  lines.push('');
  lines.push(`SEVO Pipeline | ${generatedAt}`);
  lines.push('');
  lines.push('## 1. 用户人群');
  lines.push('');
  lines.push(segment);
  lines.push('');
  lines.push('## 2. 痛点');
  lines.push('');
  if (pains.length === 0) {
    lines.push('- (待补充)');
  } else {
    for (const p of pains) lines.push(`- ${p.trim()}`);
  }
  lines.push('');
  lines.push('## 3. 原始需求');
  lines.push('');
  lines.push(original);
  lines.push('');
  lines.push('## 4. UX 流');
  lines.push('');
  if (flow.length === 0) {
    lines.push('1. (待补充)');
  } else {
    flow.forEach((step, i) => lines.push(`${i + 1}. ${step.trim()}`));
  }
  lines.push('');
  lines.push('## 5. 功能需求 (FR)');
  lines.push('');

  if (frs.length === 0) {
    lines.push('### FR-01 占位');
    lines.push('');
    lines.push('待补充');
    lines.push('');
    lines.push('**验收标准**');
    lines.push('- AC-01.1 (待补充)');
  } else {
    frs.forEach((fr, idx) => {
      const id = `FR-${String(idx + 1).padStart(2, '0')}`;
      const title = fr.title?.trim() || `Requirement ${idx + 1}`;
      const desc = fr.description?.trim() || '';
      lines.push(`### ${id} ${title}`);
      lines.push('');
      if (desc) {
        lines.push(desc);
        lines.push('');
      }
      lines.push('**验收标准**');
      const acs = (fr.acceptanceCriteria ?? []).filter((a) => a?.trim());
      if (acs.length === 0) {
        lines.push(`- AC-${idx + 1}.1 (待补充)`);
      } else {
        acs.forEach((ac, ai) => lines.push(`- AC-${idx + 1}.${ai + 1} ${ac.trim()}`));
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

export const specifyHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const generatedAt = nowIso(ctx.now);
  const slug = slugify(ctx.projectSlug);
  const description = ctx.frDescription ?? '';

  let payload: LlmSpecPayload | null = null;
  if (ctx.llm && description.trim().length > 0) {
    try {
      const raw = await ctx.llm.chat([
        { role: 'system', content: SPEC_SYSTEM_PROMPT },
        { role: 'user', content: `Project slug: ${slug}\nRequirement: ${description}` },
      ]);
      payload = parseLlmJson<LlmSpecPayload>(raw);
    } catch {
      payload = null;
    }
  }
  const finalPayload = payload ?? buildDeterministicPayload(description);
  const usedLlm = payload !== null;

  const docsDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(docsDir);

  const specPath = path.join(docsDir, 'product-requirements.md');
  const specMd = renderSpecMarkdown(slug, finalPayload, generatedAt);
  writeFileEnsure(specPath, specMd);

  const jsonPath = path.join(docsDir, 'product-requirements.json');
  const jsonPayload = {
    pipelineId: ctx.pipelineId,
    projectSlug: slug,
    generatedAt,
    usedLlm,
    ...finalPayload,
  };
  writeFileEnsure(jsonPath, JSON.stringify(jsonPayload, null, 2) + '\n');

  const frCount = (finalPayload.functionalRequirements ?? []).length;
  const acCount = (finalPayload.functionalRequirements ?? []).reduce(
    (sum, fr) => sum + (fr.acceptanceCriteria ?? []).filter((a) => a?.trim()).length,
    0,
  );

  return {
    stageId: 'spec',
    verdict: 'pass',
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:spec:markdown`,
        type: 'spec-markdown',
        filePath: specPath,
        createdAt: generatedAt,
        metadata: { frCount, acCount, usedLlm },
      }),
      makeArtifact({
        id: `${ctx.pipelineId}:spec:json`,
        type: 'spec-json',
        filePath: jsonPath,
        createdAt: generatedAt,
        metadata: { frCount, acCount, usedLlm },
      }),
    ],
    summary: `Wrote spec with ${frCount} FR / ${acCount} AC (llm=${usedLlm}).`,
    issues: [],
    metadata: { frCount, acCount, usedLlm, specPath, jsonPath },
  };
};
