"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bell, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { useNotifications } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import type { NotificationSeverity, StageId } from "@/types";
import { getStageLabel } from "@/types";

const SEVERITY_CONFIG: Record<NotificationSeverity, { icon: React.ReactNode; className: string; label: string }> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    className: "text-blue-700 bg-blue-50 border-blue-200",
    label: "信息",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "text-amber-700 bg-amber-50 border-amber-200",
    label: "提醒",
  },
  critical: {
    icon: <AlertCircle className="h-4 w-4" />,
    className: "text-red-700 bg-red-50 border-red-200",
    label: "关键",
  },
};

function notificationHref(stageId: StageId, pipelineId: string) {
  if (stageId.includes("gate")) return `/gates/${stageId === "spec-review-gate" ? "gate-001" : "gate-002"}`;
  if (stageId === "spec") return "/clarifications/clr-001";
  return `/frs/${pipelineId}`;
}

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useNotifications({ page: 1, pageSize: 200 });

  const item = React.useMemo(
    () => data?.items.find((entry) => entry.notificationId === params.id),
    [data?.items, params.id],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={item?.title ?? "通知详情"}
        description={item ? `FR：${item.pipelineId} · ${getStageLabel(item.stageId)}` : "查看通知正文、严重级别和下一步动作入口。"}
        icon={<Bell className="h-5 w-5" />}
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/notifications">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回通知中心
            </Link>
          </Button>
        }
      />

      {error ? (
        <ErrorState title="通知详情加载失败" description={error.message} />
      ) : isLoading ? (
        <PageSkeleton variant="detail" />
      ) : !item ? (
        <EmptyState title="没有找到这条通知" description="这条通知可能已经不存在，或者当前 mock 数据里没有它。" action={{ label: "返回通知中心", href: "/notifications", variant: "outline" }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={SEVERITY_CONFIG[item.severity].className}>
                  {SEVERITY_CONFIG[item.severity].icon}
                  <span className="ml-1">{SEVERITY_CONFIG[item.severity].label}</span>
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{getStageLabel(item.stageId)}</Badge>
                {!item.read && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">未读</Badge>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm leading-7 text-slate-700">{item.message}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">通知时间</p>
                <p className="mt-2 text-sm text-slate-700">{new Date(item.createdAt).toLocaleString()}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">下一步</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {item.stageId.includes("gate")
                    ? "先看 blocker 和评审结论，再决定是否放行。"
                    : item.stageId === "spec"
                      ? "补齐答案后，当前阶段才能继续推进。"
                      : item.severity === "critical"
                        ? "优先确认失败或异常原因，避免继续扩散。"
                        : "进入详情页看完整上下文。"}
                </p>
              </div>

              <Button asChild className="w-full rounded-xl">
                <Link href={notificationHref(item.stageId, item.pipelineId)}>
                  去处理
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
