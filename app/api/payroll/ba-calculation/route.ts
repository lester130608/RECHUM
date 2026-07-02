import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { calculateBaPayroll, type BaWorkerInput } from '@/lib/payroll/calcBA';

const BA_AREA = 'BA';
const SERVICE_CONCEPTS = ['ASSESSMENT', 'REASSESSMENT'] as const;

type ServiceConcept = (typeof SERVICE_CONCEPTS)[number];

async function loadPeriods(supabase: any) {
  const { data: periods, error } = await supabase
    .from('pay_periods')
    .select('id, week_code, start_date, end_date, pay_date, sup_deadline, status')
    .order('pay_date', { ascending: false });

  if (error) {
    throw new Error('Failed to fetch pay periods');
  }

  return periods ?? [];
}

async function loadBaCalculationContext(supabase: any, periodId: string) {
  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .select('id, period_id, area, run_level, status, last_calculated_at, calculation_metadata')
    .eq('period_id', periodId)
    .eq('area', BA_AREA)
    .eq('run_level', 'area')
    .maybeSingle();

  if (runError) {
    throw new Error('Failed to fetch BA pay run');
  }

  if (!run) {
    throw new Error('No BA pay run exists for this period yet.');
  }

  const { data: input, error: inputError } = await supabase
    .from('payroll_inputs')
    .select('id, payload, status, submitted_at')
    .eq('pay_run_id', run.id)
    .eq('department', BA_AREA)
    .maybeSingle();

  if (inputError) {
    throw new Error('Failed to fetch BA payroll input');
  }

  if (!input?.payload) {
    throw new Error('No BA input has been captured for this period.');
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select(`
      employee_id,
      role,
      base_rate,
      active,
      employees (
        id,
        first_name,
        last_name
      )
    `)
    .eq('department', BA_AREA)
    .eq('active', true);

  if (assignmentsError) {
    throw new Error('Failed to fetch active BA assignments');
  }

  const employeeIds = (assignments ?? [])
    .map((assignment: any) => assignment.employee_id)
    .filter(Boolean);

  let serviceRates: any[] = [];
  if (employeeIds.length > 0) {
    const { data: rates, error: ratesError } = await supabase
      .from('pay_rates')
      .select('employee_id, department, concept, rate, valid_to')
      .in('employee_id', employeeIds)
      .eq('department', BA_AREA)
      .in('concept', [...SERVICE_CONCEPTS])
      .is('valid_to', null);

    if (ratesError) {
      throw new Error('Failed to fetch active BA service rates');
    }

    serviceRates = rates ?? [];
  }

  const ratesByEmployee = new Map<string, Partial<Record<ServiceConcept, number>>>();
  for (const rate of serviceRates) {
    const employeeId = rate.employee_id as string;
    const concept = rate.concept as ServiceConcept;
    if (!SERVICE_CONCEPTS.includes(concept)) continue;

    const current = ratesByEmployee.get(employeeId) ?? {};
    current[concept] = Number(rate.rate);
    ratesByEmployee.set(employeeId, current);
  }

  const payload = input.payload as Record<
    string,
    { hours?: number; assessment?: number; reassessment?: number }
  >;

  const workers: BaWorkerInput[] = (assignments ?? [])
    .map((assignment: any) => {
      const employee = assignment.employees;
      if (!employee?.id) return null;

      const captured = payload[assignment.employee_id] ?? {
        hours: 0,
        assessment: 0,
        reassessment: 0,
      };
      const employeeRates = ratesByEmployee.get(assignment.employee_id) ?? {};

      return {
        employeeId: assignment.employee_id,
        workerName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        role: assignment.role ?? '',
        baseRate:
          assignment.base_rate === null || assignment.base_rate === undefined
            ? null
            : Number(assignment.base_rate),
        serviceRates: {
          assessment:
            employeeRates.ASSESSMENT === null || employeeRates.ASSESSMENT === undefined
              ? null
              : Number(employeeRates.ASSESSMENT),
          reassessment:
            employeeRates.REASSESSMENT === null || employeeRates.REASSESSMENT === undefined
              ? null
              : Number(employeeRates.REASSESSMENT),
        },
        input: {
          hours: Number(captured.hours ?? 0),
          assessment: Number(captured.assessment ?? 0),
          reassessment: Number(captured.reassessment ?? 0),
        },
      };
    })
    .filter(Boolean)
    .sort((a: BaWorkerInput, b: BaWorkerInput) => a.workerName.localeCompare(b.workerName));

  return {
    run,
    input,
    calculation: calculateBaPayroll(workers),
  };
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
      selected_period_id: periods[0]?.id ?? null,
    });
  } catch (error: any) {
    console.error('GET /api/payroll/ba-calculation error:', error);
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
    const periodId = body.period_id as string | undefined;
    const action = body.action as 'preview' | 'confirm' | undefined;

    if (!periodId || !action) {
      return NextResponse.json({ error: 'period_id and action are required' }, { status: 400 });
    }

    if (!['preview', 'confirm'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const context = await loadBaCalculationContext(supabase, periodId);

    if (action === 'preview') {
      return NextResponse.json({
        pay_run: context.run,
        input: context.input,
        calculation: context.calculation,
      });
    }

    if (context.calculation.hasErrors) {
      return NextResponse.json(
        {
          error: 'Cannot save BA calculation while rates are missing',
          calculation: context.calculation,
        },
        { status: 400 }
      );
    }

    if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(context.run.status)) {
      return NextResponse.json(
        { error: 'Cannot overwrite an approved, consolidated, exported, or locked BA run' },
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
          calc_total_hours: row.hours.quantity,
          calc_total_amount: row.totalAmount ?? 0,
          exceptions_count: 0,
        })
        .select('id')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert BA pay run item:', itemError);
        return NextResponse.json({ error: 'Failed to save pay item' }, { status: 500 });
      }

      const lines = [
        {
          pay_run_item_id: item.id,
          line_type: 'hours',
          code: 'BA_HOURS',
          units: row.hours.quantity,
          hours: row.hours.quantity,
          rate: row.hours.rate ?? 0,
          amount: row.hours.amount ?? 0,
          description: 'BA hours',
          metadata: {
            department: BA_AREA,
            role: row.role,
            base_rate: row.baseRate,
          },
          created_by: auth.userId,
        },
        {
          pay_run_item_id: item.id,
          line_type: 'earning',
          code: 'BA_ASSESSMENT',
          units: row.assessment.quantity,
          hours: null,
          rate: row.assessment.rate ?? 0,
          amount: row.assessment.amount ?? 0,
          description: 'BA assessment',
          metadata: {
            department: BA_AREA,
            concept: 'ASSESSMENT',
            role: row.role,
            applies: row.assessment.applies,
            rate_source: 'pay_rates.valid_to_is_null',
          },
          created_by: auth.userId,
        },
        {
          pay_run_item_id: item.id,
          line_type: 'earning',
          code: 'BA_REASSESSMENT',
          units: row.reassessment.quantity,
          hours: null,
          rate: row.reassessment.rate ?? 0,
          amount: row.reassessment.amount ?? 0,
          description: 'BA reassessment',
          metadata: {
            department: BA_AREA,
            concept: 'REASSESSMENT',
            role: row.role,
            applies: row.reassessment.applies,
            rate_source: 'pay_rates.valid_to_is_null',
          },
          created_by: auth.userId,
        },
      ];

      const { error: linesError } = await supabase.from('pay_lines').insert(lines);

      if (linesError) {
        console.error('Failed to insert BA pay lines:', linesError);
        return NextResponse.json({ error: 'Failed to save pay lines' }, { status: 500 });
      }
    }

    const { error: runUpdateError } = await supabase
      .from('pay_runs')
      .update({
        last_calculated_at: new Date().toISOString(),
        calculation_metadata: {
          engine: 'ba_preview_v1',
          calculated_by: auth.userId,
          total_amount: context.calculation.totalAmount,
          total_hours: context.calculation.totalHours,
          worker_count: context.calculation.rows.length,
          error_count: context.calculation.errorCount,
        },
      })
      .eq('id', context.run.id);

    if (runUpdateError) {
      return NextResponse.json({ error: 'Failed to mark BA run as calculated' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'BA calculation saved',
      pay_run_id: context.run.id,
      calculation: context.calculation,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/ba-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
