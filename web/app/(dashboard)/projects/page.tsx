"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { useCockpitProjects } from "@/lib/api-client";
import { formatRelative } from "@/lib/cockpit-format";

export default function ProjectsPage() {
  const { data, error, isLoading } = useCockpitProjects();
  const projects = data?.projects ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">项目</h1>
        <p className="mt-1 text-sm text-slate-500">
          每个受管项目的活跃流水线数和最近推进时间
        </p>
      </header>

      {isLoading && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          正在加载项目…
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          加载项目失败：{error.message}
        </p>
      )}

      {!isLoading && !error && projects.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">暂无受管项目</p>
          <p className="mt-1 text-sm text-slate-500">
            当有项目注册到 SEVO 并产生流水线后，会显示在这里
          </p>
        </div>
      )}

      {projects.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">项目</th>
                <th className="px-5 py-3 font-medium">活跃流水线</th>
                <th className="px-5 py-3 font-medium">流水线总数</th>
                <th className="px-5 py-3 font-medium">最近推进</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.projectSlug}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/projects/${encodeURIComponent(project.projectSlug)}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {project.projectName}
                    </Link>
                    <p className="text-xs text-slate-400">{project.projectSlug}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={
                        project.activePipelineCount > 0
                          ? "inline-flex min-w-[1.75rem] justify-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                          : "text-slate-400"
                      }
                    >
                      {project.activePipelineCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{project.pipelineCount}</td>
                  <td className="px-5 py-3.5 text-slate-600">
                    {formatRelative(project.lastAdvancedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
