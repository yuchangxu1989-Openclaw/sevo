import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { LLMProvider, type ChatMessage, type LLMProviderConfig } from '../../llm/index.js';
import type { ArtifactRef, RuleResult } from '../../types/index.js';
import { resolveOpenclawConfigPath } from '../../utils/path-defaults.js';

export type SemanticRuleReason = {
  type: string;
  line: number;
  detail: string;
};

export type SemanticRuleResponse = {
  pass: boolean;
  reasons: SemanticRuleReason[];
};

export interface SemanticRuleLlmClient {
  chat(messages: ChatMessage[]): Promise<string>;
}

export interface SemanticRuleOptions {
  llmClient?: SemanticRuleLlmClient;
  model?: string;
  llmConfig?: LLMProviderConfig;
}

export interface SpecSource {
  content: string;
  path: string;
}

export interface H2Section {
  title: string;
  line: number;
  endLine: number;
  content: string;
}

export interface FrSection {
  id: string;
  title: string;
  line: number;
  endLine: number;
  content: string;
}

const H2_PATTERN = /^##\s+(.+?)\s*$/gm;
const FR_HEADING_PATTERN = /^#{3,5}\s+(FR-\d+[A-Za-z0-9.-]*)(?:\s+(.+?))?\s*$/gm;

export function createSemanticRuleLlmClient(options?: SemanticRuleOptions): SemanticRuleLlmClient {
  return options?.llmClient ?? new LLMProvider(loadLlmConfig(options));
}


export async function judgeSemanticRule(
  llmClient: SemanticRuleLlmClient,
  systemPrompt: string,
  userPrompt: string,
): Promise<SemanticRuleResponse> {
  const response = await llmClient.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  const parsed = parseJsonObject(response) as Partial<SemanticRuleResponse>;
  if (typeof parsed.pass !== 'boolean' || !Array.isArray(parsed.reasons)) {
    throw new Error('LLM response must be JSON: { pass: boolean, reasons: [{ type, line, detail }] }');
  }

  return {
    pass: parsed.pass,
    reasons: parsed.reasons.map((reason) => ({
      type: typeof reason?.type === 'string' ? reason.type : 'invalid-llm-reason',
      line: typeof reason?.line === 'number' ? reason.line : 1,
      detail: typeof reason?.detail === 'string' ? reason.detail : JSON.stringify(reason),
    })),
  };
}

export function resultFromSemanticResponse(response: SemanticRuleResponse, passMessage: string): RuleResult {
  if (response.pass) {
    return { pass: true, message: passMessage, severity: 'blocker' };
  }

  return {
    pass: false,
    message: response.reasons.length > 0
      ? response.reasons.map(formatReason).join('; ')
      : 'LLM semantic rule failed without detailed reasons',
    severity: 'blocker',
  };
}

export function failRule(type: string, line: number, detail: string): RuleResult {
  return {
    pass: false,
    message: formatReason({ type, line, detail }),
    severity: 'blocker',
  };
}

export function findSpecContent(artifacts: ArtifactRef[]): SpecSource | null {
  const markdownArtifacts = artifacts.filter((artifact) => {
    return typeof artifact.path === 'string' && artifact.path.toLowerCase().endsWith('.md');
  });

  const orderedArtifacts = [
    ...markdownArtifacts.filter((artifact) => isPreferredSpecPath(artifact.path)),
    ...markdownArtifacts.filter((artifact) => !isPreferredSpecPath(artifact.path)),
  ];

  for (const artifact of orderedArtifacts) {
    try {
      return {
        content: readFileSync(artifact.path, 'utf8'),
        path: artifact.path,
      };
    } catch {
      continue;
    }
  }

  for (const artifact of artifacts) {
    const content = artifact.metadata?.['content'];
    if (typeof content === 'string' && content.trim() !== '') {
      return {
        content,
        path: artifact.path,
      };
    }
  }

  return null;
}

export function extractH2Sections(content: string): H2Section[] {
  const headings: Array<{ title: string; line: number; index: number }> = [];

  for (const match of content.matchAll(H2_PATTERN)) {
    const title = match[1]?.trim();
    if (!title) {
      continue;
    }
    headings.push({
      title,
      line: lineAt(content, match.index ?? 0),
      index: match.index ?? 0,
    });
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const endIndex = next?.index ?? content.length;
    return {
      title: heading.title,
      line: heading.line,
      endLine: next ? next.line - 1 : content.split('\n').length,
      content: content.slice(heading.index, endIndex).trim(),
    };
  });
}

export function extractFrSections(content: string): FrSection[] {
  const headings: Array<{ id: string; title: string; line: number; index: number }> = [];

  for (const match of content.matchAll(FR_HEADING_PATTERN)) {
    const id = match[1]?.trim();
    if (!id) {
      continue;
    }
    headings.push({
      id,
      title: match[2]?.trim() ?? '',
      line: lineAt(content, match.index ?? 0),
      index: match.index ?? 0,
    });
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const endIndex = next?.index ?? content.length;
    return {
      id: heading.id,
      title: heading.title,
      line: heading.line,
      endLine: next ? next.line - 1 : content.split('\n').length,
      content: content.slice(heading.index, endIndex).trim(),
    };
  });
}

export function numberedLines(content: string): string {
  return content.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n');
}

export function sectionsForPrompt(sections: H2Section[]): string {
  return sections.map((section) => {
    return `<h2 line="${section.line}" endLine="${section.endLine}" title="${escapeXml(section.title)}">\n${section.content}\n</h2>`;
  }).join('\n\n');
}

export function frSectionsForPrompt(frSections: FrSection[]): string {
  return frSections.map((fr) => {
    return `<fr id="${escapeXml(fr.id)}" line="${fr.line}" endLine="${fr.endLine}" title="${escapeXml(fr.title)}">\n${fr.content}\n</fr>`;
  }).join('\n\n');
}

function loadLlmConfig(options?: SemanticRuleOptions): LLMProviderConfig {
  if (options?.llmConfig) {
    return { ...options.llmConfig, model: options.model ?? options.llmConfig.model ?? 'gpt-5.5' };
  }

  const model = options?.model ?? 'gpt-5.5';
  const explicit: LLMProviderConfig = { model };
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL) {
    return explicit;
  }

  // NFR-5.18: 不再硬编码 `/root/.openclaw/openclaw.json`。ENV > findUpward > 返回 explicit。
  const configPath = resolveOpenclawConfigPath();
  if (!configPath || !existsSync(configPath)) {
    return explicit;
  }

  try {
    const json = JSON.parse(readFileSync(configPath, 'utf8')) as {
      models?: { providers?: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id?: string } | string> }> };
    };
    const providers = json.models?.providers ?? {};
    const matchingProvider = Object.values(providers).find((provider) => {
      return provider.models?.some((entry) => typeof entry === 'string' ? entry === model : entry.id === model);
    });
    if (matchingProvider?.baseUrl && matchingProvider.apiKey) {
      return { baseUrl: matchingProvider.baseUrl, apiKey: matchingProvider.apiKey, model };
    }
  } catch {
    // Fall through to environment/default provider behavior.
  }

  return explicit;
}

function parseJsonObject(text: string): unknown {
  return JSON.parse(text);
}

function formatReason(reason: SemanticRuleReason): string {
  return `${reason.type} at line ${reason.line}: ${reason.detail}`;
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function isPreferredSpecPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const baseName = path.basename(normalized);
  return baseName.includes('product-requirements') || baseName.includes('requirements');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
