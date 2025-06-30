'use client'
import { useEffect, useState } from "react";
import { supabase } from '../lib/supabaseClient';

export default function EmployeeWizardW2() {
  const [step, setStep] = useState(1);

  // Paso 1: Identidad legal
  const [identity, setIdentity] = useState({
    firstName: "",
    middleInitial: "",
    lastName: "",
    gender: "",
    ssn: "",
    dob: "",
  });

  // Paso 2: Dirección y contacto
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

  // Paso 3: Información laboral
  const [job, setJob] = useState({
    role: "",
    employeeType: "",
    startDate: "",
    rate: "",
    status: "active",
  });

  // Paso 4: Documentos
  const [documents, setDocuments] = useState<{
    [key: string]: File | File[] | null;
    id: File | null;
    ssCard: File | null;
    passport: File | null;
    voidCheck: File | null;
    resume: File | null;
    fingerprint: File | null;
    certification: File | null;
    diploma: File | null;
    extras: File[];
  }>({
    id: null,
    ssCard: null,
    passport: null,
    voidCheck: null,
    resume: null,
    fingerprint: null,
    certification: null,
    diploma: null,
    extras: [],
  });

  const [expiries, setExpiries] = useState<{ [key: string]: string }>({
    id: "",
    ssCard: "",
    passport: "",
    voidCheck: "",
    resume: "",
    fingerprint: "",
    certification: "",
    diploma: "",
  });

  // Manejo de cambios
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

  // Validaciones mínimas por paso
  const canContinueStep1 = identity.firstName && identity.lastName && identity.ssn && identity.dob;
  const canContinueStep2 = contact.street && contact.city && contact.state && contact.zip && contact.email;
  const canContinueStep3 = job.role && job.employeeType && job.startDate && job.rate;
  const canContinueStep4 = documents.ssCard && documents.passport && documents.voidCheck && documents.resume;

  // Simulación de submit final
  const handleFinish = async () => {
    // 1. Guardar empleado
    const { data, error } = await supabase
      .from('employees')
      .insert([{
        first_name: identity.firstName,
        last_name: identity.lastName,
        email: contact.email,
        role: job.role,
        status: job.status === "active" ? "Active" : "Inactive",
        created_at: new Date().toISOString(),
        employee_type: job.role,
        rate: job.rate,
        employment_type: job.employeeType,
        full_name: `${identity.firstName} ${identity.lastName}`,
        address: `${contact.street} ${contact.apt ? contact.apt : ""}, ${contact.city}, ${contact.state} ${contact.zip}`,
        start_date: job.startDate,
      }])
      .select('id')
      .single();

    if (error || !data) {
      alert("Error al guardar empleado: " + (error?.message || "Sin datos"));
      return;
    }

    const employeeId = data.id;

    // 2. Guardar documentos (solo los que se subieron)
    const docTypes = [
      { key: 'id', label: 'id' },
      { key: 'ssCard', label: 'ss_card' },
      { key: 'passport', label: 'passport' },
      { key: 'voidCheck', label: 'void_check' },
      { key: 'resume', label: 'resume' },
      { key: 'fingerprint', label: 'fingerprint' },
      { key: 'certification', label: 'certification' },
      { key: 'diploma', label: 'diploma' },
    ];

    for (const doc of docTypes) {
      const file = documents[doc.key];
      if (doc.key === 'extras' && Array.isArray(file)) {
        for (const extraFile of file) {
          // Sube el archivo extra a Supabase Storage
          const { data: storageData, error: storageError } = await supabase
            .storage
            .from('employee-documents')
            .upload(`${employeeId}/${doc.label}-${Date.now()}.${extraFile.name.split('.').pop()}`, extraFile);
          if (storageError) {
            alert(`Error subiendo extra: ${storageError.message}`);
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
        continue;
      }
      if (file && file instanceof File) {
        // Sube el archivo a Supabase Storage
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

    // Subir archivos extras
    if (Array.isArray(documents.extras)) {
      for (const file of documents.extras) {
        // Sube el archivo a Supabase Storage
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('employee-documents')
          .upload(`${employeeId}/extras/${file.name}`, file);

        if (storageError) {
          alert(`Error subiendo archivo extra ${file.name}: ${storageError.message}`);
          continue;
        }

        // Obtén la URL pública
        const { data: publicUrlData } = supabase
          .storage
          .from('employee-documents')
          .getPublicUrl(storageData.path);

        // Guarda el registro en employee_documents
        await supabase
          .from('employee_documents')
          .insert([{
            employee_id: employeeId,
            type: 'extra',
            file_url: publicUrlData.publicUrl,
            upload_date: new Date().toISOString(),
            expiration_date: null, // o maneja una fecha por defecto
            verified: false, // o true si lo verificas manualmente después
          }]);
      }
    }

    alert("Empleado y documentos guardados exitosamente.");
    // Limpia el wizard
    setIdentity({ firstName: "", middleInitial: "", lastName: "", gender: "", ssn: "", dob: "" });
    setContact({ street: "", apt: "", city: "", state: "", zip: "", phone: "", homePhone: "", email: "" });
    setJob({ role: "", employeeType: "", startDate: "", rate: "", status: "active" });
    setDocuments({ id: null, ssCard: null, passport: null, voidCheck: null, resume: null, fingerprint: null, certification: null, diploma: null, extras: [] });
    setExpiries({ id: "", ssCard: "", passport: "", voidCheck: "", resume: "", fingerprint: "", certification: "", diploma: "" });
    setStep(1);
  };

  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const fetchExpiringDocs = async () => {
      const today = new Date();
      const in30Days = new Date();
      in30Days.setDate(today.getDate() + 30);

      // Trae documentos que vencen en <=30 días o ya vencidos y no verificados
      const { data, error } = await supabase
        .from("employee_documents")
        .select(`
          id,
          type,
          expiration_date,
          verified,
          employee_id,
          employees (
            id,
            first_name,
            last_name
          )
        `)
        .or(`and(expiration_date.lte.${in30Days.toISOString().slice(0,10)},verified.eq.false),and(expiration_date.lt.${today.toISOString().slice(0,10)},verified.eq.false)`);

      if (!error && data) {
        setAlerts(data);
      }
    };

    fetchExpiringDocs();
  }, []);

  return (
    <div className="wizard">
      {/* Paso 1: Identidad legal */}
      {step === 1 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Identidad legal</h2>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="firstName" style={{ display: "block", fontWeight: 500 }}>First Name *</label>
            <input
              id="firstName"
              name="firstName"
              placeholder="First name"
              value={identity.firstName}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="middleInitial" style={{ display: "block", fontWeight: 500 }}>Middle Initial</label>
            <input
              id="middleInitial"
              name="middleInitial"
              placeholder="Middle initial"
              value={identity.middleInitial}
              onChange={handleIdentityChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="lastName" style={{ display: "block", fontWeight: 500 }}>Last Name *</label>
            <input
              id="lastName"
              name="lastName"
              placeholder="Last name"
              value={identity.lastName}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="gender" style={{ display: "block", fontWeight: 500 }}>Gender</label>
            <select
              id="gender"
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
            <label htmlFor="ssn" style={{ display: "block", fontWeight: 500 }}>Social Security Number *</label>
            <input
              id="ssn"
              name="ssn"
              placeholder="SSN"
              value={identity.ssn}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="dob" style={{ display: "block", fontWeight: 500 }}>Date of Birth *</label>
            <input
              id="dob"
              name="dob"
              type="date"
              value={identity.dob}
              onChange={handleIdentityChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <button
            disabled={!canContinueStep1}
            onClick={() => setStep(2)}
            style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Paso 2: Dirección y contacto */}
      {step === 2 && (
        <div style={{ maxWidth: 500, margin: "2rem auto", padding: 24, background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0001" }}>
          <h2 style={{ marginBottom: 24 }}>Dirección y contacto</h2>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="street" style={{ display: "block", fontWeight: 500 }}>Street Address *</label>
            <input
              id="street"
              name="street"
              placeholder="Street address"
              value={contact.street}
              onChange={handleContactChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="apt" style={{ display: "block", fontWeight: 500 }}>Apartment, suite, etc.</label>
            <input
              id="apt"
              name="apt"
              placeholder="Apartment, suite, unit, building, or floor"
              value={contact.apt}
              onChange={handleContactChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="city" style={{ display: "block", fontWeight: 500 }}>City *</label>
            <input
              id="city"
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
              <label htmlFor="state" style={{ display: "block", fontWeight: 500 }}>State *</label>
              <select
                id="state"
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
                {/* Agrega más estados según necesites */}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="zip" style={{ display: "block", fontWeight: 500 }}>Zip *</label>
              <input
                id="zip"
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
            <label htmlFor="phone" style={{ display: "block", fontWeight: 500 }}>Phone Number</label>
            <input
              id="phone"
              name="phone"
              placeholder="Phone number"
              value={contact.phone}
              onChange={handleContactChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="homePhone" style={{ display: "block", fontWeight: 500 }}>Home Phone Number</label>
            <input
              id="homePhone"
              name="homePhone"
              placeholder="Home phone number"
              value={contact.homePhone}
              onChange={handleContactChange}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="email" style={{ display: "block", fontWeight: 500 }}>Email *</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="Email"
              value={contact.email}
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
              disabled={!canContinueStep2}
              onClick={() => setStep(3)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
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
            <label htmlFor="role" style={{ display: "block", fontWeight: 500 }}>Puesto/Rol *</label>
            <select
              id="role"
              name="role"
              value={job.role}
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
            <label htmlFor="employeeType" style={{ display: "block", fontWeight: 500 }}>Tipo de empleado *</label>
            <select
              id="employeeType"
              name="employeeType"
              value={job.employeeType}
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
            <label htmlFor="startDate" style={{ display: "block", fontWeight: 500 }}>Fecha de inicio *</label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              value={job.startDate}
              onChange={handleJobChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="rate" style={{ display: "block", fontWeight: 500 }}>Salario/Tarifa *</label>
            <input
              id="rate"
              name="rate"
              placeholder="Ejemplo: 25.00"
              value={job.rate}
              onChange={handleJobChange}
              required
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="status" style={{ display: "block", fontWeight: 500 }}>Estado</label>
            <select
              id="status"
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
              disabled={!canContinueStep3}
              onClick={() => setStep(4)}
              style={{ padding: "10px 24px", fontWeight: 600, background: "#1e40af", color: "#fff", border: "none", borderRadius: 4 }}
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
            <label><b>ID oficial (foto):</b></label>
            <input type="file" name="id" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="id"
              value={expiries.id}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Social Security Card:</b></label>
            <input type="file" name="ssCard" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="ssCard"
              value={expiries.ssCard}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Passport / Green Card / Permiso de trabajo:</b></label>
            <input type="file" name="passport" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="passport"
              value={expiries.passport}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Voided Check:</b></label>
            <input type="file" name="voidCheck" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="voidCheck"
              value={expiries.voidCheck}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Resume:</b></label>
            <input type="file" name="resume" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="resume"
              value={expiries.resume}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Fingerprint:</b></label>
            <input type="file" name="fingerprint" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="fingerprint"
              value={expiries.fingerprint}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Certificaciones y licencias:</b></label>
            <input type="file" name="certification" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="certification"
              value={expiries.certification}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Diplomas:</b></label>
            <input type="file" name="diploma" accept="image/*,application/pdf" onChange={handleDocumentChange} />
            <input
              type="date"
              name="diploma"
              value={expiries.diploma}
              onChange={handleExpiryChange}
              style={{ marginLeft: 8 }}
            />
            <span style={{ marginLeft: 8 }}>Fecha de vencimiento</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label><b>Extras:</b></label>
            <input type="file" name="extras" multiple accept="image/*,application/pdf" onChange={handleDocumentChange} />
            {/* Si quieres fecha para extras, puedes agregar un input de fecha aquí para cada archivo extra */}
            <div>
              {Array.isArray(documents.extras) && documents.extras.length > 0 && (
                <ul>
                  {documents.extras.map((file, idx) => (
                    <li key={idx}>{file.name}</li>
                  ))}
                </ul>
              )}
            </div>
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
            <div><b>SSN:</b> {identity.ssn}</div>
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
            <div><b>Salario/Tarifa:</b> {job.rate}</div>
            <div><b>Estado:</b> {job.status === "active" ? "Activo" : "Inactivo"}</div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Documentos</h3>
            <div><b>Social Security Card:</b> {documents.ssCard ? "Cargado" : "No cargado"}</div>
            <div><b>Passport:</b> {documents.passport ? "Cargado" : "No cargado"}</div>
            <div><b>Void Check:</b> {documents.voidCheck ? "Cargado" : "No cargado"}</div>
            <div><b>Resume:</b> {documents.resume ? "Cargado" : "No cargado"}</div>
            <div><b>Fingerprint:</b> {documents.fingerprint ? "Cargado" : "No cargado"}</div>
            <div><b>Certification:</b> {documents.certification ? "Cargado" : "No cargado"}</div>
            <div><b>Diploma:</b> {documents.diploma ? "Cargado" : "No cargado"}</div>
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

      {/* Alertas de documentos próximos a vencer */}
      <div style={{ background: "#fffbe6", border: "1px solid #f59e42", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3 style={{ color: "#b45309", marginBottom: 12 }}>⚠️ Documentos próximos a vencer o vencidos</h3>
        {alerts.length === 0 && <div>No hay documentos próximos a vencer.</div>}
        <ul>
          {alerts.map(doc => (
            <li key={doc.id} style={{ marginBottom: 8 }}>
              <b>{doc.employees?.first_name} {doc.employees?.last_name}</b> — <b>{doc.type}</b> vence el <b>{doc.expiration_date ? new Date(doc.expiration_date).toLocaleDateString() : "Sin fecha"}</b>
              {new Date(doc.expiration_date) < new Date() && <span style={{ color: "red", marginLeft: 8 }}>(¡VENCIDO!)</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}