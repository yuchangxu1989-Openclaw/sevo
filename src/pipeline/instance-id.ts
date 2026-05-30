/**
 * Instance ID generator (spec §3.5, AC-4.56).
 *
 * Format: fr-<project-slug>-<yyyyMMdd>-<seq>
 * Example: fr-sevo-20260420-001
 *
 * The sequence number is derived from existing instances for the same
 * project+date combination, ensuring uniqueness within a single day.
 */

import type { PipelineInstance } from '../types/index.js';

/**
 * Generate a Pipeline Instance ID.
 *
 * @param projectSlug - The project slug (e.g. "sevo").
 * @param existingInstances - All known instances for conflict-free seq.
 * @param now - Optional date override for testing.
 */
export function generateInstanceId(
  projectSlug: string,
  existingInstances: ReadonlyArray<Pick<PipelineInstance, 'instanceId'>>,
  now: Date = new Date(),
): string {
  const dateStr = formatDate(now);
  const prefix = `fr-${projectSlug}-${dateStr}-`;

  // Find the highest existing seq for this prefix
  let maxSeq = 0;
  for (const inst of existingInstances) {
    if (inst.instanceId.startsWith(prefix)) {
      const seqPart = inst.instanceId.slice(prefix.length);
      const parsed = parseInt(seqPart, 10);
      if (!isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  const seq = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/** Validate that an instance ID matches the spec format. */
export function isValidInstanceId(id: string): boolean {
  return /^fr-[a-z0-9-]+-\d{8}-\d{3,}$/.test(id);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
