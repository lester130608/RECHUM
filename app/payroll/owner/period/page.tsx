"use client";

// app/payroll/owner/period/page.tsx
// Owner period review control panel. Read-only until approval/consolidation endpoints are built.

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type AreaName = 'BA' | 'CMHC' | 'TCM' | 'PSYQ';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  owner_deadline: string | null;
  status: string;
}

interface PayRun {
  id: string;
  period_id: string;
  area: string;
  run_level: string;
  status: AreaStatus;
  created_at: string;
  supervisor_approved_at?: string | null;
  owner_approved_at?: string | null;
}

type AreaStatus =
  | 'not_started'
  | 'draft'
  | 'review_ready'
  | 'supervisor_approved'
  | 'owner_approved'
  | 'consolidated'
  | 'exported'
  | 'locked';

interface AreaRow {
  area: AreaName;
  workers: number;
  run: PayRun | null;
  status: AreaStatus;
  total_placeholder: string;
}

interface OwnerPeriodContext {
  periods: PayPeriod[];
  selected_period_id: string | null;
  areas: AreaRow[];
  consolidated_run: PayRun | null;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

async function fetchWithSession(url: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Auth session missing. Please log in again.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(url, { ...init, headers });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return data;
}

function statusLabel(status: AreaStatus) {
  const labels: Record<AreaStatus, string> = {
    not_started: 'Not started',
    draft: 'Pending supervisor',
    review_ready: 'Supervisor submitted',
    supervisor_approved: 'Supervisor approved',
    owner_approved: 'Owner approved',
    consolidated: 'Consolidated',
    exported: 'Exported',
    locked: 'Locked',
  };
  return labels[status] ?? status;
}

function statusBadgeClass(status: AreaStatus) {
  if (status === 'not_started') return 'badge';
  if (status === 'draft' || status === 'review_ready') return 'badge warning';
  if (status === 'supervisor_approved') return 'badge accent';
  if (status === 'owner_approved') return 'badge success';
  if (status === 'consolidated') return 'badge info';
  return 'badge';
}

function actionCell(area: AreaRow) {
  if (area.status === 'owner_approved' || area.status === 'consolidated') {
    return <span style={{ color: '#0d7a5f', fontWeight: 600 }}>Ready</span>;
  }

  if (area.status === 'review_ready' || area.status === 'supervisor_approved') {
    return (
      <button className="small" type="button" disabled title="Coming next">
        Review &amp; approve
      </button>
    );
  }

  if (area.area === 'PSYQ' && area.status === 'not_started') {
    return (
      <button className="small" type="button" disabled title="Coming next">
        Capture
      </button>
    );
  }

  return <span style={{ color: '#6b7280', fontSize: 13 }}>Waiting</span>;
}

export default function OwnerPeriodPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [ctx, setCtx] = useState<OwnerPeriodContext | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadPeriod(periodId?: string) {
    setLoading(true);
    setError('');

    try {
      const query = periodId ? `?period_id=${periodId}` : '';
      const data: OwnerPeriodContext = await fetchWithSession(`/api/payroll/owner/period${query}`);
      setCtx(data);
      setSelectedPeriodId(data.selected_period_id ?? '');
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        window.location.href = '/not-authorized';
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userLoading || !user) return;
    void loadPeriod();
  }, [user, userLoading]);

  const selectedPeriod = useMemo(
    () => ctx?.periods.find((period) => period.id === selectedPeriodId) ?? null,
    [ctx?.periods, selectedPeriodId]
  );

  const ownerApprovedCount = useMemo(
    () =>
      (ctx?.areas ?? []).filter(
        (area) => area.status === 'owner_approved' || area.status === 'consolidated'
      ).length,
    [ctx?.areas]
  );

  const consolidatedApproved = ctx?.consolidated_run?.status === 'owner_approved';

  if (userLoading) {
    return (
      <PayrollShell currentLabel="Period Review">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="Period Review">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  if (loading) {
    return (
      <PayrollShell currentLabel="Period Review">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (error) {
    return (
      <PayrollShell currentLabel="Period Review">
          <div className="error">{error}</div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="Period Review">
          <div className="page-header">
            <div className="page-header-content">
              <h1 style={{ fontSize: 22, marginBottom: 4 }}>Owner Period Review</h1>
              <p className="subtitle">
                Review area status for one pay period. Calculations and real approvals come next.
              </p>
            </div>
          </div>

          <div className="section">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label htmlFor="period-select">Pay Period</label>
              <select
                id="period-select"
                value={selectedPeriodId}
                onChange={(event) => {
                  setSelectedPeriodId(event.target.value);
                  void loadPeriod(event.target.value);
                }}
                style={{ maxWidth: 560 }}
              >
                {ctx?.periods.length === 0 && (
                  <option value="">No periods available</option>
                )}
                {ctx?.periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.week_code} | {fmtDate(period.start_date)} - {fmtDate(period.end_date)} | Pay {fmtDate(period.pay_date)} | {period.status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedPeriod && (
            <div className="dtt-period-card">
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Week code</span>
                <span className="dtt-period-card-value">{selectedPeriod.week_code}</span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Work dates</span>
                <span className="dtt-period-card-value">
                  {fmtDate(selectedPeriod.start_date)} - {fmtDate(selectedPeriod.end_date)}
                </span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Pay date</span>
                <span className="dtt-period-card-value">{fmtDate(selectedPeriod.pay_date)}</span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Owner deadline</span>
                <span className="dtt-period-card-value">{fmtDate(selectedPeriod.owner_deadline)}</span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Period status</span>
                <span className="badge info">{selectedPeriod.status}</span>
              </div>
            </div>
          )}

          <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th style={{ textAlign: 'center' }}>Workers</th>
                    <th>Status</th>
                    <th>Total ($)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(ctx?.areas ?? []).map((area) => (
                    <tr key={area.area}>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {area.area}
                          {area.area === 'PSYQ' ? ' (you)' : ''}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{area.workers}</td>
                      <td>
                        <span className={statusBadgeClass(area.status)}>
                          {statusLabel(area.status)}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#6b7280' }}>{area.total_placeholder}</span>
                      </td>
                      <td>{actionCell(area)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dtt-action-bar">
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
              {ownerApprovedCount} of 4 areas owner-approved · you can consolidate partial
            </span>

            <button className="dtt-secondary" type="button" disabled title="Coming next">
              Consolidate approved areas
            </button>
            <button
              className="dtt-secondary"
              type="button"
              disabled
              title={consolidatedApproved ? 'Export coming next' : 'Requires approved consolidated run'}
            >
              Export to ADP
            </button>

            <span className="dtt-action-bar-msg">
              You are the only one who sees dollar amounts.
            </span>
          </div>
    </PayrollShell>
  );
}
