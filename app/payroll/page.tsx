'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PayrollCard, PayrollGraph, PayrollTable } from '@/components/Payroll'

export default function PayrollPage() {
  const router = useRouter()

  const upcomingPayroll = {
    type: 'Regular',
    nextCheck: '04/04/2025',
    period: '03/08/2025 → 03/21/2025',
    schedule: 'Biweekly',
  }

  const history = [
    { date: '01/24/2025', amount: 118339.96, period: '12/28/2024 → 01/10/2025' },
    { date: '02/07/2025', amount: 124993.35, period: '01/11/2025 → 01/24/2025' },
    { date: '02/21/2025', amount: 140103.3, period: '01/25/2025 → 02/07/2025' },
    { date: '03/07/2025', amount: 123893.14, period: '02/08/2025 → 02/21/2025' },
    { date: '03/21/2025', amount: 137540.79, period: '02/22/2025 → 03/07/2025' },
  ]

  const handleExtractTCM = async () => {
    const res = await fetch('/api/payroll/tcm/extract')
    const result = await res.json()
    alert(result.message || '✅ Extracción completada')
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Payroll</h1>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/payroll/ba/import">
          <div className="bg-white border hover:shadow p-4 rounded-xl cursor-pointer">
            <h2 className="font-semibold text-sm">📥 Importar BA</h2>
            <p className="text-xs text-gray-500">Subir tabla de payroll para BA</p>
          </div>
        </Link>

        <Link href="/payroll/clinicians/import">
          <div className="bg-white border hover:shadow p-4 rounded-xl cursor-pointer">
            <h2 className="font-semibold text-sm">📥 Importar Clinicians</h2>
            <p className="text-xs text-gray-500">Subir tabla de producción de Clinicians</p>
          </div>
        </Link>

        <Link href="/payroll/employee/create">
          <div className="bg-white border hover:shadow p-4 rounded-xl cursor-pointer">
            <h2 className="font-semibold text-sm">📝 Crear Payroll Manual</h2>
            <p className="text-xs text-gray-500">Ingresar horas para administrativos</p>
          </div>
        </Link>

        <button
          onClick={handleExtractTCM}
          className="bg-white border hover:shadow p-4 rounded-xl text-left"
        >
          <h2 className="font-semibold text-sm">📤 Importar TCM</h2>
          <p className="text-xs text-gray-500">Leer producción TCM desde sistema</p>
        </button>
      </div>

      {/* Próximo payroll */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/payroll/run">
          <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-2xl p-6 shadow hover:shadow-lg transition cursor-pointer">
            <h2 className="text-lg font-semibold">Run Payroll</h2>
            <p className="text-sm mt-2">Run or continue your regular payroll.</p>
          </div>
        </Link>

        <PayrollCard
          nextCheck={upcomingPayroll.nextCheck}
          period={upcomingPayroll.period}
          schedule={upcomingPayroll.schedule}
        />
      </div>

      {/* Graph */}
      <PayrollGraph data={history} />

      {/* Table */}
      <PayrollTable data={history} />
    </div>
  )
}