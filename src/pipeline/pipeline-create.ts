/**
 * Pipeline Create — FR-12 entry point.
 *
 * 6-step flow (spec §FR-12):
 *   1. Validate projectSlug
 *   2. Conflict check — reject if same Project has an active instance
 *   3. Generate Instance ID (fr-<slug>-<yyyyMMdd>-<seq>)
 *   4. Route task (level classification + stage planning)
 *   5. Initialize project directory structure (§3.6)
 *   6. Create Pipeline Instance record (status = created)
 */

import type {
  PipelineCreateRequest,
  PipelineCreateError,
  PipelineInstance,
  PipelineInstanceStatus,
  EndStateGoal,
  Result,
} from '../types/index.js';
import { route } from '../router/router.js';
import { generateInstanceId } from './instance-id.js';
import { initProjectDirectory } from './directory-init.js';

// ── Instance Store (port) ───────────────────────────────────────

/** Minimal store interface for Pipeline Create to query/persist instances. */
export interface InstanceStore {
  /** Return all instances for a given project slug. */
  listByProject(projectSlug: string): PipelineInstance[];
  /** Persist a new instance. */
  save(instance: PipelineInstance): void;
}

// ── Validation ──────────────────────────────────────────────────

const PROJECT_SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function isValidProjectSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 64 && PROJECT_SLUG_RE.test(slug);
}

// ── Public API ──────────────────────────────────────────────────

export interface PipelineCreateOptions {
  store: InstanceStore;
  workspaceRoot: string;
  /** Override current date for testing. */
  now?: Date;
}

/**
 * Create a Pipeline Instance (FR-12).
 *
 * Returns `Result<PipelineInstance, PipelineCreateError>`.
 */
export async function createPipelineInstance(
  request: PipelineCreateRequest,
  options: PipelineCreateOptions,
): Promise<Result<PipelineInstance, PipelineCreateError>> {
  const { projectSlug, task } = request;
  const { store, workspaceRoot, now } = options;

  // ── Step 1: Validate projectSlug ──
  if (!isValidProjectSlug(projectSlug)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PROJECT_SLUG',
        message: `Invalid project slug "${projectSlug}". Must be 2-64 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen.`,
      },
    };
  }

  // ── Step 2: Conflict check — single active instance per project (§3.5) ──
  const existing = store.listByProject(projectSlug);
  const activeStatuses: PipelineInstanceStatus[] = ['created', 'active', 'paused'];
  const activeInstance = existing.find((inst) =>
    activeStatuses.includes(inst.status),
  );
  if (activeInstance) {
    return {
      ok: false,
      error: {
        code: 'ACTIVE_INSTANCE_EXISTS',
        message: `Project "${projectSlug}" already has an active Pipeline Instance: ${activeInstance.instanceId}`,
        activeInstanceId: activeInstance.instanceId,
      },
    };
  }

  // ── Step 3: Generate Instance ID ──
  const instanceId = generateInstanceId(projectSlug, existing, now);

  // ── Step 4: Route task ──
  const routingResult = await route(task);
  if (!routingResult.ok) {
    return {
      ok: false,
      error: {
        code: 'ROUTING_FAILED',
        message: `Routing failed: ${routingResult.error.message}`,
      },
    };
  }

  // ── Step 5: Initialize project directory (§3.6) ──
  const directoryStructure = initProjectDirectory(workspaceRoot, projectSlug);

  // ── Step 6: Create Pipeline Instance record ──
  const timestamp = (now ?? new Date()).toISOString();
  const instance: PipelineInstance = {
    instanceId,
    projectSlug,
    status: 'created',
    statusHistory: [{
      from: 'none',
      to: 'created',
      timestamp,
      trigger: 'pipeline-create',
    }],
    routingResult: routingResult.value,
    directoryStructure,
    createdAt: timestamp,
    updatedAt: timestamp,
    // FR-18 AC-18.1: Persist endStateGoal if provided
    ...(request.endStateGoal ? { endStateGoal: request.endStateGoal } : {}),
  };

  store.save(instance);

  return { ok: true, value: instance };
}
