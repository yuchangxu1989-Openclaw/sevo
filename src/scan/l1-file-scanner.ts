import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

import type { CommandCheckResult, L1FrCoverageEntry, L1ScanInput, L1ScanReport, ScanCommand } from './types.js';
import { ScanMappingLoader } from './scan-mapping.js';
import { listSourceFiles, parseSpecMarkdown, relativeTo, truncateText, writeJson } from './utils.js';

export class L1FileScanner {
  private readonly scanMappingLoader = new ScanMappingLoader();

  scan(input: L1ScanInput): L1ScanReport {
    const projectRoot = this.inferProjectRoot(input.specPath, input.sourceDir);
    const sourceFiles = listSourceFiles(input.sourceDir);
    const frs = parseSpecMarkdown(input.specPath);
    const compile = this.runCommand(input.compileCommand, projectRoot, 'npx tsc --noEmit');
    const tests = this.runCommand(input.testCommand, projectRoot, 'npm test -- --run');
    const mappedFrFiles = this.scanMappingLoader.load(projectRoot, input.frFileMap);

    const entries: L1FrCoverageEntry[] = frs.map((fr) => {
      const files = this.findFilesForFr(fr.frId, input.sourceDir, sourceFiles, mappedFrFiles);
      const covered = files.length > 0 && compile.passed && tests.passed;
      return {
        frId: fr.frId,
        status: covered ? 'covered' : 'uncovered',
        compilePassed: compile.passed,
        testsPassed: tests.passed,
        evidence: { files },
        reason: covered ? undefined : this.reason(files, compile, tests),
      };
    });

    const report: L1ScanReport = {
      level: 'l1',
      pass: entries.every((entry) => entry.status === 'covered') && compile.passed && tests.passed,
      timestamp: new Date().toISOString(),
      entries,
      compile,
      tests,
    };

    if (input.writeReport !== false && input.outputPath) {
      writeJson(input.outputPath, report);
    }

    return report;
  }

  private findFilesForFr(
    frId: string,
    sourceDir: string,
    sourceFiles: string[],
    frFileMap?: Record<string, string[]>,
  ): string[] {
    const mapped = frFileMap?.[frId] ?? frFileMap?.[frId.toLowerCase()] ?? frFileMap?.[frId.toUpperCase()];
    if (mapped && mapped.length > 0) {
      const sourceRoot = path.resolve(sourceDir);
      const projectRoot = path.dirname(sourceRoot);
      return mapped
        .map((file) => path.isAbsolute(file) ? file : this.resolveMappedFile(file, sourceRoot, projectRoot, sourceFiles))
        .filter((file): file is string => Boolean(file))
        .filter((file) => sourceFiles.includes(file))
        .map((file) => relativeTo(sourceRoot, file));
    }

    const idVariants = Array.from(new Set([
      frId.toLowerCase(),
      frId.toLowerCase().replace(/^fr-/, 'fr-'),
      frId.toLowerCase().replace(/^fr-0*/, 'fr-'),
      frId.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    ]));

    return sourceFiles
      .filter((file) => {
        const rel = relativeTo(sourceDir, file).toLowerCase();
        return idVariants.some((variant) => rel.includes(variant));
      })
      .map((file) => relativeTo(sourceDir, file));
  }

  private resolveMappedFile(file: string, sourceRoot: string, projectRoot: string, sourceFiles: string[]): string | null {
    const fromProjectRoot = path.resolve(projectRoot, file);
    if (sourceFiles.includes(fromProjectRoot)) return fromProjectRoot;

    const fromSourceRoot = path.resolve(sourceRoot, file);
    if (sourceFiles.includes(fromSourceRoot)) return fromSourceRoot;

    return fromProjectRoot.startsWith(`${sourceRoot}${path.sep}`) ? fromProjectRoot : null;
  }

  private inferProjectRoot(specPath: string, sourceDir: string): string {
    const specDir = path.resolve(path.dirname(specPath));
    const sourceRoot = path.resolve(sourceDir);
    const specParts = specDir.split(path.sep).filter(Boolean);
    const sourceParts = sourceRoot.split(path.sep).filter(Boolean);
    const common: string[] = [];

    for (let i = 0; i < Math.min(specParts.length, sourceParts.length); i += 1) {
      if (specParts[i] !== sourceParts[i]) break;
      common.push(specParts[i] as string);
    }

    if (common.length === 0) return path.parse(sourceRoot).root;
    return `${path.parse(sourceRoot).root}${common.join(path.sep)}`;
  }

  private runCommand(command: ScanCommand | undefined, defaultCwd: string, fallback: string): CommandCheckResult {
    const commandLine = command?.command ?? fallback;
    const result = spawnSync(commandLine, {
      cwd: command?.cwd ?? defaultCwd,
      shell: true,
      encoding: 'utf8',
      timeout: command?.timeoutMs ?? 10 * 60 * 1000,
    });

    const exitCode = typeof result.status === 'number' ? result.status : null;
    const output = truncateText(`${result.stdout ?? ''}${result.stderr ?? ''}`, 2000);

    return {
      command: commandLine,
      passed: exitCode === 0 && !result.error,
      exitCode,
      output: result.error ? `${output}\n${result.error.message}`.trim() : output,
    };
  }

  private reason(files: string[], compile: CommandCheckResult, tests: CommandCheckResult): string {
    const reasons: string[] = [];
    if (files.length === 0) reasons.push('no corresponding source file');
    if (!compile.passed) reasons.push('compile command failed');
    if (!tests.passed) reasons.push('test command failed');
    return reasons.join('; ');
  }
}
