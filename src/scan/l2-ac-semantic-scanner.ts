/**
 * L2 AC Semantic Scanner — Three-Phase Pipeline
 *
 * Replaces the old per-AC LLM call approach with a cost-efficient pipeline:
 *
 * Phase 1: Code Map Generation (pure static analysis, no LLM)
 *   - Walks all configured scanDirs (not just src/)
 *   - Outputs file path + exports + header comment per file
 *
 * Phase 2: Batch Triage (1-3 LLM calls)
 *   - Sends all ACs + code map to LLM in batches
 *   - LLM classifies each AC as covered/suspect/uncovered
 *   - For covered/suspect: notes which file(s) likely implement it
 *
 * Phase 3: Precise Verification (only for suspect/uncovered)
 *   - Reads actual file content for suspect ACs
 *   - Sends to LLM for precise semantic verification
 *   - Final determination with evidence
 *
 * Cost: ~30K tokens total (vs 6.5M tokens in old approach)
 * Accuracy: Full project coverage (not truncated to 50K chars of src/)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { LLMProvider } from '../llm/index.js';
import { CodeMapGenerator, type CodeMapEntry, type CodeMapOptions } from './code-map-generator.js';
import type { L2ACCoverageEntry, L2ScanInput, L2ScanReport, SemanticScanLogEntry } from './types.js';
import { parseSpecMarkdown, readFileExcerpt, safeJsonParse, writeJson } from './utils.js';

/** Extended input supporting multi-directory scanning */
export interface L2ScanInputV2 extends L2ScanInput {
  /** Directories to scan relative to project root. Defaults to ['.'] (entire project) */
  scanDirs?: string[];
  /** Project root (defaults to sourceDir parent or sourceDir itself) */
  projectRoot?: string;
  /** Max ACs per batch triage call. Defaults to 150. */
  batchSize?: number;
  /** File extensions to include in code map */
  extensions?: string[];
  /** Directory names to ignore */
  ignoreDirs?: string[];
  /** Max characters to read per file during verification. Defaults to 8000. */
  maxFileExcerpt?: number;
}

interface TriageResult {
  acId: string;
  status: 'covered' | 'suspect' | 'uncovered';
  files: string[];
  rationale: string;
}

interface VerificationResult {
  acId: string;
  frId: string;
  status: 'covered' | 'uncovered' | 'needs-review';
  confidence: number;
  file: string;
  lineStart: number;
  lineEnd: number;
  testFile?: string;
  rationale: string;
}

export class L2ACSemanticScanner {
  private readonly codeMapGenerator = new CodeMapGenerator();

  async scan(input: L2ScanInput | L2ScanInputV2): Promise<L2ScanReport> {
    const v2 = input as L2ScanInputV2;
    const projectRoot = v2.projectRoot ?? input.sourceDir;
    const scanDirs = v2.scanDirs ?? ['.'];
    const batchSize = v2.batchSize ?? 150;
    const maxFileExcerpt = v2.maxFileExcerpt ?? 8000;

    const frs = parseSpecMarkdown(input.specPath);
    const llm = input.llmClient ?? new LLMProvider(input.llm);
    const logs: SemanticScanLogEntry[] = [];

    // Flatten all ACs with their FR context
    const allACs = frs.flatMap((fr) =>
      fr.acceptanceCriteria.map((ac) => ({
        frId: fr.frId,
        frTitle: fr.title,
        acId: ac.acId,
        acText: ac.text,
      })),
    );

    if (allACs.length === 0) {
      return this.emptyReport(input);
    }

    // ─── Phase 1: Code Map Generation ───────────────────────────────────
    const codeMapOptions: CodeMapOptions = {
      projectRoot,
      scanDirs,
      extensions: v2.extensions,
      ignoreDirs: v2.ignoreDirs,
    };
    const codeMapEntries = this.codeMapGenerator.generate(codeMapOptions);
    const codeMapText = this.codeMapGenerator.renderText(codeMapEntries);

    // ─── Phase 2: Batch Triage ──────────────────────────────────────────
    const triageResults = await this.batchTriage(allACs, codeMapText, batchSize, llm, logs);

    // ─── Phase 3: Precise Verification (suspect + uncovered only) ───────
    const needsVerification = triageResults.filter((r) => r.status !== 'covered');
    const verificationResults = await this.preciseVerification(
      needsVerification,
      allACs,
      projectRoot,
      codeMapEntries,
      llm,
      logs,
      maxFileExcerpt,
    );

    // ─── Merge Results ──────────────────────────────────────────────────
    const entries = this.mergeResults(allACs, triageResults, verificationResults);

    const report: L2ScanReport = {
      level: 'l2',
      pass: entries.every((entry) => entry.status === 'covered'),
      timestamp: new Date().toISOString(),
      entries,
      logs,
    };

    if (input.writeReport !== false && input.outputPath) writeJson(input.outputPath, report);
    if (input.writeReport !== false && input.logPath) writeJson(input.logPath, logs);

    return report;
  }

  /**
   * Phase 2: Batch Triage
   * Sends ACs in batches with the full code map, asks LLM to classify each.
   */
  private async batchTriage(
    allACs: Array<{ frId: string; frTitle: string; acId: string; acText: string }>,
    codeMapText: string,
    batchSize: number,
    llm: { chat(messages: Array<{ role: string; content: string }>): Promise<string> },
    logs: SemanticScanLogEntry[],
  ): Promise<TriageResult[]> {
    const results: TriageResult[] = [];
    const batches = this.chunk(allACs, batchSize);

    for (const batch of batches) {
      const acList = batch
        .map((ac) => `- ${ac.acId} [${ac.frId}]: ${ac.acText}`)
        .join('\n');

      const prompt = `## Code Map (all project files)\n\n${codeMapText}\n\n## Acceptance Criteria to Classify\n\n${acList}\n\nClassify each AC. Return JSON array.`;

      let response: string;
      try {
        response = await llm.chat([
          { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ]);
      } catch {
        // Retry once after 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
        try {
          response = await llm.chat([
            { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ]);
        } catch {
          // Both attempts failed — mark all ACs in batch as needs-review
          results.push(...batch.map((ac) => ({
            acId: ac.acId,
            status: 'suspect' as const,
            files: [],
            rationale: 'LLM call failed after retry; defaulting to suspect for verification.',
          })));
          continue;
        }
      }

      // Log the first AC in batch as representative
      logs.push({
        frId: batch[0]?.frId ?? '',
        acId: `batch-triage-${batch[0]?.acId ?? ''}`,
        prompt: `[Batch triage: ${batch.length} ACs, code map: ${codeMapText.length} chars]`,
        response,
      });

      const parsed = this.parseTriageResponse(response, batch);
      results.push(...parsed);
    }

    return results;
  }

  /**
   * Phase 3: Precise Verification
   * For suspect/uncovered ACs, reads the actual file content and verifies semantically.
   */
  private async preciseVerification(
    needsVerification: TriageResult[],
    allACs: Array<{ frId: string; frTitle: string; acId: string; acText: string }>,
    projectRoot: string,
    codeMapEntries: CodeMapEntry[],
    llm: { chat(messages: Array<{ role: string; content: string }>): Promise<string> },
    logs: SemanticScanLogEntry[],
    maxFileExcerpt = 8000,
  ): Promise<VerificationResult[]> {
    if (needsVerification.length === 0) return [];

    // Group by file to minimize redundant reads
    const fileContentCache = new Map<string, string>();
    const results: VerificationResult[] = [];

    // Batch verification calls: group ACs that reference the same files
    const verificationBatches = this.groupByFiles(needsVerification);

    for (const batch of verificationBatches) {
      // Collect file contents for this batch
      const fileContents: string[] = [];
      const allFiles = new Set<string>();
      for (const item of batch) {
        for (const file of item.files) {
          allFiles.add(file);
        }
      }

      for (const file of allFiles) {
        if (!fileContentCache.has(file)) {
          const absPath = path.resolve(projectRoot, file);
          if (fs.existsSync(absPath)) {
            fileContentCache.set(file, readFileExcerpt(absPath, maxFileExcerpt));
          }
        }
        const content = fileContentCache.get(file);
        if (content) {
          fileContents.push(`### ${file}\n${content}`);
        }
      }

      // For ACs with no file hints, try to find related files from code map
      for (const item of batch) {
        if (item.files.length === 0) {
          const ac = allACs.find((a) => a.acId === item.acId);
          if (ac) {
            const relatedFiles = this.findRelatedFiles(ac.acText, codeMapEntries);
            for (const rf of relatedFiles) {
              if (!allFiles.has(rf.relativePath)) {
                const absPath = path.resolve(projectRoot, rf.relativePath);
                if (fs.existsSync(absPath)) {
                  const content = readFileExcerpt(absPath, maxFileExcerpt);
                  fileContents.push(`### ${rf.relativePath}\n${content}`);
                  allFiles.add(rf.relativePath);
                }
              }
            }
          }
        }
      }

      const acDescriptions = batch.map((item) => {
        const ac = allACs.find((a) => a.acId === item.acId);
        return `- ${item.acId} [${ac?.frId ?? ''}]: ${ac?.acText ?? ''} (triage: ${item.status}, suggested files: ${item.files.join(', ') || 'none'})`;
      }).join('\n');

      const prompt = `## Source Code\n\n${fileContents.join('\n\n')}\n\n## ACs to Verify\n\n${acDescriptions}\n\nVerify each AC against the source code. Return JSON array.`;

      let response: string;
      try {
        response = await llm.chat([
          { role: 'system', content: VERIFICATION_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ]);
      } catch {
        // Retry once after 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
        try {
          response = await llm.chat([
            { role: 'system', content: VERIFICATION_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ]);
        } catch {
          // Both attempts failed — mark all ACs in batch as needs-review
          results.push(...batch.map((item) => {
            const ac = allACs.find((a) => a.acId === item.acId);
            return {
              acId: item.acId,
              frId: ac?.frId ?? '',
              status: 'needs-review' as const,
              confidence: 0,
              file: item.files[0] ?? '',
              lineStart: 1,
              lineEnd: 1,
              rationale: 'LLM call failed after retry; marking as needs-review.',
            };
          }));
          continue;
        }
      }

      logs.push({
        frId: batch[0]?.acId ?? '',
        acId: `precise-verify-${batch.map((b) => b.acId).join(',')}`,
        prompt: `[Verification: ${batch.length} ACs, ${allFiles.size} files, ${fileContents.join('').length} chars]`,
        response,
      });

      const parsed = this.parseVerificationResponse(response, batch, allACs);
      results.push(...parsed);
    }

    return results;
  }

  /**
   * Merge triage and verification results into final L2 entries.
   */
  private mergeResults(
    allACs: Array<{ frId: string; frTitle: string; acId: string; acText: string }>,
    triageResults: TriageResult[],
    verificationResults: VerificationResult[],
  ): L2ACCoverageEntry[] {
    const verificationMap = new Map(verificationResults.map((v) => [v.acId, v]));
    const triageMap = new Map(triageResults.map((t) => [t.acId, t]));

    return allACs.map((ac) => {
      const verification = verificationMap.get(ac.acId);
      const triage = triageMap.get(ac.acId);

      // If verified in Phase 3, use that result
      if (verification) {
        return {
          frId: ac.frId,
          acId: ac.acId,
          status: verification.status,
          confidence: verification.confidence,
          evidence: {
            file: verification.file,
            lineRange: [verification.lineStart, verification.lineEnd] as [number, number],
            testFile: verification.testFile,
          },
          rationale: verification.rationale,
        };
      }

      // If triage said covered (and wasn't sent to verification), trust it
      if (triage?.status === 'covered') {
        return {
          frId: ac.frId,
          acId: ac.acId,
          status: 'covered' as const,
          confidence: 0.8,
          evidence: {
            file: triage.files[0] ?? '',
            lineRange: [1, 1] as [number, number],
          },
          rationale: triage.rationale,
        };
      }

      // Fallback: uncovered
      return {
        frId: ac.frId,
        acId: ac.acId,
        status: 'uncovered' as const,
        confidence: 0,
        evidence: { file: '', lineRange: [1, 1] as [number, number] },
        rationale: triage?.rationale ?? 'No implementation evidence found.',
      };
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private parseTriageResponse(
    response: string,
    batch: Array<{ acId: string }>,
  ): TriageResult[] {
    // Try to parse as JSON array
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]) as Array<{
          acId?: string;
          ac_id?: string;
          status?: string;
          files?: string[];
          rationale?: string;
        }>;
        if (Array.isArray(parsed)) {
          return parsed.map((item, idx) => ({
            acId: item.acId ?? item.ac_id ?? batch[idx]?.acId ?? '',
            status: this.normalizeTriageStatus(item.status),
            files: Array.isArray(item.files) ? item.files : [],
            rationale: item.rationale ?? '',
          }));
        }
      } catch { /* fall through */ }
    }

    // Fallback: mark all as suspect (forces verification)
    return batch.map((ac) => ({
      acId: ac.acId,
      status: 'suspect' as const,
      files: [],
      rationale: 'Failed to parse triage response; defaulting to suspect.',
    }));
  }

  private normalizeTriageStatus(status?: string): 'covered' | 'suspect' | 'uncovered' {
    if (status === 'covered') return 'covered';
    if (status === 'uncovered') return 'uncovered';
    return 'suspect';
  }

  private parseVerificationResponse(
    response: string,
    batch: TriageResult[],
    allACs: Array<{ frId: string; acId: string }>,
  ): VerificationResult[] {
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]) as Array<{
          acId?: string;
          ac_id?: string;
          status?: string;
          confidence?: number;
          file?: string;
          lineStart?: number;
          lineEnd?: number;
          testFile?: string;
          rationale?: string;
        }>;
        if (Array.isArray(parsed)) {
          return parsed.map((item, idx) => {
            const acId = item.acId ?? item.ac_id ?? batch[idx]?.acId ?? '';
            const ac = allACs.find((a) => a.acId === acId);
            const confidence = typeof item.confidence === 'number'
              ? Math.max(0, Math.min(1, item.confidence))
              : 0;
            const rawStatus = item.status;
            const status: 'covered' | 'uncovered' | 'needs-review' =
              rawStatus === 'covered' && confidence >= 0.7 ? 'covered'
              : rawStatus === 'covered' ? 'needs-review'
              : rawStatus === 'needs-review' ? 'needs-review'
              : 'uncovered';

            return {
              acId,
              frId: ac?.frId ?? '',
              status,
              confidence,
              file: item.file ?? '',
              lineStart: Math.max(1, item.lineStart ?? 1),
              lineEnd: Math.max(1, item.lineEnd ?? item.lineStart ?? 1),
              testFile: item.testFile,
              rationale: item.rationale ?? '',
            };
          });
        }
      } catch { /* fall through */ }
    }

    // Fallback: mark all as needs-review
    return batch.map((item) => {
      const ac = allACs.find((a) => a.acId === item.acId);
      return {
        acId: item.acId,
        frId: ac?.frId ?? '',
        status: 'needs-review' as const,
        confidence: 0.3,
        file: item.files[0] ?? '',
        lineStart: 1,
        lineEnd: 1,
        rationale: 'Failed to parse verification response; defaulting to needs-review.',
      };
    });
  }

  /**
   * Group triage results into verification batches.
   * Groups ACs that share files together to minimize redundant file reads.
   * Each batch targets ~10 ACs max to keep verification prompts focused.
   */
  private groupByFiles(items: TriageResult[]): TriageResult[][] {
    const maxBatchSize = 10;
    const batches: TriageResult[][] = [];
    const remaining = [...items];

    while (remaining.length > 0) {
      const batch: TriageResult[] = [remaining.shift()!];
      const batchFiles = new Set(batch[0]!.files);

      // Pull in items that share files with current batch
      for (let i = remaining.length - 1; i >= 0 && batch.length < maxBatchSize; i--) {
        const item = remaining[i]!;
        const shares = item.files.some((f) => batchFiles.has(f));
        if (shares || item.files.length === 0) {
          batch.push(item);
          item.files.forEach((f) => batchFiles.add(f));
          remaining.splice(i, 1);
        }
      }

      // Fill remaining slots
      while (batch.length < maxBatchSize && remaining.length > 0) {
        batch.push(remaining.shift()!);
      }

      batches.push(batch);
    }

    return batches;
  }

  /**
   * Find files from code map that might be related to an AC's text.
   * Uses export names and header comments as signals.
   * This is NOT keyword matching for coverage determination —
   * it's file selection for the LLM to then semantically verify.
   */
  private findRelatedFiles(acText: string, codeMapEntries: CodeMapEntry[]): CodeMapEntry[] {
    // Extract meaningful words from AC text (>3 chars, not common words)
    const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'must', 'should', 'when', 'then', 'each', 'will', 'shall', 'does', 'into', 'also', 'only']);
    const words = acText.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    // Score each file by how many AC words appear in its path/exports/comment
    const scored = codeMapEntries.map((entry) => {
      const haystack = `${entry.relativePath} ${entry.exports.join(' ')} ${entry.headerComment}`.toLowerCase();
      const score = words.filter((w) => haystack.includes(w)).length;
      return { entry, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.entry);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private emptyReport(input: L2ScanInput): L2ScanReport {
    return {
      level: 'l2',
      pass: true,
      timestamp: new Date().toISOString(),
      entries: [],
      logs: [],
    };
  }
}

// ─── System Prompts ───────────────────────────────────────────────────────────

const TRIAGE_SYSTEM_PROMPT = `You are SEVO AC Coverage Triage. Given a code map (file paths, exports, header comments) and a list of acceptance criteria, classify each AC.

Rules:
- Use SEMANTIC understanding only. Do NOT rely on keyword matching, regex, or file-name inference.
- Judge whether the code structure (exports, file organization, comments) suggests the AC behavior is implemented.
- "covered": High confidence the AC is implemented based on code map evidence.
- "suspect": Some evidence exists but uncertain — needs file-level verification.
- "uncovered": No evidence in the code map suggests this AC is implemented.
- For covered/suspect, list the most likely implementation file(s).

Return a JSON array (no markdown fencing):
[{"acId":"AC-1.1","status":"covered|suspect|uncovered","files":["path/to/file.ts"],"rationale":"brief reason"}]

Return one entry per AC in the same order as input.`;

const VERIFICATION_SYSTEM_PROMPT = `You are SEVO AC Precise Verifier. Given actual source code and acceptance criteria, determine whether each AC is implemented.

Rules:
- Use SEMANTIC understanding only. Do NOT rely on keyword matching or regex.
- Do not infer coverage from file names, directory structure, or naming conventions alone.
- Judge whether the code BEHAVIOR satisfies the AC semantics.
- "covered" requires implementation evidence (confidence >= 0.7).
- "needs-review" if evidence is plausible but confidence < 0.7.
- "uncovered" if no implementation satisfies the AC behavior.
- Provide specific file and line range for evidence.

Return a JSON array (no markdown fencing):
[{"acId":"AC-1.1","status":"covered|uncovered|needs-review","confidence":0.0-1.0,"file":"relative/path","lineStart":1,"lineEnd":10,"testFile":"test/path or null","rationale":"brief reason"}]

Return one entry per AC in the same order as input.`;
