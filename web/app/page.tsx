import { Suspense } from "react";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <AppShell>
        <DashboardPage />
      </AppShell>
    </Suspense>
  );
}
