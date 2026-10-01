// ---------------------------------------------------------------------------
// POST /api/payroll/owner/reopen
// Body: { period_id: string, area: 'BA' | 'CMHC' | 'TCM' | 'EMP' }
//
// Devuelve un área ya aprobada a 'review_ready' para poder corregir la
// captura, recalcular y volver a aprobar.
//
// POR QUÉ EXISTE (2026-09-30)
// Aprobar un área la dejaba sin vuelta atrás desde la aplicación: ni la
// captura (office-capture, capture/tcm...) ni el cálculo (*-calculation)
// aceptan cambios en 'owner_approved' o 'consolidated'. Dos casos reales en
// P-20260905: una tarifa mal tecleada en EMP (80 → $66,000) y un empleado
// que la supervisora de TCM olvidó. La única salida era un UPDATE a mano en
// Supabase (DESAPROBAR_BA_PARA_CALCULAR.sql, 2026-09-01). Esto lo hace
// desde la app, solo para el owner y con registro en audit_logs.
//
// QUÉ HACE
//   1. Si el periodo está consolidado (run GENERAL + enlaces en
//      consolidated_run_areas), deshace la consolidación: borra los enlaces
//      y el run consolidado, y devuelve las cuatro áreas a 'owner_approved'.
//      La consolidación no guarda importes propios (suma los de las áreas),
//      así que no se pierde nada: se reconstruye con un clic.
//   2. Pone el área pedida en 'review_ready' y limpia owner_approved_*.
//   3. Sus pay_run_items vuelven de 'approved' a 'ready' (el recálculo los
//      reemplaza de todas formas).
//
// QUÉ NO HACE
//   - No toca nada 'exported' ni 'locked': eso ya salió a ADP y se corrige
//     con un ajuste en el periodo siguiente, no reescribiendo el pasado.
//   - No borra la captura: las horas/unidades siguen ahí para corregirlas.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

const AREAS = ['BA', 'CMHC', 'TCM', 'EMP'] as const;
type AreaName = (typeof AREAS)[number];

const FROZEN = ['exported', 'locked'];
const REOPENABLE = ['owner_approved', 'consolidated'];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as { period_id?: string; area?: string };
    const periodId = body.period_id;
    const area = String(body.area ?? '').trim().toUpperCase() as AreaName;

    if (!periodId || !AREAS.includes(area)) {
      return NextResponse.json({ error: 'period_id and area (BA, CMHC, TCM, EMP) are required' }, { status: 400 });
    }

    const { data: run, error: runError } = await supabase
      .from('pay_runs')
      .select('id, status, area, period_id, owner_approved_at')
      .eq('period_id', periodId)
      .eq('area', area)
      .eq('run_level', 'area')
      .maybeSingle();

    if (runError) {
      return NextResponse.json({ error: 'Failed to fetch area pay run' }, { status: 500 });
    }
    if (!run) {
      return NextResponse.json({ error: `No ${area} pay run exists for this period` }, { status: 404 });
    }
    if (FROZEN.includes(run.status)) {
      return NextResponse.json(
        { error: `${area} is ${run.status} and cannot be reopened. Correct it with an adjustment in the next period.` },
        { status: 403 }
      );
    }
    if (!REOPENABLE.includes(run.status)) {
      return NextResponse.json(
        { error: `${area} is ${run.status}; only owner-approved or consolidated areas can be reopened` },
        { status: 409 }
      );
    }

    // ------------------------------------------------------------------
    // 1. Deshacer la consolidación si la hay.
    // ------------------------------------------------------------------
    const { data: consolidatedRun, error: consolidatedError } = await supabase
      .from('pay_runs')
      .select('id, status')
      .eq('period_id', periodId)
      .eq('run_level', 'consolidated')
      .maybeSingle();

    if (consolidatedError) {
      return NextResponse.json({ error: 'Failed to fetch consolidated run' }, { status: 500 });
    }

    let unconsolidated = false;

    if (consolidatedRun) {
      if (FROZEN.includes(consolidatedRun.status)) {
        return NextResponse.json(
          { error: `The consolidated run is ${consolidatedRun.status}; the period cannot be reopened` },
          { status: 403 }
        );
      }

      const { error: unlinkError } = await supabase
        .from('consolidated_run_areas')
        .delete()
        .eq('consolidated_run_id', consolidatedRun.id);

      if (unlinkError) {
        return NextResponse.json({ error: `Failed to unlink areas: ${unlinkError.message}` }, { status: 500 });
      }

      // Las cuatro áreas vuelven a 'owner_approved' (el estado previo a
      // consolidar). Solo el área pedida bajará a 'review_ready' después.
      const { error: unmarkError } = await supabase
        .from('pay_runs')
        .update({ status: 'owner_approved' })
        .eq('period_id', periodId)
        .eq('run_level', 'area')
        .eq('status', 'consolidated');

      if (unmarkError) {
        return NextResponse.json({ error: `Failed to unmark consolidated areas: ${unmarkError.message}` }, { status: 500 });
      }

      // El run GENERAL no tiene importes propios. Sin política DELETE en
      // pay_runs, se deja en 'draft' en vez de borrarlo: consolidate lo
      // reutiliza (loadConsolidatedRun + upsert de enlaces).
      const { error: resetError } = await supabase
        .from('pay_runs')
        .update({ status: 'draft', owner_approved_at: null, owner_approved_by: null })
        .eq('id', consolidatedRun.id);

      if (resetError) {
        return NextResponse.json({ error: `Failed to reset consolidated run: ${resetError.message}` }, { status: 500 });
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
      return NextResponse.json({ error: `Failed to reopen ${area}: ${reopenError.message}` }, { status: 500 });
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
      console.error('POST /api/payroll/owner/reopen items error:', itemsError);
    }

    await supabase.from('audit_logs').insert({
      entity_type: 'pay_run',
      entity_id: run.id,
      action: 'reopen',
      before_data: { status: run.status, owner_approved_at: run.owner_approved_at },
      after_data: { status: 'review_ready', unconsolidated, consolidated_run_id: consolidatedRun?.id ?? null },
      actor_id: auth.userId,
    });

    return NextResponse.json({
      message: unconsolidated
        ? `${area} reopened. The period was un-consolidated: re-approve ${area} and consolidate again.`
        : `${area} reopened. Correct the capture, recalculate and approve again.`,
      area,
      run_id: run.id,
      unconsolidated,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/owner/reopen error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
