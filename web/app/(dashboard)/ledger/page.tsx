"use client";

import * as React from "react";
import { useLedger } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  getLedgerActionLabel,
  getLedgerOutcomeLabel,
  getStageLabel,
  type LedgerActionType,
} from "@/types";
import { BookOpenText, Search, ScrollText } from "lucide-react";

const ACTION_OPTIONS: Array<{ value: LedgerActionType | ""; label: string }> = [
  { value: "", label: "全部操作" },
  { value: "stage-passed", label: getLedgerActionLabel("stage-passed") },
  { value: "stage-failed", label: getLedgerActionLabel("stage-failed") },
  { value: "gate-approved", label: getLedgerActionLabel("gate-approved") },
  { value: "gate-rejected", label: getLedgerActionLabel("gate-rejected") },
  { value: "delivered", label: getLedgerActionLabel("delivered") },
  { value: "aborted", label: getLedgerActionLabel("aborted") },
];

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

export default function LedgerPage() {
  const { data, isLoading, error } = useLedger();
  const [frFilter, setFrFilter] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState<LedgerActionType | "">("");
  const [outcomeFilter, setOutcomeFilter] = React.useState<string>("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  const entries = React.useMemo(() => {
    const source = data?.entries ?? [];
    return source.filter((entry) => {
      const hitFr = !frFilter || [entry.frCode, entry.frTitle, entry.projectName].join(" ").toLowerCase().includes(frFilter.toLowerCase());
      const hitAction = !actionFilter || entry.actionType === actionFilter;
      const hitOutcome = !outcomeFilter || entry.outcome === outcomeFilter;
      return hitFr && hitAction && hitOutcome;
    });
  }, [data?.entries, frFilter, actionFilter, outcomeFilter]);

  const totalPages = Math.ceil(entries.length / pageSize);

  const pagedEntries = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, page, pageSize]);

  // Reset page when filters change
  React.useEffect(() => { setPage(1); }, [frFilter, actionFilter, outcomeFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="交付账本"
        description="交付账本按时间倒序展示所有流程留痕。你可以按时间、FR、操作类型过滤，点开就能看到每条记录挂着哪些证据。"
        icon={<BookOpenText className="h-5 w-5" />}
      />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1.2fr_repeat(2,minmax(0,220px))]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <Input className="pl-9" value={frFilter} onChange={(e) => setFrFilter(e.target.value)} placeholder="按时间范围外的 FR / Project 关键字筛选" aria-label="按 FR 或项目关键字筛选账本" />
          </div>
          <Select aria-label="按账本操作筛选" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as LedgerActionType | "") }>
            {ACTION_OPTIONS.map((option) => <option key={option.value || "all-action"} value={option.value}>{option.label}</option>)}
          </Select>
          <Select aria-label="按账本结论筛选" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
            <option value="">全部结论</option>
            <option value="delivered">已交付</option>
            <option value="aborted">已中止</option>
            <option value="in-progress">进行中</option>
          </Select>
        </CardContent>
      </Card>

      {error ? (
        <ErrorState
          title="账本加载失败"
          description={error.message}
        />
      ) : isLoading ? (
        <PageSkeleton variant="table" />
      ) : entries.length === 0 ? (
        <EmptyState
          title="当前筛选条件下没有账本记录"
          description="换个 FR、操作类型或结论再看，或者等系统产生新的留痕。"
          action={{ label: "清空筛选条件", onClick: () => {
            setFrFilter("");
            setActionFilter("");
            setOutcomeFilter("");
          }, variant: "outline" }}
        />
      ) : (
        <div className="space-y-3">
          {pagedEntries.map((entry) => {
            const outcomeStyle = OUTCOME_STYLES[entry.outcome] ?? {
              accent: "bg-blue-500",
              badge: "bg-blue-100 text-blue-700 border-blue-200",
            };
            const actionStyle = ACTION_STYLES[entry.actionType] ?? "border-slate-200 bg-slate-50 text-slate-700";
            return (
              <Card key={entry.entryId} className="overflow-hidden transition-all hover:shadow-md hover:border-primary/40">
                <CardContent className="p-0">
                  <div className="flex">
                    <div className={`w-2 flex-shrink-0 ${outcomeStyle.accent}`} />
                    <div className="flex-1 space-y-4 p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">{entry.frTitle}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{entry.frCode} · {entry.projectName} · {getStageLabel(entry.stageId)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={actionStyle}>{getLedgerActionLabel(entry.actionType)}</Badge>
                          <Badge variant="outline" className={outcomeStyle.badge}>{getLedgerOutcomeLabel(entry.outcome)}</Badge>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
                        <div className="space-y-2">
                          <p className="text-sm leading-6 text-slate-700">{entry.summary}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>{new Date(entry.timestamp).toLocaleString()}</span>
                            <span>工件 {entry.artifactCount} 个</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
                          证据链只展示引用，不把正文塞满这里。MVP 先支持路径级浏览，后续接点击跳转到真实渲染页。
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {entry.evidence.map((evidence) => (
                          <div key={`${entry.entryId}-${evidence.path}`} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
                            <ScrollText className="mt-0.5 h-4 w-4 text-slate-600" />
                            <div>
                              <p className="font-medium text-slate-900">{evidence.label}</p>
                              <p className="text-xs text-slate-500">{evidence.path}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={entries.length} />
    </div>
  );
}
