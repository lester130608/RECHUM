import { NextRequest, NextResponse } from 'next/server';

const employees = [
  { id: 1, firstName: 'Luisa', lastName: 'Smith', user: 'SmithL', role: 'Case Manager', status: 'Active' },
  { id: 2, firstName: 'Odelmis', lastName: 'Barrero', user: 'barreroo', role: 'Case Manager', status: 'Active' },
  // Añade más datos de ejemplo según sea necesario
];

export async function GET(req: NextRequest) {
  const { search, role, status } = req.nextUrl.searchParams;

  let filteredEmployees = employees;

  if (search) {
    filteredEmployees = filteredEmployees.filter(employee =>
      employee.firstName.toLowerCase().includes(search.toLowerCase()) ||
      employee.lastName.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (role) {
    filteredEmployees = filteredEmployees.filter(employee => employee.role === role);
  }

  if (status) {
    filteredEmployees = filteredEmployees.filter(employee => employee.status === status);
  }

  return NextResponse.json(filteredEmployees);
}