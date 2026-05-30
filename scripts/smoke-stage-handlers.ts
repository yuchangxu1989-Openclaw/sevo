/**
 * Manual smoke-driver for stage handlers — emits verification evidence.
 *
 * Run with `node --experimental-strip-types scripts/smoke-stage-handlers.ts`
 * or after build `node dist/scripts/smoke-stage-handlers.js`. Not part of
 * the npm package; lives under projects/sevo/scripts/ for ops use.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  STAGE_HANDLERS,
  STAGE_HANDLER_ORDER,
  type StageHandlerContext,
  type StageHandlerResult,
} from '../src/stage-handlers/index.js';

async function main(): Promise<void> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-smoke-'));
  const projectSlug = 'smoke-demo';
  const projectRoot = path.join(workspaceRoot, 'projects', projectSlug);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: projectSlug, version: '0.0.1' }, null, 2),
  );

  const ctx: StageHandlerContext = {
    pipelineId: 'smoke-pipeline',
    projectSlug,
    workspaceRoot,
    projectRoot,
    frDescription: '让用户用一句话描述需求,自动生成 spec + 实现骨架。',
    now: () => new Date().toISOString(),
    previousResults: {},
  };

  const results: Record<string, StageHandlerResult> = {};
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Project:   ${projectRoot}`);
  console.log('');
  for (const key of STAGE_HANDLER_ORDER) {
    const handler = STAGE_HANDLERS[key];
    const result = await handler({ ...ctx, previousResults: results as StageHandlerContext['previousResults'] });
    results[key] = result;
    const arts = result.artifacts.length;
    console.log(`[${key.padEnd(30)}] verdict=${result.verdict.padEnd(5)} artifacts=${arts}  ${result.summary}`);
  }

  const docsDir = path.join(projectRoot, 'docs');
  console.log('');
  console.log('--- docs/ tree ---');
  for (const f of fs.readdirSync(docsDir)) {
    const full = path.join(docsDir, f);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      console.log(`  ${f} (${stat.size} bytes)`);
    } else {
      console.log(`  ${f}/`);
      for (const sub of fs.readdirSync(full)) console.log(`    ${sub}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
