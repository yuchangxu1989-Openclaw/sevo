#!/usr/bin/env node
/**
 * Seed all vector databases with embeddings from volcengine-ark.
 *
 * Usage: node projects/sevo/scripts/seed-vectors.mjs
 *
 * Reads ARK_API_KEY from env or openclaw.json, then embeds all sample texts
 * in each vector DB JSON file under projects/sevo/data/*-vectors.json.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const DATA_DIR = resolve(import.meta.dirname, '..', 'data');
const MODEL = 'doubao-embedding-vision-251215';
const BATCH_SIZE = 8;
const DELAY_MS = 200;

function getEmbeddingEndpoint() {
  if (process.env.ARK_API_KEY) {
    return { url: 'https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal', apiKey: process.env.ARK_API_KEY };
  }
  try {
    const cfgPath = resolve(process.env.HOME ?? '/root', '.openclaw', 'openclaw.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const provider = cfg?.models?.providers?.['volcengine-ark'];
    if (provider?.apiKey && provider?.baseUrl) {
      const base = provider.baseUrl.replace(/\/+$/, '');
      return { url: `${base}/embeddings/multimodal`, apiKey: provider.apiKey };
    }
  } catch {}
  return null;
}

async function embedOne(text, endpoint) {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'text', text: String(text || '').slice(0, 4000) }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Embedding API error ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const vector = data?.data?.embedding || data?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Embedding API returned no vector');
  }
  return vector;
}

async function embedBatch(texts, endpoint) {
  const vectors = [];
  for (const text of texts) {
    vectors.push(await embedOne(text, endpoint));
  }
  return vectors;
}

async function seedFile(filePath, endpoint) {
  const db = JSON.parse(readFileSync(filePath, 'utf8'));
  const samplesToEmbed = db.samples.filter(s => !s.vector || s.vector.length === 0);

  if (samplesToEmbed.length === 0) {
    console.log(`  [skip] ${filePath} — all vectors populated`);
    return 0;
  }

  console.log(`  [seed] ${filePath} — ${samplesToEmbed.length} samples to embed`);

  for (let i = 0; i < samplesToEmbed.length; i += BATCH_SIZE) {
    const batch = samplesToEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map(s => s.text);
    const vectors = await embedBatch(texts, endpoint);

    for (let j = 0; j < batch.length; j++) {
      batch[j].vector = vectors[j];
    }

    if (i + BATCH_SIZE < samplesToEmbed.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  writeFileSync(filePath, JSON.stringify(db, null, 2) + '\n', 'utf8');
  return samplesToEmbed.length;
}

async function main() {
  const endpoint = getEmbeddingEndpoint();
  if (!endpoint) {
    console.error('ERROR: No embedding endpoint found (set ARK_API_KEY or configure openclaw.json)');
    process.exit(1);
  }

  const files = readdirSync(DATA_DIR)
    .filter(f => f.endsWith('-vectors.json'))
    .map(f => join(DATA_DIR, f));

  console.log(`Seeding ${files.length} vector databases via ${endpoint.url}...`);
  let total = 0;
  for (const file of files) {
    total += await seedFile(file, endpoint);
  }
  console.log(`Done. Embedded ${total} samples total.`);
}

main().catch(e => { console.error(e); process.exit(1); });
