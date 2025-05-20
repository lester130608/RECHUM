// components/TCMPayrollForm.tsx
"use client";

import { useState } from "react";
import { Employee } from "@/types/interfaces";

interface TCMPayrollData {
  employeeId: string;
  week1Hours: number;
  week2Hours: number;
  week3Hours: number;
}

interface TCMPayrollFormProps {
  tcmEmployees: Employee[];
}

export default function TCMPayrollForm({ tcmEmployees }: TCMPayrollFormProps) {
  const THRESHOLD = 34; // Umbral para rate especial (si horas > THRESHOLD, rate = 30)
  
  // Inicializamos el estado para cada empleado
  const [payrollData, setPayrollData] = useState<TCMPayrollData[]>(
    tcmEmployees.map(employee => ({
      employeeId: employee.id,
      week1Hours: 0,
      week2Hours: 0,
      week3Hours: 0,
    }))
  );

  // Actualiza las horas para una semana dada
  const handleHoursChange = (
    index: number,
    week: "week1Hours" | "week2Hours" | "week3Hours",
    value: number
  ) => {
    setPayrollData(prev => {
      const newData = [...prev];
      newData[index] = { ...newData[index], [week]: value };
      return newData;
    });
  };

  // Calcula el rate de forma automática para un empleado dado y unas horas ingresadas
  const getComputedRate = (employee: Employee, hours: number) => {
    return hours > THRESHOLD ? 30 : employee.tarifa;
  };

  // Calcula el pago total de las tres semanas para un empleado
  const computeTotalPay = (employee: Employee, data: TCMPayrollData) => {
    const rate1 = getComputedRate(employee, data.week1Hours);
    const rate2 = getComputedRate(employee, data.week2Hours);
    const rate3 = getComputedRate(employee, data.week3Hours);
    return data.week1Hours * rate1 + data.week2Hours * rate2 + data.week3Hours * rate3;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Preparamos el payload para cada empleado
    const payload = tcmEmployees.map(employee => {
      const data = payrollData.find(pd => pd.employeeId === employee.id);
      if (!data) return null;
      return {
        employee_id: employee.id,
        week1_hours: data.week1Hours,
        week1_rate: getComputedRate(employee, data.week1Hours),
        week2_hours: data.week2Hours,
        week2_rate: getComputedRate(employee, data.week2Hours),
        week3_hours: data.week3Hours,
        week3_rate: getComputedRate(employee, data.week3Hours),
        total_pay: computeTotalPay(employee, data),
      };
    }).filter(item => item !== null);

    console.log("Submitting payroll payload:", payload);
    // Aquí enviarías el payload a tu API (por ejemplo, a /api/payroll)
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Error submitting payroll:", errorData.message);
      } else {
        console.log("Payroll submitted successfully");
      }
    } catch (err: any) {
      console.error("Network error:", err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2">Employee</th>
            <th className="border p-2">Week 1 Hours</th>
            <th className="border p-2">Week 1 Rate</th>
            <th className="border p-2">Week 2 Hours</th>
            <th className="border p-2">Week 2 Rate</th>
            <th className="border p-2">Week 3 Hours</th>
            <th className="border p-2">Week 3 Rate</th>
            <th className="border p-2">Total Pay</th>
          </tr>
        </thead>
        <tbody>
          {tcmEmployees.map((employee, index) => {
            const data = payrollData[index];
            return (
              <tr key={employee.id}>
                <td className="border p-2">{employee.nombre}</td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={data.week1Hours}
                    onChange={(e) =>
                      handleHoursChange(index, "week1Hours", Number(e.target.value))
                    }
                    className="w-full p-1 border rounded"
                    min={0}
                  />
                </td>
                <td className="border p-2">
                  {getComputedRate(employee, data.week1Hours)}
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={data.week2Hours}
                    onChange={(e) =>
                      handleHoursChange(index, "week2Hours", Number(e.target.value))
                    }
                    className="w-full p-1 border rounded"
                    min={0}
                  />
                </td>
                <td className="border p-2">
                  {getComputedRate(employee, data.week2Hours)}
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={data.week3Hours}
                    onChange={(e) =>
                      handleHoursChange(index, "week3Hours", Number(e.target.value))
                    }
                    className="w-full p-1 border rounded"
                    min={0}
                  />
                </td>
                <td className="border p-2">
                  {getComputedRate(employee, data.week3Hours)}
                </td>
                <td className="border p-2">
                  {computeTotalPay(employee, data)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="submit" className="mt-4 p-2 bg-blue-500 text-white rounded hover:bg-blue-600">
        Submit Payroll
      </button>
    </form>
  );
}