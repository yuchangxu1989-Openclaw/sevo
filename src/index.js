/**
 * SEVO V2 Entry Point — hook registration + module glue.
 *
 * Registers Gateway hooks and wires up V2 pipeline modules.
 * Controlled by SEVO_V2_ENABLED env var (default: false).
 * Coexists with legacy V1 index.js at projects/sevo/index.js.
 *
 * @module sevo-v2
 */

import * as runStore from './run-store.js';
import { handleCompletion } from './completion-handler.js';
import { buildInjection } from './prompt-injector.js';
import { handleCommand } from './pipeline-commands.js';
import { listOpen as listOpenAdvisories } from './advisory-ledger.js';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export { ContextInjector, PIPELINE_STAGES } from './context-injection/index.js';

const MAX_ADVANCES_PER_RUN_ROUND = 3;

function inferProjectSlugFromGoal(goal) {
  if (!goal || typeof goal !== 'string') return null;
  const activeRuns = runStore.listActiveRuns();
  const knownSlugs = [...new Set(activeRuns.map((r) => r.projectSlug).filter(Boolean))];
  for (const slug of knownSlugs) {
    if (goal.toLowerCase().includes(slug.toLowerCase())) {
      const matchedRun = activeRuns.find((r) => r.projectSlug === slug);
      return { projectSlug: slug, projectRoot: matchedRun?.projectRoot || `projects/${slug}` };
    }
  }
  const WORKSPACE_PROJECTS = [
    { slug: 'agentos-site', projectRoot: 'projects/agentos-site', keywords: ['官网', 'agentos-site', 'site'] },
    { slug: 'kivo', projectRoot: 'projects/kivo', keywords: ['kivo', 'KIVO'] },
    { slug: 'sevo', projectRoot: 'projects/sevo', keywords: ['sevo', 'SEVO', '流水线'] },
    { slug: 'aco', projectRoot: 'projects/aco', keywords: ['aco', 'ACO', '插件'] },
    { slug: 'claw-design', projectRoot: 'projects/claw-design', keywords: ['claw-design', 'design', '设计引擎'] },
  ];
  for (const proj of WORKSPACE_PROJECTS) {
    if (proj.keywords.some((kw) => goal.includes(kw))) {
      return { projectSlug: proj.slug, projectRoot: proj.projectRoot };
    }
  }
  return null;
}

/** Ephemeral pending advances — lives only within a single event loop cycle. */
const pendingAdvances = new Map();

/** Per-run advance depth counters — reset each before_prompt_build. */
const advanceDepthByRun = new Map();

/**
 * Consume a pending advance for a given run (one-shot read + delete).
 *
 * @param {string} pipelineRunId
 * @returns {object|null}
 */
function consumePendingAdvance(pipelineRunId) {
  const advance = pendingAdvances.get(pipelineRunId) || null;
  if (advance) pendingAdvances.delete(pipelineRunId);
  return advance;
}

/**
 * Recursive-creation guard: block if a SEVO maintenance run is already active.
 *
 * @param {string} projectSlug
 * @param {object[]} activeRuns
 * @returns {{ blocked: boolean, reason?: string, existingRunId?: string }}
 */
function shouldBlockRecursiveCreate(projectSlug, activeRuns) {
  const existingMaintenance = activeRuns.filter(
    (r) => r.metadata?.maintenanceRun && r.status === 'running',
  );
  if (existingMaintenance.length > 0 && projectSlug === 'sevo') {
    return {
      blocked: true,
      reason: 'maintenance-run-already-active',
      existingRunId: existingMaintenance[0].pipelineRunId,
    };
  }
  return { blocked: false };
}

/**
 * Register SEVO V2 plugin with the OpenClaw Gateway.
 *
 * @param {object} api - Gateway plugin API
 * @param {function} api.on - Hook event registration
 * @param {object} [api.logger] - Gateway logger instance
 */
export default function sevoV2Plugin(api) {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const flagFile = resolve(__dir, '..', 'data', 'v2-enabled');
  const enabled = process.env.SEVO_V2_ENABLED === 'true' || existsSync(flagFile);
  if (!enabled) return;

  const logger = api.logger || {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };

  logger.info('SEVO V2 plugin initializing');

  // --- subagent_ended: completion handling ---
  api.on('subagent_ended', (evt) => {
    try {
      const result = handleCompletion(evt, {
        runStore,
        advanceDepthByRun,
        maxAdvancesPerRunRound: MAX_ADVANCES_PER_RUN_ROUND,
        logger,
        inferProjectSlug: inferProjectSlugFromGoal,
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
      logger.error(`[sevo-v2] subagent_ended hook error: ${err.message}`);
    }
  });

  // --- before_prompt_build: discipline injection + advance delivery ---
  api.on('before_prompt_build', (ctx) => {
    try {
      advanceDepthByRun.clear();

      const injection = buildInjection(ctx, {
        listActiveRuns: (slug) => runStore.listActiveRuns(slug),
        consumePendingAdvance,
        listOpenAdvisories: (runId) => listOpenAdvisories(runId, { runStore }),
        logger,
      });

      return injection;
    } catch (err) {
      logger.error(`[sevo-v2] before_prompt_build hook error: ${err.message}`);
      return null;
    }
  });

  // --- command dispatch: parse sevo:<command> labels ---
  api.on('command', (evt) => {
    try {
      const raw = evt?.text || evt?.command || '';
      if (!raw.startsWith('sevo:')) return undefined;

      const parts = raw.slice(5).split(/\s+/);
      const commandName = parts[0];
      if (!commandName) return undefined;

      const activeRuns = runStore.listActiveRuns();
      const recursionCheck = shouldBlockRecursiveCreate(
        evt?.projectSlug || '',
        activeRuns,
      );
      if (commandName === 'create' && recursionCheck.blocked) {
        return `Blocked: ${recursionCheck.reason} (existing run: ${recursionCheck.existingRunId?.slice(0, 8)})`;
      }

      const commandArgs = {
        ...(evt?.args || {}),
        rawCommand: raw,
      };
      if (!commandArgs.goal && parts.length > 1) {
        commandArgs.goal = parts.slice(1).join(' ');
      }

      return handleCommand(commandName, commandArgs, {
        runStore,
        logger,
      });
    } catch (err) {
      logger.error(`[sevo-v2] command hook error: ${err.message}`);
      return `Internal error: ${err.message}`;
    }
  });

  logger.info('SEVO V2 plugin registered (hooks: subagent_ended, before_prompt_build, command)');
}
