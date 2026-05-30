"use client";

import { cn } from "@/lib/utils";

const SIZE = 160;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score: number) {
  if (score >= 80) return { stroke: "#34d399", glow: "rgba(52, 211, 153, 0.3)", text: "text-emerald-400", trail: "rgba(52, 211, 153, 0.1)" };
  if (score >= 50) return { stroke: "#fbbf24", glow: "rgba(251, 191, 36, 0.3)", text: "text-amber-400", trail: "rgba(251, 191, 36, 0.1)" };
  return { stroke: "#f87171", glow: "rgba(248, 113, 113, 0.3)", text: "text-red-400", trail: "rgba(248, 113, 113, 0.1)" };
}

export function HealthGauge({
  score,
  label,
  className,
}: {
  score: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const colors = scoreColor(clamped);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="rotate-[-90deg]"
          role="img"
          aria-label={`健康度 ${clamped}%`}
        >
          {/* Trail */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={colors.trail}
            strokeWidth={STROKE}
          />
          {/* Progress with glow */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${colors.glow})` }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold tracking-tight", colors.text)}>
            {clamped}
          </span>
          <span className="text-xs text-slate-500">/ 100</span>
        </div>
      </div>
      {label && (
        <p className="text-sm font-medium text-slate-600">{label}</p>
      )}
    </div>
  );
}
