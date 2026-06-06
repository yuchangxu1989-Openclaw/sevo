import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
