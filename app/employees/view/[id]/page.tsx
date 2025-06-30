"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ViewEmployeePage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState<any>(null);

  useEffect(() => {
    const fetchEmployee = async () => {
      const { data } = await supabase.from("employees").select("*").eq("id", id).single();
      setEmployee(data);
    };
    fetchEmployee();
  }, [id]);

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