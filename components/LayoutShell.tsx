'use client'

import { usePathname } from "next/navigation";
import SidebarAdmin from "@/components/SidebarAdmin";
import ClientWrapper from "@/components/ClientWrapper";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = pathname === "/login";

  if (hideSidebar) {
    return (
      <div className="w-full min-h-screen bg-gray-100 flex items-center justify-center px-4">
        {children}
      </div>
    );
  }

  return (
    <div className="flex">
      <SidebarAdmin />
      <div className="ml-64 flex-1 p-4">
        <ClientWrapper>{children}</ClientWrapper>
      </div>
    </div>
  );
}