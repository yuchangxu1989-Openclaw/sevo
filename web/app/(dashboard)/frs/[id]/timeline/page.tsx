"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useFrTimeline } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import type { StageStatus } from "@/types";
import { getStageLabel } from "@/types";
import { AlertTriangle, ArrowLeft, Clock3, GitBranchPlus, Timer } from "lucide-react";

const STATUS_STYLE: Record<StageStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  active: "bg-blue-100 text-blue-700",
  blocked: "bg-amber-100 text-amber-700",
  "clarification-blocked": "bg-orange-100 text-orange-700",
  passed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-slate-100 text-slate-500",
};

function durationHours(start?: string, end?: string) {
  if (!start) return 0;
  const diff = (new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
  return Math.max(1, Math.round(diff));
}

function isTimeout(hours: number) {
  return hours >= 8;
}

export default function FrTimelinePage() {
  const params = useParams();
  const frId = params.id as string;
  const { data, isLoading, error } = useFrTimeline(frId);
  const timeline = data?.timeline ?? [];

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <ErrorState
        title="时间线加载失败"
        description={error.message}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="还没有时间线数据"
        description="当前 FR 还没产生可展示的阶段轨迹。"
        action={{ label: "回到 FR 详情", href: `/frs/${frId}`, variant: "outline" }}
      />
    );
  }

  const maxHours = Math.max(...timeline.map((entry) => durationHours(entry.startedAt, entry.completedAt)), 1);
  const retryCount = timeline.filter((entry) => entry.attempt > 1).length;
  const riskCount = timeline.filter((entry) => {
    const hours = durationHours(entry.startedAt, entry.completedAt);
    return entry.status === "failed" || entry.status === "blocked" || entry.status === "clarification-blocked" || isTimeout(hours);
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/frs/${frId}`}>
          <Button variant="ghost" size="icon" aria-label="返回 FR 详情">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="阶段时间线"
          description={`${frId} · 按阶段看耗时、重试和阻塞点。`}
          className="flex-1"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="阶段数" value={timeline.length} helper="当前已记录的阶段总数。" />
        <StatCard title="重试阶段" value={retryCount} helper="发生过重复执行的阶段数量。" valueClassName="text-violet-700" />
        <StatCard title="超时 / 阻塞" value={riskCount} helper="需要优先解释原因的风险阶段数。" valueClassName="text-red-700" />
        <StatCard title="最长耗时" value={`${maxHours}h`} helper="单阶段最高耗时。" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">阶段时间线</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {timeline.length === 0 ? (
            <EmptyState
              title="还没有时间线记录"
              description="当前 FR 还没产生阶段轨迹，等流程开始推进后这里会自动补齐。"
              action={{ label: "回到 FR 详情", href: `/frs/${frId}`, variant: "outline" }}
            />
          ) : (
            timeline.map((entry) => {
              const hours = durationHours(entry.startedAt, entry.completedAt);
              const timeout = isTimeout(hours);
              const width = Math.max(8, Math.round((hours / maxHours) * 100));
              const blocked = entry.status === "blocked" || entry.status === "clarification-blocked" || entry.status === "failed";
              return (
                <div key={`${entry.stageId}-${entry.attempt}`} className={`rounded-2xl border p-4 ${blocked || timeout ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-2 lg:w-[340px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{getStageLabel(entry.stageId)}</p>
                        <Badge className={STATUS_STYLE[entry.status]} variant="secondary">{entry.status === "active" ? "进行中" : entry.status === "blocked" ? "已阻塞" : entry.status === "clarification-blocked" ? "待澄清" : entry.status === "passed" ? "已通过" : entry.status === "failed" ? "已失败" : entry.status === "skipped" ? "已跳过" : "待开始"}</Badge>
                        {entry.attempt > 1 && (
                          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                            <GitBranchPlus className="mr-1 h-3.5 w-3.5" /> 重试 × {entry.attempt}
                          </Badge>
                        )}
                        {timeout && (
                          <Badge variant="outline" className="border-red-200 bg-red-100 text-red-700">
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> 超时
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {entry.startedAt ? new Date(entry.startedAt).toLocaleString() : "未开始"}</span>
                        <span>{entry.completedAt ? `结束 ${new Date(entry.completedAt).toLocaleString()}` : "仍在进行"}</span>
                        <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> {hours}h</span>
                      </div>
                    </div>
                    <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="h-4 rounded-full bg-white">
                        <div
                          className={`h-4 rounded-full ${blocked || timeout ? "bg-red-500" : entry.status === "passed" ? "bg-emerald-500" : entry.status === "active" ? "bg-blue-500" : "bg-slate-400"}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {blocked || timeout
                          ? "这里是当前流程的瓶颈位，应该优先解释为什么慢。"
                          : "后续会接入更完整的悬停提示，当前先直接展示开始、结束和持续时间。"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
