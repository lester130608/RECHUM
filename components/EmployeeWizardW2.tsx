import React, { useState } from 'react';
import EmployeeRoleWizard from './EmployeeRoleWizard';
import { supabase } from '../lib/supabaseClient';


export default function EmployeeWizardW2() {
  // Estado para saber si el wizard está listo para renderizar
  const [ready, setReady] = useState(false);

  React.useEffect(() => {
    // Validar estado de localStorage al montar
    const savedGeneral = typeof window !== 'undefined' ? localStorage.getItem('wizardGeneral') : null;
    let valid = false;
    if (savedGeneral) {
      try {
        const parsed = JSON.parse(savedGeneral);
        // Si no hay nombre o rol, no es válido
        if (parsed && typeof parsed === 'object' && parsed.firstName && parsed.role) {
          valid = true;
        }
      } catch {}
    }
    if (!valid) {
      setStep(1);
      setGeneral(initialGeneral);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('wizardGeneral');
        localStorage.removeItem('wizardStep');
      }
    }
    setReady(true);
  }, []);
  // Estados únicos
  // Persistencia con localStorage
  const [showRoleWizard, setShowRoleWizard] = useState<{ employeeId: string; role: string } | null>(null);
  // Inicialización robusta para evitar pantalla en blanco
  const initialGeneral = {
    firstName: '', middleName: '', lastName: '', gender: '', dob: '', ssn: '', street: '', city: '', state: '', zip: '', phone: '', email: '', accountNumber: '', routingNumber: '', rate: '', role: ''
  };
  const [step, setStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wizardStep');
      if (saved && !isNaN(Number(saved))) {
        return Number(saved);
      }
    }
    return 1;
  });
  const [general, setGeneral] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wizardGeneral');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && parsed.firstName !== undefined) {
            return parsed;
          }
        } catch {
          // Si falla el parseo, usar estado inicial
        }
      }
    }
    return initialGeneral;
  });
  // Si el estado está vacío, forzar paso 1 y estado inicial
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedGeneral = localStorage.getItem('wizardGeneral');
      if (!savedGeneral) {
        setStep(1);
        setGeneral(initialGeneral);
      }
    }
  }, []);
  const [roleFields, setRoleFields] = useState<{
    certificationNumber?: string;
    certificationExp?: string;
    supervisorName?: string;
    supervisorNPI?: string;
    clinicianLicense?: string;
    clinicianExp?: string;
    adminDept?: string;
    adminPosition?: string;
    tcmLicense?: string;
    tcmExp?: string;
    practitionerLicense?: string;
    practitionerExp?: string;
  }>({});
  const [fatalError, setFatalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Protección: si el usuario refresca y no hay estado, reiniciar al paso 1
  // Guardar step y general en localStorage en cada cambio
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wizardStep', String(step));
    }
  }, [step]);
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wizardGeneral', JSON.stringify(general));
    }
  }, [general]);

  const handleGeneralChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setGeneral({ ...general, [e.target.name]: e.target.value });
  };

  const handleRoleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setRoleFields({ ...roleFields, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    setFatalError('');
    setSuccess(false);
    // Unir datos generales y específicos
    const payload = { ...general, ...roleFields };
    try {
      const { data, error } = await supabase.from('employees').insert([payload]).select('id');
      if (error) throw error;
      setSuccess(true);
      // Limpiar localStorage al finalizar
      if (typeof window !== 'undefined') {
        localStorage.removeItem('wizardStep');
        localStorage.removeItem('wizardGeneral');
      }
      // Si el rol no es Employee, guardar el id y mostrar el segundo wizard
      if (general.role !== 'Employee' && data && data.length > 0) {
        setShowRoleWizard({ employeeId: data[0].id, role: general.role });
      }
    } catch (err: any) {
      setFatalError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (fatalError) {
    return <div style={{color: 'red', padding: '1rem', border: '1px solid #f59e42', borderRadius: 8, background: '#fffbe9'}}>{fatalError}</div>;
  }

  return (
    <>
      {!ready && (
        <div style={{width:'100%', textAlign:'center', padding:'3rem'}}>
          <span style={{fontSize:'1.25rem', color:'#888'}}>Cargando wizard...</span>
        </div>
      )}
      {ready && (
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
          {!showRoleWizard ? (
            <>
              {step === 1 && (
                <div className="wizard-step" style={{display:'flex', flexDirection:'column', gap:'1.5rem'}}>
                  <h2 style={{fontSize:'1.5rem', fontWeight:700, marginBottom:12}}>Datos Generales del Empleado</h2>
                  <form style={{display:'flex', flexDirection:'column', gap:'1.25rem'}}>
                    <div style={{display:'flex', flexWrap:'wrap', gap:'1.25rem'}}>
                      <input name="firstName" value={general.firstName} onChange={handleGeneralChange} placeholder="Primer nombre" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="middleName" value={general.middleName} onChange={handleGeneralChange} placeholder="Segundo nombre" style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="lastName" value={general.lastName} onChange={handleGeneralChange} placeholder="Apellido" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <select name="gender" value={general.gender} onChange={handleGeneralChange} required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}}>
                        <option value="">Género</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                        <option value="O">Otro</option>
                      </select>
                      <input name="dob" type="date" value={general.dob} onChange={handleGeneralChange} placeholder="Fecha de nacimiento" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="ssn" value={general.ssn} onChange={handleGeneralChange} placeholder="SSN" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="street" value={general.street} onChange={handleGeneralChange} placeholder="Dirección" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="city" value={general.city} onChange={handleGeneralChange} placeholder="Ciudad" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="state" value={general.state} onChange={handleGeneralChange} placeholder="Estado" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="zip" value={general.zip} onChange={handleGeneralChange} placeholder="Código postal" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="phone" value={general.phone} onChange={handleGeneralChange} placeholder="Teléfono (opcional)" style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="email" value={general.email} onChange={handleGeneralChange} placeholder="Email (opcional)" style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="accountNumber" value={general.accountNumber} onChange={handleGeneralChange} placeholder="Número de cuenta" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="routingNumber" value={general.routingNumber} onChange={handleGeneralChange} placeholder="Número de ruta" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <input name="rate" value={general.rate} onChange={handleGeneralChange} placeholder="Rate" required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}} />
                      <select name="role" value={general.role} onChange={handleGeneralChange} required style={{flex:'1 1 45%', minWidth:220, fontSize:'1.15rem', padding:'0.75rem', borderRadius:8, border:'1.5px solid #cbd5e1'}}>
                        <option value="">Seleccione el rol</option>
                        <option value="RBT">RBT</option>
                        <option value="BCaBA">BCaBA</option>
                        <option value="BCBA">BCBA</option>
                        <option value="TCM">TCM</option>
                        <option value="Clinician">Clinician</option>
                        <option value="Employee">Employee</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => setStep(2)} style={{marginTop:20, background:'#2563eb', color:'#fff', border:'none', borderRadius:10, padding:'1rem 2rem', fontWeight:700, fontSize:'1.15rem', cursor:'pointer'}}>Siguiente</button>
                  </form>
                </div>
              )}
              {step === 2 && (
                <div className="wizard-step" style={{display:'flex', flexDirection:'column', gap:'1.5rem'}}>
                  <h2 style={{fontSize:'1.5rem', fontWeight:700, marginBottom:12}}>Datos específicos para {general.role || 'rol seleccionado'}</h2>
                  <form style={{display:'flex', flexDirection:'column', gap:'1.25rem'}}>
                    {/* Aquí estaban los campos específicos, ahora se manejan en el segundo wizard si aplica */}
                    <div style={{display:'flex', gap:12, marginTop:20}}>
                      <button type="button" onClick={() => setStep(1)} style={{background:'#6b7280', color:'#fff', border:'none', borderRadius:10, padding:'1rem 2rem', fontWeight:700, fontSize:'1.15rem', cursor:'pointer'}}>Regresar</button>
                      <button type="button" onClick={handleSave} disabled={saving} style={{background:'#059669', color:'#fff', border:'none', borderRadius:10, padding:'1rem 2rem', fontWeight:700, fontSize:'1.15rem', cursor:'pointer', opacity:saving?0.7:1}}>
                        {saving ? 'Guardando...' : 'Finalizar'}
                      </button>
                    </div>
                    {success && <div style={{color:'#059669', fontWeight:600, marginTop:10}}>¡Guardado exitosamente!</div>}
                  </form>
                </div>
              )}
            </>
          ) : (
            showRoleWizard && (
              <>
                {['RBT','BCaBA','BCBA','Clinician','TCM'].includes(showRoleWizard.role)
                  ? <EmployeeRoleWizard employeeId={showRoleWizard.employeeId} role={showRoleWizard.role as "RBT"|"BCaBA"|"BCBA"|"Clinician"|"TCM"} />
                  : <div style={{color:'#f59e42', fontWeight:600, marginTop:20}}>No hay datos específicos para el rol seleccionado.</div>
                }
              </>
            )
          )}
        </div>
      )}
    </>
  );
}