/**
 * sevo doctor — configuration completeness and environment readiness check.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { validateConfig } from '../config.js';
import { validateDispatchMatrix } from '../role-registry/role-task-matcher.js';
import { findConfigFile, loadConfig, CONFIG_FILE } from './helpers.js';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check configuration completeness and environment readiness')
    .option('--json', 'Output as JSON', false)
    .action((opts: { json: boolean }) => {
      const checks: CheckResult[] = [];

      // 1. Config file exists
      const configPath = findConfigFile();
      if (configPath) {
        checks.push({ name: 'config-file', status: 'ok', message: `Found ${CONFIG_FILE} at ${configPath}` });
      } else {
        checks.push({ name: 'config-file', status: 'error', message: `No ${CONFIG_FILE} found. Run "sevo init".` });
      }

      // 2. Config validates
      if (configPath) {
        try {
          const config = loadConfig(configPath);
          const validation = validateConfig(config);
          if (validation.valid) {
            checks.push({ name: 'config-valid', status: 'ok', message: 'Configuration is valid.' });
          } else {
            checks.push({ name: 'config-valid', status: 'error', message: `Invalid config: ${validation.errors.join('; ')}` });
          }
        } catch (err) {
          checks.push({ name: 'config-valid', status: 'error', message: `Config parse error: ${(err as Error).message}` });
        }
      }

      // 3. Required directories
      const root = configPath ? path.dirname(configPath) : process.cwd();
      for (const dir of ['specs', 'contracts', 'artifacts', 'pipelines']) {
        const dirPath = path.join(root, dir);
        if (fs.existsSync(dirPath)) {
          checks.push({ name: `dir-${dir}`, status: 'ok', message: `${dir}/ exists` });
        } else {
          checks.push({ name: `dir-${dir}`, status: 'warn', message: `${dir}/ missing. Run "sevo init" to create.` });
        }
      }

      // 4. Node.js version
      const nodeVersion = process.versions.node;
      const major = parseInt(nodeVersion.split('.')[0]!, 10);
      if (major >= 18) {
        checks.push({ name: 'node-version', status: 'ok', message: `Node.js v${nodeVersion}` });
      } else {
        checks.push({ name: 'node-version', status: 'error', message: `Node.js v${nodeVersion} — requires >=18` });
      }

      // 5. TypeScript available
      try {
        const tscPath = path.join(root, 'node_modules', '.bin', 'tsc');
        if (fs.existsSync(tscPath)) {
          checks.push({ name: 'typescript', status: 'ok', message: 'TypeScript compiler found.' });
        } else {
          checks.push({ name: 'typescript', status: 'warn', message: 'TypeScript compiler not found in node_modules.' });
        }
      } catch {
        checks.push({ name: 'typescript', status: 'warn', message: 'Could not check TypeScript.' });
      }

      // 5b. Vitest available (required by stage 9 regression)
      try {
        const vitestPath = path.join(root, 'node_modules', '.bin', 'vitest');
        if (fs.existsSync(vitestPath)) {
          checks.push({ name: 'vitest', status: 'ok', message: 'vitest binary found in node_modules/.bin.' });
        } else {
          checks.push({
            name: 'vitest',
            status: 'warn',
            message: 'vitest not installed. Stage 9 (regression) will fail. Fix with: npm install --save-dev vitest',
          });
        }
      } catch {
        checks.push({ name: 'vitest', status: 'warn', message: 'Could not check vitest availability.' });
      }

      // 6. Role-task matching validation (AC-22.4/AC-22.9/AC-22.10)
      if (configPath) {
        try {
          const config = loadConfig(configPath);
          const roleAssignment = config.roleAssignment;
          if (roleAssignment?.agentRoles) {
            const agentIds = Object.keys(roleAssignment.agentRoles);
            if (agentIds.length > 0) {
              const strictRoleMatching = config.strictRoleMatching === true;
              const report = validateDispatchMatrix({
                agentIds,
                agentRoles: roleAssignment.agentRoles,
                namingPatterns: roleAssignment.namingPatterns,
                stageRoles: roleAssignment.stageRoles,
                multiAgent: agentIds.length > 1,
                strictRoleMatching,
                fallbackAgentId: roleAssignment.fallbackAgentId ?? agentIds[0],
              });
              const blocked = report.matrix.filter(c => c.decision === 'blocked');
              const degraded = report.matrix.filter(c => c.decision === 'role-degraded');
              const warned = report.matrix.filter(c => c.decision === 'warned');

              if (blocked.length > 0) {
                checks.push({
                  name: 'role-matching',
                  status: 'error',
                  message: `${blocked.length} blocked dispatch(es): ${blocked.map(b => `${b.agentId}→${b.stageId}`).slice(0, 3).join(', ')}. 当前 strictRoleMatching=true，需补齐角色映射或改为 false。`,
                });
              } else if (agentIds.length === 1 || roleAssignment.autoFallback) {
                checks.push({
                  name: 'role-matching',
                  status: 'warn',
                  message: `角色降级模式：${roleAssignment.fallbackAgentId ?? agentIds[0]} 模拟缺失角色，trust-level: low。可补齐 roleAssignment.roles，或设置 strictRoleMatching=true 启用严格模式。`,
                });
              } else if (degraded.length > 0 || warned.length > 0) {
                checks.push({
                  name: 'role-matching',
                  status: 'warn',
                  message: `${degraded.length + warned.length} role warning(s); fallback agent: ${report.fallbackAgentId ?? agentIds[0]}, trust-level: ${report.trustLevel}. 补齐 roleAssignment.roles 可恢复专职角色。`,
                });
              } else {
                checks.push({ name: 'role-matching', status: 'ok', message: `All ${report.coverage.totalStages} stages have matched agents (${report.coverage.stagesWithMatchedAgent}/${report.coverage.totalStages})` });
              }
            }
          }
        } catch { /* role check is best-effort */ }
      }

      // Output
      if (opts.json) {
        console.log(JSON.stringify(checks, null, 2));
      } else {
        const errors = checks.filter((c) => c.status === 'error').length;
        const warns = checks.filter((c) => c.status === 'warn').length;

        for (const check of checks) {
          const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
          console.log(`  ${icon} ${check.name}: ${check.message}`);
        }

        console.log(`\nErrors: ${errors}  Warnings: ${warns}`);
        if (errors > 0) {
          process.exitCode = 1;
        }
      }
    });
}
