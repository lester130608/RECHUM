'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function CreateAdminPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setStatus('')

    // Solo guarda email y rol. No guardes password ni name aquí.
    const { error } = await supabase.from('users').insert({
      email,
      role: 'admin'
    })

    if (error) {
      setStatus('❌ Error: ' + error.message)
    } else {
      setStatus('✅ Admin created successfully')
    }

    setLoading(false)
  }

  return (
    <div className="container">
      <h1 className="heading">Create New Admin</h1>

      <form onSubmit={handleCreate} className="section" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label>Email</label>
        <input
          type="email"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Admin'}
        </button>

        {status && <p style={{ marginTop: '1rem', fontWeight: 500 }}>{status}</p>}

        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={() => window.location.href = "/dashboard"}
            className="small"
          >
            Back to Dashboard
          </button>
        </div>
      </form>
    </div>
  )
}