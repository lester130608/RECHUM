'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    setMessage('')

    const password = generatePassword()

    const { error: userError } = await supabase.from('users').insert({
      email,
      password,
      role: 'hr-supervisor',
      name: 'Pending'
    })

    if (userError) {
      setMessage('❌ Error creating user: ' + userError.message)
      setLoading(false)
      return
    }

    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    setMessage('✅ User created and email sent to: ' + email)
    setEmail('')
    setLoading(false)
  }

  return (
    <div className="container">
      <h1 className="heading">Create HR Supervisor</h1>

      <div className="form-row">
        <label>Email for new HR Supervisor</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />
      </div>

      <button
        className="primary"
        onClick={handleCreate}
        disabled={loading || !email}
      >
        {loading ? 'Creating...' : 'Create HR Supervisor'}
      </button>

      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
    </div>
  )
}