"use client";

import { useSession } from "next-auth/react";
import { useState } from 'react';

export default function Payroll() {
  const { data: session, status } = useSession();
  const [payrollData, setPayrollData] = useState('');

  if (status === "loading") {
    return <p>Cargando...</p>;
  }

  if (status === "unauthenticated" || session.user.role !== 'admin') {
    return <p>No tienes permiso para acceder a esta página.</p>;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Aquí puedes añadir la lógica para gestionar el payroll
    alert('Payroll gestionado con éxito');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestionar Payroll</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={payrollData}
          onChange={(e) => setPayrollData(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded mb-4"
          rows={10}
          placeholder="Introduce los datos del payroll aquí..."
        />
        <button type="submit" className="px-4 py-2 bg-green-500 text-white rounded">
          Ejecutar Payroll
        </button>
      </form>
    </div>
  );
}