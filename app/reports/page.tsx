"use client";

import { useRouter } from "next/navigation";
import KPICard from "@/components/KPICard";

export default function ReportsPage() {
  const router = useRouter();

  const kpis = [
    {
      title: "Total Payroll This Month",
      value: "$85,420",
    },
    {
      title: "Total Hours Logged",
      value: "1,284 hrs",
    },
    {
      title: "Active Employees in Payroll",
      value: "42",
    },
    {
      title: "Payroll Growth",
      value: "+5.2%",
    },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">📊 Payroll Reports</h1>

      {/* Botones principales */}
      <div className="flex flex-wrap gap-4 mb-6">
        <button
          onClick={() => router.push("/reports/create")}
          className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded shadow"
        >
          ➕ Crear Reporte Nuevo
        </button>
        <button
          onClick={() => router.push("/reports/saved")}
          className="bg-gray-300 hover:bg-gray-400 text-black px-6 py-3 rounded"
        >
          📁 Ver Reportes Guardados
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi, index) => (
          <KPICard key={index} title={kpi.title} value={kpi.value} />
        ))}
      </div>

      {/* Filtros visuales */}
      <div className="bg-white border rounded-xl p-4 shadow-sm mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <select className="border p-2 rounded">
            <option value="">Select Month</option>
            {[
              "January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"
            ].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select className="border p-2 rounded">
            <option value="">Select Year</option>
            {[2023, 2024, 2025].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select className="border p-2 rounded">
            <option value="">Select Role</option>
            {[
              "Office Manager", "Basic User", "System Owner", "Case Manager",
              "Biller", "Supervisor", "Clinician", "External user", "RBT", "BA SUPERVISOR"
            ].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select className="border p-2 rounded">
            <option value="">Employment Type</option>
            <option value="W-2">W-2</option>
            <option value="1099">1099</option>
          </select>

          <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Search
          </button>
        </div>

        {/* Botones de exportación */}
        <div className="flex flex-wrap gap-4 justify-end">
          <button className="bg-gray-200 text-black px-4 py-2 rounded hover:bg-gray-300">
            Export to PDF
          </button>
          <button className="bg-gray-200 text-black px-4 py-2 rounded hover:bg-gray-300">
            Export to Excel
          </button>
        </div>
      </div>
    </div>
  );
}