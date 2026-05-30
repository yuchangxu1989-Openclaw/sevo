import type { Command } from 'commander';
import * as path from 'node:path';

import { TieredScanOrchestrator } from '../scan/tiered-scan-orchestrator.js';
import { defaultRuntimeChecksForType } from '../scan/default-runtime-checks.js';
import { runCommercializationScan } from '../scan/commercialization-scanners.js';
import { projectRoot } from './helpers.js';

interface ScanOptions {
  level?: '1' | '2' | '3' | 'all';
  spec?: string;
  source?: string;
  output?: string;
  json?: boolean;
  projectType?: 'cli' | 'web' | 'hook' | 'plugin' | 'library';
  command?: string;
  url?: string;
  commercialization?: boolean;
}

export function registerScan(program: Command): void {
  program
    .command('scan')
    .description('Run FR-29 tiered endgame gap scan')
    .option('--level <level>', '1, 2, 3, or all', 'all')
    .option('--spec <path>', 'Spec markdown path', 'docs/product-requirements.md')
    .option('--source <dir>', 'Source directory', 'src')
    .option('--output <path>', 'Summary output path', 'docs/gap-scan-summary.json')
    .option('--project-type <type>', 'Runtime project type for L3', 'cli')
    .option('--command <command>', 'Runtime command for L3 CLI/hook verification')
    .option('--url <url>', 'Runtime URL for L3 web verification')
    .option('--commercialization', 'Run commercialization gate checks (FR-08a)', false)
    .option('--json', 'Print JSON report', false)
    .action(async (opts: ScanOptions) => {
      // AC-08aF.5: Commercialization scan mode
      if (opts.commercialization) {
        const root = projectRoot();
        const report = runCommercializationScan(root);
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          let hasFailure = false;
          for (const [name, result] of Object.entries(report)) {
            const icon = result.status === 'pass' ? '✓' : result.status === 'warning' ? '⚠' : '✗';
            console.log(`  ${icon} ${name}: ${result.status} (${result.items.length} items)`);
            for (const item of result.items.slice(0, 5)) {
              console.log(`      ${item.file}:${item.line} — ${item.message}`);
            }
            if (result.status === 'fail') hasFailure = true;
          }
          if (hasFailure) process.exitCode = 1;
        }
        return;
      }

      try {
        const root = projectRoot();
        const specPath = path.resolve(root, opts.spec ?? 'docs/product-requirements.md');
        const sourceDir = path.resolve(root, opts.source ?? 'src');
        const outputPath = path.resolve(root, opts.output ?? 'docs/gap-scan-summary.json');
        const level = opts.level ?? 'all';
        const docsDir = path.dirname(outputPath);

        const orchestrator = new TieredScanOrchestrator();
        const report = await orchestrator.run({
          outputPath,
          l1: level === '1' || level === 'all' ? {
            specPath,
            sourceDir,
            outputPath: path.join(docsDir, 'gap-scan-l1.json'),
            compileCommand: { command: 'npx tsc --noEmit', cwd: root },
            testCommand: { command: 'npm test', cwd: root },
          } : undefined,
          l2: level === '2' || level === 'all' ? {
            specPath,
            sourceDir,
            outputPath: path.join(docsDir, 'gap-scan-l2.json'),
            logPath: path.join(docsDir, 'gap-scan-l2-log.json'),
          } : undefined,
          l3: level === '3' || level === 'all' ? {
            projectType: opts.projectType ?? 'cli',
            projectRoot: root,
            outputPath: path.join(docsDir, 'gap-scan-l3.json'),
            checks: defaultRuntimeChecksForType(root, opts.projectType ?? 'cli', {
              command: opts.command,
              url: opts.url,
            }),
          } : undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(`Tiered gap scan: ${report.summary.overall.toUpperCase()}`);
          console.log(`Report: ${outputPath}`);
          for (const blocker of report.summary.blockers) console.log(`  - ${blocker}`);
        }

        if (report.summary.overall !== 'pass') process.exitCode = 1;
      } catch (err) {
        console.error(`Tiered gap scan failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}
