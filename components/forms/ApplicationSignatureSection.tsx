'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function ApplicationSignatureSection({ employeeId }: Props) {
  const [signature, setSignature] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('employment_applications')
        .select('signature, signed_date')
        .eq('employee_id', employeeId)
        .single()

      if (data) {
        setSignature(data.signature || '')
        setSignedDate(data.signed_date || '')
        if (data.signature && data.signed_date) setLocked(true)
      }

      setLoading(false)
    }

    fetch()
  }, [employeeId])

  const handleSave = async () => {
    const today = new Date().toISOString().split('T')[0]

    const { error } = await supabase
      .from('employment_applications')
      .update({
        signature,
        signed_date: today
      })
      .eq('employee_id', employeeId)

    if (error) {
      alert('Error al guardar firma')
    } else {
      setSignedDate(today)
      setLocked(true)
      alert('✅ Expediente firmado correctamente')
    }
  }

  if (loading) return <p className="p-4">Cargando...</p>

  return (
    <div className="space-y-4 border p-4 rounded">
      <h2 className="text-xl font-semibold">✍️ Firma final del expediente</h2>

      <div>
        <label className="block mb-1">Firma (escriba su nombre completo)</label>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          disabled={locked}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div>
        <label className="block mb-1">Fecha</label>
        <input
          type="date"
          value={signedDate}
          onChange={() => {}}
          disabled
          className="w-full border px-3 py-2 rounded bg-gray-100"
        />
      </div>

      {!locked && (
        <button
          onClick={handleSave}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Finalizar expediente
        </button>
      )}

      {locked && (
        <p className="text-green-700 font-medium">
          ✅ Expediente firmado el {signedDate}
        </p>
      )}
    </div>
  )
}