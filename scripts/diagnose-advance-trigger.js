#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import sevoPlugin from '../index.js';

const pluginRoot = path.resolve(new URL('..', import.meta.url).pathname);
const stateDir = path.join(pluginRoot, 'state');
const activePipelinesPath = path.join(stateDir, 'active-pipelines.json');
const dedupePath = path.join(stateDir, 'completion-dedupe.json');
const pipelineId = `diagnostic-${Date.now()}`;
const projectSlug = `diagnostic-project-${Date.now()}`;

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function restoreFile(filePath, content) {
  if (content == null) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readEvents(eventsPath) {
  return fs.readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

const activeBackup = readIfExists(activePipelinesPath);
const dedupeBackup = readIfExists(dedupePath);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-advance-trigger-'));
const tempData = path.join(tempRoot, 'data');
const tempEvents = path.join(tempRoot, 'sevo-events.jsonl');

try {
  fs.mkdirSync(path.join(tempRoot, 'projects', projectSlug), { recursive: true });
  fs.mkdirSync(path.join(tempData, 'pipelines', pipelineId), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const active = readJson(activePipelinesPath, { pipelines: {} });
  active.pipelines = active.pipelines || {};
  active.pipelines[pipelineId] = {
    projectSlug,
    projectRoot: `projects/${projectSlug}`,
    currentStage: 'implement',
    requiredStages: ['implement', 'review'],
    orderedStages: ['implement', 'review'],
  };
  fs.writeFileSync(activePipelinesPath, JSON.stringify(active, null, 2), 'utf8');
  fs.writeFileSync(dedupePath, JSON.stringify({ completions: {} }, null, 2), 'utf8');

  const engineState = {
    pipelineId,
    taskId: 'diagnostic-advance-trigger',
    level: 'full',
    requiredStages: ['implement', 'review'],
    skippedStages: [],
    stages: {
      implement: { stageId: 'implement', status: 'active', artifacts: [] },
      review: { stageId: 'review', status: 'pending', artifacts: [] },
    },
    currentStage: 'implement',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(tempData, 'pipelines', pipelineId, 'state.json'),
    JSON.stringify(engineState, null, 2),
    'utf8',
  );

  const handlers = new Map();
  sevoPlugin.register({
    config: {
      workspaceRoot: tempRoot,
      eventsPath: tempEvents,
      sevoDataPath: tempData,
      projectRoot: pluginRoot,
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    on: (name, handler) => {
      if (!handlers.has(name)) handlers.set(name, handler);
    },
  });

  const handler = handlers.get('subagent_ended');
  if (!handler) throw new Error('subagent_ended handler was not registered');

  await handler({
    label: `sevo:implement ${projectSlug} natural-label completion`,
    status: 'succeeded',
    sessionId: `session-${pipelineId}`,
    agentId: 'codex',
    result: 'Implementation completed. Tests passed.',
    output: `Implementation completed. Tests passed. Changed files: projects/${projectSlug}/src/example.ts`,
  });

  const events = readEvents(tempEvents);
  const completion = events.find(event => event.type === 'sevo_completion_received' && event.pipelineId === pipelineId);
  const autoReview = events.find(event => event.type === 'sevo_auto_review_advance_prompt_queued' && event.pipelineId === pipelineId);

  if (!completion || !autoReview) {
    console.error(JSON.stringify({ completion: Boolean(completion), autoReview: Boolean(autoReview), events }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      ok: true,
      pipelineId,
      completionType: completion.type,
      completionStage: completion.stageId,
      autoReviewType: autoReview.type,
      autoReviewStage: autoReview.stageId,
      label: completion.label,
    }, null, 2));
  }
} finally {
  restoreFile(activePipelinesPath, activeBackup);
  restoreFile(dedupePath, dedupeBackup);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

process.exit(process.exitCode || 0);
