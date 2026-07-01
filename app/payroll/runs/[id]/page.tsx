"use client";

// app/payroll/runs/[id]/page.tsx
// Pay run dashboard - individual pay run management
// Date: March 2, 2026

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface PayRun {
  id: string;
  week_ending: string;
  status: 'draft' | 'review_ready' | 'approved' | 'exported' | 'locked';
  created_at: string;
  approved_at?: string;
  exported_at?: string;
  locked_at?: string;
  notes?: string;
  totals: {
    total_workers: number;
    total_hours: number;
    total_amount: number;
    total_exceptions: number;
    by_status: Record<string, number>;
  };
  by_department: Record<string, {
    submissions: number;
    submitted_by: Array<{
      name: string;
      submitted_at: string;
    }>;
  }>;
  pay_run_items: Array<{
    id: string;
    status: string;
    calc_total_hours: number;
    calc_total_amount: number;
    exceptions_count: number;
    employees: {
      id: string;
      first_name: string;
      last_name: string;
      full_name?: string;
      email: string;
    };
  }>;
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  review_ready: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  exported: 'bg-purple-100 text-purple-800',
  locked: 'bg-red-100 text-red-800'
};

const statusLabels = {
  draft: 'Draft',
  review_ready: 'Ready for Review',
  approved: 'Approved',
  exported: 'Exported',
  locked: 'Locked'
};

export default function PayRunDashboard() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();
  const payRunId = params?.id as string;
  
  const [payRun, setPayRun] = useState<PayRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string>('');

  useEffect(() => {
    if (!userLoading && user && payRunId) {
      fetchUserRole();
      fetchPayRun();
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    setActionLoading('calculating');
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}/calculate`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.has_errors) {
        alert(`Calculation completed with ${data.issues.filter((i: any) => i.type === 'error').length} errors. Please review the issues.`);
      } else if (data.has_warnings) {
        alert(`Calculation completed with ${data.issues.filter((i: any) => i.type === 'warning').length} warnings.`);
      } else {
        alert('Calculation completed successfully!');
      }

      // Refresh pay run data
      await fetchPayRun();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this pay run? This will lock it from further edits.')) {
      return;
    }

    setActionLoading('approving');
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}/approve`, {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve pay run');
      }

      alert('Pay run approved successfully!');
      await fetchPayRun();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleExport = async () => {
    setActionLoading('exporting');
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}/export`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export pay run');
      }

      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_export_${payRun?.week_ending}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert('Export completed successfully!');
      await fetchPayRun();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleLock = async () => {
    if (!confirm('Are you sure you want to lock this pay run? This action cannot be undone and will prevent all future edits.')) {
      return;
    }

    setActionLoading('locking');
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}/lock`, {
        method: 'POST'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to lock pay run');
      }

      alert('Pay run locked successfully!');
      await fetchPayRun();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
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
        <p className="text-center text-gray-600">Please log in to view this pay run.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading pay run...</p>
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

  const canSubmitInputs = ['supervisor', 'ba', 'admin'].includes(userRole) && !['exported', 'locked'].includes(payRun.status);
  const canCalculate = ['ba', 'admin'].includes(userRole) && !['exported', 'locked'].includes(payRun.status);
  const canApprove = userRole === 'admin' && payRun.status === 'review_ready';
  const canExport = userRole === 'admin' && payRun.status === 'approved';
  const canLock = userRole === 'admin' && payRun.status === 'exported';

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href="/payroll/runs" className="text-blue-600 hover:underline text-sm">
            ← Back to Pay Runs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">
            Pay Run: {formatDate(payRun.week_ending)}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[payRun.status]}`}>
              {statusLabels[payRun.status]}
            </span>
            {payRun.notes && (
              <span className="text-sm text-gray-600">Note: {payRun.notes}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {canSubmitInputs && (
            <Link
              href={`/payroll/runs/${payRunId}/input`}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Submit Inputs
            </Link>
          )}
          
          {canCalculate && (
            <button
              onClick={handleCalculate}
              disabled={actionLoading === 'calculating'}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {actionLoading === 'calculating' ? 'Calculating...' : 'Calculate'}
            </button>
          )}

          {canApprove && (
            <button
              onClick={handleApprove}
              disabled={actionLoading === 'approving'}
              className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {actionLoading === 'approving' ? 'Approving...' : 'Approve'}
            </button>
          )}

          {canExport && (
            <button
              onClick={handleExport}
              disabled={actionLoading === 'exporting'}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {actionLoading === 'exporting' ? 'Exporting...' : 'Export ADP'}
            </button>
          )}

          {canLock && (
            <button
              onClick={handleLock}
              disabled={actionLoading === 'locking'}
              className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {actionLoading === 'locking' ? 'Locking...' : 'Lock'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Workers</h3>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{payRun.totals.total_workers}</p>
        </div>
        <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Hours</h3>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{payRun.totals.total_hours.toFixed(1)}</p>
        </div>
        <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
          <p className="text-3xl font-semibold text-gray-900 mt-2">{formatCurrency(payRun.totals.total_amount)}</p>
        </div>
        <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Exceptions</h3>
          <p className={`text-3xl font-semibold mt-2 ${payRun.totals.total_exceptions > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {payRun.totals.total_exceptions}
          </p>
        </div>
      </div>

      {/* Department Submissions */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Department Submissions</h2>
        </div>
        <div className="p-6">
          {Object.keys(payRun.by_department).length === 0 ? (
            <p className="text-gray-500 text-center py-4">No submissions yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(payRun.by_department).map(([dept, info]) => (
                <div key={dept} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900">{dept}</h3>
                  <p className="text-sm text-gray-600">{info.submissions} submission(s)</p>
                  <div className="mt-2 space-y-1">
                    {info.submitted_by.map((submitter, idx) => (
                      <div key={idx} className="text-xs text-gray-500">
                        {submitter.name} - {formatDateTime(submitter.submitted_at)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Worker Items */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Worker Pay Items</h2>
        </div>
        <div className="overflow-x-auto">
          {payRun.pay_run_items.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No pay items calculated yet. Submit inputs and run calculation.</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Worker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Exceptions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payRun.pay_run_items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {item.employees.full_name || `${item.employees.first_name} ${item.employees.last_name}`}
                      </div>
                      <div className="text-sm text-gray-500">{item.employees.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        item.status === 'needs_fix' ? 'bg-red-100 text-red-800' :
                        item.status === 'ready' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.calc_total_hours.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(item.calc_total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.exceptions_count > 0 ? (
                        <span className="text-red-600 font-medium">{item.exceptions_count}</span>
                      ) : (
                        <span className="text-green-600">✓</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link
                        href={`/payroll/runs/${payRunId}/review?worker=${item.employees.id}`}
                        className="text-blue-600 hover:text-blue-900 transition-colors"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Timestamps */}
      {(payRun.approved_at || payRun.exported_at || payRun.locked_at) && (
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Timeline</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div>Created: {formatDateTime(payRun.created_at)}</div>
            {payRun.approved_at && <div>Approved: {formatDateTime(payRun.approved_at)}</div>}
            {payRun.exported_at && <div>Exported: {formatDateTime(payRun.exported_at)}</div>}
            {payRun.locked_at && <div>Locked: {formatDateTime(payRun.locked_at)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}