"use client";

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type CaptureType = 'hours' | 'days' | 'edwina';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  owner_deadline: string | null;
  status: string;
}

interface OfficeEmployee {
  employee_id: string;
  first_name: string;
  last_name: string;
  worker_name: string;
  role: string;
  capture_type: CaptureType;
  outreach_rate: {
    rate_key: string;
    rate_value: number | string | null;
    base_reference: string | null;
  } | null;
  computed_amount: number | null;
}

interface PayloadEntry {
  hours?: number;
  days?: number;
}

type Payload = Record<string, PayloadEntry>;

interface OfficeCaptureContext {
  periods: PayPeriod[];
  selected_period_id: string | null;
  employees: OfficeEmployee[];
  existing_run: { id: string; status: string } | null;
  existing_input: {
    id: string;
    status: string;
    payload: Payload;
    submitted_at: string | null;
  } | null;
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
  if (value === null) return 'Pending';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function inputLabel(captureType: CaptureType) {
  if (captureType === 'days') return 'Days';
  if (captureType === 'edwina') return 'Calculated';
  return 'Hours';
}

function normalizePayload(employees: OfficeEmployee[], payload?: Payload | null): Payload {
  const next: Payload = {};
  employees.forEach((employee) => {
    const entry = payload?.[employee.employee_id] ?? {};
    if (employee.capture_type === 'days') {
      next[employee.employee_id] = { days: Number(entry.days ?? 0) };
    } else if (employee.capture_type === 'hours') {
      next[employee.employee_id] = { hours: Number(entry.hours ?? 0) };
    }
  });
  return next;
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
    const error = new Error(data.error || 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data;
}

export default function OfficeCapturePage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [ctx, setCtx] = useState<OfficeCaptureContext | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [payload, setPayload] = useState<Payload>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadContext(periodId?: string) {
    setLoading(true);
    setError('');

    try {
      const query = periodId ? `?period_id=${periodId}` : '';
      const data: OfficeCaptureContext = await fetchWithSession(`/api/payroll/owner/office-capture${query}`);
      setCtx(data);
      setSelectedPeriodId(data.selected_period_id ?? '');
      setPayload(normalizePayload(data.employees ?? [], data.existing_input?.payload));
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
    void loadContext();
  }, [user, userLoading]);

  const selectedPeriod = useMemo(
    () => ctx?.periods.find((period) => period.id === selectedPeriodId) ?? null,
    [ctx?.periods, selectedPeriodId]
  );

  const submitted =
    ctx?.existing_input?.status === 'review_ready' ||
    ctx?.existing_input?.status === 'submitted';

  const locked = ['owner_approved', 'consolidated', 'exported', 'locked'].includes(
    ctx?.existing_run?.status ?? ''
  );

  const readOnly = submitted || locked;

  function handleValueChange(employee: OfficeEmployee, raw: string) {
    const value = Math.max(0, Number(raw) || 0);
    setPayload((prev) => ({
      ...prev,
      [employee.employee_id]:
        employee.capture_type === 'days'
          ? { days: value }
          : { hours: value },
    }));
    setMessage('');
    setError('');
  }

  async function save(action: 'draft' | 'submit') {
    if (!selectedPeriodId) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const data = await fetchWithSession('/api/payroll/owner/office-capture', {
        method: 'POST',
        body: JSON.stringify({
          period_id: selectedPeriodId,
          action,
          payload,
        }),
      });

      setMessage(data.message || 'Saved');
      await loadContext(selectedPeriodId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function approveArea() {
    if (!ctx?.existing_run?.id) return;

    setApproving(true);
    setError('');
    setMessage('');

    try {
      const data = await fetchWithSession(`/api/payroll/runs/${ctx.existing_run.id}/approve`, {
        method: 'POST',
      });
      setMessage(data.message || 'EMP area approved');
      await loadContext(selectedPeriodId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  if (userLoading || loading) {
    return (
      <PayrollShell currentLabel="Office Payroll">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="Office Payroll">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="Office Payroll">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Office Payroll Capture</h1>
          <p className="subtitle">
            Capture office hours and PSYQ days. Salary amounts stay in ADP.
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
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label htmlFor="period-select">Pay Period</label>
          <select
            id="period-select"
            value={selectedPeriodId}
            onChange={(event) => {
              setSelectedPeriodId(event.target.value);
              setMessage('');
              void loadContext(event.target.value);
            }}
            style={{ maxWidth: 560 }}
          >
            {ctx?.periods.length === 0 && <option value="">No periods available</option>}
            {ctx?.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.week_code} | {fmtDate(period.start_date)} - {fmtDate(period.end_date)} | Pay {fmtDate(period.pay_date)}
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
            <span className="dtt-period-card-label">Run status</span>
            <span className="badge info">{ctx?.existing_run?.status ?? 'not_started'}</span>
          </div>
        </div>
      )}

      {submitted && (
        <div className="dtt-submitted-banner" style={{ marginBottom: 16 }}>
          Office time has been marked ready.
          {ctx?.existing_input?.submitted_at && (
            <span style={{ marginLeft: 8, opacity: 0.75 }}>
              Submitted {new Date(ctx.existing_input.submitted_at).toLocaleString()}
            </span>
          )}
        </div>
      )}

      <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Group</th>
                <th>Capture</th>
                <th>Value</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(ctx?.employees ?? []).map((employee) => {
                const entry = payload[employee.employee_id] ?? {};
                const value =
                  employee.capture_type === 'days'
                    ? entry.days ?? 0
                    : entry.hours ?? 0;

                return (
                  <tr key={employee.employee_id}>
                    <td>
                      <strong>{employee.worker_name}</strong>
                    </td>
                    <td>
                      <span className="badge">{employee.role}</span>
                    </td>
                    <td>{inputLabel(employee.capture_type)}</td>
                    <td>
                      {employee.capture_type === 'edwina' ? (
                        <strong>{money(employee.computed_amount)}</strong>
                      ) : (
                        <input
                          className="dtt-units-input"
                          type="number"
                          min={0}
                          step={employee.capture_type === 'days' ? 1 : 0.25}
                          value={value}
                          disabled={readOnly || saving}
                          onChange={(event) => handleValueChange(employee, event.target.value)}
                          aria-label={`${employee.worker_name} ${inputLabel(employee.capture_type)}`}
                        />
                      )}
                    </td>
                    <td style={{ color: '#6b7280', fontSize: 13 }}>
                      {employee.capture_type === 'days' && 'PSYQ days for ADP'}
                      {employee.capture_type === 'hours' && 'Office hours for ADP'}
                      {employee.capture_type === 'edwina' &&
                        `Read only. Calculated after RBT total is available${
                          employee.outreach_rate?.rate_value
                            ? ` (${employee.outreach_rate.rate_value}% ${employee.outreach_rate.base_reference ?? ''})`
                            : ''
                        }.`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!locked && ctx?.periods && ctx.periods.length > 0 && (
        <div className="dtt-action-bar">
          {!submitted && (
            <>
              <button
                className="dtt-secondary"
                type="button"
                onClick={() => save('draft')}
                disabled={saving || !selectedPeriodId}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                className="dtt-primary"
                type="button"
                onClick={() => save('submit')}
                disabled={saving || !selectedPeriodId}
              >
                {saving ? 'Saving...' : 'Mark Ready'}
              </button>
            </>
          )}
          {submitted && ctx?.existing_run?.status === 'review_ready' && (
            <button
              className="dtt-primary"
              type="button"
              onClick={approveArea}
              disabled={approving}
            >
              {approving ? 'Approving...' : 'Approve area'}
            </button>
          )}
          <span className="dtt-action-bar-msg">
            ADP export wiring for these hours/days will be confirmed in the export step.
          </span>
        </div>
      )}
    </PayrollShell>
  );
}
