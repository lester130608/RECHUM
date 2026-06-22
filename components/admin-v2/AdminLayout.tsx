"use client";

import SidebarV2 from "./Sidebar";
import TopbarV2 from "./Topbar";

export default function AdminLayoutV2({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-layout-v2">
      <SidebarV2 />
      <div className="admin-layout-main">
        <TopbarV2 />
        <div className="admin-layout-content">{children}</div>
      </div>

      <style jsx>{`
        .admin-layout-v2 {
          min-height: 100vh;
          background: var(--color-bg-subtle);
        }
        .admin-layout-main {
          margin-left: var(--sidebar-width);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .admin-layout-content {
          flex: 1;
          padding: var(--space-8);
        }
      `}</style>
    </div>
  );
}
