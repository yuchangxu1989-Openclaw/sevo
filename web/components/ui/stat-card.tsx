import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { DashboardMetricTrend } from "@/types";

const trendConfig = {
  up: { icon: ArrowUpRight, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  down: { icon: ArrowDownRight, color: "text-red-400", bg: "bg-red-500/10" },
  flat: { icon: Minus, color: "text-slate-500", bg: "bg-slate-500/10" },
} as const;

/** When the metric going up is bad (e.g. blocked count), flip the color. */
const trendConfigInverse = {
  up: { icon: ArrowUpRight, color: "text-red-400", bg: "bg-red-500/10" },
  down: { icon: ArrowDownRight, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  flat: { icon: Minus, color: "text-slate-500", bg: "bg-slate-500/10" },
} as const;

export function StatCard({
  title,
  value,
  helper,
  icon,
  className,
  valueClassName,
  trend,
  trendInverse,
}: {
  title: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  trend?: DashboardMetricTrend;
  /** If true, "up" is bad (red) and "down" is good (green). */
  trendInverse?: boolean;
}) {
  const cfg = trend
    ? (trendInverse ? trendConfigInverse : trendConfig)[trend.direction]
    : null;
  const TrendIcon = cfg?.icon;

  return (
    <Card className={cn(
      "group relative overflow-hidden border-slate-200 bg-gradient-to-br from-white to-slate-50 transition-all duration-300 hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60",
      className,
    )}>
      {/* Subtle top gradient line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            {icon && <span className="text-slate-600">{icon}</span>}
            <span>{title}</span>
          </div>
          {trend && cfg && TrendIcon && trend.direction !== "flat" && (
            <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium", cfg.bg, cfg.color)}>
              <TrendIcon className="h-3 w-3" />
              {trend.percent}%
            </span>
          )}
        </div>
        <p className={cn("text-4xl font-semibold tracking-tight text-slate-950", valueClassName)}>{value}</p>
        {helper ? <p className="text-sm leading-6 text-slate-500">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
