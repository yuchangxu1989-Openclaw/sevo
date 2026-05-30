import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import { CodeMapGenerator } from './code-map-generator.js';
import { parseSpecMarkdown, safeJsonParse, writeJson } from './utils.js';

export interface ScanMappingEntry {
  files: string[];
  confidence: number;
  rationale: string;
}

export interface ScanMappingConfig {
  version: 1;
  generatedAt: string;
  generatedBy: string;
  frFileMap: Record<string, ScanMappingEntry>;
}

interface RawScanMappingEntry {
  files?: unknown;
  confidence?: unknown;
  rationale?: unknown;
}

const SCAN_MAPPING_FILENAME = 'sevo.scan.json';

export class ScanMappingLoader {
  load(projectRoot: string, fallbackMap?: Record<string, string[]>): Record<string, string[]> {
    const configPath = path.join(projectRoot, SCAN_MAPPING_FILENAME);
    const loaded = this.loadFromFile(configPath);
    if (loaded) return loaded;
    return fallbackMap ? { ...fallbackMap } : {};
  }

  validate(config: unknown): config is ScanMappingConfig {
    if (!config || typeof config !== 'object') return false;
    const candidate = config as Partial<ScanMappingConfig>;
    if (candidate.version !== 1) return false;
    if (typeof candidate.generatedAt !== 'string') return false;
    if (typeof candidate.generatedBy !== 'string') return false;
    if (!candidate.frFileMap || typeof candidate.frFileMap !== 'object' || Array.isArray(candidate.frFileMap)) return false;

    return Object.values(candidate.frFileMap).every((entry) => {
      const raw = entry as RawScanMappingEntry;
      return Boolean(
        raw
          && typeof raw === 'object'
          && Array.isArray(raw.files)
          && raw.files.every((file) => typeof file === 'string' && file.trim().length > 0)
          && typeof raw.confidence === 'number'
          && Number.isFinite(raw.confidence)
          && raw.confidence >= 0
          && raw.confidence <= 1
          && typeof raw.rationale === 'string',
      );
    });
  }

  private loadFromFile(configPath: string): Record<string, string[]> | null {
    if (!fs.existsSync(configPath)) return null;

    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown;
      if (!this.validate(parsed)) return null;
      return this.toSimpleMap(parsed);
    } catch {
      return null;
    }
  }

  private toSimpleMap(config: ScanMappingConfig): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(config.frFileMap).map(([frId, entry]) => [frId, [...entry.files]]),
    );
  }
}

export class ScanMappingGenerator {
  async generate(opts: { specPath: string; codeMap: string; adapter: SevoHostAdapter }): Promise<ScanMappingConfig> {
    const frs = parseSpecMarkdown(opts.specPath).map((fr) => ({
      frId: fr.frId,
      title: fr.title,
      description: fr.description,
      acceptanceCriteria: fr.acceptanceCriteria.map((ac) => ac.text),
    }));

    const response = await opts.adapter.callLlm([
      { role: 'system', content: SCAN_MAPPING_SYSTEM_PROMPT },
      { role: 'user', content: `## Functional Requirements\n${JSON.stringify(frs, null, 2)}\n\n## Code Map\n${opts.codeMap}` },
    ]);

    const parsed = safeJsonParse<Partial<ScanMappingConfig>>(response, {});
    const config: ScanMappingConfig = {
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: 'sevo scan --generate-map',
      frFileMap: this.normalizeFrFileMap(parsed.frFileMap),
    };

    return config;
  }

  generateCodeMap(projectRoot: string, scanDirs = ['.']): string {
    const generator = new CodeMapGenerator();
    return generator.renderText(generator.generate({ projectRoot, scanDirs }));
  }

  write(projectRoot: string, config: ScanMappingConfig): string {
    const outputPath = path.join(projectRoot, SCAN_MAPPING_FILENAME);
    writeJson(outputPath, config);
    return outputPath;
  }

  private normalizeFrFileMap(input: unknown): Record<string, ScanMappingEntry> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

    const normalized: Record<string, ScanMappingEntry> = {};
    for (const [frId, value] of Object.entries(input as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const entry = value as RawScanMappingEntry;
      if (!Array.isArray(entry.files)) continue;
      const files = entry.files.filter((file): file is string => typeof file === 'string' && file.trim().length > 0);
      if (files.length === 0) continue;
      const confidence = typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : 0.5;
      normalized[frId] = {
        files,
        confidence,
        rationale: typeof entry.rationale === 'string' ? entry.rationale : '',
      };
    }
    return normalized;
  }
}

const SCAN_MAPPING_SYSTEM_PROMPT = `You map functional requirements to implementation files.
Return only JSON with this shape:
{
  "frFileMap": {
    "FR-13": { "files": ["src/pipeline/pipeline-engine.ts"], "confidence": 0.95, "rationale": "short reason" }
  }
}
Rules:
- Use paths exactly as shown in the code map.
- Map each FR to the smallest set of files likely to implement it.
- Do not invent files.
- confidence must be a number between 0 and 1.`;
