/**
 * ProactiveDriveEngine — orchestrates the proactive drive layer (Domain D).
 *
 * Integrates FR-D01 (auto gate trigger), FR-D02 (spec gap detection),
 * and FR-D03 (post-release auto scan) with the PipelineEngineFacade.
 *
 * Hooks into stage transitions via the event bus (EventLedger) and
 * emits drive-layer events for the host adapter to consume.
 *
 * (spec §Domain D, arc42 §5.1)
 */

import type { StageId, ArtifactRef, PdcaCycleRecord } from '../types/index.js';
import type { GateEngine } from '../gate/gate-engine.js';
import type { EventLedger, LedgerEvent } from '../pipeline/ledger.js';
import type {
  PostReleaseValidationInput,
  GapAnalysisReport,
} from '../stages/post-release-validation-types.js';
import { StageTransitionTrigger } from './stage-transition-trigger.js';
import type { AutoTriggerResult } from './stage-transition-trigger.js';
import { SpecGapDetector } from './spec-gap-detector.js';
import type { FrReference, ImplementationModule } from './spec-gap-detector.js';
import { PostReleaseAutoScanner } from './post-release-auto-scanner.js';
import type { AutoGapScanResult } from './post-release-auto-scanner.js';
import type {
  ProactiveDriveConfig,
  GateAutoTriggeredEvent,
  SpecGapDetectedEvent,
  PostReleaseGapFoundEvent,
  PostReleasePassedEvent,
  BackEdgeTriggeredEvent,
  BackEdgeRecord,
  DriveEventType,
  GateAutoTriggerRecord,
  SpecGapReport,
} from './types.js';
import { DEFAULT_DRIVE_CONFIG } from './types.js';

/** Listener callback for drive events. */
export type DriveEventListener = (
  eventType: DriveEventType,
  payload: GateAutoTriggeredEvent | SpecGapDetectedEvent | PostReleaseGapFoundEvent | PostReleasePassedEvent | BackEdgeTriggeredEvent,
) => void;

/** Result of processing a stage completion through the drive layer. */
export interface DriveProcessResult {
  /** Whether the drive layer blocked the transition (FR-D01 gate rejected). */
  blocked: boolean;
  /** Events emitted during processing. */
  emittedEvents: Array<{ type: DriveEventType; payload: unknown }>;
  /** Gate auto-trigger result if applicable. */
  gateResult?: AutoTriggerResult;
  /** Spec gap report if applicable. */
  specGapReport?: SpecGapReport;
  /** Post-release scan result if applicable. */
  postReleaseScanResult?: AutoGapScanResult;
}

/**
 * ProactiveDriveEngine — the main integration point for Domain D.
 *
 * Usage:
 *   const drive = new ProactiveDriveEngine(gateEngine, ledger, config);
 *   drive.onEvent((type, payload) => { ... });
 *
 *   // Called by PipelineEngineFacade when a stage completes:
 *   const result = drive.onStageCompleted(pipelineId, fromStage, toStage, artifacts);
 *   if (result.blocked) { // gate rejected, don't advance }
 */
export class ProactiveDriveEngine {
  private readonly transitionTrigger: StageTransitionTrigger;
  private readonly specGapDetector: SpecGapDetector;
  private readonly postReleaseScanner: PostReleaseAutoScanner;
  private readonly ledger: EventLedger;
  private readonly config: ProactiveDriveConfig;
  private readonly listeners: DriveEventListener[] = [];

  /** Per-pipeline PDCA cycle tracking. */
  private readonly pipelineCycles = new Map<string, number>();
  /** Per-pipeline PDCA cycle records (AC-D03.7). */
  private readonly pdcaCycleRecords = new Map<string, PdcaCycleRecord[]>();

  constructor(
    gateEngine: GateEngine,
    ledger: EventLedger,
    config: Partial<ProactiveDriveConfig> = {},
  ) {
    const fullConfig: ProactiveDriveConfig = { ...DEFAULT_DRIVE_CONFIG, ...config };
    this.config = fullConfig;
    this.ledger = ledger;
    this.transitionTrigger = new StageTransitionTrigger(gateEngine, fullConfig.transitionGates);
    this.specGapDetector = new SpecGapDetector();
    this.postReleaseScanner = new PostReleaseAutoScanner(fullConfig.maxPdcaCycles);
  }

  /**
   * Register a listener for drive events.
   * Host adapters use this to convert events into actionable instructions.
   */
  onEvent(listener: DriveEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Process a stage completion through the drive layer.
   *
   * Called by PipelineEngineFacade when a stage transitions from active → passed.
   * Evaluates all applicable drive behaviors (FR-D01, FR-D02, FR-D03).
   *
   * @param pipelineId - The pipeline instance ID.
   * @param completedStage - The stage that just completed.
   * @param nextStage - The stage that would be activated next.
   * @param artifacts - Artifacts from the completed stage.
   * @param context - Additional context for spec gap detection and post-release scan.
   */
  async onStageCompleted(
    pipelineId: string,
    completedStage: StageId,
    nextStage: StageId | null,
    artifacts: ArtifactRef[],
    context?: DriveContext,
  ): Promise<DriveProcessResult> {
    const result: DriveProcessResult = {
      blocked: false,
      emittedEvents: [],
    };

    // FR-D01: Auto-trigger gate at transition point
    if (nextStage) {
      const gateResult = await this.processGateAutoTrigger(
        pipelineId,
        completedStage,
        nextStage,
        artifacts,
      );
      if (gateResult) {
        result.gateResult = gateResult;
        result.emittedEvents.push({
          type: 'gate-auto-triggered',
          payload: { pipelineId, record: gateResult.record } satisfies GateAutoTriggeredEvent,
        });

        if (!gateResult.passed) {
          result.blocked = true;
          // Don't proceed with other checks if gate blocked
          return result;
        }
      }
    }

    // FR-D02: Spec gap detection at implement completion
    if (completedStage === 'implement' && this.config.specGapDetectionEnabled && context?.frReferences) {
      const specGapReport = await this.processSpecGapDetection(
        pipelineId,
        artifacts,
        context.frReferences,
        context.implementationModules,
      );
      if (specGapReport) {
        result.specGapReport = specGapReport;
        if (specGapReport.hasGaps) {
          result.emittedEvents.push({
            type: 'spec-gap-detected',
            payload: {
              pipelineId,
              report: specGapReport,
              message: `Found ${specGapReport.uncoveredModules.length} module(s) not traceable to spec. Consider supplementing spec.`,
            } satisfies SpecGapDetectedEvent,
          });
        }
      }
    }

    // FR-D03: Post-release auto scan at verify completion
    if (completedStage === 'verify' && this.config.postReleaseAutoScanEnabled && context?.postReleaseInput) {
      const scanResult = this.processPostReleaseScan(pipelineId, context.postReleaseInput);
      result.postReleaseScanResult = scanResult;

      if (scanResult.canComplete) {
        result.emittedEvents.push({
          type: 'post-release-passed',
          payload: { pipelineId, report: scanResult.report } satisfies PostReleasePassedEvent,
        });
      } else {
        result.emittedEvents.push({
          type: 'post-release-gap-found',
          payload: {
            pipelineId,
            report: scanResult.report,
            fixTasks: scanResult.fixTasks,
            cycle: scanResult.cycle,
          } satisfies PostReleaseGapFoundEvent,
        });

        if (scanResult.backEdge) {
          result.emittedEvents.push({
            type: 'back-edge-triggered',
            payload: {
              pipelineId,
              backEdge: scanResult.backEdge,
              cycle: scanResult.cycle,
              fixTasks: scanResult.fixTasks,
            } satisfies BackEdgeTriggeredEvent,
          });
        }
      }
    }

    // Emit all events to listeners
    for (const event of result.emittedEvents) {
      this.emit(event.type, event.payload as Parameters<DriveEventListener>[1]);
    }

    return result;
  }

  /**
   * Get PDCA cycle records for a pipeline (AC-D03.7).
   */
  getPdcaCycleRecords(pipelineId: string): readonly PdcaCycleRecord[] {
    return this.pdcaCycleRecords.get(pipelineId) ?? [];
  }

  /**
   * Get current cycle number for a pipeline.
   */
  getCurrentCycle(pipelineId: string): number {
    return this.pipelineCycles.get(pipelineId) ?? 0;
  }

  /**
   * Get the back-edge stage queue (AC-D03.6).
   */
  getBackEdgeStageQueue(): readonly string[] {
    return this.postReleaseScanner.buildBackEdgeStageQueue();
  }

  /**
   * Access the underlying SpecGapDetector for pre-checks (AC-D02.4).
   */
  getSpecGapDetector(): SpecGapDetector {
    return this.specGapDetector;
  }

  /**
   * Access the underlying StageTransitionTrigger.
   */
  getTransitionTrigger(): StageTransitionTrigger {
    return this.transitionTrigger;
  }

  // ── Private processing methods ────────────────────────────────

  /**
   * FR-D01: Process gate auto-trigger at a transition point.
   */
  private async processGateAutoTrigger(
    pipelineId: string,
    fromStage: StageId,
    toStage: StageId,
    artifacts: ArtifactRef[],
  ): Promise<AutoTriggerResult | null> {
    const triggerResult = await this.transitionTrigger.evaluateAsync(fromStage, toStage, artifacts);

    if (triggerResult) {
      // AC-D01.6: Record in ledger
      const gateEventType: LedgerEvent['type'] = 'gate_passed';
      this.ledger.append(pipelineId, {
        type: gateEventType,
        stageId: fromStage,
        detail: {
          driveEvent: 'gate-auto-triggered',
          gateType: triggerResult.record.gateType,
          passed: triggerResult.passed,
          fixTasks: triggerResult.record.fixTasks,
          score: triggerResult.record.score,
        },
      });

      if (!triggerResult.passed) {
        const rejectedType: LedgerEvent['type'] = 'gate_rejected';
        this.ledger.append(pipelineId, {
          type: rejectedType,
          stageId: fromStage,
          detail: {
            driveEvent: 'gate-auto-triggered',
            blockers: triggerResult.record.blockers,
            fixTasks: triggerResult.record.fixTasks,
          },
        });
      }
    }

    return triggerResult;
  }

  /**
   * FR-D02: Process spec gap detection at implement completion.
   */
  private async processSpecGapDetection(
    pipelineId: string,
    artifacts: ArtifactRef[],
    frReferences: FrReference[],
    implementationModules?: ImplementationModule[],
  ): Promise<SpecGapReport | null> {
    // Extract modules from artifacts if not provided
    const modules = implementationModules ?? this.specGapDetector.extractModulesFromArtifacts(artifacts);

    if (modules.length === 0) {
      return null; // Nothing to scan
    }

    const report = await this.specGapDetector.scan(pipelineId, frReferences, modules);

    // AC-D02.6: Record in stage record (via ledger)
    if (report.hasGaps) {
      const specGapEventType: LedgerEvent['type'] = 'stage_completed';
      this.ledger.append(pipelineId, {
        type: specGapEventType,
        stageId: 'implement',
        detail: {
          driveEvent: 'spec-gap-detected',
          uncoveredCount: report.uncoveredModules.length,
          severity: 'advisory',
        },
      });
    }

    return report;
  }

  /**
   * FR-D03: Process post-release auto scan at verify completion.
   */
  private processPostReleaseScan(
    pipelineId: string,
    input: PostReleaseValidationInput,
  ): AutoGapScanResult {
    // Get or initialize cycle counter
    const currentCycle = (this.pipelineCycles.get(pipelineId) ?? 0) + 1;
    this.pipelineCycles.set(pipelineId, currentCycle);

    // AC-D03.1 + AC-D03.2: Auto-trigger using FR-17 semantics
    const scanResult = this.postReleaseScanner.scan(input, currentCycle);

    // AC-D03.7: Record PDCA cycle
    const cycleRecord = this.postReleaseScanner.createCycleRecord(
      currentCycle,
      scanResult.fixTasks,
      scanResult.canComplete,
    );

    let records = this.pdcaCycleRecords.get(pipelineId);
    if (!records) {
      records = [];
      this.pdcaCycleRecords.set(pipelineId, records);
    }
    records.push(cycleRecord);

    // Record in ledger
    const ledgerEventType: LedgerEvent['type'] = scanResult.canComplete ? 'stage_completed' : 'stage_blocked';
    this.ledger.append(pipelineId, {
      type: ledgerEventType,
      stageId: 'post-release-validation',
      detail: {
        driveEvent: scanResult.canComplete ? 'post-release-passed' : 'post-release-gap-found',
        gaps: scanResult.report.gaps,
        cycle: currentCycle,
        fixTaskCount: scanResult.fixTasks.length,
        backEdge: scanResult.backEdge != null,
      },
    });

    return scanResult;
  }

  /**
   * Emit an event to all registered listeners.
   * AC-D01.7: If no listeners, event is a no-op (degraded to no output).
   */
  private emit(
    eventType: DriveEventType,
    payload: Parameters<DriveEventListener>[1],
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(eventType, payload);
      } catch {
        // AC-D01.7: Listener failure doesn't block engine
      }
    }
  }
}

/** Additional context for drive layer processing. */
export interface DriveContext {
  /** FR references for spec gap detection (FR-D02). */
  frReferences?: FrReference[];
  /** Implementation modules for spec gap detection (FR-D02). */
  implementationModules?: ImplementationModule[];
  /** Post-release validation input (FR-D03). */
  postReleaseInput?: PostReleaseValidationInput;
}
