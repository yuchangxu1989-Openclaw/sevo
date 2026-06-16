/**
 * Context Injection — stage-aware architecture constraint injection.
 *
 * Reads project docs (spec, arc42, ADRs) and extracts relevant sections
 * based on the current pipeline stage, producing a text block that can be
 * injected into a sub-agent's task prompt.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Pipeline Stage enum ─────────────────────────────────────────

// NOTE: `PipelineStage` is the coarse-grained context-injection abstraction used
// by this module. It intentionally folds the arc42 §5.4 workflow `StageId` set
// into 4 prompt-injection phases so each task receives only the context it needs.
//
// Mapping to arc42 §5.4 StageId:
// - specify   → spec, spec-review-gate
// - plan      → contract, contract-review-gate, test-case-authoring
// - implement → implement
// - review    → review, regression, deploy, verify, ledger
//
// `review` groups the downstream validation/release/accounting stages because
// they all need the same acceptance-criteria, interface-contract, and file-list
// context bundle rather than distinct architecture slices.
export type PipelineStage = 'specify' | 'plan' | 'implement' | 'review';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'specify',
  'plan',
  'implement',
  'review',
] as const;

// ── Section extraction helpers ──────────────────────────────────

/** Extract a markdown section by heading (## or ###). Returns content under that heading until next same-level heading. */
function extractSection(content: string, heading: string): string | null {
  // Match ## or ### headings
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^(#{2,3})\\s+${escaped}\\s*$`,
    'm',
  );
  const match = pattern.exec(content);
  if (!match) return null;

  const level = match[1]!.length;
  const startIdx = match.index! + match[0].length;
  // Find next heading of same or higher level
  const rest = content.slice(startIdx);
  const nextHeading = new RegExp(`^#{2,${level}}\\s+`, 'm');
  const nextMatch = nextHeading.exec(rest);
  const section = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return section.trim() || null;
}

/** Extract all sections matching a regex pattern on headings. */
function extractSectionsMatching(content: string, pattern: RegExp): string[] {
  const results: string[] = [];
  const lines = content.split('\n');
  let capturing = false;
  let captureLevel = 0;
  let buffer: string[] = [];

  for (const line of lines) {
    const headingMatch = /^(#{2,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const title = headingMatch[2]!;
      if (pattern.test(title)) {
        if (capturing && buffer.length > 0) {
          results.push(buffer.join('\n').trim());
        }
        capturing = true;
        captureLevel = level;
        buffer = [line];
      } else if (capturing && level <= captureLevel) {
        if (buffer.length > 0) {
          results.push(buffer.join('\n').trim());
        }
        capturing = false;
        buffer = [];
      } else if (capturing) {
        buffer.push(line);
      }
    } else if (capturing) {
      buffer.push(line);
    }
  }
  // Flush last capture
  if (capturing && buffer.length > 0) {
    results.push(buffer.join('\n').trim());
  }
  return results;
}

/** Extract acceptance criteria blocks from spec. */
function extractAcceptanceCriteria(content: string): string | null {
  const acBlocks: string[] = [];
  // Match AC patterns: "AC-xxx" or "验收标准" or "Acceptance Criteria"
  const lines = content.split('\n');
  let inAcBlock = false;
  let buffer: string[] = [];

  for (const line of lines) {
    if (/AC[-\s]?\d+|验收标准|Acceptance Criteria/i.test(line)) {
      inAcBlock = true;
      buffer.push(line);
    } else if (inAcBlock) {
      if (/^#{2,3}\s+/.test(line) && !/AC[-\s]?\d+/i.test(line)) {
        acBlocks.push(buffer.join('\n').trim());
        buffer = [];
        inAcBlock = false;
      } else {
        buffer.push(line);
      }
    }
  }
  if (buffer.length > 0) {
    acBlocks.push(buffer.join('\n').trim());
  }
  return acBlocks.length > 0 ? acBlocks.join('\n\n') : null;
}

// ── File reading helpers ────────────────────────────────────────

function safeReadFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function safeReadSpecFile(filePath: string): string | null {
  const content = safeReadFile(filePath);
  if (!content) return null;

  const trimmed = content.trimStart();
  if (!trimmed.startsWith('{')) return content;

  try {
    const parsed = JSON.parse(content) as { data?: { markdown?: unknown } };
    const markdown = parsed.data?.markdown;
    return typeof markdown === 'string' ? markdown : content;
  } catch {
    return content;
  }
}

function extractFunctionalRequirementsWithAcceptanceCriteria(content: string): string | null {
  const frSections = extractSectionsMatching(content, /^FR[-\s]?\d[\w.-]*\b/i);
  if (frSections.length === 0) {
    const functionalSections = extractSectionsMatching(content, /^(?:功能需求|Functional Requirements)$/i);
    return functionalSections.length > 0 ? functionalSections.join('\n---\n') : null;
  }

  const blocks: string[] = [];
  for (const section of frSections) {
    const lines = section.split('\n');
    const heading = lines[0]?.replace(/^#{2,6}\s+/, '').trim();
    if (!heading) continue;

    const acLines: string[] = [];
    let inAcSection = false;
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (/^[-*]\s*AC[-\s]?\d[\w.-]*\s*[:：]/i.test(trimmed) || /^AC[-\s]?\d[\w.-]*\s*[:：]/i.test(trimmed)) {
        acLines.push(trimmed);
        continue;
      }

      if (/^(?:#{4,6}\s*)?(?:验收标准|Acceptance Criteria)\b/i.test(trimmed)) {
        inAcSection = true;
        acLines.push(trimmed);
        continue;
      }

      if (inAcSection) {
        if (/^#{4,6}\s+/.test(trimmed) && !/(?:验收标准|Acceptance Criteria)/i.test(trimmed)) {
          inAcSection = false;
          continue;
        }
        if (trimmed) acLines.push(trimmed);
      }
    }

    blocks.push(`### ${heading}\n${acLines.length > 0 ? acLines.join('\n') : '_No acceptance criteria found under this FR._'}`);
  }

  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

function listFiles(dir: string, ext = '.md'): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: false })
      .map(f => String(f))
      .filter(f => f.endsWith(ext))
      .map(f => join(dir, f));
  } catch {
    return [];
  }
}

function listFilesRecursive(dir: string, extensions: string[] = ['.ts', '.js']): string[] {
  try {
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...listFilesRecursive(fullPath, extensions));
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

// ── ContextInjector ─────────────────────────────────────────────

export class ContextInjector {
  /**
   * Build a context injection string for a given project and pipeline stage.
   *
   * @param projectPath - Absolute path to the project root (must contain docs/).
   * @param stage - Current pipeline stage.
   * @returns Plain text string ready to be appended to a task prompt.
   */
  buildInjection(projectPath: string, stage: PipelineStage): string {
    const resolved = resolve(projectPath);
    const docsDir = join(resolved, 'docs');
    const designSpecPath = join(docsDir, 'design', 'product-requirements.md');
    const specPath = existsSync(designSpecPath) ? designSpecPath : join(docsDir, 'product-requirements.md');
    const arcPath = join(docsDir, 'architecture', 'arc42-architecture.md');
    const adrDir = join(docsDir, 'architecture', 'decisions');
    const srcDir = join(resolved, 'src');

    switch (stage) {
      case 'specify':
        return this.buildSpecifyContext(specPath, arcPath);
      case 'plan':
        return this.buildPlanContext(specPath, adrDir);
      case 'implement':
        return this.buildImplementContext(specPath, arcPath, adrDir);
      case 'review':
        return this.buildReviewContext(specPath, arcPath, srcDir);
    }
  }

  // ── Stage-specific builders ─────────────────────────────────

  private buildSpecifyContext(specPath: string, arcPath: string): string {
    const blocks: string[] = [];
    blocks.push('## 📋 Context Injection (Stage: specify)');

    // Existing spec (if any) — extract vision + scope + conceptual architecture
    const spec = safeReadSpecFile(specPath);
    if (spec) {
      blocks.push('\n### Existing Spec (key sections)');
      const vision = extractSection(spec, '产品愿景') ?? extractSection(spec, 'Vision');
      if (vision) blocks.push(`**Vision:**\n${vision}`);

      const scope = extractSection(spec, '范围') ?? extractSection(spec, 'Scope');
      if (scope) blocks.push(`**Scope:**\n${scope}`);

      const frSections = extractSectionsMatching(spec, /^FR[-\s]?\d+|功能需求/i);
      if (frSections.length > 0) {
        blocks.push(`**Functional Requirements (summary):**\n${frSections.join('\n---\n')}`);
      }
    }

    // Conceptual architecture constraints from arc42 (if exists)
    const arc = safeReadFile(arcPath);
    if (arc) {
      blocks.push('\n### Conceptual Architecture Constraints');
      const conceptual =
        extractSection(arc, '概念架构') ??
        extractSection(arc, 'Solution Strategy') ??
        extractSection(arc, 'Building Block View');
      if (conceptual) blocks.push(conceptual);
    }

    if (blocks.length === 1) {
      blocks.push('\n_No existing spec or architecture docs found. Starting fresh._');
    }

    return blocks.join('\n\n');
  }

  private buildPlanContext(specPath: string, adrDir: string): string {
    const blocks: string[] = [];
    blocks.push('## 📋 Context Injection (Stage: plan)');

    // Full spec
    const spec = safeReadSpecFile(specPath);
    if (spec) {
      blocks.push('\n### Product Requirements Spec (full)');
      blocks.push(spec);
    } else {
      blocks.push('\n_⚠️ No spec found. Architecture design without spec is risky._');
    }

    // All ADRs
    const adrFiles = listFiles(adrDir);
    if (adrFiles.length > 0) {
      blocks.push('\n### Existing ADRs');
      for (const adrFile of adrFiles) {
        const content = safeReadFile(adrFile);
        if (content) {
          blocks.push(`---\n${content}`);
        }
      }
    }

    return blocks.join('\n\n');
  }

  private buildImplementContext(specPath: string, arcPath: string, adrDir: string): string {
    const blocks: string[] = [];
    blocks.push('## 📋 Context Injection (Stage: implement)');

    const spec = safeReadSpecFile(specPath);
    if (spec) {
      blocks.push('\n### Product Requirements (FR/AC summary)');
      const frAcSummary = extractFunctionalRequirementsWithAcceptanceCriteria(spec);
      if (frAcSummary) {
        blocks.push(frAcSummary);
      } else {
        const acList = extractAcceptanceCriteria(spec);
        blocks.push(acList ?? '_No functional requirements or acceptance criteria found in spec._');
      }
    } else {
      blocks.push('\n_⚠️ No spec found. Implementation without FR/AC context is risky._');
    }

    const arc = safeReadFile(arcPath);
    if (arc) {
      // Skill interface definitions
      blocks.push('\n### Skill Interface Definitions');
      const skillSection =
        extractSection(arc, 'Skill 接口清单') ??
        extractSection(arc, 'Skill Interfaces') ??
        extractSection(arc, 'Skill Interface');
      if (skillSection) {
        blocks.push(skillSection);
      } else {
        // Fallback: look for any section mentioning "Skill"
        const skillSections = extractSectionsMatching(arc, /skill/i);
        if (skillSections.length > 0) {
          blocks.push(skillSections.join('\n---\n'));
        } else {
          blocks.push('_No Skill interface section found in arc42._');
        }
      }

      // Module boundaries
      blocks.push('\n### Module Boundaries');
      const modules =
        extractSection(arc, '模块边界') ??
        extractSection(arc, 'Building Block View') ??
        extractSection(arc, 'Component View');
      if (modules) {
        blocks.push(modules);
      }
    } else {
      blocks.push('\n_⚠️ No arc42 architecture doc found._');
    }

    // Key ADRs
    const adrFiles = listFiles(adrDir);
    if (adrFiles.length > 0) {
      blocks.push('\n### Key ADRs');
      for (const adrFile of adrFiles) {
        const content = safeReadFile(adrFile);
        if (content) {
          // Extract just title + decision + consequences (not full ADR)
          const title = /^#\s+(.+)$/m.exec(content)?.[1] ?? adrFile;
          const decision = extractSection(content, 'Decision') ?? extractSection(content, '决策');
          const consequences = extractSection(content, 'Consequences') ?? extractSection(content, '后果');
          blocks.push(`**${title}**`);
          if (decision) blocks.push(`Decision: ${decision}`);
          if (consequences) blocks.push(`Consequences: ${consequences}`);
        }
      }
    }

    return blocks.join('\n\n');
  }

  private buildReviewContext(specPath: string, arcPath: string, srcDir: string): string {
    const blocks: string[] = [];
    blocks.push('## 📋 Context Injection (Stage: review)');
    blocks.push([
      '### Review Principles (spec-code alignment)',
      '1. 从 docs/design/product-requirements.md 提取全量 AC 清单，逐条比对实现。',
      '2. 每条 AC 都必须同时找到类型定义、逻辑代码、测试证据；仅有类型定义不算已实现。',
      '3. 评审输出必须包含 AC 覆盖矩阵：AC编号 | 覆盖状态(已实现/部分/未实现) | 对应代码位置。',
      '4. 任意 AC 未实现或只有部分覆盖 = blocker，Review 结论必须为不通过。',
      '5. 除了代码质量，还要检查实现是否严格按 spec 描述的方式工作。',
    ].join('\n'));

    // Spec AC list
    const spec = safeReadSpecFile(specPath);
    if (spec) {
      blocks.push('\n### Acceptance Criteria');
      const acList = extractAcceptanceCriteria(spec);
      if (acList) {
        blocks.push(acList);
      } else {
        // Fallback: extract FR sections which often contain ACs
        const frSections = extractSectionsMatching(spec, /^FR[-\s]?\d+|功能需求/i);
        if (frSections.length > 0) {
          blocks.push(frSections.join('\n---\n'));
        } else {
          blocks.push('_No acceptance criteria found in spec._');
        }
      }
    }

    // Arc42 Skill interface definitions
    const arc = safeReadFile(arcPath);
    if (arc) {
      blocks.push('\n### Skill Interface Definitions (from arc42)');
      const skillSection =
        extractSection(arc, 'Skill 接口清单') ??
        extractSection(arc, 'Skill Interfaces') ??
        extractSection(arc, 'Skill Interface');
      if (skillSection) {
        blocks.push(skillSection);
      }
    }

    // Implementation file listing
    blocks.push('\n### Implementation Files');
    const srcFiles = listFilesRecursive(srcDir);
    if (srcFiles.length > 0) {
      const relativePaths = srcFiles.map(f => f.replace(srcDir, 'src'));
      blocks.push('```\n' + relativePaths.join('\n') + '\n```');
    } else {
      blocks.push('_No implementation files found._');
    }

    return blocks.join('\n\n');
  }
}
