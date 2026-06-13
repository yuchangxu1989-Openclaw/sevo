/**
 * Label Protocol - encode/decode SEVO pipeline labels.
 *
 * V2 canonical format: "sevo:<projectSlug>:<pipelineRunId-short>:<stageId>:<attempt>"
 * Legacy format: "sevo:<projectSlug>:<stageId>[:<attempt>]"
 */

const PREFIX = 'sevo:';
const PIPELINE_RUN_ID_SHORT_LENGTH = 8;
const KNOWN_STAGES = new Set([
  'create',
  'spec',
  'spec-review-gate',
  'plan',
  'plan-review-gate',
  'implement',
  'implement-review-gate',
  'regression',
  'deploy',
  'verify',
  'ledger',
  'test-case-authoring',
  'ux-acceptance-authoring',
  'commercial-acceptance-authoring',
  'ux-interaction-design',
  'architecture-design',
  'contract',
  'contract-review-gate',
  'review',
  'fix',
  'smoke-test',
  'ux',
  'ux-acceptance',
  'e2e-verification',
  'pm-commercial-review',
  'publish-generalization-gate',
  'readme',
  'readme-update',
  'from',
]);

function normalizeAttempt(attempt) {
  const parsed = Number.parseInt(String(attempt ?? 1), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pipelineRunIdShort(pipelineRunId) {
  if (!pipelineRunId || typeof pipelineRunId !== 'string') {
    throw new Error(`encode: invalid pipelineRunId: ${pipelineRunId}`);
  }
  return pipelineRunId.slice(0, PIPELINE_RUN_ID_SHORT_LENGTH);
}

function hasWhitespace(value) {
  return /\s/.test(value);
}

/**
 * Encode a V2 SEVO machine label.
 *
 * @param {{ projectSlug: string, pipelineRunId: string, stageId: string, attempt?: number }} input
 * @returns {string} Canonical V2 label.
 */
export function encode({ projectSlug, pipelineRunId, stageId, attempt = 1 }) {
  if (!projectSlug || typeof projectSlug !== 'string') {
    throw new Error(`encode: invalid projectSlug: ${projectSlug}`);
  }
  if (!stageId || typeof stageId !== 'string') {
    throw new Error(`encode: invalid stageId: ${stageId}`);
  }
  return `${PREFIX}${projectSlug}:${pipelineRunIdShort(pipelineRunId)}:${stageId}:${normalizeAttempt(attempt)}`;
}

/**
 * Decode V2 machine labels, legacy machine labels, and documented natural labels.
 *
 * @param {string} label
 * @returns {{ projectSlug: string, pipelineRunId: string | null, pipelineRunIdShort: string | null, stageId: string, attempt: number } | null}
 */
export function decode(label) {
  if (label == null || label === '') return null;

  const normalized = (typeof label === 'string' ? label : String(label)).trim();
  if (!normalized.startsWith(PREFIX)) return null;

  const body = normalized.slice(PREFIX.length).trim();
  const parts = body.split(':');
  if (
    parts.length >= 4 &&
    parts[0] &&
    parts[1] &&
    parts[2] &&
    parts[3] &&
    !hasWhitespace(parts[0]) &&
    !hasWhitespace(parts[1]) &&
    !hasWhitespace(parts[2])
  ) {
    return {
      projectSlug: parts[0],
      pipelineRunId: parts[1],
      pipelineRunIdShort: parts[1],
      stageId: parts[2],
      attempt: normalizeAttempt(parts[3]),
    };
  }

  if (
    parts.length >= 2 &&
    parts[0] &&
    parts[1] &&
    !hasWhitespace(parts[0]) &&
    !hasWhitespace(parts[1])
  ) {
    return {
      projectSlug: parts[0],
      pipelineRunId: null,
      pipelineRunIdShort: null,
      stageId: parts[1],
      attempt: normalizeAttempt(parts[2]),
    };
  }

  const naturalMatch = body.match(/^([a-z0-9][a-z0-9-]*)\s+([a-z0-9][a-z0-9-]*)\b/i);
  if (naturalMatch) {
    const first = naturalMatch[1].toLowerCase();
    const second = naturalMatch[2].toLowerCase();
    if (KNOWN_STAGES.has(first)) {
      return {
        projectSlug: second,
        pipelineRunId: null,
        pipelineRunIdShort: null,
        stageId: first,
        attempt: 1,
      };
    }
  }

  const stageOnlyMatch = body.match(/^([a-z0-9][a-z0-9-]*)\s+/i);
  if (stageOnlyMatch) {
    const candidate = stageOnlyMatch[1].toLowerCase();
    if (KNOWN_STAGES.has(candidate)) {
      return {
        projectSlug: null,
        pipelineRunId: null,
        pipelineRunIdShort: null,
        stageId: candidate,
        attempt: 1,
      };
    }
  }

  return null;
}

/**
 * Check whether a label carries the SEVO prefix.
 *
 * @param {string} label
 * @returns {boolean}
 */
export function isSevoLabel(label) {
  return typeof label === 'string' && label.startsWith(PREFIX);
}
