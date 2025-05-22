'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
    })

    if (result?.error) {
      alert('Login failed. Please check your credentials.')
      setLoading(false)
      return
    }

    await new Promise((res) => setTimeout(res, 300))

    const sessionRes = await fetch('/api/auth/session')
    const session = await sessionRes.json()

    const role = session?.user?.role

    if (role === 'admin') {
      window.location.href = '/dashboard'
    } else if (role === 'employee') {
      window.location.href = '/employees/my'
    } else {
      alert('Unknown role. Please contact the administrator.')
      setLoading(false)
    }
  }

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

        <p className="text-xs text-center text-gray-400 mt-6">
          © 2025 DTT Coaching Services, LLC.
        </p>
      </div>
    </div>
  )
}