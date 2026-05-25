/**
 * sevo config — view/update SEVO configuration with progressive disclosure.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';

import { findConfigFile, loadConfig, printJson } from './helpers.js';
import { getDefaultConfig, getKeysForLevel, getKeyLevel, type ConfigLevel } from '../progressive-disclosure/default-config.js';

export function registerConfig(program: Command): void {
  program
    .command('config')
    .description('View or update SEVO configuration')
    .option('--get <key>', 'Get a specific config value')
    .option('--set <key=value>', 'Set a config value')
    .option('--level <level>', 'Config visibility level: basic, advanced, expert')
    .option('--show-defaults', 'Show all default config values', false)
    .option('--json', 'Output as JSON', false)
    .action((opts: { get?: string; set?: string; level?: string; showDefaults: boolean; json: boolean }) => {
      // AC-15F.4: Show defaults
      if (opts.showDefaults) {
        const defaults = getDefaultConfig();
        printJson(defaults);
        return;
      }

      const configPath = findConfigFile();
      if (!configPath) {
        console.error('No sevo.json found. Run "sevo init" first.');
        process.exitCode = 1;
        return;
      }

      const config = loadConfig(configPath);

      if (opts.get) {
        const value = getNestedValue(config, opts.get);
        if (value === undefined) {
          console.error(`Key "${opts.get}" not found in config.`);
          process.exitCode = 1;
        } else if (opts.json) {
          printJson(value);
        } else {
          console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
        }
        return;
      }

      if (opts.set) {
        const eqIdx = opts.set.indexOf('=');
        if (eqIdx === -1) {
          console.error('Use --set key=value format.');
          process.exitCode = 1;
          return;
        }
        const key = opts.set.slice(0, eqIdx);
        const rawValue = opts.set.slice(eqIdx + 1);

        // AC-15F.5: Warn when setting keys above current level
        const keyLevel = getKeyLevel(key);
        const currentLevel: ConfigLevel = (opts.level as ConfigLevel) || 'basic';
        if (keyLevel !== 'basic' && keyLevel !== currentLevel) {
          console.log(`⚠ "${key}" is a ${keyLevel}-level config key. Use --level ${keyLevel} to view all related options.`);
        }

        let value: unknown;
        try {
          value = JSON.parse(rawValue);
        } catch {
          value = rawValue;
        }

        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        setNestedValue(raw, key, value);
        fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n');
        console.log(`Set ${key} = ${JSON.stringify(value)}`);
        return;
      }

      // AC-15F.1/AC-15F.2: Level-based display
      const level: ConfigLevel = (opts.level as ConfigLevel) || 'basic';
      const visibleKeys = getKeysForLevel(level);
      const filtered: Record<string, unknown> = {};
      const configObj = config as unknown as Record<string, unknown>;
      for (const key of visibleKeys) {
        if (key in configObj) {
          filtered[key] = configObj[key];
        }
      }

      if (opts.json) {
        printJson(filtered);
      } else {
        printJson(filtered);
        if (level === 'basic') {
          console.log('\n使用 --level advanced|expert 查看更多配置项');
        }
      }
    });
}

function getNestedValue(obj: object, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}
