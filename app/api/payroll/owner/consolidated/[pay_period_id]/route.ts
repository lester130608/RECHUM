import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';
import { calculateOutreachAmount, isMissingTableError, type ConsolidatedLine } from '@/lib/owner-view';

function getEmployeeName(employee: any) {
  return employee?.full_name || `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() || 'Unknown';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ pay_period_id: string }> }
) {
  try {
    const { pay_period_id } = await context.params;
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');
    if (!permission.ok) return jsonError(permission.error, permission.status);

    const lines: ConsolidatedLine[] = [];

    const { data: baEntries, error: baError } = await supabase
      .from('payroll_ba_entries')
      .select(`
        employee_id,
        subtotal,
        employees!inner (first_name, last_name, full_name)
      `)
      .eq('pay_period_id', pay_period_id);

    if (baError && !isMissingTableError(baError)) {
      return jsonError(baError.message, 500);
    }

    if (!baError) {
      const employeeIds = Array.from(new Set((baEntries || []).map((entry: any) => entry.employee_id)));
      const { data: configs } = employeeIds.length
        ? await supabase
            .from('pay_role_configs')
            .select('employee_id, role, tax_type')
            .in('employee_id', employeeIds)
            .eq('active', true)
        : { data: [] };

      const configByEmployee = new Map((configs || []).map((config: any) => [config.employee_id, config]));

      for (const entry of baEntries || []) {
        const employee = Array.isArray(entry.employees) ? entry.employees[0] : entry.employees;
        const config = configByEmployee.get(entry.employee_id) as any;

        lines.push({
          employee_id: entry.employee_id,
          employee_name: getEmployeeName(employee),
          module: 'BA',
          role: config?.role || 'RBT',
          tax_type: config?.tax_type || 'W2',
          amount: Number(entry.subtotal) || 0,
        });
      }
    }

    const { data: empEntries, error: empError } = await supabase
      .from('payroll_emp_entries')
      .select(`
        employee_id,
        subtotal,
        employees!inner (first_name, last_name, full_name)
      `)
      .eq('pay_period_id', pay_period_id);

    if (empError && !isMissingTableError(empError)) {
      return jsonError(empError.message, 500);
    }

    if (!empError) {
      for (const entry of empEntries || []) {
        const employee = Array.isArray(entry.employees) ? entry.employees[0] : entry.employees;

        lines.push({
          employee_id: entry.employee_id,
          employee_name: getEmployeeName(employee),
          module: 'EMP',
          role: 'EMPLOYEE',
          tax_type: 'W2',
          amount: Number(entry.subtotal) || 0,
        });
      }
    }

    const { data: outreachConfigs } = await supabase
      .from('pay_role_configs')
      .select(`
        employee_id,
        tax_type,
        employees!inner (first_name, last_name, full_name),
        pay_role_rates (rate_key, rate_value, base_reference)
      `)
      .eq('role', 'OUTREACH')
      .eq('active', true);

    for (const config of outreachConfigs || []) {
      const employee = Array.isArray(config.employees) ? config.employees[0] : config.employees;
      const percentRate = (config.pay_role_rates as any[])?.find(
        (rate: any) => rate.rate_key === 'PERCENT'
      );

      if (!percentRate) continue;

      const amount = await calculateOutreachAmount(
        supabase,
        pay_period_id,
        config.employee_id,
        Number(percentRate.rate_value),
        percentRate.base_reference
      );

      if (amount > 0) {
        lines.push({
          employee_id: config.employee_id,
          employee_name: getEmployeeName(employee),
          module: 'EMP',
          role: 'OUTREACH',
          tax_type: config.tax_type || 'W2',
          amount,
          is_outreach_calc: true,
          notes: `${percentRate.rate_value}% x ${percentRate.base_reference}`,
        });
      }
    }

    lines.sort((a, b) => {
      if (a.tax_type !== b.tax_type) {
        return a.tax_type === 'W2' ? -1 : 1;
      }
      return a.employee_name.localeCompare(b.employee_name);
    });

    const total = lines.reduce((sum, line) => sum + line.amount, 0);

    return NextResponse.json({ lines, total });
  } catch (error: any) {
    return jsonError(error.message || 'Internal error', 500);
  }
}
