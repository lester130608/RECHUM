"use client";

import { useState } from 'react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

export default function Payroll() {
  const user = useSupabaseUser();
  const [payrollData, setPayrollData] = useState('');

  if (!user) {
    return <p>Cargando...</p>;
  }
  // Aquí podrías consultar el rol si lo necesitas
  // if (rol !== 'admin') return <p>No tienes permiso para acceder a esta página.</p>;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Aquí puedes añadir la lógica para gestionar el payroll
    alert('Payroll gestionado con éxito');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestión de Nómina</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <textarea
          className="w-full border rounded p-2 mb-2"
          value={payrollData}
          onChange={e => setPayrollData(e.target.value)}
          placeholder="Datos de nómina..."
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">Enviar</button>
      </form>
    </div>
  );
}