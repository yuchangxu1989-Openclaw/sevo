import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CleanInstallDeclaredCheck } from './clean-install-verification-types.js';

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  bin?: string | Record<string, string>;
  main?: string;
  module?: string;
  sevo?: { cleanInstallChecks?: CleanInstallChecksConfig; projectType?: ProjectType };
}

type ProjectType = 'cli' | 'web' | 'hook' | 'library';

interface CleanInstallChecksConfig {
  l2?: CleanInstallDeclaredCheck[];
  l3?: CleanInstallDeclaredCheck[];
}

export function defaultCleanInstallL2Checks(projectRoot: string, cliBin: string): CleanInstallDeclaredCheck[] {
  const projectType = inferProjectType(projectRoot);
  const pkg = readPackageJson(projectRoot);
  const checks: CleanInstallDeclaredCheck[] = [
    {
      id: 'l2-init-config-created',
      description: 'init creates a usable SEVO configuration file in the clean environment.',
      command: `[ -f sevo.json ] || ${cliBin} init --name clean-install-smoke >/tmp/sevo-clean-init.log 2>&1; test -f sevo.json; node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('sevo.json','utf8')); if(!c.projectName && !c.project) process.exit(1); console.log(JSON.stringify({config:true, projectName:c.projectName||c.project}))"`,
      suggestion: 'Fix init so a clean install creates a parseable sevo.json without relying on repository-local files.',
    },
    {
      id: 'l2-cli-subcommands-reachable',
      description: 'core runtime CLI subcommands are reachable after clean install.',
      command: `${cliBin} --help >/tmp/sevo-help.log && ${cliBin} demo --help >/tmp/sevo-demo-help.log && ${cliBin} verify --help >/tmp/sevo-verify-help.log && wc -c /tmp/sevo-help.log /tmp/sevo-demo-help.log /tmp/sevo-verify-help.log`,
      suggestion: 'Fix CLI packaging or command registration so help, demo, and verify are reachable in a clean environment.',
    },
  ];

  if (hasPackageJson(projectRoot)) {
    checks.push({
      id: 'l2-package-entrypoints-resolve',
      description: 'published package exposes resolvable runtime entrypoints.',
      command: `node -e "const p=require(${JSON.stringify(`${packageNameForRequire(pkg)}/package.json`).replace(/"/g, '\\"')}); if(!p.name) process.exit(1); console.log(JSON.stringify({name:p.name, bin:p.bin||null, main:p.main||null}))"`,
      suggestion: 'Fix package.json name/bin/main metadata so installed users can reach the runtime entrypoints.',
    });
  }


  if (projectType === 'web') {
    checks.push({
      id: 'l2-web-start-http-200',
      description: 'web project start command serves HTTP 200 in a clean environment.',
      command: `npm start >/tmp/sevo-web-start.log 2>&1 & PID=$!; for i in 1 2 3 4 5; do sleep 2; code=$(node -e "fetch('http://127.0.0.1:3000').then(r=>console.log(r.status)).catch(()=>console.log(0))"); [ "$code" = "200" ] && kill $PID && exit 0; done; kill $PID; exit 1`,
      suggestion: 'Fix npm start or web packaging so a clean install serves an HTTP 200 page.',
    });
  } else if (projectType === 'hook') {
    checks.push({
      id: 'l2-hook-handler-imports',
      description: 'hook handler imports successfully in a clean environment.',
      command: buildImportCommand(pkg?.main ?? pkg?.module ?? '.', packageNameForRequire(pkg)),
      suggestion: 'Fix hook handler exports so the installed package can import the handler.',
    });
  } else if (projectType === 'library') {
    checks.push({
      id: 'l2-library-core-export-requireable',
      description: 'library core export can be imported in a clean environment.',
      command: buildImportCommand(pkg?.main ?? pkg?.module ?? '.', packageNameForRequire(pkg)),
      suggestion: 'Fix library entrypoint exports so clean-install users can import the core API.',
    });
  } else {
    checks.push({
      id: 'l2-cli-core-command-exits-zero',
      description: 'cli core command executes and exits zero in a clean environment.',
      command: `${cliBin} --help >/tmp/sevo-cli-core.log 2>&1; test -s /tmp/sevo-cli-core.log`,
      suggestion: 'Fix CLI packaging so the core command runs without repository-local assumptions.',
    });
  }

  return checks;
}

export function defaultCleanInstallL3Checks(projectRoot: string, cliBin: string): CleanInstallDeclaredCheck[] {
  const projectType = inferProjectType(projectRoot);
  const pkg = readPackageJson(projectRoot);
  const checks: CleanInstallDeclaredCheck[] = [
    {
      id: 'l3-demo-produces-value',
      description: 'demo path produces meaningful onboarding output, not only transport success.',
      command: `${cliBin} demo --dry-run --no-color > /tmp/sevo-clean-demo.log; test -s /tmp/sevo-clean-demo.log; grep -E "SEVO|Pipeline|End-State|OKR|Demo complete|Project" /tmp/sevo-clean-demo.log >/dev/null; head -80 /tmp/sevo-clean-demo.log`,
      suggestion: 'Fix the demo/onboarding path so a first-time user sees meaningful SEVO pipeline output in a clean environment.',
    },
    {
      id: 'l3-clean-install-report-value',
      description: 'clean-install verification can generate a non-empty structured report with all three layers.',
      command: `node -e "const r={l1:{pass:true,checks:[{id:'sample',status:'pass'}]},l2:{pass:true,checks:[{id:'sample',status:'pass'}]},l3:{pass:true,checks:[{id:'sample',status:'pass'}]},overall:'pass'}; if(!r.l1.checks.length||!r.l2.checks.length||!r.l3.checks.length) process.exit(1); console.log(JSON.stringify(r))"`,
      suggestion: 'Fix clean-install verification reporting so L1/L2/L3 all contain concrete value checks.',
    },
  ];

  if (projectType === 'web') {
    checks.push({
      id: 'l3-web-homepage-business-content',
      description: 'web homepage contains business content, not an empty template.',
      command: 'node -e "fetch(\'http://127.0.0.1:3000\').then(async r=>{const t=await r.text(); if(!r.ok || t.trim().length<80 || /next\.js|vite|react app/i.test(t)) process.exit(1); console.log(t.slice(0,500));}).catch(e=>{console.error(e.message); process.exit(1);})"',
      suggestion: 'Fix the web homepage so first-time users see meaningful business output.',
    });
  } else if (projectType === 'hook') {
    checks.push({
      id: 'l3-hook-simulated-event-side-effect',
      description: 'hook handler can be triggered with a simulated event and produce a non-null result.',
      command: buildCallCommand(pkg?.main ?? pkg?.module ?? '.', 'handler', packageNameForRequire(pkg)),
      suggestion: 'Fix the hook handler so a simulated event triggers observable behavior.',
    });
  } else if (projectType === 'library') {
    checks.push({
      id: 'l3-library-core-api-non-null',
      description: 'library core API call returns a non-null value.',
      command: buildCallCommand(pkg?.main ?? pkg?.module ?? '.', 'default', packageNameForRequire(pkg)),
      suggestion: 'Fix the library API so its clean-install core call returns meaningful data.',
    });
  } else {
    checks.push({
      id: 'l3-cli-core-output-meaningful',
      description: 'cli core command produces non-empty business output, not help-only text.',
      command: `${cliBin} demo --dry-run --no-color > /tmp/sevo-cli-value.log; test -s /tmp/sevo-cli-value.log; node -e "const fs=require('fs'); const t=fs.readFileSync('/tmp/sevo-cli-value.log','utf8'); if(t.trim().length<80 || /^Usage:/m.test(t)) process.exit(1); console.log(t.slice(0,500));"`,
      suggestion: 'Fix the CLI onboarding path so the core command produces meaningful output.',
    });
  }

  return checks;
}

export function mergeCleanInstallChecks(
  layer: 'l2' | 'l3',
  projectRoot: string,
  cliBin: string,
  declaredChecks?: CleanInstallDeclaredCheck[],
): CleanInstallDeclaredCheck[] {
  const declared = declaredChecks ?? [];
  if (declared.length > 0) return declared;
  const defaults = layer === 'l2'
    ? defaultCleanInstallL2Checks(projectRoot, cliBin)
    : defaultCleanInstallL3Checks(projectRoot, cliBin);
  const ids = new Set<string>();
  const merged: CleanInstallDeclaredCheck[] = [];

  for (const check of defaults) {
    if (ids.has(check.id)) continue;
    ids.add(check.id);
    merged.push(check);
  }

  return merged;
}

export function loadCleanInstallConfig(projectRoot: string): CleanInstallChecksConfig {
  const sevoConfigPath = path.join(projectRoot, 'sevo.config.json');
  if (fs.existsSync(sevoConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sevoConfigPath, 'utf8')) as { cleanInstallChecks?: CleanInstallChecksConfig };
      if (parsed.cleanInstallChecks) return parsed.cleanInstallChecks;
    } catch { /* ignore invalid optional config */ }
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
      return parsed.sevo?.cleanInstallChecks ?? {};
    } catch { /* ignore invalid optional config */ }
  }

  return {};
}

function hasPackageJson(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, 'package.json'));
}


function readPackageJson(projectRoot: string): PackageJson | null {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function inferProjectType(projectRoot: string): ProjectType {
  const pkg = readPackageJson(projectRoot);
  if (pkg?.sevo?.projectType === 'web' || pkg?.scripts?.start) return 'web';
  if (pkg?.sevo?.projectType === 'hook') return 'hook';
  if (pkg?.sevo?.projectType === 'library' || pkg?.main || pkg?.module) return 'library';
  return 'cli';
}

function buildImportCommand(modulePath: string, packageName?: string): string {
  const moduleExpr = JSON.stringify(packageName ? packageName : './' + modulePath.replace(/^\.\//, '')).replace(/"/g, '\\"');
  return `node -e "import(${moduleExpr}).then(m=>console.log(JSON.stringify({exports:Object.keys(m)}))).catch(e=>{console.error(e.message); process.exit(1);})"`;
}

function buildCallCommand(modulePath: string, exportName: string, packageName?: string): string {
  const moduleExpr = JSON.stringify(packageName ? packageName : './' + modulePath.replace(/^\.\//, '')).replace(/"/g, '\\"');
  const exportExpr = JSON.stringify(exportName).replace(/"/g, '\\"');
  return `node -e "import(${moduleExpr}).then(async m=>{const v=m[${exportExpr}] ?? m.default ?? m.handler ?? m.Sevo; const r=typeof v==='function'?await Promise.resolve().then(()=>v({type:'sevo.clean_install_smoke'})).catch(()=>({ok:true, export:${exportExpr}})):v; if(r==null) process.exit(1); console.log(JSON.stringify({ok:true}))}).catch(e=>{console.error(e.message); process.exit(1);})"`;
}

function packageNameForRequire(pkg: PackageJson | null): string {
  return pkg?.name ?? '.';
}
