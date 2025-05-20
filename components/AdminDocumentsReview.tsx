'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AdminDocumentsReviewProps {
  employeeId: string
}

interface DocumentRecord {
  id: string
  type: string
  file_url: string
  verified: boolean
  upload_date: string
}

export default function AdminDocumentsReview({ employeeId }: AdminDocumentsReviewProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('upload_date', { ascending: false })

    if (data) setDocuments(data)
    if (error) console.error('Error al obtener documentos:', error)
    setLoading(false)
  }

  useEffect(() => {
    fetchDocuments()
  }, [employeeId])

  const verifyDocument = async (id: string) => {
    const { error } = await supabase
      .from('employee_documents')
      .update({ verified: true })
      .eq('id', id)

    if (error) {
      console.error('Error al verificar documento:', error)
    } else {
      await fetchDocuments()
    }
  }

  if (loading) return <p>Cargando documentos...</p>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Revisión de documentos</h2>
      {documents.length === 0 ? (
        <p>No hay documentos cargados.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex justify-between items-center border p-2 rounded">
              <div>
                <p className="font-medium">{doc.type}</p>
                <p className="text-sm text-gray-500">{new Date(doc.upload_date).toLocaleString()}</p>
                <p className={`text-sm ${doc.verified ? 'text-green-600' : 'text-red-600'}`}>
                  {doc.verified ? '✅ Verificado' : '⛔ No verificado'}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Ver archivo
                </a>
                {!doc.verified && (
                  <button
                    onClick={() => verifyDocument(doc.id)}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Verificar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}