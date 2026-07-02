"use client";

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { CMHC_SERVICES, type CmhcServiceName } from '@/lib/payroll/calcCMHC';

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

interface CmhcServiceCalculation {
  serviceName: CmhcServiceName;
  quantity: number;
  rate: number | null;
  amount: number | null;
  rateSource: 'pay_rates' | 'clinician_service_rates';
  error: 'missing_service_rate' | null;
}

interface CmhcCalculationRow {
  employeeId: string;
  workerName: string;
  role: string;
  services: CmhcServiceCalculation[];
  totalAmount: number | null;
  status: 'ready' | 'error';
  errors: Array<'missing_service_rate'>;
}

interface CmhcCalculation {
  rows: CmhcCalculationRow[];
  totalAmount: number;
  errorCount: number;
  hasErrors: boolean;
}

interface CmhcPreviewResponse {
  pay_run: {
    id: string;
    status: AreaStatus;
    last_calculated_at: string | null;
  };
  calculation: CmhcCalculation;
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

function serviceForRow(row: CmhcCalculationRow, serviceName: CmhcServiceName) {
  return row.services.find((service) => service.serviceName === serviceName) ?? null;
}

function missingRateLabel(row: CmhcCalculationRow) {
  const missing = row.services
    .filter((service) => service.error === 'missing_service_rate')
    .map((service) => service.serviceName);

  return missing.length > 0 ? `Missing rate: ${missing.join(', ')}` : '';
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
      calculation?: CmhcCalculation;
    };
    error.status = response.status;
    error.calculation = data.calculation;
    throw error;
  }

  return data;
}

export default function CmhcCalculationPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [preview, setPreview] = useState<CmhcPreviewResponse | null>(null);
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
        const data = await fetchWithSession('/api/payroll/cmhc-calculation');
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
      const data = await fetchWithSession('/api/payroll/cmhc-calculation', {
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
      const data = await fetchWithSession('/api/payroll/cmhc-calculation', {
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
      setMessage(data.message || 'CMHC calculation saved');
    } catch (err: any) {
      if (err.calculation) {
        setPreview({
          ...(preview as CmhcPreviewResponse),
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
      <PayrollShell currentLabel="CMHC Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="CMHC Calculation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="CMHC Calculation">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>CMHC Calculation Preview</h1>
          <p className="subtitle">
            Calculate CMHC dollars from therapist service quantities. Preview first, save only after review.
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
            title={preview?.calculation.hasErrors ? 'Resolve missing service rates before saving' : undefined}
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
            title={preview?.calculation.hasErrors ? 'Resolve missing service rates before approving' : undefined}
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
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">CMHC total</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{money(preview.calculation.totalAmount)}</div>
            </div>
            <div className="stat-card" style={{ boxShadow: 'none' }}>
              <div className="stat-card-label">Errors</div>
              <div className="stat-card-value" style={{ fontSize: 20 }}>{preview.calculation.errorCount}</div>
            </div>
          </div>

          {preview.calculation.hasErrors && (
            <div className="error" style={{ marginBottom: 16 }}>
              Missing service rates found. Assign pay_rates for captured services before saving.
            </div>
          )}

          <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Worker</th>
                    <th>Role</th>
                    {CMHC_SERVICES.map((serviceName) => (
                      <th key={serviceName} style={{ minWidth: 150 }}>{serviceName}</th>
                    ))}
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
                      {CMHC_SERVICES.map((serviceName) => {
                        const service = serviceForRow(row, serviceName);
                        return (
                          <td key={serviceName}>
                            {service ? (
                              <div style={{ display: 'grid', gap: 3 }}>
                                <span>{numberValue(service.quantity)} × {money(service.rate)}</span>
                                <strong>{money(service.amount)}</strong>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <strong>{money(row.totalAmount)}</strong>
                      </td>
                      <td>
                        {row.errors.length > 0 ? (
                          <span className="badge warning">{missingRateLabel(row)}</span>
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
            IT uses clinician_service_rates. The other services use active CMHC pay_rates mapped by concept.
          </div>
        </>
      )}
    </PayrollShell>
  );
}
