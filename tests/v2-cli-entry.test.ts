import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(PROJECT_ROOT, 'bin', 'sevo.js');

function runCli(cwd: string, args: string[]): string {
  return execFileSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SEVO_EMBEDDING_DISABLED: '1' },
  });
}

function runCliFailure(cwd: string, args: string[]): string {
  try {
    execFileSync('node', [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SEVO_EMBEDDING_DISABLED: '1' },
    });
    return '';
  } catch (error: any) {
    return `${error.stdout || ''}${error.stderr || ''}`;
  }
}

describe('V2 npm CLI entry', () => {
  it('uses cwd .sevo storage for init/status/create/advance without dist CLI', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-v2-cli-'));
    try {
      const init = runCli(cwd, ['init']);
      expect(init).toContain('SEVO initialized.');
      expect(fs.existsSync(path.join(cwd, '.sevo', 'data', 'pipelines'))).toBe(true);
      expect(fs.existsSync(path.join(cwd, '.sevo', 'state'))).toBe(true);

      const emptyStatus = runCli(cwd, ['status']);
      expect(emptyStatus).toContain('No active pipeline runs.');

      const created = runCli(cwd, ['project', 'create', 'my-app', '--goal', 'Implement sample application pipeline']);
      expect(created).toContain('Created run');
      expect(created).toContain('my-app');
      expect(fs.existsSync(path.join(cwd, '.sevo', 'data', 'active-index.json'))).toBe(true);

      const activeStatus = runCli(cwd, ['status']);
      expect(activeStatus).toContain('my-app');
      expect(activeStatus).toContain('running @ spec');

      const advanced = runCli(cwd, ['advance']);
      expect(advanced).toContain('Advanced run');
      expect(advanced).toContain('Current stage: spec-review-gate');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('rejects path traversal run ids instead of reading outside cwd .sevo', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-v2-cli-'));
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-v2-external-'));
    try {
      const escapedRunDir = path.join(external, 'evil');
      fs.mkdirSync(escapedRunDir, { recursive: true });
      fs.writeFileSync(path.join(escapedRunDir, 'state.json'), JSON.stringify({
        pipelineRunId: 'evil',
        projectSlug: 'escaped',
        status: 'running',
        currentStageId: 'spec',
        goal: 'should not be read',
        stagePlan: { ordered: ['spec'], skipped: [] },
        stages: { spec: { status: 'active' } },
      }), 'utf8');

      runCli(cwd, ['init']);
      const traversal = path.relative(path.join(cwd, '.sevo', 'data', 'pipelines'), escapedRunDir);
      const output = runCliFailure(cwd, ['status', '--run', traversal]);
      expect(output).toContain('not found');
      expect(output).not.toContain('escaped');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
});