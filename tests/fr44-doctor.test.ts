import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runDoctor,
  evaluateDimension,
  stageHandlerCompletenessScan,
  readmeFreshnessScan,
  computeDelta,
  formatSummary,
  DOCTOR_LAYERS,
  collectProjectEvidence,
} from '../doctor.js';

const REQUIRED_FIELDS = [
  'ruleId', 'layer', 'dimension', 'projectSlug', 'severity', 'status',
  'evidence', 'rootCause', 'recommendation', 'ownerSystem', 'fixTrigger', 'autoFixEligible',
];

function makeProject(root, slug, { specBody = '# Demo\n\n### FR-1\n- AC-1.1\n' } = {}) {
  const projDir = path.join(root, 'projects', slug);
  fs.mkdirSync(path.join(projDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(projDir, 'docs', 'product-requirements.md'), specBody);
  fs.writeFileSync(path.join(projDir, 'src', 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(projDir, 'dist', 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(projDir, 'sevo.json'), JSON.stringify({ managed: true, slug, sourceRoots: ['src'] }));
  return { slug, sourceRoots: ['src'], projectPath: `projects/${slug}` };
}

// Mock LLM: SPEC-REF-001 -> fail/blocking, everything else -> pass.
function mockLlm(failRule = 'SPEC-REF-001') {
  return async (systemPrompt) => {
    const rules = systemPrompt.match(/本维度涉及的 rule：([^\n]+)/)[1].split(',').map(s => s.trim());
    const findings = rules.map(rid => ({
      ruleId: rid,
      status: rid === failRule ? 'fail' : 'pass',
      severity: rid === failRule ? 'blocking' : 'info',
      summary: rid === failRule ? '引用断裂' : 'ok',
      evidence: ['demo'],
      rootCause: rid === failRule ? '缺引用' : 'none',
      recommendation: rid === failRule ? '补引用' : 'none',
    }));
    return '```json\n' + JSON.stringify({ findings }) + '\n```';
  };
}

describe('FR-44 doctor — four-layer framework', () => {
  let tmp, ws, stateDir, eventsPath, project;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-doctor-'));
    ws = path.join(tmp, 'ws');
    stateDir = path.join(tmp, 'state');
    eventsPath = path.join(ws, 'logs', 'ev.jsonl');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.writeFileSync(eventsPath, '{"type":"create"}\n{"type":"dispatch"}\n');
    project = makeProject(ws, 'demo');
  });

  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  const ctx = (over = {}) => ({
    projects: [project], scope: 'all', workspaceRoot: ws, stateDir, eventsPath,
    llmCall: mockLlm(), timeBudgetMs: 30000, ...over,
  });

  // AC-44.2..44.6: fixed 4 layers + dimension coverage counts
  it('defines 4 layers with the spec-mandated dimension counts', () => {
    const ids = DOCTOR_LAYERS.map(l => l.id);
    expect(ids).toEqual(['spec', 'implementation', 'runtime', 'delivery']);
    const byId = Object.fromEntries(DOCTOR_LAYERS.map(l => [l.id, l.dimensions.length]));
    expect(byId.spec).toBeGreaterThanOrEqual(4);
    expect(byId.implementation).toBeGreaterThanOrEqual(5);
    expect(byId.runtime).toBeGreaterThanOrEqual(4);
    expect(byId.delivery).toBeGreaterThanOrEqual(2);
  });

  // AC-44.8: unified finding schema
  it('emits findings with all required schema fields', async () => {
    const { report } = await runDoctor(ctx());
    const allRules = DOCTOR_LAYERS.flatMap(l => l.dimensions.flatMap(d => d.rules));
    expect(report.findings.length).toBe(allRules.length);
    for (const f of report.findings) {
      for (const field of REQUIRED_FIELDS) expect(f, `missing ${field}`).toHaveProperty(field);
      expect(['blocking', 'error', 'warning', 'info']).toContain(f.severity);
      expect(['pass', 'warn', 'fail', 'skip']).toContain(f.status);
    }
  });

  // AC-44.2: per-layer + project rollup status
  it('rolls up blocking failure to layer and project status', async () => {
    const { report } = await runDoctor(ctx());
    expect(report.projects[0].status).toBe('fail');
    expect(report.projects[0].layers.spec).toBe('fail');
    expect(report.projects[0].layers.implementation).toBe('pass');
    expect(report.projects[0].counts.blocking).toBeGreaterThanOrEqual(1);
  });

  // AC-44.11 (detection side): blocking -> fix recommendation, spec-gap flagged
  it('produces blocking fix recommendations with spec-gap flag', async () => {
    const { report } = await runDoctor(ctx());
    expect(report.fixRecommendations.length).toBeGreaterThanOrEqual(1);
    const rec = report.fixRecommendations[0];
    expect(rec.fixTrigger).toBe('sevo:fix');
    expect(rec.specGap).toBe(true);
  });

  // output persistence
  it('persists a report under state/doctor-reports', async () => {
    const { report } = await runDoctor(ctx());
    expect(report.reportPath).toBeTruthy();
    expect(fs.existsSync(path.join(stateDir, 'doctor-reports'))).toBe(true);
  });

  // AC-44.10: delta vs previous report
  it('computes delta: new on first run, persistent on second', async () => {
    const first = await runDoctor(ctx());
    expect(first.report.delta.new.length).toBeGreaterThanOrEqual(1);
    const second = await runDoctor(ctx());
    expect(second.report.delta.new.length).toBe(0);
    expect(second.report.delta.persistent.length).toBeGreaterThanOrEqual(1);
  });

  it('reports severityChanged when a finding changes severity', () => {
    const prev = { findings: [{ ruleId: 'X-1', projectSlug: 'demo', layer: 'spec', severity: 'warning', status: 'warn', summary: 's' }] };
    const cur = [{ ruleId: 'X-1', projectSlug: 'demo', layer: 'spec', severity: 'blocking', status: 'fail', summary: 's' }];
    const d = computeDelta(prev, cur);
    expect(d.severityChanged).toHaveLength(1);
    expect(d.severityChanged[0]).toMatchObject({ from: 'warning', to: 'blocking' });
  });

  // AC-44.14 graceful degrade: LLM unavailable -> skip, never crash
  it('degrades to skip (no crash) when LLM is unavailable', async () => {
    const { report } = await runDoctor(ctx({ llmCall: null }));
    expect(report.findings.every(f => f.status === 'skip')).toBe(true);
    expect(report.projects[0].status).toBe('warn');
  });

  it('degrades to skip when LLM returns unparseable output', async () => {
    const badLlm = async () => 'not json at all';
    const layer = DOCTOR_LAYERS[0];
    const dim = layer.dimensions[0];
    const ev = collectProjectEvidence(project, { workspaceRoot: ws, eventsPath });
    const findings = await evaluateDimension(layer, dim, ev, { slug: 'demo', llmCall: badLlm });
    expect(findings.every(f => f.status === 'skip')).toBe(true);
  });

  // AC-44.12: single-project scope
  it('supports single-project scope', async () => {
    const { report } = await runDoctor(ctx({ scope: 'single-project' }));
    expect(report.scope).toBe('single-project');
    expect(report.projects).toHaveLength(1);
  });


  it('mechanically fails when canonical stages lack handler registrations', () => {
    fs.mkdirSync(path.join(ws, 'projects', 'demo', 'src', 'engine'), { recursive: true });
    fs.mkdirSync(path.join(ws, 'projects', 'demo', 'src', 'stage-handlers'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects', 'demo', 'src', 'engine', 'pipeline-engine.ts'), `export const CANONICAL_14_STAGES = ['spec', 'verify'];\n`);
    fs.writeFileSync(path.join(ws, 'projects', 'demo', 'src', 'stage-handlers', 'index.ts'), `export const STAGE_HANDLER_TO_STAGE_ID = { specify: 'spec' };\n`);
    const findings = stageHandlerCompletenessScan(project, { workspaceRoot: ws });
    expect(findings[0]).toMatchObject({ ruleId: 'IMPL-STAGE-HANDLER-001', status: 'fail', severity: 'error' });
    expect(findings[0].evidence[0].missingStages).toEqual(['verify']);
  });

  it('warns when README is older than src by more than seven days', () => {
    const projDir = path.join(ws, 'projects', 'demo');
    fs.writeFileSync(path.join(projDir, 'README.md'), '# Demo\n');
    fs.writeFileSync(path.join(projDir, 'src', 'fresh.js'), 'export const fresh = true;');
    const old = new Date('2026-01-01T00:00:00Z');
    const fresh = new Date('2026-01-20T00:00:00Z');
    fs.utimesSync(path.join(projDir, 'README.md'), old, old);
    fs.utimesSync(path.join(projDir, 'src', 'fresh.js'), fresh, fresh);
    const findings = readmeFreshnessScan(project, { workspaceRoot: ws });
    expect(findings.some(f => f.ruleId === 'DELIVERY-README-002' && f.status === 'warn')).toBe(true);
  });

  it('formats a human-readable summary', async () => {
    const { summaryText } = await runDoctor(ctx());
    expect(summaryText).toContain('四层健康诊断');
    expect(summaryText).toContain('demo');
    expect(summaryText).toContain('Delta');
  });
});
