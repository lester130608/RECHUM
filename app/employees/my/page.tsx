'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { supabase } from '@/lib/supabase'

import UploadDocument from '@/components/UploadDocument'
import EmployeeDocumentsList from '@/components/EmployeeDocumentsList'
import EmployeeOnboardingChecklist from '@/components/EmployeeOnboardingChecklist'
import EmployeeHRChecklist from '@/components/EmployeeHRChecklist'

import ApplicationPersonalSection from '@/components/forms/ApplicationPersonalSection'
import ApplicationEducationSection from '@/components/forms/ApplicationEducationSection'
import PreviousEmploymentVerificationForm from '@/components/forms/PreviousEmploymentVerificationForm'
import ConfidentialityAgreementForm from '@/components/forms/ConfidentialityAgreementForm'
import AgreementForProfessionalServicesForm from '@/components/forms/AgreementForProfessionalServicesForm'
import SystemAccessRequestForm from '@/components/forms/SystemAccessRequestForm'
import SecurityAgreementForm from '@/components/forms/SecurityAgreementForm'
import DrugAlcoholConsentForm from '@/components/forms/DrugAlcoholConsentForm'
import DirectDepositAuthorizationForm from '@/components/forms/DirectDepositAuthorizationForm'
import PersonnelHandbookAcknowledgementForm from '@/components/forms/PersonnelHandbookAcknowledgementForm'
import ApplicationSignatureSection from '@/components/forms/ApplicationSignatureSection'

export default function MyEmployeePage() {
  const { data: session, status } = useSession()
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEmployee = async () => {
      if (status !== 'authenticated' || !session?.user?.email) return

      const { data, error } = await supabase
        .from('employees')
        .select('id')
        .eq('email', session.user.email)
        .eq('ready_for_payroll', false)
        .single()

      if (data) setEmployeeId(data.id)
      setLoading(false)
    }

    fetchEmployee()
  }, [session, status])

  if (status === 'loading' || loading) {
    return <p className="p-4">Cargando...</p>
  }

  if (session?.user?.role !== 'employee') {
    return <p className="p-4">Solo empleados pueden acceder a esta sección.</p>
  }

  if (!employeeId) {
    return <p className="p-4">No tienes acceso o ya estás aprobado para payroll.</p>
  }

  return (
    <div className="container">
      <div className="section">
        <h1 className="heading">Mi Expediente de Ingreso</h1>
      </div>
  
      {/* Cada bloque de formularios/documentos puede ir dentro de <div className="section"> si deseas separarlos visualmente */}
  
      <ApplicationPersonalSection employeeId={employeeId} />
      <ApplicationEducationSection employeeId={employeeId} />
      <PreviousEmploymentVerificationForm employeeId={employeeId} />
      <ConfidentialityAgreementForm employeeId={employeeId} />
      <AgreementForProfessionalServicesForm employeeId={employeeId} />
      <SystemAccessRequestForm employeeId={employeeId} />
      <SecurityAgreementForm employeeId={employeeId} />
      <DrugAlcoholConsentForm employeeId={employeeId} />
      <DirectDepositAuthorizationForm employeeId={employeeId} />
      <UploadDocument employeeId={employeeId} type="void_check" />
      <PersonnelHandbookAcknowledgementForm employeeId={employeeId} />
      <UploadDocument employeeId={employeeId} type="id" />
      <UploadDocument employeeId={employeeId} type="w9" />
      <UploadDocument employeeId={employeeId} type="license" />
      <UploadDocument employeeId={employeeId} type="i9" />
      <EmployeeDocumentsList employeeId={employeeId} />
      <EmployeeOnboardingChecklist employeeId={employeeId} />
      <EmployeeHRChecklist employeeId={employeeId} isEditable={false} />
      <ApplicationSignatureSection employeeId={employeeId} />
    </div>
  )
}