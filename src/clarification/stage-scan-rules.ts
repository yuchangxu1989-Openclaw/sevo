import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import type { ArtifactRef, StageId, StageRecord } from '../types/index.js';
import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import {
  BlockingLevel,
  ClarificationType,
  ResolutionSink,
  type ClarificationFinding,
  type ClarificationScanRule,
} from './clarification-types.js';
import { AmbiguityDetector } from './ambiguity-detector.js';
import { LlmSemanticAmbiguityDetector } from './llm-semantic-detector.js';

/**
 * Stage-specific scan rules that combine structural (Tier 1) and
 * LLM semantic (Tier 2) ambiguity detection.
 *
 * Each rule implements ClarificationScanRule and is bound to a specific
 * pipeline stage (FR-11.1, FR-11.2, FR-11.3).
 *
 * AC-4.53: Rules are configurable and extensible without modifying source.
 */

// ── Shared helpers ──────────────────────────────────────────────

function readArtifactContent(artifact: ArtifactRef): string | null {
  try {
    if (!existsSync(artifact.path)) return null;
    return readFileSync(artifact.path, 'utf-8');
  } catch {
    return null;
  }
}

function findArtifactByType(artifacts: ArtifactRef[], type: string): ArtifactRef | undefined {
  return artifacts.find((a) => a.type === type || a.type.includes(type));
}

// ── FR-11.1: Spec Stage Scan Rule ───────────────────────────────

/**
 * Scans Spec Package for ambiguities (FR-11.1).
 * Detects: missing AC, undefined boundaries, vague terms, undeclared dependencies.
 */
export class SpecStageScanRule implements ClarificationScanRule {
  readonly id = 'spec-stage-ambiguity';
  private readonly adapter: SevoHostAdapter;
  private readonly structuralDetector: AmbiguityDetector;
  private readonly pipelineId: string;

  constructor(options: { adapter: SevoHostAdapter; pipelineId: string }) {
    this.adapter = options.adapter;
    this.pipelineId = options.pipelineId;
    this.structuralDetector = new AmbiguityDetector();
  }

  evaluate(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[] {
    if (stageRecord.stageId !== 'spec') return [];

    const specArtifact = findArtifactByType(artifacts, 'spec');
    if (!specArtifact) return [];

    const content = readArtifactContent(specArtifact);
    if (!content) return [];

    // Tier 1: Structural detection (synchronous)
    const structuralSignals = this.structuralDetector.detect(content, 'spec');

    return structuralSignals.map((signal) => ({
      pipelineId: this.pipelineId,
      stageId: 'spec' as StageId,
      stageAttempt: stageRecord.attempt,
      type: mapSignalToClarificationType(signal.type),
      blockingLevel: signal.severity === 'critical' || signal.severity === 'high'
        ? BlockingLevel.BLOCKING
        : BlockingLevel.NON_BLOCKING,
      targetType: 'user' as const,
      question: `[Spec] ${signal.description}`,
      sourceArtifacts: [specArtifact],
      impactScope: [signal.location, 'downstream-stages'],
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
      context: `Detected in spec artifact: ${signal.location}`,
    }));
  }

  /**
   * Async semantic scan using LLM (called separately from evaluate).
   * Returns additional findings from semantic analysis.
   */
  async detectSemantic(stageRecord: StageRecord, artifacts: ArtifactRef[]): Promise<ClarificationFinding[]> {
    if (stageRecord.stageId !== 'spec') return [];

    const specArtifact = findArtifactByType(artifacts, 'spec');
    if (!specArtifact) return [];

    const content = readArtifactContent(specArtifact);
    if (!content) return [];

    const detector = new LlmSemanticAmbiguityDetector({
      adapter: this.adapter,
      stage: 'spec',
    });

    const signals = await detector.detect(content, {
      focusAreas: [
        'Acceptance criteria completeness and verifiability',
        'Boundary conditions and edge cases',
        'Implicit assumptions about user behavior or environment',
      ],
    });

    return signals.map((signal) => ({
      pipelineId: this.pipelineId,
      stageId: 'spec' as StageId,
      stageAttempt: stageRecord.attempt,
      type: mapSignalToClarificationType(signal.type),
      blockingLevel: signal.severity === 'critical' || signal.severity === 'high'
        ? BlockingLevel.BLOCKING
        : BlockingLevel.NON_BLOCKING,
      targetType: 'user' as const,
      question: `[Spec/Semantic] ${signal.description}`,
      sourceArtifacts: [specArtifact],
      impactScope: [signal.location, 'downstream-stages'],
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
      context: `LLM semantic analysis: ${signal.location}`,
    }));
  }
}

// ── FR-11.2: Contract Stage Scan Rule ───────────────────────────

/**
 * Scans Contract Package for ambiguities (FR-11.2).
 * Detects: interface gaps, data flow issues, spec-contract contradictions.
 * Routes technical ambiguities internally, requirement ambiguities to user.
 */
export class ContractStageScanRule implements ClarificationScanRule {
  readonly id = 'contract-stage-ambiguity';
  private readonly adapter: SevoHostAdapter;
  private readonly structuralDetector: AmbiguityDetector;
  private readonly pipelineId: string;

  constructor(options: { adapter: SevoHostAdapter; pipelineId: string }) {
    this.adapter = options.adapter;
    this.pipelineId = options.pipelineId;
    this.structuralDetector = new AmbiguityDetector();
  }

  evaluate(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[] {
    if (stageRecord.stageId !== 'contract') return [];

    const contractArtifact = findArtifactByType(artifacts, 'contract');
    if (!contractArtifact) return [];

    const content = readArtifactContent(contractArtifact);
    if (!content) return [];

    const structuralSignals = this.structuralDetector.detect(content, 'contract');

    return structuralSignals.map((signal) => {
      const isRequirementLevel = signal.type === 'spec-contract-contradiction'
        || signal.type === 'acceptance-criteria-missing';

      return {
        pipelineId: this.pipelineId,
        stageId: 'contract' as StageId,
        stageAttempt: stageRecord.attempt,
        type: mapSignalToClarificationType(signal.type),
        blockingLevel: signal.severity === 'critical' || signal.severity === 'high'
          ? BlockingLevel.BLOCKING
          : BlockingLevel.NON_BLOCKING,
        targetType: isRequirementLevel ? 'user' as const : 'internal-owner' as const,
        question: `[Contract] ${signal.description}`,
        sourceArtifacts: [contractArtifact],
        impactScope: [signal.location],
        resolutionSinks: isRequirementLevel
          ? [ResolutionSink.SPEC_PACKAGE]
          : [ResolutionSink.CONTRACT_PACKAGE, ResolutionSink.ADR],
        context: `Detected in contract artifact: ${signal.location}`,
      };
    });
  }

  /**
   * Async semantic scan with cross-reference to spec (AC-4.48).
   */
  async detectSemantic(stageRecord: StageRecord, artifacts: ArtifactRef[]): Promise<ClarificationFinding[]> {
    if (stageRecord.stageId !== 'contract') return [];

    const contractArtifact = findArtifactByType(artifacts, 'contract');
    if (!contractArtifact) return [];

    const content = readArtifactContent(contractArtifact);
    if (!content) return [];

    // Load spec for contradiction detection (AC-4.48)
    const specArtifact = findArtifactByType(artifacts, 'spec');
    const specContent = specArtifact ? readArtifactContent(specArtifact) : undefined;

    const detector = new LlmSemanticAmbiguityDetector({
      adapter: this.adapter,
      stage: 'contract',
    });

    const signals = await detector.detect(content, {
      relatedContent: specContent ?? undefined,
      focusAreas: [
        'Interface contracts completeness (params, returns, errors)',
        'Contradictions with the spec (if context provided)',
        'Module responsibility overlaps or gaps',
        'Missing error handling strategies',
      ],
    });

    return signals.map((signal) => {
      const isContradiction = signal.type === 'spec-contract-contradiction';
      return {
        pipelineId: this.pipelineId,
        stageId: 'contract' as StageId,
        stageAttempt: stageRecord.attempt,
        type: mapSignalToClarificationType(signal.type),
        blockingLevel: signal.severity === 'critical' || signal.severity === 'high'
          ? BlockingLevel.BLOCKING
          : BlockingLevel.NON_BLOCKING,
        targetType: isContradiction ? 'user' as const : 'internal-owner' as const,
        question: `[Contract/Semantic] ${signal.description}`,
        sourceArtifacts: [contractArtifact, ...(specArtifact ? [specArtifact] : [])],
        impactScope: [signal.location],
        resolutionSinks: isContradiction
          ? [ResolutionSink.SPEC_PACKAGE, ResolutionSink.CONTRACT_PACKAGE]
          : [ResolutionSink.CONTRACT_PACKAGE, ResolutionSink.ADR],
        context: `LLM semantic analysis: ${signal.location}`,
      };
    });
  }
}

// ── FR-11.3: Implement Stage Scan Rule ──────────────────────────

/**
 * Scans Task descriptions for implementation ambiguities (FR-11.3).
 * Detects: incomplete task descriptions, spec/contract contradictions.
 * AC-4.49: Executor asks rather than guessing.
 * AC-4.50: Contradictions pause implementation.
 */
export class ImplementStageScanRule implements ClarificationScanRule {
  readonly id = 'implement-stage-ambiguity';
  private readonly adapter: SevoHostAdapter;
  private readonly pipelineId: string;

  constructor(options: { adapter: SevoHostAdapter; pipelineId: string }) {
    this.adapter = options.adapter;
    this.pipelineId = options.pipelineId;
  }

  evaluate(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[] {
    if (stageRecord.stageId !== 'implement') return [];

    const taskArtifact = findArtifactByType(artifacts, 'task');
    if (!taskArtifact) return [];

    const content = readArtifactContent(taskArtifact);
    if (!content) return [];

    // Structural check: task description completeness
    const findings: ClarificationFinding[] = [];

    if (!hasVerificationSteps(content)) {
      findings.push({
        pipelineId: this.pipelineId,
        stageId: 'implement' as StageId,
        stageAttempt: stageRecord.attempt,
        type: ClarificationType.BOUNDARY,
        blockingLevel: BlockingLevel.NON_BLOCKING,
        targetType: 'upstream-stage',
        question: '[Implement] Task description lacks verification steps — how should completion be verified?',
        sourceArtifacts: [taskArtifact],
        impactScope: ['task-verification'],
        assumedDefault: 'Verify via unit tests and manual inspection',
        resolutionSinks: [ResolutionSink.TASK_DESCRIPTION],
        context: 'Task description missing verification criteria',
      });
    }

    if (!hasTargetFiles(content)) {
      findings.push({
        pipelineId: this.pipelineId,
        stageId: 'implement' as StageId,
        stageAttempt: stageRecord.attempt,
        type: ClarificationType.BOUNDARY,
        blockingLevel: BlockingLevel.NON_BLOCKING,
        targetType: 'upstream-stage',
        question: '[Implement] Task description does not specify target files — which files should be modified?',
        sourceArtifacts: [taskArtifact],
        impactScope: ['implementation-scope'],
        assumedDefault: 'Infer from contract package module mapping',
        resolutionSinks: [ResolutionSink.TASK_DESCRIPTION],
        context: 'Task description missing target file specification',
      });
    }

    return findings;
  }

  /**
   * Async semantic scan for implementation ambiguities (AC-4.49, AC-4.50, AC-4.51).
   */
  async detectSemantic(stageRecord: StageRecord, artifacts: ArtifactRef[]): Promise<ClarificationFinding[]> {
    if (stageRecord.stageId !== 'implement') return [];

    const taskArtifact = findArtifactByType(artifacts, 'task');
    if (!taskArtifact) return [];

    const content = readArtifactContent(taskArtifact);
    if (!content) return [];

    // Load contract for contradiction detection
    const contractArtifact = findArtifactByType(artifacts, 'contract');
    const contractContent = contractArtifact ? readArtifactContent(contractArtifact) : undefined;

    const detector = new LlmSemanticAmbiguityDetector({
      adapter: this.adapter,
      stage: 'implement',
    });

    const signals = await detector.detect(content, {
      relatedContent: contractContent ?? undefined,
      focusAreas: [
        'Task goal clarity and single interpretation',
        'Contradictions with contract/spec',
        'Missing edge case handling instructions',
        'Implicit runtime assumptions',
      ],
    });

    return signals.map((signal) => {
      const isContradiction = signal.type === 'spec-contract-contradiction';
      return {
        pipelineId: this.pipelineId,
        stageId: 'implement' as StageId,
        stageAttempt: stageRecord.attempt,
        type: mapSignalToClarificationType(signal.type),
        blockingLevel: isContradiction ? BlockingLevel.BLOCKING : inferBlockingFromSeverity(signal.severity),
        targetType: isContradiction ? 'user' as const : 'upstream-stage' as const,
        question: `[Implement/Semantic] ${signal.description}`,
        sourceArtifacts: [taskArtifact, ...(contractArtifact ? [contractArtifact] : [])],
        impactScope: [signal.location],
        resolutionSinks: isContradiction
          ? [ResolutionSink.SPEC_PACKAGE, ResolutionSink.CONTRACT_PACKAGE]
          : [ResolutionSink.TASK_DESCRIPTION],
        context: `LLM semantic analysis: ${signal.location}`,
      };
    });
  }
}

// ── Factory ─────────────────────────────────────────────────────

export interface StageScanRuleFactoryOptions {
  adapter: SevoHostAdapter;
  pipelineId: string;
}

/**
 * Creates all stage-specific scan rules for a pipeline instance.
 * AC-4.55: Rules are stage-bound, not agent-bound.
 */
export function createStageScanRules(options: StageScanRuleFactoryOptions): ClarificationScanRule[] {
  return [
    new SpecStageScanRule(options),
    new ContractStageScanRule(options),
    new ImplementStageScanRule(options),
  ];
}

// ── Helpers ─────────────────────────────────────────────────────

function mapSignalToClarificationType(signalType: string): ClarificationType {
  switch (signalType) {
    case 'spec-contract-contradiction':
      return ClarificationType.CORRECTION;
    case 'boundary-undefined':
      return ClarificationType.BOUNDARY;
    case 'acceptance-criteria-missing':
    case 'interface-incomplete':
    case 'data-flow-unclear':
      return ClarificationType.DECISION;
    case 'performance-constraint-missing':
    case 'dependency-undeclared':
      return ClarificationType.METHODOLOGY;
    case 'term-undefined':
      return ClarificationType.BOUNDARY;
    default:
      return ClarificationType.DECISION;
  }
}

function inferBlockingFromSeverity(severity: string): BlockingLevel {
  return severity === 'critical' || severity === 'high'
    ? BlockingLevel.BLOCKING
    : BlockingLevel.NON_BLOCKING;
}

function hasVerificationSteps(content: string): boolean {
  return /验证|verify|test|assert|check|确认|validation/i.test(content)
    && /步骤|step|how to|方法/i.test(content);
}

function hasTargetFiles(content: string): boolean {
  return /(?:src\/|lib\/|\.ts|\.js|文件|file|target|目标文件)/i.test(content);
}
