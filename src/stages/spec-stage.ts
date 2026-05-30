import { mkdir, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  AmbiguityDetector,
  BlockingLevel,
  ClarificationType,
  ResolutionSink,
  type AmbiguitySignalType,
  type ClarificationRecord,
} from '../clarification/index.js';
import type { ArtifactRef, ObjectiveKeyResult } from '../types/index.js';
import type {
  ConceptDefinition,
  FunctionalRequirement,
  LedgerLesson,
  SpecClarification,
  SpecClarificationDraft,
  SpecInput,
  SpecOutput,
  SpecStageOptions,
  Stage,
} from './spec-types.js';

export interface ClarificationScanResult {
  scannedAt: string;
  ambiguities: Array<{
    location: string;
    signal: string;
    type: string;
    severity: 'blocking' | 'non-blocking';
  }>;
}

export class SpecStage implements Stage<SpecInput, SpecOutput> {
  readonly stageId = 'spec' as const;
  private readonly now: () => string;

  constructor(private readonly options: SpecStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: SpecInput): Promise<SpecOutput> {
    if (!this.options.adapter.analyzeRequirements) {
      throw new Error('SpecStage requires adapter.analyzeRequirements');
    }

    const enrichedPrompt = this.enrichPromptWithLessons(input.description, input.ledgerLessons);

    const analysis = await this.options.adapter.analyzeRequirements({
      prompt: enrichedPrompt,
      existingSpec: input.existingSpec,
    });

    const existingRequirements = input.existingSpec?.functionalRequirements ?? [];
    const nextRequirementNumber = existingRequirements.length + 1;

    // FR-18 AC-18.3/AC-18.4: Build OKR tree and KR mapping when endStateGoal present
    const okrTree = input.okrTree ?? this.decomposeOkr(input);
    const krMapping: Record<string, string> = {};

    const generatedRequirements = analysis.functionalRequirements.map((requirement, index) => {
      const requirementId = `FR-${String(nextRequirementNumber + index).padStart(2, '0')}`;
      const acceptanceCriteria = requirement.acceptanceCriteria.map((description, acIndex) => ({
        id: `AC-${String(nextRequirementNumber + index)}.${acIndex + 1}`,
        description,
        requirementId,
      }));

      const tracesTo = this.assignTracesTo(okrTree, index);
      if (tracesTo) {
        krMapping[requirementId] = tracesTo;
      }

      const normalizedRequirement: FunctionalRequirement = {
        id: requirementId,
        title: requirement.title,
        description: requirement.description,
        acceptanceCriteria,
        ...(tracesTo ? { tracesTo } : {}),
      };

      return normalizedRequirement;
    });

    const functionalRequirements = [...existingRequirements, ...generatedRequirements];
    const acceptanceCriteria = functionalRequirements.flatMap((requirement) => requirement.acceptanceCriteria);
    const conceptDefinitions = this.mergeConceptDefinitions(
      input.existingSpec?.conceptDefinitions,
      analysis.conceptDefinitions,
      generatedRequirements,
    );

    const preexistingClarifications = input.existingSpec?.clarifications ?? [];
    const clarificationRecords = [
      ...this.buildTerminologyClarifications(
        input,
        conceptDefinitions,
        generatedRequirements,
        input.existingSpec?.artifact,
      ),
      ...this.openClarifications(input, analysis.ambiguities, input.existingSpec?.artifact),
    ];

    const clarifications = [
      ...preexistingClarifications,
      ...clarificationRecords.map((record) => this.toSpecClarification(record)),
    ];

    const summary = analysis.summary?.trim()
      || `Structured spec for ${input.taskId} with ${functionalRequirements.length} functional requirements.`;

    const artifact = await this.writeArtifact(input, {
      summary,
      functionalRequirements,
      acceptanceCriteria,
      clarifications,
      ...(conceptDefinitions.length > 0 ? { conceptDefinitions } : {}),
    });

    return {
      summary,
      functionalRequirements,
      acceptanceCriteria,
      clarifications,
      artifact,
      ...(conceptDefinitions.length > 0 ? { conceptDefinitions } : {}),
      ...(Object.keys(krMapping).length > 0 ? { krMapping } : {}),
    };
  }

  private mergeConceptDefinitions(
    existingDefinitions: ConceptDefinition[] | undefined,
    generatedDefinitions: ConceptDefinition[] | undefined,
    generatedRequirements: FunctionalRequirement[],
  ): ConceptDefinition[] {
    const merged = new Map<string, ConceptDefinition>();

    const mergeStringList = (left?: string[], right?: string[]): string[] | undefined => {
      const items = [...(left ?? []), ...(right ?? [])]
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      return items.length > 0 ? [...new Set(items)] : undefined;
    };

    const upsert = (definition: ConceptDefinition): void => {
      const term = definition.term.trim();
      if (term.length === 0) return;

      const key = term.toLowerCase();
      const existing = merged.get(key);
      merged.set(key, {
        term,
        existenceReason: definition.existenceReason?.trim() || existing?.existenceReason,
        users: mergeStringList(existing?.users, definition.users),
        interaction: definition.interaction?.trim() || existing?.interaction,
        boundaries: definition.boundaries?.trim() || existing?.boundaries,
        sourceRequirementIds: mergeStringList(existing?.sourceRequirementIds, definition.sourceRequirementIds),
      });
    };

    for (const definition of existingDefinitions ?? []) {
      upsert(definition);
    }

    for (const definition of generatedDefinitions ?? []) {
      upsert(definition);
    }

    for (const requirement of generatedRequirements) {
      upsert({
        term: requirement.title,
        sourceRequirementIds: [requirement.id],
      });
    }

    return [...merged.values()];
  }

  private buildTerminologyClarifications(
    input: SpecInput,
    conceptDefinitions: ConceptDefinition[],
    generatedRequirements: FunctionalRequirement[],
    sourceArtifact?: ArtifactRef,
  ): ClarificationRecord[] {
    if (!this.options.clarificationCoordinator) {
      return [];
    }

    const generatedRequirementIds = new Set(generatedRequirements.map((requirement) => requirement.id));
    const sourceArtifacts = sourceArtifact ? [sourceArtifact] : [];

    const drafts: SpecClarificationDraft[] = conceptDefinitions.flatMap((definition) => {
      const sourceRequirementIds = (definition.sourceRequirementIds ?? [])
        .filter((requirementId) => generatedRequirementIds.has(requirementId));

      if (sourceRequirementIds.length === 0) {
        return [];
      }

      const missingChecks = [
        {
          ok: Boolean(definition.existenceReason?.trim()),
          question: `概念「${definition.term}」存在是为了解决什么问题？`,
        },
        {
          ok: Boolean(definition.users?.some((user) => user.trim().length > 0)),
          question: `概念「${definition.term}」的使用者是谁？`,
        },
        {
          ok: Boolean(definition.interaction?.trim()),
          question: `概念「${definition.term}」如何被使用或交互？`,
        },
        {
          ok: Boolean(definition.boundaries?.trim()),
          question: `概念「${definition.term}」的适用边界是什么？什么情况下不适用？`,
        },
      ].filter((item) => !item.ok);

      return missingChecks.map((item) => ({
        pipelineId: input.pipelineId ?? input.taskId,
        stageId: 'spec',
        type: ClarificationType.BOUNDARY,
        blockingLevel: BlockingLevel.BLOCKING,
        targetType: 'user',
        question: item.question,
        impactScope: ['spec', ...sourceRequirementIds],
        resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
        sourceArtifacts,
      }));
    });

    if (drafts.length === 0) {
      return [];
    }

    const records = this.options.clarificationCoordinator.open(drafts);
    for (const record of records) {
      this.options.clarificationCoordinator.dispatch(record);
    }
    return records;
  }

  private openClarifications(
    input: SpecInput,
    ambiguities: NonNullable<Awaited<ReturnType<NonNullable<SpecStageOptions['adapter']['analyzeRequirements']>>>['ambiguities']> | undefined,
    sourceArtifact?: ArtifactRef,
  ): ClarificationRecord[] {
    if (!ambiguities || ambiguities.length === 0 || !this.options.clarificationCoordinator) {
      return [];
    }

    const sourceArtifacts = sourceArtifact ? [sourceArtifact] : [];
    const drafts: SpecClarificationDraft[] = ambiguities.map((ambiguity) => ({
      pipelineId: input.pipelineId ?? input.taskId,
      stageId: 'spec',
      type: ambiguity.type ?? ClarificationType.BOUNDARY,
      blockingLevel: ambiguity.blockingLevel ?? BlockingLevel.BLOCKING,
      targetType: 'user',
      question: ambiguity.question,
      impactScope: ambiguity.impactScope ?? ['spec'],
      suggestedOptions: ambiguity.suggestedOptions,
      assumedDefault: ambiguity.assumedDefault,
      resolutionSinks: ambiguity.resolutionSinks ?? [ResolutionSink.SPEC_PACKAGE],
      sourceArtifacts,
    }));

    const records = this.options.clarificationCoordinator.open(drafts);
    for (const record of records) {
      this.options.clarificationCoordinator.dispatch(record);
    }
    return records;
  }

  private toSpecClarification(record: ClarificationRecord): SpecClarification {
    return {
      id: record.clarificationId,
      question: record.question,
      blockingLevel: record.blockingLevel,
      status: record.status,
      impactScope: [...record.impactScope],
      assumedDefault: record.assumedDefault,
    };
  }

  private async writeArtifact(
    input: SpecInput,
    content: Omit<SpecOutput, 'artifact'>,
  ): Promise<ArtifactRef> {
    const timestamp = this.now();
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'spec');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-spec-package.json`);
    await writeFile(filePath, JSON.stringify({ ...content, generatedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:spec-package`,
      type: 'spec-package',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        functionalRequirementCount: content.functionalRequirements.length,
        acceptanceCriteriaCount: content.acceptanceCriteria.length,
        clarificationCount: content.clarifications.length,
      },
    };
  }

  /**
   * AC-4.40a: Enrich the spec prompt with historical lessons from the ledger.
   */
  private enrichPromptWithLessons(prompt: string, lessons?: LedgerLesson[]): string {
    if (!lessons || lessons.length === 0) return prompt;

    const sorted = [...lessons]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);

    const lessonsBlock = sorted.map((lesson, index) => {
      const action = lesson.suggestedAction ? ` Action: ${lesson.suggestedAction}` : '';
      return `${index + 1}. [${lesson.category}] ${lesson.description}${action} (from pipeline ${lesson.pipelineId})`;
    }).join('\n');

    return [
      prompt,
      '',
      '--- Historical Lessons (from Ledger) ---',
      'The following lessons were learned from previous pipeline runs. Consider them when defining requirements:',
      lessonsBlock,
      '--- End Lessons ---',
    ].join('\n');
  }

  /**
   * FR-18 AC-18.3: Decompose endStateGoal into a simple OKR tree.
   */
  private decomposeOkr(input: SpecInput): ObjectiveKeyResult[] | undefined {
    if (!input.endStateGoal) return undefined;
    return [{
      objectiveId: 'OBJ-01',
      description: input.endStateGoal.description,
      keyResults: [{
        krId: 'KR-01',
        description: `Achieve: ${input.endStateGoal.description}`,
        measure: 'completion',
        status: 'not-started',
      }],
    }];
  }

  /**
   * FR-18 AC-18.4: Assign a KR id to an FR via round-robin over available KRs.
   */
  private assignTracesTo(okrTree: ObjectiveKeyResult[] | undefined, frIndex: number): string | undefined {
    if (!okrTree || okrTree.length === 0) return undefined;
    const allKrs = okrTree.flatMap((obj) => obj.keyResults);
    if (allKrs.length === 0) return undefined;
    const kr = allKrs[frIndex % allKrs.length];
    return kr?.krId;
  }

  /**
   * AC-11F.1/AC-11F.5: Scan spec artifact for ambiguities after write, before gate.
   * AC-11F.6: Rules loaded from config if available.
   */
  async scanForAmbiguities(specArtifactPath: string, projectRoot?: string): Promise<ClarificationScanResult> {
    const detector = new AmbiguityDetector({ useDefaults: true });

    // AC-11F.6: Load custom rules from sevo.config.json
    if (projectRoot) {
      const configPath = path.join(projectRoot, 'sevo.config.json');
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          const customRules: Array<{ id: string; pattern?: string; signalType?: AmbiguitySignalType; description?: string; severity?: string }> = config?.clarification?.rules ?? [];
          for (const rule of customRules) {
            if (rule.id && rule.pattern) {
              detector.addRule({
                id: rule.id,
                signalType: rule.signalType ?? 'term-undefined',
                detect(content: string) {
                  const regex = new RegExp(rule.pattern!, 'gi');
                  const signals: Array<{ type: AmbiguitySignalType; description: string; location: string; severity: string }> = [];
                  let match: RegExpExecArray | null;
                  while ((match = regex.exec(content)) !== null) {
                    signals.push({
                      type: rule.signalType ?? 'term-undefined',
                      description: rule.description ?? `Custom rule "${rule.id}" matched`,
                      location: `char ${match.index}`,
                      severity: rule.severity ?? 'medium',
                    });
                  }
                  return signals as any;
                },
              });
            }
          }
        } catch { /* ignore invalid config */ }
      }
    }

    const content = fs.existsSync(specArtifactPath)
      ? fs.readFileSync(specArtifactPath, 'utf8')
      : '';

    const signals = detector.detect(content);
    const scannedAt = this.now();

    const ambiguities = signals.map(signal => ({
      location: signal.location,
      signal: signal.description,
      type: signal.type,
      severity: (signal.severity === 'high' || signal.severity === 'critical' ? 'blocking' : 'non-blocking') as 'blocking' | 'non-blocking',
    }));

    const result: ClarificationScanResult = { scannedAt, ambiguities };

    // AC-11F.2: Write scan result to specs directory
    const specsDir = path.dirname(specArtifactPath);
    const scanOutputPath = path.join(specsDir, 'clarification-scan.json');
    await writeFile(scanOutputPath, JSON.stringify(result, null, 2), 'utf8');

    return result;
  }

  hasBlockingAmbiguities(scanResult: ClarificationScanResult): boolean {
    return scanResult.ambiguities.some(a => a.severity === 'blocking');
  }
}
