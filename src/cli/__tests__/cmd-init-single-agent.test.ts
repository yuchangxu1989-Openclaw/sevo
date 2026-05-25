import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createProgram } from '../index.js';

describe('sevo init single-agent degradation', () => {
  let tmpDir: string;
  let configPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-init-solo-'));
    configPath = path.join(tmpDir, 'openclaw.json');
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [{ id: 'solo-01' }] } }, null, 2));
    process.env.OPENCLAW_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-assigns all role pools to the only available agent without interaction', async () => {
    const originalCwd = process.cwd();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      process.chdir(tmpDir);
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(['node', 'sevo', 'init', '--name', 'solo-project']);

      const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'sevo.json'), 'utf8'));
      expect(config.roleAssignment.roles).toEqual({
        product: ['solo-01'],
        ux: ['solo-01'],
        architect: ['solo-01'],
        coder: ['solo-01'],
        auditor: ['solo-01'],
      });
      expect(logSpy.mock.calls.flat().join('\n')).toContain('检测到单 Agent 环境（solo-01），已自动分配所有角色。流水线将以降级模式运行。');
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('role'));
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
