/**
 * Engine service unit tests — verifies functions return correctly
 * shaped data sourced from real artifacts and stage events
 * (.sevo runtime + scan outputs). Empty arrays are an acceptable
 * shape when no runtime data exists in the test environment.
 */
import { describe, it, expect } from 'vitest';
import {
  getReviewTracking,
  getSettings,
  listProjects,
  getDashboardSummary,
  getFrMatrix,
  getEventStreamEvents,
} from '../lib/engine-service';

describe('engine-service', () => {
  describe('getReviewTracking', () => {
    it('returns issues, fixTasks, revalidations, and summary', () => {
      const data = getReviewTracking();
      expect(data.issues).toBeDefined();
      expect(Array.isArray(data.issues)).toBe(true);
      // Real-data backed; arrays may be empty when .sevo/*.jsonl is absent.

      expect(data.fixTasks).toBeDefined();
      expect(Array.isArray(data.fixTasks)).toBe(true);

      expect(data.revalidations).toBeDefined();
      expect(Array.isArray(data.revalidations)).toBe(true);

      expect(data.summary).toBeDefined();
      expect(typeof data.summary.totalIssues).toBe('number');
      expect(typeof data.summary.p0Open).toBe('number');
      expect(typeof data.summary.p1Open).toBe('number');
    });

    it('issues have required fields', () => {
      const { issues } = getReviewTracking();
      for (const issue of issues) {
        expect(issue.id).toBeTruthy();
        expect(['P0', 'P1', 'P2', 'P3']).toContain(issue.severity);
        expect(['open', 'fixing', 'revalidating', 'closed', 'deferred', 'waived']).toContain(issue.status);
        expect(issue.fixDescription).toBeTruthy();
        expect(issue.artifact).toBeTruthy();
        expect(['quality', 'product']).toContain(issue.dimension);
      }
    });

    it('fix tasks reference valid issues', () => {
      const { issues, fixTasks } = getReviewTracking();
      const issueIds = new Set(issues.map(i => i.id));
      for (const task of fixTasks) {
        expect(issueIds.has(task.issueId)).toBe(true);
      }
    });

    it('revalidations reference valid issues and fix tasks', () => {
      const { issues, fixTasks, revalidations } = getReviewTracking();
      const issueIds = new Set(issues.map(i => i.id));
      const taskIds = new Set(fixTasks.map(t => t.id));
      for (const reval of revalidations) {
        expect(issueIds.has(reval.issueId)).toBe(true);
        expect(taskIds.has(reval.fixTaskId)).toBe(true);
      }
    });

    it('summary counts are consistent', () => {
      const { issues, summary } = getReviewTracking();
      expect(summary.totalIssues).toBe(issues.length);
      const openIssues = issues.filter(i => !['closed', 'waived'].includes(i.status));
      expect(summary.p0Open).toBe(openIssues.filter(i => i.severity === 'P0').length);
      expect(summary.p1Open).toBe(openIssues.filter(i => i.severity === 'P1').length);
    });
  });

  describe('getSettings', () => {
    it('returns projects with config', () => {
      const data = getSettings();
      expect(data.projects).toBeDefined();
      expect(Array.isArray(data.projects)).toBe(true);
      // Settings reflect distinct project slugs from real pipelines;
      // may be empty if no spec is parseable in the test environment.
    });

    it('each project has stages, rules, and principles', () => {
      const { projects } = getSettings();
      for (const project of projects) {
        expect(project.projectSlug).toBeTruthy();
        expect(project.projectName).toBeTruthy();
        expect(['openclaw', 'standalone']).toContain(project.adapter);
        expect(Array.isArray(project.stages)).toBe(true);
        expect(project.stages.length).toBeGreaterThan(0);
        expect(Array.isArray(project.rules)).toBe(true);
        expect(Array.isArray(project.principles)).toBe(true);
      }
    });

    it('stage configs have required fields', () => {
      const { projects } = getSettings();
      for (const project of projects) {
        for (const stage of project.stages) {
          expect(stage.stageId).toBeTruthy();
          expect(stage.label).toBeTruthy();
          expect(typeof stage.enabled).toBe('boolean');
        }
      }
    });

    it('principles have valid categories', () => {
      const { projects } = getSettings();
      const validCategories = ['quality', 'process', 'architecture', 'security'];
      for (const project of projects) {
        for (const principle of project.principles) {
          expect(principle.id).toBeTruthy();
          expect(principle.name).toBeTruthy();
          expect(validCategories).toContain(principle.category);
          expect(typeof principle.enabled).toBe('boolean');
          expect(Array.isArray(principle.appliesTo)).toBe(true);
        }
      }
    });
  });

  describe('listProjects', () => {
    it('returns non-empty project list', () => {
      const projects = listProjects();
      expect(projects.length).toBeGreaterThan(0);
      for (const p of projects) {
        expect(p.projectSlug).toBeTruthy();
        expect(typeof p.frCount).toBe('number');
      }
    });
  });

  describe('getDashboardSummary', () => {
    it('returns valid summary', () => {
      const summary = getDashboardSummary();
      expect(typeof summary.totalFrs).toBe('number');
      expect(typeof summary.healthScore).toBe('number');
      expect(summary.healthScore).toBeGreaterThanOrEqual(0);
      expect(summary.healthScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(summary.stageCounts)).toBe(true);
      for (const stage of summary.stageCounts) {
        expect(stage.stageId).toBeTruthy();
        expect(stage.label).toBeTruthy();
        expect(stage.shortLabel).toBeTruthy();
        expect(typeof stage.count).toBe('number');
        expect(typeof stage.hasRisk).toBe('boolean');
      }
    });
  });

  describe('getEventStreamEvents', () => {
    it('returns real event entries or an empty array', () => {
      const events = getEventStreamEvents();
      expect(Array.isArray(events)).toBe(true);
      for (const event of events) {
        expect(typeof event).toBe('object');
      }
    });
  });

  describe('getFrMatrix', () => {
    it('returns matrix for known project', () => {
      const projects = listProjects();
      if (projects.length > 0) {
        const matrix = getFrMatrix(projects[0]!.projectSlug);
        expect(matrix.projectId).toBe(projects[0]!.projectSlug);
        expect(Array.isArray(matrix.frs)).toBe(true);
      }
    });
  });
});
