'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  employeeId: string
}

export default function ApplicationSignatureSection({ employeeId }: Props) {
  const [signature, setSignature] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)

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
    const { error } = await supabase
      .from('employment_applications')
      .update({
        signature,
        signed_date: signedDate,
      })
      .eq('employee_id', employeeId)

    if (error) {
      alert('Error al guardar firma')
    } else {
      alert('✅ Documento firmado correctamente')
      setLocked(true)
    }
  }

  if (loading) return <p className="p-4">Cargando...</p>

  return (
    <div className="section">
      <h2 className="heading">✍️ Firma del empleado</h2>

      <div className="form-row">
        <label htmlFor="signature">Firma (escriba su nombre completo)</label>
        <input
          id="signature"
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          disabled={locked}
        />
      </div>

      <div className="form-row">
        <label htmlFor="signedDate">Fecha</label>
        <input
          id="signedDate"
          type="date"
          value={signedDate}
          onChange={(e) => setSignedDate(e.target.value)}
          disabled={locked}
        />
      </div>

      {!locked && (
        <button
          onClick={handleSave}
          className="primary"
          style={{ marginTop: '1rem' }}
        >
          Finalizar y firmar
        </button>
      )}

      {locked && (
        <p style={{ marginTop: '1rem', color: '#15803d', fontWeight: 500 }}>
          ✅ Documento firmado el {signedDate}
        </p>
      )}
    </div>
  )
}