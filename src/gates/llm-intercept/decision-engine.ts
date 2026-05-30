import type { DecisionResult, SevoConfig, SpawnTaskRequest } from './types.js';
import { judgeBylLm } from './llm-judge.js';

const BUILD_COMMANDS = [
  /\bnpm\s+run\s+build\b/,
  /\bnpm\s+run\s+package\b/,
  /\bnpm\s+publish\b/,
  /\bnpx\s+vitest\b/,
  /\bnpx\s+tsc\b/,
  /\bnpx\s+next\s+build\b/,
  /\bnpx\s+webpack\b/,
];

const MANAGED_RD_ACTIONS = [
  /\b(review|audit|publish|release)\b/i,
  /\bproduct-requirements\.md\b/i,
  /\barc42-architecture\.md\b/i,
];

export function labelBypass(label: string | undefined): boolean {
  return !!label && label.startsWith('sevo:');
}

export function deterministicCheck(
  taskText: string,
  managedProjects: string[],
): boolean {
  let matchedManagedProject = false;
  for (const slug of managedProjects) {
    if (taskText.includes(`projects/${slug}/`) || taskText.includes(`projects/${slug}\\`) || taskText.includes(slug)) {
      matchedManagedProject = true;
      if (taskText.includes(`projects/${slug}/`) || taskText.includes(`projects/${slug}\\`)) return true;
    }
  }
  for (const pattern of BUILD_COMMANDS) {
    if (pattern.test(taskText)) return true;
  }
  if (matchedManagedProject) {
    for (const pattern of MANAGED_RD_ACTIONS) {
      if (pattern.test(taskText)) return true;
    }
  }
  return false;
}

export async function decide(
  request: SpawnTaskRequest,
  config: SevoConfig,
): Promise<DecisionResult> {
  if (!request.taskText || request.taskText.trim().length === 0) {
    return { decision: 'fail-closed', step: 'fail-closed', reason: '任务文本为空，fail-closed' };
  }

  if (labelBypass(request.label)) {
    return { decision: 'pass', step: 'label-bypass', reason: '已在 SEVO 流水线内' };
  }

  if (deterministicCheck(request.taskText, config.managedProjects)) {
    return { decision: 'intercept', step: 'deterministic', reason: '命中受管项目路径或构建命令' };
  }

  if (!config.llmProvider) {
    return { decision: 'fail-closed', step: 'fail-closed', reason: 'LLM provider 未配置' };
  }

  try {
    const judgment = await judgeBylLm(request.taskText, config.llmProvider);
    if (judgment.isDev) {
      return { decision: 'intercept', step: 'llm', reason: judgment.reason };
    }
    return { decision: 'pass', step: 'llm', reason: judgment.reason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { decision: 'fail-closed', step: 'fail-closed', reason: `LLM 判断失败: ${msg}` };
  }
}
