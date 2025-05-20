"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";

export default function AdminDashboard() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <p>Cargando...</p>;
  }

  if (status === "unauthenticated" || session.user.role !== 'admin') {
    return <p>No tienes permiso para acceder a esta página.</p>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard de Admin</h1>
      <div className="grid grid-cols-1 gap-4">
        <Link href="/admin/upload">
          <a className="block p-4 bg-blue-500 text-white rounded text-center">
            Cargar Archivo
          </a>
        </Link>
        <Link href="/admin/payroll">
          <a className="block p-4 bg-green-500 text-white rounded text-center">
            Gestionar Payroll
          </a>
        </Link>
      </div>
    </div>
  );
}