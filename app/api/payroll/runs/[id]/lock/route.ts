// app/api/payroll/runs/[id]/lock/route.ts
// API route for pay run locking (final step)
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

// POST: Lock pay run (prevents all further edits)
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

    // Verify pay run exists and is exported
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status, week_ending, exported_at')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    if (payRun.status === 'locked') {
      return NextResponse.json({ error: 'Pay run is already locked' }, { status: 400 });
    }

    if (!['exported'].includes(payRun.status)) {
      return NextResponse.json({ 
        error: `Cannot lock pay run with status: ${payRun.status}. Must be exported first.` 
      }, { status: 400 });
    }

    // Verify export was completed
    if (!payRun.exported_at) {
      return NextResponse.json({ 
        error: 'Pay run must be exported before locking' 
      }, { status: 400 });
    }

    // Get final totals for audit log
    const { data: finalItems, error: itemsError } = await supabase
      .from('pay_run_items')
      .select('calc_total_hours, calc_total_amount, status')
      .eq('pay_run_id', payRunId);

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to validate final totals' }, { status: 500 });
    }

    const finalTotals = {
      total_workers: finalItems?.length || 0,
      total_hours: (finalItems || []).reduce((sum, item) => sum + (item.calc_total_hours || 0), 0),
      total_amount: (finalItems || []).reduce((sum, item) => sum + (item.calc_total_amount || 0), 0),
      workers_by_status: (finalItems || []).reduce((acc: any, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {})
    };

    // Lock the pay run
    const { data: lockedPayRun, error: lockError } = await supabase
      .from('pay_runs')
      .update({
        status: 'locked',
        locked_at: new Date().toISOString()
      })
      .eq('id', payRunId)
      .select()
      .single();

    if (lockError) {
      console.error('Error locking pay run:', lockError);
      return NextResponse.json({ error: 'Failed to lock pay run' }, { status: 500 });
    }

    // Update all pay run items to locked status
    const { error: updateItemsError } = await supabase
      .from('pay_run_items')
      .update({ status: 'locked' })
      .eq('pay_run_id', payRunId);

    if (updateItemsError) {
      console.error('Error updating pay run items to locked:', updateItemsError);
      // Continue even if this fails - the main lock is more important
    }

    // Log the lock action
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: payRunId,
        action: 'lock',
        before_data: { 
          status: payRun.status,
          exported_at: payRun.exported_at 
        },
        after_data: { 
          status: 'locked',
          locked_at: lockedPayRun.locked_at,
          final_totals: finalTotals
        },
        actor_id: auth.userId
      });

    console.log(`Pay run ${payRunId} locked by ${auth.userId}. Final totals:`, finalTotals);

    return NextResponse.json({
      message: 'Pay run locked successfully',
      pay_run: lockedPayRun,
      final_totals: finalTotals,
      warning: 'This pay run is now locked and cannot be modified'
    });

  } catch (error: any) {
    console.error('POST /api/payroll/runs/[id]/lock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Emergency unlock (owner only, requires confirmation)
export async function DELETE(
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
    const body = await request.json();
    
    // Require confirmation and reason
    if (!body.confirm || !body.reason) {
      return NextResponse.json({ 
        error: 'Emergency unlock requires explicit confirmation and reason' 
      }, { status: 400 });
    }

    if (body.confirm !== 'EMERGENCY_UNLOCK') {
      return NextResponse.json({ 
        error: 'Invalid confirmation code' 
      }, { status: 400 });
    }

    // Verify pay run is locked
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status, locked_at')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    if (payRun.status !== 'locked') {
      return NextResponse.json({ error: 'Pay run is not locked' }, { status: 400 });
    }

    // Unlock the pay run (revert to exported status)
    const { data: unlockedPayRun, error: unlockError } = await supabase
      .from('pay_runs')
      .update({
        status: 'exported',
        locked_at: null
      })
      .eq('id', payRunId)
      .select()
      .single();

    if (unlockError) {
      console.error('Error unlocking pay run:', unlockError);
      return NextResponse.json({ error: 'Failed to unlock pay run' }, { status: 500 });
    }

    // Update items back to approved
    await supabase
      .from('pay_run_items')
      .update({ status: 'approved' })
      .eq('pay_run_id', payRunId);

    // Log the emergency unlock
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: payRunId,
        action: 'emergency_unlock',
        before_data: { 
          status: 'locked',
          locked_at: payRun.locked_at 
        },
        after_data: { 
          status: 'exported',
          unlock_reason: body.reason
        },
        actor_id: auth.userId
      });

    console.log(`EMERGENCY UNLOCK: Pay run ${payRunId} unlocked by ${auth.userId}. Reason: ${body.reason}`);

    return NextResponse.json({
      message: 'Pay run emergency unlocked',
      pay_run: unlockedPayRun,
      warning: 'This was an emergency unlock. Please document the reason for audit purposes.'
    });

  } catch (error: any) {
    console.error('DELETE /api/payroll/runs/[id]/lock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
