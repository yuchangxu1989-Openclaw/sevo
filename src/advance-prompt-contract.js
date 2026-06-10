import { getEvidenceRequirement } from './evidence-contract.js';
import { formatCheckPlan } from './consistency-check-plan.js';
const ADVANCE_PROMPT_REQUIRED_FIELDS = Object.freeze([
  'nextStage',
  'goal',
  'entryConditions',
  'exitConditions',
  'openAdvisories',
  'evidenceRequired',
  'operationHints',
]);

const DEFAULT_ENTRY_CONDITIONS = Object.freeze([
  'The pipeline run is active.',
  'The next stage is the current dispatch target.',
]);

const DEFAULT_EXIT_CONDITIONS = Object.freeze([
  'Completion reports status and required evidence fields.',
  'Any uncertainty is returned as advisory context instead of pausing the pipeline.',
]);

const STAGE_CONTRACTS = Object.freeze({
  spec: {
    entryConditions: ['Goal and project context are available.'],
    exitConditions: ['Spec artifact exists and acceptance criteria are stated.'],
    operationHints: ['Write or update the spec before implementation work.'],
  },
  'spec-review-gate': {
    entryConditions: ['Spec artifact is available for review.'],
    exitConditions: ['Review findings and verdict are reported.'],
    operationHints: ['Judge spec quality semantically and report advisory gaps without blocking forward progress.'],
  },
  'test-case-authoring': {
    entryConditions: ['Spec acceptance criteria are available.'],
    exitConditions: ['Test plan or test cases are produced.'],
    operationHints: ['Map tests to observable behavior and edge cases.'],
  },
  'ux-acceptance-authoring': {
    entryConditions: ['User-facing scope is known.'],
    exitConditions: ['UX acceptance plan is produced.'],
    operationHints: ['Describe user journeys and acceptance observations for the current scope only.'],
  },
  'commercial-acceptance-authoring': {
    entryConditions: ['Product goal and target user are known.'],
    exitConditions: ['Commercial readiness criteria are produced.'],
    operationHints: ['Capture launch/readiness checks relevant to this pipeline only.'],
  },
  'ux-interaction-design': {
    entryConditions: ['UI scope and user journey are available.'],
    exitConditions: ['Design artifact or interaction notes are produced.'],
    operationHints: ['Keep design decisions tied to the current stage and downstream implementation.'],
  },
  'architecture-design': {
    entryConditions: ['Spec and major constraints are available.'],
    exitConditions: ['Architecture decision or ADR-level artifact is produced.'],
    operationHints: ['Freeze interfaces and invariants needed by implementation.'],
  },
  contract: {
    entryConditions: ['Spec and architecture context are available.'],
    exitConditions: ['Contract artifact states interfaces and invariants.'],
    operationHints: ['Record structural contracts without adding implementation scope.'],
  },
  'contract-review-gate': {
    entryConditions: ['Contract artifact is available for review.'],
    exitConditions: ['Contract findings and verdict are reported.'],
    operationHints: ['Review contract consistency semantically and keep the gate advisory.'],
  },
  implement: {
    entryConditions: ['Spec and current-stage task prompt are available.'],
    exitConditions: ['Code changes and test run evidence are reported.'],
    operationHints: ['Implement only the current stage scope and include the SEVO label in completion.'],
  },
  review: {
    entryConditions: ['Implementation or fix artifacts are available.'],
    exitConditions: ['Findings and PASS/FAIL verdict are reported.'],
    operationHints: ['Use an independent audit perspective; semantic correctness belongs in the review output.'],
  },
  fix: {
    entryConditions: ['Review findings are available.'],
    exitConditions: ['Fix code changes and test run evidence are reported.'],
    operationHints: ['Fix only reported findings and return to review with evidence.'],
  },
  'smoke-test': {
    entryConditions: ['Runnable implementation is available.'],
    exitConditions: ['Smoke test result and verdict are reported.'],
    operationHints: ['Exercise the core user-visible path, not just build plumbing.'],
  },
  'ux-acceptance': {
    entryConditions: ['User-facing build or URL is available.'],
    exitConditions: ['Walkthrough evidence and verdict are reported.'],
    operationHints: ['Use browser evidence when UI exists and attach observations.'],
  },
  'pm-commercial-review': {
    entryConditions: ['Feature behavior and product context are available.'],
    exitConditions: ['Commercial review findings and verdict are reported.'],
    operationHints: ['Assess readiness for an external user without changing technical scope.'],
  },
  regression: {
    entryConditions: ['Changed behavior and relevant tests are known.'],
    exitConditions: ['Regression test run and verdict are reported.'],
    operationHints: ['Run focused regression first, then broader suite when available.'],
  },
  'publish-generalization-gate': {
    entryConditions: ['Release candidate artifacts are available.'],
    exitConditions: ['Generalization findings and verdict are reported.'],
    operationHints: ['Check external-user portability and packaging assumptions.'],
  },
  deploy: {
    entryConditions: ['Release candidate is verified enough to deploy.'],
    exitConditions: ['Deployment target and verdict are reported.'],
    operationHints: ['Use configured release paths and report rollback-relevant details.'],
  },
  verify: {
    entryConditions: ['Deployed or final artifact is available.'],
    exitConditions: ['Verification result and verdict are reported.'],
    operationHints: ['Verify the delivered behavior from the user perspective.'],
  },
  readme: {
    entryConditions: ['Final behavior and setup path are known.'],
    exitConditions: ['Documentation changes are reported.'],
    operationHints: ['Keep docs aligned with actual commands and artifacts.'],
  },
  'readme-update': {
    entryConditions: ['Final behavior and setup path are known.'],
    exitConditions: ['Documentation changes are reported.'],
    operationHints: ['Keep docs aligned with actual commands and artifacts.'],
  },
  'post-release-validation': {
    entryConditions: ['Release or deployed artifact is available.'],
    exitConditions: ['Post-release validation result and verdict are reported.'],
    operationHints: ['Check the released surface, not local assumptions.'],
  },
  'clean-install-verification': {
    entryConditions: ['Install instructions and package/repo state are available.'],
    exitConditions: ['Install run and verdict are reported.'],
    operationHints: ['Validate a clean user path and record environment evidence.'],
  },
  ledger: {
    entryConditions: ['Pipeline outcomes are known.'],
    exitConditions: ['Ledger entry is recorded.'],
    operationHints: ['Summarize decisions and evidence without opening new work.'],
  },
});

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item != null && String(item).trim()).map(String) : [];
}

function normalizeAdvisories(advisories) {
  return list(advisories).length > 0
    ? advisories.filter(Boolean).map((advisory) => {
        if (typeof advisory === 'string') return advisory;
        const severity = advisory.severity || 'advisory';
        const stageId = advisory.stageId || 'unknown';
        const message = advisory.message || advisory.type || 'advisory';
        return `[${severity}] ${stageId}: ${message}`;
      })
    : [];
}

function fieldList(nextStageId, fields) {
  const explicit = list(fields);
  if (explicit.length > 0) return explicit;
  const requirement = getEvidenceRequirement(nextStageId);
  return requirement ? [...requirement.requiredFields] : ['status'];
}

function getStageContract(stageId) {
  return STAGE_CONTRACTS[stageId] || null;
}

function scalar(value) {
  return JSON.stringify(value == null ? '' : String(value));
}

function lineItems(items) {
  if (!items || items.length === 0) return '- none';
  return items.map((item) => `- ${scalar(item)}`).join('\n');
}

export { ADVANCE_PROMPT_REQUIRED_FIELDS };

export function buildAdvancePrompt(run, nextStage, advisories = []) {
  const nextStageId = typeof nextStage === 'string' ? nextStage : nextStage?.nextStageId;
  const stageContract = getStageContract(nextStageId) || {};
  const evidenceRequired = fieldList(nextStageId, nextStage?.evidenceRequired || nextStage?.requiredFields);
  const normalizedAdvisories = normalizeAdvisories(advisories);
  const payload = {
    nextStage: nextStageId || 'unknown',
    goal: run?.goal || '',
    entryConditions: list(stageContract.entryConditions).length > 0 ? list(stageContract.entryConditions) : [...DEFAULT_ENTRY_CONDITIONS],
    exitConditions: list(stageContract.exitConditions).length > 0 ? list(stageContract.exitConditions) : [...DEFAULT_EXIT_CONDITIONS],
    openAdvisories: normalizedAdvisories,
    evidenceRequired,
    operationHints: list(stageContract.operationHints),
  };

  const sections = [
    '[SEVO V2 advance prompt contract]',
    `nextStage: ${scalar(payload.nextStage)}`,
    `goal: ${scalar(payload.goal)}`,
    'entryConditions:',
    lineItems(payload.entryConditions),
    'exitConditions:',
    lineItems(payload.exitConditions),
    'openAdvisories:',
    lineItems(payload.openAdvisories),
    'evidenceRequired:',
    lineItems(payload.evidenceRequired),
    'operationHints:',
    lineItems(payload.operationHints),
  ];

  const checkPlan = formatCheckPlan(nextStageId);
  if (checkPlan) {
    sections.push(checkPlan);
  }

  return sections.join('\n');
}
