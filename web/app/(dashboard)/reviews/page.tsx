"use client";

import * as React from "react";
import { useReviewTracking } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import type {
  IssueSeverity,
  ReviewIssueStatus,
  FixTaskStatus,
  RevalidationOutcome,
  ReviewIssueView,
  FixTaskView,
  RevalidationResultView,
} from "@/types";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Circle,
  Clock,
  Hammer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Ban,
  Filter,
} from "lucide-react";
import Link from "next/link";

/* ── Severity styling ─────────────────────────────────────────── */

const SEVERITY_STYLE: Record<IssueSeverity, { label: string; className: string; dotClass: string }> = {
  P0: { label: "P0 阻断", className: "bg-red-100 text-red-700 border-red-200", dotClass: "bg-red-500" },
  P1: { label: "P1 严重", className: "bg-orange-100 text-orange-700 border-orange-200", dotClass: "bg-orange-500" },
  P2: { label: "P2 一般", className: "bg-amber-100 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  P3: { label: "P3 建议", className: "bg-slate-100 text-slate-600 border-slate-200", dotClass: "bg-slate-400" },
};

const ISSUE_STATUS_STYLE: Record<ReviewIssueStatus, { label: string; className: string; icon: React.ReactNode }> = {
  open: { label: "待处理", className: "text-amber-600", icon: <Circle className="h-3.5 w-3.5" /> },
  fixing: { label: "修复中", className: "text-blue-600", icon: <Hammer className="h-3.5 w-3.5" /> },
  revalidating: { label: "复验中", className: "text-violet-600", icon: <RotateCcw className="h-3.5 w-3.5" /> },
  closed: { label: "已关闭", className: "text-emerald-600", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  deferred: { label: "已延期", className: "text-slate-500", icon: <Clock className="h-3.5 w-3.5" /> },
  waived: { label: "已豁免", className: "text-slate-600", icon: <Ban className="h-3.5 w-3.5" /> },
};

const FIX_STATUS_STYLE: Record<FixTaskStatus, { label: string; className: string }> = {
  pending: { label: "待开始", className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "进行中", className: "bg-blue-100 text-blue-700" },
  completed: { label: "已完成", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "已失败", className: "bg-red-100 text-red-700" },
  cancelled: { label: "已取消", className: "bg-slate-100 text-slate-500" },
};

const REVAL_STYLE: Record<RevalidationOutcome, { label: string; className: string; icon: React.ReactNode }> = {
  passed: { label: "通过", className: "text-emerald-600", icon: <ShieldCheck className="h-4 w-4" /> },
  failed: { label: "未通过", className: "text-red-600", icon: <XCircle className="h-4 w-4" /> },
  waived: { label: "已豁免", className: "text-slate-500", icon: <Ban className="h-4 w-4" /> },
};

/* ── Filter tabs ──────────────────────────────────────────────── */

type SeverityFilter = "all" | IssueSeverity;

const SEVERITY_TABS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "P0", label: "P0" },
  { value: "P1", label: "P1" },
  { value: "P2", label: "P2" },
  { value: "P3", label: "P3" },
];

/* ── Page ─────────────────────────────────────────────────────── */

export default function ReviewTrackingPage() {
  const { data, isLoading, error } = useReviewTracking();
  const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>("all");
  const [activeTab, setActiveTab] = React.useState<"issues" | "fixes" | "revalidations">("issues");

  if (isLoading) return <PageSkeleton variant="list" />;
  if (error) return <ErrorState title="评审追踪加载失败" description={error.message} />;
  if (!data) return <EmptyState title="暂无评审数据" description="还没有评审修复记录。" />;

  const { issues, fixTasks, revalidations, summary } = data;

  const filteredIssues = severityFilter === "all"
    ? issues
    : issues.filter((i) => i.severity === severityFilter);

  const filteredFixes = severityFilter === "all"
    ? fixTasks
    : fixTasks.filter((t) => {
        const issue = issues.find((i) => i.id === t.issueId);
        return issue?.severity === severityFilter;
      });

  const filteredRevalidations = severityFilter === "all"
    ? revalidations
    : revalidations.filter((r) => {
        const issue = issues.find((i) => i.id === r.issueId);
        return issue?.severity === severityFilter;
      });

  return (
    <div className="space-y-6">
      <PageHeader
        title="评审修复追踪"
        description="评审问题、修复任务和复验结果的全局视图。"
      />

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="P0 待处理"
          value={summary.p0Open}
          helper="阻断级问题，必须立即修复"
          valueClassName={summary.p0Open > 0 ? "text-red-600" : "text-emerald-600"}
        />
        <StatCard
          title="P1 待处理"
          value={summary.p1Open}
          helper="严重问题，需要尽快修复"
          valueClassName={summary.p1Open > 0 ? "text-orange-600" : "text-emerald-600"}
        />
        <StatCard
          title="修复进行中"
          value={summary.fixInProgress}
          helper="当前正在修复的任务数"
          valueClassName="text-blue-600"
        />
        <StatCard
          title="复验通过率"
          value={
            summary.revalidationsPassed + summary.revalidationsFailed > 0
              ? `${Math.round((summary.revalidationsPassed / (summary.revalidationsPassed + summary.revalidationsFailed)) * 100)}%`
              : "—"
          }
          helper="复验通过 / (通过 + 失败)"
          valueClassName="text-violet-600"
        />
      </div>

      {/* Severity filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-600" />
        <div className="flex gap-1">
          {SEVERITY_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSeverityFilter(tab.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                severityFilter === tab.value
                  ? "bg-slate-100 text-slate-950"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
              {tab.value !== "all" && (
                <span className="ml-1 opacity-70">
                  ({issues.filter((i) => i.severity === tab.value).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-slate-200">
        {([
          { key: "issues" as const, label: "评审问题", icon: <Bug className="h-4 w-4" />, count: filteredIssues.length },
          { key: "fixes" as const, label: "修复任务", icon: <Hammer className="h-4 w-4" />, count: filteredFixes.length },
          { key: "revalidations" as const, label: "复验结果", icon: <ShieldCheck className="h-4 w-4" />, count: filteredRevalidations.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "issues" && <IssueList issues={filteredIssues} />}
      {activeTab === "fixes" && <FixTaskList tasks={filteredFixes} issues={issues} />}
      {activeTab === "revalidations" && <RevalidationList revalidations={filteredRevalidations} issues={issues} />}
    </div>
  );
}

/* ── Issue list ───────────────────────────────────────────────── */

function IssueList({ issues }: { issues: ReviewIssueView[] }) {
  if (issues.length === 0) {
    return <EmptyState title="没有匹配的问题" description="当前筛选条件下没有评审问题。" />;
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => {
        const sev = SEVERITY_STYLE[issue.severity];
        const st = ISSUE_STATUS_STYLE[issue.status];
        return (
          <Card key={issue.id}>
            <CardContent className="flex items-start gap-4 p-4">
              <div className={`mt-1 h-2.5 w-2.5 rounded-full ${sev.dotClass} shrink-0`} />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={sev.className}>{sev.label}</Badge>
                  <span className={`flex items-center gap-1 text-xs font-medium ${st.className}`}>
                    {st.icon} {st.label}
                  </span>
                  <Badge variant="outline" className="text-xs">{issue.dimension}</Badge>
                  <span className="text-xs text-slate-600">
                    尝试 {issue.attemptCount}/{issue.maxAttempts}
                  </span>
                </div>
                <p className="text-sm text-slate-800">{issue.fixDescription}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <Link href={`/frs/${issue.frId}`} className="hover:text-blue-600 hover:underline">
                    {issue.frCode}
                  </Link>
                  <span className="font-mono">{issue.artifact}</span>
                  <span>{new Date(issue.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Fix task list ────────────────────────────────────────────── */

function FixTaskList({ tasks, issues }: { tasks: FixTaskView[]; issues: ReviewIssueView[] }) {
  if (tasks.length === 0) {
    return <EmptyState title="没有匹配的修复任务" description="当前筛选条件下没有修复任务。" />;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const issue = issues.find((i) => i.id === task.issueId);
        const sev = issue ? SEVERITY_STYLE[issue.severity] : null;
        const st = FIX_STATUS_STYLE[task.status];
        return (
          <Card key={task.id}>
            <CardContent className="flex items-start gap-4 p-4">
              <div className="mt-0.5 shrink-0">
                {task.status === "in_progress" ? (
                  <Hammer className="h-5 w-5 text-blue-500" />
                ) : task.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : task.status === "failed" ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <Clock className="h-5 w-5 text-slate-600" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className={st.className}>{st.label}</Badge>
                  {sev && <Badge variant="outline" className={sev.className}>{sev.label}</Badge>}
                  {task.assignee && (
                    <span className="text-xs text-slate-500">
                      指派: <span className="font-medium text-slate-700">{task.assignee}</span>
                    </span>
                  )}
                </div>
                {issue && <p className="text-sm text-slate-800">{issue.fixDescription}</p>}
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <Link href={`/frs/${task.frId}`} className="hover:text-blue-600 hover:underline">
                    {task.frCode}
                  </Link>
                  <span>创建: {new Date(task.createdAt).toLocaleDateString()}</span>
                  {task.completedAt && (
                    <span>完成: {new Date(task.completedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Revalidation list ────────────────────────────────────────── */

function RevalidationList({
  revalidations,
  issues,
}: {
  revalidations: RevalidationResultView[];
  issues: ReviewIssueView[];
}) {
  if (revalidations.length === 0) {
    return <EmptyState title="没有匹配的复验结果" description="当前筛选条件下没有复验记录。" />;
  }

  return (
    <div className="space-y-3">
      {revalidations.map((reval) => {
        const issue = issues.find((i) => i.id === reval.issueId);
        const sev = issue ? SEVERITY_STYLE[issue.severity] : null;
        const rv = REVAL_STYLE[reval.outcome];
        return (
          <Card key={`${reval.issueId}-${reval.fixTaskId}`}>
            <CardContent className="flex items-start gap-4 p-4">
              <div className={`mt-0.5 shrink-0 ${rv.className}`}>{rv.icon}</div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`flex items-center gap-1 text-sm font-medium ${rv.className}`}>
                    {rv.label}
                  </span>
                  {sev && <Badge variant="outline" className={sev.className}>{sev.label}</Badge>}
                  {reval.reviewer && (
                    <span className="text-xs text-slate-500">
                      复验人: <span className="font-medium text-slate-700">{reval.reviewer}</span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700">{reval.message}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <Link href={`/frs/${reval.frId}`} className="hover:text-blue-600 hover:underline">
                    {reval.frCode}
                  </Link>
                  <span>{new Date(reval.revalidatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
