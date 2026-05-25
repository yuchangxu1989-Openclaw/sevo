/**
 * sevo demo - interactive onboarding experience (FR-16 + FR-18 PDCA).
 *
 * Creates a temporary "hello-sevo" project and walks through a simplified
 * pipeline lifecycle so new users can see SEVO's core concepts in action,
 * including OKR-driven PDCA closedloop (AC-18.12).
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { DEMO_REQUIREMENTS_MARKDOWN } from './demo-fixtures/requirements.js';

// ─── ANSI helpers (zero dependencies) ───

const ESC = '\x1b[';
const c = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  bgGreen: `${ESC}42m`,
  bgBlue: `${ESC}44m`,
  bgMagenta: `${ESC}45m`,
  red: `${ESC}31m`,
  bgRed: `${ESC}41m`,
};

function bold(s: string): string { return `${c.bold}${s}${c.reset}`; }
function green(s: string): string { return `${c.green}${s}${c.reset}`; }
function yellow(s: string): string { return `${c.yellow}${s}${c.reset}`; }
function blue(s: string): string { return `${c.blue}${s}${c.reset}`; }
function cyan(s: string): string { return `${c.cyan}${s}${c.reset}`; }
function magenta(s: string): string { return `${c.magenta}${s}${c.reset}`; }
function dim(s: string): string { return `${c.dim}${s}${c.reset}`; }
function red(s: string): string { return `${c.red}${s}${c.reset}`; }
function badge(bg: string, text: string): string {
  return `${bg}${c.bold}${c.white} ${text} ${c.reset}`;
}

// ─── Demo stages (simplified subset for onboarding) ───

interface DemoStage {
  id: string;
  label: string;
  description: string;
}

const DEMO_STAGES: DemoStage[] = [
  { id: 'spec', label: 'Spec', description: 'Define requirements and acceptance criteria' },
  { id: 'spec-review-gate', label: 'Spec Review Gate', description: 'Quality gate - validate spec completeness' },
  { id: 'implement', label: 'Implement', description: 'Build the feature' },
  { id: 'review', label: 'Review', description: 'Code review and audit' },
  { id: 'smoke-test', label: 'Smoke Test', description: 'Verify core functionality works' },
  { id: 'deploy', label: 'Deploy', description: 'Publish and release' },
];

// ─── Core demo logic (exported for testing) ───

export interface DemoOptions {
  dryRun: boolean;
  noColor: boolean;
  okr?: boolean;
  /** FR-16: Automatically create a real project after demo completes. */
  createAfter?: boolean;
}

export interface DemoResult {
  projectDir: string;
  pipelineId: string;
  stagesCompleted: string[];
  ledgerEvents: LedgerEvent[];
  specArtifactPath?: string;
  validationResult: {
    gapDetected: boolean;
    gapFixed: boolean;
    passed: boolean;
  };
}

interface LedgerEvent {
  timestamp: string;
  type: string;
  stageId?: string;
  detail?: string;
}

/**
 * Run the demo pipeline lifecycle. Returns structured result for testing.
 * Writes output to `log` callback (defaults to console.log).
 */
export function runDemo(
  opts: DemoOptions,
  log: (msg: string) => void = console.log,
): DemoResult {
  const startTime = Date.now();
  const noColor = opts.noColor;
  const _bold = noColor ? (s: string) => s : bold;
  const _green = noColor ? (s: string) => s : green;
  const _yellow = noColor ? (s: string) => s : yellow;
  const _blue = noColor ? (s: string) => s : blue;
  const _cyan = noColor ? (s: string) => s : cyan;
  const _magenta = noColor ? (s: string) => s : magenta;
  const _dim = noColor ? (s: string) => s : dim;
  const _red = noColor ? (s: string) => s : red;
  const _badge = noColor
    ? (_bg: string, text: string) => `[${text}]`
    : badge;

  const pipelineId = `demo-${Date.now().toString(36)}`;
  const ledger: LedgerEvent[] = [];
  const stagesCompleted: string[] = [];
  const stageTiming: Array<{ stage: string; elapsed: number }> = [];

  function completeDemoStage(stage: string, startedAt: number): void {
    stageTiming.push({ stage, elapsed: Date.now() - startedAt });
  }

  function emit(type: string, stageId?: string, detail?: string): void {
    ledger.push({ timestamp: new Date().toISOString(), type, stageId, detail });
  }

  function buildDemoSpec(): string {
    return DEMO_REQUIREMENTS_MARKDOWN;
  }

  // ── Banner ──
  log('');
  log(_bold('╔══════════════════════════════════════════════════════╗'));
  log(_bold('║') + _cyan('   SEVO - Automated Software Delivery Pipeline       ') + _bold('║'));
  log(_bold('║') + _dim('   Interactive Demo · 5-minute onboarding experience  ') + _bold('║'));
  log(_bold('╚══════════════════════════════════════════════════════╝'));
  log('');

  // ── Step 0: Determine project directory ──
  let projectDir: string;

  if (opts.dryRun) {
    projectDir = '/tmp/sevo-demo-hello-sevo';
    log(_yellow('⚡ Dry-run mode - creating mock artifact structure.'));
    log(_dim('   Mock files will be created under /tmp so you can inspect the demo output.'));
    log(_dim(`   Project at: ${projectDir}`));
    log('');

    // AC-16F.5: Produce complete directory tree with mock files
    const mockDirs = ['specs', 'contract', 'reports', 'artifacts', 'pipelines/_ledger'];
    for (const dir of mockDirs) {
      fs.mkdirSync(path.join(projectDir, dir), { recursive: true });
    }
    fs.writeFileSync(path.join(projectDir, 'specs', 'product-requirements.md'), buildDemoSpec(), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'contract', 'api-contract.json'), JSON.stringify({ version: '1.0.0', endpoints: [{ path: '/tasks', methods: ['GET', 'POST', 'DELETE'] }] }, null, 2), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'reports', 'gap-scan-l1.json'), JSON.stringify({ level: 'l1', pass: true, timestamp: new Date().toISOString(), entries: [] }, null, 2), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'reports', 'gate-results.json'), JSON.stringify({ gates: DEMO_STAGES.filter(s => s.id.includes('gate')).map(s => ({ id: s.id, passed: true })) }, null, 2), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'sevo.json'), JSON.stringify({ projectName: 'hello-sevo', adapter: 'standalone', stages: DEMO_STAGES.map(s => s.id) }, null, 2), 'utf8');

    log(`  ${_green('✓')} Mock artifact structure created:`);
    log(`    specs/product-requirements.md`);
    log(`    contract/api-contract.json`);
    log(`    reports/gap-scan-l1.json`);
    log(`    reports/gate-results.json`);
    log(`    pipelines/_ledger/`);
    log('');
  } else {
    projectDir = path.join(os.tmpdir(), `sevo-demo-${pipelineId}`);
    fs.mkdirSync(path.join(projectDir, 'pipelines', '_ledger'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'specs'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'artifacts'), { recursive: true });

    const sevoConfig = {
      projectName: 'hello-sevo',
      adapter: 'standalone',
      stages: DEMO_STAGES.map((s) => s.id),
    };
    fs.writeFileSync(
      path.join(projectDir, 'sevo.json'),
      JSON.stringify(sevoConfig, null, 2) + '\n',
    );

    log(_green('✓') + ` Project created at ${_dim(projectDir)}`);
    log('');
  }

  // ── Step 1: Create pipeline + End-State Goal (FR-18) ──
  log(_badge(c.bgBlue, 'STEP 1') + ` ${_bold('Create Pipeline + End-State Goal')}`);
  log(_dim('  Every change in SEVO flows through a pipeline with defined stages.'));
  log('');

  emit('pipeline:created', undefined, `Pipeline ${pipelineId} created`);

  // Show End-State Goal (AC-18.12)
  log(`  ${_bold('🎯 End-State Goal')}`);
  log(`  ${_cyan('"陌生用户 5 分钟内完成首条 pipeline 并看到交付物"')}`);
  log('');

  const pipelineState: Record<string, string> = {};
  for (const stage of DEMO_STAGES) {
    pipelineState[stage.id] = 'pending';
  }
  const firstStage = DEMO_STAGES[0];
  if (firstStage) {
    pipelineState[firstStage.id] = 'active';
  }

  log(`  Pipeline: ${_cyan(pipelineId)}`);
  log(`  Status:   ${_yellow('active')}`);
  log(`  Stages:`);
  for (const stage of DEMO_STAGES) {
    const status = pipelineState[stage.id];
    const icon = status === 'active' ? _yellow('▶') : _dim('○');
    const label = status === 'active' ? _yellow(stage.label) : _dim(stage.label);
    log(`    ${icon} ${label} - ${_dim(stage.description)}`);
  }
  log('');

  if (!opts.dryRun) {
    fs.writeFileSync(
      path.join(projectDir, 'pipelines', `${pipelineId}.json`),
      JSON.stringify({
        pipelineId,
        projectSlug: 'hello-sevo',
        status: 'active',
        createdAt: new Date().toISOString(),
        stages: Object.fromEntries(
          DEMO_STAGES.map((s) => [s.id, { status: pipelineState[s.id] }]),
        ),
      }, null, 2) + '\n',
    );
  }

  // ── Step 2: Spec + OKR Decomposition (FR-18) ──
  log(_badge(c.bgMagenta, 'STEP 2') + ` ${_bold('Spec → OKR Decomposition → Gate')}`);
  log(_dim('  The spec stage captures requirements. OKR tree decomposes the goal into measurable KRs.'));
  log('');

  // OKR Decomposition display (AC-18.12)
  log(`  ${_bold('📊 OKR Decomposition')}`);
  log(`  Objective: 陌生用户 5 分钟内完成首条 pipeline`);
  log(`    ${_cyan('KR-1')}: CLI install + init 成功率 100% (measure: 安装零报错)`);
  log(`    ${_cyan('KR-2')}: demo 命令 5 分钟内跑完 (measure: 执行时间 < 300s)`);
  log(`    ${_cyan('KR-3')}: 用户文档覆盖所有核心命令 (measure: 文档/命令比 ≥ 1.0)`);
  log('');

  // FR→KR traceability
  log(`  ${_bold('🔗 FR→KR Traceability')}`);
  log(`    FR-1 (用户认证) → ${_cyan('KR-1')}`);
  log(`    FR-2 (数据导出) → ${_cyan('KR-2')}`);
  log(`    FR-3 (用户文档) → ${_cyan('KR-3')}`);
  log('');

  // Automatically run spec stage and produce a concrete spec artifact (FR-16).
  let specArtifactPath: string | undefined;
  emit('stage:started', 'spec', 'Spec stage auto-triggered by demo command');
  if (!opts.dryRun) {
    specArtifactPath = path.join(projectDir, 'specs', 'product-requirements.md');
    const specStartedAt = Date.now();
    fs.writeFileSync(specArtifactPath, buildDemoSpec(), 'utf8');
    completeDemoStage('spec', specStartedAt);
  } else {
    specArtifactPath = path.join(projectDir, 'specs', 'product-requirements.md');
    completeDemoStage('spec', Date.now());
  }

  pipelineState['spec'] = 'passed';
  stagesCompleted.push('spec');
  emit('stage:completed', 'spec', `Spec authored at ${specArtifactPath} with 3 FRs and 6 ACs`);

  log(`  ${_green('✓')} Spec auto-triggered and completed - 3 FRs, 6 ACs, 3 KRs (SMART-compliant)`);
  log(`    Artifact: ${_dim(specArtifactPath)}`);

  // Simulate gate evaluation
  pipelineState['spec-review-gate'] = 'passed';
  stagesCompleted.push('spec-review-gate');
  completeDemoStage('spec-review-gate', Date.now());
  emit('gate:evaluated', 'spec-review-gate', 'Gate passed: completeness=92%, clarity=88%, SMART=100%');

  log(`  ${_green('✓')} Spec Review Gate ${_green('PASSED')}`);
  log(`    Completeness: ${_green('92%')}  Clarity: ${_green('88%')}  Testability: ${_green('95%')}  SMART: ${_green('100%')}`);
  log('');

  // ── Step 3: Implement + Review ──
  log(_badge(c.bgGreen, 'STEP 3') + ` ${_bold('Implement → Review → Smoke Test')}`);
  log(_dim('  Code is written, reviewed, and smoke-tested before deployment.'));
  log('');

  pipelineState['implement'] = 'passed';
  stagesCompleted.push('implement');
  completeDemoStage('implement', Date.now());
  emit('stage:completed', 'implement', '4 files changed, 127 lines added');
  log(`  ${_green('✓')} Implementation complete - 4 files, +127 lines`);

  pipelineState['review'] = 'passed';
  stagesCompleted.push('review');
  completeDemoStage('review', Date.now());
  emit('stage:completed', 'review', 'Code review passed, 0 blocking issues');
  log(`  ${_green('✓')} Code review passed - 0 blocking issues`);

  pipelineState['smoke-test'] = 'passed';
  stagesCompleted.push('smoke-test');
  completeDemoStage('smoke-test', Date.now());
  emit('stage:completed', 'smoke-test', '12/12 tests passed');
  log(`  ${_green('✓')} Smoke test - ${_green('12/12')} tests passed`);
  log('');

  // ── Step 4: Deploy ──
  log(_badge(c.bgBlue, 'STEP 4') + ` ${_bold('Deploy')}`);
  log(_dim('  The final stage publishes the artifact.'));
  log('');

  pipelineState['deploy'] = 'passed';
  stagesCompleted.push('deploy');
  completeDemoStage('deploy', Date.now());
  emit('stage:completed', 'deploy', 'Published hello-sevo@1.0.0');

  log(`  ${_green('✓')} Deployed - hello-sevo@1.0.0 published`);
  log('');

  // ── Step 5: KR Achievement Check + PDCA Loop (FR-18) ──
  log(_badge(c.bgMagenta, 'STEP 5') + ` ${_bold('Post-Release Validation - KR Achievement Check')}`);
  log(_dim('  Pipeline 的终点不是「代码部署了」,而是「每个 KR 都达成」。'));
  log('');

  // First validation: KR-3 not achieved
  log(`  ${_bold('⚡ KR Achievement Check (Cycle 0)')}`);
  log('');
  log(`  ${_green('✓')} KR-1: CLI install + init 成功率 - ${_green('achieved')} (100%)`);
  log(`  ${_green('✓')} KR-2: demo 命令执行时间 - ${_green('achieved')} (100%)`);
  log(`  ${_red('✗')} KR-3: 用户文档覆盖率 - ${_red('not-achieved')} (0%)`);
  log('');
  log(`  KR 差距: ${_red('1/3')} 未达成`);
  log(`  状态: ${_red('❌ canComplete = false')}`);
  log('');

  emit('validation:kr-gap-detected', undefined, 'KR-3 用户文档覆盖率 — not-achieved');
  emit('validation:gap-detected', undefined, 'FR-3 用户文档 — 未找到对应交付物');

  // PDCA Cycle 1: sub-loop (AC-18.10, AC-18.12)
  log(`  ${_bold('🔄 PDCA Cycle 1 - implement → review → deploy → validate')}`);
  log(_dim('  子循环在 Post-Release Validation 内部管理,不回退主状态机'));
  log('');
  log(`  ${_yellow('→')} 触发原因: KR-3 未达成`);
  log(`  ${_yellow('→')} 新任务: 补充用户文档覆盖所有核心命令`);
  log('');
  log(`  ${_dim('  [implement] 补充文档...')}`);
  log(`  ${_dim('  [review] 文档审查通过')}`);
  log(`  ${_dim('  [deploy] 文档发布')}`);
  log(`  ${_dim('  [validate] 重新检查 KR 达成度...')}`);
  log('');

  emit('pdca:cycle-start', undefined, 'PDCA Cycle 1: triggered by KR-3');
  emit('pdca:sub-implement', undefined, 'Sub-cycle implement: 补充用户文档');
  emit('pdca:sub-review', undefined, 'Sub-cycle review: 文档审查通过');
  emit('pdca:sub-deploy', undefined, 'Sub-cycle deploy: 文档发布');

  // After fix: all KRs achieved
  log(`  ${_bold('⚡ KR Achievement Check (Cycle 1)')}`);
  log('');
  log(`  ${_green('✓')} KR-1: CLI install + init 成功率 - ${_green('achieved')} (100%)`);
  log(`  ${_green('✓')} KR-2: demo 命令执行时间 - ${_green('achieved')} (100%)`);
  log(`  ${_green('✓')} KR-3: 用户文档覆盖率 - ${_green('achieved')} (100%)`);
  log('');
  log(`  KR 差距: ${_green('0/3')}`);
  log(`  状态: ${_green('✅ canComplete = true')} - PDCA converged`);
  log('');

  emit('pdca:cycle-end', undefined, 'PDCA Cycle 1: converged, all KRs achieved');
  emit('validation:passed', undefined, '3/3 KRs achieved, pipeline can complete');

  const validationResult = { gapDetected: true, gapFixed: true, passed: true };

  // Also show FR-level for completeness
  log(`  ${_dim('FR-level check (backward compatible):')}`);  
  log(`  ${_green('✓')} FR-1: 用户认证 — covered`);
  log(`  ${_green('✓')} FR-2: 数据导出 — covered`);
  log(`  ${_green('✓')} FR-3: 用户文档 — covered (after PDCA fix)`);
  log('');

  // Show legacy-style Post-Release Validation Gate summary
  log(`  ${_bold('⚡ Post-Release Validation Gate')}`);  
  log('');
  log(`  ${_green('✓')} FR-1: 用户认证 — 代码已实现，测试通过`);
  log(`  ${_green('✓')} FR-2: 数据导出 — 代码已实现，测试通过`);
  log(`  ${_red('✗')} FR-3: 用户文档 — 未找到对应交付物`);
  log('');
  log(`  差距: ${_red('1/3')} FR 未覆盖`);
  log(`  状态: ${_red('❌ BLOCKED')} — pipeline 不允许标记完成`);
  log('');
  log(`  ${_dim('模拟修复 FR-3...')}`);  
  log('');
  log(`  ${_green('✓')} FR-3: 用户文档 — 已补充`);
  log('');
  log(`  差距: ${_green('0/3')}`);
  log(`  状态: ${_green('✅ PASSED')} — pipeline 可以标记完成`);
  log('');

  emit('validation:fix-applied', undefined, 'task-fix-fr3 完成，FR-3 已补充');
  emit('pipeline:completed', undefined, 'All KRs achieved, all stages passed');

  // ── Step 6: Ledger history ──
  log(_badge(c.bgBlue, 'STEP 6') + ` ${_bold('Event Ledger (with OKR/PDCA evidence)')}`);
  log(_dim('  Every action is recorded in an append-only ledger for auditability.'));
  log(_dim('  OKR tree, KR achievement, and PDCA cycles are part of the evidence chain.'));
  log('');

  for (const evt of ledger) {
    const ts = evt.timestamp.split('T')[1]?.split('.')[0] ?? evt.timestamp;
    const stage = evt.stageId ? ` ${_blue(`[${evt.stageId}]`)}` : '';
    log(`  ${_dim(ts)}  ${_magenta(evt.type)}${stage}  ${_dim(evt.detail ?? '')}`);
  }
  log('');

  // Write ledger to disk
  if (!opts.dryRun) {
    const ledgerPath = path.join(projectDir, 'pipelines', '_ledger', `${pipelineId}.jsonl`);
    const ledgerContent = ledger.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(ledgerPath, ledgerContent);
  }

  // ── Summary ──
  log(_bold('─── Summary ───'));
  log('');
  log(`  You just saw a complete SEVO pipeline with OKR-driven PDCA closedloop:`);
  log(`  ${_cyan('目标锁定')} → ${_cyan('OKR 拆解')} → ${_cyan('SMART 任务化')} → ${_cyan('阶段执行')} → ${_cyan('差距扫描')} → ${_cyan('PDCA 回环修复')} → ${_cyan('收敛完成')}`);
  log('');
  log(`  Key concepts:`);
  log(`    ${_green('•')} ${_bold('Stages')} — each pipeline has ordered stages with quality gates`);
  log(`    ${_green('•')} ${_bold('Gates')} — automated checks that block progression until criteria are met`);
  log(`    ${_green('•')} ${_bold('End-State Goal')} — lock the destination before starting`);
  log(`    ${_green('•')} ${_bold('OKR Tree')} — decompose goal into measurable Key Results`);
  log(`    ${_green('•')} ${_bold('SMART Tasks')} — each FR traces to a KR with clear metrics`);
  log(`    ${_green('•')} ${_bold('Validation')} — post-release check at KR level, not just FR`);
  log(`    ${_green('•')} ${_bold('PDCA Loop')} — implement→review→deploy→validate sub-cycle until convergence`);
  log(`    ${_green('•')} ${_bold('Ledger')} — OKR tree, KR achievement, PDCA cycles in evidence chain`);
  log('');
  log(`  Next steps:`);
  log(`    ${_blue('$')} sevo init          ${_dim('# Initialize SEVO in your project')}`);
  log(`    ${_blue('$')} sevo create my-app ${_dim('# Create a new project pipeline')}`);
  log(`    ${_blue('$')} sevo status        ${_dim('# Check pipeline status')}`);
  log('');
  log(`  ${_bold('这就是终局思维：pipeline 的终点不是「代码能跑」，而是「用户能用」。目标达成才是终点。')}`);
  log('');

  if (!opts.dryRun) {
    log(_dim(`  Demo files saved to: ${projectDir}`));
    log(_dim('  Feel free to explore or delete them.'));
    log('');
  }

  // FR-16: Post-demo project creation prompt
  if (!opts.dryRun && opts.createAfter) {
    log(_badge(c.bgGreen, 'CREATE') + ` ${_bold('Creating real project from demo...')}`);
    log('');
    try {
      const realProjectDir = process.cwd();
      const sevoJsonPath = path.join(realProjectDir, 'sevo.json');
      if (!fs.existsSync(sevoJsonPath)) {
        // Run init first if not already initialized
        const initResult = spawnSync(process.execPath, [
          process.argv[1] ?? 'sevo', 'init', '--name', 'my-project',
        ], { cwd: realProjectDir, encoding: 'utf8', stdio: 'inherit' });
        if (initResult.status !== 0) {
          log(`  ${_red('✗')} Failed to initialize project. Run ${_blue('sevo init')} manually.`);
        } else {
          log(`  ${_green('✓')} Project initialized`);
        }
      }
      // Create a real project
      const createResult = spawnSync(process.execPath, [
        process.argv[1] ?? 'sevo', 'create', 'my-first-project',
        '--description', 'My first SEVO-managed project',
      ], { cwd: realProjectDir, encoding: 'utf8', stdio: 'inherit' });
      if (createResult.status === 0) {
        log('');
        log(`  ${_green('✓')} Real project created. Run ${_blue('sevo status')} to see it.`);
        log(`  ${_dim('The pipeline starts at the spec stage. Define your requirements next.')}`);
      } else {
        log(`  ${_red('✗')} Could not create project. Run ${_blue('sevo create my-first-project')} manually.`);
      }
    } catch {
      log(`  ${_red('✗')} Auto-create failed. Run ${_blue('sevo create my-first-project')} manually.`);
    }
    log('');
  } else if (!opts.dryRun && !opts.createAfter) {
    log(`  ${_bold('Ready to start for real?')}`);
    log(`    ${_blue('$')} sevo demo --create-after  ${_dim('# Re-run demo and auto-create a real project')}`);
    log('');
  }

  // AC-16F.3: Output timing and artifact summary
  const totalElapsed = Math.round((Date.now() - startTime) / 1000);
  log(_bold('─── Execution Summary ───'));
  log('');
  log(`  Stages: ${stagesCompleted.join(' → ')}`);
  log(`  Stage timings: ${stageTiming.map((item) => `${item.stage}=${Math.max(1, Math.round(item.elapsed / 1000))}s`).join(', ')}`);
  log(`  Total elapsed: ${totalElapsed}s`);
  if (specArtifactPath) {
    log(`  Artifacts: ${specArtifactPath}`);
  }
  log(`  Pipeline: ${pipelineId}`);

  // AC-16F.4: Warn if > 5 minutes
  if (totalElapsed > 300) {
    log('');
    log(_yellow(`  ⚠ Demo 耗时超过预期（${totalElapsed}s），可能是 LLM 响应慢或网络问题`));
    log(_dim('    排查建议: 检查 LLM API 连通性、网络延迟、或使用 --dry-run 模式'));
  }
  log('');

  return { projectDir, pipelineId, stagesCompleted, ledgerEvents: ledger, specArtifactPath, validationResult };
}

// ─── CLI registration ───

export function registerDemo(program: Command): void {
  program
    .command('demo')
    .description('Interactive onboarding - experience a full SEVO pipeline in 5 minutes')
    .option('--dry-run', 'Show what would happen without creating files', false)
    .option('--no-color', 'Disable colored output')
    .option('--okr', 'Focus on OKR-driven PDCA closedloop demo', false)
    .option('--create-after', 'Automatically create a real project after demo completes', false)
    .action((opts: { dryRun: boolean; color: boolean; okr: boolean; createAfter: boolean }) => {
      runDemo({ dryRun: opts.dryRun, noColor: !opts.color, okr: opts.okr, createAfter: opts.createAfter });
    });
}
