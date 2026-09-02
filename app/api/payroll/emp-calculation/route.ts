import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { calculateEmpPayroll, type EmpWorkerInput } from '@/lib/payroll/calcEMP';
import { PSYQ_EMPLOYEE_IDS } from '@/lib/payroll/calcPSYQ';
import { getAreaRuns, getBaseReferenceTotal } from '@/lib/owner-view';
import { chooseCurrentPeriodId } from '@/lib/payroll/periods';

// ---------------------------------------------------------------------------
// Cálculo del área EMP (oficina).
//
// Es el quinto motor. BA, CMHC, TCM y PSYQ ya tenían el suyo; EMP no, y por eso
// `office-capture` guardaba la captura en payroll_inputs pero nadie escribía
// pay_run_items. Resultado: el área aportaba $0.00 al consolidado.
//
// Sigue el patrón de tcm-calculation: preview para revisar antes de guardar,
// borrado e inserción completa de items y líneas, y el run a 'review_ready'.
//
// Tarifas: se leen de pay_role_rates (migración 0014). Verificado el
// 2026-08-31 que assignments.base_rate está vacío para las 15 personas
// del área, así que esa fuente no es viable aquí.
// ---------------------------------------------------------------------------

const EMP_AREA = 'EMP';

function isPsyqEmployee(employeeId: string) {
  return (PSYQ_EMPLOYEE_IDS as readonly string[]).includes(employeeId);
}

function fullName(employee: any) {
  return `${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.trim();
}

function findRate(rates: any, key: string) {
  return Array.isArray(rates) ? rates.find((rate: any) => rate?.rate_key === key) ?? null : null;
}

function toRateValue(rate: any): number | null {
  if (!rate || rate.rate_value === null || rate.rate_value === undefined) return null;
  const parsed = Number(rate.rate_value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadEmpCalculationContext(supabase: any, periodId: string) {
  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .select('id, period_id, area, run_level, status, last_calculated_at, calculation_metadata')
    .eq('period_id', periodId)
    .eq('area', EMP_AREA)
    .eq('run_level', 'area')
    .maybeSingle();

  if (runError) throw new Error('Failed to fetch EMP pay run');
  if (!run) throw new Error('No EMP pay run exists for this period yet.');

  const { data: input, error: inputError } = await supabase
    .from('payroll_inputs')
    .select('id, payload, status, submitted_at')
    .eq('pay_run_id', run.id)
    .eq('department', EMP_AREA)
    .maybeSingle();

  if (inputError) throw new Error('Failed to fetch EMP payroll input');
  if (!input?.payload) throw new Error('No EMP input has been captured for this period.');

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select('employee_id, role, employees (id, first_name, last_name)')
    .eq('department', EMP_AREA)
    .eq('active', true);

  if (assignmentsError) throw new Error('Failed to fetch active EMP assignments');

  // Configuraciones de pago con sus tarifas. Un empleado puede tener varias
  // activas: Edwina es BCBA/1099 en BA y OUTREACH/W2 aquí.
  const { data: configs, error: configsError } = await supabase
    .from('pay_role_configs')
    .select(`
      employee_id,
      role,
      tax_type,
      employees (id, first_name, last_name),
      pay_role_rates (rate_key, rate_value, base_reference, notes)
    `)
    .eq('active', true);

  if (configsError) throw new Error('Failed to fetch pay role configurations');

  const configsByEmployee = new Map<string, any[]>();
  for (const config of configs ?? []) {
    if (!config.employee_id) continue;
    const list = configsByEmployee.get(config.employee_id) ?? [];
    list.push(config);
    configsByEmployee.set(config.employee_id, list);
  }

  const outreachByEmployee = new Map<string, any>();
  for (const [employeeId, list] of configsByEmployee) {
    const outreach = list.find((config: any) => String(config.role).toUpperCase() === 'OUTREACH');
    if (outreach) outreachByEmployee.set(employeeId, outreach);
  }

  const payload = input.payload as Record<string, { hours?: number; days?: number }>;

  // Las filas del área: los asignados a EMP, más cualquier OUTREACH que no
  // esté asignado (misma lógica que office-capture, para no perder a nadie).
  const rows = new Map<string, { employee: any; role: string }>();

  for (const assignment of assignments ?? []) {
    const employee = assignment.employees;
    if (!assignment.employee_id || !employee?.id) continue;
    rows.set(assignment.employee_id, {
      employee,
      role: String(assignment.role ?? 'ADMIN').toUpperCase(),
    });
  }

  for (const [employeeId, config] of outreachByEmployee) {
    if (rows.has(employeeId)) continue;
    const employee = Array.isArray(config.employees) ? config.employees[0] : config.employees;
    if (!employee?.id) continue;
    rows.set(employeeId, { employee, role: 'OUTREACH' });
  }

  // La base del porcentaje depende del run de otra área (BA), no de esta
  // captura. Se resuelve una sola vez y se cachea por base_reference.
  const areaRuns = await getAreaRuns(supabase, periodId);
  const baseCache = new Map<string, number | null>();

  async function resolveBase(reference: string | null): Promise<number | null> {
    if (!reference) return null;
    if (baseCache.has(reference)) return baseCache.get(reference) ?? null;

    let value: number | null = null;
    try {
      value = await getBaseReferenceTotal(supabase, periodId, reference, areaRuns);
    } catch {
      // No se silencia como 0: calcEMP marcará la fila con
      // 'missing_outreach_base' y el importe quedará en null.
      value = null;
    }

    baseCache.set(reference, value);
    return value;
  }

  const workers: EmpWorkerInput[] = [];

  for (const [employeeId, { employee, role }] of rows) {
    const captured = payload[employeeId] ?? {};
    const outreachConfig = outreachByEmployee.get(employeeId);

    const captureType = outreachConfig
      ? 'outreach'
      : isPsyqEmployee(employeeId)
        ? 'days'
        : 'hours';

    // Para EMP se usa la config OUTREACH si existe; si no, la que coincida
    // con el rol de assignments; si no, la única que haya.
    const candidates = configsByEmployee.get(employeeId) ?? [];
    const roleConfig =
      outreachConfig ??
      candidates.find((config: any) => String(config.role).toUpperCase() === role) ??
      (candidates.length === 1 ? candidates[0] : null);

    const percentRate = findRate(outreachConfig?.pay_role_rates, 'PERCENT');
    const baseReference = percentRate?.base_reference ?? null;

    workers.push({
      employeeId,
      workerName: fullName(employee),
      role: outreachConfig ? 'OUTREACH' : role,
      captureType,
      hourlyRate: toRateValue(findRate(roleConfig?.pay_role_rates, 'HOURLY')),
      fixedSalary: toRateValue(findRate(roleConfig?.pay_role_rates, 'FIXED_SALARY')),
      // La unidad ('week', 'period') viaja en el campo notes de la tarifa.
      fixedSalaryUnit:
        findRate(roleConfig?.pay_role_rates, 'FIXED_SALARY')?.notes ?? null,
      outreachPercent: toRateValue(percentRate),
      outreachBase: captureType === 'outreach' ? await resolveBase(baseReference) : null,
      outreachBaseReference: baseReference,
      input: {
        hours: Number(captured.hours ?? 0),
        days: Number(captured.days ?? 0),
      },
    });
  }

  workers.sort((a, b) => a.workerName.localeCompare(b.workerName));

  return { run, input, calculation: calculateEmpPayroll(workers) };
}

async function loadPeriods(supabase: any) {
  const { data: periods, error } = await supabase
    .from('pay_periods')
    .select('id, week_code, start_date, end_date, pay_date, owner_deadline, status')
    .order('pay_date', { ascending: false });

  if (error) throw new Error('Failed to fetch pay periods');
  return periods ?? [];
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const periods = await loadPeriods(supabase);

    return NextResponse.json({
      periods,
      // El periodo actual, no el mas lejano en el futuro.
      selected_period_id: chooseCurrentPeriodId(periods),
    });
  } catch (error: any) {
    console.error('GET /api/payroll/emp-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const periodId = body?.period_id;
    const action = body?.action ?? 'preview';

    if (!periodId) {
      return NextResponse.json({ error: 'period_id is required' }, { status: 400 });
    }

    const context = await loadEmpCalculationContext(supabase, periodId);

    if (action === 'preview') {
      return NextResponse.json({
        pay_run: context.run,
        input: context.input,
        calculation: context.calculation,
      });
    }

    // Guardar con tarifas ausentes produciría importes en cero que se pagarían
    // como reales. Mismo criterio que TCM con las tarifas que faltan.
    if (context.calculation.hasErrors) {
      return NextResponse.json(
        {
          error: 'Cannot save EMP calculation while rates are missing',
          calculation: context.calculation,
        },
        { status: 400 }
      );
    }

    if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(context.run.status)) {
      return NextResponse.json(
        { error: 'Cannot overwrite an approved, consolidated, exported, or locked EMP run' },
        { status: 403 }
      );
    }

    const { data: existingItems, error: existingItemsError } = await supabase
      .from('pay_run_items')
      .select('id')
      .eq('pay_run_id', context.run.id);

    if (existingItemsError) {
      return NextResponse.json({ error: 'Failed to fetch existing pay items' }, { status: 500 });
    }

    const existingItemIds = (existingItems ?? []).map((item: { id: string }) => item.id);

    if (existingItemIds.length > 0) {
      const { error: deleteLinesError } = await supabase
        .from('pay_lines')
        .delete()
        .in('pay_run_item_id', existingItemIds);

      if (deleteLinesError) {
        return NextResponse.json({ error: 'Failed to clear existing pay lines' }, { status: 500 });
      }
    }

    const { error: deleteItemsError } = await supabase
      .from('pay_run_items')
      .delete()
      .eq('pay_run_id', context.run.id);

    if (deleteItemsError) {
      return NextResponse.json({ error: 'Failed to clear existing pay items' }, { status: 500 });
    }

    for (const row of context.calculation.rows) {
      const { data: item, error: itemError } = await supabase
        .from('pay_run_items')
        .insert({
          pay_run_id: context.run.id,
          worker_id: row.employeeId,
          status: 'ready',
          calc_total_hours: row.hours,
          calc_total_amount: row.totalAmount ?? 0,
          exceptions_count: 0,
        })
        .select('id')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert EMP pay run item:', itemError);
        return NextResponse.json({ error: 'Failed to save pay item' }, { status: 500 });
      }

      const line: Record<string, any> = {
        pay_run_item_id: item.id,
        created_by: auth.userId,
        metadata: {
          department: EMP_AREA,
          capture_type: row.captureType,
          role: row.role,
          days_captured: row.days,
          note: row.note,
        },
      };

      if (row.captureType === 'hours') {
        Object.assign(line, {
          line_type: 'hours',
          code: 'EMP_OFFICE_HOURS',
          units: null,
          hours: row.hours,
          rate: row.rateUsed ?? 0,
          amount: row.totalAmount ?? 0,
          description: 'Office hours at hourly rate',
        });
      } else if (row.captureType === 'days') {
        Object.assign(line, {
          line_type: 'earning',
          code: 'EMP_PSYQ_FIXED',
          units: row.days,
          hours: null,
          rate: row.rateUsed ?? 0,
          amount: row.totalAmount ?? 0,
          description: 'Psychiatrist fixed salary (days are informational)',
        });
      } else {
        Object.assign(line, {
          line_type: 'earning',
          code: 'EMP_OUTREACH_PCT',
          units: null,
          hours: null,
          rate: row.rateUsed ?? 0,
          amount: row.totalAmount ?? 0,
          description: 'Outreach percentage over another area gross',
        });
        line.metadata.base_reference = row.note;
      }

      const { error: lineError } = await supabase.from('pay_lines').insert(line);

      if (lineError) {
        console.error('Failed to insert EMP pay line:', lineError);
        return NextResponse.json({ error: 'Failed to save pay lines' }, { status: 500 });
      }
    }

    const { error: runUpdateError } = await supabase
      .from('pay_runs')
      .update({
        status: 'review_ready',
        last_calculated_at: new Date().toISOString(),
        calculation_metadata: {
          engine: 'emp_office_v1',
          calculated_by: auth.userId,
          total_amount: context.calculation.totalAmount,
          total_hours: context.calculation.totalHours,
          worker_count: context.calculation.rows.length,
          error_count: context.calculation.errorCount,
        },
      })
      .eq('id', context.run.id);

    if (runUpdateError) {
      return NextResponse.json({ error: 'Failed to mark EMP run as calculated' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'EMP calculation saved',
      pay_run_id: context.run.id,
      calculation: context.calculation,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/emp-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
