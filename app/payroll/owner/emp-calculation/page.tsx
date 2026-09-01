"use client";

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

// ---------------------------------------------------------------------------
// Pantalla de cálculo del área EMP (oficina).
//
// Era la única de las cinco áreas sin pantalla de cálculo: en owner/period,
// tanto "Capture" como "Review & approve" llevaban a office-capture, que es
// la pantalla de captura. El paso de cálculo no existía en la interfaz, y por
// eso EMP nunca escribía pay_run_items ni aportaba nada al consolidado.
// ---------------------------------------------------------------------------

type AreaStatus = 'draft' | 'review_ready' | 'supervisor_approved' | 'owner_approved' | 'consolidated';
type CaptureType = 'hours' | 'days' | 'outreach';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  owner_deadline: string | null;
  status: string;
}

interface EmpCalculationRow {
  employeeId: string;
  workerName: string;
  role: string;
  captureType: CaptureType;
  hours: number;
  days: number;
  rateUsed: number | null;
  totalAmount: number | null;
  status: 'ready' | 'error';
  error:
    | 'missing_hourly_rate'
    | 'missing_fixed_salary'
    | 'missing_outreach_percent'
    | 'missing_outreach_base'
    | null;
  note: string | null;
}

interface EmpCalculation {
  rows: EmpCalculationRow[];
  totalAmount: number;
  totalHours: number;
  errorCount: number;
  hasErrors: boolean;
}

interface EmpPreviewResponse {
  pay_run: {
    id: string;
    status: AreaStatus;
    last_calculated_at: string | null;
  };
  calculation: EmpCalculation;
}

const CAPTURE_LABEL: Record<CaptureType, string> = {
  hours: 'Office hours',
  days: 'Psychiatrist',
  outreach: 'Outreach %',
};

/** Qué hacer ante cada error. Un mensaje que no dice dónde arreglarlo no sirve. */
const ERROR_HINT: Record<NonNullable<EmpCalculationRow['error']>, string> = {
  missing_hourly_rate: 'Add HOURLY or FIXED_SALARY in Pay Configuration',
  missing_fixed_salary: 'Add FIXED_SALARY in Pay Configuration',
  missing_outreach_percent: 'Add a PERCENT rate in Pay Configuration',
  missing_outreach_base: 'Calculate the BA area first — the percentage needs its base',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function money(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
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
  if (init.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, { ...init, headers });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & {
      status?: number;
      calculation?: EmpCalculation;
    };
    error.status = response.status;
    error.calculation = data.calculation;
    throw error;
  }

  return data;
}

export default function EmpCalculationPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [preview, setPreview] = useState<EmpPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (userLoading || !user) return;

    let mounted = true;

    const loadContext = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchWithSession('/api/payroll/emp-calculation');
        if (!mounted) return;
        const requestedPeriodId = new URLSearchParams(window.location.search).get('period_id');
        setPeriods(data.periods ?? []);
        setSelectedPeriodId(
          data.periods?.some((period: PayPeriod) => period.id === requestedPeriodId)
            ? requestedPeriodId
            : data.selected_period_id ?? data.periods?.[0]?.id ?? ''
        );
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

    void loadContext();

    return () => {
      mounted = false;
    };
  }, [user, userLoading]);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );

  async function calculatePreview() {
    if (!selectedPeriodId) return;
    setCalculating(true);
    setError('');
    setMessage('');

    try {
      const data = await fetchWithSession('/api/payroll/emp-calculation', {
        method: 'POST',
        body: JSON.stringify({ period_id: selectedPeriodId, action: 'preview' }),
      });
      setPreview(data);
    } catch (err: any) {
      setPreview(null);
      setError(err.message);
    } finally {
      setCalculating(false);
    }
  }

  async function confirmSave() {
    if (!selectedPeriodId || !preview || preview.calculation.hasErrors) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const data = await fetchWithSession('/api/payroll/emp-calculation', {
        method: 'POST',
        body: JSON.stringify({ period_id: selectedPeriodId, action: 'confirm' }),
      });
      setPreview({
        ...preview,
        pay_run: { ...preview.pay_run, status: 'review_ready' },
        calculation: data.calculation,
      });
      setMessage(data.message || 'EMP calculation saved');
    } catch (err: any) {
      if (err.calculation) {
        setPreview({ ...(preview as EmpPreviewResponse), calculation: err.calculation });
      }
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function approveArea() {
    if (!preview || preview.calculation.hasErrors) return;
    setApproving(true);
    setError('');
    setMessage('');

    try {
      const data = await fetchWithSession(`/api/payroll/runs/${preview.pay_run.id}/approve`, {
        method: 'POST',
      });
      setPreview({
        ...preview,
        pay_run: { ...preview.pay_run, status: data.pay_run?.status ?? 'owner_approved' },
      });
      setMessage(data.message || 'Area approved');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  if (userLoading || loading) {
    return (
      <PayrollShell currentLabel="EMP Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="EMP Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="EMP Calculation">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>EMP / Office Calculation Preview</h1>
          <p className="subtitle">
            Office hours, psychiatrist fixed salaries and the outreach percentage.
            Preview first, save only after review.
          </p>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
      {message && (
        <div className="dtt-submitted-banner" style={{ marginBottom: 16 }}>
          {message}
        </div>
      )}

      <div className="section">
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="period">Pay period</label>
            <select
              id="period"
              value={selectedPeriodId}
              onChange={(event) => {
                setSelectedPeriodId(event.target.value);
                setPreview(null);
                setMessage('');
                setError('');
              }}
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.week_code} · {fmtDate(period.start_date)} - {fmtDate(period.end_date)} · Pay {fmtDate(period.pay_date)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedPeriod && (
          <div className="info" style={{ marginTop: 12 }}>
            Capture the office hours first in EMP / Office Capture. Period status: {selectedPeriod.status}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            className="dtt-primary"
            type="button"
            onClick={calculatePreview}
            disabled={!selectedPeriodId || calculating}
          >
            {calculating ? 'Calculating...' : 'Calculate & preview'}
          </button>
          <button
            className="dtt-secondary"
            type="button"
            onClick={confirmSave}
            disabled={!preview || preview.calculation.hasErrors || saving}
            title={preview?.calculation.hasErrors ? 'Resolve the missing rates before saving' : undefined}
          >
            {saving ? 'Saving...' : 'Confirm & save'}
          </button>
          <button
            className="dtt-primary"
            type="button"
            onClick={approveArea}
            disabled={
              !preview ||
              preview.calculation.hasErrors ||
              approving ||
              !['review_ready', 'supervisor_approved'].includes(preview.pay_run.status)
            }
            title={preview?.calculation.hasErrors ? 'Resolve the missing rates before approving' : undefined}
          >
            {approving ? 'Approving...' : 'Approve area'}
          </button>
        </div>
      </div>

      {preview && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">EMP total</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>
                {money(preview.calculation.totalAmount)}
              </div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Total hours</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>
                {preview.calculation.totalHours}
              </div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Errors</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>
                {preview.calculation.errorCount}
              </div>
            </div>
          </div>

          {preview.calculation.hasErrors && (
            <div className="error" style={{ marginBottom: 16 }}>
              {preview.calculation.errorCount} worker(s) cannot be calculated. Nothing is saved
              until every rate is resolved — an amount of $0.00 would be paid as if it were real.
            </div>
          )}

          <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Type</th>
                    <th>Hours</th>
                    <th>Rate / salary</th>
                    <th>Total $</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.calculation.rows.map((row) => (
                    <tr key={row.employeeId} style={row.error ? { background: '#fff1f2' } : undefined}>
                      <td>
                        <strong>{row.workerName}</strong>
                        {row.note && (
                          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{row.note}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge accent">{CAPTURE_LABEL[row.captureType]}</span>
                        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{row.role}</div>
                      </td>
                      <td>
                        {row.captureType === 'days'
                          ? `${row.days} day(s)`
                          : row.captureType === 'outreach'
                            ? '—'
                            : row.hours}
                      </td>
                      <td>
                        {row.captureType === 'outreach'
                          ? row.rateUsed === null
                            ? '—'
                            : `${row.rateUsed}%`
                          : money(row.rateUsed)}
                      </td>
                      <td>
                        <strong>{money(row.totalAmount)}</strong>
                      </td>
                      <td>
                        {row.error ? (
                          <span className="badge warning">{ERROR_HINT[row.error]}</span>
                        ) : (
                          <span className="badge success">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="info" style={{ marginTop: 14 }}>
            Rates come from Pay Configuration (pay_role_rates). FIXED_SALARY takes precedence over
            HOURLY: whoever has a fixed salary is paid that amount and the captured hours are kept
            as a record only. Edwina&apos;s percentage is computed live from the BA area, so it
            recalculates on its own if an RBT is edited after approval.
          </div>
        </>
      )}
    </PayrollShell>
  );
}
