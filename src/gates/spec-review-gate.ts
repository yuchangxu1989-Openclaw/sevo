import type { GateConclusion } from '../types/index.js';
import type { SpecOutput } from '../stages/spec-types.js';
import type { GateResult, GateSeverity, ReviewFinding, ReviewRule } from './gate-types.js';

const FR_ID_PATTERN = /^FR-\d{2,}$/;
const AC_ID_PATTERN = /^AC-\d+\.\d+$/;

export interface SpecReviewGateOptions {
  rules?: ReviewRule[];
}

export class SpecReviewGate {
  private readonly rules: ReviewRule[];

  constructor(options?: SpecReviewGateOptions) {
    this.rules = options?.rules ?? [];
  }

  evaluate(spec: SpecOutput): GateResult {
    const findings: ReviewFinding[] = [
      ...this.checkRequiredFields(spec),
      ...this.checkFrNumbering(spec),
      ...this.checkAcCoverage(spec),
      ...this.evaluateCustomRules(spec),
    ];

    const mustFix = findings.filter((f) => f.severity === 'blocker');
    const warnings = findings.filter((f) => f.severity === 'warning');
    const total = mustFix.length + warnings.length;
    const score = total === 0 ? 1 : 1 - mustFix.length / Math.max(total, 1);

    let conclusion: GateConclusion;
    if (mustFix.length > 0) {
      conclusion = 'rejected';
    } else if (warnings.length > 0) {
      conclusion = 'conditional';
    } else {
      conclusion = 'passed';
    }

    return { conclusion, findings, mustFix, score };
  }

  private checkRequiredFields(spec: SpecOutput): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    if (!spec.summary || spec.summary.trim() === '') {
      findings.push(finding('required-fields', 'blocker', 'Missing required field: summary', 'summary'));
    }

    if (!spec.functionalRequirements || spec.functionalRequirements.length === 0) {
      findings.push(finding('required-fields', 'blocker', 'No functional requirements defined', 'functionalRequirements'));
    }

    if (!spec.artifact) {
      findings.push(finding('required-fields', 'blocker', 'Missing spec artifact reference', 'artifact'));
    }

    return findings;
  }

  private checkFrNumbering(spec: SpecOutput): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    for (const fr of spec.functionalRequirements) {
      if (!FR_ID_PATTERN.test(fr.id)) {
        findings.push(finding('fr-numbering', 'blocker', `Invalid FR id format: '${fr.id}' (expected FR-XX)`, 'functionalRequirements'));
      }
      if (!fr.title || fr.title.trim() === '') {
        findings.push(finding('fr-numbering', 'warning', `FR ${fr.id} has empty title`, 'functionalRequirements'));
      }
      if (!fr.description || fr.description.trim() === '') {
        findings.push(finding('fr-numbering', 'warning', `FR ${fr.id} has empty description`, 'functionalRequirements'));
      }
    }
    return findings;
  }

  private checkAcCoverage(spec: SpecOutput): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    for (const fr of spec.functionalRequirements) {
      if (!fr.acceptanceCriteria || fr.acceptanceCriteria.length === 0) {
        findings.push(finding('ac-coverage', 'blocker', `FR ${fr.id} has no acceptance criteria`, 'acceptanceCriteria'));
      } else {
        for (const ac of fr.acceptanceCriteria) {
          if (!AC_ID_PATTERN.test(ac.id)) {
            findings.push(finding('ac-coverage', 'warning', `Invalid AC id format: '${ac.id}' (expected AC-N.N)`, 'acceptanceCriteria'));
          }
        }
      }
    }
    return findings;
  }

  private evaluateCustomRules(spec: SpecOutput): ReviewFinding[] {
    return this.rules.flatMap((rule) => rule.evaluate(spec));
  }
}

function finding(ruleId: string, severity: GateSeverity, message: string, field?: string): ReviewFinding {
  return { ruleId, severity, message, field };
}
