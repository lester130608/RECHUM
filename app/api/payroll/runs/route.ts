// app/api/payroll/runs/route.ts
// API routes for pay runs CRUD operations
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

interface PayRunItemSummary {
  calc_total_hours?: number | null;
  calc_total_amount?: number | null;
  exceptions_count?: number | null;
  status?: string | null;
}

interface PayRunWithItems {
  id: string;
  week_ending: string;
  status: string;
  created_at: string;
  approved_at?: string | null;
  exported_at?: string | null;
  locked_at?: string | null;
  pay_run_items?: PayRunItemSummary[];
}

// GET: List all pay runs
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner', 'hr', 'admin']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Fetch pay runs with summary data
    const { data: payRuns, error } = await supabase
      .from('pay_runs')
      .select(`
        *,
        pay_run_items (
          id,
          calc_total_hours,
          calc_total_amount,
          exceptions_count,
          status
        )
      `)
      .order('week_ending', { ascending: false });

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
        week_ending: run.week_ending,
        status: run.status,
        created_at: run.created_at,
        approved_at: run.approved_at,
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
    const auth = await requireAnyRole(supabase, ['owner', 'admin']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { week_ending, notes } = body;

    if (!week_ending) {
      return NextResponse.json({ error: 'week_ending is required' }, { status: 400 });
    }

    // Validate week_ending format (should be a date)
    const weekEndingDate = new Date(week_ending);
    if (isNaN(weekEndingDate.getTime())) {
      return NextResponse.json({ error: 'Invalid week_ending date format' }, { status: 400 });
    }

    // Check if pay run already exists for this week
    const { data: existingRun } = await supabase
      .from('pay_runs')
      .select('id')
      .eq('week_ending', week_ending)
      .single();

    if (existingRun) {
      return NextResponse.json({ error: 'Pay run already exists for this week' }, { status: 409 });
    }

    // Create new pay run
    const { data: newPayRun, error } = await supabase
      .from('pay_runs')
      .insert({
        week_ending,
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
        after_data: { week_ending, notes },
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
