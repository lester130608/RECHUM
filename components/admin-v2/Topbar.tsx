"use client";

import { Search } from "lucide-react";
import { useUser } from "@/hooks/useUser";

export default function TopbarV2() {
  const { employee } = useUser();
  const initial = employee?.first_name?.[0]?.toUpperCase() || "U";
  const displayName = employee?.full_name || "User";

  return (
    <header className="topbar-v2">
      <div className="topbar-search">
        <div className="search-input">
          <Search size={16} />
          <input type="text" placeholder="Search..." disabled />
        </div>
      </div>
      <div className="topbar-user">
        <div className="topbar-user-info">
          <div className="topbar-user-name">{displayName}</div>
          <div className="topbar-user-role">Owner</div>
        </div>
        <div className="topbar-user-avatar">{initial}</div>
      </div>

      <style jsx>{`
        .topbar-v2 {
          height: var(--topbar-height);
          background: var(--color-bg);
          border-bottom: 1px solid var(--color-border);
          padding: 0 var(--space-6);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-6);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .topbar-search {
          flex: 1;
          max-width: 400px;
        }
        .topbar-user {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .topbar-user-info {
          text-align: right;
        }
        .topbar-user-name {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text);
          line-height: 1.2;
        }
        .topbar-user-role {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }
        .topbar-user-avatar {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-full);
          background: var(--color-accent-bg);
          color: var(--color-accent-active);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: var(--text-sm);
        }
      `}</style>
    </header>
  );
}
