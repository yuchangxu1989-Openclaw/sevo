import { describe, expect, it } from 'vitest';

import { runDemo } from '../../cli/cmd-demo.js';

describe('cmd-demo — OKR display', () => {
  it('displays end-state goal in step 1', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const goalLine = lines.find((l) => l.includes('End-State Goal'));
    expect(goalLine).toBeDefined();

    const goalContent = lines.find((l) => l.includes('5 分钟内'));
    expect(goalContent).toBeDefined();
  });

  it('displays OKR decomposition in step 2', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const okrHeader = lines.find((l) => l.includes('OKR Decomposition'));
    expect(okrHeader).toBeDefined();

    const kr1 = lines.find((l) => l.includes('KR-1'));
    const kr2 = lines.find((l) => l.includes('KR-2'));
    const kr3 = lines.find((l) => l.includes('KR-3'));
    expect(kr1).toBeDefined();
    expect(kr2).toBeDefined();
    expect(kr3).toBeDefined();

    // FR→KR traceability
    const traceability = lines.find((l) => l.includes('FR→KR') || l.includes('FR\u2192KR'));
    expect(traceability).toBeDefined();
  });

  it('shows KR-level validation in step 5', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const krCheck = lines.find((l) => l.includes('KR Achievement Check'));
    expect(krCheck).toBeDefined();

    // Shows PDCA loop back-edge
    const pdcaLoop = lines.find((l) => l.includes('PDCA') && l.includes('implement'));
    expect(pdcaLoop).toBeDefined();
  });

  it('shows complete OKR-driven summary', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const summaryLine = lines.find((l) =>
      l.includes('目标锁定') && l.includes('OKR') && l.includes('SMART') && l.includes('PDCA'),
    );
    expect(summaryLine).toBeDefined();
  });

  it('validation result still reports gap detected and fixed', () => {
    const result = runDemo({ dryRun: true, noColor: true }, () => {});

    expect(result.validationResult.gapDetected).toBe(true);
    expect(result.validationResult.gapFixed).toBe(true);
    expect(result.validationResult.passed).toBe(true);
  });
});
