"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useFrQuality } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/page-states";
import { PageHeader } from "@/components/ui/page-header";
import type { StageStatus } from "@/types";
import {
  ArrowLeft,
  ShieldCheck,
  TestTube2,
  ScanSearch,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Circle,
  Ban,
} from "lucide-react";
import Link from "next/link";

const STATUS_DISPLAY: Record<StageStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: "待处理", className: "text-gray-500", icon: <Circle className="h-4 w-4" /> },
  active: { label: "进行中", className: "text-blue-500", icon: <Clock className="h-4 w-4 animate-pulse" /> },
  blocked: { label: "已阻塞", className: "text-amber-500", icon: <AlertCircle className="h-4 w-4" /> },
  "clarification-blocked": { label: "待澄清", className: "text-orange-500", icon: <AlertCircle className="h-4 w-4" /> },
  passed: { label: "已通过", className: "text-green-500", icon: <CheckCircle2 className="h-4 w-4" /> },
  failed: { label: "已失败", className: "text-red-500", icon: <XCircle className="h-4 w-4" /> },
  skipped: { label: "已跳过", className: "text-gray-400", icon: <Ban className="h-4 w-4" /> },
};

const AUDIT_DISPLAY: Record<string, { label: string; className: string }> = {
  pending: { label: "待处理", className: "bg-gray-100 text-gray-700" },
  "in-progress": { label: "进行中", className: "bg-blue-100 text-blue-700" },
  passed: { label: "已通过", className: "bg-green-100 text-green-700" },
  failed: { label: "已失败", className: "bg-red-100 text-red-700" },
};

function ScoreRing({ value, label }: { value: number; label: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 80 ? "text-emerald-500" : value >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
        <circle cx="44" cy="44" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={color} />
      </svg>
      <span className={`text-xl font-bold ${color}`}>{value}%</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default function FrQualityPage() {
  const params = useParams();
  const frId = params.id as string;
  const { data: quality, isLoading, error } = useFrQuality(frId);

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (error) {
    return (
      <ErrorState
        title="质量视图加载失败"
        description={error.message}
      />
    );
  }

  if (!quality) {
    return (
      <EmptyState
        title="还没有质量数据"
        description="审查、回归或结果确认的数据还没回流到这里。"
        action={{ label: "回到 FR 详情", href: `/frs/${frId}`, variant: "outline" }}
      />
    );
  }

  const reviewDisplay = STATUS_DISPLAY[quality.reviewStatus];
  const regressionDisplay = STATUS_DISPLAY[quality.regressionStatus];
  const verifyDisplay = STATUS_DISPLAY[quality.verifyStatus];
  const auditDisplay = AUDIT_DISPLAY[quality.auditStatus] ?? AUDIT_DISPLAY["pending"]!;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/frs/${frId}`}>
          <Button variant="ghost" size="icon" aria-label="返回 FR 详情">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader title={quality.title} description={`${quality.frCode} · 质量视图`} className="flex-1" />
      </div>

      {/* Score rings */}
      <Card>
        <CardContent className="flex items-center justify-center gap-8 py-6 flex-wrap">
          <ScoreRing value={quality.qualityScore} label="质量得分" />
          <ScoreRing value={quality.testCoverage} label="测试覆盖率" />
        </CardContent>
      </Card>

      {/* Stage statuses */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldCheck className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-muted-foreground">审计状态</p>
              <Badge className={auditDisplay.className} variant="secondary">{auditDisplay.label}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className={reviewDisplay.className}>{reviewDisplay.icon}</span>
            <div>
              <p className="text-xs text-muted-foreground">评审</p>
              <span className={`text-sm font-medium ${reviewDisplay.className}`}>{reviewDisplay.label}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TestTube2 className={`h-5 w-5 ${regressionDisplay.className}`} />
            <div>
              <p className="text-xs text-muted-foreground">回归</p>
              <span className={`text-sm font-medium ${regressionDisplay.className}`}>{regressionDisplay.label}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ScanSearch className={`h-5 w-5 ${verifyDisplay.className}`} />
            <div>
              <p className="text-xs text-muted-foreground">验证</p>
              <span className={`text-sm font-medium ${verifyDisplay.className}`}>{verifyDisplay.label}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            问题项（{quality.issues.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quality.issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无问题</p>
          ) : (
            <div className="space-y-2">
              {quality.issues.map((issue) => (
                <div key={issue.issueId} className="flex items-center gap-3 p-2 rounded border text-sm">
                  <Badge
                    variant="outline"
                    className={
                      issue.severity === "blocker"
                        ? "text-red-600 border-red-300"
                        : issue.severity === "major"
                          ? "text-amber-600 border-amber-300"
                          : "text-gray-500 border-gray-300"
                    }
                  >
                    {issue.severity === "blocker"
                      ? "阻断"
                      : issue.severity === "major"
                        ? "主要"
                        : "轻微"}
                  </Badge>
                  <span className="flex-1">{issue.description}</span>
                  <Badge variant="outline" className="text-xs">{issue.stage}</Badge>
                  <Badge
                    variant="secondary"
                    className={issue.status === "open" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}
                  >
                    {issue.status === "open" ? "待处理" : "已关闭"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
