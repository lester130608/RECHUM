"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@/hooks/useUser";
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
  is_outreach_calc?: boolean;
  notes?: string;
};

type EmployeeTotal = {
  employee_id: string;
  employee_name: string;
  tax_type: "W2" | "1099";
  total: number;
  modules: string[];
};

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

  // Total por persona: lo que hay que teclear en ADP.
  const employeeTotals = useMemo<EmployeeTotal[]>(() => {
    const byEmployee = new Map<string, EmployeeTotal>();

    for (const line of lines) {
      const current = byEmployee.get(line.employee_id);
      if (current) {
        current.total += line.amount;
        if (!current.modules.includes(line.module)) current.modules.push(line.module);
      } else {
        byEmployee.set(line.employee_id, {
          employee_id: line.employee_id,
          employee_name: line.employee_name,
          tax_type: line.tax_type,
          total: line.amount,
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
    rows.push(["Empleado", "Tipo", "Areas", "Total"].map(csvCell).join(","));
    for (const employee of employeeTotals) {
      rows.push(
        [
          employee.employee_name,
          employee.tax_type,
          employee.modules.join(" + "),
          employee.total.toFixed(2),
        ]
          .map(csvCell)
          .join(",")
      );
    }

    rows.push("");
    rows.push("DETALLE POR AREA");
    rows.push(["Empleado", "Area", "Rol", "Tipo", "Importe", "Nota"].map(csvCell).join(","));
    for (const line of lines) {
      rows.push(
        [
          line.employee_name,
          line.module,
          line.role,
          line.tax_type,
          line.amount.toFixed(2),
          line.notes ?? "",
        ]
          .map(csvCell)
          .join(",")
      );
    }

    rows.push("");
    rows.push(["TOTAL", "", "", "", total.toFixed(2), ""].map(csvCell).join(","));

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
  const w2Total = w2Lines.reduce((sum, line) => sum + line.amount, 0);
  const c1099Total = c1099Lines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <div className="container">
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
      {employeeTotals.length > 0 && (
        <div className="section">
          <div className="heading">Total por empleado ({employeeTotals.length})</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Áreas</th>
                  <th style={{ textAlign: "right" }}>Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {employeeTotals.map((employee) => (
                  <tr key={employee.employee_id}>
                    <td>
                      <strong>{employee.employee_name}</strong>
                    </td>
                    <td>
                      <span className={employee.tax_type === "W2" ? "badge" : "badge accent"}>
                        {employee.tax_type}
                      </span>
                    </td>
                    <td className="text-sm text-tertiary">{employee.modules.join(" + ")}</td>
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
    </div>
  );
}
