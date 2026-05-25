/**
 * sevo verify --clean-install — run FR-28 clean install verification.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CleanInstallVerificationStage } from '../stages/clean-install-verification-stage.js';
import { loadCleanInstallConfig } from '../stages/clean-install-default-checks.js';
import { findConfigFile, projectRoot } from './helpers.js';


interface PackageJson {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
  sevo?: unknown;
}

interface VerifyOptions {
  cleanInstall?: boolean;
  package?: string;
  packageVersion?: string;
  bin?: string;
  json?: boolean;
}

export function registerVerify(program: Command): void {
  program
    .command('verify')
    .description('Run SEVO verification checks')
    .option('--clean-install', 'Run FR-28 clean-install verification', false)
    .option('--package <name>', 'Published npm package name')
    .option('--package-version <version>', 'Published npm package version')
    .option('--bin <name>', 'CLI binary name')
    .option('--json', 'Output JSON report', false)
    .action(async (opts: VerifyOptions) => {
      if (!opts.cleanInstall) {
        console.error('No verification selected. Use --clean-install.');
        process.exitCode = 1;
        return;
      }

      try {
        const root = resolveVerificationRoot();
        const pkg = loadPackageJson(root);
        const config = loadCleanInstallConfig(root);
        const packageName = opts.package ?? pkg.name;
        const version = opts.packageVersion ?? pkg.version;
        const cliBin = opts.bin ?? inferCliBin(pkg);

        if (!packageName) throw new Error('Package name is required. Set package.json name or pass --package.');
        if (!version) throw new Error('Package version is required. Set package.json version or pass --package-version.');
        if (!cliBin) throw new Error('CLI bin is required. Set package.json bin or pass --bin.');

        const stage = new CleanInstallVerificationStage();
        const output = await stage.execute({
          taskId: 'clean-install-cli',
          pipelineId: 'clean-install-cli',
          projectSlug: packageName,
          packageName,
          version,
          cliBin,
          projectRoot: root,
          l2Checks: config.l2,
          l3Checks: config.l3,
        });

        if (opts.json) {
          console.log(JSON.stringify(output.report, null, 2));
        } else {
          console.log(`Clean-install verification: ${output.report.overall.toUpperCase()}`);
          console.log(`Report: ${output.artifact.path}`);
          if (output.report.failedChecks.length > 0) {
            console.log(`Failed checks: ${output.report.failedChecks.length}`);
            for (const check of output.report.failedChecks) {
              console.log(`  - ${check.layer}/${check.checkId}: ${check.description}`);
            }
          }
        }

        if (!output.canComplete) process.exitCode = 1;
      } catch (err) {
        console.error(`Clean-install verification failed: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    });
}

function resolveVerificationRoot(): string {
  const configPath = findConfigFile();
  if (configPath) return projectRoot(configPath);

  const packageRoot = findPackageRootFromModule();
  if (packageRoot) return packageRoot;

  return process.cwd();
}

function findPackageRootFromModule(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.parse(dir).root;
  while (dir !== root) {
    const packagePath = path.join(dir, 'package.json');
    if (fs.existsSync(packagePath)) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function loadPackageJson(root: string): PackageJson {
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) return {};
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageJson;
}


function inferCliBin(pkg: PackageJson): string | undefined {
  if (typeof pkg.bin === 'string') return pkg.name;
  if (pkg.bin && typeof pkg.bin === 'object') return Object.keys(pkg.bin)[0];
  return undefined;
}
