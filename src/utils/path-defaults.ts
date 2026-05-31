import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * NFR-5.18 / NFR-5.19 / ADR-016 路径默认值守门工具。
 *
 * 这里集中处理 openclaw.json 的路径解析，让所有调用方只走 ENV > 工件根 > findUpward
 * 三步，不再各自硬编码维护者机器上的 openclaw.json。
 */

/** 引用宿主能力的 env 名（沿用宿主既有命名）。 */
export const OPENCLAW_CONFIG_ENV_PRIMARY = 'OPENCLAW_CONFIG_PATH';
export const OPENCLAW_CONFIG_ENV_LEGACY = 'OPENCLAW_CONFIG';

/** SEVO 自有 env 名（NFR-5.19，统一 SEVO_ 前缀）。 */
export const SEVO_PROJECTS_DIR_ENV = 'SEVO_PROJECTS_DIR';
export const SEVO_WORKSPACE_ROOT_ENV = 'SEVO_WORKSPACE_ROOT';

/** 默认 openclaw.json 文件名。 */
const OPENCLAW_CONFIG_FILE = 'openclaw.json';

export interface ResolveOpenclawConfigOptions {
  /** 项目根；优先在 `<projectRoot>/.openclaw/openclaw.json` 寻址。 */
  projectRoot?: string;
  /** 工作区根；优先在 `<workspaceRoot>/openclaw.json` 寻址。 */
  workspaceRoot?: string;
  /** 起点目录，默认 `process.cwd()`，从这里向上 findUpward。 */
  startDir?: string;
  /** findUpward 的最大向上层数（防退化），默认 8。 */
  maxDepth?: number;
}

/**
 * 解析 openclaw.json 的实际路径。
 *
 * 顺序：
 *   1. `process.env.OPENCLAW_CONFIG_PATH` / `OPENCLAW_CONFIG`
 *   2. `<projectRoot>/.openclaw/openclaw.json`（若提供）
 *   3. `<workspaceRoot>/openclaw.json`（若提供）
 *   4. 从 `startDir` 向上 findUpward 寻找 `openclaw.json`
 *
 * 找不到返回 `null`，由调用方决定是否抛错或降级——禁止默认回退到宿主特定字面路径。
 */
export function resolveOpenclawConfigPath(
  options: ResolveOpenclawConfigOptions = {},
): string | null {
  const envOverride =
    process.env[OPENCLAW_CONFIG_ENV_PRIMARY] ?? process.env[OPENCLAW_CONFIG_ENV_LEGACY];
  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }

  if (options.projectRoot) {
    const projectScoped = path.join(options.projectRoot, '.openclaw', OPENCLAW_CONFIG_FILE);
    if (existsSync(projectScoped)) {
      return projectScoped;
    }
  }

  if (options.workspaceRoot) {
    const workspaceScoped = path.join(options.workspaceRoot, OPENCLAW_CONFIG_FILE);
    if (existsSync(workspaceScoped)) {
      return workspaceScoped;
    }
  }

  const startDir = options.startDir ?? process.cwd();
  const found = findUpward(startDir, OPENCLAW_CONFIG_FILE, options.maxDepth ?? 8);
  if (found) return found;

  return null;
}

/**
 * 加载 openclaw.json 内容；找不到 / 解析失败返回 null。
 * 调用方负责对返回值做强校验（比如 `agents.list`、`models.providers`）。
 */
export function loadOpenclawConfig(
  options: ResolveOpenclawConfigOptions = {},
): { path: string; config: Record<string, unknown> } | null {
  const resolved = resolveOpenclawConfigPath(options);
  if (!resolved || !existsSync(resolved)) return null;
  try {
    const raw = readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { path: resolved, config: parsed as Record<string, unknown> };
    }
  } catch {
    // ignore — caller decides how to handle missing/malformed config
  }
  return null;
}

/**
 * SEVO 项目目录（FR/项目工件根）。
 * 顺序：env `SEVO_PROJECTS_DIR` > `<workspaceRoot>/projects` > `<cwd>/projects`。
 * 永远返回一个绝对路径，但绝不内含宿主特定字面量。
 */
export function resolveProjectsDir(workspaceRoot?: string): string {
  const envValue = process.env[SEVO_PROJECTS_DIR_ENV];
  if (envValue && envValue.length > 0) {
    return path.isAbsolute(envValue) ? envValue : path.resolve(process.cwd(), envValue);
  }
  if (workspaceRoot && workspaceRoot.length > 0) {
    return path.join(workspaceRoot, 'projects');
  }
  return path.join(process.cwd(), 'projects');
}

/**
 * SEVO 工作区根。
 * 顺序：env `SEVO_WORKSPACE_ROOT` > 调用方提供 > findUpward 找 `openclaw.json` 的目录 > `process.cwd()`。
 */
export function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  const envValue = process.env[SEVO_WORKSPACE_ROOT_ENV];
  if (envValue && envValue.length > 0) {
    return path.isAbsolute(envValue) ? envValue : path.resolve(process.cwd(), envValue);
  }
  const found = findUpward(process.cwd(), OPENCLAW_CONFIG_FILE, 8);
  if (found) return path.dirname(found);
  return process.cwd();
}

/** 简单的 findUpward：从 `startDir` 向上找 `filename`，找到即返回绝对路径。 */
export function findUpward(startDir: string, filename: string, maxDepth = 8): string | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < maxDepth; depth++) {
    const candidate = path.join(current, filename);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
