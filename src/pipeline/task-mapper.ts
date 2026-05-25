/**
 * Task Mapper — maps pipeline stages to execution roles and timeouts.
 * (spec §FR-06b/06c/06d, arc42 §6.6)
 */

import type { StageId } from '../types/index.js';

export interface StageRoleMapping {
  role: string;
  timeoutSeconds: number;
}

const STAGE_ROLE_MAP: Partial<Record<StageId, StageRoleMapping>> = {
  'spec': { role: 'product', timeoutSeconds: 1800 },
  'spec-review-gate': { role: 'review', timeoutSeconds: 1200 },
  'test-case-authoring': { role: 'review', timeoutSeconds: 1200 },
  'ux-acceptance-authoring': { role: 'ux', timeoutSeconds: 1200 },
  'commercial-acceptance-authoring': { role: 'product', timeoutSeconds: 1200 },
  'contract': { role: 'architect', timeoutSeconds: 1800 },
  'contract-review-gate': { role: 'review', timeoutSeconds: 1200 },
  'implement': { role: 'developer', timeoutSeconds: 3600 },
  'review': { role: 'review', timeoutSeconds: 1200 },
  'smoke-test': { role: 'review', timeoutSeconds: 1200 },
  'ux-acceptance': { role: 'ux', timeoutSeconds: 1200 },
  'pm-commercial-review': { role: 'pm', timeoutSeconds: 1200 },
  'regression': { role: 'developer', timeoutSeconds: 1800 },
  'publish-generalization-gate': { role: 'review', timeoutSeconds: 600 },
  'deploy': { role: 'developer', timeoutSeconds: 1800 },
  'verify': { role: 'review', timeoutSeconds: 1200 },
  'ledger': { role: 'system', timeoutSeconds: 300 },
};

export function getStageRoleMapping(stage: StageId): StageRoleMapping | undefined {
  return STAGE_ROLE_MAP[stage];
}

export function getStageRole(stage: StageId): string | undefined {
  return STAGE_ROLE_MAP[stage]?.role;
}

export function getStageTimeout(stage: StageId): number {
  return STAGE_ROLE_MAP[stage]?.timeoutSeconds ?? 1200;
}
