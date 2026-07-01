'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
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

      <div style={{ background: "#fffbe6", border: "1px solid #f59e42", borderRadius: 8, padding: 16, marginTop: 24 }}>
        <h3 style={{ color: "#b45309", marginBottom: 12 }}>⚠️ Documentos próximos a vencer o vencidos</h3>
        {records.length === 0 && <div>No hay documentos próximos a vencer.</div>}
        <ul>
          {records.map(doc => (
            <li key={doc.employee_id} style={{ marginBottom: 8 }}>
              <b>{doc.full_name}</b> — <b>{doc.type}</b> vence el <b>{doc.expiration_date ? new Date(doc.expiration_date).toLocaleDateString() : "Sin fecha"}</b>
              {new Date(doc.expiration_date) < new Date() && <span style={{ color: "red", marginLeft: 8 }}>(¡VENCIDO!)</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}