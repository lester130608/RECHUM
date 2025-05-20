'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import dayjs from 'dayjs'

interface DocumentSummary {
  id: string
  employee_id: string
  type: string
  file_url: string
  expiration_date: string | null
  full_name: string
  email: string
}

export default function ExpiringDocumentsSummary() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchExpiringDocs = async () => {
      const today = dayjs().format('YYYY-MM-DD')
      const in30Days = dayjs().add(30, 'day').format('YYYY-MM-DD')

      const { data, error } = await supabase
        .from('employee_documents')
        .select(`
          id,
          employee_id,
          type,
          file_url,
          expiration_date,
          employees (
            full_name,
            email
          )
        `)
        .gt('expiration_date', today)
        .lte('expiration_date', in30Days)

      if (error) {
        console.error('Error al cargar documentos:', error)
      } else if (data) {
        setDocuments(data as DocumentSummary[])
      }

      setLoading(false)
    }

    fetchExpiringDocs()
  }, [])

  if (loading) return <p className="p-4">Cargando vencimientos...</p>

  if (documents.length === 0) {
    return <p className="p-4">No hay documentos por vencer en los próximos 30 días.</p>
  }

  return (
    <div className="p-4 border rounded space-y-4">
      <h2 className="text-lg font-bold">📆 Documentos por vencer (próximos 30 días)</h2>
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="border-b py-2">
            <p><strong>{doc.type}</strong> - vence el <strong>{dayjs(doc.expiration_date).format('DD/MM/YYYY')}</strong></p>
            <p>{doc.employees?.full_name} ({doc.employees?.email})</p>
            <a href={doc.file_url} target="_blank" className="text-blue-600 underline">Ver archivo</a>
          </li>
        ))}
      </ul>
    </div>
  )
}