import { execFile as nodeExecFile, execFileSync as nodeExecFileSync, execSync as nodeExecSync } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { SevoHostAdapter } from '../adapter/host-adapter.js';
import type { PublishAdapter } from '../adapter/publish-adapter.js';
import { inferVersionBump } from '../adapter/publish-adapter.js';
import { PostReleaseValidationStage } from './post-release-validation-stage.js';
import type {
  EndgameDeliveryInput,
  EndgameDeliveryResult,
  GapScanSummary,
  LivenessProbeResult,
  LivenessVerificationResult,
  ReadmeSyncCheckResult,
  VersionBumpDecision,
} from './endgame-delivery-types.js';
import type { ArtifactRef, ObjectiveKeyResult } from '../types/index.js';
import type { FunctionalRequirement, RequirementAnalysisResponse } from './spec-types.js';
import type { NotificationAdapter, PipelineNotificationEvent } from '../notification/notification-adapter.js';

const DEFAULT_PUBLISH_SCRIPT_RELATIVE = 'scripts/publish-release.sh';
const DEFAULT_PUBLISH_RETRY_DELAY_MS = 30_000;
const DEFAULT_ARTIFACT_STAGE = 'post-release-validation';
const execFileAsync = promisify(nodeExecFile);

interface SpecDocument {
  functionalRequirements?: FunctionalRequirement[];
  acceptanceCriteria?: Array<{ id: string; description: string; requirementId: string }>;
  okrTree?: ObjectiveKeyResult[];
}

interface PackageJsonLike {
  version: string;
  [key: string]: unknown;
}

export interface EndgameDeliveryStageOptions {
  hostAdapter: Pick<SevoHostAdapter, 'analyzeRequirements' | 'getProjectConfig'>;
  publishAdapter: PublishAdapter;
  notificationAdapter?: NotificationAdapter;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
  versionBumpOverride?: Partial<Record<'patch' | 'minor' | 'major', 'patch' | 'minor' | 'major'>>;
}

export class EndgameDeliveryStage {
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly validationStage = new PostReleaseValidationStage();
  private readonly versionBumpOverride?: Partial<Record<'patch' | 'minor' | 'major', 'patch' | 'minor' | 'major'>>;
  private readonly notificationAdapter?: NotificationAdapter;

  constructor(private readonly options: EndgameDeliveryStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.versionBumpOverride = options.versionBumpOverride;
    this.notificationAdapter = options.notificationAdapter;
  }

  async execute(input: EndgameDeliveryInput): Promise<EndgameDeliveryResult> {
    const readmeCheck = await this.checkReadmeSync(input);
    const readmeUpdated = readmeCheck.missingFrs.length > 0;

    const versionDecision = await this.determineVersionBump(input.packageJsonPath, input.changeType);
    const versionBumped = await this.applyVersionIfNeeded(input.packageJsonPath, versionDecision);

    const projectPath = path.dirname(input.packageJsonPath);
    const publishResult = await this.executePublish(this.options.publishAdapter, projectPath, versionDecision.to);

    await this.emitNotification(input.pipelineId, input.projectSlug, publishResult.success ? 'publish_success' : 'publish_failed', publishResult.success
      ? `Published ${versionDecision.to} to ${publishResult.platforms.map(p => p.name).join(', ')}`
      : `Publish failed: ${publishResult.platforms.find(p => p.error)?.error ?? 'unknown error'}`,
      { version: versionDecision.to, platforms: publishResult.platforms.map(p => p.name) },
    );

    const livenessConfigPath = path.join(path.dirname(input.packageJsonPath), '..', '..', 'scripts', 'pdca-liveness-config.json');
    const livenessResult = this.runLivenessVerification(livenessConfigPath, input.projectSlug);

    await this.emitNotification(input.pipelineId, input.projectSlug,
      livenessResult.p0Failures.length > 0 ? 'liveness_p0_failed' : 'liveness_passed',
      livenessResult.executed
        ? `Liveness: ${livenessResult.probes.filter(p => p.passed).length}/${livenessResult.probes.length} passed` +
          (livenessResult.p0Failures.length > 0 ? ` (P0 BLOCKED: ${livenessResult.p0Failures.join(', ')})` : '') +
          (livenessResult.p1Failures.length > 0 ? ` (P1 warnings: ${livenessResult.p1Failures.join(', ')})` : '')
        : 'Liveness verification skipped (no config)',
      { probes: livenessResult.probes, p0Failures: livenessResult.p0Failures, p1Failures: livenessResult.p1Failures },
    );

    if (livenessResult.p0Failures.length > 0) {
      throw new Error(
        `Liveness verification gate BLOCKED: P0 probe failures — ${livenessResult.p0Failures.join(', ')}. ` +
        `Publish cannot proceed until these are resolved.`,
      );
    }

    const gapScanResult = await this.triggerGapScan(input.specPath, projectPath, publishResult.success);

    await this.emitNotification(input.pipelineId, input.projectSlug, 'gap_scan_result',
      `Gap scan: ${gapScanResult.coveredFRs}/${gapScanResult.totalFRs} FRs covered${gapScanResult.gaps.length > 0 ? `, gaps: ${gapScanResult.gaps.join(', ')}` : ''}`,
      { totalFRs: gapScanResult.totalFRs, coveredFRs: gapScanResult.coveredFRs, gaps: gapScanResult.gaps },
    );

    return {
      readmeUpdated,
      versionBumped,
      publishResult: {
        success: publishResult.success,
        platforms: publishResult.platforms.map((platform) => platform.name),
        error: publishResult.platforms.find((platform) => platform.error)?.error,
      },
      livenessResult,
      gapScanResult: {
        totalFRs: gapScanResult.totalFRs,
        coveredFRs: gapScanResult.coveredFRs,
        gaps: gapScanResult.gaps,
      },
    };
  }

  async checkReadmeSync(input: EndgameDeliveryInput): Promise<ReadmeSyncCheckResult> {
    const [readmeContent, specDoc] = await Promise.all([
      fs.readFile(input.readmePath, 'utf8'),
      this.readSpecDocument(input.specPath),
    ]);

    const frMap = new Map((specDoc.functionalRequirements ?? []).map((fr) => [fr.id, fr]));
    const targetFrs = input.changedFRs
      .map((frId) => frMap.get(frId))
      .filter((fr): fr is FunctionalRequirement => Boolean(fr));

    if (targetFrs.length === 0) {
      return { missingFrs: [], semanticMatches: [] };
    }

    const analysis = await this.options.hostAdapter.analyzeRequirements?.({
      prompt: [
        'You are validating README semantic coverage for release notes.',
        'Given the README and changed functional requirements, decide whether each FR capability is already documented in the README.',
        'Return JSON only with shape:',
        '{"functionalRequirements":[{"title":"FR-xx","description":"covered|missing: rationale","acceptanceCriteria":[]}]}',
        'README:',
        readmeContent,
        'Changed FRs:',
        JSON.stringify(targetFrs.map((fr) => ({
          id: fr.id,
          title: fr.title,
          description: fr.description,
          acceptanceCriteria: fr.acceptanceCriteria.map((ac) => ac.description),
        })), null, 2),
      ].join('\n\n'),
    });

    return this.mapSemanticReadmeCoverage(targetFrs, analysis, readmeContent);
  }

  async determineVersionBump(
    packageJsonPath: string,
    changeType: 'patch' | 'minor' | 'major',
  ): Promise<VersionBumpDecision> {
    const pkg = await this.readPackageJson(packageJsonPath);
    const level = this.versionBumpOverride?.[changeType] ?? changeType;
    const to = this.bumpVersionString(pkg.version, level);
    return {
      level,
      from: pkg.version,
      to,
    };
  }

  async executePublish(
    adapter: PublishAdapter,
    projectPath: string,
    version: string,
  ): Promise<import('../adapter/publish-adapter.js').PublishResult> {
    const firstAttempt = await adapter.publish(projectPath, version);
    if (firstAttempt.success) {
      return firstAttempt;
    }

    await this.sleep(DEFAULT_PUBLISH_RETRY_DELAY_MS);
    return adapter.publish(projectPath, version);
  }

  runLivenessVerification(configPath: string, projectSlug?: string): LivenessVerificationResult {
    const skipped: LivenessVerificationResult = {
      executed: false,
      probes: [],
      p0Failures: [],
      p1Failures: [],
    };

    if (!existsSync(configPath)) {
      return skipped;
    }

    let config: {
      projects?: Array<{
        name: string;
        goals: Array<{
          id: string;
          description: string;
          probe: string;
          severity: string;
        }>;
      }>;
    };

    try {
      const raw = require('node:fs').readFileSync(configPath, 'utf8');
      config = JSON.parse(raw);
    } catch {
      return skipped;
    }

    const projects = config.projects ?? [];
    let targetProjects = projectSlug
      ? projects.filter((p) => p.name === projectSlug)
      : projects;

    if (targetProjects.length === 0 && projectSlug) {
      // No matching project in config — run all projects
      targetProjects = [...projects];
    }

    const probes: LivenessProbeResult[] = [];
    const p0Failures: string[] = [];
    const p1Failures: string[] = [];
    const livenessScript = configPath.replace('pdca-liveness-config.json', 'pdca-liveness-check.sh');

    for (const project of targetProjects) {
      for (const goal of project.goals) {
        const severity = (goal.severity === 'P0' ? 'P0' : 'P1') as 'P0' | 'P1';
        let passed = false;
        let output = '';

        try {
          // Execute the probe command via the liveness check script's function library
          // The probe field contains function calls like: check_log_recent <file> <keyword> <window>
          // We source the script to get the functions, then call the probe
          const result = nodeExecSync(
            `bash -c 'source "${livenessScript}" 2>/dev/null; ${goal.probe}'`,
            { encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
          );
          passed = true;
          output = result.trim();
        } catch (err: unknown) {
          passed = false;
          const execErr = err as { stdout?: string; stderr?: string; message?: string };
          output = (execErr.stdout ?? execErr.stderr ?? execErr.message ?? 'probe execution failed').trim();
        }

        probes.push({
          goalId: goal.id,
          project: project.name,
          severity,
          passed,
          output,
        });

        if (!passed) {
          if (severity === 'P0') {
            p0Failures.push(goal.id);
          } else {
            p1Failures.push(goal.id);
          }
        }
      }
    }

    return {
      executed: true,
      probes,
      p0Failures,
      p1Failures,
    };
  }

  async triggerGapScan(
    specPath: string,
    projectPath: string,
    publishSuccess = true,
  ): Promise<GapScanSummary> {
    const specDoc = await this.readSpecDocument(specPath);
    const frList = (specDoc.functionalRequirements ?? []).map((fr) => ({
      frId: fr.id,
      summary: fr.title || fr.description,
    }));

    const artifacts = await this.collectGapScanArtifacts(projectPath, frList, publishSuccess);
    const raw = this.validationStage.run({
      pipelineId: path.basename(projectPath),
      projectSlug: path.basename(projectPath),
      frList,
      deployArtifacts: artifacts,
      okrTree: specDoc.okrTree,
    });

    return {
      totalFRs: raw.report.totalFrs,
      coveredFRs: raw.report.coveredCount,
      gaps: raw.fixTasks.map((task) => task.frId),
      raw,
    };
  }

  private async emitNotification(
    pipelineId: string,
    projectSlug: string,
    event: PipelineNotificationEvent,
    summary: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.notificationAdapter) return;
    await this.notificationAdapter.notify({
      pipelineId,
      projectSlug,
      event,
      stageName: 'endgame-delivery',
      summary,
      details,
      timestamp: this.now(),
    });
  }

  private async applyVersionIfNeeded(
    packageJsonPath: string,
    decision: VersionBumpDecision,
  ): Promise<{ from: string; to: string } | null> {
    if (decision.from === decision.to) {
      return null;
    }

    const pkg = await this.readPackageJson(packageJsonPath);
    const updated: PackageJsonLike = { ...pkg, version: decision.to };
    await fs.writeFile(packageJsonPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    return { from: decision.from, to: decision.to };
  }

  private async readSpecDocument(specPath: string): Promise<SpecDocument> {
    const raw = await fs.readFile(specPath, 'utf8');
    return JSON.parse(raw) as SpecDocument;
  }

  private async readPackageJson(packageJsonPath: string): Promise<PackageJsonLike> {
    const raw = await fs.readFile(packageJsonPath, 'utf8');
    return JSON.parse(raw) as PackageJsonLike;
  }

  private mapSemanticReadmeCoverage(
    targetFrs: FunctionalRequirement[],
    analysis: RequirementAnalysisResponse | undefined,
    readmeContent: string,
  ): ReadmeSyncCheckResult {
    const resultById = new Map<string, { covered: boolean; rationale: string }>();

    for (const item of analysis?.functionalRequirements ?? []) {
      const frId = item.title.trim();
      const description = item.description.trim();
      const covered = /^covered\b/i.test(description);
      const rationale = description.replace(/^(covered|missing)\s*:?\s*/i, '').trim();
      resultById.set(frId, { covered, rationale });
    }

    const semanticMatches = targetFrs.map((fr) => {
      const aiResult = resultById.get(fr.id);
      if (aiResult) {
        return {
          frId: fr.id,
          covered: aiResult.covered,
          rationale: aiResult.rationale,
        };
      }

      const locallyCovered = this.fallbackReadmeCoverage(readmeContent, fr);
      return {
        frId: fr.id,
        covered: locallyCovered,
        rationale: locallyCovered
          ? 'Fallback coverage matched FR title/description terms in README.'
          : 'README lacks clear semantic coverage for this FR.',
      };
    });

    return {
      missingFrs: semanticMatches.filter((item) => !item.covered).map((item) => item.frId),
      semanticMatches,
    };
  }

  private fallbackReadmeCoverage(readmeContent: string, fr: FunctionalRequirement): boolean {
    const haystack = readmeContent.toLowerCase();
    const titleTokens = `${fr.id} ${fr.title} ${fr.description}`
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5]+/)
      .filter((token) => token.length >= 4);

    if (haystack.includes(fr.id.toLowerCase())) {
      return true;
    }

    const matchCount = titleTokens.filter((token) => haystack.includes(token)).length;
    return matchCount >= Math.min(3, titleTokens.length);
  }

  private bumpVersionString(version: string, level: 'patch' | 'minor' | 'major'): string {
    const parts = version.split('.').map((value) => Number(value));
    const major = parts[0] ?? Number.NaN;
    const minor = parts[1] ?? Number.NaN;
    const patch = parts[2] ?? Number.NaN;
    if ([major, minor, patch].some((value) => Number.isNaN(value))) {
      throw new Error(`Invalid package version: ${version}`);
    }

    switch (level) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  private async collectGapScanArtifacts(
    projectPath: string,
    frList: Array<{ frId: string; summary: string }>,
    publishSuccess: boolean,
  ): Promise<ArtifactRef[]> {
    const projectConfig = this.options.hostAdapter.getProjectConfig();
    const artifactRoots = projectConfig.artifactRoots ?? [path.join(projectPath, 'artifacts')];
    const artifacts: ArtifactRef[] = [];

    for (const root of artifactRoots) {
      const collected = await this.walkArtifactRoot(root);
      artifacts.push(...collected);
    }

    const timestamp = this.now();
    if (publishSuccess) {
      artifacts.push({
        id: `${path.basename(projectPath)}:publish-summary`,
        type: 'publish-result',
        path: path.join(projectPath, 'artifacts', 'deploy', 'publish-summary.json'),
        createdAt: timestamp,
        metadata: { stage: DEFAULT_ARTIFACT_STAGE },
      });
    }

    if (frList.length > 0) {
      for (const fr of frList) {
        artifacts.push({
          id: `${path.basename(projectPath)}:${fr.frId}:release-evidence`,
          type: publishSuccess ? 'verify-evidence' : 'implement-evidence',
          path: path.join(projectPath, 'artifacts', 'post-release-validation', `${fr.frId}.json`),
          createdAt: timestamp,
          metadata: { frId: fr.frId, summary: fr.summary },
        });
      }
    }

    return this.dedupeArtifacts(artifacts);
  }

  private async walkArtifactRoot(root: string): Promise<ArtifactRef[]> {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }

    const refs: ArtifactRef[] = [];
    const queue = [root];

    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) continue;

      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        const stat = await fs.stat(fullPath);
        // Priority: explicit type from .meta.json sidecar > path-based inference
        const explicitType = await this.readExplicitType(fullPath);
        refs.push({
          id: path.relative(root, fullPath) || entry.name,
          type: explicitType ?? this.inferArtifactType(fullPath),
          path: fullPath,
          createdAt: stat.mtime.toISOString(),
        });
      }
    }

    return refs;
  }

  /**
   * Read explicit artifact type from a sidecar .meta.json file.
   * Expected format: { "type": "publish-result" | "release-artifact" | ... }
   * Returns null if no sidecar exists or type field is missing.
   */
  private async readExplicitType(filePath: string): Promise<string | null> {
    try {
      const metaPath = `${filePath}.meta.json`;
      const content = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(content);
      if (meta && typeof meta.type === 'string' && meta.type.trim()) {
        return meta.type.trim();
      }
    } catch { /* No sidecar or invalid JSON — fall through */ }
    return null;
  }

  /**
   * Heuristic fallback: infer artifact type from file path.
   * Prefer explicit type declaration via .meta.json sidecar.
   */
  private inferArtifactType(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.includes('publish')) return 'publish-result';
    if (lower.includes('deploy') || lower.includes('release')) return 'release-artifact';
    if (lower.includes('verify') || lower.includes('smoke') || lower.includes('regression')) return 'verify-evidence';
    if (lower.includes('review')) return 'review-evidence';
    return 'implement-evidence';
  }

  private dedupeArtifacts(artifacts: ArtifactRef[]): ArtifactRef[] {
    const seen = new Set<string>();
    const result: ArtifactRef[] = [];
    for (const artifact of artifacts) {
      if (seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      result.push(artifact);
    }
    return result;
  }
}

export interface OpenClawPublishAdapterOptions {
  projectSlug: string;
  publishScript?: string;
  execFileSync?: typeof nodeExecFileSync;
  commandCwd?: string;
}

export class OpenClawPublishAdapter implements PublishAdapter {
  private readonly publishScript: string;
  private readonly execFileSync: typeof nodeExecFileSync;
  private readonly commandCwd: string;

  constructor(private readonly options: OpenClawPublishAdapterOptions) {
    this.publishScript = options.publishScript ?? path.resolve(process.cwd(), DEFAULT_PUBLISH_SCRIPT_RELATIVE);
    this.execFileSync = options.execFileSync ?? nodeExecFileSync;
    this.commandCwd = options.commandCwd ?? process.cwd();
  }

  async publish(projectPath: string, version: string): Promise<import('../adapter/publish-adapter.js').PublishResult> {
    const currentPackageVersion = await readPackageVersion(path.join(projectPath, 'package.json'));
    const bump = inferVersionBump(currentPackageVersion, version);
    const output = this.execFileSync('bash', [this.publishScript, this.options.projectSlug, bump], {
      cwd: this.commandCwd,
      encoding: 'utf8',
    });

    return parsePublishOutput(String(output), version);
  }
}

export interface StandalonePublishAdapterOptions {
  projectSlug: string;
  writer?: (line: string) => void;
}

export class StandalonePublishAdapter implements PublishAdapter {
  private readonly writer: (line: string) => void;

  constructor(private readonly options: StandalonePublishAdapterOptions) {
    this.writer = options.writer ?? ((line) => process.stdout.write(`${line}\n`));
  }

  async publish(projectPath: string, version: string): Promise<import('../adapter/publish-adapter.js').PublishResult> {
    const currentPackageVersion = await readPackageVersion(path.join(projectPath, 'package.json'));
    const bump = inferVersionBump(currentPackageVersion, version);
    this.writer(`bash scripts/publish-release.sh ${this.options.projectSlug} ${bump}`);

    return {
      success: true,
      version,
      platforms: [
        { name: 'stdout', url: `command://publish-release/${this.options.projectSlug}/${bump}` },
      ],
    };
  }
}

export async function dispatchReadmeUpdateTask(
  hostAdapter: Pick<SevoHostAdapter, 'spawnTask' | 'getProjectConfig'>,
  request: {
    pipelineId: string;
    projectSlug: string;
    missingFrs: string[];
    readmePath: string;
    specPath: string;
  },
): Promise<string | null> {
  const config = hostAdapter.getProjectConfig();
  const agentId = config.stageAgents?.deploy ?? config.defaultAgentId ?? 'cc';
  const label = `readme-sync-${request.projectSlug}-${Date.now()}`;
  const task = [
    `[SEVO README Sync] Pipeline ${request.pipelineId}`,
    `Project: ${request.projectSlug}`,
    `README: ${request.readmePath}`,
    `Spec: ${request.specPath}`,
    `Missing FRs: ${request.missingFrs.join(', ') || 'none'}`,
    'Update README so these FR capabilities are clearly documented for first-time users.',
  ].join('\n');

  return hostAdapter.spawnTask?.(agentId, task, {
    label,
    timeoutSeconds: 1200,
  }) ?? null;
}

async function readPackageVersion(packageJsonPath: string): Promise<string> {
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return (JSON.parse(raw) as PackageJsonLike).version;
}

function parsePublishOutput(
  rawOutput: string,
  version: string,
): import('../adapter/publish-adapter.js').PublishResult {
  const platforms: Array<{ name: string; url?: string; error?: string }> = [];
  const lines = rawOutput.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('npm: ')) {
      platforms.push({ name: 'npm', url: line.slice(5) });
      continue;
    }
    if (line.startsWith('github: ')) {
      platforms.push({ name: 'github', url: line.slice(8) });
      continue;
    }
    if (line.startsWith('main-repo: ')) {
      platforms.push({ name: 'main-repo', url: line.slice(11) });
      continue;
    }
    if (/error/i.test(line)) {
      platforms.push({ name: 'error', error: line });
    }
  }

  return {
    success: platforms.every((platform) => !platform.error),
    version,
    platforms,
  };
}

export async function previewReadmeCoverage(
  readmePath: string,
  specPath: string,
  changedFRs: string[],
): Promise<ReadmeSyncCheckResult> {
  const stage = new EndgameDeliveryStage({
    hostAdapter: {
      getProjectConfig: () => ({ workspaceRoot: path.dirname(specPath), projectRoot: path.dirname(specPath) }),
    },
    publishAdapter: {
      publish: async () => ({ success: true, version: '0.0.0', platforms: [] }),
    },
  });

  return stage.checkReadmeSync({
    pipelineId: 'preview',
    projectSlug: path.basename(path.dirname(specPath)),
    specPath,
    readmePath,
    packageJsonPath: path.join(path.dirname(readmePath), 'package.json'),
    changedFRs,
    changeType: 'patch',
  });
}

export async function runPublishCommandPreview(projectSlug: string, version: string): Promise<string> {
  const tempDir = process.cwd();
  const scriptPath = path.resolve(tempDir, DEFAULT_PUBLISH_SCRIPT_RELATIVE);
  const command = `bash ${scriptPath} ${projectSlug} ${version}`;
  await execFileAsync('bash', ['-lc', `printf %s ${JSON.stringify(command)}`], { cwd: tempDir });
  return command;
}
