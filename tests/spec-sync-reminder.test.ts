import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as mod from '../index.js';

const TOKEN = 'test_doc_token_123';
const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');

describe('sevo spec sync reminder helpers', () => {
  let tempRoot: string;
  let originalRuntimeConfig: unknown;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-spec-sync-'));
    originalRuntimeConfig = (globalThis as any)[GLOBAL_KEY]?.runtimeConfig ?? null;
    mod.resetSpecSyncReminderStateForTests();
    const globalState = (globalThis as any)[GLOBAL_KEY];
    if (globalState) {
      globalState.runtimeConfig = {
        ...(globalState.runtimeConfig || {}),
        workspaceRoot: tempRoot,
      };
    }
  });

  afterEach(() => {
    mod.resetSpecSyncReminderStateForTests();
    const globalState = (globalThis as any)[GLOBAL_KEY];
    if (globalState) {
      globalState.runtimeConfig = originalRuntimeConfig;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function setupProject(slug = 'sevo') {
    const docsDir = path.join(tempRoot, 'projects', slug, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'SOURCE-OF-TRUTH.md'), `文档 Token：${TOKEN}\n`);
    fs.writeFileSync(path.join(docsDir, 'product-requirements.md'), '# spec\n');
    return {
      projectRoot: path.join(tempRoot, 'projects', slug),
      specPath: path.join(docsDir, 'product-requirements.md'),
      relativeSpecPath: `projects/${slug}/docs/product-requirements.md`,
    };
  }

  it('matches docs top-level markdown, including product-requirements.md', () => {
    const { specPath } = setupProject();
    expect(mod.isSpecLikeMarkdownPath(specPath)).toBe(true);
    expect(mod.isSpecLikeMarkdownPath('projects/sevo/docs/architecture.md')).toBe(true);
    expect(mod.isSpecLikeMarkdownPath('projects/sevo/src/index.ts')).toBe(false);
    expect(mod.isSpecLikeMarkdownPath('projects/sevo/docs/nested/note.md')).toBe(false);
  });

  it('queues reminder only when SOURCE-OF-TRUTH exists', () => {
    const { specPath } = setupProject();
    expect(mod.queueSpecSyncReminderForPath(specPath, 'agent:any:test')).toBe(true);
    expect(mod.consumeSpecSyncReminder('agent:main:test')?.token).toBe(TOKEN);

    const docsDir = path.join(tempRoot, 'projects', 'missing', 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'product-requirements.md'), '# missing\n');
    expect(mod.queueSpecSyncReminderForPath(path.join(docsDir, 'product-requirements.md'), 'agent:any:test')).toBe(false);
  });

  it('builds the required reminder text with complete command template', () => {
    const { projectRoot, specPath } = setupProject();
    const reminder = mod.buildSpecSyncReminder(specPath, projectRoot, TOKEN);
    expect(reminder).toContain('检测到 product-requirements.md 被修改。飞书文档是 spec 唯一真相源，必须同步推送：');
    expect(reminder).toContain(`修改文件：${specPath}`);
    expect(reminder).toContain(`当前检测到：${path.join(projectRoot, 'docs', 'SOURCE-OF-TRUTH.md')}`);
    expect(reminder).toContain(`lark-cli docs +update --doc ${TOKEN} --mode overwrite --markdown "$(cat ${specPath})" --as bot`);
    expect(reminder).toContain('未推送飞书 = spec 变更不完整。');
  });

  it('queues from subagent write/edit events and consumes only once per modification', () => {
    const { relativeSpecPath, specPath } = setupProject();
    const ctx = { sessionKey: 'agent:cc:session-1' };

    expect(mod.queueSpecSyncReminderFromToolEvent({ toolName: 'write', params: { path: relativeSpecPath } }, ctx)).toBe(true);
    const reminder = mod.consumeSpecSyncReminder('agent:main:session-1');
    expect(reminder?.filePath).toBe(relativeSpecPath);
    expect(reminder?.token).toBe(TOKEN);
    expect(mod.consumeSpecSyncReminder('agent:main:session-1')).toBe(null);

    expect(mod.queueSpecSyncReminderFromToolEvent({ toolName: 'edit', params: { path: specPath } }, ctx)).toBe(true);
    expect(mod.consumeSpecSyncReminder('agent:main:session-1')?.filePath).toBe(specPath);
  });

  it('skips main-session writes, failed writes, and nested docs files', () => {
    const { relativeSpecPath } = setupProject();

    expect(mod.queueSpecSyncReminderFromToolEvent(
      { toolName: 'write', params: { path: relativeSpecPath } },
      { sessionKey: 'agent:main:session-1' },
    )).toBe(false);

    expect(mod.queueSpecSyncReminderFromToolEvent(
      { toolName: 'write', params: { path: relativeSpecPath }, error: 'boom' },
      { sessionKey: 'agent:cc:session-1' },
    )).toBe(false);

    expect(mod.queueSpecSyncReminderFromToolEvent(
      { toolName: 'write', params: { path: relativeSpecPath }, exitCode: 1 },
      { sessionKey: 'agent:cc:session-1' },
    )).toBe(false);

    expect(mod.queueSpecSyncReminderFromToolEvent(
      { toolName: 'write', params: { path: 'projects/sevo/docs/nested/note.md' } },
      { sessionKey: 'agent:cc:session-1' },
    )).toBe(false);
  });
});
