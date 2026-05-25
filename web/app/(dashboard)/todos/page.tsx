"use client";

import * as React from "react";
import Link from "next/link";
import { useTodos, useReviewTracking } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TodoType, TodoUrgency, IssueSeverity, ReviewIssueView } from "@/types";
import { AlertTriangle, ArrowRight, ClipboardList, MessageCircleQuestion, ShieldCheck, Wrench } from "lucide-react";

const TYPE_CONFIG: Record<TodoType, { label: string; action: string; icon: React.ReactNode; className: string }> = {
  gate: { label: "等待决策", action: "去审批", icon: <ShieldCheck className="h-4 w-4" />, className: "border-amber-400/25 bg-amber-400/10 text-amber-700" },
  failure: { label: "失败待恢复", action: "去恢复", icon: <AlertTriangle className="h-4 w-4" />, className: "border-red-400/25 bg-red-400/10 text-red-200" },
  clarification: { label: "澄清待回答", action: "去回答", icon: <MessageCircleQuestion className="h-4 w-4" />, className: "border-blue-400/25 bg-blue-400/10 text-blue-600" },
};

const URGENCY_TO_SEVERITY: Record<TodoUrgency, IssueSeverity> = {
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

const SEVERITY_CLASS: Record<IssueSeverity, string> = {
  P0: "border-red-400/30 bg-red-400/10 text-red-200",
  P1: "border-amber-400/30 bg-amber-400/10 text-amber-700",
  P2: "border-blue-400/30 bg-blue-400/10 text-blue-600",
  P3: "border-slate-400/20 bg-slate-400/10 text-slate-700",
};

function todoHref(todo: { type: TodoType; todoId: string; frId: string }): string {
  if (todo.type === "gate") return `/gates/${todo.todoId.replace("todo-gate-", "")}`;
  if (todo.type === "clarification") return `/clarifications/${todo.todoId.replace("todo-clr-", "")}`;
  return `/frs/${todo.frId}`;
}

function severityRank(severity: IssueSeverity) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[severity];
}

export default function TodosPage() {
  const [page, setPage] = React.useState(1);
  const [severityFilter, setSeverityFilter] = React.useState<IssueSeverity | "">("");
  const pageSize = 20;

  const { data, isLoading, error, mutate } = useTodos({ page, pageSize });
  const { data: reviews } = useReviewTracking();

  const reviewActions = React.useMemo(() => {
    return (reviews?.issues ?? [])
      .filter((issue) => !["closed", "waived"].includes(issue.status))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }, [reviews?.issues]);

  const actionItems = React.useMemo(() => {
    const todos = (data?.items ?? []).map((todo) => ({
      key: todo.todoId,
      title: todo.title,
      frCode: todo.frCode,
      frId: todo.frId,
      typeLabel: TYPE_CONFIG[todo.type].label,
      action: TYPE_CONFIG[todo.type].action,
      severity: URGENCY_TO_SEVERITY[todo.urgency],
      href: todoHref(todo),
      createdAt: todo.createdAt,
      summary: todo.summary,
      icon: TYPE_CONFIG[todo.type].icon,
      typeClass: TYPE_CONFIG[todo.type].className,
    }));
    const reviewItems = reviewActions.map((issue: ReviewIssueView) => ({
      key: `review-${issue.id}`,
      title: issue.fixDescription,
      frCode: issue.frCode,
      frId: issue.frId,
      typeLabel: "评审修复",
      action: "去修复",
      severity: issue.severity,
      href: `/reviews`,
      createdAt: issue.createdAt,
      summary: `${issue.artifact} · ${issue.status}`,
      icon: <Wrench className="h-4 w-4" />,
      typeClass: "border-violet-400/25 bg-violet-400/10 text-violet-700",
    }));
    return [...todos, ...reviewItems]
      .filter((item) => !severityFilter || item.severity === severityFilter)
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.createdAt.localeCompare(a.createdAt));
  }, [data?.items, reviewActions, severityFilter]);

  const totalPages = Math.ceil(actionItems.length / pageSize);
  const pagedItems = actionItems.slice((page - 1) * pageSize, page * pageSize);
  const cards = [
    { title: "等待决策", count: (data?.items ?? []).filter((item) => item.type === "gate").length, icon: <ShieldCheck className="h-5 w-5 text-amber-700" /> },
    { title: "失败待恢复", count: (data?.items ?? []).filter((item) => item.type === "failure").length, icon: <AlertTriangle className="h-5 w-5 text-red-700" /> },
    { title: "澄清待回答", count: (data?.items ?? []).filter((item) => item.type === "clarification").length, icon: <MessageCircleQuestion className="h-5 w-5 text-blue-600" /> },
  ];

  React.useEffect(() => setPage(1), [severityFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="风险与动作"
        description="门禁、失败、澄清、评审修复合成一条处理队列。每条只保留一个主动作。"
        icon={<ClipboardList className="h-5 w-5 text-violet-600" />}
        actions={<div className="rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-200">{actionItems.length} 个动作</div>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-center justify-between p-5">
              <div><p className="text-2xl font-black text-slate-950">{card.count}</p><p className="text-sm text-slate-500">{card.title}</p></div>
              {card.icon}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={severityFilter} onValueChange={(value) => setSeverityFilter(value as IssueSeverity | "")}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="">全部严重等级</TabsTrigger>
          <TabsTrigger value="P0">P0</TabsTrigger>
          <TabsTrigger value="P1">P1</TabsTrigger>
          <TabsTrigger value="P2">P2</TabsTrigger>
          <TabsTrigger value="P3">P3</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : error ? (
        <ErrorState title="风险与动作加载失败" description={error.message} action={RetryAction(() => void mutate())} />
      ) : pagedItems.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="当前无待处理风险"
          description="当前状态：处理队列是空的。为什么是空的：没有门禁、失败、澄清或评审修复项。下一步：回总览继续观察流水线。"
          action={severityFilter ? { label: "清空筛选", onClick: () => setSeverityFilter(""), variant: "outline" } : { label: "去看总览", href: "/dashboard" }}
        />
      ) : (
        <div className="space-y-3">
          {pagedItems.map((item) => (
            <Link key={item.key} href={item.href} className="block">
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={item.typeClass} variant="outline"><span className="mr-1">{item.icon}</span>{item.typeLabel}</Badge>
                        <Badge className={SEVERITY_CLASS[item.severity]} variant="outline">{item.severity}</Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">{item.frCode}</Badge>
                      </div>
                      <h3 className="truncate text-base font-semibold text-slate-950">{item.title}</h3>
                      <p className="line-clamp-1 text-sm text-slate-500">{item.summary}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center justify-center gap-1 rounded-2xl bg-amber-400 px-4 py-2 text-sm font-bold text-black transition-all hover:bg-amber-300">
                      {item.action}<ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={actionItems.length} />
    </div>
  );
}
