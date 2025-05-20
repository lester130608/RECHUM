'use client'

import * as XLSX from 'xlsx'
import { useState } from 'react'

export default function CliniciansImportPage() {
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

    const rows = contentRows
      .map((row: any[]) => ({
        name: `${row[0] || ""} ${row[1] || ""}`.trim(),
        it_hours: Number(row[2]) || 0,
        bio_hours: Number(row[3]) || 0,
        tp_hours: Number(row[4]) || 0,
        intake_hours: Number(row[5]) || 0,
        in_depth_bio: Number(row[6]) || 0,
        in_depth_intake: Number(row[7]) || 0,
        in_depth_existing: Number(row[8]) || 0,
        tp_review_count: Number(row[9]) || 0
      }))
      .filter((row) => row.name && row.name.trim() !== "")

    setPreview(rows)
    setLoaded(true)
    console.log("Preview Clinicians:", rows)
  }

  const handleSubmit = async () => {
    const response = await fetch('/api/payroll/clinicians/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: preview })
    })

    const result = await response.json()
    alert(result.message)
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">📥 Importar Payroll de Clinicians</h1>

      <input type="file" accept=".xlsx" onChange={handleFileChange} />
      {fileName && <p className="text-sm text-muted-foreground">Archivo seleccionado: {fileName}</p>}
      {loaded && <p className="text-green-600 text-sm">✅ Archivo procesado correctamente</p>}

      {preview.length > 0 && (
        <>
          <table className="w-full text-sm border mt-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border">Nombre</th>
                <th className="p-2 border">IT</th>
                <th className="p-2 border">BIO</th>
                <th className="p-2 border">TP</th>
                <th className="p-2 border">INTAKE</th>
                <th className="p-2 border">In-Depth BIO</th>
                <th className="p-2 border">In-Depth INTAKE</th>
                <th className="p-2 border">In-Depth EXISTING</th>
                <th className="p-2 border">TP Review</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-2 border">{item.name}</td>
                  <td className="p-2 border text-center">{item.it_hours}</td>
                  <td className="p-2 border text-center">{item.bio_hours}</td>
                  <td className="p-2 border text-center">{item.tp_hours}</td>
                  <td className="p-2 border text-center">{item.intake_hours}</td>
                  <td className="p-2 border text-center">{item.in_depth_bio}</td>
                  <td className="p-2 border text-center">{item.in_depth_intake}</td>
                  <td className="p-2 border text-center">{item.in_depth_existing}</td>
                  <td className="p-2 border text-center">{item.tp_review_count}</td>
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