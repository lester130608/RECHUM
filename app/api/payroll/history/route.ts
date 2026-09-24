// app/api/payroll/history/route.ts
// Los periodos ya trabajados, con su total.
//
// History estaba en el menu desde el principio pero nunca se construyo: era
// un cartel de "coming soon". Sin esta pantalla, para ver lo que se pago en
// un periodo pasado habia que entrar al reporte por persona de ese periodo,
// y para eso habia que saber que periodo era.
//
// Quien ve que:
//   - owner: las cuatro areas y los importes.
//   - supervisor: solo su area, y SIN importes. Es la misma regla que en el
//     resto del sistema; un supervisor no ve dinero en ninguna pantalla.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  REAL_PAYROLL_ROLES,
  getSupervisedAreas,
  isOwner,
  requireAnyRole,
} from '@/lib/auth/roleAccess';

const OWNER_AREAS = ['BA', 'CMHC', 'TCM', 'EMP'] as const;
const PERIOD_LIMIT = 50;

type AreaSummary = {
  area: string;
  status: string;
  workers: number;
  hours: number;
  amount?: number;
};

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const owner = isOwner(auth.roleCodes);
    const visibleAreas = owner
      ? [...OWNER_AREAS]
      : getSupervisedAreas(auth.roleCodes).filter((area) =>
          (OWNER_AREAS as readonly string[]).includes(area)
        );

    if (visibleAreas.length === 0) {
      return NextResponse.json({ is_owner: owner, periods: [] });
    }

    // Runs de area visibles.
    const { data: runs, error: runsError } = await supabase
      .from('pay_runs')
      .select('id, area, status, period_id, run_level')
      .eq('run_level', 'area')
      .in('area', visibleAreas);

    if (runsError) {
      return NextResponse.json({ error: 'Failed to fetch pay runs' }, { status: 500 });
    }

    const areaRuns = (runs ?? []).filter((run) => run.period_id);
    if (areaRuns.length === 0) {
      return NextResponse.json({ is_owner: owner, periods: [] });
    }

    const periodIds = Array.from(new Set(areaRuns.map((run) => run.period_id)));

    const { data: periods, error: periodsError } = await supabase
      .from('pay_periods')
      .select('id, week_code, start_date, end_date, pay_date, status')
      .in('id', periodIds);

    if (periodsError) {
      return NextResponse.json({ error: 'Failed to fetch pay periods' }, { status: 500 });
    }

    // El run consolidado dice si el periodo esta cerrado del todo.
    const { data: consolidatedRuns, error: consolidatedError } = await supabase
      .from('pay_runs')
      .select('id, period_id, status')
      .eq('run_level', 'consolidated')
      .in('period_id', periodIds);

    if (consolidatedError) {
      return NextResponse.json({ error: 'Failed to fetch consolidated runs' }, { status: 500 });
    }

    const { data: items, error: itemsError } = await supabase
      .from('pay_run_items')
      .select('pay_run_id, worker_id, calc_total_hours, calc_total_amount')
      .in(
        'pay_run_id',
        areaRuns.map((run) => run.id)
      );

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to fetch pay items' }, { status: 500 });
    }

    // Agregado por run.
    const byRun = new Map<string, { workers: Set<string>; hours: number; amount: number }>();
    for (const item of items ?? []) {
      const current = byRun.get(item.pay_run_id) ?? { workers: new Set<string>(), hours: 0, amount: 0 };
      if (item.worker_id) current.workers.add(item.worker_id as string);
      current.hours += Number(item.calc_total_hours) || 0;
      current.amount += Number(item.calc_total_amount) || 0;
      byRun.set(item.pay_run_id, current);
    }

    const consolidatedByPeriod = new Map(
      (consolidatedRuns ?? []).map((run) => [run.period_id, run.status])
    );
    const periodsById = new Map((periods ?? []).map((period) => [period.id, period]));

    const runsByPeriod = new Map<string, typeof areaRuns>();
    for (const run of areaRuns) {
      const current = runsByPeriod.get(run.period_id) ?? [];
      current.push(run);
      runsByPeriod.set(run.period_id, current);
    }

    const result = Array.from(runsByPeriod.entries())
      .map(([periodId, periodRuns]) => {
        const period = periodsById.get(periodId);
        if (!period) return null;

        const workers = new Set<string>();
        let hours = 0;
        let amount = 0;

        const areas: AreaSummary[] = periodRuns
          .map((run) => {
            const aggregate = byRun.get(run.id);
            const runWorkers = aggregate?.workers ?? new Set<string>();
            runWorkers.forEach((id) => workers.add(id));
            hours += aggregate?.hours ?? 0;
            amount += aggregate?.amount ?? 0;

            const summary: AreaSummary = {
              area: run.area,
              status: run.status,
              workers: runWorkers.size,
              hours: aggregate?.hours ?? 0,
            };
            if (owner) summary.amount = aggregate?.amount ?? 0;
            return summary;
          })
          .sort((a, b) => a.area.localeCompare(b.area));

        return {
          period_id: periodId,
          week_code: period.week_code,
          start_date: period.start_date,
          end_date: period.end_date,
          pay_date: period.pay_date,
          period_status: period.status,
          consolidated_status: consolidatedByPeriod.get(periodId) ?? null,
          areas,
          areas_with_run: areas.length,
          workers: workers.size,
          hours,
          // Los importes son solo del owner. No se manda 0: se omite el campo.
          ...(owner ? { amount } : {}),
        };
      })
      .filter(Boolean) as any[];

    result.sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)));

    return NextResponse.json({
      is_owner: owner,
      visible_areas: visibleAreas,
      periods: result.slice(0, PERIOD_LIMIT),
    });
  } catch (error: any) {
    console.error('GET /api/payroll/history error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
