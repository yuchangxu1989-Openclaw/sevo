export interface PublishPlatformResult {
  name: string;
  url?: string;
  error?: string;
}

export interface PublishResult {
  success: boolean;
  version: string;
  platforms: PublishPlatformResult[];
}

export interface PublishAdapter {
  publish(projectPath: string, version: string): Promise<PublishResult>;
}

export interface ReadmeUpdateRequest {
  pipelineId: string;
  projectSlug: string;
  projectPath: string;
  specPath: string;
  readmePath: string;
  missingFrs: string[];
}

export function inferVersionBump(
  currentVersion: string,
  targetVersion: string,
): 'patch' | 'minor' | 'major' {
  const current = parseSemver(currentVersion);
  const target = parseSemver(targetVersion);

  if (target.major > current.major) return 'major';
  if (target.minor > current.minor) return 'minor';
  if (target.patch > current.patch) return 'patch';

  return 'patch';
}

function parseSemver(version: string): { major: number; minor: number; patch: number } {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}
