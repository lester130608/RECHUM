"use client";

// app/payroll/employees/[employee_id]/page.tsx
// Ficha del empleado. Solo owner: la API devuelve 403 a cualquier otro.
//
// Es solo de lectura. La edicion sigue en el listado de empleados.

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PayrollShell } from "@/components/Payroll/PayrollShell";
import { supabase } from "@/lib/supabaseClient";

type PayLine = {
  code: string;
  description: string | null;
  hours: number | null;
  units: number | null;
  rate: number | null;
  amount: number;
};

type HistoryRow = {
  item_id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  area: string;
  run_status: string;
  hours: number | null;
  amount: number;
  lines: PayLine[];
};

type EmployeeFile = {
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string | null;
    email: string | null;
    status: string | null;
    ready_for_payroll: boolean | null;
  };
  assignments: {
    department: string;
    role: string | null;
    active: boolean;
    tax_type: string | null;
    base_rate: number | null;
  }[];
  configs: {
    id: string;
    role: string;
    tax_type: string;
    active: boolean;
    valid_from: string | null;
    valid_to: string | null;
    notes: string | null;
    pay_role_rates: {
      rate_key: string;
      rate_value: number;
      base_reference: string | null;
      notes: string | null;
    }[];
  }[];
  ytd: { year: string; amount: number; hours: number; periods: number };
  history: HistoryRow[];
  history_truncated: boolean;
};

/** Que significa cada base de porcentaje, en palabras. */
const BASE_LABEL: Record<string, string> = {
  RBT_TOTAL: "el bruto de los RBT en BA",
  BCABA_TOTAL: "el bruto de los BCaBA en BA",
  BCBA_TOTAL: "el bruto de los BCBA en BA",
  THERAPIST_TOTAL: "el bruto de los terapeutas en CMHC",
  EMPLOYEE_TOTAL: "el bruto de los empleados de oficina",
  DOCTOR_TOTAL: "el bruto de los psiquiatras",
  OUTREACH_TOTAL: "el bruto de outreach",
  BA_TOTAL: "el bruto del area BA",
  CMHC_TOTAL: "el bruto del area CMHC",
  TCM_TOTAL: "el bruto del area TCM",
  EMP_TOTAL: "el bruto del area EMP",
  ALL_TOTAL: "el bruto de todas las areas",
};

const RUN_STATUS_LABEL: Record<string, string> = {
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

/** Una tarifa, dicha como la diria una persona. */
function rateLabel(rate: EmployeeFile["configs"][number]["pay_role_rates"][number]) {
  if (rate.rate_key === "PERCENT") {
    const base = rate.base_reference ? BASE_LABEL[rate.base_reference] ?? rate.base_reference : "";
    return `${rate.rate_value}% sobre ${base}`;
  }
  if (rate.rate_key === "FIXED") return `${money(rate.rate_value)} fijo por unidad capturada`;
  if (rate.rate_key === "DAILY") return `${money(rate.rate_value)} por dia`;
  return `${money(rate.rate_value)} por hora (${rate.rate_key})`;
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

export default function EmployeeFilePage() {
  const params = useParams();
  const employeeId = (params?.employee_id ?? "") as string;
  const [data, setData] = useState<EmployeeFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setData(await fetchWithSession(`/api/payroll/employees/${employeeId}`));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (employeeId) load();
  }, [employeeId]);

  if (loading) {
    return (
      <PayrollShell currentLabel="Ficha del empleado">
        <div className="section">Cargando...</div>
      </PayrollShell>
    );
  }

  if (error || !data) {
    return (
      <PayrollShell currentLabel="Ficha del empleado">
        <div className="section">
          <div className="error">{error ?? "No se pudo cargar la ficha."}</div>
          <p style={{ marginTop: 12 }}>
            <Link href="/payroll/employees">Volver a empleados</Link>
          </p>
        </div>
      </PayrollShell>
    );
  }

  const { employee, assignments, configs, ytd, history } = data;
  const name =
    employee.full_name || `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim();
  const activas = assignments.filter((a) => a.active);
  const inactivas = assignments.filter((a) => !a.active);

  return (
    <PayrollShell currentLabel="Ficha del empleado">
      <div className="page-header">
        <div className="page-header-content">
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>{name}</h1>
          <p className="subtitle">
            {employee.email || "sin correo"} · {employee.status ?? "sin estado"}
          </p>
        </div>
        <Link href="/payroll/employees" className="btn">
          Volver a empleados
        </Link>
      </div>

      {/* Asignaciones: el rol y el tipo fiscal son POR AREA. */}
      <div className="section">
        <div className="heading">Areas y roles</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {activas.map((a) => (
            <span key={`${a.department}-${a.role}`} className="badge accent">
              {a.department} · {a.role ?? "sin rol"} · {a.tax_type ?? "W2"}
            </span>
          ))}
          {activas.length === 0 && (
            <span className="text-secondary">No tiene ninguna asignacion activa.</span>
          )}
        </div>
        {inactivas.length > 0 && (
          <p className="text-sm text-tertiary" style={{ marginTop: 10 }}>
            Inactivas: {inactivas.map((a) => `${a.department} · ${a.role ?? "sin rol"}`).join(" / ")}
          </p>
        )}
      </div>

      {/* Tarifas */}
      <div className="section">
        <div className="heading">Tarifas</div>
        {configs.length === 0 && assignments.every((a) => a.base_rate == null) ? (
          <div className="empty-state">
            No hay tarifas registradas. Se paga con la tarifa del area.
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Tipo</th>
                  <th>Tarifa</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {assignments
                  .filter((a) => a.base_rate != null)
                  .map((a) => (
                    <tr key={`asg-${a.department}-${a.role}`}>
                      <td>
                        {a.department} · {a.role ?? "sin rol"}
                      </td>
                      <td>{a.tax_type ?? "W2"}</td>
                      <td>{money(Number(a.base_rate))} por hora</td>
                      <td className="text-sm text-tertiary">—</td>
                      <td>{a.active ? "Activa" : "Inactiva"}</td>
                    </tr>
                  ))}
                {configs.map((config) =>
                  (config.pay_role_rates ?? []).map((rate) => (
                    <tr key={`${config.id}-${rate.rate_key}`}>
                      <td>{config.role}</td>
                      <td>{config.tax_type}</td>
                      <td>{rateLabel(rate)}</td>
                      <td className="text-sm text-tertiary">
                        {fmtDate(config.valid_from)}
                        {config.valid_to ? ` → ${fmtDate(config.valid_to)}` : " → sin fin"}
                      </td>
                      <td>{config.active ? "Activa" : "Inactiva"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Acumulado */}
      <div className="section">
        <div className="heading">Acumulado {ytd.year}</div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div className="text-sm text-tertiary">Pagado</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{money(ytd.amount)}</div>
          </div>
          <div>
            <div className="text-sm text-tertiary">Horas</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{ytd.hours.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-tertiary">Periodos</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{ytd.periods}</div>
          </div>
        </div>
        <p className="text-sm text-tertiary" style={{ marginTop: 8 }}>
          Solo periodos aprobados. Un borrador todavia no es dinero pagado.
        </p>
      </div>

      {/* Historial */}
      <div className="section">
        <div className="heading">Historial de pagos</div>
        {history.length === 0 ? (
          <div className="empty-state">Todavia no tiene ningun pago calculado.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Trabajo</th>
                  <th>Pago</th>
                  <th>Area</th>
                  <th style={{ textAlign: "right" }}>Horas</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <Fragment key={row.item_id}>
                    <tr>
                      <td>{row.week_code}</td>
                      <td className="text-sm text-tertiary">
                        {fmtDate(row.start_date)} – {fmtDate(row.end_date)}
                      </td>
                      <td className="text-sm">{fmtDate(row.pay_date)}</td>
                      <td>{row.area}</td>
                      <td style={{ textAlign: "right" }}>
                        {row.hours == null ? "—" : row.hours.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{money(row.amount)}</strong>
                      </td>
                      <td className="text-sm">
                        {RUN_STATUS_LABEL[row.run_status] ?? row.run_status}
                      </td>
                      <td>
                        {row.lines.length > 0 && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setOpenRow(openRow === row.item_id ? null : row.item_id)}
                          >
                            {openRow === row.item_id ? "Ocultar" : "Detalle"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {openRow === row.item_id && (
                      <tr>
                        <td colSpan={8}>
                          <table>
                            <thead>
                              <tr>
                                <th>Concepto</th>
                                <th style={{ textAlign: "right" }}>Horas / Uds</th>
                                <th style={{ textAlign: "right" }}>Tarifa</th>
                                <th style={{ textAlign: "right" }}>Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.lines.map((line, index) => (
                                <tr key={`${row.item_id}-${line.code}-${index}`}>
                                  <td>{line.description || line.code}</td>
                                  <td style={{ textAlign: "right" }}>
                                    {line.hours != null
                                      ? line.hours.toFixed(2)
                                      : line.units != null
                                        ? `${line.units} uds`
                                        : "—"}
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    {line.rate == null ? "—" : money(line.rate)}
                                  </td>
                                  <td style={{ textAlign: "right" }}>{money(line.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.history_truncated && (
          <p className="text-sm text-tertiary" style={{ marginTop: 8 }}>
            Se muestran los 25 periodos mas recientes.
          </p>
        )}
      </div>
    </PayrollShell>
  );
}
