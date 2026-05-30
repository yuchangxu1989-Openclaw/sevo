"use client";

import * as React from "react";
import { useSettings } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import type {
  ProjectConfigView,
  StageConfigView,
  GateRuleConfigView,
  PrincipleView,
} from "@/types";
import { getStageLabel, getPrincipleCategoryLabel } from "@/types";
import {
  ChevronDown,
  ChevronRight,
  Cog,
  Layers,
  Scale,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Clock,
  FileText,
  FolderOpen,
} from "lucide-react";

/* ── Page ─────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings();
  const [expandedProject, setExpandedProject] = React.useState<string | null>(null);

  // Auto-expand first project — hook must be before conditional returns
  React.useEffect(() => {
    if (data && data.projects.length > 0 && expandedProject === null) {
      setExpandedProject(data.projects[0]!.projectSlug);
    }
  }, [data, expandedProject]);

  if (isLoading) return <PageSkeleton variant="list" />;
  if (error) return <ErrorState title="配置加载失败" description={error.message} />;
  if (!data || data.projects.length === 0) {
    return <EmptyState title="暂无项目配置" description="还没有配置任何项目。" />;
  }

  const toggleProject = (slug: string) => {
    setExpandedProject((prev) => (prev === slug ? null : slug));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="配置与设置"
        description="项目配置、阶段设置和原则集管理。"
      />

      {/* Project list */}
      <div className="space-y-4">
        {data.projects.map((project) => {
          const isExpanded = expandedProject === project.projectSlug;
          return (
            <Card key={project.projectSlug}>
              <button
                onClick={() => toggleProject(project.projectSlug)}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors rounded-t-lg"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-slate-600 shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-600 shrink-0" />
                )}
                <FolderOpen className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{project.projectName}</p>
                  <p className="text-xs text-slate-500">{project.projectSlug}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {project.adapter}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {project.stages.length} 阶段
                </Badge>
              </button>

              {isExpanded && (
                <CardContent className="space-y-6 border-t pt-4">
                  {/* Project info */}
                  <ProjectInfoSection project={project} />

                  {/* Stage config */}
                  <StageConfigSection stages={project.stages} />

                  {/* Gate rules */}
                  <GateRulesSection rules={project.rules} />

                  {/* Principles */}
                  <PrinciplesSection principles={project.principles} />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ── Project info ─────────────────────────────────────────────── */

function ProjectInfoSection({ project }: { project: ProjectConfigView }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
        <Cog className="h-4 w-4 text-slate-500" />
        项目配置
      </h3>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">适配器</p>
          <p className="text-sm font-medium text-slate-800">{project.adapter}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">需求规格路径</p>
          <p className="text-sm font-mono text-slate-700 truncate" title={project.specPath}>
            {project.specPath ? (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3 shrink-0" />
                {project.specPath}
              </span>
            ) : (
              <span className="text-slate-600">未配置</span>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">架构文档路径</p>
          <p className="text-sm font-mono text-slate-700 truncate" title={project.arcPath}>
            {project.arcPath ? (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3 shrink-0" />
                {project.arcPath}
              </span>
            ) : (
              <span className="text-slate-600">未配置</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Stage config ─────────────────────────────────────────────── */

function StageConfigSection({ stages }: { stages: StageConfigView[] }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
        <Layers className="h-4 w-4 text-slate-500" />
        阶段配置（{stages.length}）
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="pb-2 pr-4 font-medium text-slate-500 text-xs">阶段</th>
              <th className="pb-2 pr-4 font-medium text-slate-500 text-xs">状态</th>
              <th className="pb-2 pr-4 font-medium text-slate-500 text-xs">超时</th>
              <th className="pb-2 font-medium text-slate-500 text-xs">执行者</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.stageId} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-4">
                  <span className="font-medium text-slate-800">{stage.label}</span>
                  <span className="ml-2 text-xs text-slate-600 font-mono">{stage.stageId}</span>
                </td>
                <td className="py-2.5 pr-4">
                  {stage.enabled ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <ToggleRight className="h-4 w-4" /> 启用
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-600">
                      <ToggleLeft className="h-4 w-4" /> 禁用
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  {stage.timeoutSeconds ? (
                    <span className="flex items-center gap-1 text-slate-600">
                      <Clock className="h-3.5 w-3.5" />
                      {stage.timeoutSeconds >= 3600
                        ? `${stage.timeoutSeconds / 3600}h`
                        : `${stage.timeoutSeconds / 60}min`}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="py-2.5">
                  {stage.agentId ? (
                    <Badge variant="outline" className="text-xs">{stage.agentId}</Badge>
                  ) : (
                    <span className="text-slate-600 text-xs">自动分配</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Gate rules ───────────────────────────────────────────────── */

function GateRulesSection({ rules }: { rules: GateRuleConfigView[] }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
        <ShieldCheck className="h-4 w-4 text-slate-500" />
        门禁规则（{rules.length}）
      </h3>
      {rules.length === 0 ? (
        <p className="text-sm text-slate-500">暂无门禁规则。</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.ruleId}
              className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 font-mono">{rule.ruleId}</span>
                  <Badge
                    variant="outline"
                    className={
                      rule.severity === "blocker"
                        ? "text-red-600 border-red-200"
                        : "text-amber-600 border-amber-200"
                    }
                  >
                    {rule.severity === "blocker" ? "阻断" : "警告"}
                  </Badge>
                </div>
                {rule.description && (
                  <p className="mt-1 text-xs text-slate-600">{rule.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {rule.appliesTo.map((stageId) => (
                    <Badge key={stageId} variant="secondary" className="text-xs">
                      {getStageLabel(stageId)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Principles ───────────────────────────────────────────────── */

function PrinciplesSection({ principles }: { principles: PrincipleView[] }) {
  const grouped = React.useMemo(() => {
    const map = new Map<PrincipleView["category"], PrincipleView[]>();
    for (const p of principles) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return map;
  }, [principles]);

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
        <Scale className="h-4 w-4 text-slate-500" />
        原则集（{principles.length}）
      </h3>
      {principles.length === 0 ? (
        <p className="text-sm text-slate-500">暂无原则配置。</p>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {getPrincipleCategoryLabel(category)}
              </p>
              <div className="space-y-2">
                {items.map((principle) => (
                  <div
                    key={principle.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      principle.enabled
                        ? "border-slate-200 bg-white"
                        : "border-slate-100 bg-slate-50 opacity-60"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {principle.enabled ? (
                        <ToggleRight className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{principle.name}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{principle.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {principle.appliesTo.map((stageId) => (
                          <Badge key={stageId} variant="secondary" className="text-xs">
                            {getStageLabel(stageId)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
