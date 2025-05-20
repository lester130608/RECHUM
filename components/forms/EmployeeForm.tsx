"use client";

import { useEffect, useState } from "react";

const roles = ["RBT", "BCABA", "BCBA", "CLINICIANS", "TCM", "PSYCHIATRY", "EMPLOYEE"];
const statuses = ["active", "inactive"];

type Props = {
  initialValues?: {
    firstName: string;
    lastName: string;
    title: string;
    credential: string;
    email: string;
    role: string;
    status: string;
    rate: string;
  };
  onSubmit: (form: any) => void;
  onCancel?: () => void;
};

export function EmployeeForm({ initialValues, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState(
    initialValues || {
      firstName: "",
      lastName: "",
      title: "",
      credential: "",
      email: "",
      role: "",
      status: "active",
      rate: "",
    }
  );

  const [services, setServices] = useState<string[]>([]);

  useEffect(() => {
    if (form.role) {
      fetchServicesForRole(form.role);
    } else {
      setServices([]);
    }
  }, [form.role]);

  const fetchServicesForRole = async (role: string) => {
    const res = await fetch("/api/role-services?role=" + role);
    const data = await res.json();
    setServices(data || []);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {[
        { label: "First Name", name: "firstName" },
        { label: "Last Name", name: "lastName" },
        { label: "Title", name: "title" },
        { label: "Credential", name: "credential" },
        { label: "Email Address", name: "email", type: "email" },
        { label: "Rate ($/hr)", name: "rate", type: "number" },
      ].map(({ label, name, type = "text" }) => (
        <div key={name}>
          <label className="block font-medium mb-1">{label} *</label>
          <input
            type={type}
            name={name}
            value={form[name as keyof typeof form]}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2"
          />
        </div>
      ))}

      <div>
        <label className="block font-medium mb-1">Role *</label>
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block font-medium mb-1">Status *</label>
        <select
          name="status"
          value={form.status}
          onChange={handleChange}
          required
          className="w-full border rounded px-3 py-2"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {services.length > 0 && (
        <div className="text-sm text-gray-700">
          <p className="font-medium mb-1">Services available for this role:</p>
          <ul className="list-disc list-inside text-xs">
            {services.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-start gap-2">
        <button
          type="submit"
          className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600"
        >
          Save
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-300 text-black px-4 py-2 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
