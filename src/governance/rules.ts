/**
 * SEVO default governance rules (FR-28).
 *
 * These rules define which task types must go through the SEVO pipeline.
 */

import type { GovernanceRule } from './adapter.js';

/**
 * Default SEVO governance rule set.
 * Matches the spec:
 * - New feature development → sevo:create or sevo fr add
 * - BUG fixes → sevo:from <project> implement
 * - Architecture changes → from contract stage
 * - Requirement changes → from spec stage
 * - Exemptions: doc fixes, config tweaks, hotfixes
 */
export const SEVO_GOVERNANCE_RULES: GovernanceRule[] = [
  {
    id: 'sevo:new-feature-requires-pipeline',
    description: 'New feature development tasks must go through SEVO pipeline creation.',
    taskTypes: ['code', 'feature', 'implement'],
    action: 'block',
    message: 'New feature tasks require a SEVO pipeline. Use "sevo create <project>" or "sevo fr add <project> <description>" first.',
    exemptions: [
      {
        id: 'sevo-label',
        reason: 'Task already has a SEVO pipeline label',
        type: 'label',
        value: 'sevo:*',
      },
      {
        id: 'hotfix',
        reason: 'Emergency hotfix — will be retroactively recorded',
        type: 'flag',
        value: '--hotfix',
      },
      {
        id: 'doc-only',
        reason: 'Pure documentation change (non-spec .md files)',
        type: 'file-pattern',
        value: '*.md',
      },
      {
        id: 'config-tweak',
        reason: 'Single-line configuration change',
        type: 'label',
        value: 'config-tweak',
      },
    ],
  },
  {
    id: 'sevo:bug-fix-requires-pipeline',
    description: 'BUG fix tasks must enter SEVO from the implement stage or higher.',
    taskTypes: ['bugfix', 'fix', 'hotfix'],
    action: 'block',
    message: 'BUG fixes require a SEVO pipeline. Use "sevo from <project> implement" to create one.',
    exemptions: [
      {
        id: 'sevo-label',
        reason: 'Task already has a SEVO pipeline label',
        type: 'label',
        value: 'sevo:*',
      },
      {
        id: 'hotfix',
        reason: 'Emergency hotfix — will be retroactively recorded',
        type: 'flag',
        value: '--hotfix',
      },
    ],
  },
  {
    id: 'sevo:architecture-requires-contract',
    description: 'Architecture changes must start from the contract stage.',
    taskTypes: ['architecture', 'contract', 'design'],
    action: 'block',
    message: 'Architecture changes must go through SEVO contract stage. Use "sevo from <project> contract".',
    exemptions: [
      {
        id: 'sevo-label',
        reason: 'Task already has a SEVO pipeline label',
        type: 'label',
        value: 'sevo:*',
      },
    ],
  },
  {
    id: 'sevo:requirement-requires-spec',
    description: 'Requirement changes must start from the spec stage.',
    taskTypes: ['spec', 'requirement', 'ac'],
    action: 'block',
    message: 'Requirement changes must go through SEVO spec stage. Use "sevo from <project> spec".',
    exemptions: [
      {
        id: 'sevo-label',
        reason: 'Task already has a SEVO pipeline label',
        type: 'label',
        value: 'sevo:*',
      },
    ],
  },
];
