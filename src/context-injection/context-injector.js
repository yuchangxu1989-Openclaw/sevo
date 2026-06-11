import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const PIPELINE_STAGES = [
  'specify',
  'plan',
  'implement',
  'review',
];

function extractSection(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(#{2,3})\\s+${escaped}\\s*$`, 'm');
  const match = pattern.exec(content);
  if (!match) return null;

  const level = match[1].length;
  const startIdx = match.index + match[0].length;
  const rest = content.slice(startIdx);
  const nextHeading = new RegExp(`^#{2,${level}}\\s+`, 'm');
  const nextMatch = nextHeading.exec(rest);
  const section = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  return section.trim() || null;
}

function extractSectionsMatching(content, pattern) {
  const results = [];
  const lines = content.split('\n');
  let capturing = false;
  let captureLevel = 0;
  let buffer = [];

  for (const line of lines) {
    const headingMatch = /^(#{2,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      if (capturing && buffer.length > 0) {
        results.push(buffer.join('\n').trim());
      }

      const level = headingMatch[1].length;
      const title = headingMatch[2];
      if (pattern.test(title)) {
        capturing = true;
        captureLevel = level;
        buffer = [line];
      } else if (capturing && level <= captureLevel) {
        capturing = false;
        buffer = [];
      } else if (capturing) {
        buffer.push(line);
      }
    } else if (capturing) {
      buffer.push(line);
    }
  }

  if (capturing && buffer.length > 0) {
    results.push(buffer.join('\n').trim());
  }
  return results;
}

function extractAcceptanceCriteria(content) {
  const acBlocks = [];
  const lines = content.split('\n');
  let inAcBlock = false;
  let buffer = [];

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

function safeReadFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function listFiles(dir, ext = '.md') {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: false })
      .map((file) => String(file))
      .filter((file) => file.endsWith(ext))
      .map((file) => join(dir, file));
  } catch {
    return [];
  }
}

function listFilesRecursive(dir, extensions = ['.ts', '.js']) {
  try {
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...listFilesRecursive(fullPath, extensions));
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
    return files;
  } catch {
    return [];
  }
}

export class ContextInjector {
  buildInjection(projectPath, stage) {
    const resolved = resolve(projectPath);
    const docsDir = join(resolved, 'docs');
    const specPath = join(docsDir, 'design', 'product-requirements.md');
    const arcPath = join(docsDir, 'architecture', 'arc42-architecture.md');
    const adrDir = join(docsDir, 'architecture', 'decisions');
    const srcDir = join(resolved, 'src');

    switch (stage) {
      case 'specify':
        return this.buildSpecifyContext(specPath, arcPath);
      case 'plan':
        return this.buildPlanContext(specPath, adrDir);
      case 'implement':
        return this.buildImplementContext(arcPath, adrDir);
      case 'review':
        return this.buildReviewContext(specPath, arcPath, srcDir);
      default:
        throw new Error(`Unsupported pipeline stage: ${stage}`);
    }
  }

  buildSpecifyContext(specPath, arcPath) {
    const blocks = [];
    blocks.push('## Context Injection (Stage: specify)');

    const spec = safeReadFile(specPath);
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

  buildPlanContext(specPath, adrDir) {
    const blocks = [];
    blocks.push('## Context Injection (Stage: plan)');

    const spec = safeReadFile(specPath);
    if (spec) {
      blocks.push('\n### Product Requirements Spec (full)');
      blocks.push(spec);
    } else {
      blocks.push('\n_No spec found. Architecture design without spec is risky._');
    }

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

  buildImplementContext(arcPath, adrDir) {
    const blocks = [];
    blocks.push('## Context Injection (Stage: implement)');

    const arc = safeReadFile(arcPath);
    if (arc) {
      blocks.push('\n### Skill Interface Definitions');
      const skillSection =
        extractSection(arc, 'Skill 接口清单') ??
        extractSection(arc, 'Skill Interfaces') ??
        extractSection(arc, 'Skill Interface');
      if (skillSection) {
        blocks.push(skillSection);
      } else {
        const skillSections = extractSectionsMatching(arc, /skill/i);
        blocks.push(skillSections.length > 0 ? skillSections.join('\n---\n') : '_No Skill interface section found in arc42._');
      }

      blocks.push('\n### Module Boundaries');
      const modules =
        extractSection(arc, '模块边界') ??
        extractSection(arc, 'Building Block View') ??
        extractSection(arc, 'Component View');
      if (modules) {
        blocks.push(modules);
      }
    } else {
      blocks.push('\n_No arc42 architecture doc found._');
    }

    const adrFiles = listFiles(adrDir);
    if (adrFiles.length > 0) {
      blocks.push('\n### Key ADRs');
      for (const adrFile of adrFiles) {
        const content = safeReadFile(adrFile);
        if (!content) continue;

        const title = /^#\s+(.+)$/m.exec(content)?.[1] ?? adrFile;
        const decision = extractSection(content, 'Decision') ?? extractSection(content, '决策');
        const consequences = extractSection(content, 'Consequences') ?? extractSection(content, '后果');
        blocks.push(`**${title}**`);
        if (decision) blocks.push(`Decision: ${decision}`);
        if (consequences) blocks.push(`Consequences: ${consequences}`);
      }
    }

    return blocks.join('\n\n');
  }

  buildReviewContext(specPath, arcPath, srcDir) {
    const blocks = [];
    blocks.push('## Context Injection (Stage: review)');
    blocks.push([
      '### Review Principles (spec-code alignment)',
      '1. 从 docs/design/product-requirements.md 提取全量 AC 清单，逐条比对实现。',
      '2. 每条 AC 都必须同时找到类型定义、逻辑代码、测试证据；仅有类型定义不算已实现。',
      '3. 评审输出必须包含 AC 覆盖矩阵：AC编号 | 覆盖状态(已实现/部分/未实现) | 对应代码位置。',
      '4. 任意 AC 未实现或只有部分覆盖 = blocker，Review 结论必须为不通过。',
      '5. 除了代码质量，还要检查实现是否严格按 spec 描述的方式工作。',
    ].join('\n'));

    const spec = safeReadFile(specPath);
    if (spec) {
      blocks.push('\n### Acceptance Criteria');
      const acList = extractAcceptanceCriteria(spec);
      if (acList) {
        blocks.push(acList);
      } else {
        const frSections = extractSectionsMatching(spec, /^FR[-\s]?\d+|功能需求/i);
        blocks.push(frSections.length > 0 ? frSections.join('\n---\n') : '_No acceptance criteria found in spec._');
      }
    }

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

    blocks.push('\n### Implementation Files');
    const srcFiles = listFilesRecursive(srcDir);
    if (srcFiles.length > 0) {
      const relativePaths = srcFiles.map((file) => file.replace(srcDir, 'src'));
      blocks.push('```\n' + relativePaths.join('\n') + '\n```');
    } else {
      blocks.push('_No implementation files found._');
    }

    return blocks.join('\n\n');
  }
}
