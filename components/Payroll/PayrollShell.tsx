"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type PayrollArea = 'BA' | 'CMHC' | 'TCM' | 'PSYQ' | 'GENERAL';

type PayrollShellProps = {
  children: React.ReactNode;
  currentLabel: string;
};

type PayrollNavContext = {
  role_codes: string[];
  is_owner: boolean;
  supervised_areas: PayrollArea[];
};

const CAPTURE_BY_AREA: Partial<Record<PayrollArea, string>> = {
  BA: '/payroll/capture/ba',
  CMHC: '/payroll/capture/cmhc',
  TCM: '/payroll/capture/tcm',
};

async function fetchWithSession(url: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function roleLabel(context: PayrollNavContext | null) {
  if (context?.is_owner) return 'Owner';

  const area = context?.supervised_areas?.find((item) => item !== 'GENERAL' && item !== 'PSYQ');
  return area ? `Supervisor ${area}` : 'Payroll';
}

function runPayrollHref(context: PayrollNavContext | null) {
  if (context?.is_owner) {
    return '/payroll/owner/period';
  }

  const area = context?.supervised_areas?.find((item) => CAPTURE_BY_AREA[item]);
  return area ? CAPTURE_BY_AREA[area] ?? '/payroll/runs' : '/payroll/runs';
}

function isActive(pathname: string, href: string) {
  if (href === '/payroll/owner/period') {
    return pathname === href;
  }

  if (href.startsWith('/payroll/capture/')) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PayrollShell({ children, currentLabel }: PayrollShellProps) {
  const pathname = usePathname() || '';
  const { user } = useSupabaseUser();
  const [context, setContext] = useState<PayrollNavContext | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadContext = async () => {
      const data = await fetchWithSession('/api/payroll/runs/context');
      if (mounted && data) {
        setContext({
          role_codes: data.role_codes ?? [],
          is_owner: Boolean(data.is_owner),
          supervised_areas: data.supervised_areas ?? [],
        });
      }
    };

    void loadContext();

    return () => {
      mounted = false;
    };
  }, []);

  const navItems = useMemo(() => {
    const items = [
      { label: 'Dashboard', href: '/payroll/dashboard' },
      { label: 'Run payroll', href: runPayrollHref(context) },
      { label: 'Employees', href: '/payroll/employees' },
      { label: 'History', href: '/payroll/history' },
    ];

    if (context?.is_owner) {
      items.push({ label: 'Settings', href: '/payroll/settings' });
    }

    return items;
  }, [context]);

  return (
    <div className="dtt-layout">
      <aside className="dtt-sidebar">
        <div className="dtt-sidebar-logo">
          <div className="dtt-sidebar-logo-title">DTT Coaching Services</div>
          <div className="dtt-sidebar-logo-subtitle">Payroll</div>
        </div>

        <div className="dtt-sidebar-section">Payroll</div>
        <ul className="dtt-sidebar-nav">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={isActive(pathname, item.href) ? 'active' : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <div className="dtt-main">
        <div className="dtt-topbar">
          <span className="dtt-topbar-left">DTT Coaching - Payroll</span>
          <div className="dtt-topbar-right">
            <span className="dtt-topbar-user">{user?.email ?? ''}</span>
            <span className="dtt-topbar-role">{roleLabel(context)}</span>
          </div>
        </div>

        <div className="dtt-breadcrumb">
          <Link href="/dashboard">Home</Link>
          <span className="dtt-breadcrumb-sep">&gt;</span>
          <Link href="/payroll/dashboard">Payroll</Link>
          <span className="dtt-breadcrumb-sep">&gt;</span>
          <span className="dtt-breadcrumb-current">{currentLabel}</span>
        </div>

        <div className="dtt-content">{children}</div>
      </div>
    </div>
  );
}
