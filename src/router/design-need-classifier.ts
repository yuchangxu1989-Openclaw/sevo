import type { ProjectConfig, TaskScope } from '../types/index.js';
import type { SpecOutput } from '../stages/spec-types.js';
import { classifyByEmbedding, type EmbeddingConfig } from '../embedding/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DESIGN_VECTORS_PATH = resolve(MODULE_DIR, '..', '..', 'data', 'design-need-vectors.json');

export interface DesignNeedInput {
  taskScope: TaskScope;
  specOutput?: SpecOutput;
  projectConfig?: Partial<ProjectConfig>;
  embeddingConfig?: EmbeddingConfig | null;
}

export interface DesignNeedResult {
  needsUxDesign: boolean;
  uxDesignReason: string;
  needsArchDesign: boolean;
  archDesignReason: string;
}

/**
 * FR-02d/FR-02e routing classifier.
 *
 * Uses embedding cosine similarity against pre-computed design-need reference
 * vectors. If embedding is unavailable, falls back to conservative defaults
 * based on task scope metadata.
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

  const description = buildDescription(input);

  if (description.length < 10 || description === 'unknown task') {
    return conservativeFallback(input, '描述信息不足，按安全默认值处理');
  }

  try {
    const uxResult = await classifyByEmbedding(description, DESIGN_VECTORS_PATH, {
      config: input.embeddingConfig,
      labelFilter: undefined,
    });

    const needsUx = uxResult.matched && uxResult.label === 'needs-ux';
    const needsArch = uxResult.matched && (uxResult.label === 'needs-arch');

    // Also check arch specifically if UX didn't match arch
    let archResult = uxResult;
    if (!needsArch) {
      archResult = await classifyByEmbedding(description, DESIGN_VECTORS_PATH, {
        config: input.embeddingConfig,
        labelFilter: 'needs-arch',
      });
    }

    const archMatched = archResult.matched && archResult.label === 'needs-arch';

    return {
      needsUxDesign: needsUx,
      uxDesignReason: needsUx
        ? `向量匹配判定需要 UX Design (score=${uxResult.score.toFixed(3)})`
        : `向量匹配判定不需要 UX Design (best=${uxResult.label}, score=${uxResult.score.toFixed(3)})`,
      needsArchDesign: archMatched || conservativeArchCheck(input.taskScope),
      archDesignReason: archMatched
        ? `向量匹配判定需要 Architecture Design (score=${archResult.score.toFixed(3)})`
        : conservativeArchCheck(input.taskScope)
          ? '范围显示涉及多域/数据模型/多文件复杂变更，触发 Architecture Design'
          : '向量匹配 + 范围检查均未触发 Architecture Design',
    };
  } catch {
    return conservativeFallback(input, 'Embedding 不可用，按安全默认值处理');
  }
}

function buildDescription(input: DesignNeedInput): string {
  const parts: string[] = [];
  if (input.specOutput?.summary) parts.push(input.specOutput.summary);
  if (input.taskScope.affectedDomains?.length) {
    parts.push(`domains: ${input.taskScope.affectedDomains.join(', ')}`);
  }
  if (input.specOutput?.functionalRequirements?.length) {
    parts.push(input.specOutput.functionalRequirements.slice(0, 3).join('; '));
  }
  return parts.join(' | ') || 'unknown task';
}

async function classifyArchitectureNeed(input: DesignNeedInput): Promise<Pick<DesignNeedResult, 'needsArchDesign' | 'archDesignReason'>> {
  const description = buildDescription(input);

  try {
    const result = await classifyByEmbedding(description, DESIGN_VECTORS_PATH, {
      config: input.embeddingConfig,
      labelFilter: 'needs-arch',
    });

    const matched = result.matched && result.label === 'needs-arch';
    const fallbackCheck = conservativeArchCheck(input.taskScope);

    return {
      needsArchDesign: matched || fallbackCheck,
      archDesignReason: matched
        ? `向量匹配判定需要 Architecture Design (score=${result.score.toFixed(3)})`
        : fallbackCheck
          ? '范围检查触发 Architecture Design（多域/数据模型/多文件）'
          : '向量匹配 + 范围检查均未触发 Architecture Design',
    };
  } catch {
    const fallback = conservativeFallback(input, 'Embedding 不可用，按安全默认值判定');
    return {
      needsArchDesign: fallback.needsArchDesign,
      archDesignReason: fallback.archDesignReason,
    };
  }
}

function conservativeArchCheck(scope: TaskScope): boolean {
  const affectedDomainCount = scope.affectedDomains?.length ?? 0;
  const estimatedFiles = scope.estimatedFiles ?? 0;
  return affectedDomainCount >= 2
    || scope.hasDataModelChange === true
    || scope.isNewModule === true
    || estimatedFiles >= 5;
}

export function classifyDesignNeedsFallback(input: DesignNeedInput, prefix = 'Embedding 未执行，按安全默认值处理'): DesignNeedResult {
  return conservativeFallback(input, prefix);
}

function conservativeFallback(input: DesignNeedInput, prefix: string): DesignNeedResult {
  const scope = input.taskScope;
  const needsArchDesign = conservativeArchCheck(scope);

  return {
    needsUxDesign: input.projectConfig?.hasUI !== false,
    uxDesignReason: `${prefix}；项目允许 UI 时保守触发 UX Interaction Design`,
    needsArchDesign,
    archDesignReason: needsArchDesign
      ? `${prefix}；范围显示涉及多域/数据模型/多文件复杂变更，触发 Architecture Design`
      : `${prefix}；范围未显示多域、数据模型或多文件复杂变更，暂不触发 Architecture Design`,
  };
}
