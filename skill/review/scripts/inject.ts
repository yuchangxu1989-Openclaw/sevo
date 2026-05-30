#!/usr/bin/env tsx

import path from 'node:path';
import { ContextInjector, type PipelineStage } from '../../../src/context-injection/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  projectPath?: string;
};

const SKILL_NAME = 'review' as const;
const MAPPED_STAGE: PipelineStage = 'review';
const EXTRA_CONSTRAINT = 'Stage constraint: validate acceptance criteria against implementation files before passing review.';
const REVIEW_STAGE_REQUIREMENTS = [
  '## Review 阶段强制检查项（spec-code 对齐）',
  '',
  '评审必须包含以下维度，缺任何一个维度 = 评审不完整：',
  '',
  '### 维度 1：AC 逐条覆盖检查（强制，P0）',
  '1. 从 spec 的 product-requirements.md 提取全量 AC 清单',
  '2. 对每条 AC，在代码中找到对应实现（类型定义 + 逻辑代码 + 测试）',
  '3. 产出 AC 覆盖矩阵：AC编号 | 覆盖状态(已实现/部分/未实现) | 对应代码位置',
  '4. 任何 AC 未实现 = blocker，评审结论必须为"不通过"',
  '5. "类型定义存在"不等于"已实现"——必须有逻辑代码和测试',
  '',
  '### 维度 2：代码质量（现有，保留）',
  '- 代码规范、安全性、性能、可维护性',
  '',
  '### 维度 3：需求一致性（现有，增强）',
  '- 实现是否与 spec 描述一致（不只是“能跑”，而是“按 spec 说的方式跑”）',
].join('\n');

export function buildBootstrapInjection(projectPath: string): string {
  const injector = new ContextInjector();
  const resolvedProjectPath = path.resolve(projectPath);
  const injected = injector.buildInjection(resolvedProjectPath, MAPPED_STAGE);

  return [
    '# SEVO bootstrap injection',
    `skill: ${SKILL_NAME}`,
    `mappedStage: ${MAPPED_STAGE}`,
    `projectPath: ${resolvedProjectPath}`,
    EXTRA_CONSTRAINT,
    '',
    REVIEW_STAGE_REQUIREMENTS,
    '',
    injected,
  ].join('\n');
}

export function runBootstrapInjection(argv: string[] = process.argv.slice(2)): string {
  const args = parseArgs(argv);
  const projectPath = path.resolve(args.projectPath ?? '..');
  return buildBootstrapInjection(projectPath);
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project-path') {
      parsed.projectPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return parsed;
}

function printHelp(): void {
  console.log([
    'Usage: npx tsx review/scripts/inject.ts --project-path <project-root>',
    '',
    `Outputs the bootstrap architecture constraints for ${SKILL_NAME}.`,
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    console.log(runBootstrapInjection());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
