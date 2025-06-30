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
    const fetchOrCreateEmployee = async () => {
      if (!user?.email) return;
      // Buscar empleado por email
      const { data, error } = await supabase
        .from('employees')
        .select('id')
        .eq('email', user.email)
        .single();
      if (data?.id) {
        setEmployeeId(data.id);
        setLoading(false);
        return;
      }
      // Si no existe, crear registro básico
      const { data: newEmployee, error: insertError } = await supabase
        .from('employees')
        .insert([
          {
            email: user.email,
            first_name: user.user_metadata?.first_name || '',
            last_name: user.user_metadata?.last_name || '',
            role: 'employee',
            employee_type: 'employee',
            status: 'active',
            ready_for_payroll: false,
            created_at: new Date().toISOString(),
          },
        ])
        .select('id')
        .single();
      if (newEmployee?.id) {
        setEmployeeId(newEmployee.id);
      }
      setLoading(false);
    };
    if (user) fetchOrCreateEmployee();
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