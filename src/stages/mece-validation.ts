/**
 * MECE Validation & Dependency Analysis for Contract stage.
 * (AC-3.11, AC-3.12)
 */

import type { WorkPackage } from './contract-types.js';
import type { FunctionalRequirement } from './spec-types.js';

// ── MECE Validation (AC-3.11) ───────────────────────────────────

export interface MECEValidationResult {
  valid: boolean;
  mutuallyExclusive: boolean;
  collectivelyExhaustive: boolean;
  overlaps: Array<{ wpA: string; wpB: string; sharedFrIds: string[] }>;
  uncoveredFrIds: string[];
  suggestions: string[];
}

/**
 * Validate that a set of work packages is MECE with respect to the given FRs.
 *
 * Mutually Exclusive: no FR is covered by more than one work package.
 * Collectively Exhaustive: every FR is covered by at least one work package.
 */
export function validateMECE(
  tasks: WorkPackage[],
  allFrIds?: string[],
): MECEValidationResult {
  // Check mutual exclusivity: detect FR overlaps between work packages
  const overlaps: MECEValidationResult['overlaps'] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const wpA = tasks[i]!;
      const wpB = tasks[j]!;
      const sharedFrIds = wpA.frIds.filter((fr) => wpB.frIds.includes(fr));
      if (sharedFrIds.length > 0) {
        overlaps.push({ wpA: wpA.id, wpB: wpB.id, sharedFrIds });
      }
    }
  }
  const mutuallyExclusive = overlaps.length === 0;

  // Check collective exhaustiveness: all FRs covered
  const coveredFrIds = new Set(tasks.flatMap((wp) => wp.frIds));
  const requiredFrIds = allFrIds ?? [];
  const uncoveredFrIds = requiredFrIds.filter((fr) => !coveredFrIds.has(fr));
  const collectivelyExhaustive = uncoveredFrIds.length === 0;

  // Build suggestions
  const suggestions: string[] = [];
  if (!mutuallyExclusive) {
    for (const overlap of overlaps) {
      suggestions.push(
        `Work packages ${overlap.wpA} and ${overlap.wpB} share FR(s): ${overlap.sharedFrIds.join(', ')}. Consider splitting responsibilities.`,
      );
    }
  }
  if (!collectivelyExhaustive) {
    suggestions.push(
      `Uncovered FR(s): ${uncoveredFrIds.join(', ')}. Add work packages or extend existing ones to cover them.`,
    );
  }

  return {
    valid: mutuallyExclusive && collectivelyExhaustive,
    mutuallyExclusive,
    collectivelyExhaustive,
    overlaps,
    uncoveredFrIds,
    suggestions,
  };
}

// ── Dependency Analysis (AC-3.12) ───────────────────────────────

export interface DependencyAnalysisResult {
  tasks: WorkPackage[];
  hasCycle: boolean;
  cycleDetails: string[];
  dependencyGraph: Map<string, string[]>;
}

/**
 * Analyze dependencies between work packages and populate dependsOn fields.
 *
 * Uses the existing `dependencies` field (WP-level references) to fill `dependsOn`.
 * Detects circular dependencies via topological sort.
 */
export function analyzeDependencies(tasks: WorkPackage[]): DependencyAnalysisResult {
  const idSet = new Set(tasks.map((t) => t.id));
  const graph = new Map<string, string[]>();

  // Build dependency graph from existing dependencies field
  for (const task of tasks) {
    const deps = task.dependencies.filter((d) => idSet.has(d));
    graph.set(task.id, deps);
    // Populate dependsOn from dependencies (only valid refs)
    task.dependsOn = deps.length > 0 ? deps : undefined;
    // Mark as parallel if no dependencies
    if (task.parallel === undefined) {
      task.parallel = deps.length === 0;
    }
  }

  // Detect cycles using Kahn's algorithm
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  for (const [id, deps] of graph) {
    for (const dep of deps) {
      adjacency.get(dep)?.push(id);
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    queue.sort();
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const hasCycle = sorted.length < tasks.length;
  const cycleDetails: string[] = [];
  if (hasCycle) {
    const inCycle = tasks.filter((t) => !sorted.includes(t.id)).map((t) => t.id);
    cycleDetails.push(`Circular dependency detected among: ${inCycle.join(', ')}`);
  }

  return {
    tasks,
    hasCycle,
    cycleDetails,
    dependencyGraph: graph,
  };
}
