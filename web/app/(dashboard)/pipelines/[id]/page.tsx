"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, CircleDot, FileText, MinusCircle, ShieldCheck, XCircle } from "lucide-react";
import type { CockpitTimelineStage } from "@/types";
import type { StageStatus } from "@/types";
import { getCockpitLifecycleLabel } from "@/types";
import { useCockpitPipelineDetail } from "@/lib/api-client";
import { formatDateTime, lifecycleStatusClass } from "@/lib/cockpit-format";
import { cn } from "@/lib/utils";

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
    case "active":
      return <CircleDot className="h-5 w-5 text-blue-600" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-600" />;
    case "blocked":
    case "clarification-blocked":
      return <AlertTriangle className="h-5 w-5 text-amber-600" />;
    case "skipped":
      return <MinusCircle className="h-5 w-5 text-slate-400" />;
    case "pending":
    default:
      return <Circle className="h-5 w-5 text-slate-300" />;
  }
}

function TimelineRow({ stage, isLast }: { stage: CockpitTimelineStage; isLast: boolean }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!isLast && (
        <span className="absolute left-[9px] top-6 h-full w-px bg-slate-200" aria-hidden />
      )}
      <span className="relative z-10 mt-0.5 bg-white">
        <StageIcon status={stage.status} />
      </span>
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium text-slate-900">{stage.label}</span>
          <span className="text-xs text-slate-500">{stage.statusPhrase}</span>
          <span className="font-mono text-[11px] text-slate-300">{stage.stageId}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-slate-500">
          <span>进入：{formatDateTime(stage.startedAt)}</span>
          <span>完成：{formatDateTime(stage.completedAt)}</span>
        </div>

        {stage.skipReason && (
          <p className="mt-1.5 text-xs text-slate-500">跳过原因：{stage.skipReason}</p>
        )}

        {stage.artifacts.length > 0 && (
          <ul className="mt-2 space-y-1">
            {stage.artifacts.map((artifact) => (
              <li key={artifact.artifactId} className="flex items-center gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-700">{artifact.path}</span>
                {artifact.type && (
                  <span className="text-slate-400">· {artifact.type}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function PipelineDetailPage() {
  const params = useParams();
  const pipelineId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] ?? null : null;
  const { data, error, isLoading } = useCockpitPipelineDetail(pipelineId);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/pipelines"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        返回流水线列表
      </Link>

      {isLoading && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          正在加载流水线详情…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          加载失败：{error.message}
        </p>
      )}

      {data && (
        <>
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{data.title}</h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  lifecycleStatusClass(data.status),
                )}
              >
                {getCockpitLifecycleLabel(data.status)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              <Link
                href={`/projects/${encodeURIComponent(data.projectSlug)}`}
                className="hover:text-slate-900 hover:underline"
              >
                项目：{data.projectName}
              </Link>
              <span>当前：{data.currentStagePhrase}</span>
              <span>创建：{formatDateTime(data.createdAt)}</span>
              <span className="font-mono text-slate-300">{data.pipelineId}</span>
            </div>
          </header>

          <section className="mb-6">
            {data.blocker.blocked ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">
                    当前阻塞{data.blocker.stagePhrase ? `：${data.blocker.stagePhrase}` : ""}
                  </span>
                </div>
                {data.blocker.reason && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">
                    {data.blocker.reason}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">当前无阻塞</span>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-sm font-semibold text-slate-900">阶段时间轴</h2>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              {data.timeline.length === 0 ? (
                <p className="text-sm text-slate-500">该流水线暂无阶段数据</p>
              ) : (
                <ol>
                  {data.timeline.map((stage, index) => (
                    <TimelineRow
                      key={stage.stageId}
                      stage={stage}
                      isLast={index === data.timeline.length - 1}
                    />
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
