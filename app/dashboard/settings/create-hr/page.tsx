'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length)
    result += charset[randomIndex]
  }
  return result
}

export default function CreateHRPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatusMessage('')

    const generatedPassword = generatePassword()
    setPassword(generatedPassword)

    const { error } = await supabase.from('users').insert({
      email,
      password: generatedPassword,
      role: 'hr-supervisor',
      name: 'HR User'
    })

    if (error) {
      setStatusMessage('❌ Error creating HR user: ' + error.message)
    } else {
      setStatusMessage('✅ HR user created successfully')
    }

    setLoading(false)
  }

  return (
    <div className="container">
      <h1 className="heading">Create HR Supervisor</h1>

      <form onSubmit={handleCreate} className="section" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label>Email</label>
        <input
          type="email"
          placeholder="hr@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create HR'}
        </button>

        {statusMessage && <p style={{ fontWeight: 500 }}>{statusMessage}</p>}
        {password && (
          <p style={{ color: '#2563eb', fontWeight: 500 }}>
            Temporary Password: <strong>{password}</strong>
          </p>
        )}
      </form>

      <button
        onClick={() => window.location.href = "/dashboard"}
        className="small"
        style={{ marginTop: "1rem" }}
      >
        Back to Dashboard
      </button>
    </div>
  )
}