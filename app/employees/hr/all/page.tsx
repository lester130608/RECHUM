'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function AllEmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const { data, error } = await supabase.from('employees').select('*')
        if (error) {
          setErrorMsg("Error al cargar empleados: " + error.message);
          setEmployees([]);
        } else if (!data || !Array.isArray(data)) {
          setErrorMsg("No se pudo obtener la lista de empleados.");
          setEmployees([]);
        } else {
          setEmployees(data)
        }
      } catch (err: any) {
        setErrorMsg("Error inesperado: " + (err?.message || err));
        setEmployees([]);
      }
      setLoading(false);
    }
    fetchEmployees()
  }, [])

  const filtered = employees.filter((employee) => {
    return (
      (!search ||
        employee.first_name?.toLowerCase().includes(search.toLowerCase()) ||
        employee.last_name?.toLowerCase().includes(search.toLowerCase())) &&
      (!role || employee.role === role) &&
      (!status || employee.status?.toLowerCase() === status)
    )
  })

  if (loading) return <div className="p-4 animate-pulse text-gray-500">Cargando empleados...</div>;
  if (errorMsg) return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>{errorMsg}</div>;

  try {
    return (
      <div className="container" style={{ background: '#f9fafb', minHeight: '80vh', padding: '2rem' }}>
        <h1 className="heading">All Employees</h1>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border p-2 flex-1"
          />
          <select className="border p-2" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All Roles</option>
            <option value="RBT">RBT</option>
            <option value="BCBA">BCBA</option>
            <option value="BCABA">BCABA</option>
            <option value="CLINICIANS">Clinicians</option>
            <option value="TCM">TCM</option>
          </select>
          <select className="border p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <table className="min-w-full bg-white" style={{ boxShadow: '0 1px 4px #e5e7eb' }}>
          <thead>
            <tr>
              <th className="py-2 px-4 border-b">First Name</th>
              <th className="py-2 px-4 border-b">Last Name</th>
              <th className="py-2 px-4 border-b">Email</th>
              <th className="py-2 px-4 border-b">Role</th>
              <th className="py-2 px-4 border-b">Status</th>
              <th className="py-2 px-4 border-b">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', background: '#fffbe9', borderRadius: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>No employees found.</span>
                </td>
              </tr>
            ) : (
              filtered.map((employee) => (
                <tr key={employee.id}>
                  <td className="py-2 px-4 border-b">{employee.first_name}</td>
                  <td className="py-2 px-4 border-b">{employee.last_name}</td>
                  <td className="py-2 px-4 border-b">{employee.email}</td>
                  <td className="py-2 px-4 border-b">{employee.role}</td>
                  <td className="py-2 px-4 border-b">{employee.status}</td>
                  <td className="py-2 px-4 border-b space-x-2">
                    <Link href={`/employees/view/${employee.id}`}>
                      <button className="small">View</button>
                    </Link>
                    <Link href={`/employees/edit/${employee.id}`}>
                      <button className="small">Edit</button>
                    </Link>
                    {employee.status?.toLowerCase() === 'active' && (
                      <button
                        onClick={async () => {
                          const confirm = window.confirm('Are you sure you want to deactivate this employee?')
                          if (!confirm) return;
                          const { error } = await supabase
                            .from('employees')
                            .update({ status: 'inactive' })
                            .eq('id', employee.id)
                          if (!error) {
                            alert('✅ Employee marked as inactive')
                            window.location.reload()
                          } else {
                            alert('❌ Error updating employee')
                          }
                        }}
                        className="small danger"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div style={{ marginTop: "2rem" }}>
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="small"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  } catch (err: any) {
    return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>Error inesperado al renderizar empleados: {err?.message || err?.toString() || ''}</div>
  }
}