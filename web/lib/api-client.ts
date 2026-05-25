import useSWR from "swr";
import type {
  DashboardSummary,
  FrSummaryView,
  FrDetailView,
  NotificationRecord,
  PaginatedResponse,
  TodoItemView,
  GateDecisionView,
  ClarificationThreadView,
  FrQualityView,
  FrMatrixView,
  DeliverableIndexView,
  CrossProjectAnalyticsView,
  LedgerView,
  ProjectSummaryView,
  ReviewTrackingView,
  SettingsView,
} from "@/types";

/** Extended FrDetailView with version field from engine service */
export type FrDetailWithVersion = FrDetailView & { version: number };

const BP = "/sevo";

const fetcher = async (url: string) => {
  const response = await fetch(`${BP}${url}`);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
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

export function useDashboardSummary() {
  return useSWR<DashboardSummary>("/api/v1/dashboard/summary", fetcher, {
    refreshInterval: 30000,
  });
}

export function useFrList(params: {
  page?: number;
  pageSize?: number;
  stage?: string;
  status?: string;
  project?: string;
  q?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.stage) searchParams.set("stage", params.stage);
  if (params.status) searchParams.set("status", params.status);
  if (params.project) searchParams.set("project", params.project);
  if (params.q) searchParams.set("q", params.q);

  const url = `/api/v1/frs?${searchParams.toString()}`;
  return useSWR<PaginatedResponse<FrSummaryView>>(url, fetcher, {
    refreshInterval: 15000,
  });
}

export function useFrDetail(frId: string | null) {
  return useSWR<FrDetailWithVersion>(frId ? `/api/v1/frs/${frId}` : null, fetcher, {
    refreshInterval: 10000,
  });
}

export function useNotifications(params: {
  page?: number;
  pageSize?: number;
  severity?: string;
  read?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.severity) searchParams.set("severity", params.severity);
  if (params.read) searchParams.set("read", params.read);

  const url = `/api/v1/notifications?${searchParams.toString()}`;
  return useSWR<PaginatedResponse<NotificationRecord>>(url, fetcher, {
    refreshInterval: 15000,
  });
}

export async function frAction(frId: string, action: "pause" | "resume" | "cancel" | "retry" | "abandon", expectedVersion?: number) {
  const res = await fetch(`${BP}/api/v1/frs/${frId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actorId: "web-user",
      requestId: crypto.randomUUID(),
      expectedVersion,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Action failed");
  }
  return res.json();
}

export function useTodos(params: {
  page?: number;
  pageSize?: number;
  type?: string;
  urgency?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.type) searchParams.set("type", params.type);
  if (params.urgency) searchParams.set("urgency", params.urgency);

  const url = `/api/v1/todos?${searchParams.toString()}`;
  return useSWR<PaginatedResponse<TodoItemView>>(url, fetcher, {
    refreshInterval: 10000,
  });
}

export function useGateDetail(gateId: string | null) {
  return useSWR<GateDecisionView>(gateId ? `/api/v1/gates/${gateId}` : null, fetcher, {
    refreshInterval: 10000,
  });
}

export async function gateAction(gateId: string, action: "approve" | "reject" | "request-review", reason?: string) {
  const res = await fetch(`${BP}/api/v1/gates/${gateId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actorId: "web-user",
      requestId: crypto.randomUUID(),
      reason,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Action failed");
  }
  return res.json();
}

export function useClarificationDetail(clarificationId: string | null) {
  return useSWR<ClarificationThreadView>(
    clarificationId ? `/api/v1/clarifications/${clarificationId}` : null,
    fetcher,
    { refreshInterval: 10000 },
  );
}

export async function clarificationReply(clarificationId: string, content: string) {
  const res = await fetch(`${BP}/api/v1/clarifications/${clarificationId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actorId: "web-user",
      requestId: crypto.randomUUID(),
      content,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Reply failed");
  }
  return res.json();
}

export function useFrQuality(frId: string | null) {
  return useSWR<FrQualityView>(frId ? `/api/v1/frs/${frId}/quality` : null, fetcher, {
    refreshInterval: 15000,
  });
}

export function useFrMatrix(projectId: string | null, params?: { status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);

  const qs = searchParams.toString();
  const url = projectId
    ? `/api/v1/projects/${projectId}/fr-matrix${qs ? `?${qs}` : ""}`
    : null;
  return useSWR<FrMatrixView>(url, fetcher, {
    refreshInterval: 15000,
  });
}

export function useFrTimeline(frId: string | null) {
  return useSWR<{ timeline: FrDetailView["stageTimeline"] }>(
    frId ? `/api/v1/frs/${frId}/timeline` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
}

export function useFrArtifacts(frId: string | null) {
  return useSWR<{ artifacts: FrDetailView["artifacts"] }>(
    frId ? `/api/v1/frs/${frId}/artifacts` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
}

export function useDeliverableIndex() {
  return useSWR<DeliverableIndexView>("/api/v1/deliverables", fetcher, {
    refreshInterval: 15000,
  });
}

export function useCrossProjectAnalytics(timeRange: string) {
  return useSWR<CrossProjectAnalyticsView>(`/api/v1/analytics?range=${timeRange}`, fetcher, {
    refreshInterval: 30000,
  });
}

export function useLedger() {
  return useSWR<LedgerView>("/api/v1/ledger", fetcher, {
    refreshInterval: 15000,
  });
}

export function useProjects() {
  return useSWR<{ projects: ProjectSummaryView[] }>("/api/v1/projects", fetcher, {
    refreshInterval: 15000,
  });
}

export function useReviewTracking() {
  return useSWR<ReviewTrackingView>("/api/v1/reviews", fetcher, {
    refreshInterval: 15000,
  });
}

export function useSettings() {
  return useSWR<SettingsView>("/api/v1/settings", fetcher, {
    refreshInterval: 30000,
  });
}
