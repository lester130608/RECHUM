'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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
  const [errorMessage, setErrorMessage] = useState('')
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('upload_date', { ascending: false })

    if (data) setDocuments(data)
    if (error) {
      console.error('Error al obtener documentos:', error)
      setErrorMessage('No se pudieron cargar los documentos.')
    }
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const verifyDocument = async (id: string) => {
    setVerifyingId(id)
    setErrorMessage('')

    const { error } = await supabase
      .from('employee_documents')
      .update({ verified: true })
      .eq('id', id)

    if (error) {
      console.error('Error al verificar documento:', error)
      setErrorMessage('No se pudo verificar el documento.')
    } else {
      await fetchDocuments()
    }
    setVerifyingId(null)
  }

  const getDocumentUrl = (fileUrl: string) => {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl

    const { data } = supabase.storage
      .from('employee-documents')
      .getPublicUrl(fileUrl)

    return data.publicUrl
  }

  if (loading) return <p>Cargando documentos...</p>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Revisión de documentos</h2>
      {errorMessage && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
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
                  href={getDocumentUrl(doc.file_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Ver archivo
                </a>
                {!doc.verified && (
                  <button
                    onClick={() => verifyDocument(doc.id)}
                    disabled={verifyingId === doc.id}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm"
                  >
                    {verifyingId === doc.id ? 'Verificando...' : 'Verificar'}
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
