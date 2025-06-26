'use client'
import { useState } from "react";
import { supabase } from '../lib/supabaseClient';

export default function EmployeeWizard1099() {
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState({
    firstName: "",
    lastName: "",
    middleInitial: "",
    ssn: "",
    email: "",
    phone: "",
    gender: "",
    dob: "",
  });
  const [contact, setContact] = useState({
    street: "",
    apt: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    homePhone: "",
    email: "",
  });
  const [job, setJob] = useState({
    role: "",
    employeeType: "",
    startDate: "",
    rate: "",
    status: "active",
  });
  const [documents, setDocuments] = useState({
    id: null,
    ssnCard: null,      // o EIN letter
    w9: null,
    voidCheck: null,
    certification: null,
    extras: [] as File[],
  });
  const [expiries, setExpiries] = useState({
    id: "",
    ssnCard: "",
    w9: "",
    voidCheck: "",
    certification: "",
  });

  const handleIdentityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setIdentity({ ...identity, [e.target.name]: e.target.value });
  };
  const handleContactChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setContact({ ...contact, [e.target.name]: e.target.value });
  };
  const handleJobChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setJob({ ...job, [e.target.name]: e.target.value });
  };
  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (!files) return;
    if (name === "extras") {
      setDocuments((prev) => ({
        ...prev,
        extras: [...prev.extras, ...Array.from(files)],
      }));
    } else {
      setDocuments((prev) => ({
        ...prev,
        [name]: files[0],
      }));
    }
  };
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExpiries({ ...expiries, [e.target.name]: e.target.value });
  };

  const handleFinish = async () => {
    // 1. Guardar empleado
    const { data, error } = await supabase
      .from('employees')
      .insert([{
        first_name: identity.firstName,
        last_name: identity.lastName,
        email: identity.email,
        phone: identity.phone,
        ssn: identity.ssn,
        address: `${contact.street}, ${contact.city}, ${contact.state} ${contact.zip}`,
        start_date: job.startDate,
        rate: job.rate,
        status: job.status,
        employee_type: '1099',
        created_at: new Date().toISOString(),
      }])
      .select('id')
      .single();

    if (error || !data) {
      alert("Error al guardar empleado: " + (error?.message || "Sin datos"));
      return;
    }

    const employeeId = data.id;

    // 2. Guardar documentos
    const docTypes = [
      { key: 'id', label: 'id' },
      { key: 'ssnCard', label: 'ssn_card' },
      { key: 'w9', label: 'w9' },
      { key: 'voidCheck', label: 'void_check' },
      { key: 'certification', label: 'certification' },
    ];

    for (const doc of docTypes) {
      const file = documents[doc.key];
      if (file) {
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('employee-documents')
          .upload(`${employeeId}/${doc.label}-${Date.now()}.${file.name.split('.').pop()}`, file);

        if (storageError) {
          alert(`Error subiendo ${doc.label}: ${storageError.message}`);
          continue;
        }

        const { data: publicUrlData } = supabase
          .storage
          .from('employee-documents')
          .getPublicUrl(storageData.path);

        await supabase
          .from('employee_documents')
          .insert([{
            employee_id: employeeId,
            type: doc.label,
            file_url: publicUrlData.publicUrl,
            upload_date: new Date().toISOString(),
            expiration_date: expiries[doc.key] || null,
            verified: false,
          }]);
      }
    }

    alert("Contratista 1099 y documentos guardados exitosamente.");

    // Limpiar el wizard y regresar al paso 1
    setIdentity({ firstName: "", lastName: "", ssn: "", email: "", phone: "", middleInitial: "", gender: "", dob: "" });
    setContact({ street: "", apt: "", city: "", state: "", zip: "", phone: "", homePhone: "", email: "" });
    setJob({ role: "", employeeType: "", startDate: "", rate: "", status: "active" });
    setDocuments({ id: null, ssnCard: null, w9: null, voidCheck: null, certification: null, extras: [] });
    setExpiries({ id: "", ssnCard: "", w9: "", voidCheck: "", certification: "" });
    setStep(1);
  };

  const canContinueStep1 = identity.firstName && identity.lastName && identity.ssn && identity.email && identity.phone;
  const canContinueStep2 = contact.street && contact.city && contact.state && contact.zip;
  const canContinueStep3 = job.startDate && job.rate;

  return (
    <div className="wizard">
      {/* Título principal alineado a la izquierda, igual que W-2 */}
      <div style={{ margin: "40px 0 32px 0" }}>
        <h1 style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          margin: 0,
          textAlign: "left"
        }}>
          Create New Contractor (1099)
        </h1>
      </div>
      {/* Paso 1: Identidad */}
      {step === 1 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Identidad legal</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>First Name *</label>
            <input
              name="firstName"
              value={identity.firstName}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Middle Initial</label>
            <input
              name="middleInitial"
              value={identity.middleInitial}
              onChange={handleIdentityChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Last Name *</label>
            <input
              name="lastName"
              value={identity.lastName}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Gender</label>
            <select
              name="gender"
              value={identity.gender}
              onChange={handleIdentityChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="">Select gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="prefer_not_say">Prefer not to say</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>SSN o EIN *</label>
            <input
              name="ssn"
              value={identity.ssn}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Date of Birth *</label>
            <input
              name="dob"
              type="date"
              value={identity.dob}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              disabled={!canContinueStep1}
              onClick={() => setStep(2)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: Contacto */}
      {step === 2 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Dirección y contacto</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Street Address *</label>
            <input
              name="street"
              placeholder="Street address"
              value={contact.street}
              onChange={handleContactChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Apartment, suite, etc.</label>
            <input
              name="apt"
              placeholder="Apartment, suite, unit, building, or floor"
              value={contact.apt || ""}
              onChange={handleContactChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>City *</label>
            <input
              name="city"
              placeholder="City"
              value={contact.city}
              onChange={handleContactChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontWeight: 500 }}>State *</label>
              <select
                name="state"
                value={contact.state}
                onChange={handleContactChange}
                required
                style={{ width: "100%", padding: 8, marginTop: 4 }}
              >
                <option value="">Select state</option>
                <option value="FL">Florida</option>
                <option value="GA">Georgia</option>
                <option value="TX">Texas</option>
                <option value="CA">California</option>
                {/* Agrega más estados si necesitas */}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontWeight: 500 }}>Zip *</label>
              <input
                name="zip"
                placeholder="Zip"
                value={contact.zip}
                onChange={handleContactChange}
                required
                style={{ width: "100%", padding: 8, marginTop: 4 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Phone Number</label>
            <input
              name="phone"
              placeholder="Phone number"
              value={contact.phone || ""}
              onChange={handleContactChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Home Phone Number</label>
            <input
              name="homePhone"
              placeholder="Home phone number"
              value={contact.homePhone || ""}
              onChange={handleContactChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Email *</label>
            <input
              name="email"
              type="email"
              placeholder="Email"
              value={contact.email || ""}
              onChange={handleContactChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              onClick={() => setStep(1)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#e5e7eb", color: "#111", border: "none", borderRadius: 4 }}
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(3)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
              disabled={!canContinueStep2}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Paso 3: Información laboral */}
      {step === 3 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Información laboral</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Puesto/Rol *</label>
            <select
              name="role"
              value={job.role || ""}
              onChange={handleJobChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="">Selecciona un rol</option>
              <option value="RBT">RBT</option>
              <option value="BCBA">BCBA</option>
              <option value="Admin">Admin</option>
              <option value="HR">HR</option>
              {/* Agrega más roles según tu organización */}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Tipo de empleado *</label>
            <select
              name="employeeType"
              value={job.employeeType || ""}
              onChange={handleJobChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="">Selecciona tipo</option>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="temporary">Temporal</option>
              <option value="seasonal">Seasonal</option>
              {/* Agrega más tipos si necesitas */}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Fecha de inicio *</label>
            <input
              name="startDate"
              type="date"
              value={job.startDate}
              onChange={handleJobChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Tarifa *</label>
            <input
              name="rate"
              value={job.rate}
              onChange={handleJobChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontWeight: 500 }}>Estado</label>
            <select
              name="status"
              value={job.status}
              onChange={handleJobChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              onClick={() => setStep(2)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#e5e7eb", color: "#111", border: "none", borderRadius: 4 }}
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(4)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
              disabled={!canContinueStep3}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Paso 4: Documentos */}
      {step === 4 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Adjuntar documentos</h2>
          <div style={{ marginBottom: 16 }}>
            <label><b>ID oficial:</b></label>
            <input type="file" name="id" onChange={handleDocumentChange} />
            <input type="date" name="id" value={expiries.id} onChange={handleExpiryChange} style={{ marginLeft: 8 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>SSN Card o EIN Letter:</b></label>
            <input type="file" name="ssnCard" onChange={handleDocumentChange} />
            <input type="date" name="ssnCard" value={expiries.ssnCard} onChange={handleExpiryChange} style={{ marginLeft: 8 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>W-9:</b></label>
            <input type="file" name="w9" onChange={handleDocumentChange} />
            <input type="date" name="w9" value={expiries.w9} onChange={handleExpiryChange} style={{ marginLeft: 8 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Voided Check:</b></label>
            <input type="file" name="voidCheck" onChange={handleDocumentChange} />
            <input type="date" name="voidCheck" value={expiries.voidCheck} onChange={handleExpiryChange} style={{ marginLeft: 8 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Certificación:</b></label>
            <input type="file" name="certification" onChange={handleDocumentChange} />
            <input type="date" name="certification" value={expiries.certification} onChange={handleExpiryChange} style={{ marginLeft: 8 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Extras:</b></label>
            <input type="file" name="extras" multiple onChange={handleDocumentChange} />
            {/* Mostrar archivos extras seleccionados */}
            {documents.extras.length > 0 && (
              <ul style={{ marginTop: 8, fontSize: 13 }}>
                {documents.extras.map((file, idx) => (
                  <li key={idx}>{file.name}</li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              onClick={() => setStep(3)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#e5e7eb", color: "#111", border: "none", borderRadius: 4 }}
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(5)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Paso 5: Confirmación */}
      {step === 5 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Confirmación</h2>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Identidad legal</h3>
            <div><b>Nombre:</b> {identity.firstName} {identity.middleInitial} {identity.lastName}</div>
            <div><b>Género:</b> {identity.gender || "No especificado"}</div>
            <div><b>SSN/EIN:</b> {identity.ssn}</div>
            <div><b>Fecha de nacimiento:</b> {identity.dob}</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Dirección y contacto</h3>
            <div><b>Dirección:</b> {contact.street} {contact.apt && `, ${contact.apt}`}</div>
            <div><b>Ciudad:</b> {contact.city}, <b>Estado:</b> {contact.state}, <b>Zip:</b> {contact.zip}</div>
            <div><b>Teléfono:</b> {contact.phone || "No especificado"}</div>
            <div><b>Teléfono casa:</b> {contact.homePhone || "No especificado"}</div>
            <div><b>Email:</b> {contact.email}</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Información laboral</h3>
            <div><b>Rol:</b> {job.role}</div>
            <div><b>Tipo de empleado:</b> {job.employeeType}</div>
            <div><b>Fecha de inicio:</b> {job.startDate}</div>
            <div><b>Tarifa:</b> {job.rate}</div>
            <div><b>Estado:</b> {job.status === "active" ? "Activo" : "Inactivo"}</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Documentos</h3>
            <div><b>ID oficial:</b> {documents.id ? "Cargado" : "No cargado"}</div>
            <div><b>SSN Card/EIN Letter:</b> {documents.ssnCard ? "Cargado" : "No cargado"}</div>
            <div><b>W-9:</b> {documents.w9 ? "Cargado" : "No cargado"}</div>
            <div><b>Voided Check:</b> {documents.voidCheck ? "Cargado" : "No cargado"}</div>
            <div><b>Certificación:</b> {documents.certification ? "Cargado" : "No cargado"}</div>
            <div><b>Extras:</b> {documents.extras.length > 0 ? documents.extras.map(f => f.name).join(", ") : "No cargados"}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              onClick={() => setStep(4)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#e5e7eb", color: "#111", border: "none", borderRadius: 4 }}
            >
              Atrás
            </button>
            <button
              onClick={handleFinish}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#059669", color: "#fff", border: "none", borderRadius: 4 }}
            >
              Finalizar
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 16, marginBottom: 8, fontWeight: 500 }}>
        Paso {step} de 4
      </div>
    </div>
  );
}