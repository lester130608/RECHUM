import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { PSYQ_EMPLOYEE_IDS } from '@/lib/payroll/calcPSYQ';

const OFFICE_RUN_AREA = 'EMP';
const OFFICE_INPUT_DEPARTMENT = 'EMP';
const EMP_DEPARTMENT = 'EMP';

type OfficePayloadEntry = {
  hours?: number;
  days?: number;
};

function fullName(employee: any) {
  return `${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.trim();
}

function isPsyqEmployee(employeeId: string) {
  return (PSYQ_EMPLOYEE_IDS as readonly string[]).includes(employeeId);
}

function findPercentRate(rates: any) {
  return Array.isArray(rates)
    ? rates.find((rate: any) => rate.rate_key === 'PERCENT') ?? null
    : null;
}

async function loadPeriods(supabase: any) {
  const { data: periods, error } = await supabase
    .from('pay_periods')
    .select('id, week_code, start_date, end_date, pay_date, owner_deadline, status')
    .order('pay_date', { ascending: false });

  if (error) {
    throw new Error('Failed to fetch pay periods');
  }

  return periods ?? [];
}

async function loadOfficeEmployees(supabase: any) {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('assignments')
    .select(`
      employee_id,
      role,
      active,
      employees (
        id,
        first_name,
        last_name
      )
    `)
    .eq('department', EMP_DEPARTMENT)
    .eq('active', true);

  if (assignmentsError) {
    throw new Error('Failed to fetch office employees');
  }

  const { data: outreachConfigs, error: outreachError } = await supabase
    .from('pay_role_configs')
    .select(`
      employee_id,
      role,
      active,
      employees (
        id,
        first_name,
        last_name
      ),
      pay_role_rates (
        rate_key,
        rate_value,
        base_reference
      )
    `)
    .eq('role', 'OUTREACH')
    .eq('active', true);

  if (outreachError) {
    throw new Error('Failed to fetch outreach configuration');
  }

  const outreachByEmployee = new Map<string, any>();
  for (const config of outreachConfigs ?? []) {
    if (config.employee_id) {
      outreachByEmployee.set(config.employee_id, config);
    }
  }

  const rowsByEmployee = new Map<string, any>();

  for (const assignment of assignments ?? []) {
    const employee = assignment.employees;
    if (!assignment.employee_id || !employee?.id) continue;

    const outreachConfig = outreachByEmployee.get(assignment.employee_id);
    const captureType = outreachConfig
      ? 'edwina'
      : isPsyqEmployee(assignment.employee_id)
        ? 'days'
        : 'hours';

    rowsByEmployee.set(assignment.employee_id, {
      employee_id: assignment.employee_id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      worker_name: fullName(employee),
      role: outreachConfig ? 'OUTREACH' : isPsyqEmployee(assignment.employee_id) ? 'PSYQ' : assignment.role ?? 'ADMIN',
      capture_type: captureType,
      outreach_rate: findPercentRate(outreachConfig?.pay_role_rates),
      computed_amount: null,
    });
  }

  for (const [employeeId, config] of outreachByEmployee) {
    if (rowsByEmployee.has(employeeId)) continue;
    const employee = Array.isArray(config.employees) ? config.employees[0] : config.employees;
    if (!employee?.id) continue;

    rowsByEmployee.set(employeeId, {
      employee_id: employeeId,
      first_name: employee.first_name,
      last_name: employee.last_name,
      worker_name: fullName(employee),
      role: 'OUTREACH',
      capture_type: 'edwina',
      outreach_rate: findPercentRate(config.pay_role_rates),
      computed_amount: null,
    });
  }

  return Array.from(rowsByEmployee.values()).sort((a, b) =>
    a.worker_name.localeCompare(b.worker_name)
  );
}

async function loadExistingInput(supabase: any, periodId: string) {
  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .select('id, status, period_id, area, run_level')
    .eq('period_id', periodId)
    .eq('area', OFFICE_RUN_AREA)
    .eq('run_level', 'area')
    .maybeSingle();

  if (runError) {
    throw new Error('Failed to fetch office pay run');
  }

  if (!run) {
    return { run: null, input: null };
  }

  const { data: input, error: inputError } = await supabase
    .from('payroll_inputs')
    .select('id, status, payload, submitted_at')
    .eq('pay_run_id', run.id)
    .eq('department', OFFICE_INPUT_DEPARTMENT)
    .maybeSingle();

  if (inputError) {
    throw new Error('Failed to fetch office input');
  }

  return { run, input: input ?? null };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const periods = await loadPeriods(supabase);
    const requestedPeriodId = new URL(req.url).searchParams.get('period_id');
    const selectedPeriodId = requestedPeriodId || periods[0]?.id || null;
    const employees = await loadOfficeEmployees(supabase);
    const existing = selectedPeriodId
      ? await loadExistingInput(supabase, selectedPeriodId)
      : { run: null, input: null };

    return NextResponse.json({
      periods,
      selected_period_id: selectedPeriodId,
      employees,
      existing_run: existing.run,
      existing_input: existing.input,
    });
  } catch (error: any) {
    console.error('GET /api/payroll/owner/office-capture error:', error);
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

    const body = (await req.json()) as {
      period_id?: string;
      action?: string;
      payload?: Record<string, OfficePayloadEntry>;
    };

    if (!body.period_id || !body.action || !body.payload) {
      return NextResponse.json(
        { error: 'period_id, action, and payload are required' },
        { status: 400 }
      );
    }

    if (body.action !== 'draft' && body.action !== 'submit') {
      return NextResponse.json({ error: 'action must be draft or submit' }, { status: 400 });
    }

    const employees = await loadOfficeEmployees(supabase);
    const editableEmployeeIds = new Set(
      employees
        .filter((employee) => employee.capture_type === 'hours' || employee.capture_type === 'days')
        .map((employee) => employee.employee_id)
    );

    const cleanPayload: Record<string, OfficePayloadEntry> = {};
    for (const [employeeId, entry] of Object.entries(body.payload)) {
      if (!editableEmployeeIds.has(employeeId)) continue;

      const employee = employees.find((row) => row.employee_id === employeeId);
      if (!employee) continue;

      const valueKey = employee.capture_type === 'days' ? 'days' : 'hours';
      const rawValue = Number(entry[valueKey]);
      const value = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0;
      cleanPayload[employeeId] = { [valueKey]: value };
    }

    let { data: run, error: runError } = await supabase
      .from('pay_runs')
      .select('id, status')
      .eq('period_id', body.period_id)
      .eq('area', OFFICE_RUN_AREA)
      .eq('run_level', 'area')
      .maybeSingle();

    if (runError) {
      return NextResponse.json({ error: 'Failed to fetch office pay run' }, { status: 500 });
    }

    if (!run) {
      const { data: newRun, error: createRunError } = await supabase
        .from('pay_runs')
        .insert({
          period_id: body.period_id,
          area: OFFICE_RUN_AREA,
          run_level: 'area',
          status: 'draft',
          created_by: auth.userId,
        })
        .select('id, status')
        .single();

      if (createRunError || !newRun) {
        console.error('Error creating office pay run:', createRunError);
        return NextResponse.json({ error: 'Failed to create office pay run' }, { status: 500 });
      }

      run = newRun;
    }

    if (['owner_approved', 'consolidated', 'exported', 'locked'].includes(run.status)) {
      return NextResponse.json(
        { error: 'This office pay run cannot be modified' },
        { status: 403 }
      );
    }

    const inputStatus = body.action === 'submit' ? 'review_ready' : 'draft';
    const submittedAt = body.action === 'submit' ? new Date().toISOString() : null;

    const { data: existingInput } = await supabase
      .from('payroll_inputs')
      .select('id')
      .eq('pay_run_id', run.id)
      .eq('department', OFFICE_INPUT_DEPARTMENT)
      .maybeSingle();

    let savedInput;

    if (existingInput) {
      const { data: updated, error: updateError } = await supabase
        .from('payroll_inputs')
        .update({
          payload: cleanPayload,
          status: inputStatus,
          submitted_by: auth.userId,
          submitted_at: submittedAt,
        })
        .eq('id', existingInput.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update office input' }, { status: 500 });
      }

      savedInput = updated;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('payroll_inputs')
        .insert({
          pay_run_id: run.id,
          department: OFFICE_INPUT_DEPARTMENT,
          submitted_by: auth.userId,
          payload: cleanPayload,
          status: inputStatus,
          submitted_at: submittedAt,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: 'Failed to save office input' }, { status: 500 });
      }

      savedInput = inserted;
    }

    const { error: updateRunError } = await supabase
      .from('pay_runs')
      .update({ status: inputStatus })
      .eq('id', run.id);

    if (updateRunError) {
      return NextResponse.json({ error: 'Failed to update office run status' }, { status: 500 });
    }

    supabase
      .from('audit_logs')
      .insert({
        entity_type: 'payroll_input',
        entity_id: savedInput.id,
        action: body.action === 'submit' ? 'submit_office_time' : 'save_office_time',
        after_data: {
          department: OFFICE_INPUT_DEPARTMENT,
          pay_run_id: run.id,
          office_capture: true,
          action: body.action,
        },
        actor_id: auth.userId,
      })
      .then(() => {});

    return NextResponse.json({
      message: body.action === 'submit' ? 'Office time marked ready' : 'Office time saved',
      pay_run_id: run.id,
      input: savedInput,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/owner/office-capture error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
