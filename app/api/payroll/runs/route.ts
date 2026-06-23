// app/api/payroll/runs/route.ts
// API routes for pay runs CRUD operations
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  REAL_PAYROLL_ROLES,
  canAccessPayrollArea,
  getSupervisedAreas,
  isOwner,
  normalizeArea,
  requireAnyRole,
} from '@/lib/auth/roleAccess';

interface PayRunItemSummary {
  calc_total_hours?: number | null;
  calc_total_amount?: number | null;
  exceptions_count?: number | null;
  status?: string | null;
}

interface PayRunWithItems {
  id: string;
  week_ending?: string | null;
  period_id?: string | null;
  area?: string | null;
  run_level?: string | null;
  status: string;
  created_at: string;
  owner_approved_at?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
  pay_run_items?: PayRunItemSummary[];
}

// GET: List all pay runs
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Fetch pay runs with summary data
    const owner = isOwner(auth.roleCodes);
    const supervisedAreas = getSupervisedAreas(auth.roleCodes);
    const selectClause = owner
      ? `
          *,
          pay_periods (
            id,
            week_code,
            start_date,
            end_date,
            pay_date
          ),
          pay_run_items (
            id,
            calc_total_hours,
            calc_total_amount,
            exceptions_count,
            status
          )
        `
      : `
          *,
          pay_periods (
            id,
            week_code,
            start_date,
            end_date,
            pay_date
          )
        `;

    let query = supabase
      .from('pay_runs')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (!owner) {
      query = query.in('area', supervisedAreas);
    }

    const { data: payRuns, error } = await query;

    if (error) {
      console.error('Error fetching pay runs:', error);
      return NextResponse.json({ error: 'Failed to fetch pay runs' }, { status: 500 });
    }

    // Calculate totals for each pay run
    const payRunsWithTotals = ((payRuns || []) as PayRunWithItems[]).map(run => {
      const items = run.pay_run_items || [];
      const totals = {
        total_workers: items.length,
        total_hours: items.reduce((sum, item) => sum + (item.calc_total_hours || 0), 0),
        total_amount: items.reduce((sum, item) => sum + (item.calc_total_amount || 0), 0),
        total_exceptions: items.reduce((sum, item) => sum + (item.exceptions_count || 0), 0),
        items_needing_fix: items.filter((item) => item.status === 'needs_fix').length
      };

      return {
        id: run.id,
        period_id: run.period_id,
        area: run.area,
        run_level: run.run_level,
        week_ending: run.week_ending,
        status: run.status,
        created_at: run.created_at,
        owner_approved_at: run.owner_approved_at,
        exported_at: run.exported_at,
        locked_at: run.locked_at,
        totals
      };
    });

    return NextResponse.json({ pay_runs: payRunsWithTotals });

  } catch (error) {
    console.error('GET /api/payroll/runs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create new pay run
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, [...REAL_PAYROLL_ROLES]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { period_id, notes } = body;
    const area = normalizeArea(body.area ?? '');
    const runLevel = body.run_level ?? (area === 'GENERAL' ? 'consolidated' : 'area');

    if (!period_id) {
      return NextResponse.json({ error: 'period_id is required' }, { status: 400 });
    }

    if (!area) {
      return NextResponse.json({ error: 'area must be one of BA, CMHC, TCM, PSYQ, GENERAL' }, { status: 400 });
    }

    if (!['area', 'consolidated'].includes(runLevel)) {
      return NextResponse.json({ error: 'run_level must be area or consolidated' }, { status: 400 });
    }

    if (runLevel === 'area' && area === 'GENERAL') {
      return NextResponse.json({ error: 'GENERAL runs must use run_level consolidated' }, { status: 400 });
    }

    if (runLevel === 'consolidated' && area !== 'GENERAL') {
      return NextResponse.json({ error: 'Consolidated runs must use area GENERAL' }, { status: 400 });
    }

    if (!canAccessPayrollArea(auth.roleCodes, area)) {
      return NextResponse.json({ error: 'Insufficient permissions for payroll area' }, { status: 403 });
    }

    if (!isOwner(auth.roleCodes) && area === 'PSYQ') {
      return NextResponse.json({ error: 'PSYQ runs can only be created by owner' }, { status: 403 });
    }

    if (!isOwner(auth.roleCodes) && runLevel !== 'area') {
      return NextResponse.json({ error: 'Supervisors can only create area runs' }, { status: 403 });
    }

    const { data: period, error: periodError } = await supabase
      .from('pay_periods')
      .select('id, capture_opens_at, sup_deadline')
      .eq('id', period_id)
      .single();

    if (periodError || !period) {
      return NextResponse.json({ error: 'Pay period not found' }, { status: 404 });
    }

    if (!isOwner(auth.roleCodes)) {
      // TODO Step 5: calculate "today" in America/New_York and compare as dates,
      // not UTC ISO strings, so the capture window does not close early near midnight.
      const today = new Date().toISOString().slice(0, 10);
      if (today < period.capture_opens_at || today > period.sup_deadline) {
        return NextResponse.json({ error: 'Supervisor capture window is closed for this pay period' }, { status: 403 });
      }
    }

    // Check if pay run already exists for this period and area
    const { data: existingRun } = await supabase
      .from('pay_runs')
      .select('id')
      .eq('period_id', period_id)
      .eq('area', area)
      .maybeSingle();

    if (existingRun) {
      return NextResponse.json({ error: 'Pay run already exists for this period and area' }, { status: 409 });
    }

    // Create new pay run
    const { data: newPayRun, error } = await supabase
      .from('pay_runs')
      .insert({
        period_id,
        area,
        run_level: runLevel,
        notes: notes || null,
        created_by: auth.userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pay run:', error);
      return NextResponse.json({ error: 'Failed to create pay run' }, { status: 500 });
    }

    // Log the creation
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: newPayRun.id,
        action: 'create',
        after_data: { period_id, area, run_level: runLevel, notes },
        actor_id: auth.userId
      });

    return NextResponse.json({ 
      message: 'Pay run created successfully',
      pay_run: newPayRun 
    }, { status: 201 });

  } catch (error) {
    console.error('POST /api/payroll/runs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
