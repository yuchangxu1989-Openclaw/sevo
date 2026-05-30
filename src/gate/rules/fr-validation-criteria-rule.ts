import type { ArtifactRef, RuleResult, StageId } from '../../types/index.js';
import type { GateRule } from '../gate-rule.js';
import {
  createSemanticRuleLlmClient,
  extractFrSections,
  failRule,
  findSpecContent,
  frSectionsForPrompt,
  judgeSemanticRule,
  numberedLines,
  resultFromSemanticResponse,
  type SemanticRuleLlmClient,
  type SemanticRuleOptions,
} from './semantic-rule-utils.js';

const SYSTEM_PROMPT = `你是 SEVO spec-review-gate 的 FR 用户视角验证准则语义门禁。
只根据用户提供的 FR markdown 做判断，必须返回严格 JSON，不要 markdown，不要解释。
JSON 结构固定为：{"pass": boolean, "reasons": [{"type": string, "line": number, "detail": string}]}。

验收标准：
1. 每条 FR 必须有明确的“用户视角验证准则”子节。标题可同义表达，但必须是 FR 定义内的独立子节。
2. 验证准则必须包含三要素：
   - 操作者：谁来验证，例如陌生用户、首次使用者、运维者。
   - 操作路径与时间约束：从什么入口（web 路由、CLI 命令或明确入口）执行哪些操作，并在多长时间内完成。
   - 可观测、可量化产出：用数量、字数、字段、状态之一描述看到什么才算通过。
3. 必须是端到端用户旅程，不接受单页面状态或接口可访问描述。
4. “页面能打开”“列表能显示”“接口能访问”“支持显示某页”这类页面级描述一律 fail。
5. 如果失败，reasons 必须逐条指出 FR 编号、缺失要素或页面级问题，并给出对应行号。`;

export class FrValidationCriteriaRule implements GateRule {
  readonly id = 'fr-validation-criteria';
  readonly appliesTo: StageId[] = ['spec-review-gate'];
  private readonly llmClient: SemanticRuleLlmClient;

  constructor(options?: SemanticRuleOptions) {
    this.llmClient = createSemanticRuleLlmClient(options);
  }

  async evaluate(artifacts: ArtifactRef[]): Promise<RuleResult> {
    const specSource = findSpecContent(artifacts);
    if (!specSource) {
      return failRule('missing-spec', 1, 'No readable spec markdown artifact found for FR validation criteria check');
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
          '请检查以下每条 FR 是否都有用户视角端到端验证准则，并语义判定三要素是否完整。',
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

      return resultFromSemanticResponse(response, 'All FR validation criteria passed LLM semantic check');
    } catch (error) {
      return failRule('llm-semantic-check-error', 1, error instanceof Error ? error.message : String(error));
    }
  }
}
