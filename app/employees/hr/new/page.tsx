'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import EmployeeTypeSelector from "@/components/EmployeeTypeSelector";
import EmployeeWizardW2 from "@/components/EmployeeWizardW2";
import EmployeeWizard1099 from "@/components/EmployeeWizard1099";

function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('')
}

export default function NewEmployeePage() {
  const [email, setEmail] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'invite' | 'manual'>('invite');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [type, setType] = useState<"w2" | "1099" | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage('');
    setGeneratedPassword('');

    const password = generatePassword();
    setGeneratedPassword(password);

    const { error: userError } = await supabase.from('users').insert({
      email,
      password,
      role: 'employee',
      name: mode === 'manual' ? `${firstName} ${lastName}` : 'New Employee'
    });

    if (userError) {
      setStatusMessage('❌ Error creating user: ' + userError.message);
      setLoading(false);
      return;
    }

    // Solo envía email si es modo "invite"
    if (mode === 'invite') {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!result.success) {
        setStatusMessage('⚠️ User created, but failed to send email invitation.');
      }
    }

    const { error: empError } = await supabase.from('employees').insert({
      email,
      first_name: mode === 'manual' ? firstName : 'Pending',
      last_name: mode === 'manual' ? lastName : 'Pending',
      role: 'employee',
      employee_type: 'employee',
      status: 'active',
      ready_for_payroll: false,
      created_at: new Date().toISOString(),
    });

    if (empError) {
      setStatusMessage('⚠️ User created, but error creating employee: ' + empError.message);
    } else {
      setStatusMessage('✅ Employee created successfully' + (mode === 'invite' ? ' (email sent)' : ''));
    }

    setLoading(false);
  }

  if (!type) {
    return (
      <div>
        <EmployeeTypeSelector onSelect={setType} />
        <p style={{color: 'gray', marginTop: 16}}>Selecciona el tipo de empleado para continuar.</p>
      </div>
    );
  }

  // Solo renderiza el wizard correspondiente
  return (
    <div className="container">
      <h1 className="heading">Crear Nuevo Empleado ({type === "w2" ? "W-2" : "1099"})</h1>
      {type === "w2" && <EmployeeWizardW2 />}
      {type === "1099" && <EmployeeWizard1099 />}
    </div>
  )
}