"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { NoPayList } from '@/components/Payroll/NoPayList';
import { PayrollShell } from "@/components/Payroll/PayrollShell";
import { supabase } from "@/lib/supabaseClient";

// ---------------------------------------------------------------------------
// Reporte consolidado del periodo.
//
// Pensado para rellenar ADP a mano: lo primero que se ve es el TOTAL POR
// PERSONA, porque una misma persona puede cobrar de varias áreas (Edwina
// cobra sus horas de BA y además el 1.5% de outreach) y ADP quiere una
// cifra por empleado, no una por área.
//
// El detalle por área queda debajo, para cuadrar de dónde sale cada total.
// ---------------------------------------------------------------------------

type ConsolidatedLine = {
  employee_id: string;
  employee_name: string;
  module: string;
  role: string;
  tax_type: "W2" | "1099";
  amount: number;
  hours?: number | null;
  units?: number | null;
  is_outreach_calc?: boolean;
  notes?: string;
};

type EmployeeTotal = {
  employee_id: string;
  employee_name: string;
  tax_type: "W2" | "1099";
  total: number;
  hours: number | null;
  modules: string[];
};

/**
 * Lo que generó el importe. Las horas mandan; si la linea se captura en
 * unidades (CMHC, dias de PSYQ) se muestran esas. El porcentaje de outreach
 * no tiene ni lo uno ni lo otro: raya, nunca un cero, que se leeria como
 * "trabajo cero horas".
 */
function hoursLabel(line: ConsolidatedLine) {
  if (line.hours != null) return line.hours.toFixed(2);
  if (line.units != null) return `${line.units} uds`;
  return "—";
}

function hoursCsv(line: ConsolidatedLine) {
  if (line.hours != null) return line.hours.toFixed(2);
  if (line.units != null) return `${line.units} uds`;
  return "";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/** Escapa un campo para CSV: comillas dobladas y entrecomillado si hace falta. */
function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function ReviewPeriodPage() {
  const params = useParams();
  const payPeriodId = (params?.pay_period_id ?? "") as string;
  const { hasPermission, loading: userLoading } = useUser();
  const [lines, setLines] = useState<ConsolidatedLine[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
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
        setWarnings(json.warnings || []);
        setTotal(json.total || 0);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [payPeriodId]);

  // Total por persona Y tipo fiscal: lo que hay que teclear en ADP.
  //
  // Antes agrupaba solo por persona, y a quien cobra en dos áreas con tipos
  // distintos le sumaba todo bajo el primero que apareciera. Edwina es
  // BCBA/1099 en BA y OUTREACH/W2 en EMP: en ADP son dos entradas
  // separadas, así que aquí también. (Corregido 2026-09-30.)
  const employeeTotals = useMemo<EmployeeTotal[]>(() => {
    const byEmployee = new Map<string, EmployeeTotal>();

    for (const line of lines) {
      const key = `${line.employee_id}|${line.tax_type}`;
      const current = byEmployee.get(key);
      if (current) {
        current.total += line.amount;
        if (line.hours != null) current.hours = (current.hours ?? 0) + line.hours;
        if (!current.modules.includes(line.module)) current.modules.push(line.module);
      } else {
        byEmployee.set(key, {
          employee_id: line.employee_id,
          employee_name: line.employee_name,
          tax_type: line.tax_type,
          total: line.amount,
          hours: line.hours ?? null,
          modules: [line.module],
        });
      }
    }

    return Array.from(byEmployee.values()).sort((a, b) => {
      if (a.tax_type !== b.tax_type) return a.tax_type === "W2" ? -1 : 1;
      return a.employee_name.localeCompare(b.employee_name);
    });
  }, [lines]);

  function downloadCsv() {
    const rows: string[] = [];

    rows.push("TOTAL POR EMPLEADO (para ADP)");
    rows.push(["Empleado", "Tipo", "Areas", "Horas", "Total"].map(csvCell).join(","));
    for (const employee of employeeTotals.filter((employee) => employee.total > 0)) {
      rows.push(
        [
          employee.employee_name,
          employee.tax_type,
          employee.modules.join(" + "),
          employee.hours == null ? "" : employee.hours.toFixed(2),
          employee.total.toFixed(2),
        ]
          .map(csvCell)
          .join(",")
      );
    }

    rows.push("");
    rows.push("DETALLE POR AREA");
    rows.push(
      ["Empleado", "Area", "Rol", "Tipo", "Horas/Unidades", "Importe", "Nota"]
        .map(csvCell)
        .join(",")
    );
    for (const line of lines.filter((line) => line.amount > 0)) {
      rows.push(
        [
          line.employee_name,
          line.module,
          line.role,
          line.tax_type,
          hoursCsv(line),
          line.amount.toFixed(2),
          line.notes ?? "",
        ]
          .map(csvCell)
          .join(",")
      );
    }

    rows.push("");
    rows.push(["TOTAL", "", "", "", "", total.toFixed(2), ""].map(csvCell).join(","));

    const noPay = employeeTotals.filter((employee) => employee.total <= 0);
    if (noPay.length > 0) {
      rows.push("");
      rows.push("SIN COBRO ESTE PERIODO (no van a ADP)");
      for (const employee of noPay) {
        rows.push([employee.employee_name, "", employee.modules.join(" + ")].map(csvCell).join(","));
      }
    }

    // BOM para que Excel abra los acentos correctamente.
    const blob = new Blob(["﻿" + rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${payPeriodId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Sin PayrollShell esta pantalla no tenia menu lateral ni salida: se
  // entraba y no habia forma de volver mas que con el boton del navegador.
  if (userLoading || loading) {
    return (
      <PayrollShell currentLabel="Reporte del periodo">
        <div className="container">Loading...</div>
      </PayrollShell>
    );
  }

  if (!hasPermission("manage_employees")) {
    return (
      <PayrollShell currentLabel="Reporte del periodo">
        <div className="error">No permission</div>
      </PayrollShell>
    );
  }

  // Lineas a cero fuera de las tablas y del CSV: no se teclean en ADP. Las
  // personas que quedan sin cobro se listan aparte, plegadas, para que un
  // cero por olvido siga siendo visible.
  const paidLines = lines.filter((line) => line.amount > 0);
  const paidTotals = employeeTotals.filter((employee) => employee.total > 0);
  const noPayPeople = (() => {
    const seen = new Map<string, { id: string; name: string; note: string }>();
    for (const employee of employeeTotals) {
      if (employee.total > 0 || seen.has(employee.employee_id)) continue;
      seen.set(employee.employee_id, {
        id: employee.employee_id,
        name: employee.employee_name,
        note: employee.modules.join(" + "),
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const w2Lines = paidLines.filter((line) => line.tax_type === "W2");
  const c1099Lines = paidLines.filter((line) => line.tax_type === "1099");
  const w2Total = w2Lines.reduce((sum, line) => sum + line.amount, 0);
  const c1099Total = c1099Lines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <PayrollShell currentLabel="Reporte del periodo">
      <div className="page-header">
        <div className="page-header-content">
          <h1>Consolidated Payroll</h1>
          <div className="subtitle">
            Total por persona para rellenar ADP, y el detalle por área debajo
          </div>
        </div>
        <div className="page-header-actions" style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={downloadCsv} disabled={lines.length === 0}>
            Descargar CSV
          </button>
          <button className="secondary" onClick={() => window.print()} disabled={lines.length === 0}>
            Imprimir
          </button>
          <Link href="/payroll/owner">
            <button className="secondary">Back</button>
          </Link>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {warnings.length > 0 && (
        <div className="error" style={{ marginBottom: 16 }}>
          <strong>Revisar antes de pagar:</strong>
          <ul style={{ margin: "8px 0 0 18px" }}>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Lo primero: un importe por persona. Es lo que se teclea en ADP.     */}
      {/* ------------------------------------------------------------------ */}
      {paidTotals.length > 0 && (
        <div className="section">
          <div className="heading">Total por empleado ({paidTotals.length})</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Áreas</th>
                  <th style={{ textAlign: "right" }}>Horas</th>
                  <th style={{ textAlign: "right" }}>Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {paidTotals.map((employee) => (
                  <tr key={`${employee.employee_id}-${employee.tax_type}`}>
                    <td>
                      <strong>{employee.employee_name}</strong>
                    </td>
                    <td>
                      <span className={employee.tax_type === "W2" ? "badge" : "badge accent"}>
                        {employee.tax_type}
                      </span>
                    </td>
                    <td className="text-sm text-tertiary">{employee.modules.join(" + ")}</td>
                    <td style={{ textAlign: "right" }} className="text-sm">
                      {employee.hours == null ? "—" : employee.hours.toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{money(employee.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NoPayList
        entries={noPayPeople}
        title="Sin cobro este periodo"
        hint="aparecen en la captura con 0; no van a ADP"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Detalle, para cuadrar de dónde sale cada total.                     */}
      {/* ------------------------------------------------------------------ */}
      {w2Lines.length > 0 && (
        <div className="section">
          <div className="heading">
            Detalle W2 ({w2Lines.length} líneas · {money(w2Total)})
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Área</th>
                  <th>Rol</th>
                  <th style={{ textAlign: "right" }}>Horas / Uds</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {w2Lines.map((line, index) => (
                  <tr key={`w2-${line.employee_id}-${index}`}>
                    <td>{line.employee_name}</td>
                    <td>{line.module}</td>
                    <td>
                      {line.role}
                      {line.is_outreach_calc && <span className="badge accent ml-2">auto</span>}
                    </td>
                    <td style={{ textAlign: "right" }} className="text-sm">
                      {hoursLabel(line)}
                    </td>
                    <td style={{ textAlign: "right" }}>{money(line.amount)}</td>
                    <td className="text-sm text-tertiary">{line.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c1099Lines.length > 0 && (
        <div className="section">
          <div className="heading">
            Detalle 1099 ({c1099Lines.length} líneas · {money(c1099Total)})
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Área</th>
                  <th>Rol</th>
                  <th style={{ textAlign: "right" }}>Horas / Uds</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {c1099Lines.map((line, index) => (
                  <tr key={`1099-${line.employee_id}-${index}`}>
                    <td>{line.employee_name}</td>
                    <td>{line.module}</td>
                    <td>{line.role}</td>
                    <td style={{ textAlign: "right" }} className="text-sm">
                      {hoursLabel(line)}
                    </td>
                    <td style={{ textAlign: "right" }}>{money(line.amount)}</td>
                    <td className="text-sm text-tertiary">{line.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lines.length === 0 && !error && (
        <div className="section">
          <div className="text-secondary">
            Todavía no hay líneas para este periodo. Hay que calcular y aprobar las áreas primero.
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-center">
          <div className="text-lg font-semibold">Total: {money(total)}</div>
          <div className="text-sm text-tertiary">
            {employeeTotals.length} personas | {money(w2Total)} W2 | {money(c1099Total)} 1099
          </div>
        </div>
      </div>
    </PayrollShell>
  );
}
