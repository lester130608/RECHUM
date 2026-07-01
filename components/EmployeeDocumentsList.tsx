'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface EmployeeDocumentsListProps {
  employeeId: string
}

interface DocumentRecord {
  id: string
  type: string
  file_url: string // path en el bucket
  verified: boolean
  upload_date: string
}

export default function EmployeeDocumentsList({ employeeId }: EmployeeDocumentsListProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [signedUrls, setSignedUrls] = useState<{[id: string]: string}>({})
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string>("")
  const [debugInfo, setDebugInfo] = useState<{[id: string]: string}>({})

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        // Consulta SIN filtro para ver todos los documentos
        const { data: allDocs, error: allError } = await supabase
          .from('employee_documents')
          .select('*')
          .order('upload_date', { ascending: false })
        // Consulta CON filtro por employeeId
        const { data, error } = await supabase
          .from('employee_documents')
          .select('*')
          .eq('employee_id', employeeId)
          .order('upload_date', { ascending: false })

        // DEBUG: Mostrar ambas consultas en consola
        // @ts-ignore
        if (typeof window !== 'undefined') {
          console.log('[DEBUG] Consulta sin filtro:', allDocs);
          console.log('[DEBUG] Consulta con filtro employee_id =', employeeId, data);
        }

        if (error) {
          if (error.message?.includes('Bucket not found')) {
            setErrorMsg("No se encontró el bucket de documentos en Supabase Storage. Por favor, contacta al administrador.")
          } else {
            setErrorMsg("Error al obtener documentos: " + error.message)
          }
          setLoading(false)
          return
        }
        if (data) {
          setDocuments(data)
          // Obtener signed URLs para cada documento
          const debug: {[id: string]: string} = {}
          const promises = data.map(async (doc: DocumentRecord) => {
            let relativePath = doc.file_url;
            const match = relativePath.match(/employee-documents\/(.+)$/);
            if (match) {
              relativePath = match[1];
            }
            if (relativePath.startsWith('/')) {
              relativePath = relativePath.slice(1);
            }
            if (!relativePath) {
              debug[doc.id] = `Path vacío para doc ${doc.id}`;
              return { id: doc.id, url: '' };
            }
            try {
              const { data: urlData, error: urlError } = await supabase.storage
                .from('employee-documents')
                .createSignedUrl(relativePath, 3600);
              if (urlError || !urlData) {
                debug[doc.id] = `Error: ${urlError?.message || 'No se pudo generar signed URL'} | Path: ${relativePath}`;
                return { id: doc.id, url: '' };
              }
              return { id: doc.id, url: urlData.signedUrl };
            } catch (err: any) {
              debug[doc.id] = `Excepción: ${err?.message || err?.toString()} | Path: ${relativePath}`;
              return { id: doc.id, url: '' };
            }
          })
          const results = await Promise.all(promises)
          const urlMap: {[id: string]: string} = {}
          results.forEach(({id, url}) => { urlMap[id] = url })
          setSignedUrls(urlMap)
          setDebugInfo(debug)
        }
        setLoading(false)
      } catch (err: any) {
        setErrorMsg("Error inesperado al cargar documentos: " + (err?.message || err?.toString() || ''))
        setLoading(false)
      }
    }
    fetchDocuments()
  }, [employeeId])

  if (loading) return <div className="p-4 animate-pulse text-gray-500">Cargando documentos...</div>
  if (errorMsg) return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>{errorMsg}</div>

  try {
    return (
      <div className="section">
        {/* debugBlock removido para UI limpia */}
        <h2 className="heading">Uploaded Documents</h2>
        {documents.length === 0 ? (
          <p>No documents have been uploaded yet.</p>
        ) : (
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {documents.map((doc) => (
              <li
                key={doc.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.375rem",
                  marginBottom: "0.5rem"
                }}
              >
                <div>
                  <p style={{ fontWeight: 500 }}>{doc.type}</p>
                  <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                    {new Date(doc.upload_date).toLocaleString()}
                  </p>
                </div>
                {signedUrls[doc.id] ? (
                  <a
                    href={signedUrls[doc.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb", textDecoration: "underline", fontSize: "0.875rem" }}
                  >
                    View File
                  </a>
                ) : (
                  <span style={{ color: 'red', fontSize: '0.875rem' }}>
                    No access
                    {debugInfo[doc.id] && (
                      <span style={{ display: 'block', color: '#b91c1c', fontSize: '0.75rem', marginTop: 2 }}>
                        {debugInfo[doc.id]}
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  } catch (err: any) {
    return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>Error inesperado al renderizar documentos: {err?.message || err?.toString() || ''}</div>
  }
}