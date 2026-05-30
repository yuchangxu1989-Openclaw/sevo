import type { ProjectConfig, TaskScope } from '../types/index.js';
import type { SpecOutput } from '../stages/spec-types.js';
import { LLMProvider } from '../llm/index.js';

export interface DesignNeedInput {
  taskScope: TaskScope;
  specOutput?: SpecOutput;
  projectConfig?: Partial<ProjectConfig>;
  llm?: Pick<LLMProvider, 'chat'>;
}

export interface DesignNeedResult {
  needsUxDesign: boolean;
  uxDesignReason: string;
  needsArchDesign: boolean;
  archDesignReason: string;
}

interface LlmDesignNeedPayload {
  needsUxDesign?: unknown;
  uxDesignReason?: unknown;
  needsArchDesign?: unknown;
  archDesignReason?: unknown;
}

/**
 * FR-02d/FR-02e routing classifier.
 *
 * The default path delegates semantic judgement to an LLM. If no LLM credential is
 * configured, the classifier fails closed: it keeps the pipeline safe by requiring
 * architecture design for non-trivial scope and UX design whenever the project is
 * configured as UI-capable. It never uses keyword matching to fake semantics.
 */
export async function classifyDesignNeeds(input: DesignNeedInput): Promise<DesignNeedResult> {
  const projectHasUi = input.projectConfig?.hasUI !== false;

  if (!projectHasUi) {
    const arch = await classifyArchitectureNeed(input);
    return {
      needsUxDesign: false,
      uxDesignReason: 'projectConfig.hasUI=false，纯后端/CLI/SDK 项目不触发 UX Interaction Design',
      needsArchDesign: arch.needsArchDesign,
      archDesignReason: arch.archDesignReason,
    };
  }

  const llm = input.llm ?? createConfiguredLlm();
  if (!llm) {
    return conservativeFallback(input, '未配置 LLM，按安全默认值触发条件性设计阶段');
  }

  try {
    const content = await llm.chat([
      {
        role: 'system',
        content: [
          '你是 SEVO 流水线路由判定器。',
          '只基于输入的任务范围和规格语义判断是否需要两个设计阶段。',
          '不要做关键词匹配；要判断真实语义。',
          'UX Interaction Design 只在任务涉及 Web 页面、用户交互界面、导航结构变更时需要。',
          'Architecture Design 在任务涉及前后端复杂功能、数据模型变化、多模块协作、新增 API 接口时需要。',
          '只返回 JSON，不要输出解释文本。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          taskScope: input.taskScope,
          projectConfig: input.projectConfig ?? {},
          specSummary: input.specOutput?.summary ?? '',
          functionalRequirements: input.specOutput?.functionalRequirements ?? [],
          acceptanceCriteria: input.specOutput?.acceptanceCriteria ?? [],
          expectedShape: {
            needsUxDesign: 'boolean',
            uxDesignReason: 'string',
            needsArchDesign: 'boolean',
            archDesignReason: 'string',
          },
        }),
      },
    ]);

    return normalizeLlmResult(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return conservativeFallback(input, `LLM 判定失败，按安全默认值处理：${message}`);
  }
}

function createConfiguredLlm(): Pick<LLMProvider, 'chat'> | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new LLMProvider();
}

async function classifyArchitectureNeed(input: DesignNeedInput): Promise<Pick<DesignNeedResult, 'needsArchDesign' | 'archDesignReason'>> {
  const llm = input.llm ?? createConfiguredLlm();
  if (!llm) {
    const fallback = conservativeFallback(input, '未配置 LLM，按安全默认值判定 Architecture Design');
    return {
      needsArchDesign: fallback.needsArchDesign,
      archDesignReason: fallback.archDesignReason,
    };
  }

  try {
    const content = await llm.chat([
      {
        role: 'system',
        content: [
          '你是 SEVO Architecture Design 路由判定器。',
          '基于任务范围和规格语义判断是否涉及复杂功能、数据模型变化、多模块协作或新增 API。',
          '不要做关键词匹配。只返回 JSON。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          taskScope: input.taskScope,
          specSummary: input.specOutput?.summary ?? '',
          functionalRequirements: input.specOutput?.functionalRequirements ?? [],
          acceptanceCriteria: input.specOutput?.acceptanceCriteria ?? [],
          expectedShape: { needsArchDesign: 'boolean', archDesignReason: 'string' },
        }),
      },
    ]);
    const parsed = parseJsonObject(content) as Partial<LlmDesignNeedPayload>;
    return {
      needsArchDesign: asBoolean(parsed.needsArchDesign, true),
      archDesignReason: asReason(parsed.archDesignReason, 'LLM 判定需要 Architecture Design'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = conservativeFallback(input, `LLM 判定失败，按安全默认值处理：${message}`);
    return {
      needsArchDesign: fallback.needsArchDesign,
      archDesignReason: fallback.archDesignReason,
    };
  }
}

function normalizeLlmResult(content: string): DesignNeedResult {
  const parsed = parseJsonObject(content) as LlmDesignNeedPayload;
  return {
    needsUxDesign: asBoolean(parsed.needsUxDesign, false),
    uxDesignReason: asReason(parsed.uxDesignReason, 'LLM 判定不需要 UX Interaction Design'),
    needsArchDesign: asBoolean(parsed.needsArchDesign, true),
    archDesignReason: asReason(parsed.archDesignReason, 'LLM 判定需要 Architecture Design'),
  };
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM response is not JSON');
    return JSON.parse(match[0]);
  }
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asReason(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function classifyDesignNeedsFallback(input: DesignNeedInput, prefix = '未执行 LLM 判定，按安全默认值处理'): DesignNeedResult {
  return conservativeFallback(input, prefix);
}

function conservativeFallback(input: DesignNeedInput, prefix: string): DesignNeedResult {
  const scope = input.taskScope;
  const affectedDomainCount = scope.affectedDomains?.length ?? 0;
  const estimatedFiles = scope.estimatedFiles ?? 0;
  const needsArchDesign = affectedDomainCount >= 2
    || scope.hasDataModelChange === true
    || scope.isNewModule === true
    || estimatedFiles >= 5;

  return {
    needsUxDesign: input.projectConfig?.hasUI !== false,
    uxDesignReason: `${prefix}；项目允许 UI 时保守触发 UX Interaction Design`,
    needsArchDesign,
    archDesignReason: needsArchDesign
      ? `${prefix}；范围显示涉及多域/数据模型/多文件复杂变更，触发 Architecture Design`
      : `${prefix}；范围未显示多域、数据模型或多文件复杂变更，暂不触发 Architecture Design`,
  };
}
