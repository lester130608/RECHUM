import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');
    if (!permission.ok) return jsonError(permission.error, permission.status);

    // Obtener todos los períodos donde existe entry de EMP O status del módulo
    const { data: statuses } = await supabase
      .from('payroll_emp_module_status')
      .select(`
        pay_period_id,
        status,
        submitted_at,
        locked_at,
        pay_periods (id, start_date, end_date, pay_date, week_code, status)
      `)
      .order('submitted_at', { ascending: false });

    const history = (statuses || []).map((s: any) => ({
      pay_period_id: s.pay_period_id,
      module_status: s.status,
      submitted_at: s.submitted_at,
      locked_at: s.locked_at,
      pay_period: s.pay_periods,
    }));

    return NextResponse.json({ history });
  } catch (error: any) {
    return jsonError(error.message || 'Internal error', 500);
  }
}
