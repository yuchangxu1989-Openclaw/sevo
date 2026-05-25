import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ArtifactRef, PipelineState, RuleVerdict, StageId, StageResult, StageTransition } from '../types/index.js';
import type { PipelineEngine } from '../pipeline/pipeline-engine.js';
import type { GateEngine } from '../gate/gate-engine.js';
import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import { STAGE_IDS } from '../constants.js';
import { TieredScanOrchestrator } from '../scan/tiered-scan-orchestrator.js';
import type { AdvanceDecision } from './advance-decision-log.js';
import { appendAdvanceDecision } from './advance-decision-log.js';

export type StageCompletionOutcome = 'passed' | 'failed' | 'timed_out';
export type EngineStageOutcome = 'passed' | 'failed';

export interface StageCompletionEvent {
  pipelineId: string;
  stageId: StageId;
  outcome?: StageCompletionOutcome;
  output?: string;
  artifacts?: ArtifactRef[];
  failureReason?: string;
  sevoOutcome?: StageCompletionOutcome;
}

export interface AdvanceOnCompleteOptions {
  basePath: string;
  engine: PipelineEngine;
  adapter?: SevoHostAdapter | null;
  gateEngine?: GateEngine | null;
  getPipelineState?: (pipelineId: string) => PipelineState | null;
  logDecision?: (decision: AdvanceDecision) => void;
  timeoutMs?: number;
}

export interface AdvanceOnCompleteResult {
  outcome: StageCompletionOutcome;
  transition: StageTransition;
  triggeredStages: StageId[];
  durationMs: number;
  gateVerdict?: RuleVerdict;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

export async function resolveOutcome(
  stageId: StageId,
  payload: StageCompletionEvent,
  gateEngine?: GateEngine | null,
): Promise<{ outcome: StageCompletionOutcome; gateVerdict?: RuleVerdict }> {
  if (payload.sevoOutcome === 'timed_out' || payload.outcome === 'timed_out') {
    return { outcome: 'timed_out' };
  }
  if (payload.sevoOutcome === 'failed' || payload.outcome === 'failed') {
    return { outcome: 'failed' };
  }
  if (stageId.endsWith('-gate') && gateEngine) {
    const verdict = await gateEngine.evaluateGateAsync(stageId, payload.artifacts ?? []);
    return { outcome: verdict.pass ? 'passed' : 'failed', gateVerdict: verdict };
  }
  if (payload.sevoOutcome) return { outcome: payload.sevoOutcome };
  if (payload.outcome) return { outcome: payload.outcome };
  if ((payload.output ?? '').includes('[SEVO:FAILED]')) return { outcome: 'failed' };
  return { outcome: 'passed' };
}

function toEngineOutcome(outcome: StageCompletionOutcome): EngineStageOutcome {
  return outcome === 'passed' ? 'passed' : 'failed';
}

export async function advanceOnComplete(event: StageCompletionEvent, options: AdvanceOnCompleteOptions): Promise<AdvanceOnCompleteResult> {
  const startMs = Date.now();
  const resolved = await withTimeout(
    resolveOutcome(event.stageId, event, options.gateEngine),
    Math.min(options.timeoutMs ?? 10_000, 10_000),
    { outcome: event.outcome ?? event.sevoOutcome ?? 'passed' },
  );

  let engineOutcome = toEngineOutcome(resolved.outcome);

  if (event.stageId === STAGE_IDS.REVIEW && engineOutcome === 'passed') {
    const tieredScanPassed = await runTieredScanBeforeVerify(event, options);
    if (!tieredScanPassed) {
      engineOutcome = 'failed';
      event.failureReason = 'Tiered Scan did not produce explicit pass on all required layers, blocking verify entry';
    }
  }
  const stageResult: StageResult = {
    stageId: event.stageId,
    outcome: engineOutcome,
    artifacts: event.artifacts ?? [],
    failureReason: event.failureReason ?? (resolved.outcome === 'timed_out' ? `${event.stageId} timed out` : undefined),
  };
  const tieredScan = engineOutcome === 'passed' ? getPersistedTieredScan(event, options) : undefined;
  if (tieredScan) {
    for (const artifact of stageResult.artifacts) {
      artifact.metadata = { ...(artifact.metadata ?? {}), tieredScan };
    }
  }

  const transition = options.engine.advance(event.pipelineId, stageResult);
  const state = safeLoadState(options, event.pipelineId);
  if (tieredScan && state) {
    const verifyRecord = state.stages[STAGE_IDS.VERIFY];
    if (verifyRecord) {
      verifyRecord.artifacts = verifyRecord.artifacts.map((artifact) => ({
        ...artifact,
        metadata: { ...(artifact.metadata ?? {}), tieredScan },
      }));
      persistPipelineState(options.basePath, state);
    }
  }
  const triggeredStages = engineOutcome === 'passed'
    ? findActiveStagesToTrigger(state, event.stageId)
    : [];

  const decision: AdvanceDecision = {
    timestamp: new Date().toISOString(),
    pipelineId: event.pipelineId,
    fromStage: event.stageId,
    toStage: transition.toStage,
    verdict: engineOutcome === 'passed' ? 'advance' : 'block',
    reason: engineOutcome === 'passed'
      ? `${event.stageId} passed`
      : (event.failureReason ?? (resolved.outcome === 'timed_out' ? `${event.stageId} timed out` : `${event.stageId} failed`)),
    ...(resolved.gateVerdict ? { gateVerdict: resolved.gateVerdict } : {}),
    durationMs: Date.now() - startMs,
  };
  (options.logDecision ?? ((d) => appendAdvanceDecision(options.basePath, d)))(decision);

  if (options.adapter && engineOutcome === 'passed') {
    await Promise.allSettled(
      triggeredStages.map((stageId) => withTimeout(options.adapter!.triggerStage(event.pipelineId, stageId), 15_000, undefined)),
    );
  }

  return {
    outcome: resolved.outcome,
    transition,
    triggeredStages,
    durationMs: Date.now() - startMs,
    ...(resolved.gateVerdict ? { gateVerdict: resolved.gateVerdict } : {}),
  };
}


async function runTieredScanBeforeVerify(event: StageCompletionEvent, options: AdvanceOnCompleteOptions): Promise<boolean> {
  const state = safeLoadState(options, event.pipelineId);
  if (!state?.requiredStages.includes(STAGE_IDS.VERIFY)) return true;

  const paths = inferTieredScanPaths(options, state);
  if (!paths) return true;

  const timestamp = new Date().toISOString();
  try {
    const report = await new TieredScanOrchestrator().run({
      l1: {
        specPath: paths.specPath,
        sourceDir: paths.sourceDir,
        outputPath: path.join(paths.reportDir, 'auto-tiered-scan-l1.json'),
        writeReport: true,
      },
      l2: {
        specPath: paths.specPath,
        sourceDir: paths.sourceDir,
        outputPath: path.join(paths.reportDir, 'auto-tiered-scan-l2.json'),
        logPath: path.join(paths.reportDir, 'auto-tiered-scan-l2-log.json'),
        writeReport: true,
      },
      outputPath: path.join(paths.reportDir, 'auto-tiered-scan-summary.json'),
    });

    const scanPassed = report.summary.overall === 'pass';
    state.tieredScan = {
      status: scanPassed ? 'passed' : 'failed',
      reportPath: path.join(paths.reportDir, 'auto-tiered-scan-summary.json'),
      summary: report.summary,
      completedAt: timestamp,
    };
    persistPipelineState(options.basePath, state);
    appendPipelineEvent(options.basePath, state.pipelineId, STAGE_IDS.REVIEW, 'tiered_scan_completed', {
      status: state.tieredScan.status,
      reportPath: state.tieredScan.reportPath,
      summary: report.summary,
    });
    return scanPassed;
  } catch (error) {
    state.tieredScan = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      completedAt: timestamp,
    };
    persistPipelineState(options.basePath, state);
    appendPipelineEvent(options.basePath, state.pipelineId, STAGE_IDS.REVIEW, 'tiered_scan_failed', {
      error: state.tieredScan.error,
    });
    return false;
  }
}

function inferTieredScanPaths(options: AdvanceOnCompleteOptions, state: PipelineState): { specPath: string; sourceDir: string; reportDir: string } | null {
  const specArtifact = state.stages[STAGE_IDS.SPEC]?.artifacts.find((artifact) =>
    artifact.type.includes('spec') || /product-requirements|spec/i.test(artifact.path),
  );
  const specPath = specArtifact
    ? (path.isAbsolute(specArtifact.path) ? specArtifact.path : path.join(process.cwd(), specArtifact.path))
    : path.join(process.cwd(), 'docs', 'product-requirements.md');
  if (!fs.existsSync(specPath)) return null;

  const projectRoot = inferProjectRoot(specPath);
  const sourceDir = fs.existsSync(path.join(projectRoot, 'src'))
    ? path.join(projectRoot, 'src')
    : projectRoot;
  const reportDir = path.join(options.basePath, 'pipelines', state.pipelineId, 'scan');
  return { specPath, sourceDir, reportDir };
}

function inferProjectRoot(specPath: string): string {
  let dir = path.dirname(path.resolve(specPath));
  while (path.basename(dir) === 'design' || path.basename(dir) === 'docs' || path.basename(dir) === 'specs') {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function persistPipelineState(basePath: string, state: PipelineState): void {
  state.updatedAt = new Date().toISOString();
  const filePath = path.join(basePath, 'pipelines', state.pipelineId, 'state.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function appendPipelineEvent(
  basePath: string,
  pipelineId: string,
  stage: StageId,
  eventType: 'tiered_scan_completed' | 'tiered_scan_failed',
  payload: Record<string, unknown>,
): void {
  const filePath = path.join(basePath, 'pipelines', pipelineId, 'events.jsonl');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify({ timestamp: new Date().toISOString(), pipelineId, stage, eventType, payload }) + '\n', 'utf8');
}


function getPersistedTieredScan(event: StageCompletionEvent, options: AdvanceOnCompleteOptions): PipelineState['tieredScan'] | undefined {
  if (event.stageId !== STAGE_IDS.REVIEW) return undefined;
  return safeLoadState(options, event.pipelineId)?.tieredScan;
}

function safeLoadState(options: AdvanceOnCompleteOptions, pipelineId: string): PipelineState | null {
  try {
    return options.getPipelineState?.(pipelineId) ?? options.engine.load(pipelineId);
  } catch {
    return null;
  }
}

function findActiveStagesToTrigger(state: PipelineState | null, completedStage: StageId): StageId[] {
  if (!state) return [];
  return state.requiredStages.filter((stageId) => stageId !== completedStage && state.stages[stageId]?.status === 'active');
}
