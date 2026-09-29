// ---------------------------------------------------------------------------
// Tarifas por servicio de los therapists (área CMHC).
//
// CAMBIO 2026-09-29: hasta hoy el motor de CMHC leía únicamente pay_rates
// (conceptos *_RATE cargados a mano en Supabase) y la tarifa de IT era una
// sola para todos (clinician_service_rates). Ninguna pantalla escribía en
// pay_rates, así que un therapist nuevo no tenía forma de cobrar. La
// pantalla /admin/pay-configuration guardaba en pay_role_rates, que el
// motor no miraba.
//
// Ahora hay UNA fuente de verdad configurable desde la app: pay_role_rates
// (config THERAPIST activa, rate_key = nombre del servicio). Lo que no esté
// ahí cae a las fuentes antiguas, para no tocar a los therapists que ya
// funcionan:
//
//   1) pay_role_rates          ← prioridad. INTAKE, IN_DEPTH_INTAKE,
//                                 IN_DEPTH_BIO, IN_DEPTH_EXISTING, TP, BIO,
//                                 IT, TP_REVIEW (mismas claves que
//                                 lib/pay-config-fields.ts)
//   2) pay_rates               ← concepto *_RATE, department CMHC, activa
//                                 cuando valid_to IS NULL
//   3) clinician_service_rates ← solo IT, tarifa global
//
// Este módulo lo usan app/api/payroll/cmhc-calculation y
// lib/payroll/areaCalculationRunner. Si cambia el mapeo, cambia aquí.
// ---------------------------------------------------------------------------

import {
  CMHC_SERVICE_CONCEPTS,
  CMHC_SERVICES,
  type CmhcRateSource,
  type CmhcServiceName,
} from '@/lib/payroll/calcCMHC';

/** rate_key en pay_role_rates ↔ nombre del servicio en la captura. */
export const CMHC_SERVICE_RATE_KEYS: Record<CmhcServiceName, string> = {
  INTAKE: 'INTAKE',
  'IN-DEPTH INTAKE': 'IN_DEPTH_INTAKE',
  'IN-DEPTH BIO': 'IN_DEPTH_BIO',
  'IN-DEPTH EXISTING': 'IN_DEPTH_EXISTING',
  TP: 'TP',
  BIO: 'BIO',
  IT: 'IT',
  'TP REVIEW': 'TP_REVIEW',
};

export const CMHC_SERVICE_LABELS: Record<CmhcServiceName, string> = {
  INTAKE: 'Intake',
  'IN-DEPTH INTAKE': 'In-depth intake',
  'IN-DEPTH BIO': 'In-depth bio',
  'IN-DEPTH EXISTING': 'In-depth existing',
  TP: 'Treatment plan',
  BIO: 'Bio',
  IT: 'Individual therapy',
  'TP REVIEW': 'Treatment plan review',
};

export type CmhcEmployeeServiceRates = {
  rates: Partial<Record<CmhcServiceName, number | null>>;
  sources: Partial<Record<CmhcServiceName, CmhcRateSource>>;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * Devuelve, por empleado, la tarifa de cada servicio y de dónde salió.
 * Un servicio sin tarifa en ninguna fuente queda en null: el motor lo
 * marca como missing_service_rate solo si se capturó cantidad > 0.
 */
export async function loadCmhcServiceRates(
  supabase: any,
  employeeIds: string[]
): Promise<Map<string, CmhcEmployeeServiceRates>> {
  const result = new Map<string, CmhcEmployeeServiceRates>();
  const ensure = (employeeId: string) => {
    let entry = result.get(employeeId);
    if (!entry) {
      entry = { rates: {}, sources: {} };
      result.set(employeeId, entry);
    }
    return entry;
  };

  // 3) IT global (la fuente más débil; se sobreescribe si hay algo mejor)
  const { data: fixedRate, error: fixedRateError } = await supabase
    .from('clinician_service_rates')
    .select('service_name, rate')
    .eq('service_name', 'IT')
    .maybeSingle();

  if (fixedRateError) throw new Error('Failed to fetch fixed IT service rate');

  const globalItRate =
    (fixedRate?.service_name ?? '').trim().toUpperCase() === 'IT' ? toNumberOrNull(fixedRate?.rate) : null;

  for (const employeeId of employeeIds) {
    const entry = ensure(employeeId);
    entry.rates.IT = globalItRate;
    entry.sources.IT = 'clinician_service_rates';
  }

  if (employeeIds.length === 0) return result;

  // 2) pay_rates (histórico, cargado a mano)
  const { data: payRates, error: payRatesError } = await supabase
    .from('pay_rates')
    .select('employee_id, concept, rate, valid_to')
    .in('employee_id', employeeIds)
    .eq('department', 'CMHC')
    .in('concept', Object.values(CMHC_SERVICE_CONCEPTS))
    .is('valid_to', null);

  if (payRatesError) throw new Error('Failed to fetch active CMHC service rates');

  const serviceByConcept = new Map<string, CmhcServiceName>(
    (Object.entries(CMHC_SERVICE_CONCEPTS) as Array<[CmhcServiceName, string]>).map(
      ([service, concept]) => [concept, service]
    )
  );

  for (const row of payRates ?? []) {
    const serviceName = serviceByConcept.get(row.concept);
    const rate = toNumberOrNull(row.rate);
    if (!serviceName || rate === null) continue;
    const entry = ensure(row.employee_id);
    entry.rates[serviceName] = rate;
    entry.sources[serviceName] = 'pay_rates';
  }

  // 1) pay_role_rates (lo que se configura desde la app). Manda.
  const { data: configs, error: configsError } = await supabase
    .from('pay_role_configs')
    .select('employee_id, pay_role_rates(rate_key, rate_value)')
    .in('employee_id', employeeIds)
    .eq('role', 'THERAPIST')
    .eq('active', true);

  if (configsError) throw new Error('Failed to fetch therapist pay role rates');

  const serviceByRateKey = new Map<string, CmhcServiceName>(
    (Object.entries(CMHC_SERVICE_RATE_KEYS) as Array<[CmhcServiceName, string]>).map(
      ([service, key]) => [key, service]
    )
  );

  for (const config of configs ?? []) {
    for (const rate of config.pay_role_rates ?? []) {
      const serviceName = serviceByRateKey.get(String(rate.rate_key ?? '').trim().toUpperCase());
      const value = toNumberOrNull(rate.rate_value);
      if (!serviceName || value === null) continue;
      const entry = ensure(config.employee_id);
      entry.rates[serviceName] = value;
      entry.sources[serviceName] = 'pay_role_rates';
    }
  }

  // Garantiza que todos los servicios existan como clave (null si no hay tarifa)
  for (const entry of result.values()) {
    for (const serviceName of CMHC_SERVICES) {
      if (!(serviceName in entry.rates)) entry.rates[serviceName] = null;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Escritura desde Payroll Employees (solo owner; RLS de pay_role_configs y
// pay_role_rates ya exige owner/admin).
// ---------------------------------------------------------------------------

export const CMHC_RATE_KEYS = Object.values(CMHC_SERVICE_RATE_KEYS);

/** Entrada del formulario: { INTAKE: 45, IT: 30, TP: null, ... } */
export type TherapistServiceRatesInput = Partial<Record<string, number | string | null>>;

export function normalizeTherapistServiceRates(
  input: unknown
): { ok: true; value: Record<string, number | null> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'service_rates must be an object' };
  }
  const raw = input as Record<string, unknown>;
  const value: Record<string, number | null> = {};
  for (const key of CMHC_RATE_KEYS) {
    const candidate = raw[key];
    if (candidate === undefined || candidate === null || candidate === '') {
      value[key] = null;
      continue;
    }
    const numberValue = Number(candidate);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      return { ok: false, error: `service_rates.${key} must be a non-negative number` };
    }
    value[key] = numberValue;
  }
  return { ok: true, value };
}

/**
 * Crea (o reutiliza) la config THERAPIST activa del empleado y deja en
 * pay_role_rates exactamente las tarifas recibidas: las que vienen con
 * número se insertan o actualizan, las vacías se borran.
 */
export async function saveTherapistServiceRates(
  supabase: any,
  employeeId: string,
  /** null = no tocar el tax_type de una config existente (W2 si hay que crearla). */
  taxType: 'W2' | '1099' | null,
  rates: Record<string, number | null>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('pay_role_configs')
    .select('id, tax_type')
    .eq('employee_id', employeeId)
    .eq('role', 'THERAPIST')
    .eq('active', true)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };

  let configId: string | null = existing?.id ?? null;

  if (!configId) {
    const { data: created, error: createError } = await supabase
      .from('pay_role_configs')
      .insert({
        employee_id: employeeId,
        role: 'THERAPIST',
        tax_type: taxType ?? 'W2',
        active: true,
        valid_from: new Date().toISOString().slice(0, 10),
        notes: 'Created from Payroll Employees',
      })
      .select('id')
      .single();

    if (createError || !created) return { ok: false, error: createError?.message ?? 'Failed to create pay role config' };
    configId = created.id as string;
  } else if (taxType && existing.tax_type !== taxType) {
    const { error: taxError } = await supabase
      .from('pay_role_configs')
      .update({ tax_type: taxType })
      .eq('id', configId);
    if (taxError) return { ok: false, error: taxError.message };
  }

  // Sin upsert a propósito: pay_role_rates existía en la base antes de la
  // migración 0014, y no está garantizado que el UNIQUE
  // (pay_role_config_id, rate_key) exista en la base viva. Se lee lo que
  // hay y se decide fila a fila.
  const { data: existingRates, error: ratesError } = await supabase
    .from('pay_role_rates')
    .select('id, rate_key, rate_value')
    .eq('pay_role_config_id', configId);

  if (ratesError) return { ok: false, error: ratesError.message };

  const byKey = new Map<string, { id: string; rate_value: number }>();
  for (const row of existingRates ?? []) {
    byKey.set(String(row.rate_key).trim().toUpperCase(), { id: row.id, rate_value: Number(row.rate_value) });
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const toDeleteIds: string[] = [];

  for (const [rateKey, value] of Object.entries(rates)) {
    const current = byKey.get(rateKey);
    if (value === null) {
      if (current) toDeleteIds.push(current.id);
      continue;
    }
    if (!current) {
      toInsert.push({ pay_role_config_id: configId, rate_key: rateKey, rate_value: value, base_reference: null });
      continue;
    }
    if (current.rate_value !== value) {
      const { error: updateError } = await supabase
        .from('pay_role_rates')
        .update({ rate_value: value })
        .eq('id', current.id);
      if (updateError) return { ok: false, error: updateError.message };
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from('pay_role_rates').insert(toInsert);
    if (insertError) return { ok: false, error: insertError.message };
  }

  if (toDeleteIds.length > 0) {
    const { error: deleteError } = await supabase.from('pay_role_rates').delete().in('id', toDeleteIds);
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  return { ok: true };
}

/**
 * Para la pantalla de Payroll Employees: tarifas actuales por rate_key
 * (solo las configuradas en pay_role_rates; lo heredado de pay_rates se
 * muestra también para que el owner vea qué cobra hoy cada therapist).
 */
export async function loadTherapistRatesByKey(
  supabase: any,
  employeeIds: string[]
): Promise<Map<string, Record<string, number | null>>> {
  const byService = await loadCmhcServiceRates(supabase, employeeIds);
  const result = new Map<string, Record<string, number | null>>();
  for (const [employeeId, entry] of byService) {
    const byKey: Record<string, number | null> = {};
    for (const serviceName of CMHC_SERVICES) {
      byKey[CMHC_SERVICE_RATE_KEYS[serviceName]] = entry.rates[serviceName] ?? null;
    }
    result.set(employeeId, byKey);
  }
  return result;
}
