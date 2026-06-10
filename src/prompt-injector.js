/**
 * SEVO V2 prompt-injector — before_prompt_build hook module.
 *
 * Injects pipeline discipline, per-run status/advance summaries, and route guidance
 * into the main conversation prompt each turn.
 *
 * @module prompt-injector
 */

import { buildDispatchContract } from './stage-dispatch-contract.js';
import { buildAdvancePrompt } from './advance-prompt-contract.js';

const MAX_RUNS_INJECTED = 3;
const MAX_INJECTION_CHARS = 2000;

const CHINESE_VERBS = /[实现完成修复添加删除重构优化部署创建配置集成测试验证迁移升级发布构建设计编写开发调整清理]/;
const ENGLISH_VERBS = /\b(implement(ation)?|fix|add|remove|refactor(ing)?|optimiz(e|ation)|deploy(ment)?|creat(e|ion)|configur(e|ation)|integrat(e|ion)|test(ing)?|verif(y|ication)|migrat(e|ion)|upgrade|publish|build|design|writ(e|ing)|develop(ment)?|adjust|clean|update|set up|enable|disable)\b/i;

/**
 * Heuristic: is the goal too vague to dispatch safely?
 */
export function isGoalVague(goal) {
  if (!goal || typeof goal !== 'string') return true;
  const trimmed = goal.trim();
  if (trimmed.length < 12) return true;
  if (trimmed.endsWith('?') || trimmed.endsWith('？')) return true;
  if (!CHINESE_VERBS.test(trimmed) && !ENGLISH_VERBS.test(trimmed)) return true;
  return false;
}

function formatClarificationGuidance(run) {
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)} — 澄清引导`;
  const goal = `Goal: ${(run.goal || '').slice(0, 80)}`;
  const guidance = [
    '[SEVO 澄清引导] 任务目标不够清晰，建议先澄清再派发。',
    '请补充以下信息后重新触发：',
    '  1. 具体要实现/修复/变更的内容是什么？',
    '  2. 验收标准是什么（怎样算完成）？',
    '  3. 影响范围和约束条件？',
  ].join('\n');
  return [header, goal, guidance].join('\n');
}

const PIPELINE_DISCIPLINE_TEXT = [
  '## SEVO Pipeline Discipline',
  '- Spec-first: 需求规格必须在实现前完成并通过评审',
  '- 开发→审计→复验: 每个阶段产出必须经过独立审计后才能 advance',
  '- Advance 权威性: 只有 completion-handler 的 advance 计算才能推进阶段',
  '- 不跳阶段: 按 stagePlan.ordered 顺序执行，不允许跳过未完成阶段',
  '- 单次聚焦: 每轮只处理一个阶段的一个具体任务',
].join('\n');

/**
 * Format a pending advance into injection text.
 *
 * @param {object} run - PipelineRun snapshot
 * @param {object} advance - Pending advance from completion-handler
 * @returns {string}
 */
function formatAdvanceInjection(run, advance, advisories = []) {
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)}`;
  const contract = buildAdvancePrompt(run, advance, advisories);
  const action = advance.text || `Advance to stage: ${advance.nextStageId || 'unknown'}`;
  return [header, contract, `Next action: ${action}`].join('\n');
}

/**
 * Format a static status reminder (no fresh advance pending).
 *
 * @param {object} run - PipelineRun snapshot
 * @returns {string}
 */
function formatStatusReminder(run) {
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)}`;
  const goal = `Goal: ${(run.goal || '').slice(0, 80)}`;
  const stage = `Current stage: ${run.currentStageId || 'unknown'} (${run.status})`;
  return [header, goal, stage].join('\n');
}

/**
 * Format an initial dispatch instruction for a stage that has never been dispatched.
 *
 * @param {object} run - PipelineRun snapshot
 * @returns {string}
 */
function formatInitialDispatch(run) {
  const stageId = run.currentStageId;
  const attempt = run.stages?.[stageId]?.attempt || 1;
  const { label } = buildDispatchContract({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId,
    attempt,
  });
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)} — DISPATCH NEEDED`;
  const goal = `Goal: ${(run.goal || '').slice(0, 80)}`;
  const action = [
    `Dispatch stage "${stageId}" (attempt ${attempt}).`,
    `Label: ${label}`,
    `Use this label when spawning the subagent task for this stage.`,
  ].join('\n');
  return [header, goal, action].join('\n');
}

/**
 * Determine whether a run's current stage needs initial dispatch.
 *
 * @param {object} run
 * @returns {boolean}
 */
function needsInitialDispatch(run) {
  if (!run?.currentStageId || run.status !== 'running') return false;
  const stage = run.stages?.[run.currentStageId];
  return stage?.status === 'active' && !stage.dispatchId;
}

/**
 * Build route guidance text from tracked project paths.
 *
 * @param {object[]} runs - Active PipelineRun snapshots
 * @returns {string}
 */
function buildRouteGuidance(runs) {
  if (runs.length === 0) return '';
  const paths = runs
    .map((r) => r.projectRoot)
    .filter(Boolean);
  const unique = [...new Set(paths)];
  if (unique.length === 0) return '';
  return `## Route Guidance\nTracked paths: ${unique.join(', ')}`;
}

/**
 * Truncate combined injection text to MAX_INJECTION_CHARS,
 * keeping the discipline header and trimming run sections from the end.
 *
 * @param {string[]} sections
 * @returns {string}
 */
function truncateToLimit(sections) {
  let result = sections[0] || '';
  for (let i = 1; i < sections.length; i++) {
    const candidate = result + '\n\n' + sections[i];
    if (candidate.length > MAX_INJECTION_CHARS) break;
    result = candidate;
  }
  return result;
}

/**
 * Build the prompt injection for before_prompt_build hook.
 *
 * @param {object} ctx - Hook context (currently unused, reserved for future routing hints)
 * @param {object} deps - Injected dependencies
 * @param {function} deps.listActiveRuns - () => PipelineRun[] from run-store
 * @param {function} [deps.consumePendingAdvance] - (pipelineRunId) => advance | null
 * @param {function} [deps.listOpenAdvisories] - (runId) => advisory[]
 * @param {function} [deps.logger] - { info, warn, error }
 * @returns {{ text: string, metadata: object } | null}
 */
export function buildInjection(ctx, deps) {
  const { listActiveRuns, consumePendingAdvance, listOpenAdvisories, logger } = deps || {};

  if (typeof listActiveRuns !== 'function') {
    if (logger?.warn) logger.warn('prompt-injector: listActiveRuns dependency missing');
    return null;
  }

  const allRuns = listActiveRuns();
  if (!Array.isArray(allRuns) || allRuns.length === 0) {
    return null;
  }

  const runs = allRuns
    .sort((a, b) => {
      const aTime = a.lifecycle?.lastActivityAt || '';
      const bTime = b.lifecycle?.lastActivityAt || '';
      return bTime.localeCompare(aTime);
    })
    .slice(0, MAX_RUNS_INJECTED);

  const sections = [PIPELINE_DISCIPLINE_TEXT];

  for (const run of runs) {
    const advance = typeof consumePendingAdvance === 'function'
      ? consumePendingAdvance(run.pipelineRunId)
      : null;
    const openAdvisories = typeof listOpenAdvisories === 'function'
      ? listOpenAdvisories(run.pipelineRunId)
      : [];
    const completionAdvisories = Array.isArray(advance?.advisories) ? advance.advisories : [];
    const advisories = [...completionAdvisories, ...(Array.isArray(openAdvisories) ? openAdvisories : [])];

    if (advance) {
      sections.push(formatAdvanceInjection(run, advance, advisories));
    } else if (needsInitialDispatch(run)) {
      if (isGoalVague(run.goal)) {
        sections.push(formatClarificationGuidance(run));
      } else {
        sections.push(formatInitialDispatch(run));
      }
    } else {
      sections.push(formatStatusReminder(run));
    }
  }

  const routeGuidance = buildRouteGuidance(runs);
  if (routeGuidance) {
    sections.push(routeGuidance);
  }

  if (typeof listOpenAdvisories === 'function') {
    for (const run of runs) {
      const advisories = listOpenAdvisories(run.pipelineRunId);
      if (Array.isArray(advisories) && advisories.length > 0) {
        const lines = advisories.map((a) => `  - [${a.severity}] ${a.stageId}: ${a.message}`);
        sections.push(`### [${run.projectSlug}] Open Advisories\n${lines.join('\n')}`);
      }
    }
  }
  const text = truncateToLimit(sections);
  return { text, metadata: { runCount: runs.length, truncated: text.length >= MAX_INJECTION_CHARS } };
}
