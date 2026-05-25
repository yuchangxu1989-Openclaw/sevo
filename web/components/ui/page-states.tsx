import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";

type StateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary";
};

function StateActionButton({ action }: { action?: StateAction }) {
  if (!action) return null;

  const content = (
    <>
      {action.label}
    </>
  );

  if (action.href) {
    return (
      <Button asChild variant={action.variant ?? "default"} className="rounded-xl">
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button variant={action.variant ?? "default"} className="rounded-xl" onClick={action.onClick}>
      {content}
    </Button>
  );
}

export function PageSkeleton({
  variant = "list",
  className,
}: {
  variant?: "dashboard" | "list" | "detail" | "table";
  className?: string;
}) {
  if (variant === "dashboard") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-3xl" />
          <Skeleton className="h-4 w-2/3 max-w-2xl" />
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="border-slate-200/80">
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4 p-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-56 w-full rounded-2xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-6 w-40" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-2xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-3xl" />
        </div>
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ErrorState({
  title = "数据加载失败",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: StateAction;
  className?: string;
}) {
  return (
    <Card className={cn("border-red-500/20 bg-red-500/10", className)}>
      <CardContent className="py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-700 shadow-lg shadow-red-500/10">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="mt-4 text-base font-semibold text-red-200">{title}</p>
        <p className="mt-2 text-sm leading-6 text-red-200/80">{description ?? "发生了什么：数据暂时取不到。可能原因：接口超时、网络抖动或记录已变更。你可以重试，或返回上一页。"}</p>
        <div className="mt-5 flex justify-center">
          <StateActionButton
            action={
              action ?? {
                label: "重试",
                variant: "outline",
              }
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title = "暂无数据",
  description = "当前还没有可展示的内容。",
  action,
  className,
  icon,
}: {
  title?: string;
  description?: string;
  action?: StateAction;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className={cn("border-dashed border-slate-200 bg-white", className)}>
      <CardContent className="py-10 text-center">
        <div className="mx-auto mb-2 flex h-16 w-24 items-center justify-center rounded-[2rem] border border-emerald-400/15 bg-gradient-to-br from-emerald-400/10 to-amber-400/5 text-emerald-600 shadow-lg shadow-emerald-950/20">
          {icon ?? <Inbox className="h-7 w-7" />}
        </div>
        <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
        {action && <div className="mt-5 flex justify-center"><StateActionButton action={action} /></div>}
      </CardContent>
    </Card>
  );
}

export function ButtonSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("mr-2 h-4 w-4 animate-spin", className)} />;
}

export function RetryAction(
  input: (() => void) | { onClick: () => void; label?: string },
) {
  if (typeof input === "function") {
    return {
      label: "重试",
      onClick: input,
      variant: "outline" as const,
    };
  }

  return {
    label: input.label ?? "重试",
    onClick: input.onClick,
    variant: "outline" as const,
  };
}

export function RefreshHint({ children }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <RefreshCw className="h-4 w-4" />
      {children ?? "刷新后重试"}
    </span>
  );
}
