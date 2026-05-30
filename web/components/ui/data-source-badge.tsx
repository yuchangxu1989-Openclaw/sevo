import * as React from "react";
import { cn } from "@/lib/utils";

export type DataSourceType = "runtime" | "derived";

const DATA_SOURCE_LABEL: Record<DataSourceType, string> = {
  runtime: "runtime",
  derived: "derived",
};

export function DataSourceBadge({
  type,
  description,
  className,
}: {
  type: DataSourceType;
  description: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex cursor-help items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500",
        className,
      )}
      title={description}
      aria-label={`数据来源：${DATA_SOURCE_LABEL[type]}。${description}`}
      tabIndex={0}
    >
      Source: {DATA_SOURCE_LABEL[type]}
    </span>
  );
}
