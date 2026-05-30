"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useFrMatrix } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserMacroStage, StageStatus } from "@/types";
import {
  ArrowLeft,
  Grid3X3,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Circle,
  Ban,
} from "lucide-react";
import Link from "next/link";

const MACRO_STAGES: UserMacroStage[] = ["specify", "plan", "implement", "review"];

const MACRO_LABELS: Record<UserMacroStage, string> = {
  specify: "需求澄清",
  plan: "方案规划",
  implement: "执行落地",
  review: "质量复核",
};

const MACRO_COLORS: Record<UserMacroStage, string> = {
  specify: "bg-blue-50 text-blue-800",
  plan: "bg-amber-50 text-amber-800",
  implement: "bg-purple-50 text-purple-800",
  review: "bg-green-50 text-green-800",
};

const STATUS_CELL: Record<StageStatus, { icon: React.ReactNode; bg: string; label: string }> = {
  pending: { icon: <Circle className="h-3.5 w-3.5 text-gray-400" />, bg: "", label: "待开始" },
  active: { icon: <Clock className="h-3.5 w-3.5 text-blue-500" />, bg: "bg-blue-50", label: "进行中" },
  blocked: { icon: <AlertCircle className="h-3.5 w-3.5 text-amber-500" />, bg: "bg-amber-50", label: "已阻塞" },
  "clarification-blocked": { icon: <AlertCircle className="h-3.5 w-3.5 text-orange-500" />, bg: "bg-orange-50", label: "待澄清" },
  passed: { icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />, bg: "bg-green-50", label: "已通过" },
  failed: { icon: <XCircle className="h-3.5 w-3.5 text-red-500" />, bg: "bg-red-50", label: "已失败" },
  skipped: { icon: <Ban className="h-3.5 w-3.5 text-gray-400" />, bg: "", label: "已跳过" },
};

export default function FrMatrixPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [statusFilter, setStatusFilter] = React.useState<string>("");

  const { data: matrix, isLoading, error } = useFrMatrix(projectId, {
    status: statusFilter || undefined,
  });

  if (isLoading) {
    return <PageSkeleton variant="table" />;
  }

  if (error) {
    return (
      <ErrorState
        title="FR 矩阵加载失败"
        description={error.message}
      />
    );
  }

  if (!matrix) {
    return (
      <EmptyState
        title="还没有矩阵数据"
        description="项目下还没有可用于矩阵展示的 FR。"
        action={{ label: "回到仪表盘", href: "/dashboard", variant: "outline" }}
      />
    );
  }

  const filteredFrs = statusFilter
    ? matrix.frs.filter((fr) =>
        MACRO_STAGES.some((stage) => fr.stages[stage].status === statusFilter)
      )
    : matrix.frs;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="icon" aria-label="返回项目列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="FR 矩阵"
          description={matrix.projectName}
          icon={<Grid3X3 className="h-5 w-5" />}
          className="flex-1"
        />
      </div>

      {/* Status filter */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="">全部</TabsTrigger>
          <TabsTrigger value="passed">已通过</TabsTrigger>
          <TabsTrigger value="active">进行中</TabsTrigger>
          <TabsTrigger value="failed">已失败</TabsTrigger>
          <TabsTrigger value="blocked">已阻塞</TabsTrigger>
          <TabsTrigger value="pending">待开始</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Matrix table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm" aria-label="FR 阶段矩阵">
            <caption className="sr-only">按宏阶段展示每个 FR 当前状态的矩阵表</caption>
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[180px]">
                  FR
                </th>
                {MACRO_STAGES.map((stage) => (
                  <th key={stage} className="p-3 text-center font-medium min-w-[120px]">
                    <Badge className={MACRO_COLORS[stage]} variant="secondary">
                      {MACRO_LABELS[stage]}
                    </Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredFrs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6">
                    <EmptyState
                      title="没有符合条件的 FR"
                      description="当前筛选条件下没有命中的需求，试试切回全部状态。"
                      action={statusFilter ? { label: "清空筛选", onClick: () => setStatusFilter(""), variant: "outline" } : undefined}
                    />
                  </td>
                </tr>
              ) : (
                filteredFrs.map((fr) => (
                  <tr key={fr.frId} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                    <td className="p-3 sticky left-0 bg-card z-10">
                      <Link href={`/frs/${fr.frId}`} className="hover:underline">
                        <span className="font-medium">{fr.frCode}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{fr.title}</p>
                    </td>
                    {MACRO_STAGES.map((stage) => {
                      const snapshot = fr.stages[stage];
                      const cell = STATUS_CELL[snapshot.status];
                      return (
                        <td key={stage} className={`p-3 text-center ${cell.bg}`}>
                          <div className="flex items-center justify-center gap-1.5">
                            {cell.icon}
                            <span className="text-xs hidden sm:inline">{cell.label}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(STATUS_CELL).map(([status, config]) => (
          <div key={status} className="flex items-center gap-1">
            {config.icon}
            <span>{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
