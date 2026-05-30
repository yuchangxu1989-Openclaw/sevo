/**
 * Phase 1: Code Map Generation
 *
 * Pure static analysis — no LLM calls.
 * Walks all configured directories, extracts:
 *   - File path (relative to project root)
 *   - Exported function/class/variable names
 *   - First meaningful comment or file header
 *
 * Output is a compact text representation optimized for LLM triage.
 * Typical size: ~100-200 chars per file → 285 files ≈ 40KB ≈ 12K tokens.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CodeMapEntry {
  /** Relative path from project root */
  relativePath: string;
  /** Exported symbols (functions, classes, variables) */
  exports: string[];
  /** First meaningful comment or file description */
  headerComment: string;
  /** File size in bytes */
  size: number;
}

export interface CodeMapOptions {
  /** Project root directory */
  projectRoot: string;
  /** Directories to scan (relative to projectRoot). Defaults to ['.'] (entire project) */
  scanDirs?: string[];
  /** File extensions to include */
  extensions?: string[];
  /** Directory names to ignore */
  ignoreDirs?: string[];
  /** File patterns to ignore (glob-like simple matching) */
  ignoreFiles?: string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sh', '.py'];
const DEFAULT_IGNORE_DIRS = ['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.turbo', '__pycache__'];

export class CodeMapGenerator {
  generate(options: CodeMapOptions): CodeMapEntry[] {
    const {
      projectRoot,
      scanDirs = ['.'],
      extensions = DEFAULT_EXTENSIONS,
      ignoreDirs = DEFAULT_IGNORE_DIRS,
      ignoreFiles = [],
    } = options;

    const extSet = new Set(extensions);
    const ignoreDirSet = new Set(ignoreDirs);
    const entries: CodeMapEntry[] = [];

    for (const scanDir of scanDirs) {
      const absDir = path.resolve(projectRoot, scanDir);
      if (!fs.existsSync(absDir)) continue;
      this.walk(absDir, projectRoot, extSet, ignoreDirSet, ignoreFiles, entries);
    }

    return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  /**
   * Render code map entries as compact text for LLM consumption.
   * Format per file:
   *   ## <relative-path>
   *   exports: fn1, fn2, ClassName
   *   // <header comment>
   */
  renderText(entries: CodeMapEntry[]): string {
    const lines: string[] = [];
    for (const entry of entries) {
      lines.push(`## ${entry.relativePath}`);
      if (entry.exports.length > 0) {
        lines.push(`exports: ${entry.exports.join(', ')}`);
      }
      if (entry.headerComment) {
        lines.push(`// ${entry.headerComment}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  private walk(
    dir: string,
    projectRoot: string,
    extensions: Set<string>,
    ignoreDirs: Set<string>,
    ignoreFiles: string[],
    results: CodeMapEntry[],
  ): void {
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        this.walk(full, projectRoot, extensions, ignoreDirs, ignoreFiles, results);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (!extensions.has(ext)) continue;
      if (ignoreFiles.some((pattern) => entry.name.includes(pattern))) continue;

      const relativePath = path.relative(projectRoot, full).replace(/\\/g, '/');
      const stat = fs.statSync(full);
      const content = this.readHead(full);
      const exports = this.extractExports(content, ext);
      const headerComment = this.extractHeaderComment(content);

      results.push({
        relativePath,
        exports,
        headerComment,
        size: stat.size,
      });
    }
  }

  /** Read first 3000 chars of a file (enough for exports and header) */
  private readHead(filePath: string): string {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(3000);
    const bytesRead = fs.readSync(fd, buf, 0, 3000, 0);
    fs.closeSync(fd);
    return buf.toString('utf8', 0, bytesRead);
  }

  /** Extract exported symbols from file head */
  private extractExports(content: string, ext: string): string[] {
    const exports: string[] = [];

    if (['.sh', '.py'].includes(ext)) {
      // Shell scripts: extract function names
      if (ext === '.sh') {
        const fnMatches = content.matchAll(/^(?:function\s+)?(\w+)\s*\(\)/gm);
        for (const m of fnMatches) {
          if (m[1] && !['main', 'usage', 'help'].includes(m[1])) exports.push(m[1]);
        }
      }
      // Python: extract def/class at module level
      if (ext === '.py') {
        const defMatches = content.matchAll(/^(?:def|class)\s+(\w+)/gm);
        for (const m of defMatches) {
          if (m[1]) exports.push(m[1]);
        }
      }
      return exports.slice(0, 15);
    }

    // TypeScript/JavaScript exports
    const patterns = [
      // export function/class/const/let/var/type/interface/enum
      /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g,
      // export { name1, name2 }
      /export\s*\{([^}]+)\}/g,
      // module.exports = { name1, name2 }
      /module\.exports\s*=\s*\{([^}]+)\}/g,
    ];

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const m of matches) {
        if (pattern.source.includes('{')) {
          // Destructured exports
          const names = (m[1] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/).pop()?.trim() ?? '');
          exports.push(...names.filter((n) => n && /^\w+$/.test(n)));
        } else if (m[1]) {
          exports.push(m[1]);
        }
      }
    }

    return [...new Set(exports)].slice(0, 15);
  }

  /** Extract first meaningful comment from file */
  private extractHeaderComment(content: string): string {
    // Try JSDoc/block comment at top
    const blockMatch = content.match(/^\/\*\*?\s*\n?\s*\*?\s*(.+?)(?:\n|\*\/)/);
    if (blockMatch?.[1]) {
      return blockMatch[1].replace(/^\*\s*/, '').trim().slice(0, 120);
    }

    // Try single-line comments at top (skip shebang)
    const lines = content.split('\n');
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i]?.trim() ?? '';
      if (line.startsWith('#!')) continue;
      if (line.startsWith('//') || line.startsWith('#')) {
        const comment = line.replace(/^\/\/\s*|^#\s*/, '').trim();
        if (comment.length > 5 && !comment.startsWith('eslint') && !comment.startsWith('@ts-')) {
          return comment.slice(0, 120);
        }
      }
    }

    return '';
  }
}
