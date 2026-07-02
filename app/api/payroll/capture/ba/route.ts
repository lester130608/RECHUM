// app/api/payroll/capture/ba/route.ts
// BA supervisor capture — GET context + POST save/submit

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  canAccessPayrollArea,
  isOwner,
  requireAnyRole,
} from '@/lib/auth/roleAccess';
import { calculateAndSaveArea } from '@/lib/payroll/areaCalculationRunner';

const FLORIDA_TZ = 'America/New_York';
const BA_AREA = 'BA';

function getTodayNY(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FLORIDA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function dateToDayNum(s: string) {
  const [y, mo, d] = s.split('-').map(Number);
  return Math.floor(Date.UTC(y, mo - 1, d) / 86_400_000);
}

function normalizeEmployeeRole(value?: string | null) {
  return (value ?? '').trim().toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['supervisor_ba', 'owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!canAccessPayrollArea(auth.roleCodes, BA_AREA)) {
      return NextResponse.json({ error: 'No access to BA area' }, { status: 403 });
    }

    const owner = isOwner(auth.roleCodes);
    const today = getTodayNY();
    const todayNum = dateToDayNum(today);

    const { data: allPeriods, error: periodsErr } = await supabase
      .from('pay_periods')
      .select('id, week_code, start_date, end_date, capture_opens_at, sup_deadline, pay_date, status')
      .order('pay_date', { ascending: false });

    if (periodsErr) {
      return NextResponse.json({ error: 'Failed to fetch pay periods' }, { status: 500 });
    }

    const pay_periods = owner
      ? allPeriods ?? []
      : (allPeriods ?? []).filter((p) => {
          const opens = dateToDayNum(p.capture_opens_at);
          const deadline = dateToDayNum(p.sup_deadline);
          return todayNum >= opens && todayNum <= deadline;
        });

    const { data: assignRows, error: assignErr } = await supabase
      .from('assignments')
      .select('employee_id, role, employees(id, first_name, last_name)')
      .eq('department', BA_AREA)
      .eq('active', true);

    if (assignErr) {
      return NextResponse.json({ error: 'Failed to fetch BA employees' }, { status: 500 });
    }

    const employees = (assignRows ?? [])
      .map((assignment: any) => {
        const employee = assignment.employees;
        if (!employee) {
          return null;
        }

        return {
          ...employee,
          role: normalizeEmployeeRole(assignment.role),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      );

    const periodId = new URL(req.url).searchParams.get('period_id');
    let existing_run: { id: string; status: string } | null = null;
    let existing_input: { id: string; status: string; payload: any; submitted_at: string | null } | null = null;

    if (periodId) {
      const { data: run } = await supabase
        .from('pay_runs')
        .select('id, status')
        .eq('period_id', periodId)
        .eq('area', BA_AREA)
        .eq('run_level', 'area')
        .maybeSingle();

      existing_run = run ?? null;

      if (run) {
        const { data: input } = await supabase
          .from('payroll_inputs')
          .select('id, status, payload, submitted_at')
          .eq('pay_run_id', run.id)
          .eq('department', BA_AREA)
          .maybeSingle();

        existing_input = input ?? null;
      }
    }

    return NextResponse.json({
      is_owner: owner,
      today,
      pay_periods,
      employees,
      existing_run,
      existing_input,
    });
  } catch (err) {
    console.error('GET /api/payroll/capture/ba error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['supervisor_ba', 'owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!canAccessPayrollArea(auth.roleCodes, BA_AREA)) {
      return NextResponse.json({ error: 'No access to BA area' }, { status: 403 });
    }

    const body = await req.json();
    const { period_id, action, payload } = body as {
      period_id?: string;
      action?: string;
      payload?: Record<string, { hours: number; assessment: number; reassessment: number }>;
    };

    if (!period_id || !action || !payload) {
      return NextResponse.json(
        { error: 'period_id, action, and payload are required' },
        { status: 400 }
      );
    }

    if (action !== 'draft' && action !== 'submit') {
      return NextResponse.json({ error: 'action must be "draft" or "submit"' }, { status: 400 });
    }

    for (const [empId, entry] of Object.entries(payload)) {
      if (typeof entry !== 'object' || entry === null) {
        return NextResponse.json({ error: `Invalid payload entry for employee ${empId}` }, { status: 400 });
      }

      if (
        typeof entry.hours !== 'number' ||
        typeof entry.assessment !== 'number' ||
        typeof entry.reassessment !== 'number'
      ) {
        return NextResponse.json(
          { error: `hours, assessment, and reassessment must be numbers for employee ${empId}` },
          { status: 400 }
        );
      }
    }

    const owner = isOwner(auth.roleCodes);
    if (!owner) {
      const { data: period } = await supabase
        .from('pay_periods')
        .select('capture_opens_at, sup_deadline')
        .eq('id', period_id)
        .single();

      if (!period) {
        return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });
      }

      const today = getTodayNY();
      const todayNum = dateToDayNum(today);
      const opens = dateToDayNum(period.capture_opens_at);
      const deadline = dateToDayNum(period.sup_deadline);

      if (todayNum < opens || todayNum > deadline) {
        return NextResponse.json({ error: 'This period is not open for capture' }, { status: 403 });
      }
    }

    let { data: run } = await supabase
      .from('pay_runs')
      .select('id, status')
      .eq('period_id', period_id)
      .eq('area', BA_AREA)
      .eq('run_level', 'area')
      .maybeSingle();

    if (!run) {
      const { data: newRun, error: createRunErr } = await supabase
        .from('pay_runs')
        .insert({
          period_id,
          area: BA_AREA,
          run_level: 'area',
          status: 'draft',
          created_by: auth.userId,
        })
        .select('id, status')
        .single();

      if (createRunErr || !newRun) {
        console.error('Error creating pay_run:', createRunErr);
        return NextResponse.json({ error: 'Failed to create pay run' }, { status: 500 });
      }

      run = newRun;
    }

    if (['exported', 'locked'].includes(run.status)) {
      return NextResponse.json({ error: 'Pay run is locked and cannot be modified' }, { status: 403 });
    }

    const inputStatus = action === 'submit' ? 'review_ready' : 'draft';
    const submittedAt = action === 'submit' ? new Date().toISOString() : null;

    const { data: existingInput } = await supabase
      .from('payroll_inputs')
      .select('id')
      .eq('pay_run_id', run.id)
      .eq('department', BA_AREA)
      .maybeSingle();

    let savedInput;

    if (existingInput) {
      const { data: updated, error: updateErr } = await supabase
        .from('payroll_inputs')
        .update({
          payload,
          status: inputStatus,
          submitted_by: auth.userId,
          submitted_at: submittedAt,
        })
        .eq('id', existingInput.id)
        .select()
        .single();

      if (updateErr) {
        console.error('Error updating payroll_input:', updateErr);
        return NextResponse.json({ error: 'Failed to update input' }, { status: 500 });
      }

      savedInput = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('payroll_inputs')
        .insert({
          pay_run_id: run.id,
          department: BA_AREA,
          submitted_by: auth.userId,
          payload,
          status: inputStatus,
          submitted_at: submittedAt,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Error inserting payroll_input:', insertErr);
        return NextResponse.json({ error: 'Failed to save input' }, { status: 500 });
      }

      savedInput = inserted;
    }

    if (action === 'submit') {
      await supabase
        .from('pay_runs')
        .update({ status: 'review_ready' })
        .eq('id', run.id)
        .eq('status', 'draft');

      await calculateAndSaveArea({
        supabase,
        area: BA_AREA,
        periodId: period_id,
        actorId: auth.userId,
        allowErrors: true,
      });
    }

    supabase
      .from('audit_logs')
      .insert({
        entity_type: 'payroll_input',
        entity_id: savedInput.id,
        action: action === 'submit' ? 'submit' : 'save_draft',
        after_data: { department: BA_AREA, pay_run_id: run.id, action },
        actor_id: auth.userId,
      })
      .then(() => {});

    return NextResponse.json({
      message: action === 'submit' ? 'Submitted for approval' : 'Draft saved',
      pay_run_id: run.id,
      input: savedInput,
    });
  } catch (err) {
    console.error('POST /api/payroll/capture/ba error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
