'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [debug, setDebug] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setDebug(null)
    console.log('SUBMIT', email, password)

    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.log('LOGIN ERROR:', error)
      setDebug(`LOGIN ERROR: ${JSON.stringify(error)}`)
      alert('Login failed. Please check your credentials.')
      setLoading(false)
      return
    }

    setDebug(`LOGIN OK: ${JSON.stringify(data)}`)

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('email', email.toLowerCase())
      .single()

    console.log('DEBUG userRow:', userRow, 'role:', userRow?.role, 'email:', email, 'userError:', userError)
    setDebug(prev => (prev || '') + `\nuserRow: ${JSON.stringify(userRow)}, userError: ${JSON.stringify(userError)}`)

    const role = userRow?.role

    if (role === 'admin') {
      window.location.href = '/dashboard'
    } else {
      alert('Access denied. Only admins can access esta sección.')
    }
    setLoading(false)
  }

  console.log('Login component rendered')

  return (
    <div className="login-wrapper">
      <div className="login-box">
        <div className="login-header">
          <img src="/logo.png" alt="Logo" className="logo" />
          <h1 className="heading">
            DTT Coaching Services, LLC{' '}
            <span style={{ color: '#ef4444' }}>Payroll</span>
          </h1>
          <p className="text-sm">Sign In</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Signing in...' : 'LOGIN'}
          </button>

          <div className="flex justify-between text-sm text-gray-600">
            <label>
              <input type="checkbox" style={{ marginRight: '0.5rem' }} />
              Remember me
            </label>
            <a
              href="#"
              style={{ color: '#2563eb', textDecoration: 'underline' }}
            >
              Forgot Password?
            </a>
          </div>
        </form>
        {debug && (
          <pre style={{ background: '#eee', color: '#b91c1c', padding: 12, marginTop: 16, fontSize: 12 }}>
            {debug}
          </pre>
        )}

        <p className="text-xs text-center text-gray-400 mt-6">
          © 2025 DTT Coaching Services, LLC.
        </p>
      </div>
    </div>
  )
}