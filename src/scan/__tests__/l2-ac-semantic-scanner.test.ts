import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CodeMapGenerator } from '../code-map-generator.js';
import { L2ACSemanticScanner } from '../l2-ac-semantic-scanner.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function createProjectFixture() {
  const root = mkdtempSync(join(tmpdir(), 'sevo-l2-v2-'));

  // src/ directory
  const src = join(root, 'src');
  mkdirSync(join(src, '__tests__'), { recursive: true });
  writeFileSync(
    join(src, 'scanner.ts'),
    '/** L2 semantic scanner for AC coverage */\nexport class L2ACSemanticScanner {\n  async scan() { return true; }\n}\n',
  );
  writeFileSync(join(src, '__tests__', 'scanner.test.ts'), 'import { L2ACSemanticScanner } from "../scanner";\nit("scans", () => {});\n');

  // hooks/ directory (outside src/)
  const hooks = join(root, 'hooks');
  mkdirSync(join(hooks, 'intent-injection'), { recursive: true });
  writeFileSync(
    join(hooks, 'intent-injection', 'handler.js'),
    '// Intent injection hook - injects knowledge into agent prompts\nmodule.exports = { handleMessage, injectKnowledge };\nfunction handleMessage(msg) { return msg; }\nfunction injectKnowledge(ctx) { return ctx; }\n',
  );

  // scripts/ directory
  const scripts = join(root, 'scripts');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(
    join(scripts, 'extract-cron.sh'),
    '#!/bin/bash\n# Session extraction cron job\nfunction extract_sessions() {\n  echo "extracting"\n}\nextract_sessions\n',
  );

  // web/ directory
  const web = join(root, 'web', 'src');
  mkdirSync(web, { recursive: true });
  writeFileSync(
    join(web, 'dashboard.tsx'),
    '/** Dashboard component for pipeline visualization */\nexport function Dashboard() { return <div>Pipeline</div>; }\nexport function PipelineStatus() { return <span>OK</span>; }\n',
  );

  // spec file
  const spec = join(root, 'spec.md');
  writeFileSync(
    spec,
    [
      '### FR-29 Tiered Endgame Gap Scan',
      '',
      '- AC-29.1：L1 file scanner checks compilation and test pass.',
      '- AC-29.4：L2 scanning uses semantic LLM mapping and logs prompts.',
      '- AC-29.5：Scanner covers hooks/ and scripts/ directories.',
      '',
      '### FR-10 Knowledge Injection',
      '',
      '- AC-10.1：Intent injection hook injects relevant knowledge into agent prompts on message received.',
      '- AC-10.2：Session extraction cron runs every 2 hours.',
      '',
      '### FR-15 Pipeline Dashboard',
      '',
      '- AC-15.1：Dashboard displays pipeline status in real-time.',
      '',
    ].join('\n'),
  );

  return { root, src, spec };
}

// ─── Code Map Generator Tests ─────────────────────────────────────────────────

describe('CodeMapGenerator', () => {
  it('generates entries for all configured directories', () => {
    const { root } = createProjectFixture();
    const generator = new CodeMapGenerator();

    const entries = generator.generate({
      projectRoot: root,
      scanDirs: ['.'],
    });

    const paths = entries.map((e) => e.relativePath);
    expect(paths).toContain('src/scanner.ts');
    expect(paths).toContain('hooks/intent-injection/handler.js');
    expect(paths).toContain('scripts/extract-cron.sh');
    expect(paths).toContain('web/src/dashboard.tsx');
    expect(paths).toContain('src/__tests__/scanner.test.ts');
  });

  it('extracts exports from TypeScript files', () => {
    const { root } = createProjectFixture();
    const generator = new CodeMapGenerator();

    const entries = generator.generate({ projectRoot: root, scanDirs: ['.'] });
    const scanner = entries.find((e) => e.relativePath === 'src/scanner.ts');

    expect(scanner?.exports).toContain('L2ACSemanticScanner');
  });

  it('extracts exports from CommonJS modules', () => {
    const { root } = createProjectFixture();
    const generator = new CodeMapGenerator();

    const entries = generator.generate({ projectRoot: root, scanDirs: ['.'] });
    const handler = entries.find((e) => e.relativePath === 'hooks/intent-injection/handler.js');

    expect(handler?.exports).toContain('handleMessage');
    expect(handler?.exports).toContain('injectKnowledge');
  });

  it('extracts header comments', () => {
    const { root } = createProjectFixture();
    const generator = new CodeMapGenerator();

    const entries = generator.generate({ projectRoot: root, scanDirs: ['.'] });
    const scanner = entries.find((e) => e.relativePath === 'src/scanner.ts');
    const handler = entries.find((e) => e.relativePath === 'hooks/intent-injection/handler.js');

    expect(scanner?.headerComment).toContain('L2 semantic scanner');
    expect(handler?.headerComment).toContain('Intent injection hook');
  });

  it('renders compact text representation', () => {
    const { root } = createProjectFixture();
    const generator = new CodeMapGenerator();

    const entries = generator.generate({ projectRoot: root, scanDirs: ['.'] });
    const text = generator.renderText(entries);

    expect(text).toContain('## src/scanner.ts');
    expect(text).toContain('exports: L2ACSemanticScanner');
    expect(text).toContain('## hooks/intent-injection/handler.js');
  });

  it('respects scanDirs filter', () => {
    const { root } = createProjectFixture();
    const generator = new CodeMapGenerator();

    const entries = generator.generate({
      projectRoot: root,
      scanDirs: ['src', 'hooks'],
    });

    const paths = entries.map((e) => e.relativePath);
    expect(paths).toContain('src/scanner.ts');
    expect(paths).toContain('hooks/intent-injection/handler.js');
    expect(paths).not.toContain('scripts/extract-cron.sh');
    expect(paths).not.toContain('web/src/dashboard.tsx');
  });

  it('ignores node_modules and .git', () => {
    const { root } = createProjectFixture();
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};\n');

    const generator = new CodeMapGenerator();
    const entries = generator.generate({ projectRoot: root, scanDirs: ['.'] });
    const paths = entries.map((e) => e.relativePath);

    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  });
});

// ─── L2 AC Semantic Scanner Tests ─────────────────────────────────────────────

describe('L2ACSemanticScanner (three-phase pipeline)', () => {
  it('runs full pipeline with mocked LLM and produces correct report', async () => {
    const { root, spec } = createProjectFixture();

    let callCount = 0;
    const llmClient = {
      async chat(messages: Array<{ role: string; content: string }>) {
        callCount++;
        const content = messages.find((m) => m.role === 'user')?.content ?? '';

        // Phase 2: Batch Triage
        if (content.includes('Code Map') && content.includes('Classify')) {
          return JSON.stringify([
            { acId: 'AC-29.1', status: 'covered', files: ['src/scanner.ts'], rationale: 'Scanner class exists' },
            { acId: 'AC-29.4', status: 'covered', files: ['src/scanner.ts'], rationale: 'Semantic scanner with LLM' },
            { acId: 'AC-29.5', status: 'suspect', files: ['src/scanner.ts'], rationale: 'Need to verify multi-dir support' },
            { acId: 'AC-10.1', status: 'covered', files: ['hooks/intent-injection/handler.js'], rationale: 'handleMessage export' },
            { acId: 'AC-10.2', status: 'suspect', files: ['scripts/extract-cron.sh'], rationale: 'Cron script exists but need to verify schedule' },
            { acId: 'AC-15.1', status: 'uncovered', files: ['web/src/dashboard.tsx'], rationale: 'Dashboard exists but unclear if real-time' },
          ]);
        }

        // Phase 3: Precise Verification (for suspect + uncovered)
        if (content.includes('Source Code') && content.includes('Verify')) {
          return JSON.stringify([
            { acId: 'AC-29.5', status: 'covered', confidence: 0.85, file: 'src/scanner.ts', lineStart: 2, lineEnd: 3, rationale: 'scan method supports multi-dir' },
            { acId: 'AC-10.2', status: 'covered', confidence: 0.9, file: 'scripts/extract-cron.sh', lineStart: 3, lineEnd: 5, rationale: 'extract_sessions function for cron' },
            { acId: 'AC-15.1', status: 'needs-review', confidence: 0.5, file: 'web/src/dashboard.tsx', lineStart: 1, lineEnd: 2, rationale: 'Dashboard renders but no real-time mechanism visible' },
          ]);
        }

        return '[]';
      },
    };

    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: root,
      projectRoot: root,
      scanDirs: ['.'],
      llmClient,
      writeReport: false,
    } as any);

    // Should have 6 entries total
    expect(report.entries).toHaveLength(6);

    // Covered from triage (not sent to verification)
    const ac291 = report.entries.find((e) => e.acId === 'AC-29.1');
    expect(ac291?.status).toBe('covered');
    expect(ac291?.confidence).toBe(0.8); // default for triage-only covered

    const ac294 = report.entries.find((e) => e.acId === 'AC-29.4');
    expect(ac294?.status).toBe('covered');

    // Verified in Phase 3
    const ac295 = report.entries.find((e) => e.acId === 'AC-29.5');
    expect(ac295?.status).toBe('covered');
    expect(ac295?.confidence).toBe(0.85);

    const ac102 = report.entries.find((e) => e.acId === 'AC-10.2');
    expect(ac102?.status).toBe('covered');
    expect(ac102?.confidence).toBe(0.9);
    expect(ac102?.evidence.file).toBe('scripts/extract-cron.sh');

    // Needs-review from verification
    const ac151 = report.entries.find((e) => e.acId === 'AC-15.1');
    expect(ac151?.status).toBe('needs-review');
    expect(ac151?.confidence).toBe(0.5);

    // Overall: pass is false because 'needs-review' entries exist (deny by default)
    expect(report.pass).toBe(false);

    // LLM was called only 2 times (1 triage batch + 1 verification batch)
    // vs old approach: 6 calls (one per AC)
    expect(callCount).toBe(2);
  });

  it('handles uncovered ACs correctly', async () => {
    const { root, spec } = createProjectFixture();

    const llmClient = {
      async chat(messages: Array<{ role: string; content: string }>) {
        const content = messages.find((m) => m.role === 'user')?.content ?? '';

        if (content.includes('Classify')) {
          return JSON.stringify([
            { acId: 'AC-29.1', status: 'uncovered', files: [], rationale: 'No scanner found' },
            { acId: 'AC-29.4', status: 'uncovered', files: [], rationale: 'No LLM mapping' },
            { acId: 'AC-29.5', status: 'uncovered', files: [], rationale: 'No multi-dir' },
            { acId: 'AC-10.1', status: 'uncovered', files: [], rationale: 'No injection' },
            { acId: 'AC-10.2', status: 'uncovered', files: [], rationale: 'No cron' },
            { acId: 'AC-15.1', status: 'uncovered', files: [], rationale: 'No dashboard' },
          ]);
        }

        if (content.includes('Verify')) {
          return JSON.stringify([
            { acId: 'AC-29.1', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'Not found' },
            { acId: 'AC-29.4', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'Not found' },
            { acId: 'AC-29.5', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'Not found' },
            { acId: 'AC-10.1', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'Not found' },
            { acId: 'AC-10.2', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'Not found' },
            { acId: 'AC-15.1', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'Not found' },
          ]);
        }

        return '[]';
      },
    };

    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: root,
      projectRoot: root,
      scanDirs: ['.'],
      llmClient,
      writeReport: false,
    } as any);

    expect(report.pass).toBe(false);
    expect(report.entries.every((e) => e.status === 'uncovered')).toBe(true);
  });

  it('falls back gracefully when LLM returns unparseable response', async () => {
    const { root, spec } = createProjectFixture();

    const llmClient = {
      async chat() {
        return 'Sorry, I cannot process this request.';
      },
    };

    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: root,
      projectRoot: root,
      scanDirs: ['.'],
      llmClient,
      writeReport: false,
    } as any);

    // All should be needs-review (graceful degradation, not crash)
    expect(report.entries).toHaveLength(6);
    expect(report.entries.every((e) => e.status === 'needs-review')).toBe(true);
  });

  it('backward compatible: works with old L2ScanInput (sourceDir only)', async () => {
    const { root, src, spec } = createProjectFixture();

    const llmClient = {
      async chat(messages: Array<{ role: string; content: string }>) {
        const content = messages.find((m) => m.role === 'user')?.content ?? '';
        if (content.includes('Classify')) {
          return JSON.stringify([
            { acId: 'AC-29.1', status: 'covered', files: ['scanner.ts'], rationale: 'Found' },
            { acId: 'AC-29.4', status: 'covered', files: ['scanner.ts'], rationale: 'Found' },
            { acId: 'AC-29.5', status: 'covered', files: ['scanner.ts'], rationale: 'Found' },
            { acId: 'AC-10.1', status: 'covered', files: ['scanner.ts'], rationale: 'Found' },
            { acId: 'AC-10.2', status: 'covered', files: ['scanner.ts'], rationale: 'Found' },
            { acId: 'AC-15.1', status: 'covered', files: ['scanner.ts'], rationale: 'Found' },
          ]);
        }
        return '[]';
      },
    };

    // Old-style input: only sourceDir, no projectRoot/scanDirs
    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: src,
      llmClient,
      writeReport: false,
    });

    expect(report.entries).toHaveLength(6);
    expect(report.pass).toBe(true);
  });

  it('limits LLM calls: large AC count uses batching', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l2-batch-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'main.ts'), 'export function main() {}\n');

    // Generate spec with 200 ACs
    const acLines = Array.from({ length: 200 }, (_, i) =>
      `- AC-1.${i + 1}：Feature ${i + 1} does something.`,
    ).join('\n');
    const spec = join(root, 'spec.md');
    writeFileSync(spec, `### FR-1 Big Feature\n\n${acLines}\n`);

    let callCount = 0;
    const llmClient = {
      async chat(messages: Array<{ role: string; content: string }>) {
        callCount++;
        const content = messages.find((m) => m.role === 'user')?.content ?? '';

        if (content.includes('Classify')) {
          // Parse how many ACs are in this batch
          const acMatches = content.match(/- AC-\d+\.\d+/g) ?? [];
          return JSON.stringify(
            acMatches.map((m) => {
              const acId = m.replace('- ', '').split(' ')[0];
              return { acId, status: 'covered', files: ['src/main.ts'], rationale: 'Found' };
            }),
          );
        }
        return '[]';
      },
    };

    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: root,
      projectRoot: root,
      scanDirs: ['.'],
      batchSize: 100,
      llmClient,
      writeReport: false,
    } as any);

    // 200 ACs with batchSize=100 → 2 triage calls, 0 verification calls
    expect(callCount).toBe(2);
    expect(report.entries).toHaveLength(200);
    expect(report.pass).toBe(true);
  });

  it('records logs for each LLM call phase', async () => {
    const { root, spec } = createProjectFixture();

    const llmClient = {
      async chat(messages: Array<{ role: string; content: string }>) {
        const content = messages.find((m) => m.role === 'user')?.content ?? '';
        if (content.includes('Classify')) {
          return JSON.stringify([
            { acId: 'AC-29.1', status: 'suspect', files: ['src/scanner.ts'], rationale: 'Check' },
            { acId: 'AC-29.4', status: 'covered', files: ['src/scanner.ts'], rationale: 'OK' },
            { acId: 'AC-29.5', status: 'covered', files: ['src/scanner.ts'], rationale: 'OK' },
            { acId: 'AC-10.1', status: 'covered', files: ['hooks/intent-injection/handler.js'], rationale: 'OK' },
            { acId: 'AC-10.2', status: 'covered', files: ['scripts/extract-cron.sh'], rationale: 'OK' },
            { acId: 'AC-15.1', status: 'covered', files: ['web/src/dashboard.tsx'], rationale: 'OK' },
          ]);
        }
        if (content.includes('Verify')) {
          return JSON.stringify([
            { acId: 'AC-29.1', status: 'covered', confidence: 0.9, file: 'src/scanner.ts', lineStart: 1, lineEnd: 3, rationale: 'Verified' },
          ]);
        }
        return '[]';
      },
    };

    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: root,
      projectRoot: root,
      scanDirs: ['.'],
      llmClient,
      writeReport: false,
    } as any);

    // Should have logs for triage and verification
    expect(report.logs.length).toBeGreaterThanOrEqual(2);
    expect(report.logs.some((l) => l.acId.includes('batch-triage'))).toBe(true);
    expect(report.logs.some((l) => l.acId.includes('precise-verify'))).toBe(true);
  });

  it('handles empty spec gracefully', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l2-empty-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'main.ts'), 'export function main() {}\n');
    const spec = join(root, 'spec.md');
    writeFileSync(spec, '# Empty Spec\n\nNo FRs here.\n');

    const llmClient = {
      async chat() { return '[]'; },
    };

    const scanner = new L2ACSemanticScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: root,
      llmClient,
      writeReport: false,
    });

    expect(report.entries).toHaveLength(0);
    expect(report.pass).toBe(true);
  });
});
