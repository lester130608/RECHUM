"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabaseClient";

export default function EmpHistoryPage() {
  const { hasPermission, loading: userLoading } = useUser();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/payroll/emp/history', {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        setHistory(json.history || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (userLoading || loading) return <div className="container">Loading...</div>;
  if (!hasPermission('manage_employees')) {
    return <div className="container"><div className="error">No permission</div></div>;
  }

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-content">
          <h1>EMP Module History</h1>
          <div className="subtitle">Past payroll periods - read-only</div>
        </div>
        <div className="page-header-actions">
          <Link href="/payroll/emp">
            <button className="secondary">Back to Current</button>
          </Link>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="info">
        Vista histórica - solo lectura. Use Pay Runs para nuevas operaciones de payroll.
      </div>

      {history.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3 className="empty-state-title">No history yet</h3>
            <p className="empty-state-description">
              Submitted payroll periods will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Pay Date</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.pay_period_id}>
                  <td>{h.pay_period?.start_date} to {h.pay_period?.end_date}</td>
                  <td>{h.pay_period?.pay_date}</td>
                  <td>
                    <span className={`badge ${h.module_status === 'LOCKED' ? 'success' : 'warning'}`}>
                      {h.module_status}
                    </span>
                  </td>
                  <td>{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString() : '--'}</td>
                  <td>
                    <span className="badge">READ ONLY</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
