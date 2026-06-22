"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabaseClient";

type ConsolidatedLine = {
  employee_id: string;
  employee_name: string;
  module: string;
  role: string;
  tax_type: "W2" | "1099";
  amount: number;
  is_outreach_calc?: boolean;
  notes?: string;
};

export default function ReviewPeriodPage() {
  const params = useParams();
  const payPeriodId = params.pay_period_id as string;
  const { hasPermission, loading: userLoading } = useUser();
  const [lines, setLines] = useState<ConsolidatedLine[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch(`/api/payroll/owner/consolidated/${payPeriodId}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });

        if (!res.ok) {
          const payload = await res.json();
          setError(payload.error || `HTTP ${res.status}`);
          return;
        }

        const json = await res.json();
        setLines(json.lines || []);
        setTotal(json.total || 0);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [payPeriodId]);

  if (userLoading || loading) return <div className="container">Loading...</div>;
  if (!hasPermission("manage_employees")) {
    return (
      <div className="container">
        <div className="error">No permission</div>
      </div>
    );
  }

  const w2Lines = lines.filter((line) => line.tax_type === "W2");
  const c1099Lines = lines.filter((line) => line.tax_type === "1099");

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-content">
          <h1>Consolidated Payroll</h1>
          <div className="subtitle">Historical consolidated payroll - read-only</div>
        </div>
        <div className="page-header-actions">
          <Link href="/payroll/owner">
            <button className="secondary">Back</button>
          </Link>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="info">
        Histórico solo lectura - usar pay_runs para nuevas operaciones.
      </div>

      {w2Lines.length > 0 && (
        <div className="section">
          <div className="heading">W2 Employees ({w2Lines.length})</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Module</th>
                  <th>Role</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {w2Lines.map((line, index) => (
                  <tr key={`w2-${line.employee_id}-${index}`}>
                    <td>{line.employee_name}</td>
                    <td>{line.module}</td>
                    <td>
                      {line.role}
                      {line.is_outreach_calc && (
                        <span className="badge accent ml-2">auto</span>
                      )}
                    </td>
                    <td>${line.amount.toFixed(2)}</td>
                    <td className="text-sm text-tertiary">{line.notes || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c1099Lines.length > 0 && (
        <div className="section">
          <div className="heading">1099 Contractors ({c1099Lines.length})</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Module</th>
                  <th>Role</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {c1099Lines.map((line, index) => (
                  <tr key={`1099-${line.employee_id}-${index}`}>
                    <td>{line.employee_name}</td>
                    <td>{line.module}</td>
                    <td>{line.role}</td>
                    <td>${line.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lines.length === 0 && !error && (
        <div className="section">
          <div className="text-secondary">No consolidated payroll lines for this period yet.</div>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-center">
          <div className="text-lg font-semibold">Total: ${total.toFixed(2)}</div>
          <div className="text-sm text-tertiary">
            {lines.length} lines | {w2Lines.length} W2 | {c1099Lines.length} 1099
          </div>
        </div>
      </div>
    </div>
  );
}
