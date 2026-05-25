"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useFrDetail, frAction } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonSpinner, EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import type { UserMacroStage, StageStatus } from "@/types";
import { getStageLabel } from "@/types";
import {
  Pause,
  Play,
  XCircle,
  RotateCcw,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Ban,
  ArrowRight,
  ShieldAlert,
  Timer,
  Boxes,
  GitBranch,
  Route,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

const STATUS_ICONS: Record<StageStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-slate-600" />,
  active: <Clock className="h-4 w-4 text-blue-500" />,
  blocked: <AlertCircle className="h-4 w-4 text-amber-500" />,
  "clarification-blocked": <AlertCircle className="h-4 w-4 text-orange-500" />,
  passed: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  skipped: <Ban className="h-4 w-4 text-slate-600" />,
};

const MACRO_STAGE_STYLE: Record<UserMacroStage, { label: string; dot: string; card: string; tone: string }> = {
  specify: {
    label: "需求澄清",
    dot: "bg-blue-500",
    card: "border-blue-200 bg-blue-50/70",
    tone: "text-blue-700",
  },
  plan: {
    label: "方案规划",
    dot: "bg-amber-500",
    card: "border-amber-200 bg-amber-50/70",
    tone: "text-amber-700",
  },
  implement: {
    label: "执行落地",
    dot: "bg-violet-500",
    card: "border-violet-200 bg-violet-50/70",
    tone: "text-violet-700",
  },
  review: {
    label: "质量复核",
    dot: "bg-emerald-500",
    card: "border-emerald-200 bg-emerald-50/70",
    tone: "text-emerald-700",
  },
};

const STAGE_STATUS_TEXT: Record<StageStatus, string> = {
  pending: "待开始",
  active: "进行中",
  blocked: "已阻塞",
  "clarification-blocked": "待澄清",
  passed: "已通过",
  failed: "已失败",
  skipped: "已跳过",
};

function formatDuration(from?: string, to?: string) {
  if (!from) return "尚未开始";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function summaryForStatus(status: string) {
  switch (status) {
    case "failed":
      return "当前 FR 已失败，优先判断是否可恢复。";
    case "paused":
      return "当前 FR 处于暂停状态，通常意味着依赖未清。";
    case "completed":
      return "当前 FR 已完成，可重点检查交付物和质量结果。";
    default:
      return "当前 FR 正在推进，继续盯住当前阶段即可。";
  }
}

export default function FRDetailPage() {
  const params = useParams();
  const frId = params.id as string;
  const { data: fr, isLoading, error, mutate } = useFrDetail(frId);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleAction = async (action: "pause" | "resume" | "cancel" | "retry" | "abandon") => {
    setActionLoading(action);
    setActionError(null);
    try {
      await frAction(frId, action, fr?.version);
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
        title="FR 详情加载失败"
        description={error.message}
        action={RetryAction(() => {
          void mutate();
        })}
      />
    );
  }

  if (!fr) {
    return (
      <EmptyState
        title="没有找到这条 FR"
        description="这条需求可能还没同步完成，或者已经被移除。"
        action={{ label: "回到 FR 列表", href: "/frs", variant: "outline" }}
      />
    );
  }

  const currentEntry =
    fr.stageTimeline.find((entry) => entry.status === "active") ||
    fr.stageTimeline.find((entry) => entry.status === "failed") ||
    fr.stageTimeline.find((entry) => entry.stageId === fr.currentStage) ||
    fr.stageTimeline[0] || {
      stageId: fr.currentStage,
      macroStage: fr.currentMacroStage,
      status: "pending" as const,
      attempt: 1,
      artifacts: [],
    };

  const completedEntries = fr.stageTimeline.filter((entry) => entry.status === "passed" || entry.status === "skipped");
  const pendingEntries = fr.stageTimeline.filter((entry) => entry.status === "pending");
  const activeOrRiskEntries = fr.stageTimeline.filter((entry) => !completedEntries.includes(entry) && !pendingEntries.includes(entry));

  const failedStages = fr.stageTimeline.filter((entry) => entry.status === "failed");
  const blockingStages = fr.stageTimeline.filter(
    (entry) => entry.status === "blocked" || entry.status === "clarification-blocked"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/frs">
          <Button variant="ghost" size="icon" aria-label="返回 FR 列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader title={fr.title} description={fr.frCode} className="flex-1" />
      </div>

      <Card className="border-slate-200">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${MACRO_STAGE_STYLE[fr.currentMacroStage].card} ${MACRO_STAGE_STYLE[fr.currentMacroStage].tone}`} variant="outline">
              {MACRO_STAGE_STYLE[fr.currentMacroStage].label}
            </Badge>
            <Badge
              className={
                fr.status === "failed"
                  ? "border-red-200 bg-red-100 text-red-700"
                  : fr.status === "paused"
                    ? "border-amber-200 bg-amber-100 text-amber-700"
                    : fr.status === "completed"
                      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                      : "border-blue-200 bg-blue-100 text-blue-700"
              }
              variant="outline"
            >
              {fr.status}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              当前阶段 {getStageLabel(fr.currentStage)}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">5 秒摘要</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{summaryForStatus(fr.status)}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {failedStages.length > 0
                  ? `失败阶段：${failedStages.map((entry) => getStageLabel(entry.stageId)).join("、")}`
                  : blockingStages.length > 0
                    ? `阻塞阶段：${blockingStages.map((entry) => getStageLabel(entry.stageId)).join("、")}`
                    : `当前正在推进 ${getStageLabel(currentEntry.stageId)}。`}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">当前负责人</p>
              <p className="mt-2 text-base font-semibold text-slate-900">web-user</p>
              <p className="mt-2 text-sm text-slate-500">当前界面动作由 Web 侧触发</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">已耗时</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{formatDuration(currentEntry.startedAt, currentEntry.completedAt)}</p>
              <p className="mt-2 text-sm text-slate-500">基于当前阶段时间计算</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">下一步</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                {fr.status === "failed" ? "判断是否重试" : fr.status === "paused" ? "确认是否恢复" : "继续推进当前阶段"}
              </p>
              <p className="mt-2 text-sm text-slate-500">避免先点危险动作，再看上下文</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">快捷视图</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Link href={`/frs/${frId}/quality`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> 质量视图
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">质量审查、回归验证和结果确认集中查看。</p>
            </div>
          </Link>
          <Link href={`/frs/${frId}/timeline`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <GitBranch className="h-4 w-4 text-violet-600" /> 时间线
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">各阶段耗时、重试和超时点单独展开。</p>
            </div>
          </Link>
          <Link href={`/frs/${frId}/panorama`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Route className="h-4 w-4 text-blue-600" /> 全景路径
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">从需求澄清到结果确认的鸟瞰路径。</p>
            </div>
          </Link>
          <Link href={`/deliverables?fr=${encodeURIComponent(fr.frCode)}`}>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Boxes className="h-4 w-4 text-slate-600" /> 交付物
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">直接跳到当前 FR 的交付物索引。</p>
            </div>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {actionError}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            当前页面优先鼓励“恢复流程”。危险动作统一降到次级区，避免 Retry / Abandon 或 Pause / Cancel / Abandon 同时抢主视觉。
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="flex flex-wrap gap-2">
              {fr.status === "active" && (
                <Button size="sm" onClick={() => handleAction("pause")} disabled={actionLoading !== null} className="rounded-xl">
                  {actionLoading === "pause" ? <ButtonSpinner /> : <Pause className="mr-1 h-4 w-4" />} 暂停
                </Button>
              )}
              {fr.status === "paused" && (
                <Button size="sm" onClick={() => handleAction("resume")} disabled={actionLoading !== null} className="rounded-xl">
                  {actionLoading === "resume" ? <ButtonSpinner /> : <Play className="mr-1 h-4 w-4" />} 恢复执行
                </Button>
              )}
              {fr.status === "failed" && (
                <Button size="sm" onClick={() => handleAction("retry")} disabled={actionLoading !== null} className="rounded-xl">
                  {actionLoading === "retry" ? <ButtonSpinner /> : <RotateCcw className="mr-1 h-4 w-4" />} 重试流程
                </Button>
              )}
            </div>

            <div className="flex flex-1 flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 lg:justify-end">
              {(fr.status === "active" || fr.status === "paused") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction("cancel")}
                  disabled={actionLoading !== null}
                  className="rounded-xl"
                >
                  {actionLoading === "cancel" ? <ButtonSpinner /> : <XCircle className="mr-1 h-4 w-4" />} 取消
                </Button>
              )}
              {fr.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAction("abandon")}
                  disabled={actionLoading !== null}
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                >
                  {actionLoading === "abandon" ? <ButtonSpinner /> : <Trash2 className="mr-1 h-4 w-4" />} 放弃
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">阶段时间线</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">当前阶段</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{getStageLabel(currentEntry.stageId)}</p>
              <p className="mt-1 text-sm text-slate-500">{STAGE_STATUS_TEXT[currentEntry.status]}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">已完成阶段</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{completedEntries.length}</p>
              <p className="mt-1 text-sm text-slate-500">压缩展示，避免整页像日志。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">风险阶段</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{failedStages.length + blockingStages.length}</p>
              <p className="mt-1 text-sm text-slate-500">失败与阻塞优先暴露。</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">待开始</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{pendingEntries.length}</p>
              <p className="mt-1 text-sm text-slate-500">未开始阶段合并呈现。</p>
            </div>
          </div>

          <div className="space-y-3">
            {activeOrRiskEntries.map((entry) => {
              const stageStyle = MACRO_STAGE_STYLE[entry.macroStage];
              const isRisk = entry.status === "failed" || entry.status === "blocked" || entry.status === "clarification-blocked";
              return (
                <div key={entry.stageId} className={`rounded-2xl border p-4 ${isRisk ? "border-red-200 bg-red-50/70" : stageStyle.card}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">{STATUS_ICONS[entry.status]}</div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{getStageLabel(entry.stageId)}</p>
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                            {stageStyle.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              isRisk
                                ? "border-red-200 bg-red-100 text-red-700"
                                : entry.status === "active"
                                  ? "border-blue-200 bg-blue-100 text-blue-700"
                                  : "border-slate-200 bg-white text-slate-600"
                            }
                          >
                            {STAGE_STATUS_TEXT[entry.status]}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Timer className="h-4 w-4" />
                            {formatDuration(entry.startedAt, entry.completedAt)}
                          </span>
                          <span>第 {entry.attempt} 次尝试</span>
                          {entry.startedAt && <span>开始于 {new Date(entry.startedAt).toLocaleString()}</span>}
                          {entry.completedAt && <span>完成于 {new Date(entry.completedAt).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                      {isRisk
                        ? "这是当前重点风险阶段。"
                        : entry.status === "active"
                          ? "这是当前展开的执行阶段。"
                          : "状态已发生变化。"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {completedEntries.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 已完成阶段
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {completedEntries.map((entry) => (
                  <Badge key={entry.stageId} variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {getStageLabel(entry.stageId)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {pendingEntries.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ArrowRight className="h-4 w-4 text-slate-500" /> 待开始阶段
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingEntries.map((entry) => (
                  <Badge key={entry.stageId} variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {getStageLabel(entry.stageId)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {fr.artifacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">交付物</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {fr.artifacts.map((artifact) => (
                <div key={artifact.artifactId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2 text-slate-700">
                    <Boxes className="h-4 w-4 text-slate-600" />
                    <span className="font-medium break-all">{artifact.path}</span>
                    <span className="text-slate-500">({artifact.type})</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(artifact.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {fr.blockers.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base text-amber-800">阻塞项</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {fr.blockers.map((b, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900/90">
                  <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
