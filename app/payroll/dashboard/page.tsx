"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type AreaName = 'BA' | 'CMHC' | 'TCM' | 'PSYQ';

type AreaStatus =
  | 'not_started'
  | 'draft'
  | 'review_ready'
  | 'supervisor_approved'
  | 'owner_approved'
  | 'consolidated'
  | 'exported'
  | 'locked';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  capture_opens_at: string | null;
  sup_deadline: string | null;
  owner_deadline: string | null;
  pay_date: string;
  status: string;
}

interface AreaRow {
  area: AreaName;
  workers: number;
  status: AreaStatus;
  total_placeholder: string;
}

interface DashboardContext {
  is_owner: boolean;
  supervised_areas: string[];
  employee_name: string | null;
  current_period: PayPeriod | null;
  areas: AreaRow[];
  last_payroll: {
    period: PayPeriod;
    workers: number;
    total_placeholder: string;
  } | null;
  tasks: string[];
}

const CAPTURE_BY_AREA: Partial<Record<AreaName, string>> = {
  BA: '/payroll/capture/ba',
  CMHC: '/payroll/capture/cmhc',
  TCM: '/payroll/capture/tcm',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function hourGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function statusLabel(status: AreaStatus) {
  const labels: Record<AreaStatus, string> = {
    not_started: 'Not started',
    draft: 'Waiting',
    review_ready: 'Submitted',
    supervisor_approved: 'Ready for review',
    owner_approved: 'Approved',
    consolidated: 'Consolidated',
    exported: 'Exported',
    locked: 'Locked',
  };
  return labels[status] ?? status;
}

function badgeClass(status: AreaStatus) {
  if (status === 'not_started') return 'badge';
  if (status === 'draft' || status === 'review_ready') return 'badge warning';
  if (status === 'supervisor_approved') return 'badge accent';
  if (status === 'owner_approved' || status === 'consolidated' || status === 'exported') return 'badge success';
  return 'badge';
}

async function fetchWithSession(url: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Auth session missing. Please log in again.');
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data;
}

function runPayrollHref(ctx: DashboardContext | null) {
  if (!ctx) return '/payroll/owner/period';
  if (ctx.is_owner) return '/payroll/owner/period';
  const area = ctx.supervised_areas.find((item) => CAPTURE_BY_AREA[item as AreaName]) as AreaName | undefined;
  return area ? CAPTURE_BY_AREA[area] ?? '/payroll/runs' : '/payroll/runs';
}

export default function PayrollDashboardPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userLoading || !user) return;

    let mounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await fetchWithSession('/api/payroll/dashboard');
        if (mounted) setCtx(data);
      } catch (err: any) {
        if (err.status === 401 || err.status === 403) {
          window.location.href = '/not-authorized';
          return;
        }
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, [user, userLoading]);

  const approvedCount = useMemo(
    () =>
      (ctx?.areas ?? []).filter((area) =>
        ['owner_approved', 'consolidated', 'exported'].includes(area.status)
      ).length,
    [ctx?.areas]
  );

  const workerCount = useMemo(
    () => (ctx?.areas ?? []).reduce((sum, area) => sum + area.workers, 0),
    [ctx?.areas]
  );

  if (userLoading || loading) {
    return (
      <PayrollShell currentLabel="Dashboard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="Dashboard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  if (error) {
    return (
      <PayrollShell currentLabel="Dashboard">
        <div className="error">{error}</div>
      </PayrollShell>
    );
  }

  const period = ctx?.current_period ?? null;
  const firstName = ctx?.employee_name?.split(' ')[0] || user.email?.split('@')[0] || 'there';

  return (
    <PayrollShell currentLabel="Dashboard">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>
            {hourGreeting()}, {firstName}
          </h1>
          <p className="subtitle">Here's where payroll stands right now.</p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, 0.85fr)',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        <section className="section" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <div className="heading" style={{ marginBottom: 6 }}>Current pay period</div>
              <p className="subtitle" style={{ margin: 0 }}>
                {period ? `${period.week_code} · ${fmtDate(period.start_date)} - ${fmtDate(period.end_date)}` : 'No pay period found.'}
              </p>
            </div>
            <div
              style={{
                background: '#e6f7f3',
                border: '1px solid #b7eadf',
                borderRadius: 8,
                padding: '12px 14px',
                minWidth: 150,
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#0d7a5f', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                Pay date
              </div>
              <div style={{ color: '#0f2f2a', fontSize: 18, fontWeight: 800 }}>
                {fmtDate(period?.pay_date)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Supervisor deadline</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>{fmtDate(period?.sup_deadline)}</div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Areas approved</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>
                {approvedCount} of {ctx?.areas.length ?? 0}
              </div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Workers</div>
              <div className="stat-card-value" style={{ fontSize: 18 }}>{workerCount}</div>
            </div>
          </div>

          <div>
            <Link href={runPayrollHref(ctx)} className="dtt-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
              Run payroll
            </Link>
          </div>
        </section>

        <section className="section">
          <div className="heading" style={{ marginBottom: 14 }}>Last payroll</div>
          {ctx?.last_payroll ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                  Pay date
                </div>
                <div style={{ color: '#111827', fontSize: 20, fontWeight: 800 }}>
                  {fmtDate(ctx.last_payroll.period.pay_date)}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: '#6b7280' }}>Total</span>
                <strong>Pending</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: '#6b7280' }}>Workers</span>
                <strong>{ctx.last_payroll.workers}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">No previous payroll found.</div>
          )}
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 0.9fr)', gap: 20, marginTop: 20 }}>
        <section className="section" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 12px' }}>
            <div className="heading">Areas this period</div>
          </div>
          <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Workers</th>
                  <th>Status</th>
                  <th>Total ($)</th>
                </tr>
              </thead>
              <tbody>
                {(ctx?.areas ?? []).map((area) => (
                  <tr key={area.area}>
                    <td>
                      <strong>{area.area}</strong>
                      {area.area === 'PSYQ' && ctx?.is_owner && (
                        <span style={{ color: '#6b7280', marginLeft: 6 }}>(you)</span>
                      )}
                    </td>
                    <td>{area.workers}</td>
                    <td>
                      <span className={badgeClass(area.status)}>{statusLabel(area.status)}</span>
                    </td>
                    <td>Pending</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="heading" style={{ marginBottom: 14 }}>Things to do</div>
          {ctx?.tasks.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {ctx.tasks.map((task) => (
                <div
                  key={task}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '12px 14px',
                    background: '#ffffff',
                    color: '#374151',
                  }}
                >
                  {task}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Nothing needs attention right now.</div>
          )}
          <div className="info" style={{ marginTop: 14 }}>
            Dollar amounts stay pending until the payroll calculation engine is enabled.
          </div>
        </section>
      </div>
    </PayrollShell>
  );
}
