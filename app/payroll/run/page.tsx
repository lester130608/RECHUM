'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RunPayrollPage() {
  const [data, setData] = useState<any[]>([])
  const [filters, setFilters] = useState({
    user: '',
    week: '',
    year: '',
    status: '',
  })

  const [selected, setSelected] = useState<any | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from('payroll_tcm_raw')
        .select('id, name, total_units, week, year, payment_status')
        .order('created_on', { ascending: false })

      if (data) {
        const mapped = data.map((item) => ({
          id: item.id,
          user: item.name,
          units: item.total_units,
          week: item.week,
          year: item.year,
          status: item.payment_status === 'pending' ? 'Pending' : 'Paid',
        }))
        setData(mapped)
      }
    }

    fetchData()
  }, [])

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const handleSearch = () => {
    let filtered = data.filter((item) => {
      return (
        (!filters.user || item.user.includes(filters.user)) &&
        (!filters.week || item.week.includes(filters.week)) &&
        (!filters.year || item.year.toString() === filters.year) &&
        (!filters.status || item.status === filters.status)
      )
    })
    setData(filtered)
  }

  const handleClear = () => {
    setFilters({ user: '', week: '', year: '', status: '' })
    location.reload()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">TimeSheets</h1>
        <button
          onClick={async () => {
            const res = await fetch("/api/payroll/tcm/extract")
            const result = await res.json()
            alert(result.message || "✅ Extracción completada")
            location.reload()
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Extraer Payroll
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-end">
        {[
          { label: 'User', name: 'user' },
          { label: 'Week', name: 'week' },
          { label: 'Year', name: 'year' },
          { label: 'Status', name: 'status' },
        ].map(({ label, name }) => (
          <div key={name} className="flex flex-col">
            <label className="text-sm font-medium mb-1">{label}</label>
            <input
              name={name}
              value={filters[name as keyof typeof filters]}
              onChange={handleFilterChange}
              className="border px-3 py-1 rounded"
              placeholder={label}
            />
          </div>
        ))}
        <button
          onClick={handleSearch}
          className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600"
        >
          Search
        </button>
        <button
          onClick={handleClear}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Clear
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto bg-white shadow rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Units</th>
              <th className="p-3 text-left">Week</th>
              <th className="p-3 text-left">Year</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-3">{item.user}</td>
                <td className="p-3">{item.units}</td>
                <td className="p-3">{item.week}</td>
                <td className="p-3">{item.year}</td>
                <td className="p-3">
                  <span className="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded-full">
                    {item.status}
                  </span>
                </td>
                <td className="p-3">
                  <button
                    onClick={() => setSelected(item)}
                    className="text-blue-600 hover:underline"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg relative">
            <h2 className="text-lg font-bold mb-4">Detalle del Registro</h2>
            <p><strong>Empleado:</strong> {selected.user}</p>
            <p><strong>Unidades:</strong> {selected.units}</p>
            <p><strong>Semana:</strong> {selected.week}</p>
            <p><strong>Año:</strong> {selected.year}</p>
            <p><strong>Estado:</strong> {selected.status}</p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelected(null)}
                className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}