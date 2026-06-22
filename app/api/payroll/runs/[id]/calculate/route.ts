// app/api/payroll/runs/[id]/calculate/route.ts
// API route for payroll calculation engine
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { applyPayrollRunCalculation } from '@/lib/payrollEngine';
import { requirePermission } from '@/lib/auth/permissions';
import { createServerSupabase } from '@/lib/supabase/server';

// POST: Run payroll calculation
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permission = await requirePermission(supabase, 'payroll.calculate');
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status });
    }

    const payRunId = params.id;

    // Verify pay run exists and is not locked
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status, week_ending')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    if (['exported', 'locked'].includes(payRun.status)) {
      return NextResponse.json({ 
        error: 'Cannot calculate locked or exported pay run' 
      }, { status: 403 });
    }

    // Check if there are any payroll inputs to calculate
    const { data: inputs, error: inputsError } = await supabase
      .from('payroll_inputs')
      .select('id')
      .eq('pay_run_id', payRunId);

    if (inputsError) {
      return NextResponse.json({ error: 'Failed to check payroll inputs' }, { status: 500 });
    }

    if (!inputs || inputs.length === 0) {
      return NextResponse.json({ 
        error: 'No payroll inputs found for this pay run' 
      }, { status: 400 });
    }

    console.log(`Starting calculation for pay run ${payRunId}...`);

    // Run the calculation using the payroll engine
    const result = await applyPayrollRunCalculation(payRunId, supabase, user.id);

    if (!result.success) {
      const hasErrors = result.issues.some(issue => issue.type === 'error');
      return NextResponse.json({
        error: 'Calculation completed with issues',
        issues: result.issues,
        has_errors: hasErrors,
        has_warnings: result.issues.some(issue => issue.type === 'warning')
      }, { status: hasErrors ? 400 : 200 });
    }

    // Update pay run status if calculation was successful and no hard errors
    const hasErrors = result.issues.some(issue => issue.type === 'error');
    let newStatus = payRun.status;
    
    if (!hasErrors && payRun.status === 'draft') {
      newStatus = 'review_ready';
      await supabase
        .from('pay_runs')
        .update({ status: newStatus })
        .eq('id', payRunId);
    }

    console.log(`Calculation completed for pay run ${payRunId}. Status: ${newStatus}`);

    return NextResponse.json({
      message: 'Payroll calculation completed successfully',
      totals: result.totals,
      issues: result.issues,
      status: newStatus,
      has_errors: hasErrors,
      has_warnings: result.issues.some(issue => issue.type === 'warning')
    });

  } catch (error: any) {
    console.error('POST /api/payroll/runs/[id]/calculate error:', error);
    return NextResponse.json({ 
      error: 'Calculation failed', 
      details: error.message 
    }, { status: 500 });
  }
}
