// app/api/payroll/owner/period/route.ts
// Owner period review panel: estado de cada area, captura devuelta o no, y
// el historial de audit_logs del periodo.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { chooseCurrentPeriodId } from '@/lib/payroll/periods';

const AREAS = ['BA', 'CMHC', 'TCM', 'EMP'] as const;

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
      // capture_opens_at hace falta para elegir bien el periodo actual: sin
      // ella, chooseCurrentPeriod cae a start_date y varios periodos solapan.
      .select('id, week_code, start_date, end_date, pay_date, capture_opens_at, owner_deadline, status')
      .order('pay_date', { ascending: false });

    if (periodsError) {
      console.error('Error fetching owner review periods:', periodsError);
      return NextResponse.json({ error: 'Failed to fetch pay periods' }, { status: 500 });
    }

    const periodList = periods ?? [];
    const requestedPeriodId = new URL(req.url).searchParams.get('period_id');
    // El periodo actual, no el mas lejano en el futuro.
    const selectedPeriodId = requestedPeriodId || chooseCurrentPeriodId(periodList);

    let areaRuns: any[] = [];
    let consolidatedRun: any = null;

    if (selectedPeriodId) {
      const { data: runs, error: runsError } = await supabase
        .from('pay_runs')
        .select('id, period_id, area, run_level, status, created_at, supervisor_approved_at, owner_approved_at')
        .eq('period_id', selectedPeriodId)
        .in('area', ['BA', 'CMHC', 'TCM', 'EMP', 'GENERAL']);

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

    // Estado de la captura de cada area (payroll_inputs). Hace falta para
    // distinguir "pendiente del supervisor" de "devuelta al supervisor"
    // (status 'rejected', migracion 0019) y mostrar el motivo.
    const inputsByRun = new Map<string, any>();
    if (areaRuns.length) {
      const { data: inputs } = await supabase
        .from('payroll_inputs')
        .select('id, pay_run_id, department, status, submitted_at, returned_at, return_reason')
        .in('pay_run_id', areaRuns.map((run) => run.id));
      for (const input of inputs ?? []) {
        inputsByRun.set(input.pay_run_id, input);
      }
    }

    const areas = AREAS.map((area) => {
      const run = runsByArea.get(area) ?? null;
      const input = run ? inputsByRun.get(run.id) ?? null : null;
      return {
        area,
        workers: workerIdsByArea[area].size,
        run,
        status: run?.status ?? 'not_started',
        total_placeholder: 'Pending',
        input: input
          ? {
              status: input.status,
              submitted_at: input.submitted_at,
              returned_at: input.returned_at,
              return_reason: input.return_reason,
            }
          : null,
      };
    });

    // Historial del periodo: todo lo que audit_logs tiene sobre sus runs y
    // sus capturas (aprobar, reabrir, devolver, enviar, guardar borrador).
    // Es el registro que pidio el owner para poder auditar cada correccion.
    const entityIds = [
      ...areaRuns.map((run) => run.id),
      ...(consolidatedRun ? [consolidatedRun.id] : []),
      ...Array.from(inputsByRun.values()).map((input) => input.id),
    ];

    let activity: any[] = [];
    if (entityIds.length) {
      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select('id, entity_type, entity_id, action, before_data, after_data, actor_id, created_at')
        .in('entity_id', entityIds)
        .order('created_at', { ascending: false })
        .limit(200);

      if (logsError) {
        console.error('Error fetching period audit logs:', logsError);
      } else {
        const actorIds = Array.from(new Set((logs ?? []).map((log) => log.actor_id).filter(Boolean)));
        const nameByUser = new Map<string, string>();
        if (actorIds.length) {
          const { data: actors } = await supabase
            .from('employees')
            .select('user_id, first_name, last_name')
            .in('user_id', actorIds);
          for (const actor of actors ?? []) {
            nameByUser.set(actor.user_id, [actor.first_name, actor.last_name].filter(Boolean).join(' '));
          }
        }

        const areaByEntity = new Map<string, string>();
        for (const run of areaRuns) areaByEntity.set(run.id, run.area);
        if (consolidatedRun) areaByEntity.set(consolidatedRun.id, 'GENERAL');
        for (const input of inputsByRun.values()) areaByEntity.set(input.id, input.department);

        activity = (logs ?? []).map((log) => ({
          id: log.id,
          created_at: log.created_at,
          actor: nameByUser.get(log.actor_id) ?? null,
          area: areaByEntity.get(log.entity_id) ?? log.after_data?.area ?? null,
          entity_type: log.entity_type,
          action: log.action,
          before_data: log.before_data,
          after_data: log.after_data,
        }));
      }
    }

    return NextResponse.json({
      periods: periodList,
      selected_period_id: selectedPeriodId,
      areas,
      consolidated_run: consolidatedRun,
      activity,
    });
  } catch (error) {
    console.error('GET /api/payroll/owner/period error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
