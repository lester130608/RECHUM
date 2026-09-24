// app/api/payroll/employees/[employee_id]/route.ts
// Ficha de un empleado: quien es, como cobra y que se le ha pagado.
//
// Solo owner. Los supervisores no ven importes ni tarifas en ninguna
// pantalla, y esta es la que mas los concentra.
//
// Todo sale de tablas que ya existen. No calcula nada: si un importe no
// esta en pay_run_items, aqui no aparece.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

/** Estados en los que el dinero ya es dinero pagado. */
const PAID_RUN_STATUSES = ['owner_approved', 'consolidated', 'exported', 'locked'];

const HISTORY_LIMIT = 25;

export async function GET(
  _request: Request,
  context: { params: Promise<{ employee_id: string }> }
) {
  try {
    const { employee_id } = await context.params;
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // -- 1. El empleado ---------------------------------------------------
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, first_name, last_name, full_name, email, status, ready_for_payroll')
      .eq('id', employee_id)
      .maybeSingle();

    if (employeeError) {
      return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
    }
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // -- 2. Asignaciones, activas e inactivas -----------------------------
    // Una persona puede tener varias: Edwina es BCBA/1099 en BA y
    // OUTREACH/W2 en EMP. El rol y el tipo fiscal son POR AREA.
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('department, role, active, tax_type, base_rate')
      .eq('employee_id', employee_id);

    if (assignmentsError) {
      return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
    }

    // -- 3. Configuracion de pago y tarifas -------------------------------
    const { data: configs, error: configsError } = await supabase
      .from('pay_role_configs')
      .select(
        `
        id,
        role,
        tax_type,
        active,
        valid_from,
        valid_to,
        notes,
        pay_role_rates (rate_key, rate_value, base_reference, notes)
      `
      )
      .eq('employee_id', employee_id);

    if (configsError) {
      return NextResponse.json({ error: 'Failed to fetch pay configuration' }, { status: 500 });
    }

    // -- 4. Historial de pagos --------------------------------------------
    const { data: items, error: itemsError } = await supabase
      .from('pay_run_items')
      .select('id, pay_run_id, calc_total_hours, calc_total_amount, status')
      .eq('worker_id', employee_id);

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to fetch pay items' }, { status: 500 });
    }

    const itemList = items ?? [];
    const runIds = Array.from(new Set(itemList.map((item) => item.pay_run_id).filter(Boolean)));

    const runsById = new Map<string, any>();
    const periodsById = new Map<string, any>();

    if (runIds.length > 0) {
      const { data: runs, error: runsError } = await supabase
        .from('pay_runs')
        .select('id, area, run_level, status, period_id')
        .in('id', runIds);

      if (runsError) {
        return NextResponse.json({ error: 'Failed to fetch pay runs' }, { status: 500 });
      }

      for (const run of runs ?? []) {
        if (run.run_level === 'area') runsById.set(run.id, run);
      }

      const periodIds = Array.from(
        new Set(Array.from(runsById.values()).map((run) => run.period_id).filter(Boolean))
      );

      if (periodIds.length > 0) {
        const { data: periods, error: periodsError } = await supabase
          .from('pay_periods')
          .select('id, week_code, start_date, end_date, pay_date')
          .in('id', periodIds);

        if (periodsError) {
          return NextResponse.json({ error: 'Failed to fetch pay periods' }, { status: 500 });
        }

        for (const period of periods ?? []) periodsById.set(period.id, period);
      }
    }

    // Desglose por concepto de cada item.
    const linesByItem = new Map<string, any[]>();
    const itemIds = itemList.map((item) => item.id).filter(Boolean);

    if (itemIds.length > 0) {
      const { data: payLines, error: payLinesError } = await supabase
        .from('pay_lines')
        .select('pay_run_item_id, code, hours, units, rate, amount, description')
        .in('pay_run_item_id', itemIds);

      if (payLinesError) {
        return NextResponse.json({ error: 'Failed to fetch pay lines' }, { status: 500 });
      }

      for (const line of payLines ?? []) {
        const current = linesByItem.get(line.pay_run_item_id) ?? [];
        current.push(line);
        linesByItem.set(line.pay_run_item_id, current);
      }
    }

    const history = itemList
      .map((item) => {
        const run = runsById.get(item.pay_run_id);
        if (!run) return null; // runs consolidados: no son de area
        const period = periodsById.get(run.period_id);
        if (!period) return null;

        return {
          item_id: item.id,
          week_code: period.week_code,
          start_date: period.start_date,
          end_date: period.end_date,
          pay_date: period.pay_date,
          area: run.area,
          run_status: run.status,
          hours: item.calc_total_hours == null ? null : Number(item.calc_total_hours),
          amount: Number(item.calc_total_amount) || 0,
          lines: (linesByItem.get(item.id) ?? []).map((line) => ({
            code: line.code,
            description: line.description,
            hours: line.hours == null ? null : Number(line.hours),
            units: line.units == null ? null : Number(line.units),
            rate: line.rate == null ? null : Number(line.rate),
            amount: Number(line.amount) || 0,
          })),
        };
      })
      .filter(Boolean) as any[];

    history.sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)));

    // -- 5. Acumulado del anio en curso -----------------------------------
    // Solo periodos ya aprobados: un borrador no es dinero pagado, y sumarlo
    // daria un acumulado que nunca cuadra contra ADP.
    const currentYear = new Date().getFullYear().toString();
    const paidThisYear = history.filter(
      (row) =>
        String(row.pay_date).slice(0, 4) === currentYear &&
        PAID_RUN_STATUSES.includes(row.run_status)
    );

    const ytd = {
      year: currentYear,
      amount: paidThisYear.reduce((sum, row) => sum + row.amount, 0),
      hours: paidThisYear.reduce((sum, row) => sum + (row.hours ?? 0), 0),
      periods: paidThisYear.length,
    };

    return NextResponse.json({
      employee,
      assignments: assignments ?? [],
      configs: configs ?? [],
      ytd,
      history: history.slice(0, HISTORY_LIMIT),
      history_truncated: history.length > HISTORY_LIMIT,
    });
  } catch (error: any) {
    console.error('GET /api/payroll/employees/[employee_id] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
