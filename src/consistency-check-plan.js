/**
 * Consistency Check Plan — six-layer audit checklist.
 *
 * Defines which alignment relationships an audit Agent should verify
 * between layers of the pipeline output. Pure configuration, no semantic judgment.
 */

const LAYERS = Object.freeze([
  'spec',
  'design',
  'implementation',
  'tests',
  'documentation',
  'evidence',
]);

const REVIEW_STAGE_IDS = Object.freeze(new Set([
  'review',
  'spec-review-gate',
  'contract-review-gate',
  'publish-generalization-gate',
  'pm-commercial-review',
]));

const BASE_CHECK_ITEMS = Object.freeze([
  { from: 'spec', to: 'implementation', question: 'Are all acceptance criteria addressed in the implementation?' },
  { from: 'spec', to: 'tests', question: 'Does the test plan cover each stated AC?' },
  { from: 'design', to: 'implementation', question: 'Does the code match the architecture decision and interface contracts?' },
  { from: 'implementation', to: 'tests', question: 'Are the implemented paths exercised by tests (not just stubs)?' },
  { from: 'implementation', to: 'documentation', question: 'Do README/docs reflect the actual commands and behavior?' },
  { from: 'tests', to: 'evidence', question: 'Is there a passing test run artifact as completion evidence?' },
]);

const STAGE_SPECIFIC_ITEMS = Object.freeze({
  'spec-review-gate': [
    { from: 'spec', to: 'design', question: 'Are all spec constraints acknowledged in design decisions?' },
  ],
  'contract-review-gate': [
    { from: 'design', to: 'implementation', question: 'Do interface contracts match the architecture ADR?' },
    { from: 'spec', to: 'design', question: 'Are invariants from the spec preserved in the contract document?' },
  ],
  'review': [
    { from: 'spec', to: 'implementation', question: 'Are all acceptance criteria addressed in the implementation?' },
    { from: 'design', to: 'implementation', question: 'Does the code match the architecture decision and interface contracts?' },
    { from: 'implementation', to: 'tests', question: 'Are the implemented paths exercised by tests (not just stubs)?' },
    { from: 'implementation', to: 'evidence', question: 'Does the completion payload include required evidence fields?' },
  ],
  'publish-generalization-gate': [
    { from: 'implementation', to: 'documentation', question: 'Do README/docs reflect the actual commands and behavior?' },
    { from: 'tests', to: 'evidence', question: 'Is there a passing regression run as completion evidence?' },
    { from: 'spec', to: 'documentation', question: 'Is the user-facing scope described in docs consistent with spec?' },
  ],
  'pm-commercial-review': [
    { from: 'spec', to: 'documentation', question: 'Is the user-facing scope described in docs consistent with spec?' },
    { from: 'spec', to: 'evidence', question: 'Is there UX acceptance evidence aligned with the stated product goal?' },
  ],
});

/**
 * @param {string} stageId
 * @returns {{ layers: string[], checkItems: Array<{ from: string, to: string, question: string }> } | null}
 */
export function getCheckPlan(stageId) {
  if (!REVIEW_STAGE_IDS.has(stageId)) return null;

  const specific = STAGE_SPECIFIC_ITEMS[stageId];
  const checkItems = specific ? [...specific] : [...BASE_CHECK_ITEMS];

  return { layers: [...LAYERS], checkItems };
}

/**
 * Format check plan as text for prompt injection.
 *
 * @param {string} stageId
 * @returns {string}
 */
export function formatCheckPlan(stageId) {
  const plan = getCheckPlan(stageId);
  if (!plan) return '';

  const header = '[Consistency Check Plan]';
  const layerLine = `Layers: ${plan.layers.join(' → ')}`;
  const items = plan.checkItems.map(
    (item, i) => `  ${i + 1}. [${item.from} → ${item.to}] ${item.question}`
  );

  return [header, layerLine, 'Check items:', ...items].join('\n');
}

export { LAYERS, REVIEW_STAGE_IDS };
