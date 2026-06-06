"use client";

import Link from "next/link";
import { GitBranch } from "lucide-react";
import type { CockpitPipelineSummary } from "@/types";
import { getCockpitLifecycleLabel } from "@/types";
import { formatDateTime, formatRelative, lifecycleStatusClass } from "@/lib/cockpit-format";
import { cn } from "@/lib/utils";

/** Shared pipeline list table — used by project detail and pipelines list. */
export function PipelineList({
  pipelines,
  showProject = false,
  emptyHint = "暂无流水线",
}: {
  pipelines: CockpitPipelineSummary[];
  showProject?: boolean;
  emptyHint?: string;
}) {
  if (pipelines.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
        <GitBranch className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-5 py-3 font-medium">流水线</th>
            {showProject && <th className="px-5 py-3 font-medium">项目</th>}
            <th className="px-5 py-3 font-medium">状态</th>
            <th className="px-5 py-3 font-medium">当前阶段</th>
            <th className="px-5 py-3 font-medium">创建时间</th>
            <th className="px-5 py-3 font-medium">最近推进</th>
          </tr>
        </thead>
        <tbody>
          {pipelines.map((pipeline) => (
            <tr
              key={pipeline.pipelineId}
              className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50"
            >
              <td className="px-5 py-3.5">
                <Link
                  href={`/pipelines/${encodeURIComponent(pipeline.pipelineId)}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {pipeline.title}
                </Link>
                <p className="font-mono text-[11px] text-slate-400">
                  {pipeline.pipelineId.slice(0, 8)}
                </p>
              </td>
              {showProject && (
                <td className="px-5 py-3.5 text-slate-600">{pipeline.projectSlug}</td>
              )}
              <td className="px-5 py-3.5">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    lifecycleStatusClass(pipeline.status),
                  )}
                >
                  {getCockpitLifecycleLabel(pipeline.status)}
                </span>
              </td>
              <td className="px-5 py-3.5 text-slate-700">{pipeline.currentStagePhrase}</td>
              <td className="px-5 py-3.5 text-slate-500">{formatDateTime(pipeline.createdAt)}</td>
              <td className="px-5 py-3.5 text-slate-500">
                {formatRelative(pipeline.lastAdvancedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
