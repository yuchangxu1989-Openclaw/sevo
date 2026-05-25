import type {
  ClarificationPayload,
  ClarificationRecord,
  ClarificationType,
  BlockingLevel,
  ResolutionSink,
} from '../clarification/index.js';
import type { SevoHostAdapter } from '../adapter/index.js';
import type { ArtifactRef, StageId, StageRecord, EndStateGoal, ObjectiveKeyResult } from '../types/index.js';

export interface AcceptanceCriteria {
  id: string;
  description: string;
  requirementId: string;
}

export interface FunctionalRequirement {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriteria[];
  /** FR-18 AC-18.4: KR identifier this FR traces to. */
  tracesTo?: string;
}

export interface ConceptDefinition {
  term: string;
  existenceReason?: string;
  users?: string[];
  interaction?: string;
  boundaries?: string;
  sourceRequirementIds?: string[];
}

export interface RequirementAnalysisRequest {
  prompt: string;
  existingSpec?: SpecOutput;
}

export interface RequirementAnalysisResponse {
  summary?: string;
  functionalRequirements: Array<{
    title: string;
    description: string;
    acceptanceCriteria: string[];
  }>;
  conceptDefinitions?: ConceptDefinition[];
  ambiguities?: Array<{
    question: string;
    impactScope?: string[];
    suggestedOptions?: string[];
    assumedDefault?: string;
    blockingLevel?: BlockingLevel;
    type?: ClarificationType;
    resolutionSinks?: ResolutionSink[];
  }>;
}

export interface SpecInput {
  taskId: string;
  description: string;
  pipelineId?: string;
  existingSpec?: SpecOutput;
  artifactBasePath?: string;
  /** FR-18 AC-18.3: End-state goal for OKR decomposition. */
  endStateGoal?: EndStateGoal;
  /** FR-18 AC-18.3: Pre-existing OKR tree (for incremental spec). */
  okrTree?: ObjectiveKeyResult[];
  /** AC-4.40a: Historical lessons from ledger to inject as context. */
  ledgerLessons?: LedgerLesson[];
}

/**
 * AC-4.40a: A lesson learned entry retrieved from the ledger.
 * Injected into the Specify stage as context to avoid repeating past mistakes.
 */
export interface LedgerLesson {
  pipelineId: string;
  category: string;
  description: string;
  suggestedAction?: string;
  createdAt: string;
}

export interface SpecOutput {
  summary: string;
  functionalRequirements: FunctionalRequirement[];
  acceptanceCriteria: AcceptanceCriteria[];
  clarifications: SpecClarification[];
  artifact: ArtifactRef;
  conceptDefinitions?: ConceptDefinition[];
  /** FR-18 AC-18.4: Mapping from FR id to KR id. */
  krMapping?: Record<string, string>;
}

export interface SpecClarification {
  id: string;
  question: string;
  blockingLevel: BlockingLevel;
  status: ClarificationRecord['status'];
  impactScope: string[];
  assumedDefault?: string;
}

export interface Stage<I, O> {
  readonly stageId: StageId;
  execute(input: I): Promise<O>;
}

export interface SpecStageOptions {
  adapter: Pick<SevoHostAdapter, 'analyzeRequirements'>;
  clarificationCoordinator?: {
    open(findings: SpecClarificationDraft[]): ClarificationRecord[];
    dispatch(record: ClarificationRecord): void;
  };
  now?: () => string;
}

export interface SpecClarificationDraft {
  pipelineId: string;
  stageId: StageId;
  type: ClarificationType;
  blockingLevel: BlockingLevel;
  targetType: 'user';
  question: string;
  impactScope: string[];
  suggestedOptions?: string[];
  assumedDefault?: string;
  resolutionSinks?: ResolutionSink[];
  sourceArtifacts: ArtifactRef[];
}

export interface ClarificationAdapterLike {
  requestClarification: (target: { type: 'user'; id?: string }, payload: ClarificationPayload) => {
    clarificationId: string;
    targetType: 'user';
    targetId?: string;
    dispatchedAt: string;
    timeoutMs?: number;
  };
  onClarificationResponse: (callback: () => void) => void;
  onClarificationTimeout: (callback: () => void) => void;
}

export function createStageRecord(artifacts: ArtifactRef[]): StageRecord {
  return {
    stageId: 'spec',
    status: 'active',
    attempt: 1,
    artifacts,
  };
}
