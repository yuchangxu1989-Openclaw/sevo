import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import { safeJsonParse } from './utils.js';

export interface LlmSemanticVerificationInput {
  frId: string;
  frDescription: string;
  files: Array<{ path: string; contentHead: string }>;
  adapter: SevoHostAdapter;
}

export interface LlmSemanticVerificationResult {
  frId: string;
  file: string;
  implements: boolean;
  confidence: number;
}

interface RawVerificationResult {
  frId?: unknown;
  file?: unknown;
  implements?: unknown;
  confidence?: unknown;
}

export class LlmSemanticVerifier {
  async verify(opts: LlmSemanticVerificationInput): Promise<LlmSemanticVerificationResult[]> {
    if (opts.files.length === 0) return [];

    const response = await opts.adapter.callLlm([
      { role: 'system', content: SEMANTIC_VERIFIER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `FR: ${opts.frId}`,
          `Description: ${opts.frDescription}`,
          'Files:',
          opts.files.map((file) => `### ${file.path}\n${file.contentHead}`).join('\n\n'),
        ].join('\n\n'),
      },
    ]);

    const parsed = safeJsonParse<{ results?: RawVerificationResult[] }>(response, { results: [] });
    return this.normalizeResults(opts.frId, parsed.results ?? []);
  }

  private normalizeResults(frId: string, results: RawVerificationResult[]): LlmSemanticVerificationResult[] {
    return results
      .filter((result) => typeof result.file === 'string' && result.file.trim().length > 0)
      .map((result) => ({
        frId: typeof result.frId === 'string' && result.frId.trim().length > 0 ? result.frId : frId,
        file: result.file as string,
        implements: result.implements === true,
        confidence: typeof result.confidence === 'number' && Number.isFinite(result.confidence)
          ? Math.max(0, Math.min(1, result.confidence))
          : 0,
      }));
  }
}

const SEMANTIC_VERIFIER_SYSTEM_PROMPT = `You verify whether files implement a functional requirement.
Return only JSON with this shape:
{
  "results": [
    { "frId": "FR-13", "file": "src/pipeline/pipeline-engine.ts", "implements": true, "confidence": 0.92 }
  ]
}
Rules:
- Judge semantics, not filename keywords.
- One result per input file.
- confidence must be a number between 0 and 1.`;
