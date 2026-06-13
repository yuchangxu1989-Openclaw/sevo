/**
 * SEVO Pipeline Plugin — L2 Gateway entry point.
 *
 * A2A bridge model: records state, nudges next stage, routes advisory.
 * Never blocks main agent. Only advisory, no gate.
 *
 * Hooks: subagent_ended, before_prompt_build, command, before_tool_call
 */

import * as runStore from './run-store.js';
import { handleCompletion } from './completion-handler.js';
import { buildInjection } from './prompt-injector.js';
import { handleCommand } from './pipeline-commands.js';
import { append as appendAdvisory, listOpen as listOpenAdvisories } from './advisory-ledger.js';
import { isSevoLabel } from './label-protocol.js';
import { classifyLabel, LABEL_CLASS, buildDispatchContract } from './stage-dispatch-contract.js';
import { buildSpecCoverageAdvisory } from './spec-coverage-check.js';
import { FULL_PIPELINE_STAGES } from './stage-policy.js';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export { ContextInjector, PIPELINE_STAGES } from './context-injection/index.js';

const STALE_AFTER_DAYS = Number(process.env.SEVO_STALE_AFTER_DAYS || 7);
const ARCHIVE_AFTER_STALE_DAYS = Number(process.env.SEVO_ARCHIVE_AFTER_STALE_DAYS || 7);
const MAX_ADVANCES_PER_ROUND = 3;

const pendingAdvances = new Map();
const advanceDepthByRun = new Map();
const spawnRegistry = new Map();

/**
 * Consume a pending advance (one-shot read + delete).
 */
function consumePendingAdvance(pipelineRunId) {
  const advance = pendingAdvances.get(pipelineRunId) || null;
  if (advance) pendingAdvances.delete(pipelineRunId);
  return advance;
}

/**
 * Archive stale pipelines. Called once per prompt build cycle.
 */
function cleanupStalePipelines(logger) {
  if (typeof runStore.archiveStaleRuns !== 'function') return;
  try {
    runStore.archiveStaleRuns({
      staleAfterDays: STALE_AFTER_DAYS,
      archiveAfterStaleDays: ARCHIVE_AFTER_STALE_DAYS,
      logger,
    });
  } catch (err) {
    logger.warn?.('[sevo] stale cleanup failed', { error: err.message });
  }
}

/**
 * Infer project slug from active runs or goal text.
 * Uses run-store state only — no keyword matching for semantic decisions.
 */
function inferProjectFromRuns(goal) {
  if (!goal || typeof goal !== 'string') return null;
  const activeRuns = runStore.listActiveRuns();
  const lower = goal.toLowerCase();
  for (const run of activeRuns) {
    if (run.projectSlug && lower.includes(run.projectSlug.toLowerCase())) {
      return { projectSlug: run.projectSlug, projectRoot: run.projectRoot || `projects/${run.projectSlug}` };
    }
  }
  return null;
}
function resolveRunFromDecoded(decoded) {
  if (!decoded?.projectSlug || !decoded?.pipelineRunIdShort) return null;
  const matches = runStore
    .listActiveRuns(decoded.projectSlug)
    .filter((run) => run.pipelineRunId?.startsWith(decoded.pipelineRunIdShort));
  return matches.length === 1 ? matches[0] : null;
}

function appendSpecCoverageAdvisoryIfNeeded(run, stageId, logger) {
  const advisory = buildSpecCoverageAdvisory(run, stageId);
  if (!advisory) return;
  appendAdvisory(run.pipelineRunId, advisory, { runStore });
  logger.debug('[sevo] before_tool_call: appended spec coverage advisory', {
    pipelineRunId: run.pipelineRunId,
    stageId,
    type: advisory.type,
  });
}

/**
 * Auto-create a pipeline run when a dispatch label is detected.
 * Returns the existing or newly created run, or null.
 */
function autoCreateRunOnDispatch(decoded, taskText, logger) {
  if (!decoded?.projectSlug || !decoded?.stageId) return null;

  const activeRuns = runStore.listActiveRuns(decoded.projectSlug);
  const existing = activeRuns.find(
    (r) => r.status === 'running' && r.currentStageId === decoded.stageId,
  );
  if (existing) return existing;

  const goal = taskText
    ? taskText.slice(0, 200)
    : `auto-dispatch: ${decoded.projectSlug} @ ${decoded.stageId}`;

  const stageIdx = FULL_PIPELINE_STAGES.indexOf(decoded.stageId);
  const ordered = stageIdx >= 0
    ? [...FULL_PIPELINE_STAGES.slice(stageIdx)]
    : [decoded.stageId, 'review'];

  try {
    const run = runStore.createRun({
      projectSlug: decoded.projectSlug,
      projectRoot: `projects/${decoded.projectSlug}`,
      goal,
      entryType: 'auto-dispatch',
      stagePlan: { ordered, skipped: [] },
    });
    logger.info?.('[sevo] auto-created run on dispatch', {
      pipelineRunId: run.pipelineRunId,
      projectSlug: decoded.projectSlug,
      stageId: decoded.stageId,
    });
    return run;
  } catch (err) {
    logger.warn?.('[sevo] auto-create on dispatch failed', { error: err.message });
    return null;
  }
}

/**
 * Register SEVO plugin with OpenClaw Gateway.
 *
 * Spec alignment:
 * - Principle 2: A2A bridge — record, nudge, route. Never gatekeeper.
 * - Principle 3: Never block. Only advisory.
 * - Principle 4: Single 10-stage chain, no skip.
 * - Principle 5: Any entry, continuous nudge to terminal.
 */
export default function sevoPlugin(api) {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const flagFile = resolve(__dir, '..', 'data', 'v2-enabled');
  const enabled = process.env.SEVO_V2_ENABLED === 'true' || existsSync(flagFile);
  if (!enabled) return;

  const logger = api.logger || { debug() {}, info() {}, warn() {}, error() {} };
  logger.info('[sevo] plugin initializing');

  // --- Hook: subagent_spawned ---
  // Cache spawn-time label + metadata for later use in subagent_ended.
  api.on('subagent_spawned', (evt) => {
    try {
      const sessionKey = evt?.childSessionKey;
      const label = evt?.label;
      if (!sessionKey || !isSevoLabel(label)) return;
      logger.info('[sevo] subagent_spawned: caching spawn data', { sessionKey, label });
      spawnRegistry.set(sessionKey, {
        label,
        metadata: evt?.metadata || null,
        agentId: evt?.agentId || null,
        spawnedAt: Date.now(),
      });
      if (spawnRegistry.size > 200) {
        const oldest = spawnRegistry.keys().next().value;
        spawnRegistry.delete(oldest);
      }
    } catch (err) {
      logger.error(`[sevo] subagent_spawned error: ${err.message}`);
    }
  });

  // --- Hook: subagent_ended ---
  // Records completion, computes next-stage advisory, queues advance prompt.
  api.on('subagent_ended', (evt) => {
    try {
      const sessionKey = evt?.targetSessionKey;
      const spawnData = sessionKey ? spawnRegistry.get(sessionKey) : null;
      if (spawnData) spawnRegistry.delete(sessionKey);

      if (!spawnData) {
        logger.debug('[sevo] subagent_ended: no cached spawn data, skipping', { sessionKey });
        return;
      }

      logger.info('[sevo] subagent_ended: processing completion', {
        sessionKey,
        label: spawnData.label,
        outcome: evt?.outcome,
      });

      const enrichedEvt = {
        ...evt,
        label: spawnData.label,
        metadata: spawnData.metadata,
        status: evt?.outcome === 'ok' ? 'passed' : (evt?.outcome || 'failed'),
      };

      const result = handleCompletion(enrichedEvt, {
        runStore,
        advanceDepthByRun,
        maxAdvancesPerRunRound: MAX_ADVANCES_PER_ROUND,
        logger,
        inferProjectSlug: inferProjectFromRuns,
      });

      if (result?.advanceText && result?.runSnapshot?.pipelineRunId) {
        pendingAdvances.set(result.runSnapshot.pipelineRunId, {
          text: result.advanceText,
          nextStageId: result.nextStageId || result.runSnapshot.currentStageId || null,
          advisories: Array.isArray(result.advisories) ? result.advisories : [],
        });
      } else if (result?.advanceText && !result?.runSnapshot) {
        pendingAdvances.set('__guidance__', {
          text: result.advanceText,
          nextStageId: null,
          advisories: Array.isArray(result.advisories) ? result.advisories : [],
        });
      }
    } catch (err) {
      logger.error(`[sevo] subagent_ended error: ${err.message}`);
    }
  });

  // --- Hook: before_prompt_build ---
  // Injects discipline reminder + pipeline status + pending advance.
  // Returns { prependContext: string } per Gateway SDK contract.
  api.on('before_prompt_build', (ctx) => {
    try {
      advanceDepthByRun.clear();
      cleanupStalePipelines(logger);

      const injection = buildInjection(ctx, {
        listActiveRuns: (slug) => runStore.listActiveRuns(slug),
        consumePendingAdvance,
        listOpenAdvisories: (runId) => listOpenAdvisories(runId, { runStore }),
        logger,
      });

      if (!injection?.text) return null;
      return { prependContext: injection.text };
    } catch (err) {
      logger.error(`[sevo] before_prompt_build error: ${err.message}`);
      return null;
    }
  });

  // --- Hook: command ---
  // Handles sevo:<command> from the command channel.
  // Advisory-only: commands record state and return guidance, never block.
  api.on('command', (evt) => {
    try {
      const raw = evt?.text || evt?.command || '';
      if (!raw.startsWith('sevo:')) return undefined;

      const parts = raw.slice(5).split(/\s+/);
      const commandName = parts[0];
      if (!commandName) return undefined;

      const commandArgs = { ...(evt?.args || {}), rawCommand: raw };
      if (!commandArgs.goal && parts.length > 1) {
        commandArgs.goal = parts.slice(1).join(' ');
      }

      return handleCommand(commandName, commandArgs, { runStore, logger });
    } catch (err) {
      logger.error(`[sevo] command error: ${err.message}`);
      return `Internal error: ${err.message}`;
    }
  });

  // --- Hook: before_tool_call ---
  // Auto-creates pipeline run when sessions_spawn carries a sevo label.
  // Enriches metadata with canonical dispatch contract.
  // Advisory-only: never prevents the tool call from proceeding.
  api.on('before_tool_call', (evt) => {
    try {
      const toolName = String(evt?.toolName || '');
      if (toolName !== 'sessions_spawn') return null;

      const params = evt?.params || {};
      const label = String(params.label || '');
      if (!isSevoLabel(label)) return null;

      const { class: labelClass, decoded } = classifyLabel(label);
      if (labelClass === LABEL_CLASS.CANONICAL) {
        const run = resolveRunFromDecoded(decoded);
        if (run) appendSpecCoverageAdvisoryIfNeeded(run, decoded.stageId, logger);
        return null;
      }

      if (!decoded?.stageId) return null;

      const taskText = String(
        params.prompt || params.taskDescription || params.task || params.message || '',
      );

      const identity = {
        ...decoded,
        projectSlug: decoded.projectSlug || inferProjectFromRuns(`${label} ${taskText}`)?.projectSlug,
      };

      if (!identity.projectSlug) return null;

      const run = autoCreateRunOnDispatch(identity, taskText, logger);
      if (!run) return null;

      appendSpecCoverageAdvisoryIfNeeded(run, identity.stageId, logger);
      const canonical = buildDispatchContract({
        projectSlug: run.projectSlug,
        pipelineRunId: run.pipelineRunId,
        stageId: identity.stageId,
        attempt: run.stages?.[identity.stageId]?.attempt || 1,
      });

      return {
        params: {
          ...params,
          metadata: {
            ...(params.metadata || {}),
            sevo: {
              ...canonical.fields,
              pipelineRunIdShort: run.pipelineRunId.slice(0, 8),
              canonicalLabel: canonical.label,
              originalLabel: label,
            },
          },
        },
      };
    } catch (err) {
      logger.error(`[sevo] before_tool_call error: ${err.message}`);
      return null;
    }
  });

  logger.info('[sevo] plugin registered (hooks: subagent_spawned, subagent_ended, before_prompt_build, command, before_tool_call)');
}
