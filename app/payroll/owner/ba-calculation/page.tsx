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

interface BaCalculationRow {
  employeeId: string;
  workerName: string;
  role: string;
  baseRate: number | null;
  hours: {
    quantity: number;
    rate: number | null;
    amount: number | null;
    applies: boolean;
  };
  assessment: {
    quantity: number;
    rate: number | null;
    amount: number | null;
    applies: boolean;
  };
  reassessment: {
    quantity: number;
    rate: number | null;
    amount: number | null;
    applies: boolean;
  };
  totalAmount: number | null;
  status: 'ready' | 'error';
  errors: Array<'missing_rate' | 'missing_service_rate'>;
}

interface BaCalculation {
  rows: BaCalculationRow[];
  totalAmount: number;
  totalHours: number;
  errorCount: number;
  hasErrors: boolean;
}

interface BaPreviewResponse {
  pay_run: {
    id: string;
    status: AreaStatus;
    last_calculated_at: string | null;
  };
  calculation: BaCalculation;
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

function errorLabel(errors: BaCalculationRow['errors']) {
  if (errors.includes('missing_rate') && errors.includes('missing_service_rate')) {
    return 'Missing hourly and service rate';
  }
  if (errors.includes('missing_rate')) {
    return 'Missing hourly rate — assign in Employees';
  }
  if (errors.includes('missing_service_rate')) {
    return 'Missing service rate — assign in pay rates';
  }
  return '';
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
      calculation?: BaCalculation;
    };
    error.status = response.status;
    error.calculation = data.calculation;
    throw error;
  }

  return data;
}

export default function BaCalculationPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [preview, setPreview] = useState<BaPreviewResponse | null>(null);
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
        const data = await fetchWithSession('/api/payroll/ba-calculation');
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
      const data = await fetchWithSession('/api/payroll/ba-calculation', {
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
      const data = await fetchWithSession('/api/payroll/ba-calculation', {
        method: 'POST',
        body: JSON.stringify({ period_id: selectedPeriodId, action: 'confirm' }),
      });
      setPreview({
        ...preview,
        pay_run: {
          ...preview.pay_run,
          status: 'review_ready',
        },
        calculation: data.calculation,
      });
      setMessage(data.message || 'BA calculation saved');
    } catch (err: any) {
      if (err.calculation) {
        setPreview({
          ...(preview as BaPreviewResponse),
          calculation: err.calculation,
        });
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
        pay_run: {
          ...preview.pay_run,
          status: data.pay_run?.status ?? 'owner_approved',
        },
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
      <PayrollShell currentLabel="BA Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="BA Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="BA Calculation">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>BA Calculation Preview</h1>
          <p className="subtitle">
            Calculate BA dollars from hours, assessments, and re-assessments. Preview first, save only after review.
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
            title={preview?.calculation.hasErrors ? 'Resolve missing rates before approving' : undefined}
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
              <div className="stat-card-label">BA total</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{money(preview.calculation.totalAmount)}</div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Total hours</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{numberValue(preview.calculation.totalHours)}</div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Errors</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{preview.calculation.errorCount}</div>
            </div>
          </div>

          {preview.calculation.hasErrors && (
            <div className="error" style={{ marginBottom: 16 }}>
              Missing rates found. Assign hourly rates in Employees and service rates in pay rates before saving.
            </div>
          )}

          <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Role</th>
                    <th>Hours</th>
                    <th>Hours $</th>
                    <th>Assess. qty</th>
                    <th>Assess. $</th>
                    <th>Re-assess. qty</th>
                    <th>Re-assess. $</th>
                    <th>Total $</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.calculation.rows.map((row) => (
                    <tr key={row.employeeId} style={row.errors.length > 0 ? { background: '#fff1f2' } : undefined}>
                      <td>
                        <strong>{row.workerName}</strong>
                      </td>
                      <td>
                        <span className="badge accent">{row.role}</span>
                      </td>
                      <td>{numberValue(row.hours.quantity)}</td>
                      <td>{money(row.hours.amount)}</td>
                      <td>{numberValue(row.assessment.quantity)}</td>
                      <td>{row.assessment.applies ? money(row.assessment.amount) : 'N/A'}</td>
                      <td>{numberValue(row.reassessment.quantity)}</td>
                      <td>{row.reassessment.applies ? money(row.reassessment.amount) : 'N/A'}</td>
                      <td>
                        <strong>{money(row.totalAmount)}</strong>
                      </td>
                      <td>
                        {row.errors.length > 0 ? (
                          <span className="badge warning">{errorLabel(row.errors)}</span>
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
            Service rates use active pay_rates rows where concept is ASSESSMENT or REASSESSMENT and valid_to is null.
          </div>
        </>
      )}
    </PayrollShell>
  );
}
