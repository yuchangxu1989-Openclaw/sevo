function freezeRequirement(item) {
  return Object.freeze({
    stageId: item.stageId,
    requiredFields: Object.freeze([...item.requiredFields]),
    optionalFields: Object.freeze([...item.optionalFields]),
  });
}

const STAGE_EVIDENCE_REQUIREMENTS = Object.freeze([
  { stageId: 'spec', requiredFields: ['specDocument'], optionalFields: ['acceptanceCriteria', 'openQuestions'] },
  { stageId: 'spec-review-gate', requiredFields: ['findings', 'verdict'], optionalFields: ['reviewers', 'specCoverage'] },
  { stageId: 'test-case-authoring', requiredFields: ['testPlan'], optionalFields: ['testCases', 'coverageNotes'] },
  { stageId: 'ux-acceptance-authoring', requiredFields: ['acceptancePlan'], optionalFields: ['personas', 'journeys'] },
  { stageId: 'commercial-acceptance-authoring', requiredFields: ['commercialCriteria'], optionalFields: ['persona', 'readinessRisks'] },
  { stageId: 'ux-interaction-design', requiredFields: ['designArtifact'], optionalFields: ['wireframes', 'interactionNotes'] },
  { stageId: 'architecture-design', requiredFields: ['architectureDecision'], optionalFields: ['adr', 'arc42Sections'] },
  { stageId: 'contract', requiredFields: ['contractDocument'], optionalFields: ['interfaces', 'invariants'] },
  { stageId: 'contract-review-gate', requiredFields: ['findings', 'verdict'], optionalFields: ['reviewers', 'contractCoverage'] },
  { stageId: 'implement', requiredFields: ['codeChanges', 'testRun'], optionalFields: ['acCoverage', 'changedFiles'] },
  { stageId: 'review', requiredFields: ['findings', 'verdict'], optionalFields: ['severityCounts', 'residualRisks'] },
  { stageId: 'fix', requiredFields: ['codeChanges', 'testRun'], optionalFields: ['fixedFindings', 'changedFiles'] },
  { stageId: 'smoke-test', requiredFields: ['testRun', 'verdict'], optionalFields: ['screenshots', 'logs'] },
  { stageId: 'ux-acceptance', requiredFields: ['walkthrough', 'verdict'], optionalFields: ['screenshots', 'accessibilityNotes'] },
  { stageId: 'pm-commercial-review', requiredFields: ['findings', 'verdict'], optionalFields: ['goToMarketRisks', 'readinessNotes'] },
  { stageId: 'regression', requiredFields: ['testRun', 'verdict'], optionalFields: ['coverageDelta', 'flakyTests'] },
  { stageId: 'publish-generalization-gate', requiredFields: ['findings', 'verdict'], optionalFields: ['generalizationRisks', 'packagingNotes'] },
  { stageId: 'deploy', requiredFields: ['deploymentTarget', 'verdict'], optionalFields: ['releaseUrl', 'rollbackPlan'] },
  { stageId: 'verify', requiredFields: ['verificationResult', 'verdict'], optionalFields: ['evidenceLinks', 'operatorNotes'] },
  { stageId: 'readme', requiredFields: ['documentationChanges'], optionalFields: ['quickstartVerified', 'changedFiles'] },
  { stageId: 'readme-update', requiredFields: ['documentationChanges'], optionalFields: ['quickstartVerified', 'changedFiles'] },
  { stageId: 'post-release-validation', requiredFields: ['validationResult', 'verdict'], optionalFields: ['releaseUrl', 'monitoringNotes'] },
  { stageId: 'clean-install-verification', requiredFields: ['installRun', 'verdict'], optionalFields: ['environment', 'logs'] },
  { stageId: 'ledger', requiredFields: ['ledgerEntry'], optionalFields: ['decisionRecords', 'releaseNotes'] },
].map(freezeRequirement));

const REQUIREMENTS_BY_STAGE = new Map(STAGE_EVIDENCE_REQUIREMENTS.map((item) => [item.stageId, item]));

function hasOwnField(payload, field) {
  if (!payload || typeof payload !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(payload, field)) return true;

  const result = payload.result;
  return !!result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, field);
}

function makeAdvisory(stageId, missing) {
  return {
    type: 'evidence-contract-missing-fields',
    severity: 'advisory',
    stageId,
    missing,
    message: `Completion for stage "${stageId}" is missing required evidence fields: ${missing.join(', ')}`,
  };
}

export const EVIDENCE_REQUIREMENTS = Object.freeze(
  STAGE_EVIDENCE_REQUIREMENTS.map((item) => Object.freeze({
    stageId: item.stageId,
    requiredFields: Object.freeze([...item.requiredFields]),
    optionalFields: Object.freeze([...item.optionalFields]),
  })),
);

export function getEvidenceRequirement(stageId) {
  return REQUIREMENTS_BY_STAGE.get(stageId) || null;
}

export function validateCompletion(stageId, completionPayload) {
  const requirement = getEvidenceRequirement(stageId);
  if (!requirement) {
    return {
      valid: true,
      missing: [],
      advisories: [{
        type: 'evidence-contract-unknown-stage',
        severity: 'advisory',
        stageId,
        message: `No evidence contract is registered for stage "${stageId}".`,
      }],
    };
  }

  const missing = requirement.requiredFields.filter((field) => !hasOwnField(completionPayload, field));
  return {
    valid: missing.length === 0,
    missing,
    advisories: missing.length === 0 ? [] : [makeAdvisory(stageId, missing)],
  };
}
