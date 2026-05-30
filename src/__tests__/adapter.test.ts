import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ArtifactRef, GateVerdict, ProjectConfig } from '../types/index.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';
import {
  StandaloneAdapter,
  OpenClawAdapter,
  OPENCLAW_GATE_RESULT_EVENT,
  type SpawnLike,
} from '../adapter/index.js';
import { buildTriggerStagePrompt } from '../adapter/host-adapter.js';

function makeProjectConfig(root: string): ProjectConfig {
  return {
    workspaceRoot: root,
    projectRoot: root,
    artifactRoots: [path.join(root, 'artifacts')],
    defaultAgentId: 'dev-01',
    stageAgents: {
      implement: 'cc',
      review: 'audit-01',
    },
    notifications: {
      feishuEnabled: true,
      recipientId: 'ou_test',
    },
  };
}

function makePayload(): TaskPayload {
  return {
    taskId: 'task-123',
    title: 'Implement host adapter',
    initialStage: 'implement',
    stages: ['implement', 'review', 'verify', 'ledger'],
  };
}

function makeVerdict(): GateVerdict {
  return {
    gateId: 'review-gate',
    conclusion: 'passed',
    blockers: [],
    reviewBundles: [],
  };
}

function makeArtifact(id: string, filePath: string): ArtifactRef {
  return {
    id,
    type: 'document',
    path: filePath,
    createdAt: new Date().toISOString(),
  };
}

describe('StandaloneAdapter', () => {
  it('records dispatches, returns taskId, and serves registered artifacts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-standalone-'));
    try {
      const adapter = new StandaloneAdapter(makeProjectConfig(root));
      const payload = makePayload();

      const taskId = await adapter.dispatchTask('implement', payload);
      expect(taskId).toBe('implement:task-123:1');
      expect(adapter.getDispatches()).toHaveLength(1);
      expect(adapter.getDispatches()[0]?.stage).toBe('implement');

      const artifacts = [makeArtifact('a1', path.join(root, 'artifacts', 'task-123-result.md'))];
      adapter.registerArtifacts(taskId, artifacts);

      await expect(adapter.collectArtifacts(taskId)).resolves.toEqual(artifacts);

      adapter.notifyGateResult('review', makeVerdict());
      expect(adapter.getGateNotifications()).toHaveLength(1);
      expect(adapter.getProjectConfig().defaultAgentId).toBe('dev-01');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('OpenClawAdapter', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-openclaw-'));
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'artifacts', 'implement'), { recursive: true });
    fs.mkdirSync(path.join(root, 'artifacts', 'review'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('dispatchTask returns taskId from spawn client and passes resolved agentId', async () => {
    const spawnCalls: Array<{ agentId?: string; stage: string; payload: TaskPayload }> = [];
    const spawnClient: SpawnLike = {
      spawn: vi.fn(async (request) => {
        spawnCalls.push(request);
        return { taskId: 'spawned-task-1' };
      }),
    };

    const adapter = new OpenClawAdapter({
      projectRoot: root,
      artifactRoots: [path.join(root, 'artifacts')],
      defaultAgentId: 'dev-01',
      stageAgents: { implement: 'cc' },
      spawnClient,
    });

    const taskId = await adapter.dispatchTask('implement', makePayload());

    expect(taskId).toBe('spawned-task-1');
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.agentId).toBe('cc');
    expect(spawnCalls[0]?.stage).toBe('implement');
  });

  it('collectArtifacts collects matching files from filesystem', async () => {
    const matching = path.join(root, 'artifacts', 'implement', 'task-123-output.md');
    const nestedDir = path.join(root, 'artifacts', 'review', 'task-123');
    const nested = path.join(nestedDir, 'summary.json');
    const ignored = path.join(root, 'artifacts', 'implement', 'other-task.md');

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(matching, '# result');
    fs.writeFileSync(nested, '{"ok":true}');
    fs.writeFileSync(ignored, 'ignore');

    const adapter = new OpenClawAdapter({
      projectRoot: root,
      artifactRoots: [path.join(root, 'artifacts')],
    });

    const artifacts = await adapter.collectArtifacts('task-123');

    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((a) => a.path).sort()).toEqual([matching, nested].sort());
    expect(artifacts[0]?.id).toContain('task-123');
  });

  it('notifyGateResult emits event bus event and optional notification', () => {
    const eventBus = new EventEmitter();
    const notifier = vi.fn();
    const adapter = new OpenClawAdapter({
      projectRoot: root,
      artifactRoots: [path.join(root, 'artifacts')],
      eventBus,
      notifier,
      notifications: { feishuEnabled: true, recipientId: 'ou_test' },
    });

    const received: Array<{ stage: string; verdict: GateVerdict; timestamp: string }> = [];
    eventBus.on(OPENCLAW_GATE_RESULT_EVENT, (payload) => {
      received.push(payload as { stage: string; verdict: GateVerdict; timestamp: string });
    });

    const verdict = makeVerdict();
    adapter.notifyGateResult('review', verdict);

    expect(received).toHaveLength(1);
    expect(received[0]?.stage).toBe('review');
    expect(received[0]?.verdict).toEqual(verdict);
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith('[SEVO] review gate passed (review-gate)');
  });

  it('loadProjectConfig reads project config from workspace file when provided', async () => {
    const configPath = path.join(root, 'sevo.config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      workspaceRoot: '/workspace',
      projectRoot: '/project',
      artifactRoots: ['/project/artifacts'],
      defaultAgentId: 'codex',
      stageAgents: { review: 'audit-01' },
    }));

    const adapter = new OpenClawAdapter({
      projectRoot: root,
      projectConfigPath: configPath,
      defaultAgentId: 'dev-01',
      artifactRoots: [path.join(root, 'artifacts')],
    });

    await expect(adapter.loadProjectConfig()).resolves.toEqual({
      workspaceRoot: '/workspace',
      projectRoot: '/project',
      artifactRoots: ['/project/artifacts'],
      defaultAgentId: 'codex',
      stageAgents: { review: 'audit-01' },
      notifications: undefined,
    });
  });
});

describe('buildTriggerStagePrompt', () => {
  it('injects mandatory spec-read instructions for managed implement stages', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-prompt-'));
    try {
      const projectRoot = path.join(root, 'projects', 'kivo');
      fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'docs', 'product-requirements.md'), '# Spec');

      const prompt = buildTriggerStagePrompt('pipe-kivo-001', 'implement', {
        workspaceRoot: root,
        projectRoot,
      });

      expect(prompt.startsWith('## Spec 全量阅读（强制，L2 插件注入）')).toBe(true);
      expect(prompt).toContain(`Spec 路径：${path.join(projectRoot, 'docs', 'product-requirements.md')}`);
      expect(prompt).toContain('必须实现 spec 中定义的所有功能');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not inject spec-read instructions for non-target stages', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-prompt-'));
    try {
      const projectRoot = path.join(root, 'projects', 'kivo');
      fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'docs', 'product-requirements.md'), '# Spec');

      const prompt = buildTriggerStagePrompt('pipe-kivo-001', 'spec', {
        workspaceRoot: root,
        projectRoot,
      });

      expect(prompt).not.toContain('## Spec 全量阅读（强制）');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips spec-read instructions when the spec file is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-prompt-'));
    try {
      const projectRoot = path.join(root, 'projects', 'kivo');
      fs.mkdirSync(projectRoot, { recursive: true });

      const prompt = buildTriggerStagePrompt('pipe-kivo-001', 'review', {
        workspaceRoot: root,
        projectRoot,
      });

      expect(prompt).not.toContain('## Spec 全量阅读（强制）');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
