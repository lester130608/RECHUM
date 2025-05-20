'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AdminUploadDocument from '@/components/AdminUploadDocument'
import EmployeeDocumentsStatus from '@/components/EmployeeDocumentsStatus'

export default function EditEmployeePage() {
  const router = useRouter()
  const { id } = useParams()
  const employeeId = id as string

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    rate: '',
    role: '',
    employment_type: '',
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
          employment_type: data.employment_type || '',
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
      ...form,
      rate: form.rate ? parseFloat(form.rate) : null,
    }).eq('id', employeeId)

    if (!error) {
      alert('✅ Changes saved')
      router.push('/employees/hr/all')
    } else {
      alert('❌ Error saving changes')
    }
  }

  if (loading) return <p className="p-4">Loading...</p>

  return (
    <div className="container max-w-3xl mx-auto p-6 space-y-10">
      <h1 className="text-2xl font-bold mb-4">Edit Employee</h1>

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
              className="w-full border px-3 py-2 rounded"
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
              className="w-full border px-3 py-2 rounded"
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
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block font-medium mb-1">Role</label>
          <input
            type="text"
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block font-medium mb-1">Employment Type</label>
          <input
            type="text"
            name="employment_type"
            value={form.employment_type}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block font-medium mb-1">Rate ($/hr)</label>
          <input
            type="number"
            name="rate"
            value={form.rate}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block font-medium mb-1">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Save Changes
        </button>
      </form>

      {/* 📂 Upload Scanned Documents */}
      <AdminUploadDocument employeeId={employeeId} />
      
      <div className="mt-10">
  <EmployeeDocumentsStatus employeeId={employeeId} />
</div>

      <div>
        <button
          onClick={() => window.location.href = "/employees/hr/all"}
          className="mt-6 bg-gray-500 text-white px-4 py-2 rounded"
        >
          Back to All Employees
        </button>
      </div>
    </div>
  )
}