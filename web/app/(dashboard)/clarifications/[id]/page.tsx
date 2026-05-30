"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useClarificationDetail, clarificationReply } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonSpinner, EmptyState, ErrorState, PageSkeleton, RetryAction } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import type { ClarificationStatus, ClarificationBlockingLevel } from "@/types";
import { getStageLabel } from "@/types";
import {
  ArrowLeft,
  MessageCircleQuestion,
  Send,
  Lock,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const RESOLUTION_CONFIG: Record<ClarificationStatus, { label: string; className: string }> = {
  open: { label: "待回复", className: "bg-amber-100 text-amber-700 border-amber-200" },
  resolved: { label: "已回复", className: "bg-blue-100 text-blue-700 border-blue-200" },
  settled: { label: "已落定", className: "bg-green-100 text-green-700 border-green-200" },
};

const BLOCKING_CONFIG: Record<ClarificationBlockingLevel, { label: string; className: string }> = {
  blocking: { label: "阻塞中", className: "bg-red-100 text-red-700 border-red-200" },
  "non-blocking": { label: "非阻塞", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

export default function ClarificationDetailPage() {
  const params = useParams();
  const clarificationId = params.id as string;
  const { data: thread, isLoading, error, mutate } = useClarificationDetail(clarificationId);
  const [replyContent, setReplyContent] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await clarificationReply(clarificationId, replyContent.trim());
      setReplyContent("");
      await mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reply failed";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <ErrorState
        title="澄清详情加载失败"
        description={error.message}
        action={RetryAction(() => {
          void mutate();
        })}
      />
    );
  }

  if (!thread) {
    return (
      <EmptyState
        title="没有找到这条澄清"
        description="它可能已经被关闭，或者当前数据还没同步完成。"
        action={{ label: "回到澄清待办", href: "/todos?type=clarification", variant: "outline" }}
      />
    );
  }

  const resolutionConfig = RESOLUTION_CONFIG[thread.resolutionStatus];
  const blockingConfig = BLOCKING_CONFIG[thread.blockingLevel];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/todos">
          <Button variant="ghost" size="icon" aria-label="返回待办队列">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="澄清问题"
          description={`${thread.frCode} · ${getStageLabel(thread.stageId)}`}
          icon={<MessageCircleQuestion className="h-5 w-5 text-blue-600" />}
          className="flex-1"
          actions={
            <div className="flex items-center gap-2">
              <Badge className={blockingConfig.className} variant="outline">
                {thread.blockingLevel === "blocking" && <Lock className="h-3 w-3 mr-1" />}
                {blockingConfig.label}
              </Badge>
              <Badge className={resolutionConfig.className} variant="outline">
                {resolutionConfig.label}
              </Badge>
            </div>
          }
        />
      </div>

      <Card className="border-blue-200 bg-blue-50/70">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">先把关键信息补齐，当前阶段才会继续前进。</p>
            <p className="text-sm leading-6 text-slate-700">
              这条澄清关联 {thread.frCode} 的 {getStageLabel(thread.stageId)} 阶段。
              {thread.blockingLevel === "blocking"
                ? " 现在不回复，当前流程会继续卡住。"
                : " 这条问题不阻塞主流程，但会影响后续质量。"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div className="inline-flex items-center gap-2 font-medium text-slate-800">
              <CalendarClock className="h-4 w-4 text-blue-600" />
              打开时间
            </div>
            <p className="mt-1">{new Date(thread.createdAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">问题</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-7 text-slate-900">{thread.question}</p>
          {thread.context && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <p className="mb-2 font-medium text-slate-800">上下文</p>
              {thread.context}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">回复记录（{thread.responses.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {thread.responses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-800">当前还没有回复。</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                建议至少覆盖三点：你的判断、边界条件、落地口径。回复后，当前阶段才会继续往前推。
              </p>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                <p className="font-medium text-slate-800">推荐回复格式</p>
                <p className="mt-2">结论：……</p>
                <p>边界：……</p>
                <p>执行口径：……</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {thread.responses.map((resp) => (
                <div key={resp.responseId} className="rounded-2xl border border-slate-200 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-800">{resp.actorId}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(resp.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{resp.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {thread.resolutionStatus === "open" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">回复并推动下一步</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              回复提交后，这条澄清会从“待回复”转成“已回复”。如果还需要更多上下文，请在内容里直接说清。 
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="请直接写结论、边界和执行口径"
                aria-label="输入澄清回复内容"
                disabled={submitting}
                className="h-12 rounded-xl"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500 inline-flex items-center gap-1.5">
                  回复后将推动 spec 继续前进
                  <ArrowRight className="h-4 w-4" />
                </p>
                <Button type="submit" disabled={submitting || !replyContent.trim()} className="rounded-xl">
                  {submitting ? <ButtonSpinner /> : <Send className="h-4 w-4 mr-2" />} 提交回复
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
