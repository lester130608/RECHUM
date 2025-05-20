'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface EmployeeRow {
  id: string
  full_name: string
  email: string
  status: string
  onboarding_complete: boolean
  ready_for_payroll: boolean
}

export default function OnboardingAdminPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, email, status, ready_for_payroll')
        .eq('ready_for_payroll', false) // solo los que aún no han sido aprobados

      if (data) setEmployees(data)
      else console.error(error)

      setLoading(false)
    }

    fetchEmployees()
  }, [])

  const markAsReady = async (id: string) => {
    const { error } = await supabase
      .from('employees')
      .update({ ready_for_payroll: true })
      .eq('id', id)

    if (error) {
      alert('Error al actualizar: ' + error.message)
    } else {
      setEmployees((prev) => prev.filter((emp) => emp.id !== id))
    }
  }

  if (loading) return <p className="p-4">Cargando empleados...</p>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Empleados en proceso de Onboarding</h1>

      {employees.length === 0 ? (
        <p>Todos los empleados han sido aprobados para payroll.</p>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Checklist</th>
              <th className="text-left p-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-t">
                <td className="p-2">{emp.full_name}</td>
                <td className="p-2">{emp.email}</td>
                <td className="p-2">
                  <Link
                    href={`/employee/${emp.id}`}
                    className="text-blue-600 underline"
                  >
                    Ver checklist
                  </Link>
                </td>
                <td className="p-2">
                  <button
                    onClick={() => markAsReady(emp.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded"
                  >
                    Aprobar para Payroll
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}