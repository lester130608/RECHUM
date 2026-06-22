"use client";

// app/payroll/runs/page.tsx
// Pay runs list page - main dashboard for all payroll periods
// Date: March 2, 2026

import { useState, useEffect } from 'react';
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
  totals: {
    total_workers: number;
    total_hours: number;
    total_amount: number;
    total_exceptions: number;
    items_needing_fix: number;
  };
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

export default function PayrollRunsPage() {
  const user = useSupabaseUser();
  const [payRuns, setPayRuns] = useState<PayRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  
  // New pay run form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newWeekEnding, setNewWeekEnding] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserRole();
      fetchPayRuns();
    }
  }, [user]);

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

  const fetchPayRuns = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Auth session missing. Please log in again.');
      }

      const response = await fetch('/api/payroll/runs', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch pay runs');
      }

      setPayRuns(data.pay_runs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePayRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Auth session missing. Please log in again.');
      }

      const response = await fetch('/api/payroll/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          week_ending: newWeekEnding,
          notes: newNotes
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create pay run');
      }

      // Refresh the list
      await fetchPayRuns();
      
      // Reset form
      setShowNewForm(false);
      setNewWeekEnding('');
      setNewNotes('');

      alert('Pay run created successfully!');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setCreating(false);
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

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-center text-gray-600">Please log in to view payroll runs.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading payroll runs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payroll Runs</h1>
          <p className="text-gray-600">Manage weekly payroll periods and processing</p>
        </div>
        
        {(['ba', 'admin'].includes(userRole)) && (
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Create New Pay Run
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          Error: {error}
        </div>
      )}

      {/* New Pay Run Form */}
      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Create New Pay Run</h2>
          <form onSubmit={handleCreatePayRun} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Week Ending Date *
              </label>
              <input
                type="date"
                value={newWeekEnding}
                onChange={(e) => setNewWeekEnding(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any notes about this pay period..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                {creating ? 'Creating...' : 'Create Pay Run'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pay Runs List */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        {payRuns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-lg">No payroll runs found.</p>
            {(['ba', 'admin'].includes(userRole)) && (
              <p className="text-gray-400 mt-2">Create your first pay run to get started.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Week Ending
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Workers
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issues
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payRuns.map((payRun) => (
                  <tr key={payRun.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatDate(payRun.week_ending)}
                      </div>
                      <div className="text-sm text-gray-500">
                        Created {formatDate(payRun.created_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[payRun.status]}`}>
                        {statusLabels[payRun.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payRun.totals.total_workers}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payRun.totals.total_hours.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(payRun.totals.total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {payRun.totals.total_exceptions > 0 && (
                          <span className="text-red-600 font-medium">
                            {payRun.totals.total_exceptions} errors
                          </span>
                        )}
                        {payRun.totals.items_needing_fix > 0 && (
                          <span className="text-yellow-600 font-medium block">
                            {payRun.totals.items_needing_fix} need fix
                          </span>
                        )}
                        {payRun.totals.total_exceptions === 0 && payRun.totals.items_needing_fix === 0 && (
                          <span className="text-green-600">✓ Clean</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link 
                        href={`/payroll/runs/${payRun.id}`}
                        className="text-blue-600 hover:text-blue-900 transition-colors"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      {payRuns.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">Total Runs</h3>
            <p className="text-2xl font-semibold text-gray-900">{payRuns.length}</p>
          </div>
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">In Progress</h3>
            <p className="text-2xl font-semibold text-gray-900">
              {payRuns.filter(r => ['draft', 'review_ready'].includes(r.status)).length}
            </p>
          </div>
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">Completed</h3>
            <p className="text-2xl font-semibold text-gray-900">
              {payRuns.filter(r => r.status === 'locked').length}
            </p>
          </div>
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">Needs Attention</h3>
            <p className="text-2xl font-semibold text-red-600">
              {payRuns.filter(r => r.totals.total_exceptions > 0 || r.totals.items_needing_fix > 0).length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
