'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
  isEditable?: boolean // true if HR is editing, false if employee is only viewing
}

export default function EmployeeHRChecklist({ employeeId, isEditable = false }: Props) {
  const [checklist, setChecklist] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const fields = [
    { key: 'resume', label: 'Resume or reference letters' },
    { key: 'copy_of_id', label: 'Copy of ID / SS / Passport' },
    { key: 'license', label: 'Licenses or certifications' },
    { key: 'npi', label: 'NPI' },
    { key: 'ahca_check', label: 'AHCA background check (Level II)' },
    { key: 'w9', label: 'W-4 or W-9' },
    { key: 'i9', label: 'I-9 Form' },
    { key: 'application_form', label: 'Employment application' },
    { key: 'void_check', label: 'Void check or bank account info' }
  ]

  useEffect(() => {
    const fetchChecklist = async () => {
      const { data, error } = await supabase
        .from('onboarding_checklist')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      if (error) {
        console.error('Error fetching checklist:', error)
      } else {
        setChecklist(data || {})
      }

      setLoading(false)
    }

    fetchChecklist()
  }, [employeeId])

  const handleChange = (key: string) => {
    setChecklist((prev: any) => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleSave = async () => {
    const { error } = await supabase
      .from('onboarding_checklist')
      .upsert({ ...checklist, employee_id: employeeId }, { onConflict: ['employee_id'] })

    if (error) {
      alert('Error saving checklist')
    } else {
      alert('Checklist saved successfully ✅')
    }
  }

  if (loading) return <p className="p-4">Loading checklist...</p>

  return (
    <div className="section">
      <h2 className="heading">📋 HR Checklist</h2>

      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        {fields.map((item) => (
          <li
            key={item.key}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "0.75rem"
            }}
          >
            <input
              type="checkbox"
              checked={!!checklist[item.key]}
              onChange={() => handleChange(item.key)}
              disabled={!isEditable}
              style={{ marginRight: "0.75rem" }}
            />
            <label>{item.label}</label>
          </li>
        ))}
      </ul>

      {isEditable && (
        <button
          onClick={handleSave}
          className="primary"
          style={{ marginTop: "1rem" }}
        >
          Save checklist
        </button>
      )}
    </div>
  )
}