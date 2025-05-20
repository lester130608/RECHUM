'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function SecurityAgreementForm({ employeeId }: Props) {
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('security_agreements')
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
      .from('security_agreements')
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
      alert('✅ Security agreement accepted')
    }
  }

  if (loading) return <p className="p-4">Loading agreement...</p>

  return (
    <div className="section">
      <h2 className="heading">🔐 Information Security Agreement</h2>

      <ul style={{ paddingLeft: "1.25rem", fontSize: "0.875rem", color: "#374151" }}>
        <li>I will not share passwords or system access credentials.</li>
        <li>I will not access information without proper authorization.</li>
        <li>I will comply with state and federal laws regarding information security.</li>
        <li>I will protect all confidential information related to employees or clients.</li>
        <li>I understand that providing my SSN is optional but may be required to generate credentials.</li>
      </ul>

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
          ✅ You have accepted this agreement
        </p>
      )}
    </div>
  )
}