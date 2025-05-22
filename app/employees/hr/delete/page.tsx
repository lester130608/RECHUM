'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function DeletedEmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('status', 'inactive')

      if (!error) setEmployees(data || [])
    }

    fetchEmployees()
  }, [])

  const filtered = employees.filter((employee) =>
    !search ||
    employee.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    employee.last_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleReactivate = async (id: string) => {
    const { error } = await supabase
      .from('employees')
      .update({ status: 'active' })
      .eq('id', id)

    if (!error) {
      alert('✅ Employee reactivated')
      window.location.reload()
    } else {
      alert('❌ Error reactivating employee')
    }
  }

  return (
    <div className="container">
      <h1 className="heading">Inactive Employees</h1>

      <div className="form-row">
        <label>Search by name</label>
        <input
          type="text"
          placeholder="e.g. John or Jane"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="section">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="py-2 px-4 border-b">First Name</th>
              <th className="py-2 px-4 border-b">Last Name</th>
              <th className="py-2 px-4 border-b">Email</th>
              <th className="py-2 px-4 border-b">Role</th>
              <th className="py-2 px-4 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((employee) => (
              <tr key={employee.id}>
                <td className="py-2 px-4 border-b">{employee.first_name}</td>
                <td className="py-2 px-4 border-b">{employee.last_name}</td>
                <td className="py-2 px-4 border-b">{employee.email}</td>
                <td className="py-2 px-4 border-b">{employee.role}</td>
                <td className="py-2 px-4 border-b">
                  <button
                    onClick={() => handleReactivate(employee.id)}
                    className="btn-action btn-green"
                  >
                    Reactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "2rem" }}>
        <button
          onClick={() => window.location.href = "/dashboard"}
          className="btn-secondary"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}