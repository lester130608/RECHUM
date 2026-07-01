// app/api/payroll/owner/period/route.ts
// Owner period review panel - read-only status data.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

const AREAS = ['BA', 'CMHC', 'TCM', 'PSYQ'] as const;

type Area = (typeof AREAS)[number];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data: periods, error: periodsError } = await supabase
      .from('pay_periods')
      .select('id, week_code, start_date, end_date, pay_date, owner_deadline, status')
      .order('pay_date', { ascending: false });

    if (periodsError) {
      console.error('Error fetching owner review periods:', periodsError);
      return NextResponse.json({ error: 'Failed to fetch pay periods' }, { status: 500 });
    }

    const periodList = periods ?? [];
    const requestedPeriodId = new URL(req.url).searchParams.get('period_id');
    const selectedPeriodId = requestedPeriodId || periodList[0]?.id || null;

    let areaRuns: any[] = [];
    let consolidatedRun: any = null;

    if (selectedPeriodId) {
      const { data: runs, error: runsError } = await supabase
        .from('pay_runs')
        .select('id, period_id, area, run_level, status, created_at, supervisor_approved_at, owner_approved_at')
        .eq('period_id', selectedPeriodId)
        .in('area', ['BA', 'CMHC', 'TCM', 'PSYQ', 'GENERAL']);

      if (runsError) {
        console.error('Error fetching owner review runs:', runsError);
        return NextResponse.json({ error: 'Failed to fetch pay runs' }, { status: 500 });
      }

      areaRuns = (runs ?? []).filter((run) => run.run_level === 'area');
      consolidatedRun = (runs ?? []).find((run) => run.run_level === 'consolidated' && run.area === 'GENERAL') ?? null;
    }

    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('employee_id, department')
      .in('department', [...AREAS]);

    if (assignmentsError) {
      console.error('Error fetching owner review worker counts:', assignmentsError);
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

    const runsByArea = new Map(areaRuns.map((run) => [run.area, run]));

    const areas = AREAS.map((area) => {
      const run = runsByArea.get(area) ?? null;
      return {
        area,
        workers: workerIdsByArea[area].size,
        run,
        status: run?.status ?? 'not_started',
        total_placeholder: 'Pending',
      };
    });

    return NextResponse.json({
      periods: periodList,
      selected_period_id: selectedPeriodId,
      areas,
      consolidated_run: consolidatedRun,
    });
  } catch (error) {
    console.error('GET /api/payroll/owner/period error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
