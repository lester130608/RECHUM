'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UploadDocumentProps {
  employeeId: string
  type: string // e.g., "license", "id", "w9"
}

export default function UploadDocument({ employeeId, type }: UploadDocumentProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setMessage('')

    const filePath = `employee-documents/${employeeId}/${type}-${Date.now()}-${file.name}`

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file)

    if (uploadError) {
      setMessage(`Error uploading file: ${uploadError.message}`)
      setUploading(false)
      return
    }

    // Create signed URL (valid for 1 year)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365)

    const fileUrl = urlData?.signedUrl

    if (!fileUrl || urlError) {
      setMessage('Error generating file URL')
      setUploading(false)
      return
    }

    // Save record in employee_documents table
    const { error: dbError } = await supabase.from('employee_documents').insert({
      employee_id: employeeId,
      type,
      file_url: fileUrl,
      verified: false
    })

    if (dbError) {
      setMessage(`File uploaded, but database error: ${dbError.message}`)
    } else {
      setMessage('File uploaded and saved successfully ✅')
    }

    setUploading(false)
  }

  return (
    <div className="section">
      <div className="form-row">
        <label htmlFor={`upload-${type}`}>Upload document for: <strong>{type}</strong></label>
        <input
          id={`upload-${type}`}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="primary"
        style={{ marginTop: "1rem" }}
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      {message && (
        <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#374151" }}>
          {message}
        </p>
      )}
    </div>
  )
}