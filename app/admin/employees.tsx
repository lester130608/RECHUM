"use client";

import { useState } from 'react';

export default function Employees() {
  const [employees, setEmployees] = useState([
    // Datos de ejemplo
    { id: 1, firstName: 'Luisa', lastName: 'Smith', user: 'SmithL', role: 'Case Manager', status: 'Active' },
    { id: 2, firstName: 'Odelmis', lastName: 'Barrero', user: 'barreroo', role: 'Case Manager', status: 'Active' },
    // Añade más datos de ejemplo según sea necesario
  ]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');

  const handleSearch = () => {
    // Filtrar los empleados según los criterios de búsqueda
    const filteredEmployees = employees.filter(employee => {
      return (
        (search === '' || employee.firstName.toLowerCase().includes(search.toLowerCase()) || employee.lastName.toLowerCase().includes(search.toLowerCase())) &&
        (role === '' || employee.role === role) &&
        (status === '' || employee.status === status)
      );
    });
    setEmployees(filteredEmployees);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Employees</h1>
      <div className="flex mb-4">
        <input
          type="text"
          placeholder="First Name"
          className="border p-2 mr-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="text"
          placeholder="Last Name"
          className="border p-2 mr-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border p-2 mr-2"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">Role</option>
          <option value="Case Manager">Case Manager</option>
          <option value="Admin">Admin</option>
        </select>
        <select
          className="border p-2 mr-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button onClick={handleSearch} className="bg-blue-500 text-white p-2 rounded">Search</button>
      </div>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b">First Name</th>
            <th className="py-2 px-4 border-b">Last Name</th>
            <th className="py-2 px-4 border-b">User</th>
            <th className="py-2 px-4 border-b">Role</th>
            <th className="py-2 px-4 border-b">Status</th>
            <th className="py-2 px-4 border-b">Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td className="py-2 px-4 border-b">{employee.firstName}</td>
              <td className="py-2 px-4 border-b">{employee.lastName}</td>
              <td className="py-2 px-4 border-b">{employee.user}</td>
              <td className="py-2 px-4 border-b">{employee.role}</td>
              <td className="py-2 px-4 border-b">{employee.status}</td>
              <td className="py-2 px-4 border-b">
                <button className="text-blue-500 hover:underline">View</button>
                <button className="text-blue-500 hover:underline ml-2">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}