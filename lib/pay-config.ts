import type { PayRole, TaxType } from '@/lib/types/pay-config';

/**
 * Define qué tax_types son permitidos para cada role.
 * Algunos roles solo pueden ser W2; otros aceptan ambos.
 */
export const ROLE_TAX_RULES: Record<string, ('W2' | '1099')[]> = {
  // W2-only roles
  RBT: ['W2'],
  BCABA: ['W2'],
  EMPLOYEE: ['W2'],
  OUTREACH: ['W2'],
  // Flex roles (W2 or 1099, employee chooses)
  BCBA: ['W2', '1099'],
  TCM: ['W2', '1099'],
  THERAPIST: ['W2', '1099'],
  DOCTOR: ['W2', '1099'],
};

/**
 * Retorna los tax_types válidos para un rol específico.
 * Si el rol no está en las reglas, devuelve [] (no permitido).
 */
export function getValidTaxTypesForRole(role: string): ('W2' | '1099')[] {
  return ROLE_TAX_RULES[role] || [];
}

/**
 * Valida si una combinación role + tax_type es permitida.
 */
export function isValidRoleTaxCombo(role: string, taxType: string): boolean {
  const validTypes = getValidTaxTypesForRole(role);
  return validTypes.includes(taxType as 'W2' | '1099');
}

export const VALID_ROLES: PayRole[] = [
  'EMPLOYEE',
  'TCM',
  'RBT',
  'BCABA',
  'BCBA',
  'THERAPIST',
  'DOCTOR',
  'OUTREACH',
];

export const VALID_TAX_TYPES: TaxType[] = ['W2', '1099'];
export const VALID_OUTREACH_BASE_REFERENCES = [
  // Module-level totals (sum of all roles in a module)
  'BA_TOTAL',
  'CMHC_TOTAL',
  'TCM_TOTAL',
  'EMP_TOTAL',
  'ALL_TOTAL',
  // Role-level granular totals (sum of specific role only)
  'RBT_TOTAL',
  'BCABA_TOTAL',
  'BCBA_TOTAL',
  'THERAPIST_TOTAL',
  'EMPLOYEE_TOTAL',
  'DOCTOR_TOTAL',
  'OUTREACH_TOTAL',
] as const;

export type PayConfigBody = {
  role?: unknown;
  tax_type?: unknown;
  rates?: unknown;
  notes?: unknown;
};

export type NormalizedRateInput = {
  rate_key: string;
  rate_value: number;
  base_reference: string | null;
};

export type NormalizedPayConfigBody = {
  role: PayRole;
  tax_type: TaxType;
  rates: NormalizedRateInput[];
  notes: string | null;
};

export function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayDateString() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export function normalizePayConfigBody(
  body: PayConfigBody,
  options: { requireRole: boolean }
): { ok: true; value: NormalizedPayConfigBody } | { ok: false; error: string } {
  const role = body.role;
  const taxType = body.tax_type;

  if (options.requireRole && (typeof role !== 'string' || !VALID_ROLES.includes(role as PayRole))) {
    return { ok: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` };
  }

  if (typeof taxType !== 'string' || !VALID_TAX_TYPES.includes(taxType as TaxType)) {
    return { ok: false, error: `tax_type must be one of: ${VALID_TAX_TYPES.join(', ')}` };
  }

  if (!Array.isArray(body.rates) || body.rates.length === 0) {
    return { ok: false, error: 'rates must be a non-empty array' };
  }

  const normalizedRates: NormalizedRateInput[] = [];

  for (let index = 0; index < body.rates.length; index += 1) {
    const rate = body.rates[index];

    if (!rate || typeof rate !== 'object') {
      return { ok: false, error: `rates[${index}] must be an object` };
    }

    const rawRate = rate as Record<string, unknown>;
    const rateKey = rawRate.rate_key;
    const rateValue = rawRate.rate_value;
    const baseReference = rawRate.base_reference;

    if (typeof rateKey !== 'string' || rateKey.trim().length === 0) {
      return { ok: false, error: `rates[${index}].rate_key is required` };
    }

    const numericRateValue =
      typeof rateValue === 'number'
        ? rateValue
        : typeof rateValue === 'string'
          ? Number(rateValue)
          : NaN;

    if (!Number.isFinite(numericRateValue)) {
      return { ok: false, error: `rates[${index}].rate_value must be numeric` };
    }

    const normalizedBaseReference =
      typeof baseReference === 'string' && baseReference.trim().length > 0
        ? baseReference.trim()
        : null;

    normalizedRates.push({
      rate_key: rateKey.trim(),
      rate_value: numericRateValue,
      base_reference: normalizedBaseReference,
    });
  }

  if (role === 'OUTREACH') {
    const invalidIndex = normalizedRates.findIndex(
      (rate) =>
        !rate.base_reference ||
        !VALID_OUTREACH_BASE_REFERENCES.includes(
          rate.base_reference as (typeof VALID_OUTREACH_BASE_REFERENCES)[number]
        )
    );

    if (invalidIndex >= 0) {
      return {
        ok: false,
        error: `OUTREACH rates must include base_reference one of: ${VALID_OUTREACH_BASE_REFERENCES.join(', ')}`,
      };
    }
  }

  return {
    ok: true,
    value: {
      role: role as PayRole,
      tax_type: taxType as TaxType,
      rates: normalizedRates,
      notes: typeof body.notes === 'string' && body.notes.trim().length > 0 ? body.notes.trim() : null,
    },
  };
}

export async function fetchConfigWithRates(supabase: any, configId: string) {
  return supabase
    .from('pay_role_configs')
    .select(
      `
      id,
      employee_id,
      role,
      tax_type,
      active,
      valid_from,
      valid_to,
      notes,
      created_at,
      updated_at,
      rates:pay_role_rates (
        id,
        pay_role_config_id,
        rate_key,
        rate_value,
        base_reference,
        notes,
        created_at,
        updated_at
      )
    `
    )
    .eq('id', configId)
    .single();
}
