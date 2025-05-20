'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { logAction } from '@/lib/logAction'

interface UploadDocumentProps {
  employeeId: string
  type: string // e.g., "license", "id", "w9"
}

export default function AdminUploadDocument({ employeeId, type }: UploadDocumentProps) {
  const { data: session } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setMessage('')

    const filePath = `employee-documents/${employeeId}/${type}-${Date.now()}-${file.name}`

    // Subir archivo al bucket
    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file)

    if (uploadError) {
      setMessage(`Error uploading file: ${uploadError.message}`)
      setUploading(false)
      return
    }

    // Crear URL firmada (válida por 1 año)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365)

    const fileUrl = urlData?.signedUrl

    if (!fileUrl || urlError) {
      setMessage('Error generating file URL')
      setUploading(false)
      return
    }

    // Guardar en tabla employee_documents
    const { error: dbError } = await supabase.from('employee_documents').insert({
      employee_id: employeeId,
      type,
      file_url: fileUrl,
      verified: false
    })

    if (dbError) {
      setMessage(`File uploaded, but database error: ${dbError.message}`)
    } else {
      setMessage('✅ File uploaded and saved successfully')

      // 🔐 Log the action
      await logAction({
        employeeId,
        action: `Uploaded ${type.toUpperCase()}`,
        by: session?.user?.email || 'unknown'
      })
    }

    setUploading(false)
  }

  return (
    <div className="space-y-2">
      <label className="block font-medium">Upload PDF for: {type.toUpperCase()}</label>
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        accept="application/pdf"
        className="border p-2 w-full"
      />
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>
      {message && <p className="text-sm mt-2 text-gray-700">{message}</p>}
    </div>
  )
}