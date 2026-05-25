"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useFrDetail } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import type { StageStatus } from "@/types";
import { getStageLabel } from "@/types";
import { ArrowLeft, CircleDot, Flag, MapPinned } from "lucide-react";

const STATUS_STYLE: Record<StageStatus, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-600",
  active: "border-blue-200 bg-blue-50 text-blue-700",
  blocked: "border-amber-200 bg-amber-50 text-amber-700",
  "clarification-blocked": "border-orange-200 bg-orange-50 text-orange-700",
  passed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  skipped: "border-slate-200 bg-slate-50 text-slate-500",
};

export default function PanoramaPage() {
  const params = useParams();
  const frId = params.id as string;
  const { data: fr, isLoading, error } = useFrDetail(frId);

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-red-600">
          全景视图加载失败：{error.message}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (!fr) {
    return (
      <EmptyState
        title="还没有全景数据"
        description="当前 FR 还没形成完整的阶段轨迹，暂时无法生成全景视图。"
        action={{ label: "回到 FR 详情", href: `/frs/${frId}`, variant: "outline" }}
      />
    );
  }

  const completed = fr.stageTimeline.filter((stage) => stage.status === "passed" || stage.status === "skipped").length;
  const current = fr.stageTimeline.find((stage) => stage.stageId === fr.currentStage);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/frs/${frId}`}>
          <Button variant="ghost" size="icon" aria-label="返回 FR 详情"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <PageHeader
          title="全景路径"
          description={`${fr.title} · 从需求澄清到结果确认的全流程鸟瞰。`}
          className="flex-1"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="已完成阶段" value={completed} helper="已经通过或可跳过的阶段总数。" valueClassName="text-emerald-700" />
        <StatCard title="当前阶段" value={getStageLabel(fr.currentStage)} helper="当前 FR 停留的阶段位置。" valueClassName="text-lg font-semibold text-blue-700" />
        <StatCard title="流程状态" value={fr.status} helper="整体执行状态。" />
        <StatCard title="必经阶段" value={fr.routingResult.requiredStages.length} helper="这条 FR 必须走完的关键阶段。" valueClassName="text-violet-700" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">全景流程</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative -mx-1 overflow-hidden rounded-2xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white via-white/80 to-transparent md:hidden" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white via-white/80 to-transparent md:hidden" />
            <div
              className="overflow-x-auto px-1 pb-2 md:overflow-visible md:px-0 md:pb-0"
              role="img"
              aria-label="FR 全流程鸟瞰图，可左右滚动查看各阶段状态"
            >
              <div className="flex min-w-[980px] items-stretch gap-4 md:min-w-0 md:flex-wrap">
              {fr.stageTimeline.map((stage, index) => {
                const isCurrent = stage.stageId === fr.currentStage;
                return (
                  <React.Fragment key={stage.stageId}>
                    <div className={`w-[220px] rounded-3xl border p-4 ${isCurrent ? "border-blue-300 bg-blue-50/70 shadow-sm" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{getStageLabel(stage.stageId)}</p>
                          <p className="mt-1 text-xs text-slate-500">{stage.macroStage}</p>
                        </div>
                        {isCurrent ? <MapPinned className="h-4 w-4 text-blue-600" /> : <CircleDot className="h-4 w-4 text-slate-700" />}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline" className={STATUS_STYLE[stage.status]}>{stage.status}</Badge>
                        {stage.attempt > 1 && <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">尝试 {stage.attempt}</Badge>}
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <p>{stage.startedAt ? `开始 ${new Date(stage.startedAt).toLocaleString()}` : "尚未开始"}</p>
                        <p>{stage.completedAt ? `完成 ${new Date(stage.completedAt).toLocaleString()}` : "等待推进"}</p>
                        <p>工件 {stage.artifacts.length} 个</p>
                      </div>
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        {isCurrent
                          ? "当前位置已经高亮，管理者不需要再自己判断流程走到哪。"
                          : stage.status === "passed" || stage.status === "skipped"
                            ? "这一步已经完成。"
                            : "这一步还没完成。"}
                      </div>
                    </div>
                    {index < fr.stageTimeline.length - 1 && (
                      <div className="flex items-center justify-center text-slate-700">
                        <Flag className="h-4 w-4" />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 md:hidden">左右滑动可查看完整阶段路径。</p>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">路由摘要</p>
            <p className="mt-2">任务级别：{fr.routingResult.level}，必经阶段 {fr.routingResult.requiredStages.join(" → ")}。</p>
            <p className="mt-2">当前阶段：{getStageLabel(current?.stageId ?? fr.currentStage)}，跳过阶段 {fr.routingResult.skippedStages.length > 0 ? fr.routingResult.skippedStages.map((item) => getStageLabel(item.stage)).join("、") : "无"}。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
