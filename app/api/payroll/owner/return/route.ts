// ---------------------------------------------------------------------------
// POST /api/payroll/owner/return
// Body: { period_id: string, area: 'BA' | 'CMHC' | 'TCM', reason: string }
//
// Devuelve la captura de un área a su supervisora para que la corrija ella.
//
// POR QUÉ EXISTE (2026-10-01)
// Reopen (2026-09-30) deja que el owner corrija la captura él mismo. Pero
// cuando el error es de la supervisora (en P-20260905 faltó una persona en
// TCM), lo limpio es devolvérselo con un motivo: corrige quien capturó y el
// rastro de quién tocó qué queda claro. Hasta ahora eso solo se podía hacer
// con SQL a mano (DESBLOQUEAR_CAPTURA_BA.sql).
//
// QUÉ HACE
//   1. Si el área está aprobada o consolidada, le quita la aprobación igual
//      que Reopen (lib/payroll/reopenArea.ts), deshaciendo la consolidación
//      si hace falta.
//   2. El run del área vuelve a 'draft'.
//   3. La payroll_input pasa a 'rejected' con returned_at / returned_by /
//      return_reason. La pantalla de captura de la supervisora muestra el
//      motivo y le deja editar aunque su ventana de captura ya haya cerrado.
//   4. Lo registra en audit_logs (action 'return_to_supervisor') con el
//      motivo. Ese es el historial que se ve en la pantalla del periodo.
//
// QUÉ NO HACE
//   - No aplica a EMP: esa área la captura el owner, no hay a quién devolver.
//   - No toca nada exported/locked.
//   - No borra la captura: la supervisora corrige sobre lo que ya metió.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { FROZEN_STATUSES, loadAreaRun, unapproveArea } from '@/lib/payroll/reopenArea';

const RETURNABLE_AREAS = ['BA', 'CMHC', 'TCM'] as const;
type ReturnableArea = (typeof RETURNABLE_AREAS)[number];

const MAX_REASON = 500;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      period_id?: string;
      area?: string;
      reason?: string;
    };
    const periodId = body.period_id;
    const area = String(body.area ?? '').trim().toUpperCase() as ReturnableArea;
    const reason = String(body.reason ?? '').trim();

    if (!periodId || !RETURNABLE_AREAS.includes(area)) {
      return NextResponse.json(
        { error: 'period_id and area (BA, CMHC, TCM) are required. EMP is captured by the owner and cannot be returned.' },
        { status: 400 }
      );
    }
    if (!reason) {
      return NextResponse.json({ error: 'A reason is required so the supervisor knows what to fix.' }, { status: 400 });
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json({ error: `Reason must be ${MAX_REASON} characters or fewer.` }, { status: 400 });
    }

    const { run: loaded, error: runError } = await loadAreaRun(supabase, periodId, area);
    if (runError) {
      return NextResponse.json({ error: runError }, { status: 500 });
    }
    if (!loaded) {
      return NextResponse.json({ error: `No ${area} pay run exists for this period` }, { status: 404 });
    }
    if (FROZEN_STATUSES.includes(loaded.status)) {
      return NextResponse.json(
        { error: `${area} is ${loaded.status} and cannot be returned. Correct it with an adjustment in the next period.` },
        { status: 403 }
      );
    }

    const { data: input, error: inputError } = await supabase
      .from('payroll_inputs')
      .select('id, status, submitted_by, submitted_at')
      .eq('pay_run_id', loaded.id)
      .eq('department', area)
      .maybeSingle();

    if (inputError) {
      return NextResponse.json({ error: 'Failed to fetch the area capture' }, { status: 500 });
    }
    if (!input) {
      return NextResponse.json(
        { error: `${area} has no capture to return: the supervisor has not saved anything yet.` },
        { status: 409 }
      );
    }
    if (input.status === 'rejected') {
      return NextResponse.json({ error: `${area} is already returned to the supervisor.` }, { status: 409 });
    }

    // ------------------------------------------------------------------
    // 1. Si está aprobada/consolidada, quitar la aprobación como en Reopen.
    // ------------------------------------------------------------------
    let run = loaded;
    let unconsolidated = false;
    let consolidatedRunId: string | null = null;

    if (['owner_approved', 'consolidated'].includes(run.status)) {
      const result = await unapproveArea(supabase, run);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      run = result.run;
      unconsolidated = result.unconsolidated;
      consolidatedRunId = result.consolidatedRunId;
    }

    // ------------------------------------------------------------------
    // 2. La captura queda marcada como devuelta, con el motivo. Se hace
    //    antes de bajar el run a 'draft': la política de UPDATE de
    //    payroll_inputs exige run en draft/review_ready y ahora lo está.
    // ------------------------------------------------------------------
    const returnedAt = new Date().toISOString();
    const { error: markError } = await supabase
      .from('payroll_inputs')
      .update({
        status: 'rejected',
        returned_at: returnedAt,
        returned_by: auth.userId,
        return_reason: reason,
      })
      .eq('id', input.id);

    if (markError) {
      return NextResponse.json({ error: `Failed to mark the capture as returned: ${markError.message}` }, { status: 500 });
    }

    // ------------------------------------------------------------------
    // 3. El run vuelve a 'draft': ya no está listo para revisar.
    // ------------------------------------------------------------------
    const { error: draftError } = await supabase
      .from('pay_runs')
      .update({ status: 'draft', owner_approved_at: null, owner_approved_by: null })
      .eq('id', run.id);

    if (draftError) {
      return NextResponse.json({ error: `Failed to set ${area} back to draft: ${draftError.message}` }, { status: 500 });
    }

    // ------------------------------------------------------------------
    // 4. Registro. El motivo va aquí: esto es lo que se audita.
    // ------------------------------------------------------------------
    await supabase.from('audit_logs').insert({
      entity_type: 'payroll_input',
      entity_id: input.id,
      action: 'return_to_supervisor',
      before_data: {
        area,
        period_id: periodId,
        pay_run_id: run.id,
        run_status: loaded.status,
        input_status: input.status,
        submitted_by: input.submitted_by,
        submitted_at: input.submitted_at,
      },
      after_data: {
        area,
        period_id: periodId,
        pay_run_id: run.id,
        run_status: 'draft',
        input_status: 'rejected',
        reason,
        returned_at: returnedAt,
        unconsolidated,
        consolidated_run_id: consolidatedRunId,
      },
      actor_id: auth.userId,
    });

    return NextResponse.json({
      message: unconsolidated
        ? `${area} returned to its supervisor. The period was un-consolidated: once it is re-submitted, approve ${area} and consolidate again.`
        : `${area} returned to its supervisor with your note. You will see it as "Ready" again once it is re-submitted.`,
      area,
      run_id: run.id,
      input_id: input.id,
      unconsolidated,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/owner/return error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
