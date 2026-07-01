"use client";

// app/payroll/runs/[id]/input/page.tsx
// Supervisor payroll input screen
// Date: March 2, 2026

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string;
  status: string;
}

interface PayrollInputRow {
  id: string; // temporary ID for UI
  worker_id: string;
  worker_name: string;
  service_code: string;
  units: number;
  hours: number;
  memo: string;
}

interface ServiceCode {
  code: string;
  description: string;
  pay_method: 'hourly' | 'per_unit' | 'flat';
}

const defaultServiceCodes: ServiceCode[] = [
  { code: 'REG', description: 'Regular Hours', pay_method: 'hourly' },
  { code: 'OT', description: 'Overtime', pay_method: 'hourly' },
  { code: 'ASSESS', description: 'Assessment', pay_method: 'per_unit' },
  { code: 'LEAD', description: 'Lead/Supervision', pay_method: 'hourly' },
  { code: 'INTAKE', description: 'Intake', pay_method: 'per_unit' },
  { code: 'TRAINING', description: 'Training', pay_method: 'hourly' },
  { code: 'ADMIN', description: 'Administrative', pay_method: 'hourly' },
  { code: 'BONUS', description: 'Bonus', pay_method: 'flat' },
];

export default function PayrollInputPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();
  const payRunId = params?.id as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [department, setDepartment] = useState<'BA' | 'TCM' | 'CMHC' | 'PSYQ'>('BA');
  const [rows, setRows] = useState<PayrollInputRow[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>(defaultServiceCodes);
  
  // Pay run info
  const [payRun, setPayRun] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    if (!userLoading && user && payRunId) {
      fetchUserRole();
      fetchPayRun();
      fetchWorkers();
      addEmptyRow(); // Start with one empty row
    }
  }, [user, payRunId, userLoading]);

  const fetchUserRole = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id)
        .single();
      
      setUserRole(profile?.role || 'employee');
    } catch (err: any) {
      console.error('Error fetching user role:', err);
      setUserRole('employee');
    }
  };

  const fetchPayRun = async () => {
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch pay run');
      }

      setPayRun(data);

      // Check if pay run is locked
      if (['exported', 'locked'].includes(data.status)) {
        setError('This pay run is locked and cannot be modified.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, full_name, email, status')
        .eq('status', 'active')
        .order('first_name');

      if (error) throw error;
      setWorkers(data || []);
    } catch (err: any) {
      console.error('Error fetching workers:', err);
    }
  };

  const generateRowId = () => {
    return `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const addEmptyRow = () => {
    const newRow: PayrollInputRow = {
      id: generateRowId(),
      worker_id: '',
      worker_name: '',
      service_code: '',
      units: 0,
      hours: 0,
      memo: ''
    };
    setRows(prev => [...prev, newRow]);
  };

  const removeRow = (rowId: string) => {
    setRows(prev => prev.filter(row => row.id !== rowId));
  };

  const updateRow = (rowId: string, field: keyof PayrollInputRow, value: any) => {
    setRows(prev => prev.map(row => {
      if (row.id === rowId) {
        const updatedRow = { ...row, [field]: value };
        
        // Auto-populate worker_name when worker_id changes
        if (field === 'worker_id' && value) {
          const worker = workers.find(w => w.id === value);
          if (worker) {
            updatedRow.worker_name = worker.full_name || `${worker.first_name} ${worker.last_name}`;
          }
        }
        
        // Auto-populate worker_id when worker_name changes (search)
        if (field === 'worker_name' && value && !updatedRow.worker_id) {
          const worker = workers.find(w => 
            (w.full_name && w.full_name.toLowerCase().includes(value.toLowerCase())) ||
            `${w.first_name} ${w.last_name}`.toLowerCase().includes(value.toLowerCase())
          );
          if (worker) {
            updatedRow.worker_id = worker.id;
          }
        }
        
        return updatedRow;
      }
      return row;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!department) {
      alert('Please select a department');
      return;
    }

    // Filter out empty rows and validate
    const validRows = rows.filter(row => 
      row.worker_id && row.service_code && (row.hours > 0 || row.units > 0)
    );

    if (validRows.length === 0) {
      alert('Please add at least one valid row with worker, service code, and hours/units');
      return;
    }

    // Convert to API format
    const payload = validRows.map(row => ({
      worker_id: row.worker_id,
      worker_name: row.worker_name,
      department,
      service_code: row.service_code,
      units: row.units || undefined,
      hours: row.hours || undefined,
      memo: row.memo || undefined,
      week_ending: payRun?.week_ending
    }));

    setSubmitting(true);
    
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}/inputs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department,
          payload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit payroll input');
      }

      alert('Payroll input submitted successfully!');
      router.push(`/payroll/runs/${payRunId}`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getServiceCodeDescription = (code: string) => {
    const serviceCode = serviceCodes.find(sc => sc.code === code);
    return serviceCode ? `${code} - ${serviceCode.description}` : code;
  };

  const getServiceCodePayMethod = (code: string) => {
    const serviceCode = serviceCodes.find(sc => sc.code === code);
    return serviceCode?.pay_method || 'hourly';
  };

  if (userLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading user session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-center text-gray-600">Please log in to submit payroll inputs.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !payRun) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error: {error || 'Pay run not found'}
        </div>
        <Link href="/payroll/runs" className="text-blue-600 hover:underline mt-4 inline-block">
          ← Back to Pay Runs
        </Link>
      </div>
    );
  }

  // Check permissions
  const canSubmitInputs = ['supervisor', 'ba', 'admin'].includes(userRole) && !['exported', 'locked'].includes(payRun.status);
  
  if (!canSubmitInputs) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          You don't have permission to submit inputs for this pay run, or it's locked.
        </div>
        <Link href={`/payroll/runs/${payRunId}`} className="text-blue-600 hover:underline mt-4 inline-block">
          ← Back to Pay Run
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/payroll/runs/${payRunId}`} className="text-blue-600 hover:underline text-sm">
          ← Back to Pay Run Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-1">
          Submit Payroll Input
        </h1>
        <p className="text-gray-600">
          Week Ending: {new Date(payRun.week_ending).toLocaleDateString()}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Department Selection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Department</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['BA', 'TCM', 'CMHC', 'PSYQ'] as const).map((dept) => (
              <label key={dept} className="flex items-center">
                <input
                  type="radio"
                  name="department"
                  value={dept}
                  checked={department === dept}
                  onChange={(e) => setDepartment(e.target.value as any)}
                  className="mr-2"
                />
                <span className="text-sm font-medium">{dept}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Input Table */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold">Payroll Entries</h2>
            <button
              type="button"
              onClick={addEmptyRow}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
            >
              Add Row
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Worker</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Memo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => {
                  const payMethod = getServiceCodePayMethod(row.service_code);
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3">
                        <select
                          value={row.worker_id}
                          onChange={(e) => updateRow(row.id, 'worker_id', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Worker...</option>
                          {workers.map((worker) => (
                            <option key={worker.id} value={worker.id}>
                              {worker.full_name || `${worker.first_name} ${worker.last_name}`}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.service_code}
                          onChange={(e) => updateRow(row.id, 'service_code', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Service...</option>
                          {serviceCodes.map((sc) => (
                            <option key={sc.code} value={sc.code}>
                              {getServiceCodeDescription(sc.code)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={row.hours || ''}
                          onChange={(e) => updateRow(row.id, 'hours', parseFloat(e.target.value) || 0)}
                          disabled={payMethod === 'per_unit'}
                          placeholder={payMethod === 'hourly' ? 'Required' : 'N/A'}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.units || ''}
                          onChange={(e) => updateRow(row.id, 'units', parseInt(e.target.value) || 0)}
                          disabled={payMethod === 'hourly'}
                          placeholder={payMethod === 'per_unit' ? 'Required' : 'Optional'}
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.memo}
                          onChange={(e) => updateRow(row.id, 'memo', e.target.value)}
                          placeholder="Optional note..."
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="text-red-600 hover:text-red-900 text-sm font-medium"
                          disabled={rows.length === 1}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">Instructions:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Select the department you're submitting for</li>
            <li>• Choose workers from the dropdown or search by name</li>
            <li>• Select the appropriate service code for the work performed</li>
            <li>• Enter hours for hourly services, units for per-unit services</li>
            <li>• Add optional memo for context</li>
            <li>• You can submit multiple entries per worker for different service codes</li>
          </ul>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link
            href={`/payroll/runs/${payRunId}`}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Payroll Input'}
          </button>
        </div>
      </form>
    </div>
  );
}