/**
 * Router module barrel exports.
 */

// ── Existing routing API ────────────────────────────────────────
export { route } from './router.js';
export { classifyLevel } from './level-classifier.js';
export type { ClassificationResult } from './level-classifier.js';

// ── Stage Router (new) ──────────────────────────────────────────
export { StageRouter } from './stage-router.js';
export { StageGraph, DEFAULT_SDD_GRAPH, DEFAULT_SDD_EDGES } from './stage-graph.js';
export type { StageEdge } from './stage-graph.js';
export { StageContext } from './stage-context.js';
export type { TransitionRecord } from './stage-context.js';
