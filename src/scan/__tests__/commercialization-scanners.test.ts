import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  configExternalizationChecker,
  consoleLogScanner,
  documentationQualityChecker,
  errorHandlingCoverageChecker,
  todoFixmeScanner,
} from '../commercialization-scanners.js';

function createProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'sevo-commercialization-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  return root;
}

describe('commercialization scanners', () => {
  it('fails console log and TODO/FIXME residuals with file and line items', () => {
    const root = createProject();
    writeFileSync(join(root, 'src', 'index.ts'), [
      'export function run() {',
      '  console.log("debug");',
      '  // TODO: remove temporary branch',
      '}',
    ].join('\n'));

    const consoleResult = consoleLogScanner(root);
    const todoResult = todoFixmeScanner(root);

    expect(consoleResult.status).toBe('fail');
    expect(consoleResult.items[0]).toMatchObject({ file: 'src/index.ts', line: 2 });
    expect(todoResult.status).toBe('fail');
    expect(todoResult.items[0]).toMatchObject({ file: 'src/index.ts', line: 3 });
  });

  it('warns for hardcoded config values', () => {
    const root = createProject();
    writeFileSync(join(root, 'src', 'server.ts'), 'const callbackUrl = "http://localhost:3000/callback";\nconst rootPath = "/tmp/demo";\n');

    const result = configExternalizationChecker(root);

    expect(result.status).toBe('warning');
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });

  it('checks changelog, public API documentation, and config docs', () => {
    const root = createProject();
    writeFileSync(join(root, 'src', 'index.ts'), 'export function publicApi() { return true; }\n');
    writeFileSync(join(root, 'README.md'), '# Demo\n\n## Configuration\nUse sevo.json.\n');
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n- Initial release.\n');

    const result = documentationQualityChecker(root);

    expect(result.status).toBe('fail');
    expect(result.items.some((item) => item.message.includes('publicApi'))).toBe(true);
  });

  it('reports warning or fail when async error handling coverage is low', () => {
    const root = createProject();
    writeFileSync(join(root, 'src', 'async.ts'), [
      'export async function unsafe() {',
      '  return fetch("http://example.com");',
      '}',
    ].join('\n'));

    const result = errorHandlingCoverageChecker(root);

    expect(result.status).toBe('fail');
    expect(result.items[0]?.message).toContain('coverage');
  });
});
