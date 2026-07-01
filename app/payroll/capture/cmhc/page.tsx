"use client";

// app/payroll/capture/cmhc/page.tsx
// CMHC Supervisor Service Capture Screen
// Roles allowed: supervisor_cmhc, owner

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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

type CMHCEntry = Record<string, number>;
type Payload = Record<string, CMHCEntry>;

interface PageContext {
  is_owner: boolean;
  today: string;
  pay_periods: PayPeriod[];
  employees: Employee[];
  services: string[];
  existing_run: { id: string; status: string } | null;
  existing_input: {
    id: string;
    status: string;
    payload: Payload;
    submitted_at: string | null;
  } | null;
}

function fmtDate(iso: string) {
  if (!iso) return '-';
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

function roleDisplayLabel(roleCodes: string[]): string {
  if (roleCodes.includes('owner')) return 'Owner';
  if (roleCodes.includes('supervisor_cmhc')) return 'Supervisor CMHC';
  return 'Payroll';
}

function displayRole(role: string) {
  return role.trim().toUpperCase() || '-';
}

function buildEmptyEntry(services: string[]) {
  return services.reduce<CMHCEntry>((entry, service) => {
    entry[service] = 0;
    return entry;
  }, {});
}

function buildInitialPayload(employees: Employee[], services: string[]) {
  return employees.reduce<Payload>((next, employee) => {
    next[employee.id] = buildEmptyEntry(services);
    return next;
  }, {});
}

function normalizeLoadedPayload(
  loadedPayload: Payload | undefined,
  employees: Employee[],
  services: string[]
) {
  const next = buildInitialPayload(employees, services);

  if (!loadedPayload) {
    return next;
  }

  for (const employee of employees) {
    const existingEntry = loadedPayload[employee.id] ?? {};
    for (const service of services) {
      const value = existingEntry[service];
      next[employee.id][service] = typeof value === 'number' && value >= 0 ? value : 0;
    }
  }

  return next;
}

export default function CMHCCapturePage() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [ctx, setCtx] = useState<PageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [payload, setPayload] = useState<Payload>({});
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
        const data: PageContext = await fetchWithSession('/api/payroll/capture/cmhc');
        setCtx(data);
        setPayload(buildInitialPayload(data.employees, data.services));

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
          `/api/payroll/capture/cmhc?period_id=${selectedPeriodId}`
        );

        setCtx((prev) =>
          prev
            ? {
                ...prev,
                existing_run: data.existing_run,
                existing_input: data.existing_input,
                employees: data.employees,
                services: data.services,
              }
            : data
        );

        setPayload(normalizeLoadedPayload(data.existing_input?.payload, data.employees, data.services));
        setSaveMsg('');
        setSaveError('');
      } catch {
        // Keep current state if the period lookup fails.
      }
    };

    void loadForPeriod();
  }, [selectedPeriodId, user, userLoading]);

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

  const isReadOnly = alreadySubmitted || runLocked;
  const userEmail = user?.email ?? '';
  const roleLabel = roleDisplayLabel(roleCodes);

  function handleQuantityChange(employeeId: string, service: string, raw: string) {
    const value = Math.max(0, parseInt(raw, 10) || 0);
    setPayload((prev) => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] ?? buildEmptyEntry(ctx?.services ?? [])),
        [service]: value,
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
      const res = await fetchWithSession('/api/payroll/capture/cmhc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriodId, action, payload }),
      });

      setSaveMsg(res.message);

      const updated: PageContext = await fetchWithSession(
        `/api/payroll/capture/cmhc?period_id=${selectedPeriodId}`
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
      <div className="dtt-layout">
        <div className="dtt-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dtt-layout">
        <div className="dtt-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dtt-layout">
        <div className="dtt-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="dtt-layout">
        <div className="dtt-content">
          <div className="error">{fetchError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dtt-layout">
      <aside className="dtt-sidebar">
        <div className="dtt-sidebar-logo">
          <div className="dtt-sidebar-logo-title">DTT Coaching Services</div>
          <div className="dtt-sidebar-logo-subtitle">Payroll</div>
        </div>

        <div className="dtt-sidebar-section">Payroll</div>
        <ul className="dtt-sidebar-nav">
          <li>
            <Link href="/payroll/runs">Pay Runs</Link>
          </li>
          <li>
            <Link href="/payroll/capture/ba">BA Capture</Link>
          </li>
          <li>
            <Link href="/payroll/capture/tcm">TCM Capture</Link>
          </li>
          <li>
            <Link href="/payroll/capture/cmhc" className="active">
              CMHC Capture
            </Link>
          </li>
        </ul>

        <div className="dtt-sidebar-section">Reports</div>
        <ul className="dtt-sidebar-nav">
          <li>
            <Link href="/payroll/owner">Owner Summary</Link>
          </li>
        </ul>

        <div className="dtt-sidebar-section">System</div>
        <ul className="dtt-sidebar-nav">
          <li>
            <Link href="/dashboard">Dashboard</Link>
          </li>
        </ul>
      </aside>

      <div className="dtt-main">
        <div className="dtt-topbar">
          <span className="dtt-topbar-left">DTT Coaching - Payroll</span>
          <div className="dtt-topbar-right">
            <span className="dtt-topbar-user">{userEmail}</span>
            <span className="dtt-topbar-role">{roleLabel}</span>
          </div>
        </div>

        <div className="dtt-breadcrumb">
          <Link href="/dashboard">Home</Link>
          <span className="dtt-breadcrumb-sep">&gt;</span>
          <Link href="/payroll/runs">Payroll</Link>
          <span className="dtt-breadcrumb-sep">&gt;</span>
          <span className="dtt-breadcrumb-current">CMHC Capture</span>
        </div>

        <div className="dtt-content">
          <div className="page-header">
            <div className="page-header-content">
              <h1 style={{ fontSize: 22, marginBottom: 4 }}>CMHC - Service Capture</h1>
              <p className="subtitle">
                Enter service quantities for each CMHC therapist.
              </p>
            </div>
          </div>

          <div className="section">
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label htmlFor="period-select">Pay Period</label>
              <select
                id="period-select"
                value={selectedPeriodId}
                onChange={(event) => setSelectedPeriodId(event.target.value)}
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
                  {fmtDate(selectedPeriod.start_date)} - {fmtDate(selectedPeriod.end_date)}
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
              These quantities have been submitted for approval.
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
              <div
                className="table-wrapper"
                style={{
                  border: 'none',
                  boxShadow: 'none',
                  borderRadius: 0,
                  overflowX: 'auto',
                }}
              >
                <table style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          width: 220,
                          minWidth: 220,
                          position: 'sticky',
                          left: 0,
                          zIndex: 3,
                          background: '#f9fafb',
                        }}
                      >
                        Worker
                      </th>
                      <th style={{ width: 130, minWidth: 130 }}>Role</th>
                      {ctx.services.map((service) => (
                        <th
                          key={service}
                          style={{ width: 130, minWidth: 130, textAlign: 'center' }}
                        >
                          {service}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.employees.map((employee) => {
                      const entry = payload[employee.id] ?? buildEmptyEntry(ctx.services);

                      return (
                        <tr key={employee.id}>
                          <td
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 2,
                              background: '#ffffff',
                            }}
                          >
                            <span style={{ fontWeight: 500, fontSize: 14, color: '#1c1917' }}>
                              {employee.first_name} {employee.last_name}
                            </span>
                          </td>
                          <td>
                            <span className="badge accent">{displayRole(employee.role)}</span>
                          </td>
                          {ctx.services.map((service) => (
                            <td key={service} style={{ textAlign: 'center' }}>
                              <input
                                className="dtt-units-input"
                                type="number"
                                min={0}
                                step={1}
                                value={entry[service] ?? 0}
                                disabled={isReadOnly}
                                onChange={(event) =>
                                  handleQuantityChange(employee.id, service, event.target.value)
                                }
                              />
                            </td>
                          ))}
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
                CMHC captures service quantities only. Dollar amounts are calculated later by the owner workflow.
              </div>
            </div>
          ) : (
            <div className="section">
              <div className="empty-state">
                No CMHC employees found.
                <br />
                <span style={{ fontSize: 13 }}>
                  Employees appear here when they have an assignment with department = CMHC.
                </span>
              </div>
            </div>
          )}

          {!runLocked && ctx?.pay_periods && ctx.pay_periods.length > 0 && (
            <div className="dtt-action-bar">
              {!alreadySubmitted && (
                <>
                  <button
                    className="dtt-secondary"
                    onClick={() => handleSave('draft')}
                    disabled={saving || !selectedPeriodId}
                  >
                    {saving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button
                    className="dtt-primary"
                    onClick={() => handleSave('submit')}
                    disabled={saving || !selectedPeriodId}
                  >
                    {saving ? 'Submitting...' : 'Submit for Approval'}
                  </button>
                </>
              )}

              {saveMsg && (
                <span className="dtt-action-bar-msg" style={{ color: '#0d7a5f' }}>
                  {saveMsg}
                </span>
              )}
              {saveError && (
                <span className="dtt-action-bar-msg" style={{ color: '#b91c1c' }}>
                  {saveError}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
