'use client'
import { useState } from "react";

export default function EmployeeWizard() {
  const [step, setStep] = useState(1);

  // Estados para los datos
  const [personal, setPersonal] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    ssn: "",
    address: "",
    phone: "",
    email: "",
  });
  const [job, setJob] = useState({
    role: "",
    employeeType: "",
    startDate: "",
    rate: "",
    status: "active",
  });
  const [documents, setDocuments] = useState<{ [key: string]: File | null }>({
    id: null,
    contract: null,
  });

  // Manejo de cambios
  const handlePersonalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPersonal({ ...personal, [e.target.name]: e.target.value });
  };
  const handleJobChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setJob({ ...job, [e.target.name]: e.target.value });
  };
  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocuments({ ...documents, [e.target.name]: e.target.files?.[0] || null });
  };

  // Validaciones mínimas por paso
  const canContinueStep1 = personal.firstName && personal.lastName && personal.email;
  const canContinueStep2 = job.role && job.employeeType && job.startDate && job.rate;

  // Simulación de submit final
  const handleFinish = () => {
    alert("Empleado creado (simulado). Puedes conectar aquí tu lógica de guardado.");
    // Aquí puedes llamar a tu API o lógica de guardado
  };

  return (
    <div className="wizard">
      {/* Paso 1: Datos personales */}
      {step === 1 && (
        <div>
          <h2>Datos personales</h2>
          <input name="firstName" placeholder="Nombre" value={personal.firstName} onChange={handlePersonalChange} required />
          <input name="lastName" placeholder="Apellido" value={personal.lastName} onChange={handlePersonalChange} required />
          <input name="dob" type="date" placeholder="Fecha de nacimiento" value={personal.dob} onChange={handlePersonalChange} />
          <input name="ssn" placeholder="SSN" value={personal.ssn} onChange={handlePersonalChange} />
          <input name="address" placeholder="Dirección" value={personal.address} onChange={handlePersonalChange} />
          <input name="phone" placeholder="Teléfono" value={personal.phone} onChange={handlePersonalChange} />
          <input name="email" type="email" placeholder="Email" value={personal.email} onChange={handlePersonalChange} required />
          <button disabled={!canContinueStep1} onClick={() => setStep(2)}>Siguiente</button>
        </div>
      )}

      {/* Paso 2: Información laboral */}
      {step === 2 && (
        <div>
          <h2>Información laboral</h2>
          <input name="role" placeholder="Puesto/Rol" value={job.role} onChange={handleJobChange} required />
          <input name="employeeType" placeholder="Tipo de empleado" value={job.employeeType} onChange={handleJobChange} required />
          <input name="startDate" type="date" placeholder="Fecha de inicio" value={job.startDate} onChange={handleJobChange} required />
          <input name="rate" placeholder="Salario/Tarifa" value={job.rate} onChange={handleJobChange} required />
          <select name="status" value={job.status} onChange={handleJobChange}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
          <button onClick={() => setStep(1)}>Atrás</button>
          <button disabled={!canContinueStep2} onClick={() => setStep(3)}>Siguiente</button>
        </div>
      )}

      {/* Paso 3: Subida de documentos */}
      {step === 3 && (
        <div>
          <h2>Documentos requeridos</h2>
          <label>
            Identificación oficial:
            <input type="file" name="id" accept="application/pdf,image/*" onChange={handleDocumentChange} required />
          </label>
          <label>
            Contrato firmado:
            <input type="file" name="contract" accept="application/pdf,image/*" onChange={handleDocumentChange} required />
          </label>
          <button onClick={() => setStep(2)}>Atrás</button>
          <button onClick={() => setStep(4)}>Siguiente</button>
        </div>
      )}

      {/* Paso 4: Confirmación */}
      {step === 4 && (
        <div>
          <h2>Confirmación</h2>
          <pre>{JSON.stringify({ personal, job, documents: Object.keys(documents) }, null, 2)}</pre>
          <button onClick={() => setStep(3)}>Atrás</button>
          <button onClick={handleFinish}>Finalizar</button>
        </div>
      )}
    </div>
  );
}