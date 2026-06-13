/**
 * E2E verification: SEVO V2 advance pipeline flow.
 *
 * 1. Creates a V2 pipeline run via run-store
 * 2. Simulates a completion event with V2 canonical label
 * 3. Verifies handleCompletion produces advance text (not early-return)
 * 4. Verifies prompt-injector generates initial dispatch for undispatched stages
 * 5. Tests legacy label fallback resolution
 */

import { createRun, listActiveRuns, getRun, advanceStage, closeRun, resetStageForRetry } from '../src/run-store.js';
import { handleCompletion } from '../src/completion-handler.js';
import { buildInjection, isGoalVague } from '../src/prompt-injector.js';
import { encode, decode } from '../src/label-protocol.js';
import { renderAdvancePromptTemplate } from '../advance-prompt-templates.js';
import { getStageMapping } from '../task-mapper.js';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let failures = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ${PASS} ${msg}`);
  } else {
    console.log(`  ${FAIL} ${msg}`);
    failures++;
  }
}

const runStoreDeps = { getRun, listActiveRuns, advanceStage, closeRun, resetStageForRetry };

console.log('\n=== SEVO V2 Advance E2E Verification ===\n');

// --- Test 1: Create a V2 run ---
console.log('Test 1: Create V2 pipeline run');
const run = createRun({
  projectSlug: 'e2e-test',
  projectRoot: 'projects/e2e-test',
  goal: 'E2E verification of V2 advance flow',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement', 'review', 'deploy'], skipped: [] },
});

assert(run.pipelineRunId, `run created: ${run.pipelineRunId.slice(0, 8)}`);
assert(run.currentStageId === 'spec', `currentStageId = spec`);
assert(run.status === 'running', `status = running`);
assert(run.stages.spec.status === 'active', `spec stage is active`);
assert(!run.stages.spec.dispatchId, `spec stage has no dispatchId yet`);

// --- Test 2: Prompt injector generates initial dispatch ---
console.log('\nTest 2: Prompt injector initial dispatch');
const injection = buildInjection({}, {
  listActiveRuns: () => listActiveRuns('e2e-test'),
  getPendingAdvance: () => null,
});

assert(injection?.text?.includes('DISPATCH NEEDED'), 'injection contains DISPATCH NEEDED');
const expectedLabel = encode({ projectSlug: 'e2e-test', pipelineRunId: run.pipelineRunId, stageId: 'spec', attempt: 1 });
assert(injection?.text?.includes(expectedLabel), `injection contains V2 label`);

// --- Test 3: handleCompletion with V2 label ---
console.log('\nTest 3: handleCompletion with V2 canonical label');
const v2Label = expectedLabel;
const completionResult = handleCompletion(
  { label: v2Label, status: 'passed', artifacts: ['spec.md'] },
  {
    runStore: runStoreDeps,
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 3,
    renderAdvancePromptTemplate,
    getStageMapping,
  },
);

assert(completionResult !== null, 'handleCompletion did not early-return');
assert(!!completionResult?.advanceText, 'advanceText is non-empty');
assert(completionResult?.nextStageId === 'implement', `nextStageId = implement`);
assert(completionResult?.runSnapshot?.pipelineRunId === run.pipelineRunId, 'runSnapshot has correct pipelineRunId');

// --- Test 4: Legacy label fallback ---
console.log('\nTest 4: Legacy label fallback');
const legacyLabel = `sevo:e2e-test:implement:1`;
const decoded = decode(legacyLabel);
assert(decoded.pipelineRunId === null, 'legacy label decodes with null pipelineRunId');
assert(decoded.stageId === 'implement', 'legacy label decodes stageId=implement');

const legacyResult = handleCompletion(
  { label: legacyLabel, status: 'passed', artifacts: ['impl.ts'] },
  {
    runStore: runStoreDeps,
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 3,
    renderAdvancePromptTemplate,
    getStageMapping,
  },
);

assert(legacyResult !== null, 'legacy label: handleCompletion did not early-return');
assert(!!legacyResult?.advanceText, 'legacy label: advanceText is non-empty');
assert(legacyResult?.nextStageId === 'review', 'legacy label: nextStageId = review');

// --- Test 5: isGoalVague heuristic ---
console.log('\nTest 5: isGoalVague heuristic');
assert(isGoalVague('') === true, 'empty string is vague');
assert(isGoalVague(null) === true, 'null is vague');
assert(isGoalVague('fix it') === true, 'too short (<20 chars) is vague');
assert(isGoalVague('这个怎么搞？') === true, 'question mark ending is vague');
assert(isGoalVague('what should we do about the auth?') === true, 'English question is vague');
assert(isGoalVague('the login page has issues') === true, 'no verb is vague');
assert(isGoalVague('实现用户登录模块的密码重置功能') === false, 'Chinese with verb and detail is clear');
assert(isGoalVague('Implement password reset flow for the login module') === false, 'English with verb and detail is clear');
assert(isGoalVague('修复 KIVO wiki 搜索结果排序不正确的 bug') === false, 'Chinese fix goal is clear');

// --- Test 6: Clarification injection for vague goal ---
console.log('\nTest 6: Clarification injection for vague goal');
const vagueRun = createRun({
  projectSlug: 'e2e-vague',
  projectRoot: 'projects/e2e-vague',
  goal: 'fix it',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement', 'review'], skipped: [] },
});

const vagueInjection = buildInjection({}, {
  listActiveRuns: () => listActiveRuns('e2e-vague'),
  getPendingAdvance: () => null,
});

assert(vagueInjection?.text?.includes('澄清'), 'vague goal injection contains 澄清');
assert(!vagueInjection?.text?.includes('DISPATCH NEEDED'), 'vague goal does NOT contain DISPATCH NEEDED');
assert(vagueInjection?.text?.includes('澄清引导'), 'vague goal shows clarification header');

// --- Test 7: Clear goal still gets DISPATCH NEEDED ---
console.log('\nTest 7: Clear goal gets DISPATCH NEEDED');
const clearRun = createRun({
  projectSlug: 'e2e-clear',
  projectRoot: 'projects/e2e-clear',
  goal: '实现 KIVO wiki 全文搜索功能，支持中英文分词和高亮',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement', 'review'], skipped: [] },
});

const clearInjection = buildInjection({}, {
  listActiveRuns: () => listActiveRuns('e2e-clear'),
  getPendingAdvance: () => null,
});

assert(clearInjection?.text?.includes('DISPATCH NEEDED'), 'clear goal injection contains DISPATCH NEEDED');
assert(!clearInjection?.text?.includes('澄清'), 'clear goal does NOT contain 澄清');

// --- Cleanup ---
closeRun(vagueRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });
closeRun(clearRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });
closeRun(run.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });

// --- Test 8: Auto-create via sevo:implement entry point ---
console.log('\nTest 8: Auto-create via cmdEntryPoint(implement)');
import { handleCommand, DEFAULT_FULL_PIPELINE_STAGES } from '../src/pipeline-commands.js';

const implResult = handleCommand('implement', {
  projectSlug: 'e2e-impl',
  projectRoot: 'projects/e2e-impl',
  goal: '实现 KIVO wiki 编辑器的 markdown 预览功能',
}, { runStore: { createRun, listActiveRuns, advanceStage, getRun, closeRun } });

assert(implResult.includes('Auto-created run'), 'implement creates run when none exists');
assert(implResult.includes('starting from stage "implement"'), 'starts at implement stage');

const implRuns = listActiveRuns('e2e-impl');
assert(implRuns.length === 1, 'exactly one active run for e2e-impl');
const implRun = implRuns[0];
assert(implRun.currentStageId === 'implement', 'currentStageId = implement');
assert(implRun.stages.spec.status === 'passed', 'spec auto-passed');
assert(implRun.stages['spec-review-gate'].status === 'passed', 'spec-review-gate auto-passed');
assert(implRun.stages.implement.status === 'active', 'implement stage is active');

// Test duplicate rejection
const implResult2 = handleCommand('implement', {
  projectSlug: 'e2e-impl',
  projectRoot: 'projects/e2e-impl',
  goal: '另一个任务',
}, { runStore: { createRun, listActiveRuns, advanceStage, getRun, closeRun } });
assert(implResult2.includes('Active run exists'), 'rejects when active run already exists');

closeRun(implRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });

// --- Test 9: Auto-create via sevo:fix entry point ---
console.log('\nTest 9: Auto-create via cmdEntryPoint(fix)');
const fixResult = handleCommand('fix', {
  projectSlug: 'e2e-fix',
  projectRoot: 'projects/e2e-fix',
  goal: '修复登录页面 XSS 漏洞',
}, { runStore: { createRun, listActiveRuns, advanceStage, getRun, closeRun } });

assert(fixResult.includes('Auto-created run'), 'fix creates run when none exists');
assert(fixResult.includes('starting from stage "fix"'), 'starts at fix stage');

const fixRuns = listActiveRuns('e2e-fix');
const fixRun = fixRuns[0];
assert(fixRun.currentStageId === 'fix', 'currentStageId = fix');
assert(fixRun.stages.implement.status === 'passed', 'implement auto-passed for fix entry');
closeRun(fixRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });

// --- Test 10: sevo:create without stagePlan uses default ---
console.log('\nTest 10: sevo:create uses default stagePlan when none provided');
const createNoStageResult = handleCommand('create', {
  projectSlug: 'e2e-default',
  projectRoot: 'projects/e2e-default',
  goal: '实现完整的 SEVO 流水线自检功能',
}, { runStore: { createRun, listActiveRuns, advanceStage, getRun, closeRun } });

assert(createNoStageResult.includes('Created run'), 'create without stagePlan succeeds');
assert(createNoStageResult.includes('starting at stage "spec"'), 'starts at spec with default plan');
const defaultRuns = listActiveRuns('e2e-default');
const defaultRun = defaultRuns[0];
assert(defaultRun.stagePlan.ordered.length === DEFAULT_FULL_PIPELINE_STAGES.length, 'uses full default stage count');
closeRun(defaultRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });

// --- Test 11: Review→Fix cycle with dispatch guidance ---
console.log('\nTest 11: Review→Fix cycle with structured dispatch guidance');
const cycleRun = createRun({
  projectSlug: 'e2e-cycle',
  projectRoot: 'projects/e2e-cycle',
  goal: '测试 review-fix 循环',
  entryType: 'create',
  stagePlan: { ordered: ['implement', 'review', 'fix', 'deploy'], skipped: [] },
});

advanceStage(cycleRun.pipelineRunId, 'implement', { status: 'passed' });

const reviewLabel = encode({
  projectSlug: 'e2e-cycle',
  pipelineRunId: cycleRun.pipelineRunId,
  stageId: 'review',
  attempt: 1,
});
const reviewFailResult = handleCompletion(
  { label: reviewLabel, status: 'failed', reason: 'found 3 security issues' },
  {
    runStore: runStoreDeps,
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 3,
    renderAdvancePromptTemplate,
    getStageMapping,
  },
);

assert(reviewFailResult !== null, 'review FAIL produces advance');
assert(reviewFailResult.advanceText.includes('fix'), 'advance mentions fix stage');
assert(reviewFailResult.advanceText.includes('Dispatch: Fix Task'), 'advance has fix dispatch guidance');
assert(reviewFailResult.advanceText.includes('found 3 security issues'), 'advance includes failure reason');

const fixRunState = getRun(cycleRun.pipelineRunId);
const fixLabel = encode({
  projectSlug: 'e2e-cycle',
  pipelineRunId: cycleRun.pipelineRunId,
  stageId: 'fix',
  attempt: fixRunState.stages.fix.attempt,
});
const fixPassResult = handleCompletion(
  { label: fixLabel, status: 'passed' },
  {
    runStore: runStoreDeps,
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 3,
    renderAdvancePromptTemplate,
    getStageMapping,
  },
);

assert(fixPassResult !== null, 'fix PASS produces advance');
assert(fixPassResult.advanceText.includes('review'), 'fix pass cycles back to review');
assert(fixPassResult.advanceText.includes('Dispatch: Audit Task'), 'advance has audit dispatch guidance');

const reviewRunState2 = getRun(cycleRun.pipelineRunId);
const reviewLabel2 = encode({
  projectSlug: 'e2e-cycle',
  pipelineRunId: cycleRun.pipelineRunId,
  stageId: 'review',
  attempt: reviewRunState2.stages.review.attempt,
});
const reviewPassResult = handleCompletion(
  { label: reviewLabel2, status: 'passed' },
  {
    runStore: runStoreDeps,
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 3,
    renderAdvancePromptTemplate,
    getStageMapping,
  },
);

assert(reviewPassResult !== null, 'review PASS produces advance');
assert(reviewPassResult.nextStageId === 'deploy', 'review PASS exits cycle → deploy');

closeRun(cycleRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });

// --- Test 12: Review→Fix cycle exhaustion (max attempts) ---
console.log('\nTest 12: Review→Fix cycle exhaustion');

const exhaustRun = createRun({
  projectSlug: 'e2e-exhaust',
  projectRoot: 'projects/e2e-exhaust',
  goal: '测试循环耗尽',
  entryType: 'create',
  stagePlan: { ordered: ['implement', 'review', 'fix', 'deploy'], skipped: [] },
});
advanceStage(exhaustRun.pipelineRunId, 'implement', { status: 'passed' });

for (let i = 0; i < 4; i++) {
  resetStageForRetry(exhaustRun.pipelineRunId, 'fix');
}
const exhaustState = getRun(exhaustRun.pipelineRunId);
assert(exhaustState.stages.fix.attempt === 5, `fix attempt = 5 after 4 resets`);

resetStageForRetry(exhaustRun.pipelineRunId, 'review');
const exhaustReviewLabel = encode({
  projectSlug: 'e2e-exhaust',
  pipelineRunId: exhaustRun.pipelineRunId,
  stageId: 'review',
  attempt: getRun(exhaustRun.pipelineRunId).stages.review.attempt,
});
const exhaustResult = handleCompletion(
  { label: exhaustReviewLabel, status: 'failed', reason: 'still broken' },
  {
    runStore: runStoreDeps,
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 3,
    renderAdvancePromptTemplate,
    getStageMapping,
  },
);

assert(exhaustResult !== null, 'exhaustion produces result');
assert(exhaustResult.advanceText.includes('EXHAUSTED'), 'exhaustion text includes EXHAUSTED');
assert(exhaustResult.advanceText.includes('Manual intervention'), 'exhaustion suggests manual intervention');
assert(exhaustResult.nextStageId === null, 'exhaustion has no nextStageId');

closeRun(exhaustRun.pipelineRunId, { status: 'cancelled', reason: 'e2e test cleanup' });

// --- Summary ---
console.log(`\n=== Results: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} ===\n`);
process.exit(failures > 0 ? 1 : 0);
