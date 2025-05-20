'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function PersonnelHandbookAcknowledgementForm({ employeeId }: Props) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase
        .from('personnel_handbook_ack')
        .select('acknowledged')
        .eq('employee_id', employeeId)
        .single()

      if (data?.acknowledged) setAcknowledged(true)
      setLoading(false)
    }

    fetchStatus()
  }, [employeeId])

  const handleAcknowledge = async () => {
    const { error } = await supabase
      .from('personnel_handbook_ack')
      .upsert(
        {
          employee_id: employeeId,
          acknowledged: true,
        },
        { onConflict: ['employee_id'] }
      )

    if (error) {
      alert('Error saving confirmation')
    } else {
      setAcknowledged(true)
      alert('✅ Acknowledgement successfully recorded')
    }
  }

  if (loading) return <p className="p-4">Loading acknowledgement...</p>

  return (
    <div className="section">
      <h2 className="heading">📘 Employee Handbook Acknowledgement</h2>

      <p style={{ fontSize: "0.875rem", color: "#374151" }}>
        I confirm that I have received, read, and understood the DTT Coaching Services Employee Handbook.
        I understand that my employment is “at will” and that I must follow the policies, practices,
        and procedures outlined, including those related to privacy (HIPAA), professional ethics,
        and workplace conduct. I understand these documents have legal significance and that violations
        may lead to disciplinary actions.
      </p>

      {!acknowledged && (
        <button
          onClick={handleAcknowledge}
          className="primary"
          style={{ marginTop: "1rem" }}
        >
          I Acknowledge
        </button>
      )}

      {acknowledged && (
        <p style={{ marginTop: "1rem", color: "#15803d", fontWeight: 500 }}>
          ✅ Acknowledgement recorded
        </p>
      )}
    </div>
  )
}