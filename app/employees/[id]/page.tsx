'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AdminLayout from '@/components/AdminLayout'
import EmployeeDocumentsList from '@/components/EmployeeDocumentsList'
import EmployeeOnboardingChecklist from '@/components/EmployeeOnboardingChecklist'

const roles = ["RBT", "BCABA", "BCBA", "CLINICIANS", "TCM", "EMPLOYEE"]
const employmentTypes = ["W-2", "1099"]
const statuses = ["active", "inactive"]

export default function EditEmployeePage() {
  const router = useRouter()
  const params = useParams()
  const employeeId = params.id as string

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    rate: '',
    role: '',
    employment_type: 'W-2',
    status: 'active',
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEmployee = async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single()

      if (data) {
        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
          rate: data.rate?.toString() || '',
          role: data.role || '',
          employment_type: data.employment_type || 'W-2',
          status: data.status || 'active',
        })
      }

      setLoading(false)
    }

    fetchEmployee()
  }, [employeeId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const { error } = await supabase.from('employees').update({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      rate: form.rate ? parseFloat(form.rate) : null,
      role: form.role,
      employee_type: form.role,
      employment_type: form.employment_type,
      status: form.status,
    }).eq('id', employeeId)

    if (error) {
      alert('Error al guardar: ' + error.message)
    } else {
      router.push('/employees')
    }
  }

  const markAsReadyForPayroll = async () => {
    const { error } = await supabase
      .from('employees')
      .update({ ready_for_payroll: true })
      .eq('id', employeeId)

    if (error) {
      alert('Error al aprobar para payroll: ' + error.message)
    } else {
      alert('Empleado aprobado para payroll ✅')
      router.push('/admin/onboarding')
    }
  }

  if (loading) return <p className="p-4">Cargando...</p>

  return (
    <AdminLayout>
      <div className="max-w-xl mx-auto p-6 space-y-10">
        <h1 className="text-2xl font-bold mb-6">Editar Empleado</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium mb-1">First Name *</label>
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Last Name *</label>
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Rate ($/hr)</label>
            <input
              type="number"
              step="0.01"
              name="rate"
              value={form.rate}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Role *</label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Seleccionar</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium mb-1">Employment Type *</label>
            <select
              name="employment_type"
              value={form.employment_type}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            >
              {employmentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium mb-1">Status *</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700"
            >
              Guardar Cambios
            </button>
            <button
              type="button"
              onClick={() => router.push("/employees")}
              className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
            >
              Cancelar
            </button>
          </div>
        </form>

        {/* Onboarding checklist y documentos */}
        <div className="mt-10 space-y-8">
          <EmployeeOnboardingChecklist employeeId={employeeId} />
          <EmployeeDocumentsList employeeId={employeeId} />
          <button
            onClick={markAsReadyForPayroll}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Aprobar para Payroll
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}