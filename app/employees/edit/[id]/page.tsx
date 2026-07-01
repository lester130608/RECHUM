'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AdminUploadDocument from '@/components/AdminUploadDocument'
import EmployeeDocumentsStatus from '@/components/EmployeeDocumentsStatus'

export default function EditEmployeePage() {
  const router = useRouter()
  const params = useParams();
  // Next.js 13+ useParams puede devolver string | string[] | undefined
  const employeeId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

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
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!employeeId) {
      setErrorMsg("Error: Falta el parámetro 'id' en la URL.");
      setLoading(false);
      return;
    }
    const fetchEmployee = async () => {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('id', employeeId)
          .single();
        if (error) {
          setErrorMsg("Error al cargar empleado: " + error.message);
          setNotFound(true);
        } else if (!data) {
          setErrorMsg("Empleado no encontrado.");
          setNotFound(true);
        } else {
          setForm({
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            email: data.email || '',
            rate: data.rate?.toString() || '',
            role: data.role || '',
            employment_type: data.employment_type || '',
            status: data.status || 'active',
          });
        }
      } catch (err: any) {
        setErrorMsg("Error inesperado: " + (err?.message || err));
        setNotFound(true);
      }
      setLoading(false);
    }
    fetchEmployee();
  }, [employeeId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const { error } = await supabase
      .from('employees')
      .update({
        ...form,
        rate: form.rate ? parseFloat(form.rate) : null,
      })
      .eq('id', employeeId)

    if (!error) {
      alert('✅ Changes saved')
      router.push('/employees/hr/all')
    } else {
      alert('❌ Error saving changes')
    }
  }


  if (loading) return <p className="p-4 animate-pulse text-gray-500">Cargando empleado...</p>;
  if (errorMsg) return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>{errorMsg}</div>;

  return (
    <div className="container">
      <h1 className="heading">Edit Employee</h1>

      <form onSubmit={handleSubmit} className="section">
        <div className="form-row">
          <label>First Name *</label>
          <input type="text" name="first_name" value={form.first_name} onChange={handleChange} required />
        </div>

        <div className="form-row">
          <label>Last Name *</label>
          <input type="text" name="last_name" value={form.last_name} onChange={handleChange} required />
        </div>

        <div className="form-row">
          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} />
        </div>

        <div className="form-row">
          <label>Role</label>
          <input type="text" name="role" value={form.role} onChange={handleChange} />
        </div>

        <div className="form-row">
          <label>Employment Type</label>
          <input type="text" name="employment_type" value={form.employment_type} onChange={handleChange} />
        </div>

        <div className="form-row">
          <label>Rate ($/hr)</label>
          <input type="number" name="rate" value={form.rate} onChange={handleChange} />
        </div>

        <div className="form-row">
          <label>Status</label>
          <select name="status" value={form.status} onChange={handleChange}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button type="submit" className="primary">Save Changes</button>
      </form>

      <div className="section">
        <AdminUploadDocument employeeId={employeeId} type="id" />
        <AdminUploadDocument employeeId={employeeId} type="w9" />
        <AdminUploadDocument employeeId={employeeId} type="license" />
        <AdminUploadDocument employeeId={employeeId} type="void_check" />
      </div>

      <div className="section">
        <EmployeeDocumentsStatus employeeId={employeeId} />
      </div>

      <div>
        <button
          onClick={() => router.push("/employees/hr/all")}
          className="btn-secondary"
        >
          Back to All Employees
        </button>
      </div>
    </div>
  )
}