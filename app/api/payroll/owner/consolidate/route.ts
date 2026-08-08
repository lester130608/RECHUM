// app/api/payroll/owner/consolidate/route.ts
// Consolidación de las cuatro áreas (BA, CMHC, TCM, EMP) en un run GENERAL.
//
// Reglas de negocio:
//   - Solo el owner consolida.
//   - Las CUATRO áreas deben existir y estar en 'owner_approved'. Si falta una,
//     no se consolida nada y se devuelve el detalle de qué falta.
//   - El run consolidado es area='GENERAL', run_level='consolidated'.
//   - Los runs de área pasan a 'consolidated' DESPUÉS de enlazarlos, porque la
//     política RLS de consolidated_run_areas exige que estén en 'owner_approved'
//     en el momento del INSERT (migración 0009).

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

const REQUIRED_AREAS = ['BA', 'CMHC', 'TCM', 'EMP'] as const;
const CONSOLIDATED_AREA = 'GENERAL';

type RequiredArea = (typeof REQUIRED_AREAS)[number];

type AreaRunRow = {
  id: string;
  area: string;
  status: string;
  run_level: string;
};

async function loadAreaRuns(supabase: any, periodId: string): Promise<AreaRunRow[]> {
  const { data, error } = await supabase
    .from('pay_runs')
    .select('id, area, status, run_level')
    .eq('period_id', periodId)
    .eq('run_level', 'area')
    .in('area', [...REQUIRED_AREAS]);

  if (error) {
    throw new Error(`Failed to fetch area runs: ${error.message}`);
  }

  return (data ?? []) as AreaRunRow[];
}

async function loadConsolidatedRun(supabase: any, periodId: string) {
  const { data, error } = await supabase
    .from('pay_runs')
    .select('id, status, period_id, area, run_level, owner_approved_at')
    .eq('period_id', periodId)
    .eq('run_level', 'consolidated')
    .eq('area', CONSOLIDATED_AREA)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch consolidated run: ${error.message}`);
  }

  return data;
}

/**
 * Suma los importes de pay_run_items de los runs indicados.
 * Devuelve el total y el desglose por run.
 */
async function sumAmounts(supabase: any, runIds: string[]) {
  if (!runIds.length) {
    return { total: 0, byRun: new Map<string, { amount: number; workers: number }>() };
  }

  const { data, error } = await supabase
    .from('pay_run_items')
    .select('pay_run_id, worker_id, calc_total_amount')
    .in('pay_run_id', runIds);

  if (error) {
    throw new Error(`Failed to fetch pay run items: ${error.message}`);
  }

  const byRun = new Map<string, { amount: number; workers: number }>();
  const workerSets = new Map<string, Set<string>>();

  for (const item of data ?? []) {
    const runId = item.pay_run_id as string;
    const current = byRun.get(runId) ?? { amount: 0, workers: 0 };
    current.amount += Number(item.calc_total_amount) || 0;
    byRun.set(runId, current);

    if (!workerSets.has(runId)) workerSets.set(runId, new Set<string>());
    if (item.worker_id) workerSets.get(runId)!.add(item.worker_id as string);
  }

  for (const [runId, set] of workerSets) {
    const current = byRun.get(runId);
    if (current) current.workers = set.size;
  }

  const total = Array.from(byRun.values()).reduce((sum, entry) => sum + entry.amount, 0);
  return { total, byRun };
}

function buildAreaReport(areaRuns: AreaRunRow[]) {
  const byArea = new Map(areaRuns.map((run) => [run.area, run]));

  const areas = REQUIRED_AREAS.map((area) => {
    const run = byArea.get(area) ?? null;
    return {
      area,
      run_id: run?.id ?? null,
      status: run?.status ?? 'not_started',
      ready: run?.status === 'owner_approved' || run?.status === 'consolidated',
    };
  });

  const blocking = areas.filter((entry) => !entry.ready);
  return { areas, blocking };
}

// ---------------------------------------------------------------------------
// GET /api/payroll/owner/consolidate?period_id=<uuid>
// Estado de la consolidación: qué falta, qué ya está, totales si aplica.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const periodId = new URL(req.url).searchParams.get('period_id');
    if (!periodId) {
      return NextResponse.json({ error: 'period_id is required' }, { status: 400 });
    }

    const areaRuns = await loadAreaRuns(supabase, periodId);
    const { areas, blocking } = buildAreaReport(areaRuns);
    const consolidatedRun = await loadConsolidatedRun(supabase, periodId);

    const { total, byRun } = await sumAmounts(
      supabase,
      areaRuns.map((run) => run.id)
    );

    return NextResponse.json({
      period_id: periodId,
      can_consolidate: blocking.length === 0,
      blocking: blocking.map((entry) => ({ area: entry.area, status: entry.status })),
      areas: areas.map((entry) => ({
        ...entry,
        total: entry.run_id ? byRun.get(entry.run_id)?.amount ?? 0 : null,
        workers: entry.run_id ? byRun.get(entry.run_id)?.workers ?? 0 : null,
      })),
      grand_total: total,
      consolidated_run: consolidatedRun,
    });
  } catch (error: any) {
    console.error('GET /api/payroll/owner/consolidate error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/payroll/owner/consolidate
// Body: { period_id: string }
// Crea (o reutiliza) el run consolidado, lo enlaza a las cuatro áreas y las
// marca como 'consolidated'.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as { period_id?: string };
    const periodId = body.period_id;

    if (!periodId) {
      return NextResponse.json({ error: 'period_id is required' }, { status: 400 });
    }

    // El período debe existir.
    const { data: period, error: periodError } = await supabase
      .from('pay_periods')
      .select('id, week_code, end_date, pay_date')
      .eq('id', periodId)
      .maybeSingle();

    if (periodError) {
      return NextResponse.json({ error: 'Failed to fetch pay period' }, { status: 500 });
    }
    if (!period) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });
    }

    const areaRuns = await loadAreaRuns(supabase, periodId);
    const { areas, blocking } = buildAreaReport(areaRuns);

    // Puerta principal: las cuatro áreas aprobadas o ya consolidadas.
    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error: 'All four areas must be owner-approved before consolidating',
          blocking: blocking.map((entry) => ({ area: entry.area, status: entry.status })),
          areas,
        },
        { status: 409 }
      );
    }

    let consolidatedRun = await loadConsolidatedRun(supabase, periodId);

    // Si ya se exportó o bloqueó, no se vuelve a tocar.
    if (consolidatedRun && ['exported', 'locked'].includes(consolidatedRun.status)) {
      return NextResponse.json(
        {
          error: `Consolidated run is ${consolidatedRun.status} and cannot be rebuilt`,
          consolidated_run: consolidatedRun,
        },
        { status: 403 }
      );
    }

    // Crear el run consolidado si no existe.
    if (!consolidatedRun) {
      const { data: created, error: createError } = await supabase
        .from('pay_runs')
        .insert({
          period_id: periodId,
          area: CONSOLIDATED_AREA,
          run_level: 'consolidated',
          status: 'draft',
          week_ending: period.end_date ?? null,
          created_by: auth.userId,
        })
        .select('id, status, period_id, area, run_level, owner_approved_at')
        .single();

      if (createError || !created) {
        console.error('Failed to create consolidated run:', createError);
        return NextResponse.json(
          { error: `Failed to create consolidated run: ${createError?.message ?? 'unknown error'}` },
          { status: 500 }
        );
      }

      consolidatedRun = created;
    }

    // Enlazar áreas. Debe ocurrir MIENTRAS los runs siguen en 'owner_approved':
    // la política RLS de consolidated_run_areas lo exige.
    const linkRows = areaRuns
      .filter((run) => run.status === 'owner_approved')
      .map((run) => ({
        consolidated_run_id: consolidatedRun!.id,
        area_run_id: run.id,
      }));

    if (linkRows.length > 0) {
      const { error: linkError } = await supabase
        .from('consolidated_run_areas')
        .upsert(linkRows, { onConflict: 'consolidated_run_id,area_run_id', ignoreDuplicates: true });

      if (linkError) {
        console.error('Failed to link area runs:', linkError);
        return NextResponse.json(
          { error: `Failed to link area runs: ${linkError.message}` },
          { status: 500 }
        );
      }
    }

    // Ahora sí, marcar las áreas como consolidadas.
    const runIdsToMark = areaRuns
      .filter((run) => run.status === 'owner_approved')
      .map((run) => run.id);

    if (runIdsToMark.length > 0) {
      const { error: markError } = await supabase
        .from('pay_runs')
        .update({ status: 'consolidated' })
        .in('id', runIdsToMark);

      if (markError) {
        console.error('Failed to mark area runs as consolidated:', markError);
        return NextResponse.json(
          { error: `Areas were linked but could not be marked consolidated: ${markError.message}` },
          { status: 500 }
        );
      }
    }

    const { total, byRun } = await sumAmounts(
      supabase,
      areaRuns.map((run) => run.id)
    );

    const { data: finalRun } = await supabase
      .from('pay_runs')
      .select('id, status, period_id, area, run_level, owner_approved_at')
      .eq('id', consolidatedRun.id)
      .maybeSingle();

    return NextResponse.json({
      message: 'Consolidated successfully',
      period: { id: period.id, week_code: period.week_code, pay_date: period.pay_date },
      consolidated_run: finalRun ?? consolidatedRun,
      areas: areas.map((entry) => ({
        area: entry.area,
        run_id: entry.run_id,
        total: entry.run_id ? byRun.get(entry.run_id)?.amount ?? 0 : null,
        workers: entry.run_id ? byRun.get(entry.run_id)?.workers ?? 0 : null,
      })),
      grand_total: total,
      linked: linkRows.length,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/owner/consolidate error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
