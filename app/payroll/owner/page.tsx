"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabaseClient";

type ModuleInfo = {
  status: string;
  count: number;
  total: number;
};

type PeriodSection = {
  id: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  week_code: string;
  status: string;
  modules: Record<string, ModuleInfo>;
};

export default function OwnerViewPage() {
  const { hasPermission, loading: userLoading } = useUser();
  const [pending, setPending] = useState<PeriodSection[]>([]);
  const [waiting, setWaiting] = useState<PeriodSection[]>([]);
  const [ready, setReady] = useState<PeriodSection[]>([]);
  const [exported, setExported] = useState<PeriodSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExported, setShowExported] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/payroll/owner/summary", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });

      if (!res.ok) {
        const payload = await res.json();
        setError(payload.error || `HTTP ${res.status}`);
        return;
      }

      const json = await res.json();
      setPending(json.pending || []);
      setWaiting(json.waiting || []);
      setReady(json.ready || []);
      setExported(json.exported || []);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (userLoading) return <div className="container">Loading...</div>;
  if (!hasPermission("manage_employees")) {
    return (
      <div className="container">
        <div className="error">No permission</div>
      </div>
    );
  }
  if (loading) return <div className="container">Loading...</div>;
  if (error) {
    return (
      <div className="container">
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-content">
          <h1>Payroll Owner View</h1>
          <div className="subtitle">Historical consolidation - read-only</div>
        </div>
      </div>

      <div className="info">
        Histórico solo lectura - usar pay_runs para nuevas operaciones.
      </div>

      <div className="section">
        <div className="heading">Pending Approval ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="text-secondary">No modules pending approval.</div>
        ) : (
          pending.map((period) => (
            <PeriodCard
              key={`pending-${period.id}`}
              period={period}
              filterStatus="SUBMITTED"
            />
          ))
        )}
      </div>

      <div className="section">
        <div className="heading">Waiting on Supervisors ({waiting.length})</div>
        {waiting.length === 0 ? (
          <div className="text-secondary">All supervisors are on time.</div>
        ) : (
          waiting.map((period) => (
            <PeriodCard key={`waiting-${period.id}`} period={period} filterStatus="DRAFT" />
          ))
        )}
      </div>

      <div className="section">
        <div className="heading">Ready to Export ({ready.length})</div>
        {ready.length === 0 ? (
          <div className="text-secondary">No periods ready for export.</div>
        ) : (
          ready.map((period) => (
            <div key={`ready-${period.id}`} className="card mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">
                    Pay Period: {period.start_date} to {period.end_date}
                  </div>
                  <div className="text-sm text-tertiary">
                    Pay Date: {period.pay_date} | All modules LOCKED
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/payroll/owner/review/${period.id}`}>
                    <button className="secondary">Review</button>
                  </Link>
                  <span className="badge">READ ONLY</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section">
        <button
          className="button-reset heading"
          type="button"
          onClick={() => setShowExported(!showExported)}
        >
          Exported History ({exported.length}) {showExported ? "v" : ">"}
        </button>
        {showExported && (
          exported.length === 0 ? (
            <div className="text-secondary">No exported periods yet.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Pay Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exported.map((period) => (
                    <tr key={period.id}>
                      <td>{period.start_date} to {period.end_date}</td>
                      <td>{period.pay_date}</td>
                      <td><span className="badge success">EXPORTED</span></td>
                      <td>
                        <Link href={`/payroll/owner/review/${period.id}`}>
                          <button className="small">View</button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

type PeriodCardProps = {
  period: PeriodSection;
  filterStatus?: string;
};

function PeriodCard({ period, filterStatus }: PeriodCardProps) {
  const modules = Object.entries(period.modules);
  const visible = filterStatus
    ? modules.filter(([, module]) => module.status === filterStatus)
    : modules;

  return (
    <div className="card mb-4">
      <div className="font-semibold mb-2">
        Pay Period: {period.start_date} to {period.end_date}
      </div>
      <div className="text-sm text-tertiary mb-4">Pay Date: {period.pay_date}</div>
      <div className="flex flex-col gap-2">
        {visible.map(([moduleName, info]) => (
          <div key={moduleName} className="owner-module-row">
            <div className="flex gap-3 items-center">
              <span className="font-medium">{moduleName}</span>
              <span className={`badge ${info.status === "SUBMITTED" ? "warning" : info.status === "LOCKED" ? "success" : ""}`}>
                {info.status}
              </span>
              {info.count > 0 && (
                <span className="text-sm text-tertiary">
                  {info.count} entries | ${info.total.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <span className="badge">READ ONLY</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
