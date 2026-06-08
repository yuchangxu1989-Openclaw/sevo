import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  handleCompletion,
  resolveConfig,
} from '../../../../extensions/sevo-pipeline/index.js';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

describe('SEVO extension completion label extraction', () => {
  it('advances completedStages when the sevo label is embedded in internal completion task text', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-extension-completion-'));
    const statePath = path.join(tempRoot, 'state', 'active-pipelines.json');
    const eventsPath = path.join(tempRoot, 'logs', 'sevo-pipeline-events.jsonl');
    const pipelineId = 'pipe-embedded-label';

    writeJson(statePath, {
      schemaVersion: 3,
      pipelines: {
        [pipelineId]: {
          projectSlug: 'sevo',
          status: 'active',
          currentStage: 'spec',
          requiredStages: ['spec', 'spec-review-gate', 'implement'],
          completedStages: [],
        },
      },
    });

    const config = resolveConfig({
      workspaceRoot: tempRoot,
      sevoRoot: tempRoot,
      statePath,
      eventsPath,
    });

    const result = handleCompletion(config, {
      status: 'completed successfully',
      task: `[Internal task completion event]
source: subagent
task: [SEVO_STAGE_ROUTE_HANDSHAKE] {"selectedStage":"spec"} [/SEVO_STAGE_ROUTE_HANDSHAKE] sevo:spec sevo 写规格
status: completed successfully`,
    });

    const state = readJson<{ pipelines: Record<string, { completedStages: string[]; currentStage: string }> }>(statePath);

    expect(result).toMatchObject({
      pipelineId,
      completedStage: 'spec',
      nextStage: 'spec-review-gate',
    });
    expect(state.pipelines[pipelineId]?.completedStages).toEqual(['spec']);
    expect(state.pipelines[pipelineId]?.currentStage).toBe('spec-review-gate');
    expect(fs.readFileSync(eventsPath, 'utf8')).toContain('completion_advanced');
  });
});
