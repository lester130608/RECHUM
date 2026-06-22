"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabaseClient";
import type { EmpModuleData, EmpEmployee, RateDecisionType } from "@/lib/types/emp-module";

type ActivePeriodResponse = {
  active: any | null;
  upcoming?: any | null;
  reason?: string;
};

export default function EmpModulePage() {
  const { hasPermission, loading: userLoading } = useUser();
  const [activePeriod, setActivePeriod] = useState<any | null>(null);
  const [upcomingPeriod, setUpcomingPeriod] = useState<any | null>(null);
  const [periodReason, setPeriodReason] = useState<string | null>(null);
  const [data, setData] = useState<EmpModuleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Auto-detect período activo
  useEffect(() => {
    async function loadActive() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/payroll/emp/active', {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (!res.ok) {
          setError(`Failed to load active period: HTTP ${res.status}`);
          return;
        }
        const json: ActivePeriodResponse = await res.json();
        setActivePeriod(json.active);
        setUpcomingPeriod(json.upcoming || null);
        setPeriodReason(json.reason || null);
      } catch (err: any) {
        setError(err.message || 'Failed to load');
      }
    }
    loadActive();
  }, []);

  // 2. Cargar datos del módulo cuando hay período activo
  const loadModule = useCallback(async () => {
    if (!activePeriod) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/payroll/emp/${activePeriod.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (!res.ok) {
        const payload = await res.json();
        setError(payload.error || `HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load module data');
    } finally {
      setLoading(false);
    }
  }, [activePeriod]);

  useEffect(() => {
    if (activePeriod) loadModule();
  }, [activePeriod, loadModule]);

  if (userLoading) return <div className="container">Loading...</div>;
  if (!hasPermission('manage_employees')) {
    return <div className="container"><div className="error">No permission</div></div>;
  }

  // No hay período activo: mostrar info + link a history
  if (!activePeriod) {
    return (
      <div className="container">
        <div className="page-header">
          <div className="page-header-content">
            <h1>EMP Module</h1>
            <div className="subtitle">Employee W2 Admin Payroll</div>
          </div>
          <div className="page-header-actions">
            <Link href="/payroll/emp/history">
              <button className="secondary">View History</button>
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="empty-state">
            <h3 className="empty-state-title">No active capture window</h3>
            <p className="empty-state-description">
              {periodReason || 'There is no pay period currently open for capture.'}
            </p>
            {upcomingPeriod && (
              <p className="text-secondary text-sm">
                Next capture window opens on <strong>{upcomingPeriod.capture_opens_at}</strong> for pay period {upcomingPeriod.start_date} to {upcomingPeriod.end_date}.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="container">Loading module...</div>;
  if (error) return <div className="container"><div className="error">{error}</div></div>;
  if (!data) return <div className="container">No data</div>;

  const isReadOnly = true;

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-content">
          <h1>EMP Module</h1>
          <div className="subtitle">
            Pay Period: {data.pay_period.start_date} to {data.pay_period.end_date}
            {' · '}
            Pay Date: {activePeriod.pay_date}
            {' · '}
            Cutoff: {activePeriod.sup_deadline}
          </div>
        </div>
        <div className="page-header-actions">
          <span className={`badge ${data.module_status === 'DRAFT' ? 'warning' : 'success'}`}>
            {data.module_status}
          </span>
          <Link href="/payroll/emp/history">
            <button className="secondary">History</button>
          </Link>
        </div>
      </div>

      <div className="info">
        Vista histórica - solo lectura. Use Pay Runs para nuevas operaciones de payroll.
      </div>

      {data.has_conflicts > 0 && (
        <div className="error">
          Rate changes detected for {data.has_conflicts} employee(s) during this period. Review below.
        </div>
      )}

      <div className="table-wrapper" style={{ marginBottom: '24px' }}>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Rate / Decision</th>
              <th>Hours</th>
              <th>Subtotal</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map((emp) => (
              <EmpRow
                key={emp.employee_id}
                emp={emp}
                payPeriodStart={data.pay_period.start_date}
                payPeriodEnd={data.pay_period.end_date}
                readOnly={isReadOnly}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-lg font-semibold">
          Total: ${data.total.toFixed(2)} ({data.employees.length} employees)
        </div>
        <span className="badge">READ ONLY</span>
      </div>
    </div>
  );
}

// === Row Component ===
type RowProps = {
  emp: EmpEmployee;
  payPeriodStart: string;
  payPeriodEnd: string;
  readOnly: boolean;
};

function EmpRow({ emp, payPeriodStart, payPeriodEnd, readOnly }: RowProps) {
  const [hours, setHours] = useState<string>(
    emp.entry?.hours !== null && emp.entry?.hours !== undefined ? String(emp.entry.hours) : ''
  );
  const [decision, setDecision] = useState<RateDecisionType>(emp.entry?.rate_decision_type || 'auto_single');
  const [prorateDate, setProrateDate] = useState(emp.entry?.prorate_date || '');

  if (emp.is_outreach) {
    if (emp.outreach_blocked) {
      return (
        <tr>
          <td>{emp.last_name}, {emp.first_name}</td>
          <td colSpan={3}><span className="badge warning">Pending: BA module not submitted</span></td>
          <td>--</td>
        </tr>
      );
    }
    const outreachAmount = (emp.outreach_base_total || 0) * ((emp.outreach_pct || 0) / 100);
    return (
      <tr>
        <td>{emp.last_name}, {emp.first_name}</td>
        <td>{emp.outreach_pct}% Outreach</td>
        <td>--</td>
        <td>${outreachAmount.toFixed(2)}</td>
        <td>{emp.outreach_pct}% of BA total ${(emp.outreach_base_total || 0).toFixed(2)}</td>
      </tr>
    );
  }

  if (emp.is_fixed_salary) {
    return (
      <tr>
        <td>{emp.last_name}, {emp.first_name}</td>
        <td>FIXED</td>
        <td>--</td>
        <td>${(emp.fixed_amount || 0).toFixed(2)}</td>
        <td>Fixed salary</td>
      </tr>
    );
  }

  if (emp.has_rate_conflict && !emp.entry) {
    return (
      <tr>
        <td>{emp.last_name}, {emp.first_name}</td>
        <td>
          <div className="flex flex-col gap-2">
            <span className="badge warning">Rate change on {emp.rate_change_date}</span>
            <label className="text-sm">
              <input type="radio" checked={decision === 'manual_old'} onChange={() => setDecision('manual_old')} disabled={readOnly} />
              {' '}Use old rate ${emp.rate_old} for all hours
            </label>
            <label className="text-sm">
              <input type="radio" checked={decision === 'manual_new'} onChange={() => setDecision('manual_new')} disabled={readOnly} />
              {' '}Use new rate ${emp.rate_new} for all hours
            </label>
            <label className="text-sm">
              <input type="radio" checked={decision === 'manual_prorate'} onChange={() => setDecision('manual_prorate')} disabled={readOnly} />
              {' '}Pro-rate at date:
              <input
                type="date"
                value={prorateDate}
                onChange={(e) => setProrateDate(e.target.value)}
                min={payPeriodStart}
                max={payPeriodEnd}
                disabled={readOnly || decision !== 'manual_prorate'}
                style={{ marginLeft: 8, width: 150, padding: '4px 8px' }}
              />
            </label>
          </div>
        </td>
        <td>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            disabled={readOnly}
            style={{ width: 80 }}
          />
        </td>
        <td>--</td>
        <td>
          <span className="text-sm text-tertiary">Read-only</span>
        </td>
      </tr>
    );
  }

  const rate = emp.rate_new || 0;
  return (
    <tr>
      <td>{emp.last_name}, {emp.first_name}</td>
      <td>${rate.toFixed(2)}</td>
      <td>
        <input
          type="number"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={readOnly}
          style={{ width: 80 }}
        />
      </td>
      <td>
        ${emp.entry?.subtotal ? Number(emp.entry.subtotal).toFixed(2) : '0.00'}
        {emp.entry?.edited_by_owner && (
          <div className="text-xs text-danger" style={{marginTop: 4}}>
            Edited by owner
          </div>
        )}
      </td>
      <td>{emp.entry?.rate_decision_note || '--'}</td>
    </tr>
  );
}
