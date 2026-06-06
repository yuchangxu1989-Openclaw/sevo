"use client";

import { useCockpitPipelines } from "@/lib/api-client";
import { PipelineList } from "@/components/pipeline-list";

export default function PipelinesPage() {
  const { data, error, isLoading } = useCockpitPipelines();
  const pipelines = data?.pipelines ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">流水线</h1>
        <p className="mt-1 text-sm text-slate-500">
          每条流水线的状态、当前阶段、创建时间和最近推进时间
        </p>
      </header>

      {isLoading && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          正在加载流水线…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          加载流水线失败：{error.message}
        </p>
      )}

      {!isLoading && !error && (
        <PipelineList
          pipelines={pipelines}
          showProject
          emptyHint="暂无流水线"
        />
      )}
    </div>
  );
}
