// app/api/payroll/runs/[id]/approve/route.ts
// API route for pay run approval
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

// POST: Approve pay run
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;

    // Get pay run details and verify current status
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status, area, run_level, week_ending')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    // Verify pay run is in the right status for approval
    if (!['review_ready', 'supervisor_approved'].includes(payRun.status)) {
      return NextResponse.json({ 
        error: `Cannot approve pay run with status: ${payRun.status}. Must be ready for owner review.` 
      }, { status: 400 });
    }

    // Check for hard errors in pay run items
    const { data: itemsWithErrors, error: itemsError } = await supabase
      .from('pay_run_items')
      .select('id, exceptions_count, status')
      .eq('pay_run_id', payRunId)
      .eq('status', 'needs_fix');

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to validate pay run items' }, { status: 500 });
    }

    if (itemsWithErrors && itemsWithErrors.length > 0) {
      return NextResponse.json({ 
        error: `Cannot approve pay run: ${itemsWithErrors.length} items need to be fixed`,
        items_needing_fix: itemsWithErrors.length
      }, { status: 400 });
    }

    // Get all pay run items to verify totals
    const { data: allItems, error: allItemsError } = await supabase
      .from('pay_run_items')
      .select('calc_total_hours, calc_total_amount, exceptions_count')
      .eq('pay_run_id', payRunId);

    if (allItemsError) {
      return NextResponse.json({ error: 'Failed to verify pay run totals' }, { status: 500 });
    }

    const totals = {
      total_workers: allItems?.length || 0,
      total_hours: (allItems || []).reduce((sum, item) => sum + (item.calc_total_hours || 0), 0),
      total_amount: (allItems || []).reduce((sum, item) => sum + (item.calc_total_amount || 0), 0),
      total_exceptions: (allItems || []).reduce((sum, item) => sum + (item.exceptions_count || 0), 0)
    };

    if (totals.total_workers === 0) {
      return NextResponse.json({
        error: 'Cannot approve pay run before calculation is saved',
      }, { status: 400 });
    }

    // Approve the pay run
    const { data: approvedPayRun, error: approveError } = await supabase
      .from('pay_runs')
      .update({
        status: 'owner_approved',
        owner_approved_by: auth.userId,
        owner_approved_at: new Date().toISOString()
      })
      .eq('id', payRunId)
      .select()
      .single();

    if (approveError) {
      console.error('Error approving pay run:', approveError);
      return NextResponse.json({ error: 'Failed to approve pay run' }, { status: 500 });
    }

    // Update all pay run items to approved status
    const { error: updateItemsError } = await supabase
      .from('pay_run_items')
      .update({ status: 'approved' })
      .eq('pay_run_id', payRunId)
      .in('status', ['ready', 'draft']);

    if (updateItemsError) {
      console.error('Error updating pay run items:', updateItemsError);
      // Non-blocking error, continue
    }

    // Log the approval
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: payRunId,
        action: 'approve',
        before_data: { status: payRun.status },
        after_data: { 
          status: 'owner_approved',
          owner_approved_by: auth.userId,
          totals 
        },
        actor_id: auth.userId
      });

    console.log(`Pay run ${payRunId} approved by ${auth.userId}`);

    return NextResponse.json({
      message: 'Pay run approved successfully',
      pay_run: approvedPayRun,
      totals
    });

  } catch (error: any) {
    console.error('POST /api/payroll/runs/[id]/approve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
