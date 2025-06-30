'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

interface Employee {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  ready_for_payroll: boolean
}

export default function HRList() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, email, role, ready_for_payroll')

      if (error) {
        console.error('Error al cargar empleados:', error)
      } else {
        setEmployees(data || [])
      }

      setLoading(false)
    }

    fetchEmployees()
  }, [])

  if (loading) return <p className="p-4">Cargando empleados...</p>

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Empleados Registrados</h2>

      <table className="w-full text-sm border">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="p-2">Nombre</th>
            <th className="p-2">Email</th>
            <th className="p-2">Rol</th>
            <th className="p-2">Payroll</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id} className="border-t">
              <td className="p-2">{emp.first_name} {emp.last_name}</td>
              <td className="p-2">{emp.email}</td>
              <td className="p-2">{emp.role}</td>
              <td className="p-2">
                {emp.ready_for_payroll ? '✅ Aprobado' : '⏳ Pendiente'}
              </td>
              <td className="p-2">
                <Link
                  href={`/employees/${emp.id}/hr`}
                  className="text-blue-600 underline"
                >
                  Ver RRHH
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}