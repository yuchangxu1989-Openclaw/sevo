import type { ArtifactRef, StageId } from '../types/index.js';
import {
  BlockingLevel,
  ClarificationType,
  ResolutionSink,
  Status,
  type ClarificationTargetType,
} from './clarification-types.js';

export interface ClarificationRecord {
  schema_version: '1.0';
  clarificationId: string;
  pipelineId: string;
  stageId: StageId;
  stageAttempt: number;
  type: ClarificationType;
  blockingLevel: BlockingLevel;
  status: Status;
  targetType: ClarificationTargetType;
  targetId?: string;
  sourceArtifacts: ArtifactRef[];
  impactScope: string[];
  question: string;
  suggestedOptions?: string[];
  assumedDefault?: string;
  responder?: string;
  response?: string;
  resolution?: string;
  resolutionSinks: ResolutionSink[];
  settledArtifacts?: ArtifactRef[];
  createdAt: string;
  resolvedAt?: string;
  settledAt?: string;
}

