// ---------------------------------------------------------------------------
// lib/payroll/reopenArea.ts
//
// Deshacer la aprobación de un área (y la consolidación del periodo si la
// hay). Lo usan dos rutas del owner:
//   - POST /api/payroll/owner/reopen   → el owner corrige la captura él mismo
//   - POST /api/payroll/owner/return   → se la devuelve al supervisor
//
// Antes esta lógica vivía solo en reopen/route.ts (2026-09-30). Se saca
// aquí para que "devolver" no la duplique: si un área ya aprobada se
// devuelve, primero hay que quitarle la aprobación exactamente igual que
// en Reopen, y después bajarla a borrador.
// ---------------------------------------------------------------------------

export const AREA_NAMES = ['BA', 'CMHC', 'TCM', 'EMP'] as const;
export type AreaName = (typeof AREA_NAMES)[number];

export const FROZEN_STATUSES = ['exported', 'locked'];
const APPROVED_STATUSES = ['owner_approved', 'consolidated'];

export type AreaRun = {
  id: string;
  status: string;
  area: string;
  period_id: string;
  owner_approved_at: string | null;
};

export type ReopenResult =
  | { ok: true; run: AreaRun; unconsolidated: boolean; consolidatedRunId: string | null }
  | { ok: false; status: 403 | 404 | 409 | 500; error: string };

export async function loadAreaRun(
  supabase: any,
  periodId: string,
  area: AreaName
): Promise<{ run: AreaRun | null; error: string | null }> {
  const { data, error } = await supabase
    .from('pay_runs')
    .select('id, status, area, period_id, owner_approved_at')
    .eq('period_id', periodId)
    .eq('area', area)
    .eq('run_level', 'area')
    .maybeSingle();

  if (error) {
    return { run: null, error: 'Failed to fetch area pay run' };
  }
  return { run: (data as AreaRun | null) ?? null, error: null };
}

// Quita la aprobación de un área que está en owner_approved/consolidated y
// la deja en 'review_ready'. Si el periodo estaba consolidado, deshace la
// consolidación primero (borra enlaces, run GENERAL a draft, las cuatro
// áreas a owner_approved). No toca nada exported/locked.
export async function unapproveArea(
  supabase: any,
  run: AreaRun
): Promise<ReopenResult> {
  const area = run.area;

  if (FROZEN_STATUSES.includes(run.status)) {
    return {
      ok: false,
      status: 403,
      error: `${area} is ${run.status} and cannot be reopened. Correct it with an adjustment in the next period.`,
    };
  }
  if (!APPROVED_STATUSES.includes(run.status)) {
    return {
      ok: false,
      status: 409,
      error: `${area} is ${run.status}; only owner-approved or consolidated areas can be reopened`,
    };
  }

  // ------------------------------------------------------------------
  // 1. Deshacer la consolidación si la hay.
  // ------------------------------------------------------------------
  const { data: consolidatedRun, error: consolidatedError } = await supabase
    .from('pay_runs')
    .select('id, status')
    .eq('period_id', run.period_id)
    .eq('run_level', 'consolidated')
    .maybeSingle();

  if (consolidatedError) {
    return { ok: false, status: 500, error: 'Failed to fetch consolidated run' };
  }

  let unconsolidated = false;

  if (consolidatedRun) {
    if (FROZEN_STATUSES.includes(consolidatedRun.status)) {
      return {
        ok: false,
        status: 403,
        error: `The consolidated run is ${consolidatedRun.status}; the period cannot be reopened`,
      };
    }

    const { error: unlinkError } = await supabase
      .from('consolidated_run_areas')
      .delete()
      .eq('consolidated_run_id', consolidatedRun.id);

    if (unlinkError) {
      return { ok: false, status: 500, error: `Failed to unlink areas: ${unlinkError.message}` };
    }

    // Las cuatro áreas vuelven a 'owner_approved' (el estado previo a
    // consolidar). Solo el área pedida bajará después.
    const { error: unmarkError } = await supabase
      .from('pay_runs')
      .update({ status: 'owner_approved' })
      .eq('period_id', run.period_id)
      .eq('run_level', 'area')
      .eq('status', 'consolidated');

    if (unmarkError) {
      return {
        ok: false,
        status: 500,
        error: `Failed to unmark consolidated areas: ${unmarkError.message}`,
      };
    }

    // El run GENERAL no tiene importes propios. Sin política DELETE en
    // pay_runs, se deja en 'draft' en vez de borrarlo: consolidate lo
    // reutiliza (loadConsolidatedRun + upsert de enlaces).
    const { error: resetError } = await supabase
      .from('pay_runs')
      .update({ status: 'draft', owner_approved_at: null, owner_approved_by: null })
      .eq('id', consolidatedRun.id);

    if (resetError) {
      return {
        ok: false,
        status: 500,
        error: `Failed to reset consolidated run: ${resetError.message}`,
      };
    }

    unconsolidated = true;
  }

  // ------------------------------------------------------------------
  // 2. El área vuelve a 'review_ready'.
  // ------------------------------------------------------------------
  const { error: reopenError } = await supabase
    .from('pay_runs')
    .update({ status: 'review_ready', owner_approved_at: null, owner_approved_by: null })
    .eq('id', run.id);

  if (reopenError) {
    return { ok: false, status: 500, error: `Failed to reopen ${area}: ${reopenError.message}` };
  }

  // ------------------------------------------------------------------
  // 3. Items aprobados vuelven a 'ready'. No bloquea: el recálculo los
  //    borra y los vuelve a crear.
  // ------------------------------------------------------------------
  const { error: itemsError } = await supabase
    .from('pay_run_items')
    .update({ status: 'ready' })
    .eq('pay_run_id', run.id)
    .eq('status', 'approved');

  if (itemsError) {
    console.error('unapproveArea items error:', itemsError);
  }

  return {
    ok: true,
    run: { ...run, status: 'review_ready', owner_approved_at: null },
    unconsolidated,
    consolidatedRunId: consolidatedRun?.id ?? null,
  };
}
