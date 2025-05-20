'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmployeeDocumentsList from '@/components/EmployeeDocumentsList'
import EmployeeOnboardingChecklist from '@/components/EmployeeOnboardingChecklist'
import AdminUploadDocument from '@/components/AdminUploadDocument'
import EmployeeHRChecklist from '@/components/EmployeeHRChecklist'

export default function HRViewPage() {
  const { id } = useParams()
  const employeeId = id as string
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [canApprove, setCanApprove] = useState(false)

  useEffect(() => {
    const fetchEmployee = async () => {
      const { data } = await supabase
        .from('employees')
        .select('first_name, last_name')
        .eq('id', employeeId)
        .single()

      if (data) setFullName(`${data.first_name} ${data.last_name}`)
    }

    const validateChecklist = async () => {
      const { data: onboarding } = await supabase
        .from('onboarding_checklist')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      const fields = [
        'resume',
        'copy_of_id',
        'license',
        'npi',
        'ahca_check',
        'w9',
        'i9',
        'application_form',
        'void_check'
      ]

      const complete = onboarding && fields.every((key) => onboarding[key])
      setCanApprove(complete)
    }

    fetchEmployee()
    validateChecklist()
    setLoading(false)
  }, [employeeId])

  const approveEmployee = async () => {
    const { error } = await supabase
      .from('employees')
      .update({ ready_for_payroll: true })
      .eq('id', employeeId)

    if (error) {
      alert('Error al aprobar empleado')
    } else {
      alert('Empleado aprobado para payroll ✅')
      router.push('/employees/hr')
    }
  }

  if (loading) return <p className="p-4">Cargando...</p>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">RRHH: {fullName}</h1>

      <AdminUploadDocument employeeId={employeeId} />
      <EmployeeDocumentsList employeeId={employeeId} />
      <EmployeeOnboardingChecklist employeeId={employeeId} />
      <EmployeeHRChecklist employeeId={employeeId} isEditable={true} />

      <div>
        <button
          onClick={approveEmployee}
          className={`mt-4 px-4 py-2 rounded ${
            canApprove ? 'bg-green-600 text-white' : 'bg-gray-400 text-gray-700 cursor-not-allowed'
          }`}
          disabled={!canApprove}
        >
          Aprobar y activar en Payroll
        </button>

        {!canApprove && (
          <p className="text-sm text-red-600 mt-2">
            Debes completar todos los elementos del expediente antes de aprobar.
          </p>
        )}
      </div>
    </div>
  )
}