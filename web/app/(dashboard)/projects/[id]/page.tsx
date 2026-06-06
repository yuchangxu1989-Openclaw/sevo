"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCockpitProjectDetail } from "@/lib/api-client";
import { PipelineList } from "@/components/pipeline-list";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectSlug = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] ?? null : null;
  const { data, error, isLoading } = useCockpitProjectDetail(projectSlug);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        返回项目列表
      </Link>

      {isLoading && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          正在加载项目详情…
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
            <h1 className="text-2xl font-bold text-slate-900">{data.projectName}</h1>
            <p className="mt-1 font-mono text-xs text-slate-400">{data.projectSlug}</p>
          </header>

          <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">FR 覆盖度</h2>
            {data.frCoverage ? (
              <div className="mt-3 flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{data.frCoverage.total}</p>
                  <p className="text-xs text-slate-500">总计</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">
                    {data.frCoverage.completed}
                  </p>
                  <p className="text-xs text-slate-500">已完成</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">
                    {data.frCoverage.remaining}
                  </p>
                  <p className="text-xs text-slate-500">待完成</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                该项目的流水线暂未登记 FR 覆盖信息
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              全部流水线（{data.pipelines.length}）
            </h2>
            <PipelineList
              pipelines={data.pipelines}
              emptyHint="该项目暂无流水线"
            />
          </section>
        </>
      )}
    </div>
  );
}
