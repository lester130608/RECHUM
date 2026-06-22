import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { jsonError } from '@/lib/pay-config';
import { getEntrySummary, getModuleStatus, type ModuleName } from '@/lib/owner-view';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const permission = await requirePermission(supabase, 'manage_employees');
    if (!permission.ok) return jsonError(permission.error, permission.status);

    const { data: periods } = await supabase
      .from('pay_periods')
      .select('id, start_date, end_date, pay_date, week_code, status')
      .order('pay_date', { ascending: false })
      .limit(50);

    if (!periods) return NextResponse.json({ pending: [], waiting: [], ready: [], exported: [] });

    const modules: ModuleName[] = ['BA', 'TCM', 'CMHC', 'EMP'];

    const periodsWithStatus = await Promise.all(
      periods.map(async (period: any) => {
        const moduleStatuses: Record<string, any> = {};

        for (const module of modules) {
          const status = await getModuleStatus(supabase, period.id, module);
          const summary = await getEntrySummary(supabase, period.id, module);

          moduleStatuses[module] = {
            status,
            count: summary.count,
            total: summary.total,
          };
        }

        return {
          ...period,
          modules: moduleStatuses,
        };
      })
    );

    const pending: any[] = [];
    const waiting: any[] = [];
    const ready: any[] = [];
    const exported: any[] = [];

    for (const period of periodsWithStatus) {
      if (period.status === 'EXPORTED') {
        exported.push(period);
        continue;
      }

      const statuses = Object.values(period.modules).map((module: any) => module.status);
      const allLocked = statuses.every((status) => status === 'LOCKED');
      const anySubmitted = statuses.some((status) => status === 'SUBMITTED');
      const anyDraft = statuses.some((status) => status === 'DRAFT' || status === 'NOT_STARTED');

      if (allLocked) {
        ready.push(period);
      } else if (anySubmitted) {
        pending.push(period);
        if (anyDraft) waiting.push(period);
      } else if (anyDraft) {
        const today = new Date().toISOString().slice(0, 10);
        if (period.pay_date >= today || period.pay_date >= '2026-05-01') {
          waiting.push(period);
        }
      }
    }

    return NextResponse.json({ pending, waiting, ready, exported });
  } catch (error: any) {
    return jsonError(error.message || 'Internal error', 500);
  }
}
