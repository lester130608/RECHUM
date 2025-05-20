'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface EmployeeOnboardingChecklistProps {
  employeeId: string
}

type Checklist = {
  w9_uploaded: boolean
  id_uploaded: boolean
  license_uploaded: boolean
  direct_deposit_uploaded: boolean
  background_check_completed: boolean
  confidentiality_signed: boolean
  drug_test_signed: boolean
  agreement_signed: boolean
  handbook_acknowledged: boolean
  hipaa_training_completed: boolean
  osha_training_completed: boolean
  cultural_training_completed: boolean
  job_description_reviewed: boolean
  onboarding_complete: boolean
  verified_by: string | null
  verified_at: string | null
}

export default function EmployeeOnboardingChecklist({ employeeId }: EmployeeOnboardingChecklistProps) {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChecklist = async () => {
    const { data, error } = await supabase
      .from('onboarding_checklist')
      .select('*')
      .eq('employee_id', employeeId)
      .single()

    if (error) {
      console.error('Error loading checklist:', error)
    } else {
      setChecklist(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchChecklist()
  }, [employeeId])

  if (loading) return <p className="p-4">Loading onboarding checklist...</p>
  if (!checklist) return <p className="p-4">No onboarding data found.</p>

  const displayItem = (label: string, value: boolean) => (
    <li className="flex justify-between py-1 border-b">
      <span>{label}</span>
      <span className={value ? 'text-green-600' : 'text-red-600'}>
        {value ? '✅ Completed' : '⛔ Pending'}
      </span>
    </li>
  )

  return (
    <div className="section">
      <h2 className="heading">📝 Onboarding Checklist</h2>

      <ul>
        {displayItem('W-9 uploaded', checklist.w9_uploaded)}
        {displayItem('ID uploaded', checklist.id_uploaded)}
        {displayItem('License uploaded', checklist.license_uploaded)}
        {displayItem('Direct deposit uploaded', checklist.direct_deposit_uploaded)}
        {displayItem('Background check completed', checklist.background_check_completed)}
        {displayItem('Confidentiality agreement signed', checklist.confidentiality_signed)}
        {displayItem('Drug test consent signed', checklist.drug_test_signed)}
        {displayItem('Professional services agreement signed', checklist.agreement_signed)}
        {displayItem('Employee handbook acknowledged', checklist.handbook_acknowledged)}
        {displayItem('HIPAA training completed', checklist.hipaa_training_completed)}
        {displayItem('OSHA training completed', checklist.osha_training_completed)}
        {displayItem('Cultural competency training completed', checklist.cultural_training_completed)}
        {displayItem('Job description reviewed', checklist.job_description_reviewed)}
      </ul>

      <div style={{ marginTop: "1rem", fontWeight: 600 }}>
        {checklist.onboarding_complete ? (
          <p style={{ color: "#15803d" }}>🎉 Onboarding COMPLETE</p>
        ) : (
          <p style={{ color: "#b45309" }}>⚠️ Onboarding INCOMPLETE</p>
        )}
      </div>
    </div>
  )
}