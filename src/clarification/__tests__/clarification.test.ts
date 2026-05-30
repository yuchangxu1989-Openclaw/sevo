import { describe, expect, it } from 'vitest';

import {
  AmbiguityDetector,
  BlockingLevel,
  ClarificationManager,
  ClarificationType,
} from '../index.js';
import type {
  AmbiguitySignal,
  ClarificationQuestion,
  ClarificationResponsePayload,
  DetectionRule,
} from '../index.js';

describe('AmbiguityDetector', () => {
  it('detects acceptance-criteria-missing signals', () => {
    const detector = new AmbiguityDetector();
    const content = `### FR-01 Some Feature\n\nDescription without any AC.\n\n### FR-02 Another\n\n- AC-1: has criteria`;
    const signals = detector.detect(content);
    const acMissing = signals.filter((s) => s.type === 'acceptance-criteria-missing');
    expect(acMissing.length).toBe(1);
    expect(acMissing[0]!.location).toContain('FR-01');
  });

  it('detects boundary-undefined signals from vague language', () => {
    const detector = new AmbiguityDetector();
    const content = '系统应在适当的时候清理缓存，合理分配资源。';
    const signals = detector.detect(content);
    const boundary = signals.filter((s) => s.type === 'boundary-undefined');
    expect(boundary.length).toBeGreaterThanOrEqual(2);
    expect(boundary[0]!.severity).toBe('medium');
  });

  it('detects term-undefined signals', () => {
    const detector = new AmbiguityDetector();
    const content = '系统使用「流水线引擎」处理任务，「门禁检查」确保质量。';
    const signals = detector.detect(content);
    const termUndefined = signals.filter((s) => s.type === 'term-undefined');
    expect(termUndefined.length).toBeGreaterThanOrEqual(1);
  });

  it('detects performance-constraint-missing signals', () => {
    const detector = new AmbiguityDetector();
    const content = '系统需要保证高性能和低延迟。';
    const signals = detector.detect(content);
    const perf = signals.filter((s) => s.type === 'performance-constraint-missing');
    expect(perf.length).toBeGreaterThanOrEqual(1);
  });

  it('detects spec-contract-contradiction signals', () => {
    const detector = new AmbiguityDetector();
    const content = '此处与 Spec 中的定义存在矛盾，需要确认。';
    const signals = detector.detect(content);
    const contradiction = signals.filter((s) => s.type === 'spec-contract-contradiction');
    expect(contradiction.length).toBe(1);
    expect(contradiction[0]!.severity).toBe('critical');
  });

  it('supports custom rule registration via addRule', () => {
    const detector = new AmbiguityDetector({ useDefaults: false });
    const customRule: DetectionRule = {
      id: 'custom-todo',
      signalType: 'boundary-undefined',
      detect(content: string): AmbiguitySignal[] {
        const signals: AmbiguitySignal[] = [];
        if (/TODO/i.test(content)) {
          signals.push({
            type: 'boundary-undefined',
            description: 'TODO found — incomplete specification',
            location: 'content',
            severity: 'medium',
          });
        }
        return signals;
      },
    };
    detector.addRule(customRule);
    expect(detector.getRules()).toHaveLength(1);

    const signals = detector.detect('This section is TODO');
    expect(signals).toHaveLength(1);
    expect(signals[0]!.description).toContain('TODO');
  });

  it('supports rule removal via removeRule', () => {
    const detector = new AmbiguityDetector({ useDefaults: false });
    const rule: DetectionRule = {
      id: 'temp-rule',
      signalType: 'term-undefined',
      detect(): AmbiguitySignal[] {
        return [{ type: 'term-undefined', description: 'test', location: 'x', severity: 'low' }];
      },
    };
    detector.addRule(rule);
    expect(detector.detect('anything')).toHaveLength(1);

    const removed = detector.removeRule('temp-rule');
    expect(removed).toBe(true);
    expect(detector.detect('anything')).toHaveLength(0);
  });

  it('returns empty array for clean content', () => {
    const detector = new AmbiguityDetector({ useDefaults: false });
    const signals = detector.detect('Clean content with no issues.');
    expect(signals).toHaveLength(0);
  });
});

describe('ClarificationManager', () => {
  const fixedId = (() => {
    let counter = 0;
    return () => `cq-${++counter}`;
  })();
  const fixedNow = () => '2026-04-20T10:00:00.000Z';

  function createManager() {
    return new ClarificationManager({ createId: fixedId, now: fixedNow });
  }

  it('generates structured questions from signals', () => {
    const manager = createManager();
    const signals: AmbiguitySignal[] = [
      {
        type: 'acceptance-criteria-missing',
        description: 'FR-05 lacks AC',
        location: 'FR-05',
        severity: 'high',
      },
    ];
    const questions = manager.generateQuestions(signals);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.signal).toBe(signals[0]);
    expect(questions[0]!.type).toBe(ClarificationType.DECISION);
    expect(questions[0]!.impactScope).toContain('FR-05');
    expect(questions[0]!.context).toContain('acceptance-criteria-missing');
    expect(questions[0]!.questionId).toBeDefined();
  });

  it('assigns blocking level based on severity', () => {
    const manager = createManager();
    const highSignal: AmbiguitySignal = {
      type: 'spec-contract-contradiction',
      description: 'contradiction',
      location: 'section-3',
      severity: 'critical',
    };
    const lowSignal: AmbiguitySignal = {
      type: 'term-undefined',
      description: 'term X',
      location: 'section-1',
      severity: 'low',
    };
    const questions = manager.generateQuestions([highSignal, lowSignal]);
    expect(questions[0]!.blockingLevel).toBe(BlockingLevel.BLOCKING);
    expect(questions[1]!.blockingLevel).toBe(BlockingLevel.NON_BLOCKING);
  });

  it('processes response and creates record', () => {
    const manager = createManager();
    const question: ClarificationQuestion = {
      questionId: 'cq-test',
      signal: {
        type: 'boundary-undefined',
        description: 'vague boundary',
        location: 'line 10',
        severity: 'medium',
      },
      type: ClarificationType.BOUNDARY,
      impactScope: ['line 10'],
      context: 'test context',
      blockingLevel: BlockingLevel.NON_BLOCKING,
    };
    const response: ClarificationResponsePayload = {
      questionId: 'cq-test',
      answer: 'Max 100 concurrent connections',
      convergenceConclusion: 'Boundary set to 100 concurrent connections',
      knowledgeType: ClarificationType.BOUNDARY,
    };
    const record = manager.processResponse(question, response, 'spec');
    expect(record.stage).toBe('spec');
    expect(record.questions).toHaveLength(1);
    expect(record.responses).toHaveLength(1);
    expect(record.responses[0]!.convergenceConclusion).toContain('100');
    expect(record.createdAt).toBe('2026-04-20T10:00:00.000Z');
  });

  it('retrieves records by stage', () => {
    const manager = createManager();
    const signal: AmbiguitySignal = {
      type: 'term-undefined',
      description: 'term',
      location: 'loc',
      severity: 'low',
    };
    const questions = manager.generateQuestions([signal]);
    const question = questions[0]!;
    const response: ClarificationResponsePayload = {
      questionId: question.questionId,
      answer: 'defined as X',
      convergenceConclusion: 'Term X = ...',
      knowledgeType: ClarificationType.BOUNDARY,
    };
    manager.processResponse(question, response, 'spec');
    manager.processResponse(question, response, 'contract');

    expect(manager.getRecordsByStage('spec')).toHaveLength(1);
    expect(manager.getRecordsByStage('contract')).toHaveLength(1);
    expect(manager.getRecordsByStage('implement')).toHaveLength(0);
  });

  it('retrieves records by knowledge type', () => {
    const manager = createManager();
    const signal: AmbiguitySignal = {
      type: 'spec-contract-contradiction',
      description: 'contradiction',
      location: 'loc',
      severity: 'critical',
    };
    const questions = manager.generateQuestions([signal]);
    const question = questions[0]!;
    const correctionResp: ClarificationResponsePayload = {
      questionId: question.questionId,
      answer: 'spec is correct',
      convergenceConclusion: 'Use spec definition',
      knowledgeType: ClarificationType.CORRECTION,
    };
    const methodResp: ClarificationResponsePayload = {
      questionId: question.questionId,
      answer: 'use method Y',
      convergenceConclusion: 'Apply method Y',
      knowledgeType: ClarificationType.METHODOLOGY,
    };
    manager.processResponse(question, correctionResp, 'contract');
    manager.processResponse(question, methodResp, 'implement');

    expect(manager.getRecordsByKnowledgeType(ClarificationType.CORRECTION)).toHaveLength(1);
    expect(manager.getRecordsByKnowledgeType(ClarificationType.METHODOLOGY)).toHaveLength(1);
    expect(manager.getRecordsByKnowledgeType(ClarificationType.EXPERIENCE)).toHaveLength(0);
  });

  it('records are traceable with timestamps', () => {
    const manager = createManager();
    const signal: AmbiguitySignal = {
      type: 'dependency-undeclared',
      description: 'dep',
      location: 'loc',
      severity: 'medium',
    };
    const questions = manager.generateQuestions([signal]);
    const question = questions[0]!;
    const response: ClarificationResponsePayload = {
      questionId: question.questionId,
      answer: 'declared now',
      convergenceConclusion: 'Added to deps',
      knowledgeType: ClarificationType.METHODOLOGY,
    };
    const record = manager.processResponse(question, response, 'implement');
    expect(record.createdAt).toBe('2026-04-20T10:00:00.000Z');
    expect(manager.getAllRecords()).toHaveLength(1);
  });
});
