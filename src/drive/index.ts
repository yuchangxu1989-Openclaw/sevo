/**
 * Proactive Drive Layer — barrel export (Domain D).
 *
 * FR-D01: Stage Transition Auto-Trigger
 * FR-D02: Spec Gap Detection
 * FR-D03: Post-Release Auto Gap Scan
 * FR-D04: OKR Achievement Periodic Check
 * FR-D05: PDCA Cycle Auto-Drive
 *
 * (spec §Domain D: Proactive Drive Layer)
 */

// ── Main Engine ─────────────────────────────────────────────────
export { ProactiveDriveEngine } from './proactive-drive-engine.js';
export type { DriveEventListener, DriveProcessResult, DriveContext } from './proactive-drive-engine.js';

// ── FR-D01: Stage Transition Auto-Trigger ───────────────────────
export { StageTransitionTrigger } from './stage-transition-trigger.js';
export type { AutoTriggerResult } from './stage-transition-trigger.js';

// ── FR-D02: Spec Gap Detection ──────────────────────────────────
export { SpecGapDetector } from './spec-gap-detector.js';
export type { FrReference, ImplementationModule } from './spec-gap-detector.js';

// ── FR-D03: Post-Release Auto Gap Scan ──────────────────────────
export { PostReleaseAutoScanner } from './post-release-auto-scanner.js';
export type { AutoGapScanResult } from './post-release-auto-scanner.js';

// ── FR-D04: OKR Achievement Periodic Check ──────────────────────
export { OkrPeriodicChecker, readDriveConfig } from './okr-periodic-checker.js';
export type {
  OkrCheckerEventSink,
  SmartDecompositionAdapter,
  CliOutputAdapter,
  OkrPeriodicCheckerOptions,
} from './okr-periodic-checker.js';

// ── FR-D05: PDCA Cycle Auto-Drive ───────────────────────────────
export { PdcaAutoDriver } from './pdca-auto-driver.js';
export type {
  PdcaDriverEventSink,
  PdcaCliOutputAdapter,
  PdcaAutoDriverOptions,
  PdcaTriggerContext,
} from './pdca-auto-driver.js';

// ── Types ───────────────────────────────────────────────────────
export type {
  FixTask,
  FixTaskSeverity,
  GateAutoTriggerRecord,
  GateAutoTriggeredEvent,
  UncoveredModule,
  SpecGapReport,
  SpecGapDetectedEvent,
  PostReleaseGapFoundEvent,
  PostReleasePassedEvent,
  BackEdgeRecord,
  TransitionGateBinding,
  ProactiveDriveConfig,
  DriveEventType,
  DriveConfig,
  DriveEventMap,
  DriveEventName,
  // FR-D04 types
  OkrCheckInterval,
  SmartTaskSuggestion,
  KrCheckResult,
  OkrCheckReport,
  OkrCheckCompletedEvent,
  PipelineConvergedEvent,
  // FR-D05 types
  PdcaCycleStartedEvent,
  PdcaEscalatedEvent,
  PdcaSummaryReport,
} from './types.js';
export { DEFAULT_TRANSITION_GATES, DEFAULT_DRIVE_CONFIG } from './types.js';
