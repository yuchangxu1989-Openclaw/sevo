import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  ContractPackage,
  ContractStageInput,
  ContractStageOutput,
  ContractStageOptions,
  WorkPackage,
  ImplementationBoundary,
} from './contract-types.js';
import { validateMECE, analyzeDependencies } from './mece-validation.js';

export class ContractStage implements Stage<ContractStageInput, ContractStageOutput> {
  readonly stageId: StageId = 'contract' as const;
  private readonly now: () => string;

  constructor(private readonly options: ContractStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: ContractStageInput): Promise<ContractStageOutput> {
    const { specPackage } = input;
    const frs = specPackage.functionalRequirements;

    let contractPackage: ContractPackage;

    if (this.options.adapter.generateContract) {
      const response = await this.options.adapter.generateContract({
        functionalRequirements: frs,
        specSummary: specPackage.summary,
      });

      const workPackages: WorkPackage[] = response.workPackages.map((wp, i) => ({
        id: `WP-${String(i + 1).padStart(2, '0')}`,
        frIds: wp.frIds,
        description: wp.description,
        dependencies: wp.dependencies,
        estimatedEffort: wp.estimatedEffort,
      }));

      contractPackage = {
        architecturePlan: response.architecturePlan,
        implementationBoundaries: response.implementationBoundaries,
        workPackages,
        deliveryOrder: this.computeDeliveryOrder(workPackages),
      };
    } else {
      // Default: one work package per FR, topological order by index
      const workPackages: WorkPackage[] = frs.map((fr, i) => ({
        id: `WP-${String(i + 1).padStart(2, '0')}`,
        frIds: [fr.id],
        description: fr.description,
        dependencies: [],
        estimatedEffort: undefined,
      }));

      const boundaries: ImplementationBoundary[] = [{
        scope: `Implementation of ${frs.length} functional requirements`,
        constraints: ['Must pass all acceptance criteria'],
        outOfScope: [],
      }];

      contractPackage = {
        architecturePlan: `Architecture plan for: ${specPackage.summary}`,
        implementationBoundaries: boundaries,
        workPackages,
        deliveryOrder: workPackages.map((wp) => wp.id),
      };
    }

    // Run MECE validation and dependency analysis (AC-3.11, AC-3.12)
    const meceResult = validateMECE(contractPackage.workPackages, frs.map((fr) => fr.id));
    const depResult = analyzeDependencies(contractPackage.workPackages);
    const dependencyTaskCount = contractPackage.workPackages.filter((wp) => wp.dependencies.length > 0).length;

    if (meceResult.overlaps.length > 0 || meceResult.uncoveredFrIds.length > 0) {
      contractPackage.meceValidationIssues = meceResult.suggestions.map((msg) => ({
        type: 'overlapping-target' as const,
        workPackageId: '',
        taskIds: [],
        message: msg,
      }));
    }

    if (!depResult.hasCycle) {
      contractPackage.dependencyGraph = Object.fromEntries(depResult.dependencyGraph);
    }

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, contractPackage, timestamp);

    return {
      contractPackage,
      metadata: {
        totalWorkPackages: contractPackage.workPackages.length,
        totalFRsCovered: new Set(contractPackage.workPackages.flatMap((wp) => wp.frIds)).size,
        generatedAt: timestamp,
        meceValidationPassed: meceResult.valid,
        dependencyTaskCount,
      },
      artifact,
    };
  }

  /**
   * Topological sort of work packages by dependencies.
   * Falls back to original order for cycles or missing refs.
   */
  private computeDeliveryOrder(workPackages: WorkPackage[]): string[] {
    const ids = new Set(workPackages.map((wp) => wp.id));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const wp of workPackages) {
      inDegree.set(wp.id, 0);
      adjacency.set(wp.id, []);
    }

    for (const wp of workPackages) {
      for (const dep of wp.dependencies) {
        if (ids.has(dep)) {
          adjacency.get(dep)!.push(wp.id);
          inDegree.set(wp.id, (inDegree.get(wp.id) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      queue.sort(); // deterministic
      const current = queue.shift()!;
      order.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // If cycle detected, append remaining in original order
    if (order.length < workPackages.length) {
      for (const wp of workPackages) {
        if (!order.includes(wp.id)) order.push(wp.id);
      }
    }

    return order;
  }

  private async writeArtifact(
    input: ContractStageInput,
    contractPackage: ContractPackage,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'contract');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-contract-package.json`);
    await writeFile(filePath, JSON.stringify({ ...contractPackage, generatedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:contract-package`,
      type: 'contract-package',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        workPackageCount: contractPackage.workPackages.length,
        boundaryCount: contractPackage.implementationBoundaries.length,
      },
    };
  }
}
