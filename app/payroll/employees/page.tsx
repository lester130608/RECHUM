"use client";

// app/payroll/employees/page.tsx
// Quick payroll employee dashboard. Separate from HR/onboarding.

import { useEffect, useMemo, useState } from 'react';
import { PayrollShell } from '@/components/Payroll/PayrollShell';
import { supabase } from '@/lib/supabaseClient';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

type PayrollArea = 'BA' | 'CMHC' | 'TCM' | 'PSYQ' | 'EMP';
type EmployeeStatusFilter = 'all' | 'active' | 'paused';

interface PayrollEmployee {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  area: PayrollArea;
  role: string;
  active: boolean;
  status: 'active' | 'paused';
  ready_for_payroll: boolean;
  rate?: number | null;
}

interface EmployeesContext {
  is_owner: boolean;
  supervised_areas: string[];
  visible_areas: PayrollArea[];
  role_options: Record<PayrollArea, string[]>;
  employees: PayrollEmployee[];
}

interface EmployeeFormState {
  employee_id?: string;
  first_name: string;
  last_name: string;
  area: PayrollArea;
  original_area?: PayrollArea;
  role: string;
  rate: string;
}

const AREA_OPTIONS: PayrollArea[] = ['BA', 'CMHC', 'TCM', 'PSYQ', 'EMP'];
const DEFAULT_ROLE_OPTIONS: Record<PayrollArea, string[]> = {
  BA: ['RBT', 'BCABA', 'BCBA'],
  CMHC: ['THERAPIST'],
  TCM: ['TCM'],
  PSYQ: ['ADMIN'],
  EMP: ['ADMIN'],
};

async function fetchWithSession(url: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Auth session missing. Please log in again.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(url, { ...init, headers });
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return data;
}

function makeEmptyForm(area: PayrollArea): EmployeeFormState {
  return {
    first_name: '',
    last_name: '',
    area,
    role: DEFAULT_ROLE_OPTIONS[area][0],
    rate: '',
  };
}

function formatRate(value?: number | null) {
  if (typeof value !== 'number') return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function PayrollEmployeesPage() {
  const { user, loading: userLoading } = useSupabaseUser();
  const [ctx, setCtx] = useState<EmployeesContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<'all' | PayrollArea>('all');
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>('active');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EmployeeFormState>(makeEmptyForm('BA'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  async function loadEmployees() {
    setLoading(true);
    setError('');

    try {
      const data: EmployeesContext = await fetchWithSession('/api/payroll/employees');
      setCtx(data);
      const defaultArea = data.visible_areas[0] ?? 'BA';
      setAreaFilter(data.is_owner ? 'all' : defaultArea);
      setForm(makeEmptyForm(defaultArea));
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        window.location.href = '/not-authorized';
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (userLoading || !user) return;
    void loadEmployees();
  }, [user, userLoading]);

  const roleOptions = ctx?.role_options ?? DEFAULT_ROLE_OPTIONS;
  const visibleAreas = ctx?.is_owner ? AREA_OPTIONS : (ctx?.visible_areas ?? []);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (ctx?.employees ?? []).filter((employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`.toLowerCase();
      const matchesSearch = !query || fullName.includes(query);
      const matchesArea = areaFilter === 'all' || employee.area === areaFilter;
      const matchesStatus = statusFilter === 'all' || employee.status === statusFilter;
      return matchesSearch && matchesArea && matchesStatus;
    });
  }, [ctx?.employees, search, areaFilter, statusFilter]);

  function openAddForm() {
    const area = ctx?.visible_areas[0] ?? 'BA';
    setEditing(false);
    setForm(makeEmptyForm(area));
    setFormError('');
    setMessage('');
    setShowForm(true);
  }

  function openEditForm(employee: PayrollEmployee) {
    setEditing(true);
    setForm({
      employee_id: employee.employee_id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      area: employee.area,
      original_area: employee.area,
      role: employee.role,
      rate: typeof employee.rate === 'number' ? String(employee.rate) : '',
    });
    setFormError('');
    setMessage('');
    setShowForm(true);
  }

  function updateFormArea(area: PayrollArea) {
    const nextRole = roleOptions[area]?.[0] ?? '';
    setForm((prev) => ({
      ...prev,
      area,
      role: nextRole,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setMessage('');

    try {
      const rate = toNumberOrNull(form.rate);
      const body = {
        first_name: form.first_name,
        last_name: form.last_name,
        area: form.area,
        role: form.role,
        rate,
      };

      const response = editing
        ? await fetchWithSession('/api/payroll/employees', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'edit',
              employee_id: form.employee_id,
              original_area: form.original_area,
              employee: body,
            }),
          })
        : await fetchWithSession('/api/payroll/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

      setMessage(response.message);
      setShowForm(false);
      await loadEmployees();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePaused(employee: PayrollEmployee) {
    setMessage('');
    setError('');
    try {
      const response = await fetchWithSession('/api/payroll/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: employee.active ? 'pause' : 'resume',
          employee_id: employee.employee_id,
          area: employee.area,
        }),
      });
      setMessage(response.message);
      await loadEmployees();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (userLoading) {
    return (
      <PayrollShell currentLabel="Employees">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  if (!user) {
    return (
      <PayrollShell currentLabel="Employees">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>Please log in to continue.</p>
        </div>
      </PayrollShell>
    );
  }

  if (loading) {
    return (
      <PayrollShell currentLabel="Employees">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>
        </div>
      </PayrollShell>
    );
  }

  return (
    <PayrollShell currentLabel="Employees">
          <div className="page-header">
            <div className="page-header-content">
              <h1 style={{ fontSize: 22, marginBottom: 4 }}>Payroll Employees</h1>
              <p className="subtitle">
                Quick payroll roster. This does not replace HR onboarding.
              </p>
            </div>
            <div className="page-header-actions">
              <button className="dtt-primary" type="button" onClick={openAddForm}>
                Add employee
              </button>
            </div>
          </div>

          {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
          {message && (
            <div className="dtt-submitted-banner" style={{ marginBottom: 16 }}>
              {message}
            </div>
          )}

          {showForm && (
            <div className="section">
              <div className="heading" style={{ marginBottom: 16 }}>
                {editing ? 'Edit employee' : 'Add employee'}
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-row">
                    <label htmlFor="first-name">First name</label>
                    <input
                      id="first-name"
                      value={form.first_name}
                      onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="last-name">Last name</label>
                    <input
                      id="last-name"
                      value={form.last_name}
                      onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="area">Area</label>
                    <select
                      id="area"
                      value={form.area}
                      onChange={(event) => updateFormArea(event.target.value as PayrollArea)}
                      disabled={!ctx?.is_owner}
                    >
                      {visibleAreas.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="role">Role</label>
                    <select
                      id="role"
                      value={form.role}
                      onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                    >
                      {(roleOptions[form.area] ?? []).map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                  {ctx?.is_owner && (
                    <div className="form-row">
                      <label htmlFor="rate">Rate</label>
                      <input
                        id="rate"
                        type="number"
                        min={0}
                        step={0.01}
                        value={form.rate}
                        onChange={(event) => setForm((prev) => ({ ...prev, rate: event.target.value }))}
                      />
                    </div>
                  )}
                </div>

                <div className="info" style={{ marginTop: 12 }}>
                  Pay rate is set by the owner. Employee appears in capture but isn't paid until a rate is assigned.
                </div>

                {formError && <div className="error" style={{ marginTop: 12 }}>{formError}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button className="dtt-primary" type="submit" disabled={saving}>
                    {saving ? 'Saving...' : editing ? 'Save changes' : 'Add employee'}
                  </button>
                  <button
                    className="dtt-secondary"
                    type="button"
                    onClick={() => setShowForm(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="section">
            <div className="form-grid">
              <div className="form-row">
                <label htmlFor="search">Search</label>
                <input
                  id="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                />
              </div>
              <div className="form-row">
                <label htmlFor="area-filter">Area</label>
                <select
                  id="area-filter"
                  value={areaFilter}
                  onChange={(event) => setAreaFilter(event.target.value as 'all' | PayrollArea)}
                  disabled={!ctx?.is_owner}
                >
                  {ctx?.is_owner && <option value="all">All areas</option>}
                  {visibleAreas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label htmlFor="status-filter">Status</label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as EmployeeStatusFilter)}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>
          </div>

          <div className="section" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Area</th>
                    <th>Role</th>
                    <th>Status</th>
                    {ctx?.is_owner && <th>Rate</th>}
                    {ctx?.is_owner && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => (
                    <tr
                      key={`${employee.employee_id}-${employee.area}`}
                      style={employee.active ? undefined : { opacity: 0.55 }}
                    >
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {employee.first_name} {employee.last_name}
                        </span>
                      </td>
                      <td>{employee.area}</td>
                      <td>
                        <span className="badge accent">{employee.role}</span>
                      </td>
                      <td>
                        <span className={employee.active ? 'badge success' : 'badge'}>
                          {employee.active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      {ctx?.is_owner && <td>{formatRate(employee.rate)}</td>}
                      {ctx?.is_owner && (
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="small" type="button" onClick={() => openEditForm(employee)}>
                              Edit
                            </button>
                            <button className="small" type="button" onClick={() => togglePaused(employee)}>
                              {employee.active ? 'Pause' : 'Resume'}
                            </button>
                            <button className="small" type="button" disabled title="Confirm remove policy with Lester first">
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredEmployees.length === 0 && (
              <div className="empty-state">
                No payroll employees match the current filters.
              </div>
            )}
          </div>
    </PayrollShell>
  );
}
