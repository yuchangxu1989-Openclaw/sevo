/**
 * CLI helpers unit tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findConfigFile, loadConfig, formatDate, CONFIG_FILE } from '../helpers.js';
import { mergeConfig } from '../../config.js';

describe('findConfigFile', () => {
  const tmpDir = path.join('/tmp', `sevo-test-${Date.now()}`);
  const nestedDir = path.join(tmpDir, 'a', 'b', 'c');

  beforeEach(() => {
    fs.mkdirSync(nestedDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no config exists', () => {
    expect(findConfigFile(nestedDir)).toBeNull();
  });

  it('finds config in the given directory', () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    fs.writeFileSync(configPath, '{}');
    expect(findConfigFile(tmpDir)).toBe(configPath);
  });

  it('walks up to find config in parent', () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    fs.writeFileSync(configPath, '{}');
    const found = findConfigFile(nestedDir);
    expect(found).toBe(configPath);
  });
});

describe('loadConfig', () => {
  const tmpDir = path.join('/tmp', `sevo-load-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws when config file does not exist', () => {
    expect(() => loadConfig('/nonexistent/sevo.json')).toThrow();
  });

  it('loads and merges config from file', () => {
    const configPath = path.join(tmpDir, CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify({ projectName: 'test-proj' }));
    const config = loadConfig(configPath);
    expect(config.projectName).toBe('test-proj');
    expect(config.adapter).toBe('standalone'); // default
  });
});

describe('formatDate', () => {
  it('formats a valid ISO date', () => {
    const result = formatDate('2026-01-01T00:00:00.000Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns the input for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('Invalid Date');
  });
});
