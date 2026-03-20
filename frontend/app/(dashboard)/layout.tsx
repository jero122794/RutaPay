// frontend/app/(dashboard)/layout.tsx
"use client";

import { useState } from "react";
import Sidebar from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";
import BottomNav from "./layout/BottomNav";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps): JSX.Element => {
  const [isTabletExpanded, setIsTabletExpanded] = useState(false);

  return (
    <div className="flex h-screen bg-[#090e1c] overflow-hidden">
      <Sidebar isTabletExpanded={isTabletExpanded} onCloseTablet={() => setIsTabletExpanded(false)} />

      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar onToggleTabletSidebar={() => setIsTabletExpanded((prev) => !prev)} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 pb-24 md:p-6 md:pb-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

export default DashboardLayout;
