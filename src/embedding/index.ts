export {
  readEmbeddingConfig,
  embedText,
  cosineSimilarity,
  loadVectorDb,
  classifyByEmbedding,
  classifyMultiLabel,
} from './embedding-classifier.js';

export type {
  EmbeddingConfig,
  VectorSample,
  VectorDb,
  ClassifyResult,
} from './embedding-classifier.js';
