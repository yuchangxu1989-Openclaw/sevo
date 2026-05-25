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
 *   2. LLM fallback — when heuristics yield nothing, ask the configured LLM
 *      for a structured `Partial<TaskScope>` JSON.
 *   3. Conservative bottom — any LLM error / parse failure / disabled LLM
 *      returns `{}` so the caller's L1 default takes over.
 */
import type { TaskScope } from '../types/index.js';
import { LLMProvider } from '../llm/index.js';

export interface InferenceOptions {
  /** Optional LLM override (mostly for tests). */
  llm?: Pick<LLMProvider, 'chat'>;
  /** Disable LLM fallback (heuristics-only); useful for offline contexts. */
  disableLlm?: boolean;
}

/** Heuristic keywords that imply a non-trivial implementation task (FR-1 AC1). */
const NEW_MODULE_VERBS = ['实装', '实现', '新增', '添加', '创建', '编写', '接入', '搭建', '构建'];

/** Heuristic keywords that imply data-model / schema work. */
const DATA_MODEL_HINTS = ['数据模型', 'schema', 'DB', '数据库表', '迁移', 'migration'];

/** Heuristic markers for cross-module / multi-FR scope (FR-1 AC2). */
const CROSS_MODULE_HINTS = ['跨模块', '跨多个模块', '多个 FR', '多个FR', '多 FR', '多模块', 'cross-module'];

/** Module noun pattern after a "new module" verb. Matches alphanum + Chinese block names like
 *  "metadata-extractor service", "router 模块", "FR-P03 新增 LLM 推断模块". */
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

  // Heuristics already gave us a strong signal — return immediately.
  if (heuristic.isNewModule || (heuristic.affectedDomains?.length ?? 0) >= 2 || heuristic.hasDataModelChange) {
    return heuristic;
  }

  if (options.disableLlm) return heuristic;

  const llm = options.llm ?? createConfiguredLlm();
  if (!llm) return heuristic;

  try {
    const reply = await llm.chat([
      {
        role: 'system',
        content: [
          '你是 SEVO 路由层的 scope 推断器。',
          '只输出 JSON，不要解释，字段全部可选。',
          'JSON schema: {',
          '  "isNewModule": boolean,',
          '  "estimatedFiles": number,',
          '  "estimatedLines": number,',
          '  "affectedDomains": string[],',
          '  "hasDataModelChange": boolean',
          '}',
          '判定原则：实装/实现/新增/接入/搭建 + 模块名 → isNewModule=true。',
          '修 typo / 改文案 / 单行 → 留空字段。',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ]);
    const parsed = parseJsonObject(reply);
    return mergeScope(heuristic, sanitize(parsed));
  } catch {
    // LLM unreachable / non-JSON / network error → conservative empty.
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

function createConfiguredLlm(): Pick<LLMProvider, 'chat'> | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new LLMProvider();
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

function sanitize(raw: unknown): Partial<TaskScope> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const out: Partial<TaskScope> = {};
  if (typeof obj.isNewModule === 'boolean') out.isNewModule = obj.isNewModule;
  if (typeof obj.estimatedFiles === 'number' && Number.isFinite(obj.estimatedFiles)) {
    out.estimatedFiles = Math.max(0, Math.floor(obj.estimatedFiles));
  }
  if (typeof obj.estimatedLines === 'number' && Number.isFinite(obj.estimatedLines)) {
    out.estimatedLines = Math.max(0, Math.floor(obj.estimatedLines));
  }
  if (Array.isArray(obj.affectedDomains)) {
    const domains = obj.affectedDomains.filter((d): d is string => typeof d === 'string' && d.trim() !== '');
    if (domains.length > 0) out.affectedDomains = domains;
  }
  if (typeof obj.hasDataModelChange === 'boolean') out.hasDataModelChange = obj.hasDataModelChange;
  return out;
}

function mergeScope(base: Partial<TaskScope>, llm: Partial<TaskScope>): Partial<TaskScope> {
  return {
    ...llm,
    ...base, // heuristics win on overlap
  };
}
