'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
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
import { useSupabaseUser } from '@/hooks/useSupabaseUser'

export default function MyEmployeePage() {
  const user = useSupabaseUser();
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEmployee = async () => {
      if (!user?.email) return;
      const { data } = await supabase
        .from('employees')
        .select('id')
        .eq('email', user.email)
        .single()
      setEmployeeId(data?.id ?? null)
      setLoading(false)
    }
    if (user) fetchEmployee()
  }, [user])

  if (loading) return <p>Cargando...</p>
  if (!user || !employeeId) return <p>No tienes permiso para acceder a esta página.</p>

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