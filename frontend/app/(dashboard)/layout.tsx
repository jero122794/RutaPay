// frontend/app/(dashboard)/layout.tsx
"use client";

import { useCallback, useState } from "react";
import Sidebar from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import BottomNav from "./layout/BottomNav";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps): JSX.Element => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const onOpenSidebar = useCallback((): void => {
    setSidebarOpen(true);
  }, []);

  const onCloseSidebar = useCallback((): void => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-background font-body text-on-surface selection:bg-primary selection:text-on-primary">
      <Sidebar open={sidebarOpen} onClose={onCloseSidebar} />

      <div className="flex min-h-screen flex-1 flex-col lg:ml-64">
        <Topbar onOpenSidebar={onOpenSidebar} />

        <main className="flex-1 overflow-y-auto md:pt-16">
          <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8 lg:px-8 lg:pb-8">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

export default DashboardLayout;
