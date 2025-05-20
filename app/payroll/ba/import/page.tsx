'use client'

import * as XLSX from 'xlsx'
import { useState } from 'react'

export default function BAImportPage() {
  const [preview, setPreview] = useState<any[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<boolean>(false)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setLoaded(false)

    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    const headers = json[0]
    const contentRows = json.slice(1)
    const useHeaders = headers.includes("Nombre")

    const rows = contentRows
      .map((row: any[]) => {
        if (useHeaders) {
          return {
            name: row[headers.indexOf("Nombre")] || "",
            role: row[headers.indexOf("Rol")] || "",
            hours: Number(row[headers.indexOf("Horas")]) || 0,
            assessment: Number(row[headers.indexOf("Assessment")]) || 0,
            reassessment: Number(row[headers.indexOf("Reassessment")]) || 0
          }
        } else {
          return {
            name: row[1] || "",
            role: row[0] || "",
            hours: Number(row[2]) || 0,
            assessment: Number(row[3]) || 0,
            reassessment: Number(row[4]) || 0
          }
        }
      })
      .filter((row) => row.name && row.name.trim() !== "")

    setPreview(rows)
    setLoaded(true)
    console.log("Preview cargado:", rows)
  }

  const handleSubmit = async () => {
    const response = await fetch('/api/payroll/ba/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: preview })
    })

    const result = await response.json()
    alert(result.message)
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">📥 Importar Payroll de BA</h1>

      <input type="file" accept=".xlsx" onChange={handleFileChange} />
      {fileName && <p className="text-sm text-muted-foreground">Archivo seleccionado: {fileName}</p>}
      {loaded && <p className="text-green-600 text-sm">✅ Archivo procesado correctamente</p>}

      {preview.length > 0 && (
        <>
          <table className="w-full text-sm border mt-4">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Nombre</th>
                <th className="p-2 border">Rol</th>
                <th className="p-2 border">Horas</th>
                <th className="p-2 border">Assessment</th>
                <th className="p-2 border">Reassessment</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-2 border">{item.name}</td>
                  <td className="p-2 border">{item.role}</td>
                  <td className="p-2 border text-center">{item.hours}</td>
                  <td className="p-2 border text-center">{item.assessment}</td>
                  <td className="p-2 border text-center">{item.reassessment}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex gap-4 mt-6">
            <button
              type="button"
              onClick={handleSubmit}
              className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => window.location.href = "/payroll"}
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded"
            >
              ⬅️ Atrás
            </button>
          </div>
        </>
      )}
    </div>
  )
}