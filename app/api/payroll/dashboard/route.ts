import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  REAL_PAYROLL_ROLES,
  getSupervisedAreas,
  isOwner,
  requireAnyRole,
  type PayrollArea,
} from '@/lib/auth/roleAccess';

const AREAS = ['BA', 'CMHC', 'TCM', 'PSYQ'] as const;
const FLORIDA_TIME_ZONE = 'America/New_York';

type Area = (typeof AREAS)[number];

type AreaStatus =
  | 'not_started'
  | 'draft'
  | 'review_ready'
  | 'supervisor_approved'
  | 'owner_approved'
  | 'consolidated'
  | 'exported'
  | 'locked';

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to calculate local date');
  }

  return `${year}-${month}-${day}`;
}

function chooseCurrentPeriod(periods: any[], today: string) {
  const active = periods.find((period) => {
    const opensAt = period.capture_opens_at || period.start_date;
    return opensAt <= today && today <= period.pay_date;
  });

  if (active) return active;

  const upcoming = [...periods]
    .filter((period) => period.pay_date >= today)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))[0];

  return upcoming ?? periods[0] ?? null;
}

function statusToTask(area: Area, status: AreaStatus) {
  if (area === 'PSYQ' && status === 'not_started') {
    return 'PSYQ capture has not started.';
  }

  if (status === 'not_started' || status === 'draft') {
    return `${area} supervisor has not submitted.`;
  }

  if (status === 'review_ready' || status === 'supervisor_approved') {
    return `${area} is ready for owner review.`;
  }

  return null;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const supervisedAreas = getSupervisedAreas(auth.roleCodes);
    const visibleAreas = owner
      ? [...AREAS]
      : AREAS.filter((area) => supervisedAreas.includes(area as PayrollArea));

    const today = getDateKeyInTimeZone(new Date(), FLORIDA_TIME_ZONE);

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', auth.employeeId)
      .maybeSingle();

    if (employeeError) {
      console.error('Error fetching payroll dashboard employee:', employeeError);
      return NextResponse.json({ error: 'Failed to fetch employee context' }, { status: 500 });
    }

    const { data: periods, error: periodsError } = await supabase
      .from('pay_periods')
      .select('id, week_code, start_date, end_date, capture_opens_at, sup_deadline, owner_deadline, pay_date, status')
      .order('pay_date', { ascending: false });

    if (periodsError) {
      console.error('Error fetching payroll dashboard periods:', periodsError);
      return NextResponse.json({ error: 'Failed to fetch pay periods' }, { status: 500 });
    }

    const periodList = periods ?? [];
    const currentPeriod = chooseCurrentPeriod(periodList, today);
    const previousPeriod = currentPeriod
      ? periodList.find((period) => period.pay_date < currentPeriod.pay_date) ?? null
      : null;

    let runs: any[] = [];
    if (currentPeriod) {
      const { data: currentRuns, error: runsError } = await supabase
        .from('pay_runs')
        .select('id, period_id, area, run_level, status, created_at, supervisor_approved_at, owner_approved_at')
        .eq('period_id', currentPeriod.id)
        .eq('run_level', 'area')
        .in('area', [...AREAS]);

      if (runsError) {
        console.error('Error fetching payroll dashboard runs:', runsError);
        return NextResponse.json({ error: 'Failed to fetch pay runs' }, { status: 500 });
      }

      runs = currentRuns ?? [];
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('employee_id, department')
      .in('department', [...AREAS]);

    if (assignmentsError) {
      console.error('Error fetching payroll dashboard workers:', assignmentsError);
      return NextResponse.json({ error: 'Failed to fetch worker counts' }, { status: 500 });
    }

    const workerIdsByArea = AREAS.reduce<Record<Area, Set<string>>>((acc, area) => {
      acc[area] = new Set<string>();
      return acc;
    }, {} as Record<Area, Set<string>>);

    for (const assignment of assignments ?? []) {
      const area = assignment.department as Area;
      if (AREAS.includes(area) && assignment.employee_id) {
        workerIdsByArea[area].add(assignment.employee_id);
      }
    }

    const runsByArea = new Map(runs.map((run) => [run.area, run]));
    const areas = visibleAreas.map((area) => {
      const run = runsByArea.get(area) ?? null;
      return {
        area,
        workers: workerIdsByArea[area].size,
        run,
        status: (run?.status ?? 'not_started') as AreaStatus,
        total_placeholder: 'Pending',
      };
    });

    const tasks = areas
      .map((area) => statusToTask(area.area, area.status))
      .filter((task): task is string => Boolean(task));

    return NextResponse.json({
      role_codes: auth.roleCodes,
      is_owner: owner,
      supervised_areas: supervisedAreas,
      today,
      employee_name: [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') || null,
      current_period: currentPeriod,
      areas,
      last_payroll: previousPeriod
        ? {
            period: previousPeriod,
            workers: areas.reduce((sum, area) => sum + area.workers, 0),
            total_placeholder: 'Pending',
          }
        : null,
      tasks,
    });
  } catch (error) {
    console.error('GET /api/payroll/dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
