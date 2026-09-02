"use client";

// app/payroll/capture/ba/page.tsx
// BA Supervisor Unit Capture Screen
// Roles allowed: supervisor_ba, owner

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  capture_opens_at: string;
  sup_deadline: string;
  pay_date: string;
  status: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface BAEntry {
  hours: number;
}

type Payload = Record<string, BAEntry>;

interface PageContext {
  is_owner: boolean;
  today: string;
  pay_periods: PayPeriod[];
  employees: Employee[];
  existing_run: { id: string; status: string } | null;
  existing_input: {
    id: string;
    status: string;
    payload: Payload;
    submitted_at: string | null;
  } | null;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dateToDayNum(s: string) {
  const [y, mo, d] = s.split('-').map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000);
}

function hoursLabel(hours: number) {
  return `${hours.toFixed(2)} h`;
}

function roleKey(value: string) {
  return value.trim().toUpperCase();
}

function getDisplayRole(role: string) {
  const normalized = roleKey(role);
  return normalized || '—';
}

function periodStatusInWindow(
  period: PayPeriod,
  today: string,
  isOwner: boolean
): 'open' | 'closed' {
  if (isOwner) return 'open';
  const todayNum = dateToDayNum(today);
  return todayNum >= dateToDayNum(period.capture_opens_at) &&
    todayNum <= dateToDayNum(period.sup_deadline)
    ? 'open'
    : 'closed';
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

export default function BACapturePage() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [ctx, setCtx] = useState<PageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [payload, setPayload] = useState<Payload>({});
  // Raw text the user is typing per field, so intermediate values like "14."
  // are not wiped by numeric parsing while typing fractional hours.
  const [rawInputs, setRawInputs] = useState<
    Record<string, Partial<Record<keyof BAEntry, string>>>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');
  const [roleCodes, setRoleCodes] = useState<string[]>([]);

  useEffect(() => {
    if (userLoading || !user) return;

    const loadContext = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const data: PageContext = await fetchWithSession('/api/payroll/capture/ba');
        setCtx(data);

        const ctxData = await fetchWithSession('/api/payroll/runs/context');
        setRoleCodes(ctxData.role_codes ?? []);

        if (data.pay_periods.length > 0) {
          setSelectedPeriodId(data.pay_periods[0].id);
        }
      } catch (err: any) {
        if (err.status === 401 || err.status === 403) {
          window.location.href = '/not-authorized';
          return;
        }
        setFetchError(err.message);
      } finally {
        setLoading(false);
      }
    };

    void loadContext();
  }, [user, userLoading]);

  useEffect(() => {
    if (userLoading || !user || !selectedPeriodId) return;

    const loadForPeriod = async () => {
      try {
        const data: PageContext = await fetchWithSession(
          `/api/payroll/capture/ba?period_id=${selectedPeriodId}`
        );

        setCtx((prev) =>
          prev
            ? {
                ...prev,
                existing_run: data.existing_run,
                existing_input: data.existing_input,
              }
            : prev
        );

        if (data.existing_input?.payload) {
          setPayload(data.existing_input.payload as Payload);
        } else if (data.employees) {
          const init: Payload = {};
          data.employees.forEach((employee) => {
            init[employee.id] = { hours: 0 };
          });
          setPayload(init);
        }
        // Clear any raw typing overlay when a new period's data loads.
        setRawInputs({});
        setSaveMsg('');
        setSaveError('');
      } catch {
        // Keep current state if the period lookup fails.
      }
    };

    void loadForPeriod();
  }, [selectedPeriodId, user, userLoading]);

  useEffect(() => {
    if (!ctx?.employees?.length) return;
    if (Object.keys(payload).length > 0) return;

    const init: Payload = {};
    ctx.employees.forEach((employee) => {
      init[employee.id] = { hours: 0 };
    });
    setPayload(init);
  }, [ctx?.employees, payload]);

  const selectedPeriod = useMemo(
    () => ctx?.pay_periods.find((period) => period.id === selectedPeriodId),
    [ctx?.pay_periods, selectedPeriodId]
  );

  const alreadySubmitted =
    ctx?.existing_input?.status === 'review_ready' ||
    ctx?.existing_input?.status === 'submitted';

  const runLocked =
    ctx?.existing_run?.status === 'exported' ||
    ctx?.existing_run?.status === 'locked';

  // El owner puede corregir una captura ya enviada mientras el area no
  // este aprobada. Sin esto, un cero mal metido por un supervisor solo se
  // podia arreglar tocando la base a mano: con 46 personas, eso pasa.
  const canOverrideSubmitted = Boolean(ctx?.is_owner);
  const isReadOnly = (alreadySubmitted && !canOverrideSubmitted) || runLocked;

  // What to show in the input: the raw text being typed if present,
  // otherwise the numeric value from the payload.
  function displayValue(
    employeeId: string,
    field: keyof BAEntry,
    numericValue: number
  ) {
    const raw = rawInputs[employeeId]?.[field];
    return raw !== undefined ? raw : String(numericValue);
  }

  function handleFieldChange(
    employeeId: string,
    field: keyof BAEntry,
    raw: string
  ) {
    // Keep the raw text so typing "14." (mid-decimal) is not lost.
    setRawInputs((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? {}), [field]: raw },
    }));

    // Horas con decimales (14.75). Se conservan dígitos y un solo punto.
    // El parseInt de la rama de assessment desapareció con el concepto:
    // era justo el que truncaba los decimales en el bug de julio.
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    const parsed = parseFloat(cleaned);
    const val = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

    setPayload((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] ?? { hours: 0 }),
        [field]: val,
      },
    }));
    setSaveMsg('');
    setSaveError('');
  }

  async function handleSave(action: 'draft' | 'submit') {
    if (!selectedPeriodId) return;

    setSaving(true);
    setSaveMsg('');
    setSaveError('');

    try {
      const res = await fetchWithSession('/api/payroll/capture/ba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriodId, action, payload }),
      });

      setSaveMsg(res.message);

      const updated: PageContext = await fetchWithSession(
        `/api/payroll/capture/ba?period_id=${selectedPeriodId}`
      );
      setCtx((prev) =>
        prev
          ? {
              ...prev,
              existing_run: updated.existing_run,
              existing_input: updated.existing_input,
            }
          : prev
      );
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (userLoading) {
    return (
      <PayrollShell currentLabel="BA Capture">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="BA Capture">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  if (loading) {
    return (
      <PayrollShell currentLabel="BA Capture">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading…</p>
        </div>
      </PayrollShell>
    );
  }

  if (fetchError) {
    return (
      <PayrollShell currentLabel="BA Capture">
          <div className="error">{fetchError}</div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="BA Capture">
          <div className="page-header">
            <div className="page-header-content">
              <h1 style={{ fontSize: 22, marginBottom: 4 }}>BA — Unit Capture</h1>
              <p className="subtitle">
                Capture hours for all BA employees.
              </p>
            </div>
          </div>

          <div className="section">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label htmlFor="period-select">Pay Period</label>
              <select
                id="period-select"
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                style={{ maxWidth: 480 }}
              >
                {ctx?.pay_periods.length === 0 && (
                  <option value="">No open periods available</option>
                )}
                {ctx?.pay_periods.map((period) => (
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
                  {fmtDate(selectedPeriod.start_date)} – {fmtDate(selectedPeriod.end_date)}
                </span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Capture deadline</span>
                <span className="dtt-period-card-value">{fmtDate(selectedPeriod.sup_deadline)}</span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Pay date</span>
                <span className="dtt-period-card-value">{fmtDate(selectedPeriod.pay_date)}</span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Status</span>
                {periodStatusInWindow(selectedPeriod, ctx?.today ?? '', ctx?.is_owner ?? false) === 'open' ? (
                  <span className="dtt-badge-open">Open</span>
                ) : (
                  <span className="dtt-badge-closed">Closed</span>
                )}
              </div>
            </div>
          )}

          {alreadySubmitted && (
            <div className="dtt-submitted-banner">
              ✓ These units have been submitted for approval.
              {canOverrideSubmitted && (
                <span style={{ marginLeft: 8, fontWeight: 600 }}>
                  As owner you can still correct and re-submit until the area is approved.
                </span>
              )}
              {ctx?.existing_input?.submitted_at && (
                <span style={{ marginLeft: 8, opacity: 0.75 }}>
                  Submitted {new Date(ctx.existing_input.submitted_at).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {runLocked && (
            <div className="error" style={{ marginBottom: 16 }}>
              This pay run is locked and cannot be modified.
            </div>
          )}

          {ctx?.employees && ctx.employees.length > 0 ? (
            <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Worker</th>
                      <th style={{ width: '30%' }}>Role</th>
                      <th style={{ width: '30%', textAlign: 'center' }}>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.employees.map((employee) => {
                      const entry = payload[employee.id] ?? { hours: 0 };

                      return (
                        <tr key={employee.id}>
                          <td>
                            <span style={{ fontWeight: 500, fontSize: 14, color: '#1c1917' }}>
                              {employee.first_name} {employee.last_name}
                            </span>
                          </td>
                          <td>
                            <span className="badge accent">{getDisplayRole(employee.role)}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              className="dtt-units-input"
                              type="text"
                              inputMode="decimal"
                              value={displayValue(employee.id, 'hours', entry.hours)}
                              disabled={isReadOnly}
                              onChange={(e) => handleFieldChange(employee.id, 'hours', e.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  padding: '12px 20px',
                  fontSize: 12,
                  color: '#9ca3af',
                  borderTop: '1px solid #f0f1f3',
                }}
              >
                Hours are captured once per period. Fractions are allowed (e.g. 14.75).
              </div>
            </div>
          ) : (
            <div className="section">
              <div className="empty-state">
                No BA employees found.
                <br />
                <span style={{ fontSize: 13 }}>
                  Employees appear here when they have an assignment with department = BA.
                </span>
              </div>
            </div>
          )}

          {!runLocked && ctx?.pay_periods && ctx.pay_periods.length > 0 && (
            <div className="dtt-action-bar">
              {(!alreadySubmitted || canOverrideSubmitted) && (
                <>
                  <button
                    className="dtt-secondary"
                    onClick={() => handleSave('draft')}
                    disabled={saving || !selectedPeriodId}
                  >
                    {saving ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button
                    className="dtt-primary"
                    onClick={() => handleSave('submit')}
                    disabled={saving || !selectedPeriodId}
                  >
                    {saving ? 'Submitting…' : 'Submit for Approval'}
                  </button>
                </>
              )}

              {saveMsg && (
                <span className="dtt-action-bar-msg" style={{ color: '#0d7a5f' }}>
                  ✓ {saveMsg}
                </span>
              )}
              {saveError && (
                <span className="dtt-action-bar-msg" style={{ color: '#b91c1c' }}>
                  ✗ {saveError}
                </span>
              )}
            </div>
          )}
    </PayrollShell>
  );
}
