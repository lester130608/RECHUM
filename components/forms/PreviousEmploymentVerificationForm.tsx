'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function PreviousEmploymentVerificationForm({ employeeId }: Props) {
  const [form, setForm] = useState({
    previous_employer: '',
    position_held: '',
    employment_start: '',
    employment_end: '',
    authorize_contact: false,
    signature: '',
    signed_date: '',
  })

  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('employment_verification')
        .select('*')
        .eq('employee_id', employeeId)
        .single()

      if (data) {
        setForm(data)
        if (data.signature && data.signed_date) setLocked(true)
      }

      setLoading(false)
    }

    fetchData()
  }, [employeeId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSave = async () => {
    const { error } = await supabase
      .from('employment_verification')
      .upsert({ ...form, employee_id: employeeId }, { onConflict: ['employee_id'] })

    if (error) {
      alert('Error saving form: ' + error.message)
    } else {
      alert('Form submitted successfully ✅')
      setLocked(true)
    }
  }

  if (loading) return <p className="p-4">Loading form...</p>

  return (
    <div className="section">
      <h2 className="heading">📄 Previous Employment Verification</h2>

      <div className="form-row">
        <label>Previous Employer Name</label>
        <input
          type="text"
          name="previous_employer"
          value={form.previous_employer}
          onChange={handleChange}
          disabled={locked}
        />
      </div>

      <div className="form-row">
        <label>Position Held</label>
        <input
          type="text"
          name="position_held"
          value={form.position_held}
          onChange={handleChange}
          disabled={locked}
        />
      </div>

      <div className="form-row" style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <label>Start Date</label>
          <input
            type="date"
            name="employment_start"
            value={form.employment_start}
            onChange={handleChange}
            disabled={locked}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label>End Date</label>
          <input
            type="date"
            name="employment_end"
            value={form.employment_end}
            onChange={handleChange}
            disabled={locked}
          />
        </div>
      </div>

      <div className="form-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="checkbox"
          name="authorize_contact"
          checked={form.authorize_contact}
          onChange={handleChange}
          disabled={locked}
        />
        <label>I authorize DTT to contact this previous employer</label>
      </div>

      <div className="form-row">
        <label>Signature (Full Name)</label>
        <input
          type="text"
          name="signature"
          value={form.signature}
          onChange={handleChange}
          disabled={locked}
        />
      </div>

      <div className="form-row">
        <label>Date</label>
        <input
          type="date"
          name="signed_date"
          value={form.signed_date}
          onChange={handleChange}
          disabled={locked}
        />
      </div>

      {!locked && (
        <button
          onClick={handleSave}
          className="primary"
          style={{ marginTop: "1rem" }}
        >
          Submit and Sign
        </button>
      )}

      {locked && (
        <p style={{ marginTop: "1rem", color: "#15803d", fontWeight: 500 }}>
          ✅ Form signed on {form.signed_date}
        </p>
      )}
    </div>
  )
}