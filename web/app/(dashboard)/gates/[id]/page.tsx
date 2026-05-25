"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useGateDetail, gateAction } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonSpinner, EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import type { GateDecisionStatus } from "@/types";
import { getStageLabel } from "@/types";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldX,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<GateDecisionStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: "待决策", className: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="h-4 w-4" /> },
  approved: { label: "已通过", className: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="h-4 w-4" /> },
  rejected: { label: "已拒绝", className: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="h-4 w-4" /> },
};

export default function GateDetailPage() {
  const params = useParams();
  const gateId = params.id as string;
  const { data: gate, isLoading, error, mutate } = useGateDetail(gateId);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleAction = async (action: "approve" | "reject" | "request-review") => {
    setActionLoading(action);
    setActionError(null);
    try {
      await gateAction(gateId, action);
      await mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Action failed";
      setActionError(message);
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <ErrorState
        title="门禁详情加载失败"
        description={error.message}
        action={RetryAction(() => {
          void mutate();
        })}
      />
    );
  }

  if (!gate) {
    return (
      <EmptyState
        title="门禁不存在或已结束"
        description="当前状态：没有找到这条门禁。可能原因：审批已经处理完成，或链接里的门禁 ID 已失效。下一步：返回风险与动作队列查看最新待处理项。"
        action={{ label: "返回风险与动作", href: "/todos?type=gate", variant: "outline" }}
      />
    );
  }

  const statusConfig = STATUS_CONFIG[gate.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/todos">
          <Button variant="ghost" size="icon" aria-label="返回待办队列">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={gate.gateName}
          description={`${gate.frCode} · ${getStageLabel(gate.stageId)} · ${gate.gateType}`}
          className="flex-1"
          actions={
            <Badge className={statusConfig.className} variant="outline">
              <span className="mr-1">{statusConfig.icon}</span>
              {statusConfig.label}
            </Badge>
          }
        />
      </div>

      {gate.status === "pending" && gate.blockers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                当前存在 {gate.blockers.length} 个 blocker，先看原因再做决策。
              </div>
              <p className="text-sm leading-6 text-amber-900/80">
                页面核心不是按钮，而是为什么现在还不能过。请先确认 blocker 是否已被真正解决。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {gate.blockers.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base text-amber-800">阻塞项</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {gate.blockers.map((b, i) => (
                <div key={i} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{b.item}</p>
                      <p className="text-sm text-slate-600">Owner：{b.owner}</p>
                    </div>
                    <Badge variant="outline" className="border-amber-200 bg-white text-amber-700">
                      未解决 blocker
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {gate.status === "pending" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">决策</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {actionError}
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              主操作只保留一个：如果 blocker 已解除，再放行。拒绝和重新评审都属于次级决策，应该降权处理。
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              <Button
                onClick={() => handleAction("approve")}
                disabled={actionLoading !== null}
                className="h-11 rounded-xl bg-emerald-600 px-5 hover:bg-emerald-700"
              >
                {actionLoading === "approve" ? <ButtonSpinner /> : <ShieldCheck className="mr-2 h-4 w-4" />} 通过审批
              </Button>
              <div className="flex flex-1 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleAction("request-review")}
                  disabled={actionLoading !== null}
                  className="rounded-xl"
                >
                  {actionLoading === "request-review" ? <ButtonSpinner /> : <RotateCcw className="mr-2 h-4 w-4" />} 请求重审
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAction("reject")}
                  disabled={actionLoading !== null}
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                >
                  {actionLoading === "reject" ? <ButtonSpinner /> : <ShieldX className="mr-2 h-4 w-4" />} 拒绝
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {gate.reviewBundles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">审查包</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {gate.reviewBundles.map((bundle) => (
                <div key={bundle.gateId + bundle.reviewer.agentId} className="rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">审查人：{bundle.reviewer.agentId}</p>
                      <p className="text-xs text-slate-500">{new Date(bundle.createdAt).toLocaleString()}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        bundle.conclusion === "passed"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : bundle.conclusion === "rejected"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-amber-100 text-amber-700 border-amber-200"
                      }
                    >
                      {bundle.conclusion}
                    </Badge>
                  </div>
                  {bundle.items.length > 0 && (
                    <div className="space-y-2">
                      {bundle.items.map((item, j) => (
                        <div key={j} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <Badge
                            variant="outline"
                            className={
                              item.severity === "blocker"
                                ? "text-red-600 border-red-300"
                                : item.severity === "major"
                                  ? "text-amber-600 border-amber-300"
                                  : "text-slate-500 border-slate-300"
                            }
                          >
                            {item.severity}
                          </Badge>
                          <span className="text-slate-700">{item.issue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {gate.decisionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">决策历史</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gate.decisionHistory.map((entry, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <Badge
                    variant="outline"
                    className={
                      entry.action === "approved"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : entry.action === "rejected"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-blue-100 text-blue-700 border-blue-200"
                    }
                  >
                    {entry.action}
                  </Badge>
                  <span className="font-medium text-slate-700">{entry.actorId}</span>
                  {entry.reason && <span className="flex-1 text-slate-600">{entry.reason}</span>}
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
