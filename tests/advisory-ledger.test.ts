import { describe, it, expect, beforeEach } from 'vitest';
import { append, resolve, listOpen } from '../src/advisory-ledger.js';

function makeMockRunStore() {
  const runs = {};
  return {
    createRun(id) {
      runs[id] = { pipelineRunId: id, openAdvisories: [] };
      return runs[id];
    },
    getRun(id) {
      return runs[id] || null;
    },
    patchRun(id, patch) {
      const run = runs[id];
      if (!run) throw new Error(`run not found: ${id}`);
      Object.assign(run, patch);
      return run;
    },
  };
}

describe('advisory-ledger', () => {
  let runStore;
  let deps;
  const RUN_ID = 'test-run-001';

  beforeEach(() => {
    runStore = makeMockRunStore();
    runStore.createRun(RUN_ID);
    deps = { runStore };
  });

  describe('append', () => {
    it('adds an advisory to the run state', () => {
      const result = append(RUN_ID, {
        stageId: 'implement',
        type: 'entry-skip',
        severity: 'warn',
        message: 'protected stage not completed',
        evidence: ['cmdFrom check'],
      }, deps);

      expect(result.id).toBeDefined();
      const run = runStore.getRun(RUN_ID);
      expect(run.openAdvisories).toHaveLength(1);
      expect(run.openAdvisories[0].stageId).toBe('implement');
      expect(run.openAdvisories[0].resolvedAt).toBeNull();
    });

    it('appends multiple advisories without overwriting', () => {
      append(RUN_ID, { stageId: 'review', type: 'a', severity: 'info', message: 'first' }, deps);
      append(RUN_ID, { stageId: 'fix', type: 'b', severity: 'warn', message: 'second' }, deps);

      const run = runStore.getRun(RUN_ID);
      expect(run.openAdvisories).toHaveLength(2);
      expect(run.openAdvisories[0].message).toBe('first');
      expect(run.openAdvisories[1].message).toBe('second');
    });

    it('throws for unknown run', () => {
      expect(() => append('no-such-run', { stageId: 'x', type: 'y', severity: 'info', message: 'z' }, deps))
        .toThrow('run not found');
    });

    it('defaults severity to info and evidence to empty array', () => {
      append(RUN_ID, { stageId: 'spec', type: 'test', message: 'minimal' }, deps);
      const run = runStore.getRun(RUN_ID);
      expect(run.openAdvisories[0].severity).toBe('info');
      expect(run.openAdvisories[0].evidence).toEqual([]);
    });
  });

  describe('resolve', () => {
    it('marks an advisory as resolved with timestamp and resolution text', () => {
      const { id } = append(RUN_ID, { stageId: 'review', type: 'gap', severity: 'warn', message: 'needs review' }, deps);
      resolve(RUN_ID, id, 'reviewed and accepted', deps);

      const run = runStore.getRun(RUN_ID);
      const advisory = run.openAdvisories.find((a) => a.id === id);
      expect(advisory.resolvedAt).not.toBeNull();
      expect(advisory.resolution).toBe('reviewed and accepted');
    });

    it('does not affect other advisories', () => {
      const { id: id1 } = append(RUN_ID, { stageId: 'a', type: 'x', severity: 'info', message: 'one' }, deps);
      append(RUN_ID, { stageId: 'b', type: 'y', severity: 'warn', message: 'two' }, deps);
      resolve(RUN_ID, id1, 'done', deps);

      const run = runStore.getRun(RUN_ID);
      expect(run.openAdvisories[0].resolvedAt).not.toBeNull();
      expect(run.openAdvisories[1].resolvedAt).toBeNull();
    });
  });

  describe('listOpen', () => {
    it('returns only unresolved advisories', () => {
      const { id } = append(RUN_ID, { stageId: 'a', type: 'x', severity: 'info', message: 'one' }, deps);
      append(RUN_ID, { stageId: 'b', type: 'y', severity: 'warn', message: 'two' }, deps);
      resolve(RUN_ID, id, 'done', deps);

      const open = listOpen(RUN_ID, deps);
      expect(open).toHaveLength(1);
      expect(open[0].message).toBe('two');
    });

    it('returns empty array for unknown run', () => {
      expect(listOpen('no-such-run', deps)).toEqual([]);
    });

    it('returns empty array when all advisories are resolved', () => {
      const { id } = append(RUN_ID, { stageId: 'a', type: 'x', severity: 'info', message: 'one' }, deps);
      resolve(RUN_ID, id, 'done', deps);
      expect(listOpen(RUN_ID, deps)).toEqual([]);
    });
  });
});
