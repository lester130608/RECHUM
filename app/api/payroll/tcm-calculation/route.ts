import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { calculateTcmPayroll, type TcmWorkerInput } from '@/lib/payroll/calcTCM';

const TCM_AREA = 'TCM';

async function loadTcmCalculationContext(supabase: any, periodId: string) {
  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .select('id, period_id, area, run_level, status, last_calculated_at, calculation_metadata')
    .eq('period_id', periodId)
    .eq('area', TCM_AREA)
    .eq('run_level', 'area')
    .maybeSingle();

  if (runError) {
    throw new Error('Failed to fetch TCM pay run');
  }

  if (!run) {
    throw new Error('No TCM pay run exists for this period yet.');
  }

  const { data: input, error: inputError } = await supabase
    .from('payroll_inputs')
    .select('id, payload, status, submitted_at')
    .eq('pay_run_id', run.id)
    .eq('department', TCM_AREA)
    .maybeSingle();

  if (inputError) {
    throw new Error('Failed to fetch TCM payroll input');
  }

  if (!input?.payload) {
    throw new Error('No TCM input has been captured for this period.');
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select(`
      employee_id,
      base_rate,
      active,
      employees (
        id,
        first_name,
        last_name
      )
    `)
    .eq('department', TCM_AREA)
    .eq('active', true);

  if (assignmentsError) {
    throw new Error('Failed to fetch active TCM assignments');
  }

  const payload = input.payload as Record<string, { week1?: number; week2?: number }>;
  const workers: TcmWorkerInput[] = (assignments ?? [])
    .map((assignment: any) => {
      const employee = assignment.employees;
      if (!employee?.id) return null;

      const captured = payload[assignment.employee_id] ?? { week1: 0, week2: 0 };
      return {
        employeeId: assignment.employee_id,
        workerName: `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim(),
        baseRate:
          assignment.base_rate === null || assignment.base_rate === undefined
            ? null
            : Number(assignment.base_rate),
        input: {
          week1: Number(captured.week1 ?? 0),
          week2: Number(captured.week2 ?? 0),
        },
      };
    })
    .filter(Boolean)
    .sort((a: TcmWorkerInput, b: TcmWorkerInput) => a.workerName.localeCompare(b.workerName));

  return {
    run,
    input,
    calculation: calculateTcmPayroll(workers),
  };
}

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
    console.error('GET /api/payroll/tcm-calculation error:', error);
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

    const context = await loadTcmCalculationContext(supabase, periodId);

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
          error: 'Cannot save TCM calculation while rates are missing',
          calculation: context.calculation,
        },
        { status: 400 }
      );
    }

    if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(context.run.status)) {
      return NextResponse.json(
        { error: 'Cannot overwrite an approved, consolidated, exported, or locked TCM run' },
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
          calc_total_hours: row.totalHours,
          calc_total_amount: row.totalAmount ?? 0,
          exceptions_count: 0,
        })
        .select('id')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert TCM pay run item:', itemError);
        return NextResponse.json({ error: 'Failed to save pay item' }, { status: 500 });
      }

      const lines = [
        {
          pay_run_item_id: item.id,
          line_type: 'hours',
          code: 'TCM_WEEK_1',
          units: row.week1.units,
          hours: row.week1.hours,
          rate: row.week1.rate ?? 0,
          amount: row.week1.amount ?? 0,
          description: 'TCM week 1 units converted to hours',
          metadata: {
            department: TCM_AREA,
            week: 1,
            threshold_hours: 34,
            threshold_rate: 30,
            threshold_applied: row.week1.thresholdApplied,
            base_rate: row.baseRate,
          },
          created_by: auth.userId,
        },
        {
          pay_run_item_id: item.id,
          line_type: 'hours',
          code: 'TCM_WEEK_2',
          units: row.week2.units,
          hours: row.week2.hours,
          rate: row.week2.rate ?? 0,
          amount: row.week2.amount ?? 0,
          description: 'TCM week 2 units converted to hours',
          metadata: {
            department: TCM_AREA,
            week: 2,
            threshold_hours: 34,
            threshold_rate: 30,
            threshold_applied: row.week2.thresholdApplied,
            base_rate: row.baseRate,
          },
          created_by: auth.userId,
        },
      ];

      const { error: linesError } = await supabase.from('pay_lines').insert(lines);

      if (linesError) {
        console.error('Failed to insert TCM pay lines:', linesError);
        return NextResponse.json({ error: 'Failed to save pay lines' }, { status: 500 });
      }
    }

    const { error: runUpdateError } = await supabase
      .from('pay_runs')
      .update({
        last_calculated_at: new Date().toISOString(),
        calculation_metadata: {
          engine: 'tcm_34h_preview_v1',
          calculated_by: auth.userId,
          total_amount: context.calculation.totalAmount,
          total_hours: context.calculation.totalHours,
          worker_count: context.calculation.rows.length,
          missing_rate_count: context.calculation.missingRateCount,
        },
      })
      .eq('id', context.run.id);

    if (runUpdateError) {
      return NextResponse.json({ error: 'Failed to mark TCM run as calculated' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'TCM calculation saved',
      pay_run_id: context.run.id,
      calculation: context.calculation,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/tcm-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
