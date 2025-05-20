'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type ExpirationRecord = {
  employee_id: string
  full_name: string
  type: string
  expiration_date: string
}

export default function DashboardExpirations() {
  const [records, setRecords] = useState<ExpirationRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchExpiringDocs = async () => {
      const { data, error } = await supabase
        .rpc('get_expiring_documents') // esta función la crearemos luego
      if (!error && data) {
        setRecords(data)
      }
      setLoading(false)
    }

    fetchExpiringDocs()
  }, [])

  if (loading) return <p className="p-4">Loading upcoming expirations...</p>

  if (records.length === 0) {
    return <p className="p-4">✅ No upcoming expirations in the next 30 days.</p>
  }

  return (
    <div className="section">
      <h2 className="heading">📅 Upcoming Expirations</h2>
      <ul className="space-y-2 mt-2 text-sm">
        {records.map((item) => (
          <li key={`${item.employee_id}-${item.type}`}>
            <Link
              href={`/employees/edit/${item.employee_id}`}
              className="text-blue-600 underline"
            >
              {item.full_name}
            </Link>{' '}
            – {item.type.toUpperCase()} expires on{' '}
            <strong>{new Date(item.expiration_date).toLocaleDateString()}</strong>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <button
          onClick={() => window.location.href = "/dashboard/expirations"}
          className="text-blue-600 underline text-sm"
        >
          See all expirations →
        </button>
      </div>
    </div>
  )
}