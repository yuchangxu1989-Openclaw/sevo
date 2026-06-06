"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FolderKanban, GitBranch, LogOut, Menu, X } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/projects",
    label: "项目",
    icon: FolderKanban,
    isActive: (pathname: string | null) => pathname?.startsWith("/projects") ?? false,
  },
  {
    href: "/pipelines",
    label: "流水线",
    icon: GitBranch,
    isActive: (pathname: string | null) => pathname?.startsWith("/pipelines") ?? false,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    try {
      await fetch("/sevo/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort logout; navigate regardless.
    }
    router.push("/portal");
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-60 transform border-r border-slate-200 bg-white transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center px-5 border-b border-slate-200">
          <Link href="/projects" className="flex flex-col" aria-label="返回项目列表">
            <span className="text-xl font-bold tracking-tight text-slate-900">SEVO</span>
            <span className="text-[11px] text-slate-500 -mt-0.5">流水线驾驶舱</span>
          </Link>
          <button
            className="ml-auto lg:hidden text-slate-500 hover:text-slate-900"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭侧边导航"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.isActive(pathname);
            return (
              <Link
                href={item.href}
                key={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-100 text-slate-900 border border-slate-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开侧边导航"
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <p className="text-sm text-slate-500">查看每个受管项目和每条流水线的进度与状态</p>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
