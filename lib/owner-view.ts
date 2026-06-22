import type { SupabaseClient } from '@supabase/supabase-js';

export type ModuleStatus = 'DRAFT' | 'SUBMITTED' | 'LOCKED';
export type ModuleName = 'BA' | 'TCM' | 'CMHC' | 'EMP';

export type ModuleSummary = {
  pay_period_id: string;
  pay_period: {
    id: string;
    start_date: string;
    end_date: string;
    pay_date: string;
    week_code: string;
  };
  module: ModuleName;
  status: ModuleStatus | 'NOT_STARTED';
  entries_count: number;
  total_amount: number;
  submitted_at: string | null;
  locked_at: string | null;
};

export type ConsolidatedLine = {
  employee_id: string;
  employee_name: string;
  module: ModuleName;
  role: string;
  tax_type: 'W2' | '1099';
  amount: number;
  is_outreach_calc?: boolean;
  notes?: string;
};

const MODULE_ENTRY_TABLES: Partial<Record<ModuleName, string>> = {
  BA: 'payroll_ba_entries',
  TCM: 'payroll_tcm_entries',
  CMHC: 'payroll_cmhc_entries',
  EMP: 'payroll_emp_entries',
};

export function isMissingTableError(error: any): boolean {
  const message = String(error?.message || '');
  return error?.code === '42P01' || message.includes('does not exist') || message.includes('schema cache');
}

export async function getEntrySummary(
  supabase: SupabaseClient,
  payPeriodId: string,
  module: ModuleName
): Promise<{ count: number; total: number }> {
  const table = MODULE_ENTRY_TABLES[module];
  if (!table) return { count: 0, total: 0 };

  const { data, error } = await supabase
    .from(table)
    .select('subtotal')
    .eq('pay_period_id', payPeriodId);

  if (error) {
    if (isMissingTableError(error)) return { count: 0, total: 0 };
    throw error;
  }

  return {
    count: data?.length || 0,
    total: (data || []).reduce((sum: number, entry: any) => sum + (Number(entry.subtotal) || 0), 0),
  };
}

/**
 * Calcula el monto OUTREACH para Edwina (o cualquier con OUTREACH config).
 * Suma todos los subtotales de RBT del período y multiplica por el %.
 */
export async function calculateOutreachAmount(
  supabase: SupabaseClient,
  payPeriodId: string,
  outreachEmployeeId: string,
  percent: number,
  baseReference: string
): Promise<number> {
  void outreachEmployeeId;

  if (baseReference !== 'RBT_TOTAL') {
    return 0;
  }

  const { data: rbtConfigs, error: configError } = await supabase
    .from('pay_role_configs')
    .select('employee_id')
    .eq('role', 'RBT')
    .eq('active', true);

  if (configError) return 0;

  const rbtEmployeeIds = (rbtConfigs || []).map((config: any) => config.employee_id);
  if (rbtEmployeeIds.length === 0) return 0;

  const { data: entries, error: entriesError } = await supabase
    .from('payroll_ba_entries')
    .select('subtotal')
    .eq('pay_period_id', payPeriodId)
    .in('employee_id', rbtEmployeeIds);

  if (entriesError) return 0;

  const rbtTotal = (entries || []).reduce(
    (sum: number, entry: any) => sum + (Number(entry.subtotal) || 0),
    0
  );

  return Math.round(rbtTotal * (percent / 100) * 100) / 100;
}

/**
 * Obtiene el status de un módulo para un pay period.
 * Lee de payroll_module_status (BA/TCM/CMHC) o payroll_emp_module_status (EMP).
 */
export async function getModuleStatus(
  supabase: SupabaseClient,
  payPeriodId: string,
  module: ModuleName
): Promise<ModuleStatus | 'NOT_STARTED'> {
  if (module === 'EMP') {
    const { data } = await supabase
      .from('payroll_emp_module_status')
      .select('status')
      .eq('pay_period_id', payPeriodId)
      .maybeSingle();
    return (data?.status as ModuleStatus) || 'NOT_STARTED';
  }

  const { data } = await supabase
    .from('payroll_module_status')
    .select('status')
    .eq('pay_period_id', payPeriodId)
    .eq('module', module)
    .maybeSingle();

  return (data?.status as ModuleStatus) || 'NOT_STARTED';
}
