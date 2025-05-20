'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminUploadDocument from './AdminUploadDocument'

interface Props {
  employeeId: string
}

const requiredTypes = [
  'id',
  'w9',
  'license',
  'i9',
  'void_check',
  'resume',
  'background_check',
  'certification'
]

type DocumentRecord = {
  type: string
  file_url: string
}

export default function EmployeeDocumentsStatus({ employeeId }: Props) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from('employee_documents')
        .select('type, file_url')
        .eq('employee_id', employeeId)

      if (!error && data) {
        setDocuments(data)
      }

      setLoading(false)
    }

    fetchDocs()
  }, [employeeId])

  const uploadedTypes = documents.map(doc => doc.type)
  const missingTypes = requiredTypes.filter(type => !uploadedTypes.includes(type))

  if (loading) return <p className="p-4">Loading documents...</p>

  return (
    <div className="section space-y-4">
      <h2 className="heading">📄 Scanned Documents</h2>

      <div>
        <h3 className="font-semibold mb-2">Uploaded Documents</h3>
        <ul className="list-disc pl-6 space-y-1">
          {documents.length === 0 ? (
            <li>No documents uploaded yet.</li>
          ) : (
            documents.map((doc) => (
              <li key={doc.type}>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {doc.type.replace('_', ' ').toUpperCase()}
                </a>
              </li>
            ))
          )}
        </ul>
      </div>

      {missingTypes.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Missing Documents</h3>
          {missingTypes.map((type) => (
            <div key={type} className="mb-4">
              <AdminUploadDocument employeeId={employeeId} type={type} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}