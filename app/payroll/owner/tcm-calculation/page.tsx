"use client";

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type AreaStatus = 'draft' | 'review_ready' | 'supervisor_approved' | 'owner_approved' | 'consolidated';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  sup_deadline: string | null;
  status: string;
}

interface TcmCalculationRow {
  employeeId: string;
  workerName: string;
  baseRate: number | null;
  week1: {
    units: number;
    hours: number;
    rate: number | null;
    amount: number | null;
    thresholdApplied: boolean;
  };
  week2: {
    units: number;
    hours: number;
    rate: number | null;
    amount: number | null;
    thresholdApplied: boolean;
  };
  totalHours: number;
  totalAmount: number | null;
  status: 'ready' | 'error';
  error: 'missing_rate' | null;
}

interface TcmCalculation {
  rows: TcmCalculationRow[];
  totalAmount: number;
  totalHours: number;
  missingRateCount: number;
  hasErrors: boolean;
}

interface TcmPreviewResponse {
  pay_run: {
    id: string;
    status: AreaStatus;
    last_calculated_at: string | null;
  };
  calculation: TcmCalculation;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function money(value: number | null) {
  if (value === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function numberValue(value: number | null) {
  if (value === null) return '-';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  if (init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & {
      status?: number;
      calculation?: TcmCalculation;
    };
    error.status = response.status;
    error.calculation = data.calculation;
    throw error;
  }

  return data;
}

export default function TcmCalculationPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [preview, setPreview] = useState<TcmPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (userLoading || !user) return;

    let mounted = true;

    const loadContext = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchWithSession('/api/payroll/tcm-calculation');
        if (!mounted) return;
        setPeriods(data.periods ?? []);
        setSelectedPeriodId(data.selected_period_id ?? data.periods?.[0]?.id ?? '');
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
      const data = await fetchWithSession('/api/payroll/tcm-calculation', {
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
      const data = await fetchWithSession('/api/payroll/tcm-calculation', {
        method: 'POST',
        body: JSON.stringify({ period_id: selectedPeriodId, action: 'confirm' }),
      });
      setPreview({
        ...preview,
        calculation: data.calculation,
      });
      setMessage(data.message || 'TCM calculation saved');
    } catch (err: any) {
      if (err.calculation) {
        setPreview({
          ...(preview as TcmPreviewResponse),
          calculation: err.calculation,
        });
      }
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (userLoading || loading) {
    return (
      <PayrollShell currentLabel="TCM Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="TCM Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="TCM Calculation">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>TCM Calculation Preview</h1>
          <p className="subtitle">
            Calculate TCM dollars with the 34-hour weekly rule. Preview first, save only after review.
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
            Supervisor deadline: {fmtDate(selectedPeriod.sup_deadline)} · Period status: {selectedPeriod.status}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="dtt-primary" type="button" onClick={calculatePreview} disabled={!selectedPeriodId || calculating}>
            {calculating ? 'Calculating...' : 'Calculate & preview'}
          </button>
          <button
            className="dtt-secondary"
            type="button"
            onClick={confirmSave}
            disabled={!preview || preview.calculation.hasErrors || saving}
            title={preview?.calculation.hasErrors ? 'Resolve missing rates before saving' : undefined}
          >
            {saving ? 'Saving...' : 'Confirm & save'}
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
              <div className="stat-card-label">TCM total</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{money(preview.calculation.totalAmount)}</div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Total hours</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{numberValue(preview.calculation.totalHours)}</div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Missing rates</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{preview.calculation.missingRateCount}</div>
            </div>
          </div>

          {preview.calculation.hasErrors && (
            <div className="error" style={{ marginBottom: 16 }}>
              Missing rate — assign in Employees before saving this calculation.
            </div>
          )}

          <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Wk1 units</th>
                    <th>Wk1 hours</th>
                    <th>Wk1 rate</th>
                    <th>Wk2 units</th>
                    <th>Wk2 hours</th>
                    <th>Wk2 rate</th>
                    <th>Total $</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.calculation.rows.map((row) => (
                    <tr key={row.employeeId} style={row.error ? { background: '#fff1f2' } : undefined}>
                      <td>
                        <strong>{row.workerName}</strong>
                      </td>
                      <td>{numberValue(row.week1.units)}</td>
                      <td>{numberValue(row.week1.hours)}</td>
                      <td>{row.week1.rate === null ? '-' : money(row.week1.rate)}</td>
                      <td>{numberValue(row.week2.units)}</td>
                      <td>{numberValue(row.week2.hours)}</td>
                      <td>{row.week2.rate === null ? '-' : money(row.week2.rate)}</td>
                      <td>
                        <strong>{money(row.totalAmount)}</strong>
                      </td>
                      <td>
                        {row.error ? (
                          <span className="badge warning">Missing rate — assign in Employees</span>
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
            Rule: each week is evaluated separately. 34.0 hours or more uses $30.00 for all hours in that week.
          </div>
        </>
      )}
    </PayrollShell>
  );
}
