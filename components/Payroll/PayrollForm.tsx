// components/PayrollForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Employee } from "@/types/interfaces"; // Asegúrate de que la ruta sea correcta

const PayrollForm = () => {
  // Estado para la lista de empleados
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Estado para la selección de fechas
  const [selectedDateRange, setSelectedDateRange] = useState({ start: "", end: "" });
  // Estado para las horas trabajadas: un objeto donde la llave es el ID del empleado
  const [hoursWorked, setHoursWorked] = useState<{ [employeeId: string]: number }>({});
  // Estado para los comentarios
  const [comments, setComments] = useState("");

  // Simulación de carga de empleados (en producción se llamaría a la API)
  useEffect(() => {
    const fetchEmployees = async () => {
      // Ejemplo de datos simulados
      const sampleEmployees: Employee[] = [
        { id: "1", nombre: "Juan Pérez", tipo: "administrativo", supervisor_id: "sup1", estado: "activo", tarifa: 20 },
        { id: "2", nombre: "María García", tipo: "TCM", supervisor_id: "sup2", estado: "activo", tarifa: 25 },
        // Puedes agregar más empleados según sea necesario
      ];
      setEmployees(sampleEmployees);
    };
    fetchEmployees();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Aquí agregarías la lógica para calcular el pago total y enviar los datos a la API.
    console.log("Fecha de inicio:", selectedDateRange.start);
    console.log("Fecha de fin:", selectedDateRange.end);
    console.log("Horas trabajadas:", hoursWorked);
    console.log("Comentarios:", comments);
    // Llama a tu API para crear la nómina, por ejemplo:
    // await fetch("/api/payroll", { method: "POST", body: JSON.stringify({...}) });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white rounded shadow">
      <div className="mb-4">
        <label className="block text-gray-700">Fecha de inicio:</label>
        <input
          type="date"
          value={selectedDateRange.start}
          onChange={(e) => setSelectedDateRange({ ...selectedDateRange, start: e.target.value })}
          className="mt-1 p-2 border rounded w-full"
        />
      </div>
      <div className="mb-4">
        <label className="block text-gray-700">Fecha de fin:</label>
        <input
          type="date"
          value={selectedDateRange.end}
          onChange={(e) => setSelectedDateRange({ ...selectedDateRange, end: e.target.value })}
          className="mt-1 p-2 border rounded w-full"
        />
      </div>
      <div className="mb-4">
        <h3 className="text-lg font-bold mb-2">Empleados</h3>
        {employees.map((emp) => (
          <div key={emp.id} className="flex items-center mb-2">
            <span className="w-1/3">{emp.nombre}</span>
            <input
              type="number"
              placeholder="Horas trabajadas"
              value={hoursWorked[emp.id] || ""}
              onChange={(e) =>
                setHoursWorked({
                  ...hoursWorked,
                  [emp.id]: parseFloat(e.target.value),
                })
              }
              className="mt-1 p-2 border rounded w-1/3"
            />
          </div>
        ))}
      </div>
      <div className="mb-4">
        <label className="block text-gray-700">Comentarios:</label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="mt-1 p-2 border rounded w-full"
        />
      </div>
      <button type="submit" className="bg-blue-500 text-white p-2 rounded">
        Enviar Nómina
      </button>
    </form>
  );
};

export default PayrollForm;