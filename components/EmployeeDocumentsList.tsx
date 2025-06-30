'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface EmployeeDocumentsListProps {
  employeeId: string
}

interface DocumentRecord {
  id: string
  type: string
  file_url: string
  verified: boolean
  upload_date: string
}

export default function EmployeeDocumentsList({ employeeId }: EmployeeDocumentsListProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDocuments = async () => {
      const { data, error } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('employee_id', employeeId)
        .order('upload_date', { ascending: false })

      if (data) setDocuments(data)
      if (error) console.error('Error fetching documents:', error)
      setLoading(false)
    }

    fetchDocuments()
  }, [employeeId])

  if (loading) return <p className="p-4">Loading documents...</p>

  return (
    <div className="section">
      <h2 className="heading">Uploaded Documents</h2>

      {documents.length === 0 ? (
        <p>No documents have been uploaded yet.</p>
      ) : (
        <ul style={{ listStyle: "none", paddingLeft: 0 }}>
          {documents.map((doc) => (
            <li
              key={doc.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem",
                border: "1px solid #e5e7eb",
                borderRadius: "0.375rem",
                marginBottom: "0.5rem"
              }}
            >
              <div>
                <p style={{ fontWeight: 500 }}>{doc.type}</p>
                <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  {new Date(doc.upload_date).toLocaleString()}
                </p>
              </div>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#2563eb", textDecoration: "underline", fontSize: "0.875rem" }}
              >
                View File
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}