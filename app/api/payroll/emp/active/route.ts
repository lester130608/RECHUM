import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';
import { isPayPeriodActive } from '@/lib/emp-module';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');
    if (!permission.ok) return jsonError(permission.error, permission.status);

    // Buscar todos los pay_periods NO cerrados, ordenados por pay_date asc
    const { data: periods, error } = await supabase
      .from('pay_periods')
      .select('id, start_date, end_date, pay_date, capture_opens_at, sup_deadline, owner_deadline, status, week_code')
      .not('status', 'in', '(LOCKED,EXPORTED)')
      .order('pay_date', { ascending: true });

    if (error) return jsonError(error.message, 500);
    if (!periods || periods.length === 0) {
      return NextResponse.json({ active: null, reason: 'No open pay periods' });
    }

    // Encontrar el primero que esté en ventana activa
    const today = new Date();
    const active = periods.find((p: any) => isPayPeriodActive(p, today));

    if (!active) {
      // No hay ninguno activo en ventana. Devolver el próximo a abrir.
      const todayStr = today.toISOString().slice(0, 10);
      const upcoming = periods.find((p: any) => p.capture_opens_at > todayStr);
      return NextResponse.json({ 
        active: null, 
        upcoming: upcoming || null,
        reason: upcoming ? `Next capture window opens ${upcoming.capture_opens_at}` : 'No upcoming periods'
      });
    }

    return NextResponse.json({ active });
  } catch (error: any) {
    return jsonError(error.message || 'Internal error', 500);
  }
}
