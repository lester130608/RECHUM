"use client";

// app/payroll/history/page.tsx
// Los periodos ya trabajados, con su total y un enlace al reporte.
//
// Antes era un cartel de "coming soon". Para ver lo pagado en un periodo
// pasado habia que entrar al reporte por persona, y para eso habia que
// saberse el periodo de memoria.
//
// Un supervisor ve solo su area y sin importes, igual que en el resto del
// sistema.

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { PayrollShell } from "@/components/Payroll/PayrollShell";
import { supabase } from "@/lib/supabaseClient";

type AreaSummary = {
  area: string;
  status: string;
  workers: number;
  hours: number;
  amount?: number;
};

type PeriodRow = {
  period_id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  period_status: string | null;
  consolidated_status: string | null;
  areas: AreaSummary[];
  areas_with_run: number;
  workers: number;
  hours: number;
  amount?: number;
};

type HistoryResponse = {
  is_owner: boolean;
  visible_areas: string[];
  periods: PeriodRow[];
};

const AREA_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  review_ready: "Enviado",
  supervisor_approved: "Aprobado por supervisor",
  owner_approved: "Aprobado",
  consolidated: "Consolidado",
  exported: "Exportado",
  locked: "Cerrado",
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** El estado del periodo entero, no el de un area suelta. */
function periodState(row: PeriodRow) {
  if (row.consolidated_status === "exported") return { label: "Exportado", cls: "badge success" };
  if (row.consolidated_status === "locked") return { label: "Cerrado", cls: "badge success" };
  if (row.consolidated_status) return { label: "Consolidado", cls: "badge info" };

  const cerradas = row.areas.filter((area) =>
    ["owner_approved", "consolidated", "exported", "locked"].includes(area.status)
  ).length;

  if (cerradas === 0) return { label: "En captura", cls: "badge" };
  return { label: `${cerradas} de ${row.areas.length} aprobadas`, cls: "badge warning" };
}

async function fetchWithSession(url: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export default function PayrollHistoryPage() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setData(await fetchWithSession("/api/payroll/history"));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const owner = data?.is_owner ?? false;
  const periods = data?.periods ?? [];
  const columnCount = owner ? 9 : 7;

  return (
    <PayrollShell currentLabel="History">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>History</h1>
          <p className="subtitle">
            {owner
              ? "Periodos trabajados, con su total y el reporte de cada uno."
              : "Periodos trabajados en tu area."}
          </p>
        </div>
      </div>

      {loading && <div className="section">Cargando...</div>}
      {error && (
        <div className="section">
          <div className="error">{error}</div>
        </div>
      )}

      {!loading && !error && periods.length === 0 && (
        <div className="section">
          <div className="empty-state">Todavia no hay ningun periodo con datos.</div>
        </div>
      )}

      {!loading && !error && periods.length > 0 && (
        <div className="section">
          <div className="heading">Periodos ({periods.length})</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Trabajo</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Personas</th>
                  <th style={{ textAlign: "right" }}>Horas</th>
                  {owner && <th style={{ textAlign: "right" }}>Total</th>}
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {periods.map((row) => {
                  const state = periodState(row);
                  const open = openPeriod === row.period_id;

                  return (
                    <Fragment key={row.period_id}>
                      <tr>
                        <td>
                          <strong>{row.week_code}</strong>
                        </td>
                        <td className="text-sm text-tertiary">
                          {fmtDate(row.start_date)} – {fmtDate(row.end_date)}
                        </td>
                        <td className="text-sm">{fmtDate(row.pay_date)}</td>
                        <td>
                          <span className={state.cls}>{state.label}</span>
                        </td>
                        <td style={{ textAlign: "right" }}>{row.workers}</td>
                        <td style={{ textAlign: "right" }}>{row.hours.toFixed(2)}</td>
                        {owner && (
                          <td style={{ textAlign: "right" }}>
                            <strong>{money(row.amount ?? 0)}</strong>
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setOpenPeriod(open ? null : row.period_id)}
                          >
                            {open ? "Ocultar" : "Por area"}
                          </button>
                        </td>
                        <td>
                          {owner && (
                            <Link className="btn" href={`/payroll/owner/review/${row.period_id}`}>
                              Ver reporte
                            </Link>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={columnCount}>
                            <table>
                              <thead>
                                <tr>
                                  <th>Area</th>
                                  <th>Estado</th>
                                  <th style={{ textAlign: "right" }}>Personas</th>
                                  <th style={{ textAlign: "right" }}>Horas</th>
                                  {owner && <th style={{ textAlign: "right" }}>Importe</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {row.areas.map((area) => (
                                  <tr key={`${row.period_id}-${area.area}`}>
                                    <td>{area.area}</td>
                                    <td className="text-sm">
                                      {AREA_STATUS_LABEL[area.status] ?? area.status}
                                    </td>
                                    <td style={{ textAlign: "right" }}>{area.workers}</td>
                                    <td style={{ textAlign: "right" }}>{area.hours.toFixed(2)}</td>
                                    {owner && (
                                      <td style={{ textAlign: "right" }}>
                                        {money(area.amount ?? 0)}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {owner && (
            <p className="text-sm text-tertiary" style={{ marginTop: 8 }}>
              El total suma los importes calculados de las areas con run en ese periodo.
            </p>
          )}
        </div>
      )}
    </PayrollShell>
  );
}
