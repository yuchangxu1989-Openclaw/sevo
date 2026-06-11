import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const EMBEDDING_TIMEOUT_MS = 8000;

export const ROUTE_VECTOR_DB_PATH = resolve(MODULE_DIR, '..', 'data', 'route-vectors.json');
export const ROUTE_VECTOR_DB_VERSION = 1;
export const ROUTE_VECTOR_DIRECT_THRESHOLD = 0.45;
export const ROUTE_VECTOR_FALLBACK_THRESHOLD = 0.35;
export const ROUTE_VECTOR_MIN_MARGIN = 0.03;

let routeVectorCache = {
  mtimeMs: -1,
  db: null,
};

const embeddingCache = new Map();

export function readEmbeddingConfig() {
  try {
    const cfgPath = resolve(process.env.HOME ?? '/root', '.openclaw', 'openclaw.json');
    if (!existsSync(cfgPath)) return null;
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const memSearch = cfg?.agents?.defaults?.memorySearch;
    if (memSearch?.remote?.baseUrl) {
      return {
        providerId: 'volcengine-ark',
        baseUrl: memSearch.remote.baseUrl.replace(/\/+$/, ''),
        apiKey: memSearch.remote.apiKey || 'local',
        model: memSearch.model || 'doubao-embedding-vision-251215',
      };
    }
    const providers = cfg?.models?.providers || {};
    const providerId = 'volcengine-ark';
    const provider = providers[providerId];
    if (!provider?.apiKey || !provider?.baseUrl) return null;
    const firstModel = Array.isArray(provider.models)
      ? provider.models.find(m => typeof m?.id === 'string' && m.id.trim())
      : null;
    const model = provider.model || firstModel?.id;
    if (!model) return null;
    return { providerId, baseUrl: provider.baseUrl.replace(/\/+$/, ''), apiKey: provider.apiKey, model };
  } catch {
    return null;
  }
}

export async function embedText(text, config = null, timeoutMs = EMBEDDING_TIMEOUT_MS) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  const embeddingConfig = config || readEmbeddingConfig();
  if (!embeddingConfig) return null;

  const cacheKey = `${embeddingConfig.model}:${normalized}`;
  if (embeddingCache.has(cacheKey)) return embeddingCache.get(cacheKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${embeddingConfig.baseUrl}/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${embeddingConfig.apiKey}`,
      },
      body: JSON.stringify({ model: embeddingConfig.model, input: [normalized.slice(0, 4000)] }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const vector = data?.data?.[0]?.embedding;
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function addFeature(vector, feature, weight) {
  const index = hashString(feature) % vector.length;
  vector[index] += weight;
}

function textFeatureVector(text, dimensions = 128) {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const vector = new Array(dimensions).fill(0);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.length < 2) continue;
    addFeature(vector, `tok:${token}`, 2.5);
    if (token.length > 4) addFeature(vector, `stem:${token.slice(0, 5)}`, 0.75);
    if (i > 0) addFeature(vector, `bi:${tokens[i - 1]} ${token}`, 1.5);
  }

  const compact = normalized.replace(/\s+/g, '');
  for (let i = 0; i + 3 <= compact.length; i += 1) {
    addFeature(vector, `tri:${compact.slice(i, i + 3)}`, 0.5);
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  if (norm === 0) return null;
  const scale = 1 / Math.sqrt(norm);
  for (let i = 0; i < vector.length; i += 1) vector[i] *= scale;
  return vector;
}

function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return null;
  const normalized = new Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    const value = Number(vector[i]);
    if (!Number.isFinite(value)) return null;
    normalized[i] = value;
  }
  return normalized;
}

function normalizeThresholds(thresholds = {}) {
  const direct = Number(thresholds.direct ?? thresholds.high ?? ROUTE_VECTOR_DIRECT_THRESHOLD);
  const fallback = Number(thresholds.fallback ?? thresholds.low ?? ROUTE_VECTOR_FALLBACK_THRESHOLD);
  return {
    direct: Number.isFinite(direct) ? direct : ROUTE_VECTOR_DIRECT_THRESHOLD,
    fallback: Number.isFinite(fallback) ? fallback : ROUTE_VECTOR_FALLBACK_THRESHOLD,
  };
}

function normalizeDb(raw) {
  const samples = Array.isArray(raw?.samples)
    ? raw.samples
        .map((sample) => {
          const vector = normalizeVector(sample?.vector);
          const text = String(sample?.text || '');
          const textVector = textFeatureVector(text);
          if (!sample?.id || !sample?.scenario || !sample?.route || !text || !vector || !textVector) {
            return null;
          }
          return {
            id: String(sample.id),
            scenario: String(sample.scenario),
            route: sample.route,
            text,
            vector,
            textVector,
            model: sample.model || raw?.model || '__seed__',
            updatedAt: sample.updatedAt || raw?.updatedAt || null,
          };
        })
        .filter(Boolean)
    : [];

  return {
    version: Number(raw?.version) || ROUTE_VECTOR_DB_VERSION,
    updatedAt: raw?.updatedAt || null,
    providerId: raw?.providerId || null,
    model: raw?.model || '__seed__',
    thresholds: normalizeThresholds(raw?.thresholds),
    samples,
  };
}

export function loadRouteVectorDb({ path = ROUTE_VECTOR_DB_PATH, refresh = false } = {}) {
  if (!existsSync(path)) {
    throw new Error(`route vector database not found: ${path}`);
  }

  const mtimeMs = statSync(path).mtimeMs;
  if (!refresh && routeVectorCache.db && routeVectorCache.mtimeMs === mtimeMs) {
    return routeVectorCache.db;
  }

  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const db = normalizeDb(raw);
  routeVectorCache = { mtimeMs, db };
  return db;
}

export function routeVectorSamples(options = {}) {
  return loadRouteVectorDb(options).samples;
}

export function routeVectorThresholds(options = {}) {
  return loadRouteVectorDb(options).thresholds;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return -1;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function confidenceBand(score, thresholds = routeVectorThresholds(), margin = Infinity) {
  if (score >= thresholds.direct && margin >= ROUTE_VECTOR_MIN_MARGIN) return 'direct';
  if (score >= thresholds.fallback) return 'fallback';
  return 'default';
}

function storedVectorFromExactText(text, samples) {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  for (const sample of samples) {
    if (normalizeText(sample.text) === normalized) {
      return sample.vector;
    }
  }
  return null;
}

function routeEquals(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

export async function routeVectorMatch({ text = '', vector = null, scenarioPrefix = null, path = ROUTE_VECTOR_DB_PATH } = {}) {
  const db = loadRouteVectorDb({ path });
  const candidates = scenarioPrefix
    ? db.samples.filter((sample) => sample.scenario.startsWith(String(scenarioPrefix)))
    : db.samples;
  const exactVector = storedVectorFromExactText(text, candidates) || storedVectorFromExactText(text, db.samples);
  const explicitVector = normalizeVector(vector);

  let inputVector = explicitVector || exactVector;
  let vectorKind = 'stored';

  if (!inputVector) {
    const embeddingConfig = readEmbeddingConfig();
    const embedded = embeddingConfig ? await embedText(text, embeddingConfig) : null;
    if (embedded) {
      inputVector = embedded;
      vectorKind = 'embedding';
    } else {
      inputVector = textFeatureVector(text);
      vectorKind = 'text-features';
    }
  }

  if (!inputVector) {
    return {
      ok: false,
      source: 'route-vector-unavailable',
      reason: 'input vector unavailable',
      thresholds: db.thresholds,
    };
  }

  let best = null;
  let secondBestDifferentScenario = null;
  for (const sample of candidates) {
    const sampleVector = vectorKind === 'embedding' ? sample.vector : (vectorKind === 'stored' ? sample.vector : sample.textVector);
    if (!sampleVector || sampleVector.length !== inputVector.length) continue;
    const score = cosineSimilarity(inputVector, sampleVector);
    if (score < -1) continue;
    if (!best || score > best.score) {
      if (best && best.sample.scenario !== sample.scenario) {
        secondBestDifferentScenario = best;
      } else if (best && secondBestDifferentScenario && secondBestDifferentScenario.sample.scenario !== sample.scenario) {
        // keep existing secondBest
      }
      best = { sample, score };
    } else if (best && sample.scenario !== best.sample.scenario) {
      if (!secondBestDifferentScenario || score > secondBestDifferentScenario.score) {
        secondBestDifferentScenario = { sample, score };
      }
    }
  }

  if (!best) {
    return {
      ok: false,
      source: 'route-vector-unavailable',
      reason: 'no comparable route vectors',
      thresholds: db.thresholds,
    };
  }

  const margin = secondBestDifferentScenario
    ? best.score - secondBestDifferentScenario.score
    : Infinity;

  return {
    ok: true,
    source: 'route-vector-cosine',
    score: best.score,
    margin,
    confidenceBand: confidenceBand(best.score, db.thresholds, margin),
    thresholds: db.thresholds,
    matchedSample: {
      id: best.sample.id,
      scenario: best.sample.scenario,
      text: best.sample.text,
      route: best.sample.route,
    },
    vectorKind,
    model: db.model,
    providerId: db.providerId,
  };
}

export async function classifyPipelineRoute(input = {}) {
  const text = typeof input === 'string' ? input : input.text;
  const vector = typeof input === 'object' && input !== null ? input.vector : null;
  const match = await routeVectorMatch({ text, vector, scenarioPrefix: 'pipeline-trigger' });
  if (!match.ok || match.confidenceBand !== 'direct') {
    return {
      ...match,
      shouldTrigger: false,
      level: 0,
      decision: 'unrouted',
    };
  }

  const route = match.matchedSample.route || {};
  return {
    ...match,
    shouldTrigger: route.shouldTrigger === true,
    level: typeof route.level === 'number' ? route.level : 0,
    decision: route.shouldTrigger === true ? 'trigger' : 'pass',
  };
}

export async function classifyStageRoute(input = {}) {
  const text = typeof input === 'string' ? input : input.text;
  const vector = typeof input === 'object' && input !== null ? input.vector : null;
  const match = await routeVectorMatch({ text, vector, scenarioPrefix: 'stage:' });
  if (!match.ok || match.confidenceBand !== 'direct') {
    return {
      ...match,
      stage: null,
      decision: 'unrouted',
    };
  }

  const stage = typeof match.matchedSample.route?.stage === 'string'
    ? match.matchedSample.route.stage
    : null;
  return {
    ...match,
    stage,
    decision: stage ? 'stage' : 'unrouted',
  };
}

export async function classifyCommandRoute(commandName, args = {}) {
  const text = String(args.goal || args.taskDescription || args.description || args.rawCommand || args.label || '').trim();
  const explicitVector = normalizeVector(args.vector);
  const sharedVector = explicitVector || storedVectorFromExactText(text, loadRouteVectorDb().samples) || await embedText(text);
  const pipeline = await classifyPipelineRoute({ text, vector: sharedVector });
  const stage = await classifyStageRoute({ text, vector: sharedVector });
  return {
    commandName: String(commandName || ''),
    source: 'route-vector-classifier',
    textPreview: text.slice(0, 200),
    pipeline,
    stage,
    selectedStage: stage.decision === 'stage' ? stage.stage : null,
    selectedPipelineLevel: pipeline.decision === 'trigger' ? pipeline.level : 0,
  };
}

export function selfTestRouteVectors({ scenarioPrefix = null } = {}) {
  const db = loadRouteVectorDb({ refresh: true });
  const samples = scenarioPrefix
    ? db.samples.filter((sample) => sample.scenario.startsWith(String(scenarioPrefix)))
    : db.samples;
  let passed = 0;
  const failures = [];

  for (const sample of samples) {
    const prefix = sample.scenario.startsWith('stage:') ? 'stage:' : sample.scenario;
    const candidates = db.samples.filter((s) => s.scenario.startsWith(prefix));
    let best = null;
    for (const candidate of candidates) {
      if (candidate.vector.length !== sample.vector.length) continue;
      const score = cosineSimilarity(sample.vector, candidate.vector);
      if (!best || score > best.score) best = { sample: candidate, score };
    }
    const ok = best && best.sample.id === sample.id && best.score >= db.thresholds.direct;
    if (ok) {
      passed += 1;
    } else {
      failures.push({
        id: sample.id,
        scenario: sample.scenario,
        expectedRoute: sample.route,
        matchedSample: best?.sample ? { id: best.sample.id, route: best.sample.route } : null,
        score: best?.score ?? null,
        confidenceBand: best ? confidenceBand(best.score, db.thresholds) : null,
      });
    }
  }

  return {
    total: samples.length,
    passed,
    failed: failures.length,
    accuracy: samples.length === 0 ? 0 : passed / samples.length,
    failures,
    thresholds: db.thresholds,
    source: 'route-vector-self-test',
  };
}

export function saveRouteVectorDb(db, { path = ROUTE_VECTOR_DB_PATH } = {}) {
  writeFileSync(path, JSON.stringify(db, null, 2) + '\n', 'utf8');
}
