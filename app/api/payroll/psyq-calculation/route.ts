import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import {
  PSYQ_EMPLOYEE_IDS,
  calculatePsyqPayroll,
  type PsyqWorkerInput,
} from '@/lib/payroll/calcPSYQ';

const PSYQ_AREA = 'PSYQ';
const EMP_DEPARTMENT = 'EMP';

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

async function getOrCreatePsyqRun(supabase: any, periodId: string, userId: string) {
  const { data: existingRun, error: existingRunError } = await supabase
    .from('pay_runs')
    .select('id, period_id, area, run_level, status, last_calculated_at, calculation_metadata')
    .eq('period_id', periodId)
    .eq('area', PSYQ_AREA)
    .eq('run_level', 'area')
    .maybeSingle();

  if (existingRunError) {
    throw new Error('Failed to fetch PSYQ pay run');
  }

  if (existingRun) {
    return existingRun;
  }

  const { data: newRun, error: createRunError } = await supabase
    .from('pay_runs')
    .insert({
      period_id: periodId,
      area: PSYQ_AREA,
      run_level: 'area',
      status: 'draft',
      created_by: userId,
    })
    .select('id, period_id, area, run_level, status, last_calculated_at, calculation_metadata')
    .single();

  if (createRunError || !newRun) {
    throw new Error('Failed to create PSYQ pay run');
  }

  return newRun;
}

async function loadPsyqCalculationContext(supabase: any, periodId: string, userId: string) {
  const run = await getOrCreatePsyqRun(supabase, periodId, userId);

  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select(`
      employee_id,
      role,
      base_rate,
      active,
      department,
      employees (
        id,
        first_name,
        last_name
      )
    `)
    .eq('department', EMP_DEPARTMENT)
    .in('employee_id', [...PSYQ_EMPLOYEE_IDS]);

  if (assignmentsError) {
    throw new Error('Failed to fetch PSYQ fixed-salary assignments');
  }

  const assignmentByEmployee = new Map((assignments ?? []).map((assignment: any) => [assignment.employee_id, assignment]));

  const workers: PsyqWorkerInput[] = PSYQ_EMPLOYEE_IDS.map((employeeId) => {
    const assignment = assignmentByEmployee.get(employeeId) as any;
    const employee = assignment?.employees;

    return {
      employeeId,
      workerName: employee
        ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
        : `Missing employee ${employeeId}`,
      role: assignment?.role ?? 'ADMIN',
      baseRate:
        assignment?.base_rate === null || assignment?.base_rate === undefined
          ? null
          : Number(assignment.base_rate),
    };
  });

  return {
    run,
    calculation: calculatePsyqPayroll(workers),
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
    console.error('GET /api/payroll/psyq-calculation error:', error);
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

    const context = await loadPsyqCalculationContext(supabase, periodId, auth.userId);

    if (action === 'preview') {
      return NextResponse.json({
        pay_run: context.run,
        calculation: context.calculation,
      });
    }

    if (context.calculation.hasErrors) {
      return NextResponse.json(
        {
          error: 'Cannot save PSYQ calculation while fixed salary rates are missing',
          calculation: context.calculation,
        },
        { status: 400 }
      );
    }

    if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(context.run.status)) {
      return NextResponse.json(
        { error: 'Cannot overwrite an approved, consolidated, exported, or locked PSYQ run' },
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
          calc_total_hours: 0,
          calc_total_amount: row.totalAmount ?? 0,
          exceptions_count: 0,
        })
        .select('id')
        .single();

      if (itemError || !item) {
        console.error('Failed to insert PSYQ pay run item:', itemError);
        return NextResponse.json({ error: 'Failed to save pay item' }, { status: 500 });
      }

      const { error: lineError } = await supabase.from('pay_lines').insert({
        pay_run_item_id: item.id,
        line_type: 'earning',
        code: 'PSYQ_SALARY',
        units: 1,
        hours: null,
        rate: row.fixedSalary ?? 0,
        amount: row.totalAmount ?? 0,
        description: 'PSYQ fixed biweekly salary',
        metadata: {
          department: EMP_DEPARTMENT,
          area: PSYQ_AREA,
          role: row.role,
          fixed_salary: row.fixedSalary,
          source: 'assignments.base_rate',
        },
        created_by: auth.userId,
      });

      if (lineError) {
        console.error('Failed to insert PSYQ pay line:', lineError);
        return NextResponse.json({ error: 'Failed to save pay line' }, { status: 500 });
      }
    }

    const { error: runUpdateError } = await supabase
      .from('pay_runs')
      .update({
        last_calculated_at: new Date().toISOString(),
        calculation_metadata: {
          engine: 'psyq_fixed_salary_v1',
          calculated_by: auth.userId,
          total_amount: context.calculation.totalAmount,
          worker_count: context.calculation.rows.length,
          error_count: context.calculation.errorCount,
          employee_ids: [...PSYQ_EMPLOYEE_IDS],
        },
      })
      .eq('id', context.run.id);

    if (runUpdateError) {
      return NextResponse.json({ error: 'Failed to mark PSYQ run as calculated' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'PSYQ calculation saved',
      pay_run_id: context.run.id,
      calculation: context.calculation,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/psyq-calculation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
