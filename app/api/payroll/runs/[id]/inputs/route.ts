// app/api/payroll/runs/[id]/inputs/route.ts
// API routes for payroll inputs (supervisor submissions)
// Date: March 2, 2026

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { requireAnyRole, hasAnyRole } from '@/lib/auth/roleAccess';

// GET: List payroll inputs for a pay run
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner', 'admin', 'hr', 'supervisor', 'ba']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;

    // Build query based on user role
    let query = supabase
      .from('payroll_inputs')
      .select('*')
      .eq('pay_run_id', payRunId);

    // Supervisors can only see their own inputs
    if (hasAnyRole(auth.roleCodes, ['supervisor', 'ba']) && !hasAnyRole(auth.roleCodes, ['owner', 'admin', 'hr'])) {
      query = query.eq('submitted_by', auth.userId);
    }

    const { data: inputs, error } = await query.order('submitted_at', { ascending: false });

    if (error) {
      console.error('Error fetching payroll inputs:', error);
      return NextResponse.json({ error: 'Failed to fetch payroll inputs' }, { status: 500 });
    }

    return NextResponse.json({ inputs: inputs || [] });

  } catch (error: any) {
    console.error('GET /api/payroll/runs/[id]/inputs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Submit payroll input
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabase();
    const auth = await requireAnyRole(supabase, ['owner', 'admin', 'supervisor', 'ba']);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const payRunId = params.id;
    const body = await request.json();
    const { department, payload } = body;

    // Validate required fields
    if (!department || !payload) {
      return NextResponse.json({ 
        error: 'department and payload are required' 
      }, { status: 400 });
    }

    // Validate department
    const validDepartments = ['BA', 'TCM', 'CMHC', 'PSYQ'];
    if (!validDepartments.includes(department)) {
      return NextResponse.json({ 
        error: `Invalid department. Must be one of: ${validDepartments.join(', ')}` 
      }, { status: 400 });
    }

    // Check if pay run exists and is not locked
    const { data: payRun, error: payRunError } = await supabase
      .from('pay_runs')
      .select('status')
      .eq('id', payRunId)
      .single();

    if (payRunError || !payRun) {
      return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
    }

    if (['exported', 'locked'].includes(payRun.status)) {
      return NextResponse.json({ 
        error: 'Cannot submit inputs to exported or locked pay run' 
      }, { status: 403 });
    }

    // Check if user already submitted for this department and pay run
    const { data: existingInput } = await supabase
      .from('payroll_inputs')
      .select('id')
      .eq('pay_run_id', payRunId)
      .eq('department', department)
      .eq('submitted_by', auth.userId)
      .single();

    if (existingInput) {
      return NextResponse.json({ 
        error: 'You have already submitted inputs for this department and pay run' 
      }, { status: 409 });
    }

    // Validate payload structure
    if (!Array.isArray(payload)) {
      return NextResponse.json({ 
        error: 'Payload must be an array of input rows' 
      }, { status: 400 });
    }

    // Basic validation of payload items
    for (let i = 0; i < payload.length; i++) {
      const row = payload[i];
      if (typeof row !== 'object') {
        return NextResponse.json({ 
          error: `Invalid row at index ${i}: must be an object` 
        }, { status: 400 });
      }
      
      // Skip empty rows
      if (!row.worker_name && !row.worker_id && !row.service_code) {
        continue;
      }

      // Validate required fields for non-empty rows
      if (!row.service_code) {
        return NextResponse.json({ 
          error: `Invalid row at index ${i}: service_code is required` 
        }, { status: 400 });
      }

      if (!row.worker_name && !row.worker_id) {
        return NextResponse.json({ 
          error: `Invalid row at index ${i}: worker_name or worker_id is required` 
        }, { status: 400 });
      }
    }

    // Insert the payroll input
    const { data: newInput, error } = await supabase
      .from('payroll_inputs')
      .insert({
        pay_run_id: payRunId,
        department,
        submitted_by: auth.userId,
        payload,
        status: 'submitted'
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting payroll input:', error);
      return NextResponse.json({ error: 'Failed to submit payroll input' }, { status: 500 });
    }

    // Log the submission
    await supabase
      .from('audit_logs')
      .insert({
        entity_type: 'payroll_input',
        entity_id: newInput.id,
        action: 'submit',
        after_data: { 
          department, 
          pay_run_id: payRunId,
          row_count: payload.length 
        },
        actor_id: auth.userId
      });

    return NextResponse.json({
      message: 'Payroll input submitted successfully',
      input: newInput
    }, { status: 201 });

  } catch (error: any) {
    console.error('POST /api/payroll/runs/[id]/inputs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}