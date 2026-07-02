"use client";

// app/payroll/capture/tcm/page.tsx
// TCM Supervisor Unit Capture Screen
// Roles allowed: supervisor_tcm, owner

import { useState, useEffect, useCallback } from "react";
import { PayrollShell } from "@/components/Payroll/PayrollShell";
import { supabase } from "@/lib/supabaseClient";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

interface UnitEntry {
  week1: number;
  week2: number;
}

type Payload = Record<string, UnitEntry>;

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function hoursForUnits(units: number): number {
  return Math.round(units * 0.25 * 100) / 100;
}

function rateLabel(units: number): "30" | "base" {
  return hoursForUnits(units) >= 34 ? "30" : "base";
}

async function fetchWithSession(url: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Auth session missing. Please log in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);

  const res = await fetch(url, { ...init, headers });
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || "Request failed") as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return data;
}

function periodStatusInWindow(
  period: PayPeriod,
  today: string,
  isOwner: boolean
): "open" | "closed" {
  if (isOwner) return "open";
  const todayNum = dateToDayNum(today);
  return todayNum >= dateToDayNum(period.capture_opens_at) &&
    todayNum <= dateToDayNum(period.sup_deadline)
    ? "open"
    : "closed";
}

function dateToDayNum(s: string) {
  const [y, mo, d] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TCMCapturePage() {
  const { user, loading: userLoading } = useSupabaseUser();

  const [ctx, setCtx] = useState<PageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [payload, setPayload] = useState<Payload>({});

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState("");

  // Role display (derived from context)
  const [roleCodes, setRoleCodes] = useState<string[]>([]);

  // ---------------------------------------------------------------------------
  // Load initial context (periods + employees) on mount
  // ---------------------------------------------------------------------------
  const loadContext = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const data: PageContext = await fetchWithSession(
        "/api/payroll/capture/tcm"
      );
      setCtx(data);

      // Derive role codes from existing pay_periods context (we need to call
      // /api/payroll/runs/context for the role codes, or we rely on the page
      // context returned — the API doesn't return role_codes, so we fetch them)
      const ctxData = await fetchWithSession("/api/payroll/runs/context");
      setRoleCodes(ctxData.role_codes ?? []);

      if (data.pay_periods.length > 0) {
        setSelectedPeriodId(data.pay_periods[0].id);
      }
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        window.location.href = "/not-authorized";
        return;
      }
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userLoading && user) {
      void loadContext();
    }
  }, [user, loadContext, userLoading]);

  // ---------------------------------------------------------------------------
  // When period changes, load existing input for that period (if any)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (userLoading || !selectedPeriodId || !user) return;

    const loadForPeriod = async () => {
      try {
        const data: PageContext = await fetchWithSession(
          `/api/payroll/capture/tcm?period_id=${selectedPeriodId}`
        );
        // Update existing_run / existing_input without replacing employees/periods
        setCtx((prev) =>
          prev
            ? {
                ...prev,
                existing_run: data.existing_run,
                existing_input: data.existing_input,
              }
            : prev
        );

        // Initialise payload from existing input or zeros
        if (data.existing_input?.payload) {
          setPayload(data.existing_input.payload as Payload);
        } else if (data.employees) {
          const init: Payload = {};
          data.employees.forEach((e) => {
            init[e.id] = { week1: 0, week2: 0 };
          });
          setPayload(init);
        }
        setSaveMsg("");
        setSaveError("");
      } catch {
        // Non-blocking — just keep current state
      }
    };

    void loadForPeriod();
  }, [selectedPeriodId, user, userLoading]);

  // Also init payload when employees load (first load)
  useEffect(() => {
    if (!ctx?.employees?.length) return;
    if (Object.keys(payload).length > 0) return; // already initialised

    const init: Payload = {};
    ctx.employees.forEach((e) => {
      init[e.id] = { week1: 0, week2: 0 };
    });
    setPayload(init);
  }, [ctx?.employees]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleUnitChange(
    empId: string,
    week: "week1" | "week2",
    raw: string
  ) {
    const val = Math.max(0, parseInt(raw, 10) || 0);
    setPayload((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] ?? { week1: 0, week2: 0 }), [week]: val },
    }));
    setSaveMsg("");
    setSaveError("");
  }

  async function handleSave(action: "draft" | "submit") {
    if (!selectedPeriodId) return;

    setSaving(true);
    setSaveMsg("");
    setSaveError("");

    try {
      const res = await fetchWithSession("/api/payroll/capture/tcm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: selectedPeriodId, action, payload }),
      });

      setSaveMsg(res.message);

      // Refresh existing_run / existing_input
      const updated: PageContext = await fetchWithSession(
        `/api/payroll/capture/tcm?period_id=${selectedPeriodId}`
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

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const selectedPeriod = ctx?.pay_periods.find(
    (p) => p.id === selectedPeriodId
  );

  const alreadySubmitted =
    ctx?.existing_input?.status === "review_ready" ||
    ctx?.existing_input?.status === "submitted";

  const runLocked =
    ctx?.existing_run?.status === "exported" ||
    ctx?.existing_run?.status === "locked";

  const isReadOnly = alreadySubmitted || runLocked;

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (userLoading) {
    return (
      <PayrollShell currentLabel="TCM Capture">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="TCM Capture">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  if (loading) {
    return (
      <PayrollShell currentLabel="TCM Capture">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Loading…</p>
        </div>
      </PayrollShell>
    );
  }

  if (fetchError) {
    return (
      <PayrollShell currentLabel="TCM Capture">
          <div className="error">{fetchError}</div>
      </PayrollShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <PayrollShell currentLabel="TCM Capture">
          {/* Page header */}
          <div className="page-header">
            <div className="page-header-content">
              <h1 style={{ fontSize: 22, marginBottom: 4 }}>TCM — Unit Capture</h1>
              <p className="subtitle">
                Enter weekly units for each TCM worker. Hours are calculated
                automatically.
              </p>
            </div>
          </div>

          {/* ── Period selector ── */}
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
                {ctx?.pay_periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.week_code} &nbsp;|&nbsp; {fmtDate(p.start_date)} –{" "}
                    {fmtDate(p.end_date)} &nbsp;|&nbsp; Pay date:{" "}
                    {fmtDate(p.pay_date)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Period info card ── */}
          {selectedPeriod && (
            <div className="dtt-period-card">
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Week code</span>
                <span className="dtt-period-card-value">
                  {selectedPeriod.week_code}
                </span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Work dates</span>
                <span className="dtt-period-card-value">
                  {fmtDate(selectedPeriod.start_date)} –{" "}
                  {fmtDate(selectedPeriod.end_date)}
                </span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Capture deadline</span>
                <span className="dtt-period-card-value">
                  {fmtDate(selectedPeriod.sup_deadline)}
                </span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Pay date</span>
                <span className="dtt-period-card-value">
                  {fmtDate(selectedPeriod.pay_date)}
                </span>
              </div>
              <div className="dtt-period-card-item">
                <span className="dtt-period-card-label">Status</span>
                {periodStatusInWindow(
                  selectedPeriod,
                  ctx?.today ?? "",
                  ctx?.is_owner ?? false
                ) === "open" ? (
                  <span className="dtt-badge-open">Open</span>
                ) : (
                  <span className="dtt-badge-closed">Closed</span>
                )}
              </div>
            </div>
          )}

          {/* ── Already-submitted banner ── */}
          {alreadySubmitted && (
            <div className="dtt-submitted-banner">
              ✓ These units have been submitted for approval.
              {ctx?.existing_input?.submitted_at && (
                <span style={{ marginLeft: 8, opacity: 0.75 }}>
                  Submitted{" "}
                  {new Date(ctx.existing_input.submitted_at).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {runLocked && (
            <div className="error" style={{ marginBottom: 16 }}>
              This pay run is locked and cannot be modified.
            </div>
          )}

          {/* ── Capture table ── */}
          {ctx?.employees && ctx.employees.length > 0 ? (
            <div className="section" style={{ padding: 0, overflow: "hidden" }}>
              <div className="table-wrapper" style={{ border: "none", boxShadow: "none", borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>Worker</th>
                      <th style={{ width: "13%", textAlign: "center" }}>
                        Week 1 Units
                      </th>
                      <th style={{ width: "15%" }}>Week 1 Hrs / Rate</th>
                      <th style={{ width: "13%", textAlign: "center" }}>
                        Week 2 Units
                      </th>
                      <th style={{ width: "15%" }}>Week 2 Hrs / Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ctx.employees.map((emp) => {
                      const entry = payload[emp.id] ?? { week1: 0, week2: 0 };
                      const hrs1 = hoursForUnits(entry.week1);
                      const hrs2 = hoursForUnits(entry.week2);
                      const rate1 = rateLabel(entry.week1);
                      const rate2 = rateLabel(entry.week2);

                      return (
                        <tr key={emp.id}>
                          <td>
                            <span
                              style={{
                                fontWeight: 500,
                                fontSize: 14,
                                color: "#1c1917",
                              }}
                            >
                              {emp.first_name} {emp.last_name}
                            </span>
                          </td>

                          {/* Week 1 units */}
                          <td style={{ textAlign: "center" }}>
                            <input
                              className="dtt-units-input"
                              type="number"
                              min={0}
                              step={1}
                              value={entry.week1}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                handleUnitChange(emp.id, "week1", e.target.value)
                              }
                            />
                          </td>

                          {/* Week 1 hours + rate */}
                          <td>
                            <div className="dtt-hours-cell">
                              <span className="dtt-hours-value">{hrs1} h</span>
                              {rate1 === "30" ? (
                                <span className="dtt-badge-rate30">$30</span>
                              ) : (
                                <span className="dtt-badge-base">base</span>
                              )}
                            </div>
                          </td>

                          {/* Week 2 units */}
                          <td style={{ textAlign: "center" }}>
                            <input
                              className="dtt-units-input"
                              type="number"
                              min={0}
                              step={1}
                              value={entry.week2}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                handleUnitChange(emp.id, "week2", e.target.value)
                              }
                            />
                          </td>

                          {/* Week 2 hours + rate */}
                          <td>
                            <div className="dtt-hours-cell">
                              <span className="dtt-hours-value">{hrs2} h</span>
                              {rate2 === "30" ? (
                                <span className="dtt-badge-rate30">$30</span>
                              ) : (
                                <span className="dtt-badge-base">base</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Rule note */}
              <div
                style={{
                  padding: "12px 20px",
                  fontSize: 12,
                  color: "#9ca3af",
                  borderTop: "1px solid #f0f1f3",
                }}
              >
                1 unit = 15 min = 0.25 h &nbsp;·&nbsp; Rate tier evaluated per
                week individually &nbsp;·&nbsp; ≥ 34 h/week → $30 rate &nbsp;·&nbsp;
                &lt; 34 h/week → base rate
              </div>
            </div>
          ) : (
            <div className="section">
              <div className="empty-state">
                No TCM employees found.
                <br />
                <span style={{ fontSize: 13 }}>
                  Employees appear here when they have an assignment with
                  department = TCM.
                </span>
              </div>
            </div>
          )}

          {/* ── Action bar ── */}
          {!runLocked && ctx?.pay_periods && ctx.pay_periods.length > 0 && (
            <div className="dtt-action-bar">
              {!alreadySubmitted && (
                <>
                  <button
                    className="dtt-secondary"
                    onClick={() => handleSave("draft")}
                    disabled={saving || !selectedPeriodId}
                  >
                    {saving ? "Saving…" : "Save Draft"}
                  </button>
                  <button
                    className="dtt-primary"
                    onClick={() => handleSave("submit")}
                    disabled={saving || !selectedPeriodId}
                  >
                    {saving ? "Submitting…" : "Submit for Approval"}
                  </button>
                </>
              )}

              {saveMsg && (
                <span
                  className="dtt-action-bar-msg"
                  style={{ color: "#0d7a5f" }}
                >
                  ✓ {saveMsg}
                </span>
              )}
              {saveError && (
                <span
                  className="dtt-action-bar-msg"
                  style={{ color: "#b91c1c" }}
                >
                  ✗ {saveError}
                </span>
              )}
            </div>
          )}
    </PayrollShell>
  );
}
