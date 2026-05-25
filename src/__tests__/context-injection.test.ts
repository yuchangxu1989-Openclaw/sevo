/**
 * Context Injection module tests.
 * Covers all 4 pipeline stages with fixture project directories.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ContextInjector, PIPELINE_STAGES } from '../context-injection/index.js';
import type { PipelineStage } from '../context-injection/index.js';

// ── Fixture setup ───────────────────────────────────────────────

const FIXTURE_ROOT = join(import.meta.dirname ?? __dirname, '__fixtures__', 'ctx-inject-project');

const SPEC_CONTENT = `# Product Requirements

## 产品愿景

SEVO is a pipeline governance framework for AI agent workflows.

## 范围

Covers spec → plan → implement → review lifecycle.

## FR-01 Router

The router classifies tasks by scope and determines pipeline level.

AC-01: Tasks with >500 lines trigger L2+ pipeline.
AC-02: Cross-domain tasks trigger L2+ pipeline.

## FR-02 Gate Engine

Gate engine evaluates stage completion against configurable rules.

AC-03: Gate must collect all reviewer verdicts before concluding.
AC-04: Rejected gate blocks pipeline advancement.

## 功能需求 Summary

All functional requirements are listed above.
`;

const ARC42_CONTENT = `# arc42 Architecture

## Solution Strategy

Use a modular pipeline engine with pluggable adapters.

## Skill 接口清单

### sevo-router
- 职责：任务分级路由
- 触发条件：新任务进入 SEVO
- 核心模块：src/router/

### sevo-gate
- 职责：阶段门禁评估
- 触发条件：阶段完成时
- 核心模块：src/gate/

### sevo-ledger
- 职责：交付记录归档
- 触发条件：流水线完成
- 核心模块：src/ledger/

## 模块边界

- Router: 只做分级，不做调度
- Pipeline Engine: 状态机驱动，不含业务逻辑
- Gate Engine: 规则评估，不做修复
- Adapter: 宿主集成，不含核心逻辑

## Building Block View

Top-level decomposition into Router, Pipeline, Gate, Ledger, Adapter.
`;

const ADR_CONTENT = `# ADR-001 Use Event Sourcing for Pipeline State

## Status
Accepted

## Context
Pipeline state needs audit trail and replay capability.

## Decision
Use append-only event log (events.jsonl) as source of truth, with derived state.json for fast reads.

## Consequences
- Pro: Full audit trail, replay capability
- Con: Slightly more complex state reconstruction
`;

function setupFixtures(): void {
  const docsDesign = join(FIXTURE_ROOT, 'docs', 'design');
  const docsArch = join(FIXTURE_ROOT, 'docs', 'architecture');
  const docsAdr = join(FIXTURE_ROOT, 'docs', 'architecture', 'decisions');
  const srcDir = join(FIXTURE_ROOT, 'src');
  const srcRouter = join(srcDir, 'router');

  mkdirSync(docsDesign, { recursive: true });
  mkdirSync(docsArch, { recursive: true });
  mkdirSync(docsAdr, { recursive: true });
  mkdirSync(srcRouter, { recursive: true });

  writeFileSync(join(docsDesign, 'product-requirements.md'), SPEC_CONTENT);
  writeFileSync(join(docsArch, 'arc42-architecture.md'), ARC42_CONTENT);
  writeFileSync(join(docsAdr, 'ADR-001-event-sourcing.md'), ADR_CONTENT);
  writeFileSync(join(srcRouter, 'router.ts'), '// router implementation');
  writeFileSync(join(srcDir, 'index.ts'), '// entry point');
}

function cleanFixtures(): void {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
}

// ── Tests ───────────────────────────────────────────────────────

describe('ContextInjector', () => {
  let injector: ContextInjector;

  beforeAll(() => {
    setupFixtures();
    injector = new ContextInjector();
  });

  afterAll(() => {
    cleanFixtures();
  });

  it('exports all 4 pipeline stages', () => {
    expect(PIPELINE_STAGES).toEqual(['specify', 'plan', 'implement', 'review']);
  });

  describe('specify stage', () => {
    it('injects existing spec vision + scope + conceptual architecture', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'specify');

      expect(result).toContain('Stage: specify');
      expect(result).toContain('Vision:');
      expect(result).toContain('SEVO is a pipeline governance framework');
      expect(result).toContain('Scope:');
      expect(result).toContain('spec → plan → implement → review');
      expect(result).toContain('Conceptual Architecture');
      expect(result).toContain('modular pipeline engine');
    });

    it('includes FR summaries from spec', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'specify');
      expect(result).toContain('Functional Requirements');
      expect(result).toContain('FR-01');
    });
  });

  describe('plan stage', () => {
    it('injects full spec content', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'plan');

      expect(result).toContain('Stage: plan');
      expect(result).toContain('Product Requirements Spec (full)');
      // Full spec should be present
      expect(result).toContain('FR-01 Router');
      expect(result).toContain('FR-02 Gate Engine');
      expect(result).toContain('AC-01');
      expect(result).toContain('AC-04');
    });

    it('injects existing ADRs', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'plan');

      expect(result).toContain('Existing ADRs');
      expect(result).toContain('ADR-001');
      expect(result).toContain('Event Sourcing');
      expect(result).toContain('append-only event log');
    });
  });

  describe('implement stage', () => {
    it('injects Skill interface definitions from arc42', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'implement');

      expect(result).toContain('Stage: implement');
      expect(result).toContain('Skill Interface Definitions');
      expect(result).toContain('sevo-router');
      expect(result).toContain('sevo-gate');
      expect(result).toContain('sevo-ledger');
      expect(result).toContain('任务分级路由');
    });

    it('injects module boundaries', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'implement');

      expect(result).toContain('Module Boundaries');
      expect(result).toContain('Router: 只做分级');
      expect(result).toContain('Pipeline Engine: 状态机驱动');
    });

    it('injects key ADR decisions (not full text)', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'implement');

      expect(result).toContain('Key ADRs');
      expect(result).toContain('Decision:');
      expect(result).toContain('append-only event log');
    });
  });

  describe('review stage', () => {
    it('injects acceptance criteria from spec', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'review');

      expect(result).toContain('Stage: review');
      expect(result).toContain('Acceptance Criteria');
      expect(result).toContain('AC-01');
      expect(result).toContain('AC-02');
      expect(result).toContain('AC-03');
    });

    it('injects spec-code alignment principles', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'review');

      expect(result).toContain('Review Principles (spec-code alignment)');
      expect(result).toContain('提取全量 AC 清单，逐条比对实现');
      expect(result).toContain('类型定义、逻辑代码、测试证据');
      expect(result).toContain('AC编号 | 覆盖状态(已实现/部分/未实现) | 对应代码位置');
      expect(result).toContain('任意 AC 未实现或只有部分覆盖 = blocker');
    });

    it('injects Skill interface definitions from arc42', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'review');

      expect(result).toContain('Skill Interface Definitions');
      expect(result).toContain('sevo-router');
    });

    it('lists implementation files', () => {
      const result = injector.buildInjection(FIXTURE_ROOT, 'review');

      expect(result).toContain('Implementation Files');
      expect(result).toContain('src/index.ts');
      expect(result).toContain('src/router/router.ts');
    });
  });

  describe('empty project', () => {
    const emptyRoot = join(FIXTURE_ROOT, '..', 'ctx-inject-empty');

    beforeAll(() => {
      mkdirSync(emptyRoot, { recursive: true });
    });

    afterAll(() => {
      rmSync(emptyRoot, { recursive: true, force: true });
    });

    it('specify stage handles missing docs gracefully', () => {
      const result = injector.buildInjection(emptyRoot, 'specify');
      expect(result).toContain('Stage: specify');
      expect(result).toContain('Starting fresh');
    });

    it('plan stage warns about missing spec', () => {
      const result = injector.buildInjection(emptyRoot, 'plan');
      expect(result).toContain('No spec found');
    });

    it('implement stage warns about missing arc42', () => {
      const result = injector.buildInjection(emptyRoot, 'implement');
      expect(result).toContain('No arc42 architecture doc found');
    });

    it('review stage handles missing files gracefully', () => {
      const result = injector.buildInjection(emptyRoot, 'review');
      expect(result).toContain('No implementation files found');
    });
  });

  describe('return type', () => {
    it.each<PipelineStage>(['specify', 'plan', 'implement', 'review'])(
      '%s returns a non-empty string',
      (stage) => {
        const result = injector.buildInjection(FIXTURE_ROOT, stage);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      },
    );
  });
});
