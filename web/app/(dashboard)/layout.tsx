import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[hsl(220,13%,8%)]" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
