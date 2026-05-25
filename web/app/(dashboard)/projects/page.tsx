"use client";

import * as React from "react";
import Link from "next/link";
import { useProjects } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FolderKanban, ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";

const PAGE_SIZE = 20;

type ProjectStatus = "stable" | "active" | "risk";

function getProjectStatus(project: {
  failedCount: number;
  activeCount: number;
}): { label: string; badgeClass: string; glowColor: string; value: ProjectStatus } {
  if (project.failedCount > 0) {
    return {
      label: "有风险",
      badgeClass: "bg-red-500/20 text-red-400 border-red-500/30",
      glowColor: "group-hover:shadow-red-500/10",
      value: "risk",
    };
  }

  if (project.activeCount > 0) {
    return {
      label: "推进中",
      badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      glowColor: "group-hover:shadow-blue-500/10",
      value: "active",
    };
  }

  return {
    label: "运行稳定",
    badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    glowColor: "group-hover:shadow-blue-500/10",
    value: "stable",
  };
}

export default function ProjectsPage() {
  const { data, isLoading, error } = useProjects();
  const [page, setPage] = React.useState(1);

  const projects = data?.projects ?? [];
  const totalPages = Math.ceil(projects.length / PAGE_SIZE);

  const pagedProjects = React.useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [projects, page]);

  React.useEffect(() => {
    if (page > 1 && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="项目"
        description="先看项目状态，再决定往哪个 FR 矩阵钻。这里把项目名、当前状态、FR 数量和最近活跃感集中放到一屏里。"
        icon={<FolderKanban className="h-5 w-5" />}
      />

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : error ? (
        <ErrorState title="项目列表加载失败" description={error.message} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title="暂无项目"
          description="系统中还没有项目数据。"
          action={{ label: "去看仪表盘", href: "/dashboard" }}
        />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {pagedProjects.map((project) => {
              const progress = project.frCount > 0
                ? Math.round((project.completedCount / project.frCount) * 100)
                : 0;
              const status = getProjectStatus(project);

              return (
                <Link key={project.projectSlug} href={`/projects/${project.projectSlug}/fr-matrix`}>
                  <Card className={`group cursor-pointer h-full transition-all duration-300 hover:border-slate-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-slate-200/60 ${status.glowColor}`}>
                    <CardContent className="p-6 space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold text-slate-950 group-hover:text-blue-400 transition-colors">{project.projectName}</h3>
                          <p className="text-sm text-slate-500">{project.projectSlug}</p>
                        </div>
                        <Badge className={status.badgeClass}>
                          {status.label}
                        </Badge>
                      </div>

                      {/* Stats row */}
                      <div className="flex flex-wrap gap-2">
                        {project.completedCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {project.completedCount} 完成
                          </span>
                        )}
                        {project.activeCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400">
                            <Loader2 className="h-3 w-3" />
                            {project.activeCount} 进行中
                          </span>
                        )}
                        {project.failedCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400">
                            <XCircle className="h-3 w-3" />
                            {project.failedCount} 失败
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600">
                          FR {project.frCount}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">完成进度</span>
                          <span className="font-semibold text-slate-950">{progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-2 rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${progress}%`,
                              background: 'linear-gradient(90deg, #059669, #34d399)',
                              boxShadow: progress > 0 ? '0 0 8px rgba(52, 211, 153, 0.3)' : 'none',
                            }}
                          />
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <span className="text-xs text-slate-500">点击查看 FR 矩阵</span>
                        <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={projects.length} />
        </>
      )}
    </div>
  );
}
