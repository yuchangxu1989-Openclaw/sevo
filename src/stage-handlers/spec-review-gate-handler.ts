/**
 * Stage 2: spec-review-gate
 *
 * Scans docs/product-requirements.md (or .json) for the 4 mandatory
 * sections (用户人群 / 痛点 / 原始需求 / UX 流) and verifies FR count >= 1
 * and AC count >= 1. Produces docs/spec-review-gate.json with verdict.
 *
 * Verdict mapping:
 *   pass  — all 4 sections present, >=1 FR, >=1 AC
 *   block — any section missing or counts insufficient
 */

import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import {
  makeArtifact,
  nowIso,
  readJsonIfExists,
  readTextIfExists,
  writeFileEnsure,
} from './utils.js';

interface SpecJsonShape {
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

interface SectionCheck {
  name: string;
  present: boolean;
  evidence: string;
}

const REQUIRED_SECTIONS = [
  { name: 'userSegment', label: '用户人群', headingPatterns: [/##\s*用户人群/, /##\s*\d+\.?\s*用户人群/] },
  { name: 'painPoints', label: '痛点', headingPatterns: [/##\s*痛点/, /##\s*\d+\.?\s*痛点/] },
  {
    name: 'originalRequirement',
    label: '原始需求',
    headingPatterns: [/##\s*原始需求/, /##\s*\d+\.?\s*原始需求/],
  },
  { name: 'uxFlow', label: 'UX 流', headingPatterns: [/##\s*UX\s*流/i, /##\s*\d+\.?\s*UX\s*流/i] },
] as const;

function checkMarkdown(md: string): { sections: SectionCheck[]; frCount: number; acCount: number } {
  const sections: SectionCheck[] = REQUIRED_SECTIONS.map((req) => ({
    name: req.label,
    present: req.headingPatterns.some((re) => re.test(md)),
    evidence: req.label,
  }));

  // FR count: lines like "### FR-01" or "### FR-1"
  const frRegex = /^###\s+FR-\d+/gm;
  const frCount = (md.match(frRegex) ?? []).length;

  // AC count: lines like "- AC-1.1" or "- AC-01.2"
  const acRegex = /^[-*]\s+AC-\d+\.\d+/gm;
  const acCount = (md.match(acRegex) ?? []).length;

  return { sections, frCount, acCount };
}

function checkJson(json: SpecJsonShape): {
  sections: SectionCheck[];
  frCount: number;
  acCount: number;
} {
  const sections: SectionCheck[] = [
    {
      name: '用户人群',
      present: Boolean(json.userSegment && json.userSegment.trim().length > 0),
      evidence: 'userSegment',
    },
    {
      name: '痛点',
      present: Array.isArray(json.painPoints) && json.painPoints.some((p) => p?.trim()),
      evidence: 'painPoints',
    },
    {
      name: '原始需求',
      present:
        Boolean(json.originalRequirement && json.originalRequirement.trim().length > 0),
      evidence: 'originalRequirement',
    },
    {
      name: 'UX 流',
      present: Array.isArray(json.uxFlow) && json.uxFlow.some((s) => s?.trim()),
      evidence: 'uxFlow',
    },
  ];

  const frs = json.functionalRequirements ?? [];
  const frCount = frs.length;
  const acCount = frs.reduce(
    (sum, fr) => sum + (fr.acceptanceCriteria ?? []).filter((a) => a?.trim()).length,
    0,
  );

  return { sections, frCount, acCount };
}

export const specReviewGateHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  const mdPath = path.join(docsDir, 'product-requirements.md');
  const jsonPath = path.join(docsDir, 'product-requirements.json');

  const json = readJsonIfExists<SpecJsonShape>(jsonPath);
  const md = readTextIfExists(mdPath);

  const issues: string[] = [];
  let sections: SectionCheck[];
  let frCount = 0;
  let acCount = 0;

  if (json) {
    const r = checkJson(json);
    sections = r.sections;
    frCount = r.frCount;
    acCount = r.acCount;
  } else if (md) {
    const r = checkMarkdown(md);
    sections = r.sections;
    frCount = r.frCount;
    acCount = r.acCount;
  } else {
    sections = REQUIRED_SECTIONS.map((req) => ({
      name: req.label,
      present: false,
      evidence: 'missing-spec',
    }));
    issues.push(`Spec not found at ${mdPath} or ${jsonPath}`);
  }

  for (const section of sections) {
    if (!section.present) issues.push(`Missing required section: ${section.name}`);
  }
  if (frCount < 1) issues.push('Spec must contain at least 1 FR');
  if (acCount < 1) issues.push('Spec must contain at least 1 AC');

  const verdict = issues.length === 0 ? 'pass' : 'block';

  const reportPath = path.join(docsDir, 'spec-review-gate.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    evaluatedAt,
    verdict,
    sections,
    frCount,
    acCount,
    issues,
    inputs: { mdExists: md !== null, jsonExists: json !== null },
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'spec-review-gate',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:spec-review-gate`,
        type: 'spec-review-gate',
        filePath: reportPath,
        createdAt: evaluatedAt,
        metadata: { verdict, frCount, acCount, missing: issues.length },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Spec review passed: 4/4 sections, ${frCount} FR, ${acCount} AC.`
        : `Spec review needs fix: ${issues.length} issue(s).`,
    issues,
    metadata: { frCount, acCount, sections, reportPath },
  };
};
