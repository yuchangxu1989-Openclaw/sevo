import type { ArtifactRef, RuleResult, StageId } from '../../types/index.js';
import type { GateRule } from '../gate-rule.js';
import {
  createSemanticRuleLlmClient,
  extractFrSections,
  extractH2Sections,
  failRule,
  findSpecContent,
  frSectionsForPrompt,
  judgeSemanticRule,
  numberedLines,
  resultFromSemanticResponse,
  sectionsForPrompt,
  type SemanticRuleLlmClient,
  type SemanticRuleOptions,
} from './semantic-rule-utils.js';

const SYSTEM_PROMPT = `你是 SEVO spec-review-gate 的 FR 来源追溯语义门禁。
只根据用户提供的 markdown 做判断，必须返回严格 JSON，不要 markdown，不要解释。
JSON 结构固定为：{"pass": boolean, "reasons": [{"type": string, "line": number, "detail": string}]}。

验收标准：
1. FR 章节中的每个 FR 必须能追溯到四个用户层章节中的至少一条具体来源。
2. 可接受来源范围：用户人群、痛点、用户体验流；原始需求可作为辅助，但不能成为唯一来源。
3. 追溯必须是语义关系，不要求文字相同。禁止机械关键词匹配。
4. 找不到来源的 FR 是孤立 FR，必须 fail。
5. 如果失败，reasons 必须逐条指出 FR 编号、FR 所在行号，以及缺少哪类来源或为何追溯不成立。`;

export class FrTraceabilityRule implements GateRule {
  readonly id = 'fr-traceability';
  readonly appliesTo: StageId[] = ['spec-review-gate'];
  private readonly llmClient: SemanticRuleLlmClient;

  constructor(options?: SemanticRuleOptions) {
    this.llmClient = createSemanticRuleLlmClient(options);
  }

  async evaluate(artifacts: ArtifactRef[]): Promise<RuleResult> {
    const specSource = findSpecContent(artifacts);
    if (!specSource) {
      return failRule('missing-spec', 1, 'No readable spec markdown artifact found for FR traceability check');
    }

    const frSections = extractFrSections(specSource.content);
    if (frSections.length === 0) {
      return failRule('missing-fr', 1, 'No FR sections found in spec markdown');
    }

    try {
      const response = await judgeSemanticRule(
        this.llmClient,
        SYSTEM_PROMPT,
        [
          '请检查每条 FR 是否能追溯到用户人群、痛点或用户体验流中的具体来源。',
          'H2 章节标题的语义归类由你判断；不要使用关键词枚举。',
          '',
          '<h2_sections>',
          sectionsForPrompt(extractH2Sections(specSource.content)),
          '</h2_sections>',
          '',
          '<fr_sections>',
          frSectionsForPrompt(frSections),
          '</fr_sections>',
          '',
          '<full_markdown_with_line_numbers>',
          numberedLines(specSource.content),
          '</full_markdown_with_line_numbers>',
        ].join('\n'),
      );

      return resultFromSemanticResponse(response, 'All FRs passed LLM semantic traceability check');
    } catch (error) {
      return failRule('llm-semantic-check-error', 1, error instanceof Error ? error.message : String(error));
    }
  }
}
