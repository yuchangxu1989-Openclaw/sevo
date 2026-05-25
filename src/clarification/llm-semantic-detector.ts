import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import type { StageId } from '../types/index.js';
import type { AmbiguitySignal, AmbiguitySignalType, AmbiguitySeverity } from './clarification-types.js';

/**
 * LLM-based semantic ambiguity detector (FR-11).
 *
 * Uses the host adapter's callLlm() to perform true semantic analysis
 * of content, detecting ambiguities that structural/regex rules cannot catch:
 * - Vague requirements that appear complete but lack precision
 * - Implicit assumptions not stated
 * - Contradictions between artifacts
 * - Missing edge cases
 * - Unstated dependencies
 *
 * This satisfies the constraint: "禁止关键词匹配冒充语义理解"
 */

export interface DetectionContext {
  /** Additional context (e.g., related spec content when analyzing contract) */
  relatedContent?: string;
  /** Specific aspects to focus on */
  focusAreas?: string[];
}

interface LlmAmbiguityFinding {
  type: string;
  description: string;
  location: string;
  severity: string;
  reasoning: string;
}

interface LlmDetectionResponse {
  findings: LlmAmbiguityFinding[];
}

const STAGE_PROMPTS: Record<string, string> = {
  spec: `You are analyzing a software requirements specification for ambiguities.
Focus on:
- Acceptance criteria that are not verifiable or measurable
- Boundary conditions left undefined (input ranges, error paths, concurrency)
- Terms used without clear definition
- Dependencies on external systems/services not explicitly declared
- Data flows where producer, consumer, or format is unclear
- Performance/resource constraints mentioned without quantifiable thresholds
- Requirements that could be interpreted in multiple valid ways`,

  contract: `You are analyzing a technical architecture/contract document for ambiguities.
Focus on:
- Interface contracts missing parameters, return types, or error codes
- Data flow paths where ownership or transformation is unclear
- Module responsibilities that overlap or have gaps
- Technology choices stated without rationale or constraints
- Contradictions with the requirements specification (if provided in context)
- Missing error handling strategies for failure modes
- Scalability/performance assumptions not backed by constraints`,

  implement: `You are analyzing a task description for implementation ambiguities.
Focus on:
- Implementation goals that could be interpreted differently
- Missing verification steps or success criteria
- Contradictions between the task description and referenced spec/contract
- Implicit assumptions about runtime environment or dependencies
- Edge cases not addressed in the task description
- Unclear priority when multiple approaches are valid`,
};

const DEFAULT_STAGE_PROMPT = `You are analyzing technical content for ambiguities.
Focus on unclear requirements, undefined boundaries, missing constraints, and implicit assumptions.`;

export class LlmSemanticAmbiguityDetector {
  private readonly adapter: SevoHostAdapter;
  private readonly stage: StageId;

  constructor(options: { adapter: SevoHostAdapter; stage: StageId }) {
    this.adapter = options.adapter;
    this.stage = options.stage;
  }

  /**
   * Analyze content using LLM for semantic ambiguity detection.
   * Returns AmbiguitySignal[] compatible with the existing clarification pipeline.
   */
  async detect(content: string, context?: DetectionContext): Promise<AmbiguitySignal[]> {
    if (!content.trim()) return [];

    const stageKey = this.stage.replace(/-review-gate$/, '');
    const stagePrompt = STAGE_PROMPTS[stageKey] ?? DEFAULT_STAGE_PROMPT;

    const systemPrompt = buildSystemPrompt(stagePrompt, context);
    const userPrompt = buildUserPrompt(content, context);

    let response: string;
    try {
      response = await this.adapter.callLlm([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
    } catch {
      // LLM unavailable — degrade gracefully, structural detection still works
      return [];
    }

    return parseResponse(response);
  }
}

function buildSystemPrompt(stagePrompt: string, context?: DetectionContext): string {
  const focusSection = context?.focusAreas?.length
    ? `\n\nAdditional focus areas:\n${context.focusAreas.map((a) => `- ${a}`).join('\n')}`
    : '';

  return `${stagePrompt}${focusSection}

Respond ONLY with a JSON object in this exact format:
{
  "findings": [
    {
      "type": "<one of: acceptance-criteria-missing | boundary-undefined | term-undefined | dependency-undeclared | interface-incomplete | data-flow-unclear | performance-constraint-missing | spec-contract-contradiction>",
      "description": "<clear description of the ambiguity>",
      "location": "<quote or reference to the ambiguous text, max 80 chars>",
      "severity": "<one of: low | medium | high | critical>",
      "reasoning": "<why this is ambiguous and what could go wrong>"
    }
  ]
}

Rules:
- Only report genuine semantic ambiguities, not stylistic issues.
- Each finding must identify a specific piece of content that is ambiguous.
- severity=critical: could cause fundamental misunderstanding of requirements.
- severity=high: likely to cause rework if not clarified.
- severity=medium: could lead to suboptimal implementation.
- severity=low: minor clarity improvement.
- If no ambiguities found, return {"findings": []}.
- Do NOT invent ambiguities. Only report what genuinely exists in the content.`;
}

function buildUserPrompt(content: string, context?: DetectionContext): string {
  const parts: string[] = [];

  if (context?.relatedContent) {
    parts.push('## Related Context (for contradiction detection)\n');
    parts.push(context.relatedContent.slice(0, 4000));
    parts.push('\n\n---\n\n');
  }

  parts.push('## Content to Analyze\n\n');
  parts.push(content.slice(0, 8000));

  return parts.join('');
}

function parseResponse(response: string): AmbiguitySignal[] {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  let parsed: LlmDetectionResponse;
  try {
    parsed = JSON.parse(jsonMatch[0]) as LlmDetectionResponse;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.findings)) return [];

  return parsed.findings
    .filter(isValidFinding)
    .map(toAmbiguitySignal);
}

const VALID_TYPES: Set<string> = new Set([
  'acceptance-criteria-missing',
  'boundary-undefined',
  'term-undefined',
  'dependency-undeclared',
  'interface-incomplete',
  'data-flow-unclear',
  'performance-constraint-missing',
  'spec-contract-contradiction',
]);

const VALID_SEVERITIES: Set<string> = new Set(['low', 'medium', 'high', 'critical']);

function isValidFinding(finding: LlmAmbiguityFinding): boolean {
  return (
    typeof finding.type === 'string' &&
    typeof finding.description === 'string' &&
    typeof finding.location === 'string' &&
    finding.description.length > 0
  );
}

function toAmbiguitySignal(finding: LlmAmbiguityFinding): AmbiguitySignal {
  const type: AmbiguitySignalType = VALID_TYPES.has(finding.type)
    ? (finding.type as AmbiguitySignalType)
    : 'boundary-undefined';

  const severity: AmbiguitySeverity = VALID_SEVERITIES.has(finding.severity)
    ? (finding.severity as AmbiguitySeverity)
    : 'medium';

  return {
    type,
    description: finding.description.slice(0, 200),
    location: (finding.location || 'unspecified').slice(0, 80),
    severity,
  };
}
