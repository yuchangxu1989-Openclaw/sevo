export type DispatchMode = 'parallel' | 'serial-fallback';

export interface DagNode<TPayload = unknown> {
  id: string;
  workPackageId: string;
  dependsOn: string[];
  parallel: boolean;
  payload: TPayload;
}

export interface DagMetrics {
  parallelTaskCount: number;
  maxParallelism: number;
  criticalPathLength: number;
}

export interface TaskDispatchAuditEntry {
  taskId: string;
  workPackageId: string;
  batchId: number;
  dependsOn: string[];
  dispatchedAt: string;
  completedAt?: string;
  unlockedTasks: string[];
  mode: DispatchMode;
}

export interface DispatchBatch<TPayload = unknown> {
  batchId: number;
  mode: DispatchMode;
  tasks: DagNode<TPayload>[];
}

function sortIds(ids: Iterable<string>): string[] {
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

export function sanitizeDagNodes<TPayload>(nodes: DagNode<TPayload>[]): DagNode<TPayload>[] {
  const ids = new Set(nodes.map((node) => node.id));

  return nodes.map((node) => ({
    ...node,
    dependsOn: sortIds(node.dependsOn.filter((dep) => dep !== node.id && ids.has(dep))),
  }));
}

export function buildDependencyGraph<TPayload>(nodes: DagNode<TPayload>[]): Record<string, string[]> {
  return Object.fromEntries(
    sanitizeDagNodes(nodes).map((node) => [node.id, [...node.dependsOn]]),
  );
}

export function computeDagMetrics<TPayload>(nodes: DagNode<TPayload>[]): DagMetrics {
  const sanitized = sanitizeDagNodes(nodes);
  if (sanitized.length === 0) {
    return {
      parallelTaskCount: 0,
      maxParallelism: 0,
      criticalPathLength: 0,
    };
  }

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of sanitized) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, node.dependsOn.length);
  }

  for (const node of sanitized) {
    for (const dep of node.dependsOn) {
      const neighbors = adjacency.get(dep);
      if (neighbors) {
        neighbors.push(node.id);
      }
    }
  }

  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 1;

    visiting.add(id);
    const neighbors = adjacency.get(id) ?? [];
    const depth = neighbors.length === 0
      ? 1
      : 1 + Math.max(...neighbors.map((neighbor) => depthOf(neighbor)));
    visiting.delete(id);
    depthMemo.set(id, depth);
    return depth;
  };

  let ready = sanitized
    .filter((node) => node.dependsOn.length === 0)
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));
  let maxParallelism = ready.length;
  let processed = 0;

  while (ready.length > 0) {
    maxParallelism = Math.max(maxParallelism, ready.length);
    const current = [...ready];
    ready = [];

    for (const id of current) {
      processed += 1;
      for (const neighbor of adjacency.get(id) ?? []) {
        const remaining = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, remaining);
        if (remaining === 0) {
          ready.push(neighbor);
        }
      }
    }

    ready.sort((a, b) => a.localeCompare(b));
  }

  if (processed < sanitized.length) {
    maxParallelism = Math.max(maxParallelism, 1);
  }

  return {
    parallelTaskCount: sanitized.filter((node) => node.parallel).length,
    maxParallelism,
    criticalPathLength: Math.max(...sanitized.map((node) => depthOf(node.id))),
  };
}

export class TaskDagScheduler<TPayload = unknown> {
  private readonly nodes: Map<string, DagNode<TPayload>>;
  private readonly adjacency = new Map<string, string[]>();
  private readonly criticalPathDepth: Map<string, number>;
  private readonly pending = new Set<string>();
  private readonly running = new Set<string>();
  private readonly completed = new Set<string>();
  private readonly auditLog: TaskDispatchAuditEntry[] = [];
  private batchCounter = 0;

  constructor(
    inputNodes: DagNode<TPayload>[],
    private readonly options: { singleAgent?: boolean } = {},
  ) {
    const sanitized = sanitizeDagNodes(inputNodes);
    this.nodes = new Map(sanitized.map((node) => [node.id, node]));

    for (const node of sanitized) {
      this.pending.add(node.id);
      this.adjacency.set(node.id, []);
    }

    for (const node of sanitized) {
      for (const dep of node.dependsOn) {
        const neighbors = this.adjacency.get(dep);
        if (neighbors) {
          neighbors.push(node.id);
        }
      }
    }

    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    const depthOf = (id: string): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      if (visiting.has(id)) return 1;

      visiting.add(id);
      const neighbors = this.adjacency.get(id) ?? [];
      const depth = neighbors.length === 0
        ? 1
        : 1 + Math.max(...neighbors.map((neighbor) => depthOf(neighbor)));
      visiting.delete(id);
      memo.set(id, depth);
      return depth;
    };

    for (const node of sanitized) {
      depthOf(node.id);
    }
    this.criticalPathDepth = memo;
  }

  get mode(): DispatchMode {
    return this.options.singleAgent ? 'serial-fallback' : 'parallel';
  }

  hasPendingWork(): boolean {
    return this.pending.size > 0 || this.running.size > 0;
  }

  getAuditLog(): readonly TaskDispatchAuditEntry[] {
    return this.auditLog;
  }

  getDependencyGraph(): Record<string, string[]> {
    return Object.fromEntries(
      Array.from(this.nodes.values()).map((node) => [node.id, [...node.dependsOn]]),
    );
  }

  getMetrics(): DagMetrics {
    return computeDagMetrics(Array.from(this.nodes.values()));
  }

  dispatchNextBatch(dispatchedAt: string): DispatchBatch<TPayload> | null {
    const ready = this.getReadyNodes();
    const batchNodes = ready.length > 0
      ? (this.options.singleAgent ? [ready[0]!] : ready)
      : this.pickFallbackNodes();

    if (batchNodes.length === 0) {
      return null;
    }

    const batchId = ++this.batchCounter;
    for (const node of batchNodes) {
      this.pending.delete(node.id);
      this.running.add(node.id);
      this.auditLog.push({
        taskId: node.id,
        workPackageId: node.workPackageId,
        batchId,
        dependsOn: [...node.dependsOn],
        dispatchedAt,
        unlockedTasks: [],
        mode: this.mode,
      });
    }

    return {
      batchId,
      mode: this.mode,
      tasks: batchNodes,
    };
  }

  markCompleted(taskIds: string[], completedAt: string): string[] {
    const readyBefore = new Set(this.getReadyTaskIds());

    for (const taskId of taskIds) {
      if (!this.running.has(taskId)) continue;
      this.running.delete(taskId);
      this.completed.add(taskId);
    }

    const newlyReady = this.getReadyTaskIds().filter((taskId) => !readyBefore.has(taskId));

    for (const taskId of taskIds) {
      const entry = this.findLatestAuditEntry(taskId);
      if (!entry) continue;
      entry.completedAt = completedAt;
      entry.unlockedTasks = newlyReady.filter((candidateId) => {
        const candidate = this.nodes.get(candidateId);
        return candidate?.dependsOn.includes(taskId) ?? false;
      });
    }

    return newlyReady;
  }

  private getReadyTaskIds(): string[] {
    return this.sortReady(
      Array.from(this.pending).filter((taskId) => {
        const node = this.nodes.get(taskId);
        if (!node) return false;
        return node.dependsOn.every((dep) => this.completed.has(dep));
      }),
    );
  }

  private getReadyNodes(): DagNode<TPayload>[] {
    return this.getReadyTaskIds()
      .map((taskId) => this.nodes.get(taskId))
      .filter((node): node is DagNode<TPayload> => node !== undefined);
  }

  private pickFallbackNodes(): DagNode<TPayload>[] {
    const remaining = this.sortReady(Array.from(this.pending));
    if (remaining.length === 0) return [];

    const first = this.nodes.get(remaining[0]!);
    if (!first) return [];
    return [first];
  }

  private sortReady(taskIds: string[]): string[] {
    return [...taskIds].sort((left, right) => {
      const leftDepth = this.criticalPathDepth.get(left) ?? 1;
      const rightDepth = this.criticalPathDepth.get(right) ?? 1;
      if (leftDepth !== rightDepth) {
        return rightDepth - leftDepth;
      }
      return left.localeCompare(right);
    });
  }

  private findLatestAuditEntry(taskId: string): TaskDispatchAuditEntry | undefined {
    for (let index = this.auditLog.length - 1; index >= 0; index -= 1) {
      const entry = this.auditLog[index];
      if (entry?.taskId === taskId) {
        return entry;
      }
    }
    return undefined;
  }
}
