'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function AgreementForProfessionalServicesForm({ employeeId }: Props) {
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [rate, setRate] = useState('')
  const [signature, setSignature] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data: employee } = await supabase
        .from('employees')
        .select('first_name, last_name, role, rate')
        .eq('id', employeeId)
        .single()

      if (employee) {
        setFullName(`${employee.first_name} ${employee.last_name}`)
        setRole(employee.role || '')
        setRate(employee.rate || '')
      }

      const { data: agreement } = await supabase
        .from('professional_agreements')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      if (agreement) {
        setSignature(agreement.signature || '')
        setSignedDate(agreement.signed_date || '')
        setRate(agreement.rate || rate)
        if (agreement.signature && agreement.signed_date) setLocked(true)
      }

      setLoading(false)
    }

    fetch()
  }, [employeeId])

  const handleSave = async () => {
    const today = new Date().toISOString().split('T')[0]

    const { error } = await supabase
      .from('professional_agreements')
      .upsert({
        employee_id: employeeId,
        rate,
        signature,
        signed_date: today,
      }, { onConflict: ['employee_id'] })

    if (error) {
      alert('Error saving agreement: ' + error.message)
    } else {
      setSignedDate(today)
      setLocked(true)
      alert('✅ Agreement signed successfully')
    }
  }

  if (loading) return <p className="p-4">Loading agreement...</p>

  return (
    <div className="section">
      <h2 className="heading">📄 Professional Services Agreement</h2>

      <p style={{ fontSize: "0.875rem", color: "#374151" }}>
        This agreement outlines the terms under which the contractor <strong>{fullName}</strong>
        will provide professional services in the role of <strong>{role}</strong> for
        DTT Coaching Services, LLC. Compensation will be based on the agreed hourly rate.
      </p>

      <div className="form-row">
        <label>Hourly Rate ($)</label>
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={locked}
        />
      </div>

      <div className="form-row">
        <label>Signature (Full Name)</label>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          disabled={locked}
        />
      </div>

      {locked && signedDate && (
        <p style={{ marginTop: "1rem", color: "#15803d", fontWeight: 500 }}>
          ✅ Signed on {signedDate}
        </p>
      )}

      {!locked && (
        <button
          onClick={handleSave}
          className="primary"
          style={{ marginTop: "1rem" }}
        >
          Confirm and Sign Agreement
        </button>
      )}
    </div>
  )
}