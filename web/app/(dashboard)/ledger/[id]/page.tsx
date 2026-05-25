"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenText, ScrollText } from "lucide-react";
import { useLedger } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { getLedgerActionLabel, getLedgerOutcomeLabel, getStageLabel } from "@/types";

const OUTCOME_STYLES: Record<string, { accent: string; badge: string }> = {
  delivered: { accent: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  aborted: { accent: "bg-red-500", badge: "bg-red-100 text-red-700 border-red-200" },
  "in-progress": { accent: "bg-blue-500", badge: "bg-blue-100 text-blue-700 border-blue-200" },
};

const ACTION_STYLES: Record<string, string> = {
  "stage-passed": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "stage-failed": "border-red-200 bg-red-50 text-red-700",
  "gate-approved": "border-green-200 bg-green-50 text-green-700",
  "gate-rejected": "border-amber-200 bg-amber-50 text-amber-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  aborted: "border-red-200 bg-red-50 text-red-700",
};

export default function LedgerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useLedger();

  const item = React.useMemo(
    () => data?.entries.find((entry) => entry.entryId === params.id),
    [data?.entries, params.id],
  );

  const outcomeStyle = item ? OUTCOME_STYLES[item.outcome] ?? OUTCOME_STYLES["in-progress"] : null;
  const actionStyle = item ? ACTION_STYLES[item.actionType] ?? "border-slate-200 bg-slate-50 text-slate-700" : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={item?.frTitle ?? "账本详情"}
        description={item ? `${item.frCode} · ${item.projectName} · ${getStageLabel(item.stageId)}` : "查看单条账本记录的摘要、结论和证据链。"}
        icon={<BookOpenText className="h-5 w-5" />}
        actions={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/ledger">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回交付账本
            </Link>
          </Button>
        }
      />

      {error ? (
        <ErrorState title="账本详情加载失败" description={error.message} />
      ) : isLoading ? (
        <PageSkeleton variant="detail" />
      ) : !item || !outcomeStyle ? (
        <EmptyState title="没有找到这条账本记录" description="这条记录可能已经不存在，或者当前 mock 数据里还没生成它。" action={{ label: "返回交付账本", href: "/ledger", variant: "outline" }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={actionStyle}>{getLedgerActionLabel(item.actionType)}</Badge>
                <Badge variant="outline" className={outcomeStyle.badge}>{getLedgerOutcomeLabel(item.outcome)}</Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{getStageLabel(item.stageId)}</Badge>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm leading-7 text-slate-700">{item.summary}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">证据链</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {item.evidence.map((evidence) => (
                    <div key={`${item.entryId}-${evidence.path}`} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <ScrollText className="mt-0.5 h-4 w-4 text-slate-600" />
                      <div>
                        <p className="font-medium text-slate-900">{evidence.label}</p>
                        <p className="text-xs text-slate-500 break-all">{evidence.path}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">记录时间</p>
                <p className="mt-2 text-sm text-slate-700">{new Date(item.timestamp).toLocaleString()}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">工件数量</p>
                <p className="mt-2 text-sm text-slate-700">{item.artifactCount} 个</p>
              </div>

              <Button asChild className="w-full rounded-xl">
                <Link href={`/frs/${item.frId}`}>
                  跳转到对应 FR
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
