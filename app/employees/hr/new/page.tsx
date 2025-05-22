'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('')
}

export default function NewEmployeePage() {
  const [email, setEmail] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatusMessage('')
    setGeneratedPassword('')

    const password = generatePassword()
    setGeneratedPassword(password)

    const { error: userError } = await supabase.from('users').insert({
      email,
      password,
      role: 'employee',
      name: 'New Employee'
    })

    if (userError) {
      setStatusMessage('❌ Error creating user: ' + userError.message)
      setLoading(false)
      return
    }

    const { error: empError } = await supabase.from('employees').insert({
      email,
      first_name: 'Pending',
      last_name: 'Pending',
      role: 'employee',
      employee_type: 'employee',
      status: 'active',
      ready_for_payroll: false,
      created_at: new Date().toISOString(),
    })

    if (empError) {
      setStatusMessage('⚠️ User created, but error creating employee: ' + empError.message)
    } else {
      setStatusMessage('✅ Employee created successfully')
    }

    setLoading(false)
  }

  return (
    <div className="container">
      <h1 className="heading">Create New Employee</h1>

      <form onSubmit={handleCreate} className="section form-row">
        <label>Email</label>
        <input
          type="email"
          placeholder="employee@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Employee'}
        </button>

        {statusMessage && <p style={{ fontWeight: 500 }}>{statusMessage}</p>}

        {generatedPassword && (
          <>
            <p style={{ color: '#2563eb' }}>
              Temporary Password: <strong>{generatedPassword}</strong>
            </p>
            <div style={{ marginTop: "1rem", display: "flex", gap: "1rem" }}>
              <button
                onClick={() => window.location.reload()}
                className="primary"
              >
                Create Another
              </button>
              <button
                onClick={() => window.location.href = "/dashboard"}
                style={{
                  backgroundColor: "#6b7280",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}