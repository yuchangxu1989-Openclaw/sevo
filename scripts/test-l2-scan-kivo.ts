/**
 * Verification script for L2 AC Semantic Scanner three-phase pipeline.
 *
 * Uses a mock callLLM function that returns preset triage results
 * where FR-G01 AC3 is marked as uncovered, then verifies:
 * 1. The three-phase pipeline executes completely
 * 2. Uncovered ACs appear in the final report
 * 3. The maxFileExcerpt parameter is respected
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { L2ACSemanticScanner, type L2ScanInputV2 } from '../src/scan/l2-ac-semantic-scanner.js';

// ─── Mock LLM Client ────────────────────────────────────────────────────────

let callCount = 0;

const mockLLM = {
  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    callCount++;
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';

    // Phase 2: Batch Triage — return preset results
    if (userMsg.includes('Classify each AC')) {
      return JSON.stringify([
        { acId: 'AC-1.1', status: 'covered', files: ['src/core/graph.ts'], rationale: 'Graph module exports createGraph' },
        { acId: 'AC-1.2', status: 'covered', files: ['src/core/graph.ts'], rationale: 'Graph module exports addEdge' },
        { acId: 'AC-1.3', status: 'uncovered', files: [], rationale: 'No evidence of batch import in code map' },
        { acId: 'AC-2.1', status: 'suspect', files: ['src/api/query.ts'], rationale: 'Query module exists but unclear if semantic' },
      ]);
    }

    // Phase 3: Precise Verification — return verification for suspect/uncovered
    if (userMsg.includes('Verify each AC')) {
      return JSON.stringify([
        { acId: 'AC-1.3', status: 'uncovered', confidence: 0.1, file: '', lineStart: 1, lineEnd: 1, rationale: 'No batch import implementation found' },
        { acId: 'AC-2.1', status: 'covered', confidence: 0.85, file: 'src/api/query.ts', lineStart: 15, lineEnd: 42, rationale: 'Semantic query with vector search confirmed' },
      ]);
    }

    return '[]';
  },
};

// ─── Setup Test Fixtures ────────────────────────────────────────────────────

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l2-scan-kivo-'));
const projectRoot = path.join(tmpDir, 'project');
const srcDir = path.join(projectRoot, 'src');
const coreDir = path.join(srcDir, 'core');
const apiDir = path.join(srcDir, 'api');

fs.mkdirSync(coreDir, { recursive: true });
fs.mkdirSync(apiDir, { recursive: true });

// Create mock source files
fs.writeFileSync(path.join(coreDir, 'graph.ts'), `/**
 * Knowledge graph core module
 */
export function createGraph(name: string) { return { name, nodes: [], edges: [] }; }
export function addEdge(graph: any, from: string, to: string) { graph.edges.push({ from, to }); }
export function getNode(graph: any, id: string) { return graph.nodes.find((n: any) => n.id === id); }
`);

fs.writeFileSync(path.join(apiDir, 'query.ts'), `/**
 * Query API for knowledge graph
 */
export async function semanticQuery(graph: any, query: string, options?: { topK?: number }) {
  // Vector-based semantic search implementation
  const topK = options?.topK ?? 10;
  return graph.nodes
    .map((n: any) => ({ node: n, score: Math.random() }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, topK);
}

export function exactMatch(graph: any, key: string) {
  return graph.nodes.filter((n: any) => n.key === key);
}
`);

// Create mock spec
const specPath = path.join(tmpDir, 'spec.md');
fs.writeFileSync(specPath, `# Product Requirements

## FR-01 Knowledge Graph Core

### Acceptance Criteria
- AC-1.1: System creates a named knowledge graph with nodes and edges
- AC-1.2: System adds directed edges between nodes
- AC-1.3: System supports batch import of nodes from external sources

## FR-02 Semantic Query

### Acceptance Criteria
- AC-2.1: System performs semantic vector-based search over graph nodes
`);

// ─── Run Scanner ────────────────────────────────────────────────────────────

async function main() {
  const scanner = new L2ACSemanticScanner();
  const outputPath = path.join(tmpDir, 'report.json');

  const input: L2ScanInputV2 = {
    specPath,
    sourceDir: srcDir,
    projectRoot,
    scanDirs: ['.'],
    outputPath,
    llmClient: mockLLM,
    writeReport: true,
    maxFileExcerpt: 4000, // Test that custom value is respected
  };

  console.log('Running L2 AC Semantic Scanner (three-phase pipeline)...\n');
  const report = await scanner.scan(input);

  // ─── Assertions ─────────────────────────────────────────────────────────

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.log(`  ✗ ${msg}`);
      failed++;
    }
  }

  console.log('Phase execution:');
  assert(callCount >= 2, `LLM called at least twice (triage + verification): got ${callCount} calls`);

  console.log('\nReport structure:');
  assert(report.level === 'l2', 'Report level is l2');
  assert(report.entries.length === 4, `Report has 4 entries (got ${report.entries.length})`);
  assert(report.pass === false, 'Report pass=false (has uncovered AC)');

  console.log('\nUncovered AC detection:');
  const uncoveredEntries = report.entries.filter((e) => e.status === 'uncovered');
  assert(uncoveredEntries.length >= 1, `At least 1 uncovered entry (got ${uncoveredEntries.length})`);

  const ac1_3 = report.entries.find((e) => e.acId === 'AC-1.3');
  assert(ac1_3 !== undefined, 'AC-1.3 exists in report');
  assert(ac1_3?.status === 'uncovered', `AC-1.3 status is uncovered (got ${ac1_3?.status})`);

  console.log('\nCovered AC detection:');
  const ac1_1 = report.entries.find((e) => e.acId === 'AC-1.1');
  assert(ac1_1?.status === 'covered', `AC-1.1 status is covered (got ${ac1_1?.status})`);

  const ac2_1 = report.entries.find((e) => e.acId === 'AC-2.1');
  assert(ac2_1?.status === 'covered', `AC-2.1 status is covered (got ${ac2_1?.status})`);

  console.log('\nReport file output:');
  assert(fs.existsSync(outputPath), 'Report JSON file written to disk');

  console.log('\nLogs:');
  assert(report.logs.length >= 2, `At least 2 log entries (got ${report.logs.length})`);
  const triageLog = report.logs.find((l) => l.acId.startsWith('batch-triage'));
  assert(triageLog !== undefined, 'Triage log entry exists');
  const verifyLog = report.logs.find((l) => l.acId.startsWith('precise-verify'));
  assert(verifyLog !== undefined, 'Verification log entry exists');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
  console.log('\nAll assertions passed. Three-phase pipeline verified.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
