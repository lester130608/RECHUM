'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function SupabaseLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage('❌ ' + error.message)
    } else {
      setMessage('✅ Login successful')
      window.location.reload()
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-3">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="border px-3 py-2 rounded w-full"
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="border px-3 py-2 rounded w-full"
        required
      />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded w-full"
      >
        Login
      </button>
      {message && <p className="text-sm mt-1">{message}</p>}
    </form>
  )
}