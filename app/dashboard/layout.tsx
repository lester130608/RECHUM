import { ReactNode } from "react";
import SidebarAdmin from "@/components/SidebarAdmin";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Segoe UI, sans-serif" }}>
      <SidebarAdmin />
      <main style={{ flex: 1, padding: "24px", backgroundColor: "#f4f6f9" }}>
        {children}
      </main>
    </div>
  );
}