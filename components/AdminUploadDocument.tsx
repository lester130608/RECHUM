'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSupabaseUser } from '@/hooks/useSupabaseUser'
import { logAction } from '@/lib/logAction'

interface UploadDocumentProps {
  employeeId: string
  type?: string
}

export default function AdminUploadDocument({ employeeId, type }: UploadDocumentProps) {
  const { user, loading } = useSupabaseUser();

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const safeType = type || 'document'

  const handleUpload = async () => {
    if (!file || !type || file.type !== "application/pdf") {
      setMessage('❌ Please select a valid PDF file and document type');
      return;
    }

    if (!user) {
      setMessage(loading ? '⏳ Loading session...' : '❌ Debes iniciar sesión con Supabase Auth');
      return;
    }

    setUploading(true)
    setMessage('')

    const filePath = `${employeeId}/${safeType}-${Date.now()}-${file.name}`
    let debugMessages: string[] = [];

    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(filePath, file)
    debugMessages.push(`[DEBUG] Upload: ${uploadError ? uploadError.message : 'OK'} | path: ${filePath}`);

    if (uploadError) {
      setMessage(`Error uploading file: ${uploadError.message}`)
      setUploading(false)
      setDebugLog(debugMessages);
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
    debugMessages.push(`[DEBUG] Insert: ${insertError ? insertError.message : 'OK'} | path: ${filePath}`);

    if (insertError) {
      setMessage(`Error saving document record: ${insertError.message}`);
      setUploading(false);
      setDebugLog(debugMessages);
      return;
    }

    setMessage('✅ File uploaded and registered successfully');
    setUploading(false);
    setDebugLog(debugMessages);
  }

  return (
    <div className="border p-4 rounded bg-gray-50 space-y-3 mb-4">
      {debugLog.length > 0 && (
        <div style={{background:'#e0e7ff', color:'#1e40af', padding:8, borderRadius:4, marginBottom:12, fontWeight:600}}>
          <div>[DEBUG] Resultados de upload/insert:</div>
          <ul style={{fontSize:'0.95em', marginTop:4}}>
            {debugLog.map((msg, idx) => <li key={idx}>{msg}</li>)}
          </ul>
        </div>
      )}
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