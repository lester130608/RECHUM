import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');

    if (!permission.ok) {
      return jsonError(permission.error, permission.status);
    }

    const { data, error } = await supabase
      .from('employees')
      .select(
        `
        id,
        full_name,
        first_name,
        last_name,
        configs:pay_role_configs (
          id,
          role,
          tax_type,
          valid_from,
          active,
          rates:pay_role_rates (
            rate_key,
            rate_value,
            base_reference
          )
        )
      `
      )
      .eq('pay_role_configs.active', true)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) {
      return jsonError(error.message, 500);
    }

    const employees = (data || []).map((employee: any) => ({
      employee_id: employee.id,
      full_name: employee.full_name,
      first_name: employee.first_name,
      last_name: employee.last_name,
      configs: (employee.configs || [])
        .filter((config: any) => config.active === true)
        .map((config: any) => ({
          id: config.id,
          role: config.role,
          tax_type: config.tax_type,
          valid_from: config.valid_from,
          rates: config.rates || [],
        })),
    }));

    return NextResponse.json({ employees });
  } catch (error: any) {
    return jsonError(error.message || 'Internal server error', 500);
  }
}
