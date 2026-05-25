"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFrList, useProjects } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserMacroStage, PipelineInstanceStatus } from "@/types";
import { getStageLabel } from "@/types";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, GitBranch, Search } from "lucide-react";

const STAGE_LABELS: Record<UserMacroStage, string> = {
  specify: "需求澄清",
  plan: "方案规划",
  implement: "执行落地",
  review: "质量复核",
};

const STATUS_BADGE: Record<PipelineInstanceStatus, { label: string; className: string; risk: string }> = {
  created: { label: "等待", className: "border-slate-400/20 bg-slate-400/10 text-slate-700", risk: "等待启动" },
  active: { label: "正常", className: "border-blue-400/20 bg-blue-400/10 text-violet-600", risk: "正常推进" },
  paused: { label: "等待", className: "border-amber-400/20 bg-amber-400/10 text-amber-700", risk: "等待门禁" },
  completed: { label: "完成", className: "border-slate-400/20 bg-slate-400/10 text-slate-600", risk: "已完成" },
  failed: { label: "失败", className: "border-red-400/20 bg-red-400/10 text-red-700", risk: "失败待处理" },
};

const STAGE_BADGE_COLORS: Record<UserMacroStage, string> = {
  specify: "border-blue-400/20 bg-blue-400/10 text-blue-600",
  plan: "border-amber-400/20 bg-amber-400/10 text-amber-700",
  implement: "border-violet-400/20 bg-violet-400/10 text-violet-600",
  review: "border-blue-400/20 bg-blue-400/10 text-violet-600",
};

const PIPELINE_TYPE_BADGE = {
  full: { label: "全量 pipeline", className: "border-violet-400/20 bg-violet-400/10 text-violet-700" },
  incremental: { label: "增量 FR", className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-700" },
} as const;

function getPipelineType(level: string) {
  return level === "L1" ? "incremental" : "full";
}

function trimTitle(title: string) {
  return title.length > 40 ? `${title.slice(0, 40)}…` : title;
}

export default function FRListPage() {
  const searchParams = useSearchParams();
  const [page, setPage] = React.useState(1);
  const [stageFilter, setStageFilter] = React.useState<string>(searchParams.get("stage") ?? "");
  const [projectFilter, setProjectFilter] = React.useState<string>(searchParams.get("project") ?? "");
  const [searchText, setSearchText] = React.useState<string>(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = React.useState<string>(searchParams.get("q") ?? "");
  const [showCompleted, setShowCompleted] = React.useState(false);
  const statusParam = searchParams.get("status") ?? "";
  const pageSize = 20;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data: projectsData } = useProjects();
  const { data, isLoading, error, mutate } = useFrList({
    page,
    pageSize,
    stage: stageFilter || undefined,
    status: statusParam || undefined,
    project: projectFilter || undefined,
    q: debouncedSearch || undefined,
  });

  const allItems = data?.items ?? [];
  const primaryItems = allItems.filter((fr) => showCompleted || fr.status !== "completed");
  const completedItems = allItems.filter((fr) => fr.status === "completed");
  const exceptionCount = allItems.filter((fr) => fr.status === "failed" || fr.status === "paused" || fr.status === "active").length;
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="FR 流水线"
        description={`当前优先显示异常、等待和推进中的 FR；已完成 ${completedItems.length} 个默认折叠。`}
        icon={<GitBranch className="h-5 w-5 text-violet-600" />}
        actions={<div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-700">{exceptionCount} 个需关注</div>}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-black text-slate-950">{allItems.length}</p><p className="text-xs text-slate-500">当前筛选 FR</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-black text-amber-700">{exceptionCount}</p><p className="text-xs text-slate-500">异常 / 等待 / 推进中</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-black text-violet-600">{completedItems.length}</p><p className="text-xs text-slate-500">已完成折叠</p></CardContent></Card>
      </div>

      <Tabs value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(1); }}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="">全部阶段</TabsTrigger>
          <TabsTrigger value="specify">需求澄清</TabsTrigger>
          <TabsTrigger value="plan">方案规划</TabsTrigger>
          <TabsTrigger value="implement">执行落地</TabsTrigger>
          <TabsTrigger value="review">质量复核</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <select
            value={projectFilter}
            onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none backdrop-blur-xl focus:border-blue-400/30"
            aria-label="按项目筛选"
          >
            <option value="">全部项目</option>
            {projectsData?.projects.map((p) => <option key={p.projectSlug} value={p.projectSlug}>{p.projectName}</option>)}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索 FR 标题或编号…"
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-600 outline-none focus:border-blue-400/30"
              aria-label="搜索 FR"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCompleted((value) => !value)}
            className="h-10 rounded-2xl border border-slate-200 px-4 text-sm text-slate-700 transition-all hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10"
          >
            {showCompleted ? "隐藏已完成" : "展开已完成"}
          </button>
        </CardContent>
      </Card>

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : error ? (
        <ErrorState title="FR 流水线加载失败" description={error.message} action={RetryAction(() => void mutate())} />
      ) : primaryItems.length === 0 ? (
        <EmptyState
          title="当前没有需要关注的 FR"
          description="当前状态：筛选条件下没有异常、等待或推进中 FR。为什么是空的：它们可能已经完成或筛选过窄。下一步：展开已完成或清空筛选。"
          action={{ label: showCompleted ? "清空筛选" : "展开已完成", onClick: () => showCompleted ? (setStageFilter(""), setProjectFilter(""), setSearchText("")) : setShowCompleted(true), variant: "outline" }}
        />
      ) : (
        <div className="space-y-3">
          {primaryItems.map((fr) => {
            const statusConfig = STATUS_BADGE[fr.status];
            const pipelineType = getPipelineType(fr.routingResult.level);
            const pipelineTypeBadge = PIPELINE_TYPE_BADGE[pipelineType];
            const riskTone = fr.status === "failed" ? "border-red-400/25 bg-red-400/10" : fr.status === "paused" ? "border-amber-400/25 bg-amber-400/10" : "border-slate-200 bg-white";
            return (
              <Link key={fr.frId} href={`/frs/${fr.frId}`} className="block">
                <Card className={`overflow-hidden ${riskTone}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={STAGE_BADGE_COLORS[fr.currentMacroStage]} variant="outline">{STAGE_LABELS[fr.currentMacroStage]}</Badge>
                          <Badge className={pipelineTypeBadge.className} variant="outline">{pipelineTypeBadge.label}</Badge>
                          <Badge className={statusConfig.className} variant="outline">{statusConfig.label}</Badge>
                          <Badge className={fr.status === "failed" ? "border-red-400/20 bg-red-400/10 text-red-700" : "border-slate-200 bg-white text-slate-600"} variant="outline">
                            {fr.status === "failed" && <AlertTriangle className="mr-1 h-3.5 w-3.5" />}{statusConfig.risk}
                          </Badge>
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-slate-950">{trimTitle(fr.title)}</h3>
                          <p className="mt-1 text-sm text-slate-500">{fr.frCode}</p>
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3 lg:min-w-[520px]">
                        <span className="inline-flex items-center gap-1.5"><GitBranch className="h-4 w-4 text-violet-600" />{getStageLabel(fr.currentStage)}</span>
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-slate-500" />{new Date(fr.updatedAt).toLocaleString()}</span>
                        <span className="inline-flex items-center justify-start gap-1 font-semibold text-violet-600 lg:justify-end">查看详情 <ArrowRight className="h-4 w-4" /></span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {!showCompleted && completedItems.length > 0 && (
        <Card className="border-blue-400/10 bg-blue-400/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{completedItems.length} 个已完成 FR 已折叠</p>
                <p className="text-xs text-slate-500">默认只展示异常、等待和推进中的条目。</p>
              </div>
            </div>
            <button onClick={() => setShowCompleted(true)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10">展开查看</button>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={data?.total} />
    </div>
  );
}
