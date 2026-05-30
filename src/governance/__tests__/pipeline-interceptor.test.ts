import { describe, expect, it } from 'vitest';

import { PipelineInterceptor } from '../../governance/pipeline-interceptor.js';
import type { RegisteredProject, SpawnInterceptContext } from '../../governance/pipeline-interceptor.js';

const PROJECTS: RegisteredProject[] = [
  {
    slug: 'sevo',
    pathPrefixes: ['projects/sevo/'],
    specPaths: ['projects/sevo/docs/product-requirements.md'],
  },
];

function makeInterceptor(llmResponse: string) {
  return new PipelineInterceptor({
    projects: PROJECTS,
    llm: { apiKey: 'test', baseUrl: 'http://localhost:0', model: 'test' },
    confidenceThreshold: 0.7,
  });
}

describe('PipelineInterceptor', () => {
  it('passes tasks with sevo: label prefix', async () => {
    const interceptor = makeInterceptor('');
    const result = await interceptor.evaluate({
      label: 'sevo:implement FR-01',
      taskPrompt: 'Implement the pipeline engine',
      agentId: 'cc',
    });
    expect(result.action).toBe('pass');
  });

  it('passes tasks with exempt: label prefix', async () => {
    const interceptor = makeInterceptor('');
    const result = await interceptor.evaluate({
      label: 'exempt:manual override',
      taskPrompt: 'Fix critical production bug',
      agentId: 'main',
    });
    expect(result.action).toBe('pass');
  });

  it('falls through to pass on LLM failure (fail-open)', async () => {
    // LLM will fail because baseUrl is unreachable
    const interceptor = new PipelineInterceptor({
      projects: PROJECTS,
      llm: { apiKey: 'fake', baseUrl: 'http://127.0.0.1:1', model: 'test' },
      confidenceThreshold: 0.7,
    });

    const result = await interceptor.evaluate({
      label: '',
      taskPrompt: 'Implement new feature in projects/sevo/src/pipeline.ts',
      agentId: 'cc',
    });

    // Should fail-open (pass) when LLM is unreachable
    expect(result.action).toBe('pass');
  });
});
