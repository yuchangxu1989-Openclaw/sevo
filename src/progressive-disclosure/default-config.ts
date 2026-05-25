/**
 * Default configuration and level-based visibility (AC-15F.3).
 */

export type ConfigLevel = 'basic' | 'advanced' | 'expert';

export interface ConfigKeyMeta {
  key: string;
  level: ConfigLevel;
  description: string;
  defaultValue: unknown;
}

/** Keys visible at each config level (AC-15F.1). */
export const CONFIG_LEVELS: Record<ConfigLevel, string[]> = {
  basic: [
    'projectName',
    'adapter',
    'stages',
    'rules',
    'notification',
    'pdcaCheck',
    'roleAssignment',
    'strictRoleMatching',
  ],
  advanced: [
    'customStages',
    'customGateRules',
    'stageOrder',
    'evaluators',
    'clarification',
    'compliance',
  ],
  expert: [
    'sdk',
    'customAdapter',
    'customExecutor',
    'apiKeys',
    'llm',
    'hooks',
    'isolation',
  ],
};

/** AC-15F.3: Returns all config items with zero-config defaults. */
export function getDefaultConfig(): Record<string, unknown> {
  return {
    projectName: 'my-project',
    adapter: 'standalone',
    stages: [
      'spec',
      'spec-review-gate',
      'contract',
      'contract-review-gate',
      'implement',
      'review',
      'deploy',
      'verify',
      'ledger',
    ],
    rules: [],
    notification: { enabled: false, adapter: 'standalone' },
    pdcaCheck: { enabled: true, cron: '0 6 * * *' },
    roleAssignment: { agentRoles: {}, stageRoles: {} },
    strictRoleMatching: false,
    endgameDelivery: { enabled: false },
    actionLevels: {},
  };
}

export function getKeysForLevel(level: ConfigLevel): string[] {
  if (level === 'expert') {
    return [...CONFIG_LEVELS.basic, ...CONFIG_LEVELS.advanced, ...CONFIG_LEVELS.expert];
  }
  if (level === 'advanced') {
    return [...CONFIG_LEVELS.basic, ...CONFIG_LEVELS.advanced];
  }
  return CONFIG_LEVELS.basic;
}

export function getKeyLevel(key: string): ConfigLevel {
  if (CONFIG_LEVELS.basic.includes(key)) return 'basic';
  if (CONFIG_LEVELS.advanced.includes(key)) return 'advanced';
  return 'expert';
}
