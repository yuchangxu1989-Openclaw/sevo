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
const MANDATORY_ADVANCE_HEADER = '## SEVO 强制阶段推进指令 — 你必须在本轮执行以下阶段推进动作';
const MAX_INJECTION_CHARS = 2000;
const SEVO_DISCIPLINE_MARKER = '[SEVO_CONTEXT_V1]';
const SEVO_PROMPT_INJECTION_STATE_KEY = Symbol.for('openclaw.sevo.promptInjectionState');

const SPAWN_DISCIPLINE_TEXT = [
  SEVO_DISCIPLINE_MARKER,
  '## SEVO 研发流水线纪律',
  '- 所有研发活动（需求/设计/实现/审计/发布）通过 sevo:<stage> label 进入流水线',
  '- SEVO advance prompt = 用户指令，收到即执行，不二次判断',
  '- 永远向前走：SEVO 只产出 advisory，不阻断主会话行动',
  '- 单一阶段链（10阶段）：spec→spec-review-gate→plan→plan-review-gate→implement→implement-review-gate→regression→deploy→verify→ledger，不跳阶段',
  '- Spec-first：派发前确认 FR/AC 覆盖，缺口作为 advisory 记录',
  '- 一致性闭环：审计偏差→回对应阶段修复→复验通过才继续',
  '- 目标不清时先澄清再行动，用户确认后才收敛',
].join('\n');

function emitMarkerToSharedState(promptBuildId) {
  try {
    if (!globalThis[SEVO_PROMPT_INJECTION_STATE_KEY]) {
      globalThis[SEVO_PROMPT_INJECTION_STATE_KEY] = { promptBuilds: new Map() };
    }
    const state = globalThis[SEVO_PROMPT_INJECTION_STATE_KEY];
    if (!(state.promptBuilds instanceof Map)) {
      state.promptBuilds = new Map();
    }
    const key = String(promptBuildId || `sevo-${Date.now()}`);
    state.promptBuilds.set(key, { marker: SEVO_DISCIPLINE_MARKER, degraded: false, ts: Date.now() });
    if (state.promptBuilds.size > 50) {
      const oldest = state.promptBuilds.keys().next().value;
      state.promptBuilds.delete(oldest);
    }
  } catch { /* best-effort shared state */ }
}

export { SEVO_DISCIPLINE_MARKER, SPAWN_DISCIPLINE_TEXT, emitMarkerToSharedState };

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

/**
 * Format a pending advance into injection text.
 *
 * @param {object} run - PipelineRun snapshot
 * @param {object[]} advisories - Open advisories to include in the advance contract
 * @returns {string}
 */
function formatAdvanceInjection(run, advance, advisories = []) {
  const nextAction = advance.nextAction || run.nextAction || null;
  const nextStageId = advance.nextStageId || nextAction?.nextStageId || 'unknown';
  const dispatch = nextAction?.dispatch || {};
  const attempt = dispatch.attempt || run.stages?.[nextStageId]?.attempt || 1;
  const label = dispatch.label || `sevo:${nextStageId} ${(run.goal || run.projectSlug).slice(0, 30)}`;
  const agentLine = dispatch.agentId
    ? `派发角色/agent: ${dispatch.agentId}`
    : `派发角色/agent: ${dispatch.tier || 'stage mapping'}`;
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)}`;
  const contract = buildAdvancePrompt(run, nextAction || advance, advisories);
  const action = advance.text || `Advance to stage: ${nextStageId}`;
  const mandatory = [
    MANDATORY_ADVANCE_HEADER,
    `下一阶段: ${nextStageId}`,
    agentLine,
    `建议 label: ${label}`,
    `metadata.sevo: { trackingLabel: "${dispatch.label || label}", projectSlug: "${run.projectSlug}", pipelineRunId: "${run.pipelineRunId}", stageId: "${nextStageId}", attempt: ${attempt} }`,
    '必须现在 spawn 对应下一阶段任务；如果当前上下文还有用户消息或其他 completion event，也先执行本推进动作。',
  ].join('\n');
  return [mandatory, header, contract, `Next action: ${action}`].join('\n');
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
  const { label: trackingLabel } = buildDispatchContract({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId,
    attempt,
  });
  const header = `### [${run.projectSlug}] Pipeline ${run.pipelineRunId.slice(0, 8)} — DISPATCH NEEDED`;
  const goal = `Goal: ${(run.goal || '').slice(0, 80)}`;
  const action = [
    `Dispatch stage "${stageId}" (attempt ${attempt}).`,
    `Use a descriptive label starting with "sevo:" + stage + space + brief goal description.`,
    `Example: "sevo:${stageId} ${(run.goal || run.projectSlug).slice(0, 30)}"`,
    `Set metadata.sevo = { trackingLabel: "${trackingLabel}", projectSlug: "${run.projectSlug}", pipelineRunId: "${run.pipelineRunId}", stageId: "${stageId}", attempt: ${attempt} }`,
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
 * @param {function} [deps.getPendingAdvance] - (pipelineRunId) => advance | null
 * @param {function} [deps.listOpenAdvisories] - (runId) => advisory[]
 * @param {object} [deps.logger] - { info, warn, error }
 * @returns {{ text: string, metadata: object } | null}
 */
export function buildInjection(ctx, deps) {
  const { listActiveRuns, getPendingAdvance, listOpenAdvisories, logger } = deps || {};

  const promptBuildId = String(ctx?.runId || ctx?.sessionKey || `sevo-${Date.now()}`);
  emitMarkerToSharedState(promptBuildId);

  if (typeof listActiveRuns !== 'function') {
    if (logger?.warn) logger.warn('prompt-injector: listActiveRuns dependency missing');
    return { text: SPAWN_DISCIPLINE_TEXT, metadata: { runCount: 0, truncated: false, markerEmitted: true } };
  }

  const allRuns = listActiveRuns();
  if (!Array.isArray(allRuns) || allRuns.length === 0) {
    return { text: SPAWN_DISCIPLINE_TEXT, metadata: { runCount: 0, truncated: false, markerEmitted: true } };
  }

  const sortedRuns = allRuns
    .sort((a, b) => {
      const aTime = a.lifecycle?.lastActivityAt || '';
      const bTime = b.lifecycle?.lastActivityAt || '';
      return bTime.localeCompare(aTime);
    });

  const pendingByRunId = new Map();
  const pendingRuns = [];
  const nonPendingRuns = [];
  for (const run of sortedRuns) {
    const advance = typeof getPendingAdvance === 'function'
      ? getPendingAdvance(run.pipelineRunId)
      : null;
    if (advance) {
      pendingByRunId.set(run.pipelineRunId, advance);
      pendingRuns.push(run);
    } else {
      nonPendingRuns.push(run);
    }
  }

  const remainingSlots = Math.max(0, MAX_RUNS_INJECTED - pendingRuns.length);
  const runs = pendingRuns.length > 0
    ? [...pendingRuns, ...nonPendingRuns.slice(0, remainingSlots)]
    : nonPendingRuns.slice(0, MAX_RUNS_INJECTED);

  const pendingSections = [];
  const runSections = [];
  const runsWithPendingAdvance = new Set();

  for (const run of runs) {
    const advance = pendingByRunId.get(run.pipelineRunId) || null;
    const openAdvisories = typeof listOpenAdvisories === 'function'
      ? listOpenAdvisories(run.pipelineRunId)
      : [];
    const completionAdvisories = Array.isArray(advance?.advisories) ? advance.advisories : [];
    const advisories = [...completionAdvisories, ...(Array.isArray(openAdvisories) ? openAdvisories : [])];

    if (advance) {
      pendingSections.push(formatAdvanceInjection(run, advance, advisories));
      runsWithPendingAdvance.add(run.pipelineRunId);
    } else if (needsInitialDispatch(run)) {
      if (isGoalVague(run.goal)) {
        runSections.push(formatClarificationGuidance(run));
      } else {
        runSections.push(formatInitialDispatch(run));
      }
    } else {
      runSections.push(formatStatusReminder(run));
    }
  }

  const sections = pendingSections.length > 0
    ? [...pendingSections, SPAWN_DISCIPLINE_TEXT, ...runSections]
    : [SPAWN_DISCIPLINE_TEXT, ...runSections];

  const routeGuidance = buildRouteGuidance(runs);
  if (routeGuidance) {
    sections.push(routeGuidance);
  }

  if (typeof listOpenAdvisories === 'function') {
    for (const run of runs) {
      if (runsWithPendingAdvance.has(run.pipelineRunId)) continue;
      const advisories = listOpenAdvisories(run.pipelineRunId);
      if (Array.isArray(advisories) && advisories.length > 0) {
        const lines = advisories.map((a) => `  - [${a.severity}] ${a.stageId}: ${a.message} (id: ${a.id})`);
        const handshakeHint = [
          'To acknowledge an advisory, use the command channel (never place handshake payloads in assistant message body):',
          '  sevo:handshake {"advisoryId":"<id>","selectedStage":"<stage>","reason":"<rationale>"}',
        ].join('\n');
        sections.push(`### [${run.projectSlug}] Open Advisories\n${lines.join('\n')}\n${handshakeHint}`);
      }
    }
  }
  // 原则14：协议双向可达 — 每轮注入 label 格式说明
  sections.push(`### SEVO Label 格式（派发任务时使用）
推荐格式: \`sevo:<projectSlug>:<stageId>\`（如 sevo:kivo:implement）
也支持: \`sevo:<stageId> <描述>\`（如 sevo:implement KIVO知识提取优化）
SEVO 会自动识别阶段并推进流水线。`);

  const text = truncateToLimit(sections);
  return { text, metadata: { runCount: runs.length, truncated: text.length >= MAX_INJECTION_CHARS, markerEmitted: true } };
}
