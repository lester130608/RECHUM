import { isOwner } from '@/lib/auth/roleAccess';

const MONEY_FIELDS = new Set([
  'calc_total_amount',
  'rate',
  'amount',
  'salary_final',
  'adp_rate',
  'total_amount',
]);

export function redactPayrollMoneyForRole<T>(value: T, roleCodes: string[]): T {
  if (isOwner(roleCodes)) {
    return value;
  }

  return redactPayrollMoney(value) as T;
}

function redactPayrollMoney(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactPayrollMoney);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (MONEY_FIELDS.has(key)) {
      continue;
    }

    redacted[key] = redactPayrollMoney(entryValue);
  }

  return redacted;
}
