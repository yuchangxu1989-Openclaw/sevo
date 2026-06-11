import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = {
  SEVO_DATA_DIR: process.env.SEVO_DATA_DIR,
  SEVO_STATE_DIR: process.env.SEVO_STATE_DIR,
  SEVO_V2_ENABLED: process.env.SEVO_V2_ENABLED,
};

afterEach(() => {
  vi.resetModules();
  if (ORIGINAL_ENV.SEVO_DATA_DIR === undefined) delete process.env.SEVO_DATA_DIR;
  else process.env.SEVO_DATA_DIR = ORIGINAL_ENV.SEVO_DATA_DIR;
  if (ORIGINAL_ENV.SEVO_STATE_DIR === undefined) delete process.env.SEVO_STATE_DIR;
  else process.env.SEVO_STATE_DIR = ORIGINAL_ENV.SEVO_STATE_DIR;
  if (ORIGINAL_ENV.SEVO_V2_ENABLED === undefined) delete process.env.SEVO_V2_ENABLED;
  else process.env.SEVO_V2_ENABLED = ORIGINAL_ENV.SEVO_V2_ENABLED;
});

describe('plugin completion event to advance prompt injection', () => {
  it('multiplexes subagent_ended so implement completion injects review advance prompt on first-registration hosts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-plugin-advance-'));
    try {
      process.env.SEVO_DATA_DIR = path.join(root, 'data');
      process.env.SEVO_STATE_DIR = path.join(root, 'state');
      process.env.SEVO_V2_ENABLED = 'true';
      vi.resetModules();

      const [{ default: plugin }, runStore, { buildDispatchContract }] = await Promise.all([
        import('../index.js'),
        import('../src/run-store.js'),
        import('../src/stage-dispatch-contract.js'),
      ]);

      const handlers = new Map<string, Function>();
      const registrations: string[] = [];
      const logger = { debug() {}, info() {}, warn() {}, error() {} };

      plugin.register({
        config: {
          workspaceRoot: root,
          eventsPath: path.join(root, 'logs', 'sevo-pipeline-events.jsonl'),
        },
        logger,
        on(name: string, handler: Function) {
          registrations.push(name);
          if (!handlers.has(name)) handlers.set(name, handler);
        },
      });

      expect(registrations.filter((name) => name === 'subagent_ended')).toHaveLength(1);

      const run = runStore.createRun({
        projectSlug: 'sevo-plugin-advance-test',
        projectRoot: 'projects/sevo-plugin-advance-test',
        goal: '实现插件 completion event 自动注入 review advance prompt',
        entryType: 'test',
        stagePlan: { ordered: ['implement', 'review'], skipped: [] },
      });
      const { label } = buildDispatchContract({
        projectSlug: run.projectSlug,
        pipelineRunId: run.pipelineRunId,
        stageId: 'implement',
        attempt: 1,
      });

      await handlers.get('subagent_ended')?.({
        label,
        status: 'completed',
        taskId: 'plugin-advance-implement',
        codeChanges: true,
        testRun: 'passed',
      });

      const injection = handlers.get('before_prompt_build')?.({});
      expect(injection?.text).toContain('[SEVO V2 advance prompt contract]');
      expect(injection?.text).toContain('nextStage: "review"');
      expect(injection?.text).toContain('Next stage: review');
      expect(injection?.text).not.toContain('DISPATCH NEEDED');

      const updated = runStore.getRun(run.pipelineRunId);
      expect(updated?.currentStageId).toBe('review');
      expect(updated?.stages.implement.status).toBe('passed');
      expect(updated?.stages.review.status).toBe('active');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
