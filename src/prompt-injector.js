/**
 * SEVO V2 prompt-injector — before_prompt_build hook module.
 *
 * Injects pipeline discipline, per-run status/advance summaries, and route guidance
 * into the main conversation prompt each turn.
 *
 * @module prompt-injector
 */

const MAX_RUNS_INJECTED = 3;
const MAX_INJECTION_CHARS = 2000;

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
function formatAdvanceInjection(run, advance) {
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)}`;
  const goal = `Goal: ${(run.goal || '').slice(0, 80)}`;
  const action = advance.text || `Advance to stage: ${advance.nextStageId || 'unknown'}`;
  return [header, goal, `Next action: ${action}`].join('\n');
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
 * @param {function} [deps.logger] - { info, warn, error }
 * @returns {{ text: string, metadata: object } | null}
 */
export function buildInjection(ctx, deps) {
  const { listActiveRuns, consumePendingAdvance, logger } = deps || {};

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

    if (advance) {
      sections.push(formatAdvanceInjection(run, advance));
    } else {
      sections.push(formatStatusReminder(run));
    }
  }

  const routeGuidance = buildRouteGuidance(runs);
  if (routeGuidance) {
    sections.push(routeGuidance);
  }

  const text = truncateToLimit(sections);
  return { text, metadata: { runCount: runs.length, truncated: text.length >= MAX_INJECTION_CHARS } };
}
