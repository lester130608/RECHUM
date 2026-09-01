import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';
import { detectRateConflict } from '@/lib/emp-module';
import { getBaseReferenceTotal, getModuleStatus } from '@/lib/owner-view';
import type { EmpEmployee, EmpModuleData } from '@/lib/types/emp-module';

// GET: Cargar datos del módulo EMP para un pay period
export async function GET(
  request: Request,
  context: { params: Promise<{ pay_period_id: string }> }
) {
  try {
    const { pay_period_id } = await context.params;
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');
    if (!permission.ok) return jsonError(permission.error, permission.status);

    // 1. Obtener pay period
    const { data: payPeriod, error: ppError } = await supabase
      .from('pay_periods')
      .select('id, start_date, end_date, pay_date, capture_opens_at, sup_deadline, owner_deadline, week_code, status')
      .eq('id', pay_period_id)
      .single();

    if (ppError || !payPeriod) {
      return jsonError('Pay period not found', 404);
    }

    // 2. Obtener status del módulo (o crear DRAFT si no existe)
    let { data: moduleStatus } = await supabase
      .from('payroll_emp_module_status')
      .select('status')
      .eq('pay_period_id', pay_period_id)
      .maybeSingle();

    if (!moduleStatus) {
      moduleStatus = { status: 'DRAFT' };
    }

    // 3. Obtener todos los empleados con pay_role_config activa role=EMPLOYEE
    const { data: configs, error: cError } = await supabase
      .from('pay_role_configs')
      .select(`
        employee_id,
        role,
        tax_type,
        valid_from,
        valid_to,
        active,
        employees!inner (
          id,
          first_name,
          last_name,
          full_name
        ),
        pay_role_rates (rate_key, rate_value, base_reference)
      `)
      .eq('role', 'EMPLOYEE')
      .eq('active', true);

    if (cError) return jsonError(cError.message, 500);

    // 4. Obtener entries existentes para este pay period
    const { data: entries } = await supabase
      .from('payroll_emp_entries')
      .select('*')
      .eq('pay_period_id', pay_period_id);

    const entriesByEmployee = new Map(
      (entries || []).map((e: any) => [e.employee_id, e])
    );

    // 5. Verificar status del módulo BA (para Edwina).
    // Antes leía payroll_module_status, tabla que no existe: baStatus salía
    // siempre null, baSubmitted siempre false, y el porcentaje de Edwina
    // quedaba bloqueado de forma permanente sin ningún aviso.
    const baStatus = await getModuleStatus(supabase, pay_period_id, 'BA');
    const baSubmitted = baStatus === 'SUBMITTED' || baStatus === 'LOCKED';

    // 6. Para cada config, detectar conflictos y armar respuesta
    const employees: EmpEmployee[] = [];
    
    for (const config of ((configs || []) as any[])) {
      const emp = Array.isArray(config.employees) ? config.employees[0] : config.employees;
      const hourlyRate = config.pay_role_rates?.find((r: any) => r.rate_key === 'HOURLY');
      const fixedRate = config.pay_role_rates?.find((r: any) => r.rate_key === 'FIXED_SALARY');
      const outreachPct = config.pay_role_rates?.find((r: any) => r.rate_key === 'PERCENT');
      
      if (!emp?.id) continue;

      const isFixedSalary = !!fixedRate;
      const isOutreach = !!outreachPct;
      
      // Detectar rate conflict solo si es HOURLY estándar
      let conflict: {
        hasConflict: boolean;
        oldRate: number | null;
        newRate: number | null;
        changeDate: string | null;
      } = { hasConflict: false, oldRate: null, newRate: null, changeDate: null };
      if (!isFixedSalary && !isOutreach) {
        conflict = await detectRateConflict(
          supabase,
          emp.id,
          payPeriod.start_date,
          payPeriod.end_date
        );
      }
      
      // Para Outreach: obtener la base del porcentaje si BA ya está submitted.
      // Antes leía payroll_ba_entries, tabla que no existe; ahora usa la misma
      // fuente que la consolidación (pay_run_items del run de BA).
      let outreachBaseTotal: number | null = null;
      let outreachBaseError: string | null = null;
      if (isOutreach && baSubmitted) {
        const baseReference = outreachPct?.base_reference || 'RBT_TOTAL';
        try {
          outreachBaseTotal = await getBaseReferenceTotal(
            supabase,
            pay_period_id,
            baseReference
          );
        } catch (err: any) {
          // No se silencia como 0: un cero aquí se pagaría como si fuera real.
          outreachBaseError = err?.message || 'Error calculando la base OUTREACH';
        }
      }
      
      const existingEntry = entriesByEmployee.get(emp.id) || null;
      const fixedAmount = fixedRate?.rate_value != null ? Number(fixedRate.rate_value) : null;
      const outreachPctValue = outreachPct?.rate_value != null ? Number(outreachPct.rate_value) : null;
      const computedEntry =
        existingEntry ||
        (isFixedSalary
          ? {
              id: `fixed-${emp.id}`,
              hours: null,
              prorate_date: null,
              rate_decision_type: 'fixed_salary',
              rate_used: null,
              rate_decision_note: 'Fixed salary',
              subtotal: fixedAmount,
            }
          : // Sin base calculada no se inventa un subtotal: si outreachBaseTotal
            // es null es que el cálculo falló, y un 0 se pagaría como real.
            isOutreach && baSubmitted && outreachBaseTotal !== null
            ? {
                id: `outreach-${emp.id}`,
                hours: null,
                prorate_date: null,
                rate_decision_type: 'outreach_pct',
                rate_used: null,
                rate_decision_note: `${outreachPctValue}% of BA total`,
                subtotal: outreachBaseTotal * ((outreachPctValue || 0) / 100),
              }
            : null);
      
      employees.push({
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        full_name: emp.full_name,
        has_rate_conflict: conflict.hasConflict,
        rate_old: conflict.oldRate,
        rate_new: conflict.newRate || (hourlyRate?.rate_value ?? null),
        rate_change_date: conflict.changeDate,
        is_fixed_salary: isFixedSalary,
        fixed_amount: fixedAmount,
        is_outreach: isOutreach,
        outreach_pct: outreachPctValue,
        outreach_base_total: outreachBaseTotal,
        outreach_base_error: outreachBaseError,
        outreach_blocked: isOutreach && !baSubmitted,
        entry: computedEntry as any,
      });
    }

    // Ordenar por last_name
    employees.sort((a, b) => a.last_name.localeCompare(b.last_name));

    // Calcular total
    const total = employees.reduce(
      (sum, e) => sum + (Number(e.entry?.subtotal) || 0),
      0
    );
    const hasConflicts = employees.filter(e => e.has_rate_conflict && !e.entry).length;

    const response: EmpModuleData = {
      pay_period: payPeriod,
      module_status: moduleStatus.status,
      employees,
      total,
      has_conflicts: hasConflicts,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    return jsonError(error.message || 'Internal error', 500);
  }
}

export async function POST() {
  return jsonError('Legacy EMP module is read-only. Use pay_runs for new payroll operations.', 405);
}
