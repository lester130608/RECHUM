import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const roleFieldsConfig = {
  RBT: [
    { name: 'degree', label: 'Degree (MD, DO, ARNP, PA, etc)' },
    { name: 'npi', label: 'NPI' },
    { name: 'primaryTaxonomy', label: 'Primary Practicing Taxonomy Code' },
    { name: 'licenseIssueDate', label: 'License Issue date', type: 'date' },
    { name: 'caqhId', label: 'CAQH ID' },
    { name: 'degreeCode', label: 'Degree Code (If APRN must include APRN Protocol)' },
    { name: 'deaLicense', label: 'DEA License Number (with Exp. Date)' },
    { name: 'secondaryLanguage', label: 'Secondary Language Spoken' },
    { name: 'tertiaryLanguage', label: 'Tertiary Language Spoken' },
    { name: 'activeMedicaidId', label: 'Active Practitioner Medicaid ID' },
    { name: 'activeMedicareId', label: 'Active Practitioner Medicare ID' },
    { name: 'practitionerDesignation', label: 'Practitioner Designation' },
    { name: 'providesBH', label: 'Provides Behavioral Health (BH) Services? (Y/N)' },
    { name: 'specialtyDescription', label: 'Specialty Description' },
    { name: 'ahcaProviderType', label: 'AHCA Provider Type' },
    { name: 'ahcaSpecialtyCode', label: 'AHCA Specialty Code' },
    { name: 'telemedicineProvider', label: 'Telemedicine Provider (Y/N) & Eff Date' },
    { name: 'patientAgeRanges', label: 'Patient Age Ranges' },
  ],
  BCaBA: [
    { name: 'bcabaCertificationNumber', label: 'Número de certificación BCaBA' },
    { name: 'bcabaExp', label: 'Fecha de expiración BCaBA', type: 'date' },
    { name: 'supervisorName', label: 'Nombre del supervisor' },
    { name: 'supervisorNPI', label: 'NPI del supervisor' },
  ],
  BCBA: [
    { name: 'bcbaCertificationNumber', label: 'Número de certificación BCBA' },
    { name: 'bcbaExp', label: 'Fecha de expiración BCBA', type: 'date' },
    { name: 'supervisorName', label: 'Nombre del supervisor' },
    { name: 'supervisorNPI', label: 'NPI del supervisor' },
  ],
  Clinician: [
    { name: 'clinicianLicense', label: 'Licencia del Clinician' },
    { name: 'clinicianExp', label: 'Expiración de licencia', type: 'date' },
  ],
  TCM: [
    { name: 'tcmLicense', label: 'Licencia TCM' },
    { name: 'tcmExp', label: 'Expiración de licencia', type: 'date' },
  ],
};


type RoleType = keyof typeof roleFieldsConfig;
type FieldConfig = { name: string; label: string; type?: string };

interface EmployeeRoleWizardProps {
  employeeId: string;
  role: RoleType;
}

export default function EmployeeRoleWizard({ employeeId, role }: EmployeeRoleWizardProps) {
  // Normalizar el rol para evitar errores por mayúsculas/minúsculas y espacios
  const normalizedRole = role.trim().toUpperCase();
  // Mapear a la clave correcta del config
  const roleMap: Record<string, RoleType> = {
    'RBT': 'RBT',
    'BCABA': 'BCaBA',
    'BCBA': 'BCBA',
    'CLINICIAN': 'Clinician',
    'TCM': 'TCM',
  };
  const mappedRole = roleMap[normalizedRole] || role;
  const fields: FieldConfig[] = roleFieldsConfig[mappedRole as RoleType] || [];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [notApplicable, setNotApplicable] = useState<Record<string, boolean>>({});
  const [fatalError, setFatalError] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [pdfData, setPdfData] = useState<any>(null);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, name: string) => {
    setFieldValues({ ...fieldValues, [name]: e.target.value });
  };

  const handleCheckbox = (name: string) => {
    setNotApplicable(prev => {
      const updated = { ...prev, [name]: !prev[name] };
      return updated;
    });
    if (!notApplicable[name]) {
      setFieldValues({ ...fieldValues, [name]: '' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFatalError('');
    setSuccess(false);
    // Construir payload con null si no aplica
    const payload: Record<string, any> = {
      employee_id: employeeId,
      role,
      ...fields.reduce((acc: Record<string, any>, f: FieldConfig) => {
        acc[f.name] = notApplicable[f.name] ? null : fieldValues[f.name] || null;
        return acc;
      }, {}),
    };
    try {
      const { error } = await supabase.from('employee_role_data').insert([payload]);
      if (error) throw error;
      setSuccess(true);
    } catch (err) {
      if (err instanceof Error) {
        setFatalError(err.message);
      } else {
        setFatalError('Error al guardar');
      }
    } finally {
      setSaving(false);
    }
  };

  // pdfjs dynamic import para Next.js
  useEffect(() => {
    (async () => {
      if (typeof window !== 'undefined') {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      }
    })();
  }, []);

  // Función para manejar la carga del PDF
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str);
        fullText += strings.join(' ') + '\n';
      }
      // Aquí puedes ajustar los patrones según el PDF real
      const certNumber = (fullText.match(/(Cert(ificación)?|Certificate)\s*:?\s*(\w+)/i) || [])[3] || '';
      const expDate = (fullText.match(/(Expiración|Exp\. Date|Vence)\s*:?\s*([\d\/-]+)/i) || [])[2] || '';
      const supervisor = (fullText.match(/Supervisor\s*:?\s*([\w\s]+)/i) || [])[1] || '';
      const npi = (fullText.match(/NPI\s*:?\s*(\d{8,})/i) || [])[1] || '';
      setFieldValues({
        bcbaCertificationNumber: certNumber,
        bcbaExp: expDate,
        supervisorName: supervisor,
        supervisorNPI: npi,
      });
      setPdfData({ name: file.name, size: file.size });
      setExtracting(false);
    } catch (err) {
      setExtracting(false);
      alert('Error al leer el PDF');
    }
  };

  if (fatalError) {
    return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>{fatalError}</div>;
  }

  return (
    <div className="wizard-container" style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 16,
      padding: '2.5rem',
      margin: '2rem 0',
      maxWidth: 700,
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '2.5rem',
      boxShadow: 'none',
    }}>
      <h2 style={{fontSize:'1.5rem', fontWeight:700, marginBottom:12}}>Datos específicos para {mappedRole}</h2>
      {/* Botón de importar/adjuntar PDF solo para BA */}
      {(mappedRole === 'BCBA' || mappedRole === 'BCaBA') && (
        <div style={{marginBottom:24}}>
          <input
            type="file"
            accept="application/pdf"
            style={{display:'none'}}
            ref={fileInputRef}
            onChange={handlePdfUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
            style={{background:'#2563eb', color:'#fff', border:'none', borderRadius:8, padding:'0.75rem 1.5rem', fontWeight:600, fontSize:'1.1rem', cursor:'pointer', opacity:extracting?0.7:1}}
          >
            {extracting ? 'Extrayendo datos...' : (pdfData ? `PDF cargado: ${pdfData.name}` : 'Importar/Adjuntar PDF de certificación')}
          </button>
        </div>
      )}
      {fields.length > 0 ? (
        <form style={{display:'flex', flexDirection:'column', gap:'1.25rem'}}>
          <div style={{display:'flex', flexWrap:'wrap', gap:'1.25rem'}}>
            {fields.map(f => (
              <div key={f.name} style={{flex:'1 1 45%', minWidth:220, display:'flex', flexDirection:'column', gap:8}}>
                <label style={{fontWeight:600, marginBottom:4}}>{f.label}</label>
                <input
                  name={f.name}
                  type={f.type || 'text'}
                  value={notApplicable[f.name] ? '' : fieldValues[f.name] || ''}
                  onChange={e => handleChange(e, f.name)}
                  disabled={!!notApplicable[f.name]}
                  style={{fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}}
                />
                <label style={{fontSize:'0.95rem', marginTop:4}}>
                  <input type="checkbox" checked={!!notApplicable[f.name]} onChange={() => handleCheckbox(f.name)} /> No aplica
                </label>
              </div>
            ))}
          </div>
          <div style={{display:'flex', gap:12, marginTop:20}}>
            <button type="button" onClick={handleSave} disabled={saving} style={{background:'#059669', color:'#fff', border:'none', borderRadius:10, padding:'1rem 2rem', fontWeight:700, fontSize:'1.15rem', cursor:'pointer', opacity:saving?0.7:1}}>
              {saving ? 'Guardando...' : 'Finalizar'}
            </button>
          </div>
          {success && <div style={{color:'#059669', fontWeight:600, marginTop:10}}>¡Guardado exitosamente!</div>}
        </form>
      ) : (
        <div style={{fontSize:'1.15rem', color:'#555', margin:'2rem 0'}}>No hay campos configurados para el rol seleccionado.</div>
      )}
    </div>
  );
}
