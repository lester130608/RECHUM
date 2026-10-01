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
//
// 2026-10-01: la lógica de deshacer la aprobación se movió a
// lib/payroll/reopenArea.ts para compartirla con /owner/return (devolver
// la captura al supervisor). Esta ruta conserva el mismo comportamiento.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';
import { AREA_NAMES, type AreaName, loadAreaRun, unapproveArea } from '@/lib/payroll/reopenArea';

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

    if (!periodId || !AREA_NAMES.includes(area)) {
      return NextResponse.json({ error: 'period_id and area (BA, CMHC, TCM, EMP) are required' }, { status: 400 });
    }

    const { run, error: runError } = await loadAreaRun(supabase, periodId, area);
    if (runError) {
      return NextResponse.json({ error: runError }, { status: 500 });
    }
    if (!run) {
      return NextResponse.json({ error: `No ${area} pay run exists for this period` }, { status: 404 });
    }

    const result = await unapproveArea(supabase, run);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await supabase.from('audit_logs').insert({
      entity_type: 'pay_run',
      entity_id: run.id,
      action: 'reopen',
      before_data: { status: run.status, owner_approved_at: run.owner_approved_at, area, period_id: periodId },
      after_data: {
        status: 'review_ready',
        area,
        period_id: periodId,
        unconsolidated: result.unconsolidated,
        consolidated_run_id: result.consolidatedRunId,
      },
      actor_id: auth.userId,
    });

    return NextResponse.json({
      message: result.unconsolidated
        ? `${area} reopened. The period was un-consolidated: re-approve ${area} and consolidate again.`
        : `${area} reopened. Correct the capture, recalculate and approve again.`,
      area,
      run_id: run.id,
      unconsolidated: result.unconsolidated,
    });
  } catch (error: any) {
    console.error('POST /api/payroll/owner/reopen error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
