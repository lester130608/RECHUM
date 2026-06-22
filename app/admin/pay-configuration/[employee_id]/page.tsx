'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { supabase } from '@/lib/supabaseClient';
import { getValidTaxTypesForRole, ROLE_TAX_RULES } from '@/lib/pay-config';
import {
  getRateFieldsForRole,
  OUTREACH_BASE_REFERENCE_OPTIONS,
} from '@/lib/pay-config-fields';
import type {
  PayConfigDetail,
  PayRole,
  PayRoleConfig,
  PayRoleRate,
  TaxType,
} from '@/lib/types/pay-config';

const PAY_ROLES = Object.keys(ROLE_TAX_RULES) as PayRole[];

type RateDraft = {
  rate_key: string;
  rate_value: string;
  base_reference: string | null;
};

type ConfigDraft = {
  role: PayRole;
  tax_type: TaxType;
  notes: string;
  rates: Record<string, RateDraft>;
};

function formatEmployeeName(employee: PayConfigDetail['employee']) {
  return employee.full_name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
}

function buildDraft(role: PayRole, taxType: TaxType, rates: PayRoleRate[] = [], notes = ''): ConfigDraft {
  const rateByKey = new Map(rates.map((rate) => [rate.rate_key, rate]));
  const draftRates: Record<string, RateDraft> = {};

  getRateFieldsForRole(role).forEach((field) => {
    const currentRate = rateByKey.get(field.rate_key);
    draftRates[field.rate_key] = {
      rate_key: field.rate_key,
      rate_value: currentRate?.rate_value == null ? '' : String(currentRate.rate_value),
      base_reference:
        currentRate?.base_reference ||
        (field.requiresBaseReference ? OUTREACH_BASE_REFERENCE_OPTIONS[0].value : null),
    };
  });

  return {
    role,
    tax_type: normalizeTaxTypeForRole(role, taxType),
    notes,
    rates: draftRates,
  };
}

function getFirstValidTaxType(role: PayRole): TaxType {
  return (getValidTaxTypesForRole(role)[0] || 'W2') as TaxType;
}

function normalizeTaxTypeForRole(role: PayRole, taxType: TaxType): TaxType {
  const validTaxTypes = getValidTaxTypesForRole(role);
  return validTaxTypes.includes(taxType) ? taxType : getFirstValidTaxType(role);
}

function draftToPayload(draft: ConfigDraft) {
  return {
    role: draft.role,
    tax_type: normalizeTaxTypeForRole(draft.role, draft.tax_type),
    notes: draft.notes || undefined,
    rates: Object.values(draft.rates).map((rate) => ({
      rate_key: rate.rate_key,
      rate_value: Number(rate.rate_value || 0),
      base_reference: rate.base_reference,
    })),
  };
}

function MessageBox({ message }: { message: { type: 'error' | 'success'; text: string } | null }) {
  if (!message) return null;

  return (
    <div
      className={`border rounded p-3 text-sm ${
        message.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}
    >
      {message.text}
    </div>
  );
}

function RateInputs({
  draft,
  onRateChange,
}: {
  draft: ConfigDraft;
  onRateChange: (rateKey: string, patch: Partial<RateDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {getRateFieldsForRole(draft.role).map((field) => {
        const rate = draft.rates[field.rate_key];
        const numericValue = Number(rate?.rate_value || 0);

        return (
          <div key={field.rate_key} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">{field.label}</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.01"
                min="0"
                className="border rounded px-2 py-1 w-full"
                value={rate?.rate_value || ''}
                onChange={(event) =>
                  onRateChange(field.rate_key, { rate_value: event.target.value })
                }
              />
              {draft.role === 'OUTREACH' && (
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  {(numericValue * 100).toFixed(2)}%
                </span>
              )}
            </div>
            {field.requiresBaseReference && (
              <select
                className="border rounded px-2 py-1 w-full"
                value={rate?.base_reference || OUTREACH_BASE_REFERENCE_OPTIONS[0].value}
                onChange={(event) =>
                  onRateChange(field.rate_key, { base_reference: event.target.value })
                }
              >
                {OUTREACH_BASE_REFERENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HistoricalConfig({ config }: { config: PayRoleConfig }) {
  return (
    <div className="border rounded p-4 bg-white">
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <span className="inline-flex rounded bg-gray-100 text-gray-700 border px-2 py-1 text-xs font-medium">
          {config.role}
        </span>
        <span className="text-sm text-gray-700">{config.tax_type}</span>
        <span className="text-sm text-gray-500">
          {config.valid_from} - {config.valid_to || 'Open'}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        {config.rates.map((rate) => (
          <div key={rate.id || rate.rate_key} className="flex justify-between border-t py-2">
            <span className="text-gray-600">{rate.rate_key}</span>
            <span className="font-medium">
              {rate.rate_value}
              {rate.base_reference ? ` / ${rate.base_reference}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PayConfigurationDetailPage() {
  const params = useParams<{ employee_id: string }>();
  const employeeId = params.employee_id;
  const { hasPermission, loading: userLoading } = useUser();
  const [detail, setDetail] = useState<PayConfigDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ConfigDraft>>({});
  const [createDraft, setCreateDraft] = useState<ConfigDraft>(() =>
    buildDraft('EMPLOYEE', 'W2')
  );
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const loadDetail = useCallback(async () => {
    if (!employeeId) return;

    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/pay-config/${employeeId}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(`HTTP ${response.status}`);
        setMessage({ type: 'error', text: payload.error || 'Unable to load pay configuration.' });
        setDetail(null);
        return;
      }

      const nextDetail = payload as PayConfigDetail;
      const nextDrafts: Record<string, ConfigDraft> = {};
      nextDetail.active_configs.forEach((config) => {
        nextDrafts[config.id] = buildDraft(
          config.role,
          config.tax_type,
          config.rates,
          config.notes || ''
        );
      });

      setDetail(nextDetail);
      setDrafts(nextDrafts);
    } catch (error: any) {
      setError(error?.message || 'Unable to load pay configuration.');
      setMessage({ type: 'error', text: error?.message || 'Unable to load pay configuration.' });
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadDetail();
  }, []);

  const employeeName = useMemo(() => {
    if (!detail) return '';
    return formatEmployeeName(detail.employee);
  }, [detail]);

  function updateDraft(configId: string, patch: Partial<ConfigDraft>) {
    setDrafts((current) => ({
      ...current,
      [configId]: {
        ...current[configId],
        ...patch,
      },
    }));
  }

  function updateDraftRate(configId: string, rateKey: string, patch: Partial<RateDraft>) {
    setDrafts((current) => ({
      ...current,
      [configId]: {
        ...current[configId],
        rates: {
          ...current[configId].rates,
          [rateKey]: {
            ...current[configId].rates[rateKey],
            ...patch,
          },
        },
      },
    }));
  }

  function updateCreateRole(role: PayRole) {
    setCreateDraft(buildDraft(role, getFirstValidTaxType(role), [], createDraft.notes));
  }

  function updateCreateRate(rateKey: string, patch: Partial<RateDraft>) {
    setCreateDraft((current) => ({
      ...current,
      rates: {
        ...current.rates,
        [rateKey]: {
          ...current.rates[rateKey],
          ...patch,
        },
      },
    }));
  }

  async function saveConfig(config: PayRoleConfig) {
    const draft = drafts[config.id];
    if (!draft) return;

    setSavingId(config.id);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/pay-config/${employeeId}/role/${config.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(draftToPayload(draft)),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: payload.error || 'Unable to save changes.' });
        return;
      }

      setMessage({ type: 'success', text: 'Pay configuration saved.' });
      await loadDetail();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to save changes.' });
    } finally {
      setSavingId(null);
    }
  }

  async function deactivateConfig(config: PayRoleConfig) {
    const confirmed = window.confirm(`Deactivate ${config.role} for this employee?`);
    if (!confirmed) return;

    setSavingId(config.id);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/pay-config/${employeeId}/role/${config.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage({ type: 'error', text: payload.error || 'Unable to deactivate role.' });
        return;
      }

      setMessage({ type: 'success', text: 'Pay role deactivated.' });
      await loadDetail();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to deactivate role.' });
    } finally {
      setSavingId(null);
    }
  }

  async function createConfig() {
    setSavingId('new');
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`/api/pay-config/${employeeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(draftToPayload(createDraft)),
      });
      const payload = await response.json();

      if (!response.ok) {
        const duplicateMessage =
          response.status === 409
            ? 'This employee already has an active configuration for that role.'
            : payload.error || 'Unable to create configuration.';
        setMessage({ type: 'error', text: duplicateMessage });
        return;
      }

      setMessage({ type: 'success', text: 'Pay configuration created.' });
      setShowCreatePanel(false);
      setCreateDraft(buildDraft('EMPLOYEE', 'W2'));
      await loadDetail();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Unable to create configuration.' });
    } finally {
      setSavingId(null);
    }
  }

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

  if (loading) {
    return <div className="p-6 max-w-7xl mx-auto text-gray-500">Loading pay configuration...</div>;
  }

  if (!detail) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <MessageBox message={message} />
        {error && <div className="error">{error}</div>}
        <Link href="/admin/pay-configuration">
          <span className="inline-flex bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">
            Back to list
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{employeeName}</h1>
          <p className="text-sm text-gray-600">{detail.employee.email}</p>
        </div>
        <Link href="/admin/pay-configuration">
          <span className="inline-flex bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm">
            Back to list
          </span>
        </Link>
      </div>

      <MessageBox message={message} />
  {error && <div className="error">{error}</div>}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Active Pay Configurations</h2>
          <button
            type="button"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            onClick={() => setShowCreatePanel(true)}
          >
            + Add new pay role
          </button>
        </div>

        {detail.active_configs.length === 0 ? (
          <div className="border rounded p-4 bg-white text-gray-500">
            No active pay configurations.
          </div>
        ) : (
          detail.active_configs.map((config) => {
            const draft = drafts[config.id];
            if (!draft) return null;
            const validTaxTypes = getValidTaxTypesForRole(draft.role);

            return (
              <div key={config.id} className="border rounded p-4 bg-white space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="inline-flex rounded bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 text-xs font-medium">
                    {config.role}
                  </span>
                  <span className="text-sm text-gray-700">{draft.tax_type}</span>
                  <span className="text-sm text-gray-500">Valid from {config.valid_from}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Tax type</label>
                    <select
                      className="border rounded px-2 py-1 w-full"
                      value={normalizeTaxTypeForRole(draft.role, draft.tax_type)}
                      disabled={validTaxTypes.length === 1}
                      onChange={(event) =>
                        updateDraft(config.id, { tax_type: event.target.value as TaxType })
                      }
                    >
                      {validTaxTypes.map((taxType) => (
                        <option key={taxType} value={taxType}>
                          {taxType}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Notes</label>
                    <input
                      type="text"
                      className="border rounded px-2 py-1 w-full"
                      value={draft.notes}
                      onChange={(event) => updateDraft(config.id, { notes: event.target.value })}
                    />
                  </div>
                </div>

                <RateInputs
                  draft={draft}
                  onRateChange={(rateKey, patch) => updateDraftRate(config.id, rateKey, patch)}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
                    disabled={savingId === config.id}
                    onClick={() => saveConfig(config)}
                  >
                    {savingId === config.id ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-60"
                    disabled={savingId === config.id}
                    onClick={() => deactivateConfig(config)}
                  >
                    Deactivate Role
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {showCreatePanel && (
        <section className="border rounded p-4 bg-white space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Create Pay Configuration</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={createDraft.role}
                onChange={(event) => updateCreateRole(event.target.value as PayRole)}
              >
                {PAY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Tax type</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={normalizeTaxTypeForRole(createDraft.role, createDraft.tax_type)}
                disabled={getValidTaxTypesForRole(createDraft.role).length === 1}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    tax_type: event.target.value as TaxType,
                  }))
                }
              >
                {getValidTaxTypesForRole(createDraft.role).map((taxType) => (
                  <option key={taxType} value={taxType}>
                    {taxType}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <RateInputs draft={createDraft} onRateChange={updateCreateRate} />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <input
              type="text"
              className="border rounded px-2 py-1 w-full"
              value={createDraft.notes}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm"
              onClick={() => {
                setShowCreatePanel(false);
                setCreateDraft(buildDraft('EMPLOYEE', 'W2'));
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-60"
              disabled={savingId === 'new'}
              onClick={createConfig}
            >
              {savingId === 'new' ? 'Creating...' : 'Create Configuration'}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <button
          type="button"
          className="bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-sm"
          onClick={() => setShowHistory((current) => !current)}
        >
          Historical Configurations {showHistory ? 'Hide' : 'Show'}
        </button>

        {showHistory && (
          <div className="space-y-3">
            {detail.historical_configs.length === 0 ? (
              <div className="border rounded p-4 bg-white text-gray-500">
                No historical configurations.
              </div>
            ) : (
              detail.historical_configs.map((config) => (
                <HistoricalConfig key={config.id} config={config} />
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
