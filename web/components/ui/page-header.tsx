import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-slate-600">{icon}</span> : null}
          <h1 className="tech-gradient-text text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
        </div>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
