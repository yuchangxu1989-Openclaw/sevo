"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Boxes, FileCode2, FileText, FlaskConical, FolderOpen, Download, ShieldCheck } from "lucide-react";
import { useDeliverableIndex } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";

const BP = "/sevo";

const TYPE_STYLES = {
  document: "border-blue-200 bg-blue-50 text-blue-700",
  code: "border-violet-200 bg-violet-50 text-violet-700",
  report: "border-emerald-200 bg-emerald-50 text-emerald-700",
  artifact: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

function iconForType(type: keyof typeof TYPE_STYLES) {
  switch (type) {
    case "document":
      return <FileText className="h-4 w-4" />;
    case "code":
      return <FileCode2 className="h-4 w-4" />;
    case "report":
      return <FlaskConical className="h-4 w-4" />;
    default:
      return <Boxes className="h-4 w-4" />;
  }
}

function MarkdownRenderer({ content }: { content: string }) {
  // Simple markdown to HTML rendering
  const html = React.useMemo(() => {
    return content
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-800 mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-slate-800 mt-5 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-900 mt-6 mb-3">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-slate-700">$1</li>')
      .replace(/^---$/gm, '<hr class="my-4 border-slate-200" />')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }, [content]);

  return (
    <div
      className="prose prose-sm prose-slate max-w-none leading-7"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function DeliverableDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useDeliverableIndex();
  const [content, setContent] = React.useState<string | null>(null);
  const [contentLoading, setContentLoading] = React.useState(false);

  const item = React.useMemo(
    () => data?.items.find((entry) => entry.deliverableId === params.id),
    [data?.items, params.id],
  );

  React.useEffect(() => {
    if (!params.id) return;
    setContentLoading(true);
    fetch(`${BP}/api/v1/deliverables/${params.id}/content`)
      .then((res) => res.json())
      .then((data) => {
        if (data.content) setContent(data.content);
      })
      .catch(() => {})
      .finally(() => setContentLoading(false));
  }, [params.id]);

  function handleDownload() {
    if (!content || !item) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item?.name ?? "交付物详情"}
        description={item ? `${item.frCode} · ${item.frTitle}` : "查看交付物内容。"}
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            {content && (
              <Button variant="outline" className="rounded-xl gap-1.5" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                下载
              </Button>
            )}
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/deliverables">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回列表
              </Link>
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState title="交付物详情加载失败" description={error.message} />
      ) : isLoading ? (
        <PageSkeleton variant="detail" />
      ) : !item ? (
        <EmptyState title="没有找到这条交付物" description="这条交付物可能已经不存在。" action={{ label: "返回交付物列表", href: "/deliverables", variant: "outline" }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* Content preview */}
          <Card>
            <CardContent className="p-6">
              {contentLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 rounded w-5/6" />
                </div>
              ) : content ? (
                item.previewable ? (
                  <MarkdownRenderer content={content} />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-200">
                    {content}
                  </pre>
                )
              ) : (
                <p className="text-sm text-slate-500">无法加载内容预览。</p>
              )}
            </CardContent>
          </Card>

          {/* Metadata sidebar */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={TYPE_STYLES[item.type]}>
                  {iconForType(item.type)}
                  <span className="ml-1">{item.type}</span>
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">{item.projectSlug}</Badge>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">阶段</p>
                <p className="mt-1 text-sm text-slate-800">{item.stageLabel}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">来源 FR</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{item.frCode}</p>
                <p className="text-sm text-slate-600">{item.frTitle}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">文件路径</p>
                <p className="mt-1 inline-flex items-start gap-1.5 text-xs text-slate-600 font-mono">
                  <FolderOpen className="mt-0.5 h-3.5 w-3.5 text-slate-600 shrink-0" />
                  <span className="break-all">{item.path}</span>
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">入库时间</p>
                <p className="mt-1 text-sm text-slate-700">{new Date(item.createdAt).toLocaleString()}</p>
              </div>

              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <ShieldCheck className="h-4 w-4" />
                  交付记录
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {item.frCode} 在 {item.stageLabel} 阶段生成该产物，入库时间 {new Date(item.createdAt).toLocaleString()}，路径指纹 {item.path}。
                </p>
              </div>

              <Button asChild variant="outline" className="w-full rounded-xl text-sm">
                <Link href={`/frs/${item.frId}`}>跳转到对应 FR</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
