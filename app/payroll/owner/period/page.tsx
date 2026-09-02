"use client";

// app/payroll/owner/period/page.tsx
// Owner period review control panel. Read-only until approval/consolidation endpoints are built.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type AreaName = 'BA' | 'CMHC' | 'TCM' | 'EMP';

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
      body?: any;
    };
    error.status = response.status;
    // El endpoint de consolidación devuelve 'blocking' con el detalle de qué
    // área falta; sin esto se pierde y el usuario solo ve un mensaje genérico.
    error.body = data;
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

function withPeriod(base: string, area: AreaRow) {
  const periodId = area.run?.period_id;
  return periodId ? `${base}?period_id=${periodId}` : base;
}

/** Pantalla donde se revisa y aprueba el cálculo del área. */
function reviewHref(area: AreaRow) {
  const routes: Record<AreaName, string> = {
    BA: '/payroll/owner/ba-calculation',
    CMHC: '/payroll/owner/cmhc-calculation',
    TCM: '/payroll/owner/tcm-calculation',
    // Antes apuntaba a office-capture, que es la pantalla de CAPTURA.
    // EMP no tenía pantalla de cálculo y por eso el área nunca llegaba a
    // escribir pay_run_items ni sumaba al consolidado.
    EMP: '/payroll/owner/emp-calculation',
  };
  return withPeriod(routes[area.area], area);
}

/** Pantalla de captura. Solo EMP la tiene dentro del flujo del owner. */
function captureHref(area: AreaRow) {
  return withPeriod('/payroll/owner/office-capture', area);
}

function areaDisplayLabel(area: AreaName) {
  return area === 'EMP' ? 'EMP / Office' : area;
}

const smallLinkButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.35rem 0.65rem',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#1f2937',
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'none',
} as const;

function actionCell(area: AreaRow) {
  if (area.status === 'owner_approved' || area.status === 'consolidated') {
    return <span style={{ color: '#0d7a5f', fontWeight: 600 }}>Ready</span>;
  }

  const puedeCalcular =
    area.status === 'review_ready' || area.status === 'supervisor_approved';

  // EMP la captura el owner, así que su enlace de captura tiene que estar
  // disponible SIEMPRE hasta que el área se apruebe. Antes solo aparecía en
  // 'not_started' o 'draft': si el área quedaba en 'review_ready' —por un
  // envío anterior o por un residuo de pruebas— la pantalla solo ofrecía
  // "Review & approve", que lleva al cálculo, y la captura se volvía
  // inalcanzable. No había forma de meter las horas desde la aplicación.
  if (area.area === 'EMP') {
    return (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <Link href={captureHref(area)} style={smallLinkButtonStyle}>
          Capture
        </Link>
        <Link href={reviewHref(area)} style={smallLinkButtonStyle}>
          {puedeCalcular ? 'Review & approve' : 'Calculate'}
        </Link>
      </span>
    );
  }

  if (puedeCalcular) {
    return (
      <Link href={reviewHref(area)} style={smallLinkButtonStyle}>
        Review &amp; approve
      </Link>
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
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateMsg, setConsolidateMsg] = useState('');
  const [consolidateErr, setConsolidateErr] = useState('');

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

  // Las cuatro áreas deben estar aprobadas. La consolidación parcial no existe:
  // la política RLS de consolidated_run_areas exige runs en 'owner_approved',
  // y un total con áreas faltantes sería un número engañoso.
  const canConsolidate = ownerApprovedCount === 4 && !consolidating;

  async function handleConsolidate() {
    if (!selectedPeriodId) return;

    setConsolidating(true);
    setConsolidateMsg('');
    setConsolidateErr('');

    try {
      const data = await fetchWithSession('/api/payroll/owner/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriodId }),
      });

      const total =
        typeof data?.grand_total === 'number'
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
              data.grand_total
            )
          : null;

      setConsolidateMsg(
        total
          ? `Consolidated. Grand total ${total} across ${data.linked ?? 0} areas.`
          : 'Consolidated successfully.'
      );

      await loadPeriod(selectedPeriodId);
    } catch (err: any) {
      const blocking = Array.isArray(err?.body?.blocking) ? err.body.blocking : null;
      setConsolidateErr(
        blocking?.length
          ? `Missing: ${blocking.map((b: any) => `${b.area} (${b.status})`).join(', ')}`
          : err.message || 'Failed to consolidate'
      );
    } finally {
      setConsolidating(false);
    }
  }

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
                          {areaDisplayLabel(area.area)}
                          {area.area === 'EMP' ? ' (you)' : ''}
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
              {ownerApprovedCount} of 4 areas owner-approved
              {ownerApprovedCount < 4 && ' · all four are required to consolidate'}
            </span>

            <button
              className="dtt-secondary"
              type="button"
              onClick={handleConsolidate}
              disabled={!canConsolidate}
              title={
                ownerApprovedCount < 4
                  ? 'All four areas must be owner-approved first'
                  : 'Build the consolidated run for this period'
              }
            >
              {consolidating ? 'Consolidating…' : 'Consolidate areas'}
            </button>
            {/* El reporte es el destino natural despues de consolidar, y no
                habia forma de llegar desde aqui: el enlace solo existia en
                /payroll/owner. Es la pantalla con el total por persona y el
                CSV, o sea lo que se usa para rellenar ADP a mano. */}
            {selectedPeriodId && (
              <Link
                href={`/payroll/owner/review/${selectedPeriodId}`}
                style={{ ...smallLinkButtonStyle, padding: '0.5rem 0.9rem' }}
              >
                Ver reporte por persona
              </Link>
            )}
            <button
              className="dtt-secondary"
              type="button"
              disabled
              title={consolidatedApproved ? 'Export coming next' : 'Requires approved consolidated run'}
            >
              Export to ADP
            </button>

            <span className="dtt-action-bar-msg">
              {consolidateErr ? (
                <span style={{ color: '#b91c1c' }}>{consolidateErr}</span>
              ) : consolidateMsg ? (
                <span style={{ color: '#047857' }}>{consolidateMsg}</span>
              ) : (
                'You are the only one who sees dollar amounts.'
              )}
            </span>
          </div>
    </PayrollShell>
  );
}
