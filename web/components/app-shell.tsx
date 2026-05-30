"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Bell,
  Menu,
  X,
  LogOut,
  PackageSearch,
  FolderKanban,
  Search,
  Settings,
  ListChecks,
  GitBranch,
  Command,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "总览",
    icon: LayoutDashboard,
    isActive: (pathname: string | null) => pathname?.startsWith("/dashboard"),
  },
  {
    href: "/frs",
    label: "FR 流水线",
    icon: GitBranch,
    isActive: (pathname: string | null) => pathname?.startsWith("/frs"),
  },
  {
    href: "/todos",
    label: "风险与动作",
    icon: ListChecks,
    isActive: (pathname: string | null) => pathname?.startsWith("/todos") || pathname?.startsWith("/reviews") || pathname?.startsWith("/gates"),
  },
  {
    href: "/deliverables",
    label: "产物库",
    icon: PackageSearch,
    isActive: (pathname: string | null) => pathname?.startsWith("/deliverables") || pathname?.startsWith("/ledger"),
  },
  {
    href: "/projects",
    label: "项目",
    icon: FolderKanban,
    isActive: (pathname: string | null) => pathname?.startsWith("/projects"),
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [notificationOpen, setNotificationOpen] = React.useState(false);
  const [adminOpen, setAdminOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    if (pathname?.startsWith("/search")) {
      setSearchQuery(searchParams.get("q") ?? "");
      return;
    }
    setSearchQuery("");
  }, [pathname, searchParams]);

  React.useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setNotificationOpen(false);
        setAdminOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const submitGlobalSearch = React.useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const nextQuery = searchQuery.trim();
      setSidebarOpen(false);
      setCommandOpen(false);
      router.push(nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : "/search");
    },
    [router, searchQuery],
  );

  const mockResults = [
    { group: "FR", items: ["Web 控制台视觉升级", "自动化回归测试框架", "管线引擎 Wave 2"] },
    { group: "产物", items: ["product-requirements.md", "arc42-architecture.md", "audit-report.md"] },
    { group: "门禁", items: ["需求评审待放行", "方案评审 blocker"] },
    { group: "账本", items: ["交付归档记录", "阶段通过记录"] },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-900 ">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-white/90 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform border-r border-slate-200 bg-white/95 text-slate-950 shadow-sm shadow-slate-200/60 backdrop-blur-2xl transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center px-4 border-b border-slate-200">
          <Link href="/dashboard" className="flex flex-col" aria-label="返回总览首页">
            <span className="text-xl font-black tracking-tight text-slate-950">SEVO</span>
            <span className="text-[10px] text-violet-500 -mt-1">Pipeline Command Center</span>
          </Link>
          <button
            className="ml-auto lg:hidden text-slate-600 hover:text-slate-950"
            onClick={() => setSidebarOpen(false)}
            aria-label="关闭侧边导航"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-2 p-3 pb-24 lg:pb-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.isActive(pathname);
            return (
              <Link
                href={item.href}
                key={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02] hover:shadow-xl",
                  isActive
                    ? "border border-blue-400/30 bg-gradient-to-r from-blue-500/18 to-violet-500/14 text-slate-950 shadow-lg shadow-blue-500/15"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 hover:shadow-slate-200/60",
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-violet-600" : "text-slate-500 group-hover:text-violet-600")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200">
          <p className="text-[10px] text-slate-600">v0.1.0 · UI Simplified</p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white/55 px-4 shadow-lg shadow-slate-200/60 backdrop-blur-2xl lg:px-6">
          <button
            className="lg:hidden mr-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开侧边导航"
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="hidden text-sm font-medium text-slate-500 md:block">
            自演进研发流水线
          </h1>
          <form onSubmit={submitGlobalSearch} className="ml-auto hidden w-full max-w-md md:block">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="relative flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-500 shadow-inner shadow-slate-200/60 transition-all hover:scale-[1.02] hover:border-blue-400/20 hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/10"
              aria-label="打开命令面板"
            >
              <Search className="mr-2 h-4 w-4 text-slate-500" />
              搜索 FR / 产物 / 门禁 / 账本
              <span className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                <Command className="h-3 w-3" />K
              </span>
            </button>
          </form>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition-all hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/10 md:hidden"
            aria-label="打开全局搜索"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationOpen((open) => !open)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition-all hover:scale-[1.02] hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:text-slate-950 hover:shadow-lg hover:shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/10"
              aria-label="打开通知抽屉"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-slate-950 shadow-lg shadow-red-500/30">3</span>
            </button>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAdminOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition-all hover:scale-[1.02] hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:text-slate-950 hover:shadow-lg hover:shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/10"
              aria-label="打开管理菜单"
            >
              <Settings className="h-4 w-4" />
            </button>
            {adminOpen && (
              <div className="absolute right-0 top-12 z-50 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm shadow-slate-200/60 backdrop-blur-2xl">
                <Link href="/settings" onClick={() => setAdminOpen(false)} className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:text-slate-950 hover:shadow-lg hover:shadow-blue-500/10">管理设置</Link>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/portal";
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:text-slate-950 hover:shadow-lg hover:shadow-blue-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  退出
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-24 animate-fade-in lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/80 px-1 py-2 shadow-sm shadow-slate-200/60 backdrop-blur-2xl lg:hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = item.isActive(pathname);
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] transition-all", isActive ? "bg-blue-500/10 text-violet-600 shadow-lg shadow-blue-500/10" : "text-slate-500")}>
              <item.icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {commandOpen && (
        <div className="fixed inset-0 z-[70] bg-white/95 p-3 backdrop-blur-sm sm:p-8" onClick={() => setCommandOpen(false)}>
          <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-blue-400/20 bg-white/95 shadow-sm shadow-slate-200/60 backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={submitGlobalSearch} className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-600" />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="输入关键词，搜索 FR、产物、门禁、账本记录"
                  aria-label="命令面板搜索"
                  className="h-12 rounded-2xl border-slate-200 bg-white pl-12 text-base text-slate-900 placeholder:text-slate-600"
                />
              </div>
            </form>
            <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
              {mockResults.map((group) => (
                <div key={group.group} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{group.group}</p>
                    <Link href={`/search?q=${encodeURIComponent(searchQuery)}`} onClick={() => setCommandOpen(false)} className="text-xs text-violet-600 hover:text-violet-700">查看全部</Link>
                  </div>
                  <div className="grid gap-2">
                    {group.items.map((item) => (
                      <Link key={item} href={`/search?q=${encodeURIComponent(item)}`} onClick={() => setCommandOpen(false)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-all hover:scale-[1.02] hover:border-blue-400/20 hover:bg-blue-400/10 hover:shadow-lg hover:shadow-blue-500/10 hover:text-slate-950">
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {notificationOpen && (
        <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm" onClick={() => setNotificationOpen(false)}>
          <aside className="ml-auto h-full w-full max-w-md border-l border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-200/60 backdrop-blur-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-slate-950">通知</p>
                <p className="text-sm text-slate-500">最近 20 条流水线事件</p>
              </div>
              <button onClick={() => setNotificationOpen(false)} className="rounded-xl p-2 text-slate-500 hover:scale-[1.02] hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10 hover:text-slate-950 hover:shadow-lg hover:shadow-blue-500/10" aria-label="关闭通知抽屉"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-3">
              {["编码阶段失败，需要决定重试策略", "需求评审等待门禁审批", "Web 控制台视觉升级进入复核"].map((title, index) => (
                <Link key={title} href={index === 0 ? "/frs/pi-sevo-005" : "/todos"} onClick={() => setNotificationOpen(false)} className="block rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-amber-400/20 hover:scale-[1.02] hover:bg-slate-100 hover:shadow-lg hover:shadow-blue-500/10">
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-xs text-slate-500">关联 FR · 刚刚</p>
                </Link>
              ))}
            </div>
            <Link href="/notifications" onClick={() => setNotificationOpen(false)} className="mt-5 block rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm text-violet-600 hover:bg-blue-400/10">查看全部通知</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
