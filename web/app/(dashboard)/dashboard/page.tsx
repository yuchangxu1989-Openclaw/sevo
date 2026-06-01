"use client";

import Link from "next/link";
import { useDashboardSummary, useTodos } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { AlertTriangle, CheckCircle2, Clock3, GitBranch, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

function formatHealthSummary(healthScore: number, blockedFrs: number, failedFrs: number, riskItems: number) {
  if (failedFrs > 0) return `${failedFrs} 个 FR 失败待恢复，先把红灯灭掉。`;
  if (blockedFrs > 0) return `${blockedFrs} 个 FR 阻塞中，门禁和澄清优先处理。`;
  if (riskItems > 0) return `${riskItems} 个风险动作排队，先清 Top 3。`;
  if (healthScore >= 90) return "流水线健康，当前没有明显阻塞。";
  return "整体可控，继续盯阶段拥堵和待处理动作。";
}

export default function DashboardPage() {
  const { data: summary, isLoading, error, mutate } = useDashboardSummary();
  const { data: todos } = useTodos({ page: 1, pageSize: 3 });

  if (isLoading) return <PageSkeleton variant="dashboard" />;

  if (error) {
    return (
      <ErrorState
        title="总览加载失败"
        description={error.message}
        action={RetryAction(() => void mutate())}
      />
    );
  }

  if (!summary) {
    return (
      <EmptyState
        title="还没有总览数据"
        description="当前状态：没有 FR 进入系统。为什么是空的：流水线还没产生可汇总记录。下一步：先进入 FR 流水线查看需求。"
        action={{ label: "去看 FR 流水线", href: "/frs" }}
      />
    );
  }

  const completionRate = summary.totalFrs > 0 ? Math.round((summary.completedFrs / summary.totalFrs) * 100) : 0;
  const riskCount = summary.failedFrs + summary.blockedFrs + (todos?.total ?? 0);
  const stageCounts = summary.stageCounts;

  const riskItems = todos?.items ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="总览"
        description="先看一句话判断，再看流水线阶段堵在哪里，最后只处理最紧急的 3 个动作。"
        icon={<Sparkles className="h-5 w-5 text-violet-600" />}
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-gradient-to-r from-blue-500/15 to-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-700 shadow-lg shadow-slate-200/60">
            <TrendingUp className="h-3.5 w-3.5" />
            健康度 {summary.healthScore}% · 完成率 {completionRate}%
          </div>
        }
      />

      <Card className="overflow-hidden border-blue-400/20 bg-gradient-to-br from-blue-500/15 via-white/[0.055] to-violet-500/12">
        <CardContent className="p-6 lg:p-8">
          <div className="mb-4 flex justify-end">
            <DataSourceBadge type={summary.dataSources.systemCall.type} description={summary.dataSources.systemCall.description} />
          </div>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600/80">System Call</p>
              <h2 className="max-w-4xl text-3xl font-black leading-tight text-slate-950 md:text-4xl">
                {formatHealthSummary(summary.healthScore, summary.blockedFrs, summary.failedFrs, riskCount)}
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                当前纳入 {summary.totalFrs} 个 FR，推进中 {summary.activeFrs} 个，完成 {summary.completedFrs} 个，失败 {summary.failedFrs} 个。
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[360px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-2xl font-black text-violet-600">{summary.healthScore}%</p>
                <p className="mt-1 text-xs text-slate-500">健康</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-2xl font-black text-amber-700">{riskCount}</p>
                <p className="mt-1 text-xs text-slate-500">风险</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-2xl font-black text-slate-950">{completionRate}%</p>
                <p className="mt-1 text-xs text-slate-500">完成</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-xl">
                <GitBranch className="h-5 w-5 text-violet-600" />
                流水线阶段
              </CardTitle>
              <p className="text-sm text-slate-500">红色代表失败，琥珀色代表门禁或动作等待。移动端可横向滑动。</p>
            </div>
            <DataSourceBadge type={summary.dataSources.pipelineStages.type} description={summary.dataSources.pipelineStages.description} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2 md:overflow-visible">
            <div className="grid min-w-full grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-3 max-md:grid-cols-1 max-md:min-w-0">
              {stageCounts.map((stage, index) => (
                <Link key={stage.stageId} href={`/frs?stage=${stage.stageId}`} className="group relative">
                  {index < stageCounts.length - 1 && <span className="absolute left-[calc(100%-2px)] top-9 z-0 h-px w-5 bg-slate-100 max-md:left-4 max-md:top-[calc(100%-2px)] max-md:h-5 max-md:w-px" />}
                  <div className={`relative z-10 min-h-[118px] rounded-2xl border p-3 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl ${stage.hasRisk ? "border-amber-400/30 bg-amber-400/10 shadow-lg shadow-amber-950/20" : stage.count > 0 ? "border-blue-400/20 bg-blue-400/10 shadow-slate-200/60" : "border-slate-200 bg-white"}`}>
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black ${stage.hasRisk ? "bg-amber-400/20 text-amber-700" : stage.count > 0 ? "bg-blue-400/20 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                      {stage.count}
                    </div>
                    <p className="text-xs font-semibold text-slate-900">{stage.label}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-600">{stage.shortLabel}</p>
                    {stage.hasRisk && <p className="mt-2 text-[10px] font-semibold text-amber-700">需处理</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
                风险队列 Top 3
              </CardTitle>
              <DataSourceBadge type={summary.dataSources.riskQueue.type} description={summary.dataSources.riskQueue.description} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {riskItems.length === 0 ? (
              <EmptyState
                title="当前无待处理风险"
                description="当前状态：没有门禁、澄清或失败恢复排队。为什么是空的：流水线没有产生阻塞动作。下一步：继续观察阶段迁移。"
                action={{ label: "查看风险与动作", href: "/todos", variant: "outline" }}
              />
            ) : riskItems.map((item) => (
              <Link key={item.todoId} href={item.type === "gate" ? `/gates/${item.todoId.replace("todo-gate-", "")}` : item.type === "clarification" ? `/clarifications/${item.todoId.replace("todo-clr-", "")}` : `/frs/${item.frId}`} className="block rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:scale-[1.02] hover:border-amber-400/30 hover:bg-amber-400/10 hover:shadow-lg hover:shadow-amber-500/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.frCode} · 已等待 {item.waitDuration}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-black">
                    {item.type === "gate" ? "去审批" : item.type === "clarification" ? "去回复" : "恢复"}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-xl">运行指标</CardTitle>
              <DataSourceBadge type={summary.dataSources.runtimeMetrics.type} description={summary.dataSources.runtimeMetrics.description} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Link href="/frs?status=failed" className="rounded-2xl border border-red-400/15 bg-red-400/10 p-4 transition-all hover:bg-red-400/15">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-700" />
                <div><p className="text-2xl font-black text-slate-950">{summary.failedFrs}</p><p className="text-xs text-slate-500">失败待恢复</p></div>
              </div>
            </Link>
            <Link href="/todos?type=gate" className="rounded-2xl border border-amber-400/15 bg-amber-400/10 p-4 transition-all hover:bg-amber-400/15">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-amber-700" />
                <div><p className="text-2xl font-black text-slate-950">{riskItems.filter((item) => item.type === "gate").length}</p><p className="text-xs text-slate-500">门禁等待</p></div>
              </div>
            </Link>
            <Link href="/frs?status=active" className="rounded-2xl border border-blue-400/15 bg-blue-400/10 p-4 transition-all hover:bg-blue-400/15">
              <div className="flex items-center gap-3">
                <Clock3 className="h-5 w-5 text-violet-600" />
                <div><p className="text-2xl font-black text-slate-950">{summary.activeFrs}</p><p className="text-xs text-slate-500">正在推进</p></div>
              </div>
            </Link>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-violet-600" />
                <div><p className="text-2xl font-black text-slate-950">{summary.completedFrs}</p><p className="text-xs text-slate-500">已进账本</p></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
