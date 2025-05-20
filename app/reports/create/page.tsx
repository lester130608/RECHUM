'use client'

import { useState } from 'react'

export default function CreateReportPage() {
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [filters, setFilters] = useState({
    week: '',
    role: '',
    employmentType: '',
  })

  const availableFields = [
    { key: 'name', label: 'Nombre del empleado' },
    { key: 'role', label: 'Rol' },
    { key: 'week', label: 'Semana' },
    { key: 'total', label: 'Total Pagado' },
    { key: 'hours', label: 'Horas Trabajadas' },
    { key: 'rate', label: 'Tarifa por hora' },
    { key: 'employee_type', label: 'Tipo de Empleado' },
  ]

  const handleToggleField = (key: string) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    )
  }

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const handleGenerateReport = () => {
    alert(`Generando reporte con columnas: ${selectedFields.join(', ')}`)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📝 Crear Reporte Personalizado</h1>

      {/* Selección de columnas */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">¿Qué columnas deseas incluir?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {availableFields.map((field) => (
            <label key={field.key} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedFields.includes(field.key)}
                onChange={() => handleToggleField(field.key)}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <select
          name="week"
          value={filters.week}
          onChange={handleFilterChange}
          className="border rounded p-2"
        >
          <option value="">Seleccionar semana</option>
          {[...Array(20)].map((_, i) => (
            <option key={i} value={`W${String(i + 1).padStart(2, '0')}`}>
              W{String(i + 1).padStart(2, '0')}
            </option>
          ))}
        </select>

        <select
          name="role"
          value={filters.role}
          onChange={handleFilterChange}
          className="border rounded p-2"
        >
          <option value="">Seleccionar rol</option>
          {["RBT", "BCBA", "CLINICIANS", "TCM", "EMPLOYEE"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          name="employmentType"
          value={filters.employmentType}
          onChange={handleFilterChange}
          className="border rounded p-2"
        >
          <option value="">Tipo de Empleo</option>
          <option value="W-2">W-2</option>
          <option value="1099">1099</option>
        </select>
      </div>

      {/* Botón Generar */}
      <div>
        <button
          onClick={handleGenerateReport}
          className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded"
        >
          Generar Reporte
        </button>
      </div>
    </div>
  )
}