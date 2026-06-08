import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BlockingLevel,
  ClarificationCoordinator,
  ClarificationType,
  ResolutionSink,
  Status,
  type ClarificationHandle,
  type ClarificationPayload,
  type ClarificationResponse,
} from '../../clarification/index.js';
import type { StageRecord } from '../../types/index.js';
import { SpecStage } from '../spec-stage.js';
import type { RequirementAnalysisResponse } from '../spec-types.js';
import { StandaloneAdapter } from '../../adapter/index.js';

class MemoryClarificationAdapter {
  readonly requests: ClarificationPayload[] = [];
  private responseCallback: (response: ClarificationResponse) => void = () => {};
  private timeoutCallback: (handle: ClarificationHandle) => void = () => {};

  requestClarification(_: { type: 'user'; id?: string }, payload: ClarificationPayload): ClarificationHandle {
    this.requests.push(payload);
    return {
      clarificationId: payload.clarificationId,
      targetType: 'user',
      dispatchedAt: new Date().toISOString(),
    };
  }

  onClarificationResponse(callback: (response: ClarificationResponse) => void): void {
    this.responseCallback = callback;
  }

  onClarificationTimeout(callback: (handle: ClarificationHandle) => void): void {
    this.timeoutCallback = callback;
  }

  emitResponse(response: ClarificationResponse): void {
    this.responseCallback(response);
  }

  emitTimeout(handle: ClarificationHandle): void {
    this.timeoutCallback(handle);
  }
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-spec-stage-'));
}

describe('SpecStage', () => {
  it('generates FR and AC structure for a basic requirement', async () => {
    const tmpDir = makeTmpDir();
    const analyzer = vi.fn(async (): Promise<RequirementAnalysisResponse> => ({
      summary: 'Deliver login and session management requirements.',
      functionalRequirements: [
        {
          title: 'Email sign in',
          description: 'Users can sign in with email and password.',
          acceptanceCriteria: [
            'The sign-in form accepts email and password.',
            'Successful sign-in lands on the dashboard.',
          ],
        },
      ],
    }));

    const adapter = new StandaloneAdapter(
      {
        workspaceRoot: tmpDir,
        projectRoot: tmpDir,
      },
      { requirementAnalyzer: analyzer },
    );

    const stage = new SpecStage({
      adapter,
      now: () => '2026-04-20T03:30:00.000Z',
    });

    const output = await stage.execute({
      taskId: 'task-basic',
      description: 'Build an email login flow for admins.',
      artifactBasePath: path.join(tmpDir, 'artifacts', 'spec'),
    });

    expect(analyzer).toHaveBeenCalledWith({
      prompt: 'Build an email login flow for admins.',
      existingSpec: undefined,
    });
    expect(output.functionalRequirements).toHaveLength(1);
    expect(output.functionalRequirements[0]?.id).toBe('FR-01');
    expect(output.acceptanceCriteria.map((item) => item.id)).toEqual(['AC-1.1', 'AC-1.2']);
    expect(output.clarifications).toEqual([]);
    expect(output.artifact.type).toBe('spec-package');
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });

  it('opens clarification records when the requirement is ambiguous', async () => {
    const tmpDir = makeTmpDir();
    const clarificationAdapter = new MemoryClarificationAdapter();
    const stageRecord: StageRecord = {
      stageId: 'spec',
      status: 'active',
      attempt: 1,
      artifacts: [],
    };

    const coordinator = new ClarificationCoordinator({
      adapter: clarificationAdapter,
      getStageRecord: () => stageRecord,
      updateStageRecord: (_, updater) => {
        const updated = updater(stageRecord);
        stageRecord.status = updated.status;
        stageRecord.blockReason = updated.blockReason;
        return stageRecord;
      },
      applyResolution: () => [],
      now: () => '2026-04-20T03:35:00.000Z',
      createId: () => 'clr-spec-1',
    });

    const adapter = new StandaloneAdapter(
      {
        workspaceRoot: tmpDir,
        projectRoot: tmpDir,
      },
      {
        requirementAnalyzer: async () => ({
          summary: 'The scope is still fuzzy.',
          functionalRequirements: [],
          ambiguities: [
            {
              question: 'Do you want Wave 1 to include password reset?',
              impactScope: ['FR-01'],
              blockingLevel: BlockingLevel.BLOCKING,
              type: ClarificationType.BOUNDARY,
              resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
            },
          ],
        }),
      },
    );

    const stage = new SpecStage({
      adapter,
      clarificationCoordinator: coordinator,
      now: () => '2026-04-20T03:35:00.000Z',
    });

    const output = await stage.execute({
      taskId: 'task-clarify',
      pipelineId: 'pipe-1',
      description: 'Make auth better.',
      artifactBasePath: path.join(tmpDir, 'artifacts', 'spec'),
    });

    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]).toMatchObject({
      id: 'clr-spec-1',
      blockingLevel: BlockingLevel.BLOCKING,
      status: Status.OPEN,
    });
    expect(clarificationAdapter.requests).toHaveLength(1);
    expect(clarificationAdapter.requests[0]?.question).toContain('password reset');
    // 原则：流水线永远往前走。BLOCKING 澄清不再冻结 stage——记录照常 open/dispatch，
    // 但 stage 保持 active 继续推进，澄清作为 advisory backlog 由审计→修复循环消化。
    expect(stageRecord.status).toBe('active');
  });

  it('opens blocking clarifications for missing concept-definition answers', async () => {
    const tmpDir = makeTmpDir();
    const clarificationAdapter = new MemoryClarificationAdapter();
    const stageRecord: StageRecord = {
      stageId: 'spec',
      status: 'active',
      attempt: 1,
      artifacts: [],
    };

    const coordinator = new ClarificationCoordinator({
      adapter: clarificationAdapter,
      getStageRecord: () => stageRecord,
      updateStageRecord: (_, updater) => {
        const updated = updater(stageRecord);
        stageRecord.status = updated.status;
        stageRecord.blockReason = updated.blockReason;
        return stageRecord;
      },
      applyResolution: () => [],
      now: () => '2026-04-20T03:36:00.000Z',
      createId: () => `clr-term-${clarificationAdapter.requests.length + 1}`,
    });

    const adapter = new StandaloneAdapter(
      {
        workspaceRoot: tmpDir,
        projectRoot: tmpDir,
      },
      {
        requirementAnalyzer: async () => ({
          summary: 'Define a Draft object.',
          functionalRequirements: [
            {
              title: 'Draft',
              description: 'System stores drafts.',
              acceptanceCriteria: ['Draft can be created.'],
            },
          ],
          conceptDefinitions: [
            {
              term: 'Draft',
            },
          ],
        }),
      },
    );

    const stage = new SpecStage({
      adapter,
      clarificationCoordinator: coordinator,
      now: () => '2026-04-20T03:36:00.000Z',
    });

    const output = await stage.execute({
      taskId: 'task-term-discipline',
      pipelineId: 'pipe-term-discipline',
      description: 'Add draft management.',
      artifactBasePath: path.join(tmpDir, 'artifacts', 'spec'),
    });

    expect(output.conceptDefinitions).toHaveLength(1);
    expect(output.clarifications).toHaveLength(4);
    expect(clarificationAdapter.requests).toHaveLength(4);
    expect(clarificationAdapter.requests.map((item) => item.question)).toEqual([
      '概念「Draft」存在是为了解决什么问题？',
      '概念「Draft」的使用者是谁？',
      '概念「Draft」如何被使用或交互？',
      '概念「Draft」的适用边界是什么？什么情况下不适用？',
    ]);
    // 原则：流水线永远往前走。BLOCKING 澄清不再冻结 stage，保持 active 继续推进。
    expect(stageRecord.status).toBe('active');
  });

  it('supports incremental requirement augmentation', async () => {
    const tmpDir = makeTmpDir();
    const adapter = new StandaloneAdapter(
      {
        workspaceRoot: tmpDir,
        projectRoot: tmpDir,
      },
      {
        requirementAnalyzer: async () => ({
          summary: 'Add password reset to the existing auth spec.',
          functionalRequirements: [
            {
              title: 'Password reset',
              description: 'Users can request a password reset email.',
              acceptanceCriteria: [
                'The reset form accepts a verified email address.',
              ],
            },
          ],
        }),
      },
    );

    const stage = new SpecStage({
      adapter,
      now: () => '2026-04-20T03:40:00.000Z',
    });

    const output = await stage.execute({
      taskId: 'task-incremental',
      description: 'Add password reset support.',
      existingSpec: {
        summary: 'Existing auth scope.',
        functionalRequirements: [
          {
            id: 'FR-01',
            title: 'Email sign in',
            description: 'Users can sign in.',
            acceptanceCriteria: [
              {
                id: 'AC-1.1',
                description: 'Users can submit email and password.',
                requirementId: 'FR-01',
              },
            ],
          },
        ],
        acceptanceCriteria: [
          {
            id: 'AC-1.1',
            description: 'Users can submit email and password.',
            requirementId: 'FR-01',
          },
        ],
        clarifications: [],
        artifact: {
          id: 'task-incremental:spec-package',
          type: 'spec-package',
          path: path.join(tmpDir, 'artifacts', 'spec', 'task-incremental-existing.json'),
          createdAt: '2026-04-19T00:00:00.000Z',
        },
      },
      artifactBasePath: path.join(tmpDir, 'artifacts', 'spec'),
    });

    expect(output.functionalRequirements).toHaveLength(2);
    expect(output.functionalRequirements[1]?.id).toBe('FR-02');
    expect(output.acceptanceCriteria.map((item) => item.id)).toEqual(['AC-1.1', 'AC-2.1']);
  });
});
