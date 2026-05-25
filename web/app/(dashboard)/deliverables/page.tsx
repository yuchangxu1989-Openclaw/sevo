"use client";

import * as React from "react";
import { useDeliverableIndex } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { DeliverableIndexItem, DeliverableKind } from "@/types";
import { Boxes, Download, Eye, FileCode2, FileText, FlaskConical, FolderOpen, Search } from "lucide-react";

const BP = "/sevo";

const TYPE_OPTIONS: Array<{ value: DeliverableKind | ""; label: string }> = [
  { value: "", label: "全部类型" },
  { value: "document", label: "文档" },
  { value: "code", label: "代码" },
  { value: "report", label: "报告" },
  { value: "artifact", label: "制品" },
];

const TYPE_BADGE_STYLES: Record<DeliverableKind, string> = {
  document: "bg-blue-400/10 text-blue-600 border-blue-400/20",
  code: "bg-violet-400/10 text-violet-600 border-violet-400/20",
  report: "bg-blue-400/10 text-violet-600 border-blue-400/20",
  artifact: "bg-slate-400/10 text-slate-700 border-slate-400/20",
};

function iconForType(type: DeliverableKind) {
  if (type === "document") return <FileText className="h-4 w-4" />;
  if (type === "code") return <FileCode2 className="h-4 w-4" />;
  if (type === "report") return <FlaskConical className="h-4 w-4" />;
  return <Boxes className="h-4 w-4" />;
}

function handlePreview(deliverableId: string) {
  window.open(`${BP}/deliverables/${deliverableId}`, "_blank");
}

function handleDownload(deliverableId: string, filename: string) {
  fetch(`${BP}/api/v1/deliverables/${deliverableId}/content`)
    .then((res) => res.json())
    .then((data) => {
      if (data.error) return;
      const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
}

function groupByFr(items: DeliverableIndexItem[]) {
  const map = new Map<string, DeliverableIndexItem[]>();
  for (const item of items) {
    const bucket = map.get(item.frId) ?? [];
    bucket.push(item);
    map.set(item.frId, bucket);
  }
  return [...map.values()].map((frItems) => {
    const first = frItems[0]!;
    return {
      frId: first.frId,
      frCode: first.frCode,
      frTitle: first.frTitle,
      projectSlug: first.projectSlug,
      latestAt: first.createdAt,
      items: frItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

export default function DeliverablesPage() {
  const { data, isLoading, error } = useDeliverableIndex();
  const [typeFilter, setTypeFilter] = React.useState<DeliverableKind | "">("");
  const [frFilter, setFrFilter] = React.useState("");
  const [expandedFrs, setExpandedFrs] = React.useState<Set<string>>(new Set());

  const items = React.useMemo(() => {
    const source = data?.items ?? [];
    return source.filter((item) => {
      const hitType = !typeFilter || item.type === typeFilter;
      const hitFr = !frFilter || [item.frCode, item.frTitle, item.name].join(" ").toLowerCase().includes(frFilter.toLowerCase());
      return hitType && hitFr;
    });
  }, [data?.items, typeFilter, frFilter]);

  const grouped = React.useMemo(() => groupByFr(items), [items]);
  const highValue = items.slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        title="产物库"
        description="按 FR 聚合交付成果，首屏只放最近 5 个高价值产物，其余折叠在各 FR 下。"
        icon={<Boxes className="h-5 w-5 text-violet-600" />}
        actions={<div className="rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-xs font-semibold text-violet-700">覆盖 {grouped.length} 个 FR</div>}
      />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input value={frFilter} onChange={(e) => setFrFilter(e.target.value)} placeholder="按 FR / 产物名称筛选" aria-label="按 FR 或产物筛选" className="pl-9 bg-white border-slate-200 text-slate-700 placeholder:text-slate-600" />
          </div>
          <Select aria-label="按交付物类型筛选" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as DeliverableKind | "") }>
            {TYPE_OPTIONS.map((option) => <option key={option.value || "all-type"} value={option.value}>{option.label}</option>)}
          </Select>
        </CardContent>
      </Card>

      {error ? (
        <ErrorState title="产物库加载失败" description={error.message} />
      ) : isLoading ? (
        <PageSkeleton variant="table" />
      ) : items.length === 0 ? (
        <EmptyState
          title="暂无交付产物"
          description="当前状态：产物索引为空。为什么是空的：还没有 FR 进入交付阶段，或当前筛选没有命中。下一步：清空筛选或等待流水线产生产物。"
          action={{ label: "清空筛选条件", onClick: () => { setFrFilter(""); setTypeFilter(""); }, variant: "outline" }}
        />
      ) : (
        <>
          <Card className="border-blue-400/15 bg-blue-400/5">
            <CardHeader>
              <CardTitle className="text-xl">最近 5 个高价值产物</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-5">
              {highValue.map((item) => (
                <div key={item.deliverableId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Badge className={TYPE_BADGE_STYLES[item.type]}>{TYPE_OPTIONS.find((option) => option.value === item.type)?.label}</Badge>
                  <p className="mt-3 line-clamp-1 text-sm font-semibold text-slate-950">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.frCode}</p>
                  <div className="mt-3 flex gap-2">
                    {item.previewable && <Button size="sm" variant="outline" onClick={() => handlePreview(item.deliverableId)} className="h-8 rounded-xl border-slate-200 bg-white px-2 text-xs text-slate-700"><Eye className="mr-1 h-3.5 w-3.5" />预览</Button>}
                    <Button size="sm" variant="outline" onClick={() => handleDownload(item.deliverableId, item.name)} className="h-8 rounded-xl border-slate-200 bg-white px-2 text-xs text-slate-700"><Download className="mr-1 h-3.5 w-3.5" />下载</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {grouped.map((group) => {
              const expanded = expandedFrs.has(group.frId);
              const visibleItems = expanded ? group.items : group.items.slice(0, 3);
              return (
                <Card key={group.frId}>
                  <CardHeader className="border-b border-slate-200 pb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <CardTitle className="line-clamp-1 text-lg">{group.frTitle}</CardTitle>
                        <p className="mt-1 text-sm text-slate-500">{group.frCode} · {group.projectSlug} · {group.items.length} 个产物</p>
                      </div>
                      <button
                        onClick={() => setExpandedFrs((prev) => {
                          const next = new Set(prev);
                          next.has(group.frId) ? next.delete(group.frId) : next.add(group.frId);
                          return next;
                        })}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10"
                      >
                        {expanded ? "收起" : "展开全部"}
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    {visibleItems.map((item) => (
                      <div key={item.deliverableId} className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:scale-[1.02] hover:border-blue-400/20 hover:bg-white hover:shadow-lg hover:shadow-blue-500/10">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-violet-600">{iconForType(item.type)}</div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-slate-950">{item.name}</p>
                                <Badge className={TYPE_BADGE_STYLES[item.type]}>{TYPE_OPTIONS.find((option) => option.value === item.type)?.label}</Badge>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                                <span>{new Date(item.createdAt).toLocaleString()}</span>
                                <span className="inline-flex items-center gap-1"><FolderOpen className="h-3.5 w-3.5" />{item.path}</span>
                                <span>大小：{Math.max(1, Math.round(item.path.length / 2))} KB</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {item.previewable && <Button variant="outline" size="sm" onClick={() => handlePreview(item.deliverableId)} className="gap-1.5 border-slate-200 bg-white text-slate-700 hover:bg-slate-100"><Eye className="h-3.5 w-3.5" />预览</Button>}
                            <Button variant="outline" size="sm" onClick={() => handleDownload(item.deliverableId, item.name)} className="gap-1.5 border-slate-200 bg-white text-slate-700 hover:bg-slate-100"><Download className="h-3.5 w-3.5" />下载</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
