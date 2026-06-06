import { describe, it, expect } from 'vitest';
import {
  getCockpitProjects,
  getCockpitPipelines,
  getCockpitProjectDetail,
  getCockpitPipelineDetail,
} from '../lib/engine-service';

const LIFECYCLE = ['active', 'stale', 'archived', 'completed', 'failed'];

describe('cockpit projections (FR-45a smoke)', () => {
  it('AC-45a.1 project list carries name + active count + last advanced', () => {
    const projects = getCockpitProjects();
    expect(Array.isArray(projects)).toBe(true);
    for (const p of projects) {
      expect(typeof p.projectName).toBe('string');
      expect(typeof p.activePipelineCount).toBe('number');
      // lastAdvancedAt is real-or-null, never a fabricated placeholder.
      expect(p.lastAdvancedAt === null || typeof p.lastAdvancedAt === 'string').toBe(true);
    }
  });

  it('AC-45a.3 pipeline list uses only real lifecycle statuses', () => {
    const pipelines = getCockpitPipelines();
    expect(Array.isArray(pipelines)).toBe(true);
    for (const p of pipelines) {
      expect(LIFECYCLE).toContain(p.status);
      expect(typeof p.currentStagePhrase).toBe('string');
      expect(typeof p.createdAt).toBe('string');
    }
  });

  it('AC-45a.4/45a.5 pipeline detail has timeline + blocker, real empty time fields', () => {
    const pipelines = getCockpitPipelines();
    if (pipelines.length === 0) return; // empty runtime is acceptable shape
    const detail = getCockpitPipelineDetail(pipelines[0]!.pipelineId);
    expect(detail).not.toBeNull();
    expect(Array.isArray(detail!.timeline)).toBe(true);
    for (const stage of detail!.timeline) {
      // null empty-state, never fabricated time
      expect(stage.startedAt === null || typeof stage.startedAt === 'string').toBe(true);
      expect(stage.completedAt === null || typeof stage.completedAt === 'string').toBe(true);
      expect(typeof stage.statusPhrase).toBe('string');
    }
    // blocker present: either blocked with reason, or explicit no-block
    expect(typeof detail!.blocker.blocked).toBe('boolean');
    if (!detail!.blocker.blocked) {
      expect(detail!.blocker.reason).toBeNull();
    }
  });

  it('AC-45a.2 project detail surfaces all pipelines + coverage shape', () => {
    const projects = getCockpitProjects();
    if (projects.length === 0) return;
    const detail = getCockpitProjectDetail(projects[0]!.projectSlug);
    expect(detail).not.toBeNull();
    expect(Array.isArray(detail!.pipelines)).toBe(true);
    // coverage is real-or-null, never invented
    expect(detail!.frCoverage === null || typeof detail!.frCoverage.total === 'number').toBe(true);
  });
});
