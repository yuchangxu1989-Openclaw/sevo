import type { GateConclusion } from '../types/index.js';
import type { SpecOutput } from '../stages/spec-types.js';

export type GateSeverity = 'blocker' | 'warning' | 'info';

export interface ReviewFinding {
  ruleId: string;
  severity: GateSeverity;
  message: string;
  field?: string;
}

export interface ReviewRule {
  readonly id: string;
  evaluate(spec: SpecOutput): ReviewFinding[];
}

export interface GateResult {
  conclusion: GateConclusion;
  findings: ReviewFinding[];
  mustFix: ReviewFinding[];
  score: number;
}
