'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { supabase } from '@/lib/supabaseClient';

type EmployeeListRow = {
  employee_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  configs: {
    id: string;
    role: string;
    tax_type: string;
    valid_from: string;
    rates: unknown[];
  }[];
};

export default function PayConfigurationPage() {
  const { hasPermission, loading: userLoading } = useUser();
  const [employees, setEmployees] = useState<EmployeeListRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    async function loadEmployees() {
      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const response = await fetch('/api/pay-config/employees', {
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
        });
        const payload = await response.json();

        if (!response.ok) {
          setError(`HTTP ${response.status}`);
          setMessage({ type: 'error', text: payload.error || 'Unable to load pay configurations.' });
          setEmployees([]);
          return;
        }

        const rows = Array.isArray(payload) ? payload : payload.employees || [];
        setEmployees(rows);
      } catch (error: any) {
        setError(error?.message || 'Unable to load pay configurations.');
        setMessage({ type: 'error', text: error?.message || 'Unable to load pay configurations.' });
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    }

    loadEmployees();
  }, []);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const lastNameCompare = (a.last_name || '').localeCompare(b.last_name || '');
      if (lastNameCompare !== 0) return lastNameCompare;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [employees]);

  const filteredEmployees = sortedEmployees.filter((employee) => {
    const term = search.toLowerCase();
    const fullName = `${employee.first_name || ''} ${employee.last_name || ''} ${employee.full_name || ''}`.toLowerCase();
    return !term || fullName.includes(term);
  });

  const configuredCount = employees.filter((employee) => employee.configs.length > 0).length;

  if (userLoading) {
    return <div className="p-6 max-w-7xl mx-auto text-gray-500">Loading permissions...</div>;
  }

  if (!hasPermission('manage_employees')) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">
          You do not have permission to manage employee pay configurations.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pay Configuration</h1>
        <p className="text-sm text-gray-600 mt-1">
          {configuredCount} employees configured / {employees.length} total
        </p>
      </div>

      {message && (
        <div
          className={`border rounded p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="Search by name"
          className="border rounded px-2 py-1 w-full sm:max-w-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="overflow-x-auto border rounded bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="text-left font-semibold px-4 py-3">Last Name</th>
              <th className="text-left font-semibold px-4 py-3">First Name</th>
              <th className="text-left font-semibold px-4 py-3">Active Roles</th>
              <th className="text-left font-semibold px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  Loading employees...
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((employee) => (
                <tr key={employee.employee_id} className="border-t">
                  <td className="px-4 py-3">{employee.last_name}</td>
                  <td className="px-4 py-3">{employee.first_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {employee.configs.length === 0 ? (
                        <span className="text-gray-500">No active roles</span>
                      ) : (
                        employee.configs.map((config) => (
                          <span
                            key={config.id}
                            className="inline-flex items-center rounded bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 text-xs font-medium"
                          >
                            {config.role} - {config.tax_type}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/pay-configuration/${employee.employee_id}`}>
                      <span className="inline-flex bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">
                        View / Edit
                      </span>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
