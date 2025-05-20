"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function EmployeePayrollCreatePage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [week, setWeek] = useState("2025-W12");
  const [form, setForm] = useState<{ [id: string]: string }>({});
  const router = useRouter();

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, rate, role, status")
        .eq("role", "EMPLOYEE")
        .eq("status", "active");
  
      console.log("🚀 Empleados EMPLOYEE encontrados:", data);
  
      if (error) {
        console.error("❌ Error al cargar empleados:", error.message);
      }
  
      setEmployees(data || []);
    };
  
    fetchEmployees();
  }, []);

  const handleChange = (id: string, value: string) => {
    setForm((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const entries = employees
      .filter((emp) => form[emp.id] && parseFloat(form[emp.id]) > 0)
      .map((emp) => {
        const hours = parseFloat(form[emp.id]);
        const total = hours * parseFloat(emp.rate);
        return {
          employee_id: emp.id,
          name: `${emp.first_name} ${emp.last_name}`,
          hours,
          rate: parseFloat(emp.rate),
          total,
          week,
          payment_status: "pending",
        };
      });

    if (entries.length === 0) {
      alert("Debes ingresar al menos una fila con horas.");
      return;
    }

    const { error } = await supabase.from("payroll_employee_raw").insert(entries);

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Payroll guardado correctamente.");
      router.push("/payroll");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Payroll Manual - Employees</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block font-medium mb-1">Semana</label>
          <input
            type="text"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="border rounded px-3 py-2 w-48"
          />
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Empleado</th>
              <th className="p-2 border text-center">Horas</th>
              <th className="p-2 border text-center">Tarifa</th>
              <th className="p-2 border text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const hours = parseFloat(form[emp.id] || "0");
              const rate = parseFloat(emp.rate);
              const total = hours * rate;

              return (
                <tr key={emp.id}>
                  <td className="p-2 border">{emp.first_name} {emp.last_name}</td>
                  <td className="p-2 border text-center">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form[emp.id] || ""}
                      onChange={(e) => handleChange(emp.id, e.target.value)}
                      className="w-24 border rounded px-2 py-1 text-center"
                    />
                  </td>
                  <td className="p-2 border text-center">${rate.toFixed(2)}</td>
                  <td className="p-2 border text-center">${total.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex gap-2">
          <button
            type="submit"
            className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => router.push("/payroll")}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}