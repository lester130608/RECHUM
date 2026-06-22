"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Users, 
  DollarSign, 
  Settings, 
  FileBarChart,
  ChevronDown,
  ChevronRight,
  UserPlus,
  UserMinus,
  UsersRound,
  Wallet,
  Shield,
  UserCog,
  History,
  Archive
} from "lucide-react";
import { useUser } from "@/hooks/useUser";

type NavItem = {
  label: string;
  href?: string;
  icon: any;
  children?: { label: string; href: string; icon?: any; requiresPermission?: string; readOnly?: boolean }[];
};

export default function SidebarV2() {
  const pathname = usePathname();
  const { hasPermission } = useUser();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    payroll: true,
    hr: true,
    settings: false,
  });

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const nav: NavItem[] = [
    { label: "Dashboard", href: "/payroll/runs", icon: LayoutDashboard },
    {
      label: "Payroll",
      icon: Wallet,
      children: [
        { label: "Pay Runs", href: "/payroll/runs", icon: Wallet },
        { label: "Employee History", href: "/payroll/emp", icon: History, requiresPermission: "manage_employees", readOnly: true },
        { label: "Owner Summary", href: "/payroll/owner", icon: Archive, requiresPermission: "manage_employees", readOnly: true },
      ],
    },
    {
      label: "HR",
      icon: Users,
      children: [
        { label: "All Employees", href: "/employees/hr/all", icon: UsersRound },
        { label: "New Employee", href: "/employees/hr/new", icon: UserPlus },
        { label: "Pay Configuration", href: "/admin/pay-configuration", icon: DollarSign, requiresPermission: "manage_employees" },
        { label: "Delete Employee", href: "/employees/hr/delete", icon: UserMinus },
      ],
    },
    {
      label: "Settings",
      icon: Settings,
      children: [
        { label: "Create HR Supervisor", href: "/dashboard/settings/create-hr", icon: UserCog },
        { label: "Create Full Admin", href: "/dashboard/settings/create-admin", icon: Shield },
      ],
    },
    { label: "Reports", href: "/reports", icon: FileBarChart },
  ];

  return (
    <aside className="sidebar-v2">
      <div className="sidebar-brand">
        <div className="sidebar-logo">P</div>
        <div className="sidebar-brand-text">
          <div className="sidebar-brand-name">Payroll</div>
          <div className="sidebar-brand-sub">DTT Coaching</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {nav.map((item) => {
          const Icon = item.icon;
          if (item.children) {
            const key = item.label.toLowerCase();
            const isOpen = expanded[key];
            const visibleChildren = item.children.filter(
              (c) => !c.requiresPermission || hasPermission(c.requiresPermission)
            );
            if (visibleChildren.length === 0) return null;
            return (
              <div key={item.label}>
                <button className="sidebar-link sidebar-group" onClick={() => toggleExpand(key)}>
                  <Icon size={16} className="sidebar-link-icon" />
                  <span className="sidebar-link-label">{item.label}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className="sidebar-children">
                    {visibleChildren.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`sidebar-link sidebar-child ${isActive(child.href) ? "active" : ""}`}
                        >
                          {ChildIcon && <ChildIcon size={14} className="sidebar-link-icon" />}
                          <span className="sidebar-link-label">{child.label}</span>
                          {child.readOnly && <span className="sidebar-badge">Read-only</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href!}
              className={`sidebar-link ${isActive(item.href!) ? "active" : ""}`}
            >
              <Icon size={16} className="sidebar-link-icon" />
              <span className="sidebar-link-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <style jsx>{`
        .sidebar-v2 {
          width: var(--sidebar-width);
          background: var(--color-bg-sidebar);
          border-right: 1px solid var(--color-border);
          height: 100vh;
          padding: var(--space-4) var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
          position: fixed;
          left: 0;
          top: 0;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
        }
        .sidebar-logo {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-md);
          background: var(--color-accent);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -0.02em;
        }
        .sidebar-brand-name {
          font-size: var(--text-base);
          font-weight: 600;
          color: var(--color-text);
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        .sidebar-brand-sub {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-top: 2px;
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 7px 10px;
          font-size: var(--text-base);
          font-weight: 500;
          color: var(--color-text-secondary);
          text-decoration: none;
          border-radius: var(--radius-sm);
          background: transparent;
          border: none;
          width: 100%;
          cursor: pointer;
          transition: all var(--transition-fast);
          text-align: left;
          letter-spacing: -0.005em;
        }
        .sidebar-link:hover {
          background: var(--color-bg-hover);
          color: var(--color-text);
        }
        .sidebar-link.active {
          background: var(--color-accent-bg);
          color: var(--color-accent-active);
        }
        .sidebar-link.active :global(.sidebar-link-icon) {
          color: var(--color-accent);
        }
        .sidebar-link-icon {
          flex-shrink: 0;
          color: var(--color-text-tertiary);
        }
        .sidebar-link-label {
          flex: 1;
        }
        .sidebar-badge {
          color: var(--color-text-tertiary);
          font-size: var(--text-xs);
          font-weight: 500;
        }
        .sidebar-group {
          color: var(--color-text-tertiary);
          font-size: var(--text-sm);
          text-transform: none;
        }
        .sidebar-children {
          display: flex;
          flex-direction: column;
          gap: 1px;
          margin-top: 2px;
          margin-left: 16px;
          padding-left: 10px;
          border-left: 1px solid var(--color-border);
        }
        .sidebar-child {
          font-size: var(--text-sm);
        }
      `}</style>
    </aside>
  );
}
