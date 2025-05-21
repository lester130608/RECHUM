'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { logAction } from '@/lib/logAction'

interface UploadDocumentProps {
  employeeId: string
  type?: string
}

export default function AdminUploadDocument({ employeeId, type }: UploadDocumentProps) {
  const { data: session } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const safeType = type || 'document'

  const handleUpload = async () => {
    if (!file || !type) {
      setMessage('❌ Missing file or document type')
      return
    }

    setUploading(true)
    setMessage('')

    const filePath = `employee-documents/${employeeId}/${safeType}-${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file)

    if (uploadError) {
      setMessage(`Error uploading file: ${uploadError.message}`)
      setUploading(false)
      return
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365)

    const fileUrl = urlData?.signedUrl

    if (!fileUrl || urlError) {
      setMessage('Error generating file URL')
      setUploading(false)
      return
    }

    const { error: dbError } = await supabase.from('employee_documents').insert({
      employee_id: employeeId,
      type: safeType,
      file_url: fileUrl,
      verified: false
    })

    if (dbError) {
      setMessage(`File uploaded, but database error: ${dbError.message}`)
    } else {
      setMessage('✅ File uploaded and saved successfully')
      await logAction({
        employeeId,
        action: `Uploaded ${safeType.toUpperCase()}`,
        by: session?.user?.email || 'unknown'
      })
    }

    setUploading(false)
  }

  return (
    <div className="border p-4 rounded bg-gray-50 space-y-3 mb-4">
      <label className="block font-medium text-sm text-gray-700">
        Upload PDF for: <strong>{safeType.toUpperCase()}</strong>
      </label>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        accept="application/pdf"
        className="block w-full border px-3 py-2 rounded"
      />

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      {message && (
        <p className="text-sm mt-1 text-gray-700">{message}</p>
      )}
    </div>
  )
}