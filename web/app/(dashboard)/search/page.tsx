"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, FolderKanban, List, PackageSearch, Bell, BookOpenText, ArrowRight } from "lucide-react";
import { useProjects, useFrList, useDeliverableIndex, useNotifications, useLedger } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { getStageLabel, getLedgerActionLabel } from "@/types";

type SearchCategory = "project" | "fr" | "artifact" | "notification" | "ledger";

type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  meta: string[];
  href: string;
};

const CATEGORY_META: Record<SearchCategory, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  project: {
    label: "Project",
    icon: <FolderKanban className="h-4 w-4" />,
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
  },
  fr: {
    label: "FR",
    icon: <List className="h-4 w-4" />,
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
  },
  artifact: {
    label: "Artifact",
    icon: <PackageSearch className="h-4 w-4" />,
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  notification: {
    label: "Notification",
    icon: <Bell className="h-4 w-4" />,
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  ledger: {
    label: "Ledger",
    icon: <BookOpenText className="h-4 w-4" />,
    badgeClass: "border-slate-200 bg-slate-50 text-slate-700",
  },
};

function includesQuery(parts: Array<string | undefined>, query: string) {
  return parts.some((part) => part?.toLowerCase().includes(query));
}

function buildResults(query: string, data: {
  projects: ReturnType<typeof useProjects>["data"];
  frs: ReturnType<typeof useFrList>["data"];
  deliverables: ReturnType<typeof useDeliverableIndex>["data"];
  notifications: ReturnType<typeof useNotifications>["data"];
  ledger: ReturnType<typeof useLedger>["data"];
}): SearchResult[] {
  if (!query) return [];

  const results: SearchResult[] = [];

  for (const project of data.projects?.projects ?? []) {
    if (!includesQuery([project.projectName, project.projectSlug], query)) continue;
    results.push({
      id: `project-${project.projectSlug}`,
      category: "project",
      title: project.projectName,
      subtitle: project.projectSlug,
      meta: [`FR ${project.frCount}`, `${project.completedCount} 完成`, `${project.activeCount} 进行中`, `${project.failedCount} 失败`],
      href: `/projects/${project.projectSlug}/fr-matrix`,
    });
  }

  for (const fr of data.frs?.items ?? []) {
    if (!includesQuery([fr.title, fr.frCode, getStageLabel(fr.currentStage)], query)) continue;
    results.push({
      id: `fr-${fr.frId}`,
      category: "fr",
      title: fr.title,
      subtitle: fr.frCode,
      meta: [getStageLabel(fr.currentStage), `状态：${fr.status}`, `更新时间：${new Date(fr.updatedAt).toLocaleString()}`],
      href: `/frs/${fr.frId}`,
    });
  }

  for (const item of data.deliverables?.items ?? []) {
    if (!includesQuery([item.name, item.frTitle, item.frCode, item.projectSlug, item.path, item.stageLabel], query)) continue;
    results.push({
      id: `artifact-${item.deliverableId}`,
      category: "artifact",
      title: item.name,
      subtitle: `${item.frCode} · ${item.frTitle}`,
      meta: [item.projectSlug, item.stageLabel, item.path],
      href: `/deliverables/${item.deliverableId}`,
    });
  }

  for (const notification of data.notifications?.items ?? []) {
    if (!includesQuery([notification.title, notification.message, notification.pipelineId, getStageLabel(notification.stageId)], query)) continue;
    results.push({
      id: `notification-${notification.notificationId}`,
      category: "notification",
      title: notification.title,
      subtitle: notification.pipelineId,
      meta: [getStageLabel(notification.stageId), notification.severity, new Date(notification.createdAt).toLocaleString()],
      href: `/notifications/${notification.notificationId}`,
    });
  }

  for (const entry of data.ledger?.entries ?? []) {
    if (!includesQuery([entry.frTitle, entry.frCode, entry.projectName, entry.projectSlug, entry.summary, getLedgerActionLabel(entry.actionType)], query)) continue;
    results.push({
      id: `ledger-${entry.entryId}`,
      category: "ledger",
      title: entry.frTitle,
      subtitle: entry.frCode,
      meta: [entry.projectName, getLedgerActionLabel(entry.actionType), new Date(entry.timestamp).toLocaleString()],
      href: `/ledger/${entry.entryId}`,
    });
  }

  return results.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

export default function GlobalSearchPage() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get("q") ?? "";
  const query = rawQuery.trim().toLowerCase();

  const projects = useProjects();
  const frs = useFrList({ page: 1, pageSize: 200 });
  const deliverables = useDeliverableIndex();
  const notifications = useNotifications({ page: 1, pageSize: 200 });
  const ledger = useLedger();

  const isLoading = projects.isLoading || frs.isLoading || deliverables.isLoading || notifications.isLoading || ledger.isLoading;
  const error = projects.error || frs.error || deliverables.error || notifications.error || ledger.error;

  const results = React.useMemo(
    () => buildResults(query, {
      projects: projects.data,
      frs: frs.data,
      deliverables: deliverables.data,
      notifications: notifications.data,
      ledger: ledger.data,
    }),
    [query, projects.data, frs.data, deliverables.data, notifications.data, ledger.data],
  );

  const categoryCounts = React.useMemo(() => {
    return results.reduce<Record<SearchCategory, number>>(
      (acc, item) => {
        acc[item.category] += 1;
        return acc;
      },
      { project: 0, fr: 0, artifact: 0, notification: 0, ledger: 0 },
    );
  }, [results]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="全局搜索"
        description={
          rawQuery
            ? `搜索词“${rawQuery}”会同时检索 Projects、FR、交付物、通知和账本，结果直接给跳转入口。`
            : "在顶部搜索框输入关键字，就能跨 Projects、FR、交付物、通知和账本一起查。"
        }
        icon={<Search className="h-5 w-5" />}
      />

      {!rawQuery ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="还没输入搜索词"
          description="去顶部导航输入关键词，比如项目名、FR 编号、交付物文件名或通知标题。"
        />
      ) : error ? (
        <ErrorState title="全局搜索加载失败" description={error.message} />
      ) : isLoading ? (
        <PageSkeleton variant="list" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="没有命中结果"
          description={`当前没有找到和“${rawQuery}”相关的 Projects、FR、交付物、通知或账本记录。`}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CATEGORY_META) as SearchCategory[]).map((category) => (
              <Badge key={category} variant="outline" className={CATEGORY_META[category].badgeClass}>
                <span className="mr-1 inline-flex items-center">{CATEGORY_META[category].icon}</span>
                {CATEGORY_META[category].label} {categoryCounts[category]}
              </Badge>
            ))}
          </div>

          <div className="space-y-3">
            {results.map((result) => {
              const meta = CATEGORY_META[result.category];
              return (
                <Link key={result.id} href={result.href}>
                  <Card className="cursor-pointer overflow-hidden transition-all hover:border-primary/40 hover:shadow-md">
                    <CardContent className="flex items-start justify-between gap-4 p-5">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={meta.badgeClass}>
                            <span className="mr-1 inline-flex items-center">{meta.icon}</span>
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold text-slate-900">{result.title}</h3>
                          <p className="text-sm text-slate-600">{result.subtitle}</p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          {result.meta.map((item) => (
                            <span key={`${result.id}-${item}`}>{item}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-sm font-medium text-slate-700">
                        查看详情
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
