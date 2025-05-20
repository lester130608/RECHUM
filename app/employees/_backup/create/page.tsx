"use client";
export const dynamic = 'force-dynamic';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const roles = ["RBT", "BCABA", "BCBA", "CLINICIANS", "TCM", "EMPLOYEE"];
const employmentTypes = ["W-2", "1099"];
const statuses = ["active", "inactive"];

export default function NewEmployeePage() {
  const router = useRouter();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    rate: "",
    role: "",
    employee_type: "",
    employment_type: "W-2",
    status: "active",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("employees").insert([
      {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        rate: form.rate ? parseFloat(form.rate) : null,
        role: form.role,
        employee_type: form.role, // asignamos el mismo valor para simplificar
        employment_type: form.employment_type,
        status: form.status,
      },
    ]);

    if (error) {
      alert("Error saving employee: " + error.message);
    } else {
      router.push("/employees");
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Nuevo Empleado</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nombre y Apellido */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-medium mb-1">First Name *</label>
            <input
              type="text"
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Last Name *</label>
            <input
              type="text"
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              required
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block font-medium mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {/* Rate */}
        <div>
          <label className="block font-medium mb-1">Rate ($/hr)</label>
          <input
            type="number"
            step="0.01"
            name="rate"
            value={form.rate}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        {/* Role */}
        <div>
          <label className="block font-medium mb-1">Role *</label>
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Seleccionar</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de Empleo */}
        <div>
          <label className="block font-medium mb-1">Employment Type *</label>
          <select
            name="employment_type"
            value={form.employment_type}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          >
            {employmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Estado */}
        <div>
          <label className="block font-medium mb-1">Status *</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Botones */}
        <div className="flex gap-3 mt-4">
          <button
            type="submit"
            className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => router.push("/employees")}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}