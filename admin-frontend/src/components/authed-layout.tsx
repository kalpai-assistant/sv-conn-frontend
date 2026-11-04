import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";

export function AuthedLayout() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
