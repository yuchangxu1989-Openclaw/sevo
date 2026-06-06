import type { CockpitLifecycleStatus } from "@/types";

/** Format an ISO timestamp into a compact local datetime, or a dash for empty. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Relative "time ago" phrasing for last-advanced columns. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "尚未推进";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未推进";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return formatDateTime(value);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDateTime(value);
}

/** Tailwind classes for a lifecycle-status pill. White-bg / dark-text palette. */
export function lifecycleStatusClass(status: CockpitLifecycleStatus): string {
  switch (status) {
    case "active":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "stale":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "completed":
      return "border-sky-300 bg-sky-50 text-sky-700";
    case "failed":
      return "border-red-300 bg-red-50 text-red-700";
    case "archived":
    default:
      return "border-slate-300 bg-slate-50 text-slate-600";
  }
}
