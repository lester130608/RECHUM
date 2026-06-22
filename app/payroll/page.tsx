'use client'

import Link from 'next/link'
import { PayrollCard, PayrollGraph, PayrollTable } from '@/components/Payroll'

export default function PayrollPage() {
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

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Payroll</h1>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link href="/payroll/runs">
          <div className="bg-white border hover:shadow p-4 rounded-xl cursor-pointer">
            <h2 className="font-semibold text-sm">Pay Runs</h2>
            <p className="text-xs text-gray-500">Flujo oficial para captura, cálculo, aprobación y export</p>
          </div>
        </Link>

        <Link href="/payroll/owner">
          <div className="bg-white border hover:shadow p-4 rounded-xl cursor-pointer">
            <h2 className="font-semibold text-sm text-gray-600">Owner Summary</h2>
            <p className="text-xs text-gray-500">Histórico read-only de consolidación legacy</p>
          </div>
        </Link>

        <Link href="/payroll/emp">
          <div className="bg-white border hover:shadow p-4 rounded-xl cursor-pointer">
            <h2 className="font-semibold text-sm text-gray-600">Employee History</h2>
            <p className="text-xs text-gray-500">Histórico read-only ligado a pay_periods</p>
          </div>
        </Link>
      </div>

      {/* Próximo payroll */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/payroll/runs">
          <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-2xl p-6 shadow hover:shadow-lg transition cursor-pointer">
            <h2 className="text-lg font-semibold">Run Payroll</h2>
            <p className="text-sm mt-2">Run or continue payroll in the runs flow.</p>
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
