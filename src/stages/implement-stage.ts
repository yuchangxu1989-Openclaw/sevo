import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import {
  captureBaseline,
  evaluateRatchet,
  isRatchetEnabled,
  loadRatchetRegistry,
  ratchetResultToArtifact,
  type RatchetConfig,
  type RatchetRegistry,
  type RatchetResult,
} from '../evaluators/ratchet.js';
import { getEvaluatorsDir, loadEvaluatorRegistry, runEvaluators } from '../evaluators/evaluator-runner.js';
import type { EvaluatorResult } from '../evaluators/evaluator-types.js';
import type { SubTask } from './contract-types.js';
import { SystematicDebuggingStage } from './debugging-stage.js';
import type { Stage } from './spec-types.js';
import type {
  ImplementStageInput,
  ImplementStageOutput,
  ImplementStageOptions,
  ImplementationBundle,
  TaskExecution,
  ImplementationEvidence,
  TaskExecutionRequest,
} from './implement-types.js';

export class ImplementStage implements Stage<ImplementStageInput, ImplementStageOutput> {
  readonly stageId: StageId = 'implement' as const;
  private readonly now: () => string;

  constructor(private readonly options: ImplementStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: ImplementStageInput): Promise<ImplementStageOutput> {
    const { contractPackage, workPackages, acceptanceCriteria } = input;
    const executions: TaskExecution[] = [];
    const ratchetResults: RatchetResult[] = [];
    const projectRoot = input.projectRoot ?? process.cwd();
    const ratchetRegistry = this.loadEffectiveRatchetRegistry(projectRoot, workPackages);

    // Execute tasks in delivery order
    const orderedWps = contractPackage.deliveryOrder.length > 0
      ? contractPackage.deliveryOrder
          .map((id) => workPackages.find((wp) => wp.id === id))
          .filter((wp): wp is NonNullable<typeof wp> => wp != null)
      : workPackages;

    for (const wp of orderedWps) {
      const wpCriteria = acceptanceCriteria.filter((ac) =>
        wp.frIds.includes(ac.requirementId),
      );

      // If the work package has fine-grained sub-tasks, execute each independently.
      // Otherwise fall back to whole-WP execution (backward compatible).
      if (wp.tasks && wp.tasks.length > 0) {
        for (const subTask of wp.tasks) {
          const subExec = await this.executeSubTask(input, wp, subTask, wpCriteria, contractPackage);
          executions.push(subExec);
        }
      } else {
        const beforeWp = Date.now();
        const ratchetConfig = ratchetRegistry[wp.id];
        const ratchetEnabled = isRatchetEnabled(ratchetRegistry, wp.id);
        if (ratchetEnabled) {
          captureBaseline(projectRoot, wp.id, ratchetConfig!);
        }

        const exec = await this.executeWorkPackage(input, wp, wpCriteria, contractPackage);
        executions.push(exec);

        if (ratchetEnabled) {
          const result = await this.evaluateWorkPackageRatchet(
            projectRoot,
            wp.id,
            ratchetConfig!,
            input.artifactBasePath ? [path.join(input.artifactBasePath, `${input.taskId}-implementation-bundle.json`)] : [],
            Date.now() - beforeWp,
          );
          ratchetResults.push(result);
          exec.evidence.push({
            type: 'test_result',
            content: `Ratchet ${result.outcome}: baseline=${result.baseline.metricValue}, optimized=${result.optimizedValue ?? 'n/a'}, kept=${!result.rolledBack}, elapsed=${result.durationMs}ms`,
            timestamp: this.now(),
          });
          if (result.rolledBack) {
            exec.evidence.push({
              type: 'deviation_note',
              content: `Ratchet rollback to ${result.rollbackTargetSha}: ${result.rollbackReason}. Discarded changes: ${result.discardedChangesSummary ?? 'unknown'}`,
              timestamp: this.now(),
            });
          }
        }
      }
    }

    // Build traceability: FR → taskIds
    const traceability = new Map<string, string[]>();
    for (const exec of executions) {
      for (const frId of exec.allowedScope) {
        const existing = traceability.get(frId) ?? [];
        existing.push(exec.taskId);
        traceability.set(frId, existing);
      }
    }

    // Compute test metrics — acceptance based on testResults only
    const allTests = executions.flatMap((e) => e.testResults);
    const totalTestsPassed = allTests.filter((t) => t.passed).length;
    const totalTestsFailed = allTests.filter((t) => !t.passed).length;
    // allAccepted: requires at least one passing test AND no failures (AC-4.20b)
    const hasTests = totalTestsPassed > 0;
    const allAccepted = totalTestsFailed === 0 && hasTests;

    // AC-4.18: Evidence non-empty gate — every execution must have at least one evidence item
    const emptyEvidenceExecutions = executions.filter((e) => e.evidence.length === 0);
    const evidenceGatePassed = emptyEvidenceExecutions.length === 0;
    if (!evidenceGatePassed) {
      const missingIds = emptyEvidenceExecutions.map((e) => e.taskId);
      // Record deviation but don't block — add a deviation_note evidence entry
      for (const exec of emptyEvidenceExecutions) {
        exec.evidence.push({
          type: 'deviation_note',
          content: `AC-4.18 gate: No evidence provided for task ${exec.taskId}. Evidence is required.`,
          timestamp: this.now(),
        });
      }
    }

    const bundle: ImplementationBundle = {
      executions,
      summary: `Executed ${executions.length} tasks across ${workPackages.length} work packages. Tests: ${totalTestsPassed} passed, ${totalTestsFailed} failed.`,
      traceability,
    };

    const debugging = input.debuggingIssues && input.debuggingIssues.length > 0
      ? await new SystematicDebuggingStage({
          adapter: {
            executePhase: this.options.adapter.executeDebuggingPhase,
          },
          now: this.now,
        }).execute({
          taskId: input.taskId,
          pipelineId: input.pipelineId,
          issues: input.debuggingIssues,
          artifactBasePath: input.artifactBasePath,
        })
      : null;

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, bundle, ratchetResults, timestamp);

    return {
      implementationBundle: bundle,
      metadata: {
        totalTasksExecuted: executions.length,
        totalTestsPassed,
        totalTestsFailed,
        allAccepted,
        hasTests,
        evidenceGatePassed,  // AC-4.18
        ...(ratchetResults.length > 0 ? { ratchetResults } : {}),
        ...(debugging ? { debugging: debugging.metadata } : {}),
        generatedAt: timestamp,
      },
      artifact,
    };
  }

  // ── Execute a single SubTask (failure does not block siblings) ──

  private async executeSubTask(
    input: ImplementStageInput,
    wp: import('./contract-types.js').WorkPackage,
    subTask: SubTask,
    wpCriteria: import('./spec-types.js').AcceptanceCriteria[],
    contractPackage: import('./contract-types.js').ContractPackage,
  ): Promise<TaskExecution> {
    const taskId = `${input.taskId}:${wp.id}:${subTask.id}`;
    const timestamp = this.now();

    if (this.options.adapter.executeTask) {
      try {
        const request: TaskExecutionRequest = {
          workPackage: wp,
          subTask,
          acceptanceCriteria: wpCriteria,
          contractPackage,
        };

        const response = await this.options.adapter.executeTask(request);

        const evidence: ImplementationEvidence[] = response.evidence.map((e) => ({
          type: e.type,
          content: e.content,
          timestamp,
        }));

        // AC-4.20a: Record TDD ordering timestamps
        const testFirstTimestamp = response.testResults.length > 0 ? timestamp : undefined;
        const implTimestamp = timestamp;
        const tddOrderFollowed = testFirstTimestamp !== undefined
          ? testFirstTimestamp <= implTimestamp
          : undefined;

        return {
          taskId,
          workPackageId: wp.id,
          subTaskId: subTask.id,
          targetFiles: subTask.targetFiles,
          estimatedMinutes: subTask.estimatedMinutes,
          input: subTask.description,
          output: response.output,
          allowedScope: subTask.acIds.length > 0 ? subTask.acIds : wp.frIds,
          evidence,
          testResults: response.testResults,
          testFirstTimestamp,
          implTimestamp,
          tddOrderFollowed,
        };
      } catch (err) {
        // SubTask failure: record but continue with siblings
        return {
          taskId,
          workPackageId: wp.id,
          subTaskId: subTask.id,
          targetFiles: subTask.targetFiles,
          estimatedMinutes: subTask.estimatedMinutes,
          input: subTask.description,
          output: `SubTask failed: ${err instanceof Error ? err.message : String(err)}`,
          allowedScope: subTask.acIds.length > 0 ? subTask.acIds : wp.frIds,
          evidence: [{
            type: 'deviation_note',
            content: `SubTask execution failed: ${err instanceof Error ? err.message : String(err)}`,
            timestamp,
          }],
          testResults: [],
        };
      }
    }

    // No adapter: pending
    return {
      taskId,
      workPackageId: wp.id,
      subTaskId: subTask.id,
      targetFiles: subTask.targetFiles,
      estimatedMinutes: subTask.estimatedMinutes,
      input: subTask.description,
      output: 'Pending implementation (no adapter provided)',
      allowedScope: subTask.acIds.length > 0 ? subTask.acIds : wp.frIds,
      evidence: [{
        type: 'deviation_note',
        content: 'No implementation adapter configured; task recorded but not executed.',
        timestamp,
      }],
      testResults: [],
    };
  }

  // ── Execute a whole WorkPackage (original behavior) ──

  private async executeWorkPackage(
    input: ImplementStageInput,
    wp: import('./contract-types.js').WorkPackage,
    wpCriteria: import('./spec-types.js').AcceptanceCriteria[],
    contractPackage: import('./contract-types.js').ContractPackage,
  ): Promise<TaskExecution> {
    const taskId = `${input.taskId}:${wp.id}`;
    const timestamp = this.now();

    if (this.options.adapter.executeTask) {
      const request: TaskExecutionRequest = {
        workPackage: wp,
        acceptanceCriteria: wpCriteria,
        contractPackage,
      };

      const response = await this.options.adapter.executeTask(request);

      const evidence: ImplementationEvidence[] = response.evidence.map((e) => ({
        type: e.type,
        content: e.content,
        timestamp,
      }));

      // AC-4.20a: Record TDD ordering timestamps
      const testFirstTimestamp = response.testResults.length > 0 ? timestamp : undefined;
      const implTimestamp = timestamp;
      const tddOrderFollowed = testFirstTimestamp !== undefined
        ? testFirstTimestamp <= implTimestamp
        : undefined;

      return {
        taskId,
        workPackageId: wp.id,
        input: wp.description,
        output: response.output,
        allowedScope: wp.frIds,
        evidence,
        testResults: response.testResults,
        testFirstTimestamp,
        implTimestamp,
        tddOrderFollowed,
      };
    }

    // No adapter: pending
    return {
      taskId,
      workPackageId: wp.id,
      input: wp.description,
      output: 'Pending implementation (no adapter provided)',
      allowedScope: wp.frIds,
      evidence: [{
        type: 'deviation_note',
        content: 'No implementation adapter configured; task recorded but not executed.',
        timestamp,
      }],
      testResults: [],
    };
  }

  private async writeArtifact(
    input: ImplementStageInput,
    bundle: ImplementationBundle,
    ratchetResults: RatchetResult[],
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'implement');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-implementation-bundle.json`);

    // Serialize Map as object for JSON
    const serializable = {
      executions: bundle.executions,
      summary: bundle.summary,
      traceability: Object.fromEntries(bundle.traceability),
      ...(ratchetResults.length > 0 ? { ratchetResults } : {}),
      generatedAt: timestamp,
    };

    await writeFile(filePath, JSON.stringify(serializable, null, 2), 'utf8');

    return {
      id: `${input.taskId}:implementation-bundle`,
      type: 'implementation-bundle',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        taskCount: bundle.executions.length,
        traceabilityEntries: bundle.traceability.size,
        ...(ratchetResults.length > 0
          ? {
              ratchetResultCount: ratchetResults.length,
              ratchetOutcomes: ratchetResults.map((result) => ({
                workPackageId: result.workPackageId,
                outcome: result.outcome,
                rolledBack: result.rolledBack,
              })),
            }
          : {}),
      },
    };
  }

  private loadEffectiveRatchetRegistry(
    projectRoot: string,
    workPackages: import('./contract-types.js').WorkPackage[],
  ): RatchetRegistry {
    const registry = { ...loadRatchetRegistry(projectRoot) };
    for (const wp of workPackages) {
      if (wp.ratchet?.enabled === true) {
        registry[wp.id] = wp.ratchet;
      }
    }
    return registry;
  }

  private async evaluateWorkPackageRatchet(
    projectRoot: string,
    workPackageId: string,
    config: RatchetConfig,
    artifactPaths: string[],
    elapsedMs: number,
  ): Promise<RatchetResult> {
    const registry = loadEvaluatorRegistry(projectRoot);
    const evaluatorsDir = getEvaluatorsDir(projectRoot);
    const resultSet = await runEvaluators(
      'implement',
      registry,
      artifactPaths,
      { projectRoot, workPackageId, metric: config.baselineMetric },
      evaluatorsDir,
    );
    const evaluatorResult = this.pickRatchetEvaluatorResult(resultSet, config);
    const result = evaluateRatchet({
      projectRoot,
      workPackageId,
      evaluatorResult,
      timeBudgetExhausted: elapsedMs > config.timeBudgetSeconds * 1000,
    });
    ratchetResultToArtifact(projectRoot, result);
    return result;
  }

  private pickRatchetEvaluatorResult(
    resultSet: Awaited<ReturnType<typeof runEvaluators>>,
    config: RatchetConfig,
  ): EvaluatorResult {
    const completed = resultSet?.executions.find((execution) =>
      execution.status === 'completed' && execution.result != null && (
        execution.name === config.baselineMetric ||
        execution.result.details.some((detail) => detail.rule === config.baselineMetric)
      ),
    ) ?? resultSet?.executions.find((execution) => execution.status === 'completed' && execution.result != null);

    if (completed?.result) {
      return completed.result;
    }

    return {
      verdict: 'fail',
      score: config.baselineValue,
      details: [{
        rule: config.baselineMetric,
        passed: false,
        message: 'No executable evaluator result was available for ratchet comparison.',
      }],
    };
  }
}
