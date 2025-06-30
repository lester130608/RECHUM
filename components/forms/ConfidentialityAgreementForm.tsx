'use client'

import { useEffect, useState } from 'react'
// import { useSession } from 'next-auth/react' // Eliminado: migración a Supabase Auth
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function ConfidentialityAgreementForm({ employeeId }: Props) {
  const { data: session } = useSession()
  const [signature, setSignature] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('confidentiality_agreements')
        .select('signature, signed_date')
        .eq('employee_id', employeeId)
        .single()

      if (data) {
        setSignature(data.signature || '')
        setSignedDate(data.signed_date || '')
        if (data.signature && data.signed_date) setLocked(true)
      }

      setLoading(false)
    }

    fetch()
  }, [employeeId])

  const handleSave = async () => {
    const today = new Date().toISOString().split('T')[0]

    const { error } = await supabase
      .from('confidentiality_agreements')
      .upsert({
        employee_id: employeeId,
        signature,
        signed_date: today,
      }, { onConflict: ['employee_id'] })

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setSignedDate(today)
      setLocked(true)
      alert('✅ Confidentiality agreement signed successfully.')
    }
  }

  if (loading) return <p className="p-4">Loading agreement...</p>

  return (
    <div className="section">
      <h2 className="heading">📄 Confidentiality Agreement</h2>

      <p style={{ fontSize: "0.875rem", color: "#374151" }}>
        I hereby agree not to disclose any confidential information regarding patients, users,
        or employees of DTT Coaching Services. I understand that any violation may result in
        disciplinary actions and/or legal consequences. I agree to comply with all privacy
        policies and applicable regulations, including HIPAA.
      </p>

      <div className="form-row">
        <label>Employee Signature (Full Name)</label>
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
          Sign Agreement
        </button>
      )}
    </div>
  )
}