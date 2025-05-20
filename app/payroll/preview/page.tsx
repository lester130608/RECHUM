'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Record = {
  name: string
  role: string
  week: string
  total: number
}

export default function PayrollPreviewPage() {
  const [data, setData] = useState<Record[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)

      const ba = await supabase
        .from('payroll_ba_raw')
        .select('name, total, week')
        .eq('payment_status', 'pending')

      const clinicians = await supabase
        .from('payroll_clinicians_raw')
        .select('name, week')
        .eq('payment_status', 'pending')

      const employee = await supabase
        .from('payroll_employee_raw')
        .select('name, total, week')
        .eq('payment_status', 'pending')

      const tcm = await supabase
        .from('payroll_tcm_raw')
        .select('name, total, week')
        .eq('payment_status', 'pending')

      const formatBa = ba.data?.map((item) => ({
        name: item.name,
        role: 'BA',
        week: item.week,
        total: item.total,
      })) || []

      const formatClinicians = clinicians.data?.map((item) => ({
        name: item.name,
        role: 'Clinician',
        week: item.week,
        total: 0,
      })) || []

      const formatEmployee = employee.data?.map((item) => ({
        name: item.name,
        role: 'Employee',
        week: item.week,
        total: item.total,
      })) || []

      const formatTCM = tcm.data?.map((item) => ({
        name: item.name,
        role: 'TCM',
        week: item.week,
        total: item.total,
      })) || []

      const all = [...formatBa, ...formatClinicians, ...formatEmployee, ...formatTCM]

      setData(all)
      setLoading(false)
    }

    fetchAll()
  }, [])

  const totalGeneral = data.reduce((sum, item) => sum + (item.total || 0), 0)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Preview Payroll</h1>

      {loading ? (
        <p>Cargando datos...</p>
      ) : data.length === 0 ? (
        <p>No hay registros pendientes.</p>
      ) : (
        <>
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Empleado</th>
                <th className="p-2 border">Rol</th>
                <th className="p-2 border">Semana</th>
                <th className="p-2 border text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td className="p-2 border">{row.name}</td>
                  <td className="p-2 border">{row.role}</td>
                  <td className="p-2 border">{row.week}</td>
                  <td className="p-2 border text-right">${row.total?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-semibold">
                <td className="p-2 border text-right" colSpan={3}>TOTAL GENERAL</td>
                <td className="p-2 border text-right">${totalGeneral.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="flex gap-4 mt-6">
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              onClick={async () => {
                const weekSet = new Set(data.map((row) => row.week))

                for (const table of [
                  'payroll_ba_raw',
                  'payroll_clinicians_raw',
                  'payroll_employee_raw',
                  'payroll_tcm_raw'
                ]) {
                  await supabase
                    .from(table)
                    .update({ payment_status: 'paid' })
                    .in('week', Array.from(weekSet))
                    .eq('payment_status', 'pending')
                }

                alert("✅ Payroll aprobado.")
                window.location.href = "/payroll"
              }}
            >
              ✅ Aprobar Payroll
            </button>

            <button
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded"
              onClick={() => window.location.href = "/payroll"}
            >
              ⬅️ Cancelar / Volver
            </button>
          </div>
        </>
      )}
    </div>
  )
}