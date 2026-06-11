/**
 * Shared embedding-based classifier.
 *
 * Provides embedText + cosineSimilarity + classifyByEmbedding for all SEVO/ACO
 * classifiers that previously used LLM chat for semantic routing.
 *
 * Embedding provider: volcengine-ark doubao-embedding-vision-251215 (2048-dim).
 * Fallback: embedding failure → caller decides (fail-open per spec).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EMBEDDING_TIMEOUT_MS = 8000;

// ── Types ─────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface VectorSample {
  id: string;
  label: string;
  text: string;
  vector: number[];
}

export interface VectorDb {
  version: number;
  model: string;
  thresholds: { direct: number; fallback: number };
  samples: VectorSample[];
}

export interface ClassifyResult {
  matched: boolean;
  label: string | null;
  score: number;
  confidence: 'direct' | 'fallback' | 'none';
  sampleId: string | null;
}

// ── Embedding config resolution ───────────────────────────────────

const embeddingCache = new Map<string, number[]>();

export function readEmbeddingConfig(): EmbeddingConfig | null {
  if (process.env.SEVO_EMBEDDING_DISABLED === '1') return null;

  const apiKey = process.env.ARK_API_KEY;
  if (apiKey) {
    return {
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey,
      model: 'doubao-embedding-vision-251215',
    };
  }

  try {
    const cfgPath = resolve(process.env.HOME ?? '/root', '.openclaw', 'openclaw.json');
    if (!existsSync(cfgPath)) return null;
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));

    const provider = cfg?.models?.providers?.['volcengine-ark'];
    if (!provider?.apiKey || !provider?.baseUrl) return null;
    const firstModel = Array.isArray(provider.models)
      ? provider.models.find((m: { id?: string }) => typeof m?.id === 'string' && m.id.includes('embedding'))
      : null;
    const model = firstModel?.id || 'doubao-embedding-vision-251215';
    return {
      baseUrl: provider.baseUrl.replace(/\/+$/, ''),
      apiKey: provider.apiKey,
      model,
    };
  } catch {
    return null;
  }
}

// ── Embed text ────────────────────────────────────────────────────

export async function embedText(
  text: string,
  config?: EmbeddingConfig | null,
  timeoutMs = EMBEDDING_TIMEOUT_MS,
): Promise<number[] | null> {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const embeddingConfig = config ?? readEmbeddingConfig();
  if (!embeddingConfig) return null;

  const cacheKey = `${embeddingConfig.model}:${normalized}`;
  if (embeddingCache.has(cacheKey)) return embeddingCache.get(cacheKey)!;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${embeddingConfig.baseUrl}/embeddings/multimodal`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${embeddingConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: embeddingConfig.model,
        input: [{ type: 'text', text: normalized.slice(0, 4000) }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const vector = data?.data?.embedding || data?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) return null;
    const numeric = vector.map(Number).filter(Number.isFinite);
    if (numeric.length === 0) return null;
    embeddingCache.set(cacheKey, numeric);
    return numeric;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Cosine similarity ─────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return -1;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Load vector DB ────────────────────────────────────────────────

export function loadVectorDb(dbPath: string): VectorDb | null {
  try {
    if (!existsSync(dbPath)) return null;
    const raw = JSON.parse(readFileSync(dbPath, 'utf8'));
    const samples: VectorSample[] = (Array.isArray(raw.samples) ? raw.samples : [])
      .filter((s: unknown): s is VectorSample =>
        !!s && typeof (s as VectorSample).id === 'string' &&
        typeof (s as VectorSample).label === 'string' &&
        Array.isArray((s as VectorSample).vector) &&
        (s as VectorSample).vector.length > 0,
      );
    return {
      version: raw.version ?? 1,
      model: raw.model ?? 'doubao-embedding-vision-251215',
      thresholds: {
        direct: raw.thresholds?.direct ?? 0.45,
        fallback: raw.thresholds?.fallback ?? 0.35,
      },
      samples,
    };
  } catch {
    return null;
  }
}

// ── Classify by embedding ─────────────────────────────────────────

export async function classifyByEmbedding(
  text: string,
  dbPath: string,
  options?: {
    config?: EmbeddingConfig | null;
    labelFilter?: string;
  },
): Promise<ClassifyResult> {
  const noMatch: ClassifyResult = { matched: false, label: null, score: 0, confidence: 'none', sampleId: null };

  const db = loadVectorDb(dbPath);
  if (!db || db.samples.length === 0) return noMatch;

  const config = options?.config ?? readEmbeddingConfig();
  const queryVector = await embedText(text, config);
  if (!queryVector) return noMatch;

  const candidates = options?.labelFilter
    ? db.samples.filter(s => s.label === options.labelFilter)
    : db.samples;

  if (candidates.length === 0) return noMatch;

  let bestScore = -1;
  let bestSample: VectorSample | null = null;

  for (const sample of candidates) {
    if (sample.vector.length !== queryVector.length) continue;
    const score = cosineSimilarity(queryVector, sample.vector);
    if (score > bestScore) {
      bestScore = score;
      bestSample = sample;
    }
  }

  if (!bestSample) return noMatch;

  const confidence: ClassifyResult['confidence'] =
    bestScore >= db.thresholds.direct ? 'direct' :
    bestScore >= db.thresholds.fallback ? 'fallback' : 'none';

  return {
    matched: confidence !== 'none',
    label: bestSample.label,
    score: bestScore,
    confidence,
    sampleId: bestSample.id,
  };
}

// ── Multi-label classification (returns best match per label) ─────

export async function classifyMultiLabel(
  text: string,
  dbPath: string,
  config?: EmbeddingConfig | null,
): Promise<{ label: string; score: number; confidence: ClassifyResult['confidence'] }[]> {
  const db = loadVectorDb(dbPath);
  if (!db || db.samples.length === 0) return [];

  const embeddingConfig = config ?? readEmbeddingConfig();
  const queryVector = await embedText(text, embeddingConfig);
  if (!queryVector) return [];

  const labelBest = new Map<string, { score: number }>();

  for (const sample of db.samples) {
    if (sample.vector.length !== queryVector.length) continue;
    const score = cosineSimilarity(queryVector, sample.vector);
    const current = labelBest.get(sample.label);
    if (!current || score > current.score) {
      labelBest.set(sample.label, { score });
    }
  }

  return Array.from(labelBest.entries())
    .map(([label, { score }]) => ({
      label,
      score,
      confidence: (score >= db.thresholds.direct ? 'direct' :
        score >= db.thresholds.fallback ? 'fallback' : 'none') as ClassifyResult['confidence'],
    }))
    .sort((a, b) => b.score - a.score);
}
