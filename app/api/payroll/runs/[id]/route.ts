// app/api/payroll/runs/[id]/route.ts
// API routes for individual pay run operations
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole } from '@/lib/auth/roleAccess';

// GET: Get pay run details
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner', 'hr', 'admin']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;

    // Get pay run with detailed information
    const { data: payRun, error } = await supabase
      .from('pay_runs')
      .select(`
        *,
        pay_run_items (
          id,
          worker_id,
          status,
          calc_total_hours,
          calc_total_amount,
          exceptions_count,
          employees (
            id,
            first_name,
            last_name,
            full_name,
            email
          )
        ),
        payroll_inputs (
          id,
          department,
          submitted_by,
          submitted_at,
          status
        )
      `)
      .eq('id', payRunId)
      .single();

    if (error || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    // Calculate summary statistics
    const items = payRun.pay_run_items || [];
    const totals = {
      total_workers: items.length,
      total_hours: items.reduce((sum: number, item: any) => sum + (item.calc_total_hours || 0), 0),
      total_amount: items.reduce((sum: number, item: any) => sum + (item.calc_total_amount || 0), 0),
      total_exceptions: items.reduce((sum: number, item: any) => sum + (item.exceptions_count || 0), 0),
      by_status: items.reduce((acc: any, item: any) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {})
    };

    // Calculate totals by department based on inputs
    const inputs = payRun.payroll_inputs || [];
    const by_department = inputs.reduce((acc: any, input: any) => {
      if (!acc[input.department]) {
        acc[input.department] = {
          submissions: 0,
          submitted_by: []
        };
      }
      acc[input.department].submissions++;
      acc[input.department].submitted_by.push({
        name: input.submitted_by || 'Unknown',
        submitted_at: input.submitted_at
      });
      return acc;
    }, {});

    const response = {
      ...payRun,
      totals,
      by_department
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('GET /api/payroll/runs/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Update pay run (limited fields)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner', 'admin']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;
    const body = await request.json();
    
    // Only allow certain fields to be updated
    const allowedFields = ['notes', 'status'];
    const updates: any = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Get current pay run to check status
    const { data: currentPayRun } = await supabase
      .from('pay_runs')
      .select('status')
      .eq('id', payRunId)
      .single();

    if (!currentPayRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    // Prevent updates to locked runs
    if (['locked'].includes(currentPayRun.status)) {
      return NextResponse.json({ error: 'Cannot update locked pay run' }, { status: 403 });
    }

    // Update the pay run
    const { data: updatedPayRun, error } = await supabase
      .from('pay_runs')
      .update(updates)
      .eq('id', payRunId)
      .select()
      .single();

    if (error) {
      console.error('Error updating pay run:', error);
      return NextResponse.json({ error: 'Failed to update pay run' }, { status: 500 });
    }

    // Log the update
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'pay_run',
        entity_id: payRunId,
        action: 'update',
        before_data: { status: currentPayRun.status },
        after_data: updates,
        actor_id: auth.userId
      });

    return NextResponse.json({
      message: 'Pay run updated successfully',
      pay_run: updatedPayRun
    });

  } catch (error: any) {
    console.error('PATCH /api/payroll/runs/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}