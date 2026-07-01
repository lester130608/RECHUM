"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import EmployeeDocumentsList from '@/components/EmployeeDocumentsList';
import EmployeeWizardW2 from '@/components/EmployeeWizardW2';

export default function ViewEmployeePage() {
  const params = useParams();
  // Protección robusta para params y id
  const debug = false;
  if (!params || !params.id) {
    return <div style={{color: 'red', padding: 24}}>Error: No se encontró el ID del empleado. Por favor, regresa e inténtalo de nuevo.</div>;
  }
  const id = Array.isArray(params.id) ? params.id[0] : params.id as string;
  const [employee, setEmployee] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchEmployee = async () => {
      setFetching(true);
      try {
        const { data, error } = await supabase.from("employees").select("*").eq("id", id).single();
        if (error || !data) {
          setErrorMsg("No se pudo cargar el empleado. " + (error?.message || "No encontrado"));
          setEmployee(null);
        } else {
          setEmployee(data);
        }
      } catch (err: any) {
        setErrorMsg("Error inesperado: " + (err?.message || err));
        setEmployee(null);
      } finally {
        setFetching(false);
      }
    };
    fetchEmployee();
  }, [id]);


  // ...existing code...
  if (errorMsg) return <div style={{color: 'red', padding: 24}}>{errorMsg}</div>;
  if (!employee) return <p className="p-4">Loading...</p>;

  return (
    <div className="container">
      <h1 className="heading">Employee Details</h1>
      <div className="section text-sm space-y-2">
        <p><strong>First Name:</strong> {employee.first_name}</p>
        <p><strong>Last Name:</strong> {employee.last_name}</p>
        <p><strong>Email:</strong> {employee.email}</p>
        <p><strong>Role:</strong> {employee.role}</p>
        <p><strong>Status:</strong> {employee.status}</p>
        <p><strong>Rate:</strong> ${employee.rate}</p>
        <p><strong>Employment Type:</strong> {employee.employment_type}</p>
      </div>

      {/* Documentos del empleado */}
      <EmployeeDocumentsList employeeId={employee.id} />

      {/* Wizard de onboarding */}
      <div style={{ marginTop: "2rem" }}>
        <EmployeeWizardW2 />
      </div>

      <div style={{ marginTop: "2rem" }}>
        <button
          onClick={() => window.location.href = "/employees/hr/all"}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#6b7280",
            color: "white",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Back to All Employees
        </button>
      </div>
    </div>
  );
}