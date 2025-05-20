'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AdminUploadDocumentProps {
  employeeId: string
}

const documentTypes = [
  'id',
  'license',
  'certification',
  'w9',
  'direct_deposit',
  'insurance',
  'other'
]

export default function AdminUploadDocument({ employeeId }: AdminUploadDocumentProps) {
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState('')
  const [hasExpiration, setHasExpiration] = useState(false)
  const [expirationDate, setExpirationDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async () => {
    if (!file || !type) {
      setMessage('Debes seleccionar el tipo y archivo.')
      return
    }

    setUploading(true)
    setMessage('')

    const path = `employee-documents/${employeeId}/${type}-${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(path, file)

    if (uploadError) {
      setMessage('Error al subir archivo: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(path, 60 * 60 * 24 * 365)

    const fileUrl = urlData?.signedUrl

    if (!fileUrl) {
      setMessage('No se pudo obtener URL del archivo.')
      setUploading(false)
      return
    }

    const { error: dbError } = await supabase.from('employee_documents').insert({
      employee_id: employeeId,
      type,
      file_url: fileUrl,
      verified: true,
      expiration_date: hasExpiration ? expirationDate : null
    })

    if (dbError) {
      setMessage('Archivo subido, pero error al guardar en BD: ' + dbError.message)
    } else {
      setMessage('✅ Documento guardado correctamente.')
    }

    setUploading(false)
  }

  return (
    <div className="space-y-4 border p-4 rounded">
      <h2 className="font-bold">Subir documento para empleado</h2>

      <div>
        <label className="block font-medium mb-1">Tipo de documento</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full border px-3 py-2 rounded"
        >
          <option value="">Seleccionar tipo</option>
          {documentTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={hasExpiration}
          onChange={() => setHasExpiration(!hasExpiration)}
        />
        <label className="text-sm">¿Este documento tiene fecha de vencimiento?</label>
      </div>

      {hasExpiration && (
        <div>
          <label className="block text-sm mb-1">Fecha de vencimiento</label>
          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />
        </div>
      )}

      <div>
        <label className="block text-sm mb-1">Archivo</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full"
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {uploading ? 'Subiendo...' : 'Subir Documento'}
      </button>

      {message && <p className="text-sm mt-2 text-gray-700">{message}</p>}
    </div>
  )
}