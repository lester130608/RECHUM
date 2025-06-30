'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSupabaseUser } from '@/hooks/useSupabaseUser'
import { logAction } from '@/lib/logAction'

interface UploadDocumentProps {
  employeeId: string
  type?: string
}

export default function AdminUploadDocument({ employeeId, type }: UploadDocumentProps) {
  const user = useSupabaseUser();

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const safeType = type || 'document'

  const handleUpload = async () => {
    if (!file || !type || file.type !== "application/pdf") {
      setMessage('❌ Please select a valid PDF file and document type');
      return;
    }

    if (!user) {
      setMessage('❌ Debes iniciar sesión con Supabase Auth');
      return;
    }

    setUploading(true)
    setMessage('')

    const filePath = `${employeeId}/${safeType}-${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file)

    if (uploadError) {
      setMessage(`Error uploading file: ${uploadError.message}`)
      setUploading(false)
      return
    }

    // Nuevo: insertar registro en la tabla employee_documents
    const { data: insertData, error: insertError } = await supabase
      .from('employee_documents')
      .insert([{
        employee_id: employeeId,
        type: safeType,
        file_url: filePath,
        upload_date: new Date().toISOString(),
        verified: false
      }]);

    if (insertError) {
      setMessage(`Error saving document record: ${insertError.message}`);
      setUploading(false);
      return;
    }

    setMessage('✅ File uploaded and registered successfully');
    setUploading(false);
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