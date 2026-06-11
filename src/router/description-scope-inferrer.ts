/**
 * Description-aware scope inferrer (FR-1).
 *
 * The CLI accepts `--description "实装 FR-Pxx 新增 ..."` but historically dropped
 * it before the router. This module fills the gap: when the caller cannot
 * provide explicit scope metadata, we read the description and produce a
 * `Partial<TaskScope>` good enough for {@link classifyLevel} to escape the
 * "all-defaults → L0" trap.
 *
 * Strategy (architecture spec §3.1):
 *   1. Heuristic regex fast-path — cheap, deterministic, hits common Chinese
 *      "实装 / 实现 / 新增" + module-name patterns.
 *   2. Embedding fallback — when heuristics yield nothing, use vector cosine
 *      similarity to classify scope from pre-computed reference samples.
 *   3. Conservative bottom — any embedding error / no match returns `{}` so
 *      the caller's L1 default takes over.
 */
import type { TaskScope } from '../types/index.js';
import { classifyByEmbedding, type EmbeddingConfig } from '../embedding/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SCOPE_VECTORS_PATH = resolve(MODULE_DIR, '..', '..', 'data', 'scope-inference-vectors.json');

export interface InferenceOptions {
  /** Optional embedding config override (mostly for tests). */
  embeddingConfig?: EmbeddingConfig | null;
  /** Disable embedding fallback (heuristics-only); useful for offline contexts. */
  disableEmbedding?: boolean;
}

/** Heuristic keywords that imply a non-trivial implementation task (FR-1 AC1). */
const NEW_MODULE_VERBS = ['实装', '实现', '新增', '添加', '创建', '编写', '接入', '搭建', '构建'];

/** Heuristic keywords that imply data-model / schema work. */
const DATA_MODEL_HINTS = ['数据模型', 'schema', 'DB', '数据库表', '迁移', 'migration'];

/** Heuristic markers for cross-module / multi-FR scope (FR-1 AC2). */
const CROSS_MODULE_HINTS = ['跨模块', '跨多个模块', '多个 FR', '多个FR', '多 FR', '多模块', 'cross-module'];

/** Module noun pattern after a "new module" verb. */
const MODULE_NOUN_RE = /(?:模块|service|service\s|api|链路|module|compiler|extractor|inferrer|engine|adapter|provider|store|router|gate|stage|pipeline|component|client|hook|manager|worker)/i;

/**
 * Infer a partial TaskScope from a free-form description.
 *
 * Returns `{}` when nothing can be inferred. Never throws.
 */
export async function inferScopeFromDescription(
  description: string | undefined,
  options: InferenceOptions = {},
): Promise<Partial<TaskScope>> {
  if (!description || description.trim() === '') return {};

  const text = description;
  const heuristic = applyHeuristics(text);

  if (heuristic.isNewModule || (heuristic.affectedDomains?.length ?? 0) >= 2 || heuristic.hasDataModelChange) {
    return heuristic;
  }

  if (options.disableEmbedding) return heuristic;

  try {
    const result = await classifyByEmbedding(text, SCOPE_VECTORS_PATH, {
      config: options.embeddingConfig,
    });

    if (!result.matched) return heuristic;

    const embeddingScope = labelToScope(result.label);
    return mergeScope(heuristic, embeddingScope);
  } catch {
    return heuristic;
  }
}

// ── internals ───────────────────────────────────────────────────

function applyHeuristics(text: string): Partial<TaskScope> {
  const out: Partial<TaskScope> = {};

  const containsVerb = NEW_MODULE_VERBS.some(v => text.includes(v));
  const containsModuleNoun = MODULE_NOUN_RE.test(text);
  if (containsVerb && containsModuleNoun) {
    out.isNewModule = true;
  }

  if (DATA_MODEL_HINTS.some(h => text.toLowerCase().includes(h.toLowerCase()))) {
    out.hasDataModelChange = true;
  }

  // Multi-FR / cross-module indicators imply ≥2 affected domains.
  const frMatches = text.match(/FR[- ]?[A-Z0-9]+/gi);
  const uniqueFr = frMatches ? new Set(frMatches.map(s => s.toUpperCase())).size : 0;
  const crossHint = CROSS_MODULE_HINTS.some(h => text.toLowerCase().includes(h.toLowerCase()));
  if (uniqueFr >= 2 || crossHint) {
    out.affectedDomains = Array.from({ length: Math.max(2, uniqueFr) }, (_, i) => `inferred-domain-${i + 1}`);
  }

  return out;
}

function labelToScope(label: string | null): Partial<TaskScope> {
  switch (label) {
    case 'new-module':
      return { isNewModule: true };
    case 'cross-domain':
      return { affectedDomains: ['inferred-domain-1', 'inferred-domain-2'] };
    case 'data-model':
      return { hasDataModelChange: true };
    case 'large-change':
      return { estimatedFiles: 10, estimatedLines: 500 };
    case 'micro-change':
      return {};
    case 'medium-change':
      return { estimatedFiles: 3, estimatedLines: 150 };
    default:
      return {};
  }
}

function mergeScope(base: Partial<TaskScope>, embedding: Partial<TaskScope>): Partial<TaskScope> {
  return {
    ...embedding,
    ...base, // heuristics win on overlap
  };
}
