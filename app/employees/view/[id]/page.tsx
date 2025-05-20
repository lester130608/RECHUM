"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Employee Details</h1>
      <div className="space-y-2 text-sm">
        <p><strong>First Name:</strong> {employee.first_name}</p>
        <p><strong>Last Name:</strong> {employee.last_name}</p>
        <p><strong>Email:</strong> {employee.email}</p>
        <p><strong>Role:</strong> {employee.role}</p>
        <p><strong>Status:</strong> {employee.status}</p>
        <p><strong>Rate:</strong> ${employee.rate}</p>
        <p><strong>Employment Type:</strong> {employee.employment_type}</p>
      </div>
    </div>
  );
}