"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data, error } = await supabase.from("employees").select("*");
      if (!error) setEmployees(data || []);
    };
    fetchEmployees();
  }, []);

  const filtered = employees.filter((employee) => {
    return (
      (!search ||
        employee.first_name.toLowerCase().includes(search.toLowerCase()) ||
        employee.last_name.toLowerCase().includes(search.toLowerCase())) &&
      (!role || employee.role === role) &&
      (!status || employee.status === status)
    );
  });

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Employees</h1>

      <div className="flex justify-end mb-4 gap-2">
        <Link href="/employees/create">
          <button className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600">
            + New Employee
          </button>
        </Link>
      </div>

      <div className="flex flex-wrap mb-4 gap-2">
        <input
          type="text"
          placeholder="Search by name"
          className="border p-2 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="border p-2" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Role</option>
          <option value="RBT">RBT</option>
          <option value="BCBA">BCBA</option>
          <option value="CLINICIANS">CLINICIANS</option>
          <option value="TCM">TCM</option>
        </select>
        <select className="border p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b">First Name</th>
            <th className="py-2 px-4 border-b">Last Name</th>
            <th className="py-2 px-4 border-b">Email</th>
            <th className="py-2 px-4 border-b">Role</th>
            <th className="py-2 px-4 border-b">Status</th>
            <th className="py-2 px-4 border-b">Rate</th>
            <th className="py-2 px-4 border-b">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((employee) => (
            <tr key={employee.id}>
              <td className="py-2 px-4 border-b">{employee.first_name}</td>
              <td className="py-2 px-4 border-b">{employee.last_name}</td>
              <td className="py-2 px-4 border-b">{employee.email}</td>
              <td className="py-2 px-4 border-b">{employee.role}</td>
              <td className="py-2 px-4 border-b">{employee.status}</td>
              <td className="py-2 px-4 border-b">${employee.rate}</td>
              <td className="py-2 px-4 border-b">
                <Link href={`/employees/view/${employee.id}`}>
                  <button className="text-blue-500 hover:underline">View</button>
                </Link>
                <Link href={`/employees/${employee.id}`}>
                  <button className="text-blue-500 hover:underline ml-2">Edit</button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}