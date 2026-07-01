"use client";

// app/payroll/runs/[id]/review/page.tsx
// BA review screen for payroll validation and exception handling
// Date: March 2, 2026

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface PayRunItem {
  id: string;
  worker_id: string;
  status: 'draft' | 'needs_fix' | 'ready' | 'approved' | 'locked';
  calc_total_hours: number;
  calc_total_amount: number;
  exceptions_count: number;
  employees: {
    id: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    email: string;
    adp_worker_id?: string;
    file_number?: string;
  };
}

interface PayLine {
  id: string;
  line_type: 'hours' | 'earning' | 'adjustment';
  code: string;
  units?: number;
  hours?: number;
  rate: number;
  amount: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  code: string;
  message: string;
  row_index?: number;
  field?: string;
  details?: Record<string, unknown>;
}

interface PayRun {
  id: string;
  week_ending?: string;
  status?: string;
  created_at?: string;
  approved_at?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
  totals?: {
    total_workers?: number;
    total_hours?: number;
    total_amount?: number;
    total_exceptions?: number;
    items_needing_fix?: number;
  };
}

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Unexpected error';
};

export default function PayrollReviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: userLoading } = useSupabaseUser();
  const payRunId = params?.id as string;
  const selectedWorkerId = searchParams?.get('worker');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  
  // Pay run data
  const [payRun, setPayRun] = useState<PayRun | null>(null);
  const [payRunItems, setPayRunItems] = useState<PayRunItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PayRunItem | null>(null);
  const [payLines, setPayLines] = useState<PayLine[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  
  // Actions
  const [actionLoading, setActionLoading] = useState<string>('');

  useEffect(() => {
    if (!userLoading && user && payRunId) {
      fetchUserRole();
      fetchPayRun();
      fetchPayRunItems();
    }
  }, [user, payRunId, userLoading]);

  useEffect(() => {
    if (selectedWorkerId && payRunItems.length > 0) {
      const item = payRunItems.find(item => item.employees.id === selectedWorkerId);
      if (item) {
        setSelectedItem(item);
        fetchPayLines(item.id);
      }
    }
  }, [selectedWorkerId, payRunItems]);

  const fetchUserRole = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id)
        .single();
      
      setUserRole(profile?.role || 'employee');
    } catch (err) {
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
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const fetchPayRunItems = async () => {
    try {
      const { data, error } = await supabase
        .from('pay_run_items')
        .select(`
          *,
          employees (
            id,
            first_name,
            last_name,
            full_name,
            email,
            adp_worker_id,
            file_number
          )
        `)
        .eq('pay_run_id', payRunId)
        .order('employees(first_name)');

      if (error) throw error;
      setPayRunItems(data || []);
    } catch (err) {
      console.error('Error fetching pay run items:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayLines = async (payRunItemId: string) => {
    try {
      const { data, error } = await supabase
        .from('pay_lines')
        .select('*')
        .eq('pay_run_item_id', payRunItemId)
        .order('created_at');

      if (error) throw error;
      setPayLines(data || []);
    } catch (err) {
      console.error('Error fetching pay lines:', err);
      setPayLines([]);
    }
  };

  const handleRecalculate = async () => {
    setActionLoading('recalculating');
    try {
      const response = await fetch(`/api/payroll/runs/${payRunId}/calculate`, {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok) {
        setValidationIssues(data.issues || []);
        alert('Recalculation completed! Check for any new issues.');
        
        // Refresh data
        await fetchPayRunItems();
        if (selectedItem) {
          await fetchPayLines(selectedItem.id);
        }
      } else {
        throw new Error(data.error || 'Recalculation failed');
      }
    } catch (err) {
      alert(`Error: ${getErrorMessage(err)}`);
    } finally {
      setActionLoading('');
    }
  };

  const selectItem = (item: PayRunItem) => {
    setSelectedItem(item);
    fetchPayLines(item.id);
    
    // Update URL
    const newUrl = `/payroll/runs/${payRunId}/review?worker=${item.employees.id}`;
    router.push(newUrl);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'needs_fix': return 'bg-red-100 text-red-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'locked': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getIssueColor = (type: string) => {
    return type === 'error' ? 'text-red-600' : 'text-yellow-600';
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
        <p className="text-center text-gray-600">Please log in to review payroll.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading payroll review...</p>
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
  const canReview = ['ba', 'admin'].includes(userRole);
  
  if (!canReview) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          You don&apos;t have permission to review payroll runs.
        </div>
        <Link href={`/payroll/runs/${payRunId}`} className="text-blue-600 hover:underline mt-4 inline-block">
          ← Back to Pay Run
        </Link>
      </div>
    );
  }

  const itemsNeedingFix = payRunItems.filter(item => item.status === 'needs_fix');
  const totalExceptions = payRunItems.reduce((sum, item) => sum + item.exceptions_count, 0);

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link href={`/payroll/runs/${payRunId}`} className="text-blue-600 hover:underline text-sm">
            ← Back to Pay Run Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">
            Payroll Review & Validation
          </h1>
          <p className="text-gray-600">
            Week Ending: {formatDate(payRun.week_ending)} • Status: {payRun.status}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRecalculate}
            disabled={actionLoading === 'recalculating' || ['exported', 'locked'].includes(payRun.status)}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {actionLoading === 'recalculating' ? 'Recalculating...' : 'Recalculate'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Total Workers</h3>
          <p className="text-2xl font-semibold text-gray-900">{payRunItems.length}</p>
        </div>
        <div className="bg-white p-4 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Need Fix</h3>
          <p className={`text-2xl font-semibold ${itemsNeedingFix.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {itemsNeedingFix.length}
          </p>
        </div>
        <div className="bg-white p-4 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Total Exceptions</h3>
          <p className={`text-2xl font-semibold ${totalExceptions > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {totalExceptions}
          </p>
        </div>
        <div className="bg-white p-4 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
          <p className="text-2xl font-semibold text-gray-900">
            {formatCurrency(payRunItems.reduce((sum, item) => sum + item.calc_total_amount, 0))}
          </p>
        </div>
      </div>

      {/* Validation Issues */}
      {validationIssues.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Validation Issues</h2>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              {validationIssues.map((issue, index) => (
                <div key={index} className={`text-sm ${getIssueColor(issue.type)}`}>
                  <span className="font-semibold uppercase">{issue.type}:</span> {issue.message}
                  {issue.field && <span className="text-gray-500"> (Field: {issue.field})</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workers List */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Workers</h2>
              <p className="text-sm text-gray-500">Click to view details</p>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {payRunItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedItem?.id === item.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {item.employees.full_name || `${item.employees.first_name} ${item.employees.last_name}`}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">{item.employees.email}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                        {item.exceptions_count > 0 && (
                          <span className="text-xs text-red-600 font-medium">
                            {item.exceptions_count} issues
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div>{item.calc_total_hours.toFixed(1)}h</div>
                      <div className="font-medium">{formatCurrency(item.calc_total_amount)}</div>
                    </div>
                  </div>
                  
                  {/* ADP ID Status */}
                  <div className="mt-2 text-xs">
                    {item.employees.adp_worker_id || item.employees.file_number ? (
                      <span className="text-green-600">✓ ADP ID: {item.employees.adp_worker_id || item.employees.file_number}</span>
                    ) : (
                      <span className="text-red-600">⚠ Missing ADP ID</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Worker Details */}
        <div className="lg:col-span-2">
          {selectedItem ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">
                  {selectedItem.employees.full_name || `${selectedItem.employees.first_name} ${selectedItem.employees.last_name}`}
                </h2>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                  <span>Email: {selectedItem.employees.email}</span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedItem.status)}`}>
                    {selectedItem.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Worker Summary */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Total Hours</div>
                    <div className="text-lg font-semibold text-gray-900">{selectedItem.calc_total_hours.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Total Amount</div>
                    <div className="text-lg font-semibold text-gray-900">{formatCurrency(selectedItem.calc_total_amount)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Exceptions</div>
                    <div className={`text-lg font-semibold ${selectedItem.exceptions_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedItem.exceptions_count}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pay Lines */}
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Pay Lines</h3>
                {payLines.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No pay lines found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {payLines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                line.line_type === 'hours' ? 'bg-blue-100 text-blue-800' :
                                line.line_type === 'earning' ? 'bg-green-100 text-green-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                {line.line_type}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-medium">{line.code}</td>
                            <td className="px-3 py-2">{line.hours ? line.hours.toFixed(1) : '-'}</td>
                            <td className="px-3 py-2">{line.units || '-'}</td>
                            <td className="px-3 py-2">{formatCurrency(line.rate)}</td>
                            <td className="px-3 py-2 font-medium">{formatCurrency(line.amount)}</td>
                            <td className="px-3 py-2 text-gray-600">{line.description || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Actions for selected worker */}
              {selectedItem.status === 'needs_fix' && (
                <div className="px-6 py-4 bg-yellow-50 border-t border-gray-200">
                  <h4 className="font-medium text-yellow-800 mb-2">Actions Required</h4>
                  <div className="space-y-2 text-sm text-yellow-700">
                    {!selectedItem.employees.adp_worker_id && !selectedItem.employees.file_number && (
                      <p>• Add ADP Worker ID or File Number in employee profile</p>
                    )}
                    <p>• Check for missing rate cards for service codes</p>
                    <p>• Verify worker name matches exactly</p>
                    <p>• Review hours for outliers (&gt;90 hours)</p>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/employees/edit/${selectedItem.employees.id}`}
                      className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      target="_blank"
                    >
                      Edit Employee Profile →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-8 text-center">
                <p className="text-gray-500 text-lg">Select a worker to view details</p>
                <p className="text-gray-400 mt-2">Click on a worker from the list to see their pay lines and resolve any issues.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
