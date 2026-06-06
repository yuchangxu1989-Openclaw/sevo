import useSWR from "swr";
import type {
  CockpitPipelineDetail,
  CockpitPipelineSummary,
  CockpitProjectDetail,
  CockpitProjectSummary,
} from "@/types";

const BP = "/sevo";

const fetcher = async (url: string) => {
  const response = await fetch(`${BP}${url}`);
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message && typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parse failures and keep the HTTP status message.
    }
    throw new Error(message);
  }
  return response.json();
};

export function useCockpitProjects() {
  return useSWR<{ projects: CockpitProjectSummary[] }>(
    "/api/v1/cockpit/projects",
    fetcher,
    { refreshInterval: 15000 },
  );
}

export function useCockpitProjectDetail(projectSlug: string | null) {
  return useSWR<CockpitProjectDetail>(
    projectSlug ? `/api/v1/cockpit/projects/${encodeURIComponent(projectSlug)}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
}

export function useCockpitPipelines() {
  return useSWR<{ pipelines: CockpitPipelineSummary[] }>(
    "/api/v1/cockpit/pipelines",
    fetcher,
    { refreshInterval: 15000 },
  );
}

export function useCockpitPipelineDetail(pipelineId: string | null) {
  return useSWR<CockpitPipelineDetail>(
    pipelineId ? `/api/v1/cockpit/pipelines/${encodeURIComponent(pipelineId)}` : null,
    fetcher,
    { refreshInterval: 10000 },
  );
}
