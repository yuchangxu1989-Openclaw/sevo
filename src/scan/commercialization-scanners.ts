/**
 * Commercialization gate extended scanners (FR-08a-FIX).
 * Each scanner is independent, accepts projectRoot, returns structured result.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ScannerResult {
  status: 'pass' | 'fail' | 'warning';
  items: Array<{ file: string; line: number; message: string }>;
}

/**
 * AC-08aF.1: Scan for console.log/debug/warn residuals in source.
 */
export function consoleLogScanner(projectRoot: string): ScannerResult {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return { status: 'pass', items: [] };

  const pattern = /\bconsole\.(log|debug|warn)\s*\(/;
  const items = scanTsFiles(srcDir, pattern, (file) => {
    // Exclude test files and explicitly marked production logs
    return !file.includes('__tests__') && !file.includes('.test.') && !file.includes('.spec.');
  });

  return { status: items.length > 0 ? 'fail' : 'pass', items };
}

/**
 * AC-08aF.1: Scan for TODO/FIXME/HACK/XXX residuals.
 */
export function todoFixmeScanner(projectRoot: string): ScannerResult {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return { status: 'pass', items: [] };

  const pattern = /\b(TODO|FIXME|HACK|XXX)\b/;
  const items = scanTsFiles(srcDir, pattern);

  return { status: items.length > 0 ? 'fail' : 'pass', items };
}

/**
 * AC-08aF.1: Check for hardcoded config values (ports, URLs, file paths).
 */
export function configExternalizationChecker(projectRoot: string): ScannerResult {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return { status: 'pass', items: [] };

  const patterns = [
    { regex: /(?:port|PORT)\s*[=:]\s*(\d{4,5})/, msg: 'Hardcoded port number' },
    { regex: /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/, msg: 'Hardcoded localhost URL' },
    { regex: /['"]\/(?:root|home|tmp|var|etc)\/[^'"]+['"]/, msg: 'Hardcoded absolute path' },
  ];

  const items: ScannerResult['items'] = [];
  const files = collectTsFiles(srcDir);

  for (const file of files) {
    if (file.includes('__tests__') || file.includes('.test.')) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const { regex, msg } of patterns) {
        if (regex.test(line)) {
          items.push({ file: path.relative(projectRoot, file), line: i + 1, message: msg });
        }
      }
    }
  }

  return { status: items.length > 0 ? 'warning' : 'pass', items };
}

/**
 * AC-08aF.2: Documentation quality — check public API docs, CHANGELOG, and config docs.
 */
export function documentationQualityChecker(projectRoot: string): ScannerResult {
  const items: ScannerResult['items'] = [];

  const readmePath = path.join(projectRoot, 'README.md');
  const apiDocPath = path.join(projectRoot, 'docs', 'api.md');
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
  const apiDocs = fs.existsSync(apiDocPath) ? fs.readFileSync(apiDocPath, 'utf8') : '';
  const combinedDocs = `${readme}\n${apiDocs}`;

  if (!readme) {
    items.push({ file: 'README.md', line: 0, message: 'README.md missing' });
  }

  const exportedApis = collectPublicApiNames(projectRoot);
  for (const api of exportedApis) {
    if (!combinedDocs.includes(api.name)) {
      items.push({
        file: api.file,
        line: api.line,
        message: `Public API ${api.name} is not documented in README.md or docs/api.md`,
      });
    }
  }

  const changelog = path.join(projectRoot, 'CHANGELOG.md');
  if (!fs.existsSync(changelog)) {
    items.push({ file: 'CHANGELOG.md', line: 0, message: 'CHANGELOG.md missing' });
  } else {
    const content = fs.readFileSync(changelog, 'utf8');
    const latestEntry = content.split(/\n(?=##\s+)/).find((section) => /^##\s+/.test(section));
    if (!latestEntry || latestEntry.replace(/^##[^\n]*\n?/, '').trim().length === 0) {
      items.push({ file: 'CHANGELOG.md', line: 1, message: 'Latest CHANGELOG.md entry is empty' });
    }
  }

  const configDocsPresent = /配置|configuration|environment\s*variables?|环境变量|sevo\.config|sevo\.json/i.test(combinedDocs);
  if (!configDocsPresent) {
    items.push({ file: readme ? 'README.md' : 'docs/api.md', line: 0, message: 'Configuration documentation missing' });
  }

  return { status: items.length > 0 ? 'fail' : 'pass', items };
}

/**
 * AC-08aF.3: Error handling coverage — scan async functions and public entrypoints.
 */
export function errorHandlingCoverageChecker(projectRoot: string): ScannerResult {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return { status: 'pass', items: [] };

  const files = collectTsFiles(srcDir).filter(f => !f.includes('__tests__') && !f.includes('.test.'));
  let totalAsync = 0;
  let coveredAsync = 0;
  const items: ScannerResult['items'] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/\basync\b/.test(line) && /\bfunction\b|=>/.test(line)) {
        totalAsync++;
        const lookahead = lines.slice(i, Math.min(i + 40, lines.length)).join('\n');
        if (/\btry\s*\{|\.\s*catch\s*\(/.test(lookahead)) {
          coveredAsync++;
        } else {
          items.push({
            file: path.relative(projectRoot, file),
            line: i + 1,
            message: 'Async function without visible error handling',
          });
        }
      }

      if (isPublicEntrypoint(file, line)) {
        const lookahead = lines.slice(i, Math.min(i + 80, lines.length)).join('\n');
        if (!/try\s*\{|\.catch\s*\(|process\.exitCode|friendly|用户|message/.test(lookahead)) {
          items.push({
            file: path.relative(projectRoot, file),
            line: i + 1,
            message: 'Public entrypoint without visible top-level friendly error handling',
          });
        }
      }
    }
  }

  const coverage = totalAsync > 0 ? coveredAsync / totalAsync : 1;
  let status: ScannerResult['status'] = 'pass';
  if (coverage < 0.5) status = 'fail';
  else if (coverage < 0.8) status = 'warning';
  else if (items.some((item) => item.message.includes('Public entrypoint'))) status = 'warning';

  if (totalAsync > 0 && coverage < 0.8) {
    items.unshift({
      file: 'src',
      line: 0,
      message: `Async error handling coverage ${Math.round(coverage * 100)}% (${coveredAsync}/${totalAsync}); warning threshold is 80%, fail threshold is 50%`,
    });
  }

  return { status, items: items.slice(0, 30) };
}

/**
 * Run all commercialization scanners and return combined report.
 */
export function runCommercializationScan(projectRoot: string): Record<string, ScannerResult> {
  return {
    'console-log': consoleLogScanner(projectRoot),
    'todo-fixme': todoFixmeScanner(projectRoot),
    'config-externalization': configExternalizationChecker(projectRoot),
    'documentation-quality': documentationQualityChecker(projectRoot),
    'error-handling-coverage': errorHandlingCoverageChecker(projectRoot),
  };
}

// ── Helpers ──

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}


function collectPublicApiNames(projectRoot: string): Array<{ name: string; file: string; line: number }> {
  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const apis: Array<{ name: string; file: string; line: number }> = [];
  const files = collectTsFiles(srcDir).filter((file) => !file.includes('__tests__') && !file.includes('.test.'));
  const exportPattern = /export\s+(?:async\s+)?(?:function|class|interface|type|const)\s+([A-Za-z0-9_]+)/;
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]!.match(exportPattern);
      if (match?.[1]) {
        apis.push({ name: match[1], file: path.relative(projectRoot, file), line: i + 1 });
      }
    }
  }
  return apis;
}

function isPublicEntrypoint(file: string, line: string): boolean {
  const normalized = file.split(path.sep).join('/');
  return (normalized.includes('/cli/cmd-') && /\.action\s*\(/.test(line))
    || (normalized.includes('/hooks/') && /handler|handle|register/.test(line));
}

function scanTsFiles(
  dir: string,
  pattern: RegExp,
  fileFilter?: (file: string) => boolean,
): ScannerResult['items'] {
  const items: ScannerResult['items'] = [];
  const files = collectTsFiles(dir);

  for (const file of files) {
    if (fileFilter && !fileFilter(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i]!)) {
        const relPath = path.relative(path.dirname(dir), file);
        items.push({ file: relPath, line: i + 1, message: lines[i]!.trim().slice(0, 100) });
      }
    }
  }

  return items;
}
