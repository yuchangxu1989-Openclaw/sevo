import { afterEach, describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

import { DeployStage } from '../deploy-stage.js';
import type { DeployExecFileSync, DeployStageInput } from '../deploy-types.js';
import type { ArtifactRef } from '../../types/index.js';

function makeCandidates(): ArtifactRef[] {
  return [
    { id: 'impl-001:code', type: 'implementation', path: 'dist/bundle.js', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'reg-001:bundle', type: 'regression-bundle', path: 'artifacts/regression.json', createdAt: '2025-01-01T00:00:00Z' },
  ];
}

function makeInput(overrides?: Partial<DeployStageInput>): DeployStageInput {
  return {
    taskId: 'deploy-001',
    pipelineId: 'pipe-1',
    version: '1.0.0',
    source: 'sevo-core',
    scope: 'auth-module',
    releaseNotes: 'Initial release of auth module',
    candidateArtifacts: makeCandidates(),
    targets: [{ environment: 'staging' }, { environment: 'production' }],
    artifactBasePath: path.join(os.tmpdir(), 'sevo-deploy-test'),
    ...overrides,
  };
}

describe('DeployStage', () => {
  it('builds release artifact with version, source, scope (AC-4.29)', async () => {
    const stage = new DeployStage({
      adapter: {},
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.releaseArtifact.version).toBe('1.0.0');
    expect(output.releaseArtifact.source).toBe('sevo-core');
    expect(output.releaseArtifact.scope).toBe('auth-module');
    expect(output.releaseArtifact.artifacts).toHaveLength(2);
  });

  it('associates deploy with pipeline artifacts (AC-4.30)', async () => {
    const deployed: string[] = [];
    const stage = new DeployStage({
      adapter: {
        deploy: async (req) => {
          deployed.push(req.target.environment);
          return { success: true };
        },
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(deployed).toEqual(['staging', 'production']);
    expect(output.artifact.type).toBe('release-artifact');
    expect(output.metadata.targetCount).toBe(2);
  });

  it('deploy failure does not pollute candidate (AC-4.31)', async () => {
    const stage = new DeployStage({
      adapter: {
        deploy: async () => ({ success: false, error: 'network timeout' }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.metadata.success).toBe(false);
    expect(output.verifyReady).toBe(false);
    // Candidate artifacts remain intact in the release artifact
    expect(output.releaseArtifact.artifacts).toHaveLength(2);
  });

  it('successful deploy produces verify-ready output (AC-4.32)', async () => {
    const stage = new DeployStage({
      adapter: {
        deploy: async () => ({ success: true }),
      },
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput());
    expect(output.verifyReady).toBe(true);
    expect(output.artifact.path).toContain('release-artifact.json');
  });

  it('runs publish-release.sh when publishTargets are configured', async () => {
    const execCalls: Array<{ file: string; args: readonly string[]; cwd?: string }> = [];
    const execFileSync: DeployExecFileSync = (file, args, options) => {
      execCalls.push({ file, args, cwd: options?.cwd });
      return [
        '[7/7] 三平台状态汇总',
        '  npm: sevo-pipeline@1.2.3',
        '  github: https://github.com/example/sevo.git @ abcdef123456',
      ].join('\n');
    };

    const stage = new DeployStage({
      adapter: {
        deploy: async () => ({ success: true }),
      },
      execFileSync,
      now: () => '2025-01-01T00:00:00Z',
      publishProject: 'sevo',
      publishBump: 'patch',
      publishCommandCwd: '/tmp/sevo',
    });

    const output = await stage.execute(makeInput({
      publishScript: '/custom/publish-release.sh',
      publishTargets: ['npm', 'github'],
    }));

    expect(execCalls).toEqual([
      {
        file: 'bash',
        args: ['/custom/publish-release.sh', 'sevo', 'patch'],
        cwd: '/tmp/sevo',
      },
    ]);
    expect(output.metadata.publishExecuted).toBe(true);
    expect(output.metadata.publishSuccess).toBe(true);
    expect(output.publishResult).toBeDefined();
    expect(output.publishResult?.scriptPath).toBe('/custom/publish-release.sh');
    expect(output.publishResult?.statuses).toEqual([
      {
        target: 'npm',
        reported: true,
        success: true,
        detail: 'npm: sevo-pipeline@1.2.3',
      },
      {
        target: 'github',
        reported: true,
        success: true,
        detail: 'github: https://github.com/example/sevo.git @ abcdef123456',
      },
    ]);
    expect(output.verifyReady).toBe(true);
  });

  it('marks deploy failed when publish targets are requested but script output is incomplete', async () => {
    const execFileSync: DeployExecFileSync = () => '  npm: sevo-pipeline@1.2.3\n';
    const stage = new DeployStage({
      adapter: {
        deploy: async () => ({ success: true }),
      },
      execFileSync,
      // NFR-5.18: deploy stage 不再隐含宿主默认路径，测试必须显式传入。
      publishScript: '/custom/publish-release.sh',
      now: () => '2025-01-01T00:00:00Z',
    });

    const output = await stage.execute(makeInput({ publishTargets: ['npm', 'clawhub'] }));
    expect(output.metadata.publishExecuted).toBe(true);
    expect(output.metadata.publishSuccess).toBe(false);
    expect(output.metadata.success).toBe(false);
    expect(output.verifyReady).toBe(false);
    expect(output.publishResult?.statuses).toEqual([
      {
        target: 'npm',
        reported: true,
        success: true,
        detail: 'npm: sevo-pipeline@1.2.3',
      },
      {
        target: 'clawhub',
        reported: false,
        success: false,
        detail: 'Target requested but publish script does not report ClawHub status',
      },
    ]);
  });

  // ─── NFR-5.18 / NFR-5.19 / ADR-016: publishScript resolution guard ───
  describe('publishScript resolution (NFR-5.18 / NFR-5.19)', () => {
    const SAVED_ENV = process.env.SEVO_PUBLISH_SCRIPT;
    afterEach(() => {
      if (SAVED_ENV === undefined) delete process.env.SEVO_PUBLISH_SCRIPT;
      else process.env.SEVO_PUBLISH_SCRIPT = SAVED_ENV;
    });

    it('throws SEVO_PUBLISH_SCRIPT_MISSING when nothing supplied (default-deny)', async () => {
      delete process.env.SEVO_PUBLISH_SCRIPT;
      const stage = new DeployStage({
        adapter: { deploy: async () => ({ success: true }) },
        execFileSync: () => '',
        now: () => '2025-01-01T00:00:00Z',
      });
      await expect(
        stage.execute(makeInput({ publishTargets: ['npm'] })),
      ).rejects.toThrow(/SEVO_PUBLISH_SCRIPT_MISSING/);
    });

    it('reads SEVO_PUBLISH_SCRIPT env when no input/options override is set', async () => {
      process.env.SEVO_PUBLISH_SCRIPT = '/tmp/from-env-publish.sh';
      let observedArgs: readonly string[] | null = null;
      const stage = new DeployStage({
        adapter: { deploy: async () => ({ success: true }) },
        execFileSync: ((_cmd: string, args: ReadonlyArray<string>) => {
          observedArgs = args;
          return 'npm: sevo-pipeline@1.2.3\n';
        }) as DeployExecFileSync,
        now: () => '2025-01-01T00:00:00Z',
      });
      const out = await stage.execute(makeInput({ publishTargets: ['npm'] }));
      expect(observedArgs?.[0]).toBe('/tmp/from-env-publish.sh');
      expect(out.publishResult?.scriptPath).toBe('/tmp/from-env-publish.sh');
    });

    it('OPTIONS publishScript wins over env', async () => {
      process.env.SEVO_PUBLISH_SCRIPT = '/tmp/env-loses.sh';
      let observedArgs: readonly string[] | null = null;
      const stage = new DeployStage({
        adapter: { deploy: async () => ({ success: true }) },
        execFileSync: ((_cmd: string, args: ReadonlyArray<string>) => {
          observedArgs = args;
          return 'npm: sevo-pipeline@1.2.3\n';
        }) as DeployExecFileSync,
        publishScript: '/tmp/options-wins.sh',
        now: () => '2025-01-01T00:00:00Z',
      });
      const out = await stage.execute(makeInput({ publishTargets: ['npm'] }));
      expect(observedArgs?.[0]).toBe('/tmp/options-wins.sh');
      expect(out.publishResult?.scriptPath).toBe('/tmp/options-wins.sh');
    });

    it('input.publishScript wins over OPTIONS and env', async () => {
      process.env.SEVO_PUBLISH_SCRIPT = '/tmp/env-3rd.sh';
      let observedArgs: readonly string[] | null = null;
      const stage = new DeployStage({
        adapter: { deploy: async () => ({ success: true }) },
        execFileSync: ((_cmd: string, args: ReadonlyArray<string>) => {
          observedArgs = args;
          return 'npm: sevo-pipeline@1.2.3\n';
        }) as DeployExecFileSync,
        publishScript: '/tmp/options-2nd.sh',
        now: () => '2025-01-01T00:00:00Z',
      });
      const out = await stage.execute(
        makeInput({
          publishTargets: ['npm'],
          publishScript: '/tmp/input-1st.sh',
        }),
      );
      expect(observedArgs?.[0]).toBe('/tmp/input-1st.sh');
      expect(out.publishResult?.scriptPath).toBe('/tmp/input-1st.sh');
    });
  });
});
