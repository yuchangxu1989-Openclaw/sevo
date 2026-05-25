/**
 * Stage Router — core routing logic for stage advancement.
 * Evaluates the stage graph DAG and determines next stage based on gate verdict.
 * (arc42 §5.1, spec §FR-01)
 */

import type { GateVerdict, StageId } from '../types/index.js';
import { StageGraph, DEFAULT_SDD_GRAPH } from './stage-graph.js';
import type { StageEdge } from './stage-graph.js';

/** Router that advances stages based on gate verdicts and a flow graph. */
export class StageRouter {
  private graph: StageGraph;

  constructor(graph?: StageGraph) {
    this.graph = graph ?? DEFAULT_SDD_GRAPH;
  }

  /**
   * Determine the next stage given current stage and gate verdict.
   *
   * - If verdict.conclusion !== 'passed', returns null (stay at current stage).
   * - Otherwise, evaluates outgoing edges. First matching conditional edge wins.
   *   If no conditional edge matches, the first unconditional edge is used.
   * - Returns null if no valid transition exists (terminal stage).
   */
  advance(currentStage: StageId, verdict: GateVerdict): StageId | null {
    if (verdict.conclusion !== 'passed') {
      return null;
    }

    const outgoing = this.graph.getOutgoing(currentStage);
    if (outgoing.length === 0) {
      return null;
    }

    // Conditional edges take priority — first match wins.
    for (const edge of outgoing) {
      if (edge.condition && edge.condition(verdict)) {
        return edge.to;
      }
    }

    // Fall back to first unconditional edge.
    const unconditional = outgoing.find((e) => !e.condition);
    return unconditional?.to ?? null;
  }

  /** Replace the current graph (for custom flow registration). */
  setGraph(graph: StageGraph): void {
    this.graph = graph;
  }

  /** Get the current graph. */
  getGraph(): StageGraph {
    return this.graph;
  }
}
