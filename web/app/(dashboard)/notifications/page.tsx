"use client";

import * as React from "react";
import Link from "next/link";
import { useNotifications } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, AlertTriangle, Info, AlertCircle, ArrowRight } from "lucide-react";
import type { NotificationSeverity, StageId } from "@/types";
import { getStageLabel } from "@/types";

const SEVERITY_CONFIG: Record<NotificationSeverity, { icon: React.ReactNode; className: string; label: string; action: string }> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    className: "text-blue-700 bg-blue-50 border-blue-200",
    label: "信息",
    action: "查看上下文",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    className: "text-amber-700 bg-amber-50 border-amber-200",
    label: "提醒",
    action: "尽快处理",
  },
  critical: {
    icon: <AlertCircle className="h-4 w-4" />,
    className: "text-red-700 bg-red-50 border-red-200",
    label: "关键",
    action: "立即查看 FR",
  },
};

function notificationHref(stageId: StageId, pipelineId: string) {
  if (stageId.includes("gate")) return `/gates/${stageId === "spec-review-gate" ? "gate-001" : "gate-002"}`;
  if (stageId === "spec") return "/clarifications/clr-001";
  return `/frs/${pipelineId}`;
}

function nextAction(stageId: StageId, severity: NotificationSeverity) {
  if (stageId.includes("gate")) return "去审批";
  if (stageId === "spec") return "去回复";
  if (severity === "critical") return "查看失败原因";
  return "查看 FR";
}

export default function NotificationPage() {
  const [page, setPage] = React.useState(1);
  const [severityFilter, setSeverityFilter] = React.useState<string>("");
  const pageSize = 20;

  const { data, isLoading, error, mutate } = useNotifications({
    page,
    pageSize,
    severity: severityFilter || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知中心"
        description="这里应该告诉你发生了什么，也告诉你下一步去哪里。每条通知都带明确动作入口，避免只读消息不闭环。"
        icon={<Bell className="h-5 w-5" />}
      />

      <Tabs value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="">全部</TabsTrigger>
          <TabsTrigger value="info">信息</TabsTrigger>
          <TabsTrigger value="warning">提醒</TabsTrigger>
          <TabsTrigger value="critical">关键</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : error ? (
        <ErrorState
          title="通知列表加载失败"
          description={error.message}
          action={RetryAction(() => {
            void mutate();
          })}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="当前没有通知"
          description={severityFilter ? "这个筛选条件下暂时没有通知，试试切回全部级别。" : "系统最近比较安静，没有新的提醒、告警或信息通知。"}
          action={
            severityFilter
              ? { label: "清空筛选", onClick: () => setSeverityFilter(""), variant: "outline" }
              : { label: "去看 FR 列表", href: "/frs" }
          }
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((notif) => {
            const config = SEVERITY_CONFIG[notif.severity];
            const href = notificationHref(notif.stageId, notif.pipelineId);
            const actionLabel = nextAction(notif.stageId, notif.severity);
            return (
              <Card key={notif.notificationId} className={`overflow-hidden transition-all hover:shadow-md hover:border-primary/40 ${notif.read ? "border-slate-200/70 bg-white/85" : "border-slate-300 bg-white"}`}>
                <CardContent className="p-0">
                  <div className="flex min-h-[152px]">
                    <div className={`w-2 flex-shrink-0 ${notif.severity === "critical" ? "bg-red-500" : notif.severity === "warning" ? "bg-amber-500" : "bg-blue-400"}`} />
                    <div className="flex flex-1 flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${config.className}`}>
                        {config.icon}
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-start gap-2">
                          <Badge className={config.className} variant="outline">
                            {config.label}
                          </Badge>
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                            {getStageLabel(notif.stageId)}
                          </Badge>
                          {!notif.read && (
                            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                              未读
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{notif.title}</h3>
                            {!notif.read && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                          </div>
                          <p className="text-sm leading-6 text-slate-700">{notif.message}</p>
                        </div>

                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          <span>FR：{notif.pipelineId}</span>
                          <span>{new Date(notif.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:w-[250px] lg:flex-shrink-0">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">下一步</p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">{actionLabel}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {notif.stageId.includes("gate")
                            ? "先看 blocker 和评审结论，再决定是否放行。"
                            : notif.stageId === "spec"
                              ? "补齐问题答案后，当前阶段才能继续推进。"
                              : notif.severity === "critical"
                                ? "优先确认失败或异常原因，避免继续扩散。"
                                : "进入详情页查看当前 FR 的完整上下文。"}
                        </p>
                      </div>
                      <Button asChild className="justify-between rounded-xl">
                        <Link href={href}>
                          {config.action}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={data?.total} />
    </div>
  );
}
