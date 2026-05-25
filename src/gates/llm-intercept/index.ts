import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DecisionResult, InterceptAuditEntry, SevoConfig, SpawnTaskRequest } from './types.js';
import { decide } from './decision-engine.js';
import { logAudit } from './audit-logger.js';
import { resolveOpenclawConfigPath, resolveProjectsDir as resolveSevoProjectsDir } from '../../utils/path-defaults.js';

const INTERCEPT_MESSAGE = '[SEVO 流水线] 检测到研发活动，请使用 sevo:create <project-slug> 启动流水线。';

/** Injected config from plugin init, set via `initialize()`. */
let injectedConfig: SevoConfig | null = null;

/**
 * Allow the Gateway plugin harness to inject config at initialization time.
 * Falls back to reading the config file if not called.
 */
export function initialize(config: SevoConfig): void {
  injectedConfig = config;
}

// NFR-5.18: 不再硬编码宿主路径。返回 null 表示未找到，调用方需优雅降级。
function resolveConfigPath(): string | null {
  return resolveOpenclawConfigPath();
}

// NFR-5.18 / NFR-5.19: env `SEVO_PROJECTS_DIR` > <cwd>/projects。
function resolveProjectsDir(): string {
  return resolveSevoProjectsDir();
}

function uniqueStrings(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

async function discoverManagedProjects(projectsDir = resolveProjectsDir()): Promise<string[]> {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const managed: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      try {
        const sevoConfigPath = join(projectsDir, entry.name, 'sevo.json');
        const raw = await readFile(sevoConfigPath, 'utf-8');
        const json = JSON.parse(raw) as { managed?: unknown; projectName?: unknown; slug?: unknown };

        if (json.managed === true) {
          managed.push(
            typeof json.slug === 'string' && json.slug.trim()
              ? json.slug
              : typeof json.projectName === 'string' && json.projectName.trim()
                ? json.projectName
                : basename(entry.name),
          );
        }
      } catch {
        // Missing or invalid project-level sevo.json — ignore this project.
      }
    }

    return uniqueStrings(managed);
  } catch {
    return [];
  }
}

function getConfiguredManagedProjects(json: Record<string, unknown>): string[] {
  const plugins = json.plugins as { entries?: Record<string, { config?: { managedProjects?: unknown } }> } | undefined;
  const configured = plugins?.entries?.['sevo-pipeline']?.config?.managedProjects;
  return Array.isArray(configured) ? uniqueStrings(configured) : [];
}

async function loadConfig(): Promise<SevoConfig> {
  const configPath = resolveConfigPath();
  let managedProjects = await discoverManagedProjects();
  let llmProvider = injectedConfig?.llmProvider ?? null;

  if (injectedConfig) {
    managedProjects = uniqueStrings([...managedProjects, ...injectedConfig.managedProjects]);
    return { managedProjects, llmProvider };
  }

  if (!configPath) {
    return { managedProjects, llmProvider };
  }

  try {
    const raw = await readFile(configPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;

    const configuredManagedProjects = getConfiguredManagedProjects(json);
    managedProjects = uniqueStrings([...managedProjects, ...configuredManagedProjects]);

    const models = json.models as {
      providers?: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id?: string; type?: string }> }>;
    } | undefined;
    const providers = models?.providers;
    if (providers) {
      const firstProvider = Object.values(providers)[0];
      if (firstProvider?.baseUrl && firstProvider?.apiKey) {
        const chatModel = firstProvider.models?.find(m => m.type === 'chat');
        const modelId = chatModel?.id ?? firstProvider.models?.[0]?.id ?? 'gpt-4o-mini';
        llmProvider = {
          baseUrl: firstProvider.baseUrl,
          apiKey: firstProvider.apiKey,
          model: modelId,
        };
      }
    }
  } catch {
    // Config file not found or invalid — use defaults
  }

  return { managedProjects, llmProvider };
}

export async function handleSpawnTask(request: SpawnTaskRequest): Promise<{
  allowed: boolean;
  message?: string;
}> {
  const startTime = Date.now();
  const config = await loadConfig();
  const result: DecisionResult = await decide(request, config);
  const durationMs = Date.now() - startTime;

  const entry: InterceptAuditEntry = {
    timestamp: new Date().toISOString(),
    label: request.label ?? '',
    taskTextPreview: request.taskText.slice(0, 200),
    decision: result.decision,
    source: result.step,
    reasoning: result.reason,
    llmLatencyMs: result.step === 'llm' ? durationMs : 0,
  };

  logAudit(entry).catch(() => {});

  if (result.decision === 'pass') {
    return { allowed: true };
  }

  return { allowed: false, message: INTERCEPT_MESSAGE };
}

export async function scanProject(slug: string): Promise<{
  passed: boolean;
  testTask: string;
  llmDecision: string;
  reason: string;
}> {
  const testTask = `为项目 ${slug} 编写架构设计文档`;
  const config = await loadConfig();

  const result = await decide({ taskText: testTask }, config);

  const passed = result.decision !== 'pass';
  return {
    passed,
    testTask,
    llmDecision: result.decision,
    reason: result.reason,
  };
}
