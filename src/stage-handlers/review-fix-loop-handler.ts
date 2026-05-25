/**
 * Stage 8: review-fix-loop
 *
 * Reads docs/review-report.json. If it has P0/P1 findings, transforms each
 * into a fix task entry in docs/review-fix-loop.json so the implement
 * stage knows what to address on the next pass. If review was clean, the
 * stage exits as pass with an empty fix queue.
 *
 * The loop counter increments each invocation; max attempts caps the
 * loop and forces verdict=fail when exceeded (so the engine can roll
 * back instead of looping forever).
 */

import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { makeArtifact, nowIso, readJsonIfExists, writeFileEnsure } from './utils.js';

const DEFAULT_MAX_ATTEMPTS = 3;

interface ReviewReport {
  verdict?: 'pass' | 'block' | 'fail';
  findings?: Array<{ severity: string; frId: string; description: string }>;
}

interface FixLoopState {
  pipelineId: string;
  projectSlug: string;
  attempt: number;
  maxAttempts: number;
  lastUpdatedAt: string;
  pendingFixes: Array<{
    severity: string;
    frId: string;
    description: string;
    addedAt: string;
    resolved: boolean;
  }>;
  history: Array<{
    attempt: number;
    timestamp: string;
    findings: number;
    blocking: number;
    verdict: 'pass' | 'block' | 'fail';
  }>;
}

export const reviewFixLoopHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  const reviewReport = readJsonIfExists<ReviewReport>(path.join(docsDir, 'review-report.json'));
  const statePath = path.join(docsDir, 'review-fix-loop.json');
  const previous = readJsonIfExists<FixLoopState>(statePath);

  const findings = reviewReport?.findings ?? [];
  const blocking = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');

  const attempt = (previous?.attempt ?? 0) + 1;
  const maxAttempts = previous?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let verdict: 'pass' | 'block' | 'fail';
  if (blocking.length === 0) {
    verdict = 'pass';
  } else if (attempt > maxAttempts) {
    verdict = 'fail';
  } else {
    verdict = 'block';
  }

  const pendingFixes = blocking.map((f) => ({
    severity: f.severity,
    frId: f.frId,
    description: f.description,
    addedAt: evaluatedAt,
    resolved: false,
  }));

  const history = [
    ...(previous?.history ?? []),
    {
      attempt,
      timestamp: evaluatedAt,
      findings: findings.length,
      blocking: blocking.length,
      verdict,
    },
  ];

  const next: FixLoopState = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    attempt,
    maxAttempts,
    lastUpdatedAt: evaluatedAt,
    pendingFixes,
    history,
  };
  writeFileEnsure(statePath, JSON.stringify(next, null, 2) + '\n');

  const issues =
    verdict === 'fail'
      ? [`Fix loop exceeded ${maxAttempts} attempts; manual intervention required.`]
      : verdict === 'block'
        ? blocking.map((f) => `${f.severity} ${f.frId}: ${f.description}`)
        : [];

  return {
    stageId: 'review-fix-loop' as any,
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:review-fix-loop`,
        type: 'review-fix-loop-state',
        filePath: statePath,
        createdAt: evaluatedAt,
        metadata: { attempt, blocking: blocking.length, verdict },
      }),
    ],
    summary:
      verdict === 'pass'
        ? 'No blocking findings; fix loop closed.'
        : verdict === 'fail'
          ? `Fix loop exhausted (${attempt}/${maxAttempts} attempts).`
          : `Queued ${blocking.length} fix(es); attempt ${attempt}/${maxAttempts}.`,
    issues,
    metadata: { attempt, maxAttempts, blocking: blocking.length, statePath },
  };
};
