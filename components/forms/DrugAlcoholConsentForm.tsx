'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function DrugAlcoholConsentForm({ employeeId }: Props) {
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('drug_alcohol_consent')
        .select('accepted')
        .eq('employee_id', employeeId)
        .single()

      if (data?.accepted) setAccepted(true)
      setLoading(false)
    }

    fetchStatus()
  }, [employeeId])

  const handleAccept = async () => {
    const { error } = await supabase
      .from('drug_alcohol_consent')
      .upsert(
        {
          employee_id: employeeId,
          accepted: true,
        },
        { onConflict: ['employee_id'] }
      )

    if (error) {
      alert('Error saving acceptance')
    } else {
      setAccepted(true)
      alert('✅ Consent successfully registered')
    }
  }

  if (loading) return <p className="p-4">Loading consent...</p>

  return (
    <div className="section">
      <h2 className="heading">🧪 Drug and Alcohol Testing Consent</h2>

      <p style={{ fontSize: "0.875rem", color: "#374151" }}>
        I authorize DTT Coaching Services to conduct drug and alcohol screening
        as part of the hiring process or during my employment. I understand that the
        results may be shared with the company, and that refusal to participate
        may affect my eligibility or continued employment. I also release the company
        and the laboratories involved from any liability related to this practice.
      </p>

      {!accepted && (
        <button
          onClick={handleAccept}
          className="primary"
          style={{ marginTop: "1rem" }}
        >
          I Accept
        </button>
      )}

      {accepted && (
        <p style={{ marginTop: "1rem", color: "#15803d", fontWeight: 500 }}>
          ✅ Consent recorded
        </p>
      )}
    </div>
  )
}