"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type PayrollArea = 'BA' | 'CMHC' | 'TCM' | 'PSYQ' | 'GENERAL';

interface PayPeriod {
  id: string;
  week_code: string;
  start_date: string;
  end_date: string;
  capture_opens_at: string;
  sup_deadline: string;
  owner_deadline: string;
  submit_adp_date: string;
  pay_date: string;
  status: string;
}

interface PayrollContext {
  role_codes: string[];
  is_owner: boolean;
  supervised_areas: PayrollArea[];
  today: string;
  pay_periods: PayPeriod[];
}

interface PayRun {
  id: string;
  period_id?: string | null;
  area?: PayrollArea | null;
  run_level?: 'area' | 'consolidated' | null;
  week_ending?: string | null;
  status: 'draft' | 'review_ready' | 'supervisor_approved' | 'owner_approved' | 'consolidated' | 'exported' | 'locked';
  created_at: string;
  owner_approved_at?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
  totals: {
    total_workers: number;
    total_hours: number;
    total_amount?: number;
    total_exceptions: number;
    items_needing_fix: number;
  };
}

const OWNER_AREAS: PayrollArea[] = ['BA', 'CMHC', 'TCM', 'PSYQ', 'GENERAL'];

const statusColors: Record<PayRun['status'], string> = {
  draft: 'bg-gray-100 text-gray-800',
  review_ready: 'bg-blue-100 text-blue-800',
  supervisor_approved: 'bg-indigo-100 text-indigo-800',
  owner_approved: 'bg-green-100 text-green-800',
  consolidated: 'bg-teal-100 text-teal-800',
  exported: 'bg-purple-100 text-purple-800',
  locked: 'bg-red-100 text-red-800'
};

const statusLabels: Record<PayRun['status'], string> = {
  draft: 'Draft',
  review_ready: 'Ready for Review',
  supervisor_approved: 'Supervisor Approved',
  owner_approved: 'Owner Approved',
  consolidated: 'Consolidated',
  exported: 'Exported',
  locked: 'Locked'
};

export default function PayrollRunsPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [payRuns, setPayRuns] = useState<PayRun[]>([]);
  const [context, setContext] = useState<PayrollContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [showNewForm, setShowNewForm] = useState(false);
  const [newPeriodId, setNewPeriodId] = useState('');
  const [newArea, setNewArea] = useState<PayrollArea>('BA');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (userLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    void loadPageData();
  }, [user, userLoading]);

  const areaOptions = useMemo(() => {
    if (!context) {
      return [];
    }

    return context.is_owner
      ? OWNER_AREAS
      : context.supervised_areas.filter((area) => area !== 'GENERAL' && area !== 'PSYQ');
  }, [context]);

  const periodOptions = useMemo(() => {
    if (!context) {
      return [];
    }

    if (context.is_owner) {
      return context.pay_periods;
    }

    const today = dateKeyToDayNumber(context.today);
    return context.pay_periods.filter((period) => {
      const opens = dateKeyToDayNumber(period.capture_opens_at);
      const deadline = dateKeyToDayNumber(period.sup_deadline);
      return today >= opens && today <= deadline;
    });
  }, [context]);

  const visiblePayRuns = useMemo(() => {
    if (!context) {
      return [];
    }

    if (context.is_owner) {
      return payRuns;
    }

    const allowedAreas = new Set(context.supervised_areas);
    return payRuns.filter((run) => run.area && allowedAreas.has(run.area));
  }, [context, payRuns]);

  const canCreatePayRun = Boolean(context && (context.is_owner || (areaOptions.length > 0 && periodOptions.length > 0)));

  const loadPageData = async () => {
    setLoading(true);
    setError('');

    try {
      const [contextData, runsData] = await Promise.all([
        fetchJsonWithSession('/api/payroll/runs/context'),
        fetchJsonWithSession('/api/payroll/runs')
      ]);

      setContext(contextData);
      setPayRuns(runsData.pay_runs || []);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        window.location.href = '/not-authorized';
        return;
      }

      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setNewPeriodId(periodOptions[0]?.id || '');
    setNewArea(areaOptions[0] || 'BA');
    setShowNewForm(true);
  };

  const handleCreatePayRun = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);

    try {
      await fetchJsonWithSession('/api/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: newPeriodId,
          area: newArea,
          notes: newNotes
        })
      });

      await loadPageData();
      setShowNewForm(false);
      setNewPeriodId('');
      setNewNotes('');
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

  const formatDate = (dateString?: string | null) => {
    if (!dateString) {
      return 'N/A';
    }

    return new Date(`${dateString}T00:00:00`).toLocaleDateString();
  };

  const getPeriodLabel = (periodId?: string | null, fallback?: string | null) => {
    const period = context?.pay_periods.find((item) => item.id === periodId);
    if (!period) {
      return fallback ? formatDate(fallback) : 'N/A';
    }

    return `${period.week_code} (${formatDate(period.start_date)} - ${formatDate(period.end_date)})`;
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
          <p className="text-gray-600">Manage payroll periods and area workflows</p>
        </div>

        {canCreatePayRun && (
          <button
            onClick={openCreateForm}
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

      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Create New Pay Run</h2>
          <form onSubmit={handleCreatePayRun} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pay Period *
              </label>
              <select
                value={newPeriodId}
                onChange={(event) => setNewPeriodId(event.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {periodOptions.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.week_code} | {formatDate(period.start_date)} - {formatDate(period.end_date)} | Pay {formatDate(period.pay_date)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Area *
              </label>
              <select
                value={newArea}
                onChange={(event) => setNewArea(event.target.value as PayrollArea)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {areaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={newNotes}
                onChange={(event) => setNewNotes(event.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newPeriodId || !newArea}
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

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        {visiblePayRuns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-lg">No payroll runs found.</p>
            {canCreatePayRun && (
              <p className="text-gray-400 mt-2">Create your first pay run to get started.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Area
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
                  {context?.is_owner && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Amount
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Issues
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {visiblePayRuns.map((payRun) => (
                  <tr key={payRun.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {getPeriodLabel(payRun.period_id, payRun.week_ending)}
                      </div>
                      <div className="text-sm text-gray-500">
                        Created {formatDate(payRun.created_at?.slice(0, 10))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payRun.area || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColors[payRun.status] || 'bg-gray-100 text-gray-800'}`}>
                        {statusLabels[payRun.status] || payRun.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payRun.totals.total_workers}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payRun.totals.total_hours.toFixed(1)}
                    </td>
                    {context?.is_owner && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(payRun.totals.total_amount || 0)}
                      </td>
                    )}
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
                          <span className="text-green-600">Clean</span>
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

      {visiblePayRuns.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">Total Runs</h3>
            <p className="text-2xl font-semibold text-gray-900">{visiblePayRuns.length}</p>
          </div>
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">In Progress</h3>
            <p className="text-2xl font-semibold text-gray-900">
              {visiblePayRuns.filter((run) => ['draft', 'review_ready', 'supervisor_approved'].includes(run.status)).length}
            </p>
          </div>
          <div className="bg-white p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-500">Needs Attention</h3>
            <p className="text-2xl font-semibold text-red-600">
              {visiblePayRuns.filter((run) => run.totals.total_exceptions > 0 || run.totals.items_needing_fix > 0).length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchJsonWithSession(url: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Auth session missing. Please log in again.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data;
}

function dateKeyToDayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}
