"use client";

import * as React from "react";
import { useCrossProjectAnalytics } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Clock3, Gauge, Layers3, ShieldCheck, Users2 } from "lucide-react";
import { getStageLabel } from "@/types";

const RANGE_OPTIONS = [
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
  { value: "90d", label: "90 天" },
  { value: "all", label: "全部" },
] as const;

export default function AnalyticsPage() {
  const [range, setRange] = React.useState<(typeof RANGE_OPTIONS)[number]["value"]>("30d");
  const { data, isLoading, error } = useCrossProjectAnalytics(range);

  return (
    <div className="space-y-6">
      <PageHeader
        title="统计分析"
        description="这页看跨项目统计：交付周期、门禁一次通过率、阶段失败热区和不同执行者效率。MVP 先用 demo 数据把阅读路径跑通。"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <Tabs value={range} onValueChange={(value) => setRange(value as typeof range)}>
        <TabsList>
          {RANGE_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState
          title="跨项目统计加载失败"
          description={error.message}
        />
      ) : isLoading ? (
        <PageSkeleton variant="dashboard" />
      ) : !data ? (
        <EmptyState
          title="还没有统计数据"
          description="等项目和 FR 产生足够的流程数据后，这里会自动汇总跨项目统计。"
          action={{ label: "去看仪表盘", href: "/dashboard" }}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="活跃项目数" value={data.activeProjects} helper="当前仍在持续推进的项目数量。" icon={<Layers3 className="h-4 w-4" />} />
            <StatCard title="进行中 FR" value={data.inProgressFrs} helper="还在流水线中的需求总数。" icon={<Users2 className="h-4 w-4" />} valueClassName="text-blue-700" />
            <StatCard title="平均交付周期" value={`${data.averageDeliveryHours}h`} helper="从开始到完成的平均耗时。" icon={<Clock3 className="h-4 w-4" />} valueClassName="text-violet-700" />
            <StatCard title="门禁一次通过率" value={`${data.gateFirstPassRate}%`} helper="第一次评审就通过的比例。" icon={<ShieldCheck className="h-4 w-4" />} valueClassName="text-emerald-700" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader><CardTitle className="text-base">项目完成率与质量分布</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {data.projectStats.map((project) => (
                  <div key={project.projectId} className="rounded-2xl border border-slate-200 p-4 transition-all hover:shadow-sm hover:border-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{project.projectName}</p>
                        <p className="text-xs text-slate-500">{project.completedFrs}/{project.totalFrs} 已完成 · 平均 {project.averageCycleHours}h</p>
                      </div>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">完成率 {project.completionRate}%</Badge>
                    </div>
                    <div className="mt-3 h-3 rounded-full bg-slate-100">
                      <div className="h-3 rounded-full bg-slate-100" style={{ width: `${Math.max(8, project.completionRate)}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge className="bg-emerald-100 text-emerald-700">绿 {project.qualityDistribution.green}</Badge>
                      <Badge className="bg-amber-100 text-amber-700">黄 {project.qualityDistribution.yellow}</Badge>
                      <Badge className="bg-red-100 text-red-700">红 {project.qualityDistribution.red}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">阶段失败热力图</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.stageFailureHeatmap.map((item) => {
                  const intensity = Math.min(100, item.failures * 40 + item.blocked * 20 + item.retries * 10);
                  return (
                    <div key={item.stageId} className="rounded-2xl border border-slate-200 p-4 transition-all hover:shadow-sm hover:border-slate-300">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{getStageLabel(item.stageId)}</p>
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">热度 {intensity}</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                        <div>失败 {item.failures}</div>
                        <div>阻塞 {item.blocked}</div>
                        <div>重试 {item.retries}</div>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.max(4, intensity)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">执行者效率对比</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.agentEfficiency.map((agent) => (
                <div key={agent.agentId} className="rounded-2xl border border-slate-200 p-4 transition-all hover:shadow-sm hover:border-slate-300 hover:bg-slate-50/40">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{agent.agentId}</p>
                    <Gauge className="h-4 w-4 text-slate-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{agent.averageHours}h</p>
                  <p className="mt-1 text-sm text-slate-500">平均阶段耗时</p>
                  <div className="mt-3 text-xs text-slate-500">已完成 {agent.completedStages} · 进行中 {agent.activeStages}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
