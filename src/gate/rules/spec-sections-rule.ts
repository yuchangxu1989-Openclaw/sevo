import type { ArtifactRef, RuleResult, StageId } from '../../types/index.js';
import type { GateRule } from '../gate-rule.js';
import {
  createSemanticRuleLlmClient,
  extractH2Sections,
  failRule,
  findSpecContent,
  judgeSemanticRule,
  numberedLines,
  resultFromSemanticResponse,
  sectionsForPrompt,
  type SemanticRuleLlmClient,
  type SemanticRuleOptions,
} from './semantic-rule-utils.js';

const SYSTEM_PROMPT = `你是 SEVO spec-review-gate 的需求规格语义门禁。
只根据用户提供的 markdown H2 章节做判断，必须返回严格 JSON，不要 markdown，不要解释。
JSON 结构固定为：{"pass": boolean, "reasons": [{"type": string, "line": number, "detail": string}]}。

验收标准：
1. H2 章节中必须语义上独立存在四章：用户人群、痛点、原始需求、用户体验流。同义标题可以通过，禁止按关键词列表机械匹配。
2. 四章都必须位于“功能需求”H2 之前。
3. 每章正文必须有实质内容：
   - 用户人群：说清谁用、什么场景、什么设备。
   - 痛点：说清用户当前怎么解决、哪里卡住或哪里痛。
   - 原始需求：用用户口语说清用户想要什么。
   - 用户体验流：从入口到产出的完整操作步骤。
4. 空标题、TODO、占位符、单句概述、只有抽象口号，一律 fail。
5. 如果失败，reasons 必须给出具体 type、对应行号、可执行的缺口说明。`;

export class SpecSectionsRule implements GateRule {
  readonly id = 'spec-mandatory-sections';
  readonly appliesTo: StageId[] = ['spec-review-gate'];
  private readonly llmClient: SemanticRuleLlmClient;

  constructor(options?: SemanticRuleOptions) {
    this.llmClient = createSemanticRuleLlmClient(options);
  }

  async evaluate(artifacts: ArtifactRef[]): Promise<RuleResult> {
    const specSource = findSpecContent(artifacts);
    if (!specSource) {
      return failRule('missing-spec', 1, 'No readable spec markdown artifact found for mandatory section check');
    }

    try {
      const response = await judgeSemanticRule(
        this.llmClient,
        SYSTEM_PROMPT,
        [
          '请判定以下需求规格 markdown 是否通过四章强制语义门禁。',
          '你可以使用 H2 结构和行号定位章节；章节标题的语义等价关系必须由你判断。',
          '',
          '<h2_sections>',
          sectionsForPrompt(extractH2Sections(specSource.content)),
          '</h2_sections>',
          '',
          '<full_markdown_with_line_numbers>',
          numberedLines(specSource.content),
          '</full_markdown_with_line_numbers>',
        ].join('\n'),
      );

      return resultFromSemanticResponse(response, 'Mandatory spec sections passed LLM semantic check before 功能需求');
    } catch (error) {
      return failRule('llm-semantic-check-error', 1, error instanceof Error ? error.message : String(error));
    }
  }
}
