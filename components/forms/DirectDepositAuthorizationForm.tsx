'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function DirectDepositAuthorizationForm({ employeeId }: Props) {
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('direct_deposit_authorizations')
        .select('authorized')
        .eq('employee_id', employeeId)
        .single()

      if (data?.authorized) setAuthorized(true)
      setLoading(false)
    }

    fetch()
  }, [employeeId])

  const handleAuthorize = async () => {
    const { error } = await supabase
      .from('direct_deposit_authorizations')
      .upsert(
        { employee_id: employeeId, authorized: true },
        { onConflict: ['employee_id'] }
      )

    if (error) {
      alert('Error saving authorization')
    } else {
      setAuthorized(true)
      alert('✅ Authorization successfully recorded')
    }
  }

  if (loading) return <p className="p-4">Loading authorization...</p>

  return (
    <div className="section">
      <h2 className="heading">🏦 Direct Deposit Authorization</h2>

      <p style={{ fontSize: "0.875rem", color: "#374151" }}>
        I authorize DTT Coaching Services to deposit my payments directly into the
        bank account provided via voided check. I understand that I may revoke
        this authorization at any time by submitting a written notice.
      </p>

      {!authorized ? (
        <button
          onClick={handleAuthorize}
          className="primary"
          style={{ marginTop: "1rem" }}
        >
          I Authorize Direct Deposit
        </button>
      ) : (
        <p style={{ marginTop: "1rem", color: "#15803d", fontWeight: 500 }}>
          ✅ Authorization recorded
        </p>
      )}
    </div>
  )
}